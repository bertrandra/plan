// Les toits ajustes sur le LiDAR HD, apres un import ou une actualisation (MD/spec-toit-ign.md §10).
//
// Pour chaque batiment dont le toit vient de la BD TOPO (ou d'une lecture LiDAR anterieure), on lit
// le MNH sous son contour (geo/mnh.ts) et l'on y ajuste une forme (facade/toitLidar.ts). Un toit
// lu sur une photo ou saisi n'est pas touche. A l'import et a l'actualisation, seuls les plus
// proches de la parcelle du projet, dans un delai borne : l'import ne doit pas attendre le service
// pour un voisinage de dix mille batiments. Les autres sont lus ensuite, en tache de fond, par
// lots (app/toitsFond.ts) ; chaque batiment lu est marque (`toitLidarLu`) pour ne pas etre relu.

import { ajusterToit, type EchantillonHauteur } from '../facade/toitLidar.js';
import { lireHauteursSousStrict, lireGrilleSous, echantillonsDeGrille, dallesLidarSur, type LecteurMnh, type LecteurGrilleMnh } from '../geo/mnh.js';
import { decomposerEnRectangles, rectanglesDuContour, penteDuToit, toitDuRectangle } from '../model/volumesToit.js';
import { PENTE_DEFAUT_DEG } from '../model/toitBdTopo.js';
import { toitMesureDepuisGrille, egoutDansRect, decouperParHauteurs, hauteurMurMesuree } from '../model/toitMesure.js';
import { decalageSurMesure, partVideSous } from '../facade/toitCorps.js';
import { centroid, pointInPolygon } from '../geometry/basic.js';
import { surParcelleDuProjet } from '../model/fonctions.js';
import { batimentsMitoyens } from '../model/mitoyennete.js';
import { partsACheval, douteACheval, type PartACheval } from '../model/aCheval.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { GrilleRelief } from '../model/relief.js';
import type { CorpsToit, PtBrut, Toit, ToitACheval, ToitMesure, VolumeToit } from '../model/types.js';
import { EMPREINTE_REGLAGES_TOITS, SEUILS_TOITS as S, avecSeuilsToit, type SurchargesSeuilsToits } from '../regles/toits/reglages.js';
import { contexteProfils, surchargesDuBatiment } from '../facade/regles/toits/profils.js';
import type { ProfilToit } from '../regles/toits/profils.js';
import { EMPREINTE_FORMES_TOITS } from '../regles/toits/formes.js';
import { EMPREINTE_FAITS_TOITS, EMPREINTE_FAITS_VIDE, cleDuBatiment, cleToucheeParEssai, essaiDeFaits, faitDuBatiment, type FaitToit } from '../regles/toits/faits.js';
import { ajusteSelonFait, corpsDeRemplacement, corpsSelonFait, toitDeRemplacement } from '../facade/regles/toits/faits.js';
import { corpsCalcules } from '../facade/regles/toits/catalogue.js';
import { corpsVraisemblables, hauteurBdTopo, mesureVraisemblable, ajusteVraisemblable, egoutValide, elevationApresLecture } from '../facade/regles/toits/vraisemblance.js';
import { estVerifieSurPlace } from '../model/toitVerifie.js';

/** Ce que l'etape lit et ecrit d'un objet du plan : un batiment a contour, son toit, sa hauteur a l'egout. */
export interface ObjetAToit {
  key?: string;
  fonction?: string;
  pts?: PtBrut[];
  toit?: Toit | null;
  elevation?: number;
  /** Les attributs BD TOPO : `surParcellePrincipale` dit si le batiment est celui du projet. */
  bdtopo?: unknown;
  /** Le toit en plusieurs volumes (model/volumesToit.ts), pour un batiment de la parcelle du projet. */
  volumesToit?: VolumeToit[] | null;
  /** Le toit tel que le LiDAR le mesure (model/toitMesure.ts), pour un batiment de la parcelle du projet. */
  toitMesure?: ToitMesure | null;
  /** Ses corps et pignons, reconstruits sur la mesure (facade/toitCorps.ts). */
  corpsToit?: CorpsToit[] | null;
  /** A cheval sur deux parcelles : le doute sur sa toiture, et la reponse (model/aCheval.ts). */
  toitACheval?: ToitACheval | null;
  /** La version de la lecture LiDAR qui a traite ce batiment ; absente : pas encore lu. */
  toitLidarLu?: number | null;
  /** Verifie sur place par un audit de la parcelle (model/toitVerifie.ts) : la lecture ne le touche plus. */
  verifieSurPlace?: { date: string } | null;
  toitFige?: boolean;
}

/** Un batiment de la parcelle du projet : celui dont le toit se garde tel que mesure (model/fonctions.ts). */
export const surParcellePrincipale = (o: ObjetAToit): boolean => surParcelleDuProjet(o);

/** Les batiments des parcelles mitoyennes : le meme calcul que la maison du projet (model/mitoyennete.ts). */
export { batimentsMitoyens };

/** Les garde-fous de vraisemblance (vegetation, egout), purs, partages avec le rejeu des cas d'audit. */
export { corpsVraisemblables, mesureVraisemblable, DEPASSEMENT_VEGETATION_M } from '../facade/regles/toits/vraisemblance.js';

/** Les maisons voisines recoivent-elles leurs corps et pignons ? Le reglage de la parcelle du projet, oui par defaut. */
function corpsDuVoisinage(objets: readonly ObjetAToit[]): boolean {
  const parcelle = objets.find((o) => o.key === 'parcelle') as { voisinage3d?: { toits?: { corps?: unknown } } } | undefined;
  return parcelle?.voisinage3d?.toits?.corps !== false;
}

/**
 * Le batiment recale sur le LiDAR quand son contour couvre trop de non bati
 * (facade/toitCorps.ts::decalageSurMesure) : la grille est relue plus large, et le batiment entier
 * se deplace d'un bloc - son contour, donc sa forme et ses toits, ne changent pas. Rend la grille
 * sous le batiment deplace, ou null quand il reste ou il est (le cas d'un contour bien pose, sans
 * seconde lecture).
 */
async function recalerSurLidar(o: ObjetAToit & { pts: PtBrut[] }, grille: GrilleRelief, proj: ProjecteurLocal, lireGrille: LecteurGrilleMnh, seuils: SurchargesSeuilsToits = {}): Promise<GrilleRelief | null> {
  // Les seuils du profil du batiment, de part et d'autre de la lecture de la grille large : jamais
  // pendant l'attente, ou d'autres batiments lus en parallele les verraient.
  if (avecSeuilsToit(seuils, () => partVideSous(grille, o.pts) < S.PART_VIDE_RECALAGE)) return null;
  const m = avecSeuilsToit(seuils, () => S.DECALAGE_MAX_M);
  const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y);
  const boite = [{ x: Math.min(...xs) - m, y: Math.min(...ys) - m }, { x: Math.max(...xs) + m, y: Math.min(...ys) - m }, { x: Math.max(...xs) + m, y: Math.max(...ys) + m }, { x: Math.min(...xs) - m, y: Math.max(...ys) + m }];
  const large = await lireGrille(boite, proj).catch(() => null);
  const d = large ? avecSeuilsToit(seuils, () => decalageSurMesure(large, o.pts)) : null;
  if (!large || !d) return null;
  o.pts = o.pts.map((p) => ({ x: Math.round((p.x + d.x) * 100) / 100, y: Math.round((p.y + d.y) * 100) / 100 }));
  return large;
}

/**
 * Les corps d'un batiment a cheval relus sur chacune de ses parts (model/aCheval.ts) : un toit par
 * parcelle, chacun arrete a la limite. Null quand aucune part ne se lit.
 */
export function corpsParParcelle(o: ObjetAToit, parts: readonly PartACheval[], mesure: ToitMesure, grille: GrilleRelief | null, coupes = true): CorpsToit[] | null {
  const corps = parts.flatMap((p) => corpsCalcules(mesure, p.pts, { coupes, grille, hauteurBdTopo: hauteurBdTopo(o) }) ?? []);
  return corps.length ? corpsVraisemblables(o, corps) : null;
}

/**
 * Apres le calcul des corps d'un batiment vu de pres : s'il est a cheval sur deux parcelles, la
 * reponse deja donnee s'applique (un toit par parcelle : les corps relus sur chaque part) ; sans
 * reponse, le doute est note quand un corps franchit la limite - la question se pose ensuite
 * (app/toitsACheval.ts). Un batiment qui n'est plus a cheval perd sa question.
 */
export function toitAChevalApresCalcul(o: ObjetAToit, objets: readonly ObjetAToit[], grille: GrilleRelief | null, coupes = true): void {
  const parts = o.corpsToit?.length && o.toitMesure ? partsACheval(o, objets) : null;
  if (!parts || !o.toitMesure) { if (o.toitACheval) o.toitACheval = null; return; }
  const parcelles = parts.map((p) => p.parcelle);
  const reponse = o.toitACheval?.reponse;
  if (reponse === 'parParcelle') o.corpsToit = corpsParParcelle(o, parts, o.toitMesure, grille, coupes) ?? o.corpsToit ?? null;
  if (reponse) o.toitACheval = { parcelles, reponse };
  else o.toitACheval = douteACheval(o.corpsToit, parts) ? { parcelles } : null;
}

/**
 * Les corps d'un batiment lus sur sa mesure (pentes droites, puis formes du catalogue :
 * facade/regles/toits/catalogue.ts), puis son fait en contrainte (regles/toits/faits.ts), puis les
 * garde-fous de vraisemblance : l'ordre de MD/spec-regles-toits.md §9.1. `coupes` faux : la version
 * allegee du voisinage.
 */
export function corpsLus(o: ObjetAToit, mesure: ToitMesure, pts: readonly PtBrut[], grille: GrilleRelief | null, coupes = true): CorpsToit[] | null {
  return corpsVraisemblables(o, corpsSelonFait(faitDuBatiment(o), corpsCalcules(mesure, pts, { coupes, grille, hauteurBdTopo: hauteurBdTopo(o) }), mesure, pts, grille));
}


/** Le toit lu remplace l'ancien, qui garde sa couleur, son origine et sa couverture choisie. */
function avecCouleurDe(ancien: Toit | null | undefined, toit: Toit): Toit {
  return { ...toit, ...(ancien?.couleur ? { couleur: ancien.couleur } : {}), ...(ancien?.origineCouleur ? { origineCouleur: ancien.origineCouleur } : {}), ...(ancien?.couverture ? { couverture: ancien.couverture } : {}) };
}

/**
 * Le toit d'un batiment dont le fait est en remplacement (spec §5) : son corps et sa forme viennent du
 * fait, sans lecture ni garde-fou, LiDAR ou pas. Rend faux si le fait ne se pose pas sur ce contour.
 */
export function toitDuFait(o: ObjetAToit & { pts: PtBrut[] }, f: FaitToit): boolean {
  const corps = corpsDeRemplacement(f, o.pts), forme = toitDeRemplacement(f, o.pts);
  if (!corps || !forme) return false;
  o.toit = avecCouleurDe(o.toit, forme.toit);
  o.corpsToit = corps; o.toitMesure = null; o.volumesToit = null; o.toitACheval = null;
  o.elevation = forme.egout;
  o.toitLidarLu = marqueDeLecture(o);
  return true;
}

/** Ce que la lecture a fait, pour le bilan. */
export interface BilanToitsLidar {
  /** Toits dont la forme a ete ajustee sur le LiDAR (plats compris). */
  ajustes: number;
  /** Toits de la parcelle du projet gardes tels que mesures, en surface (MD/spec-toit-ign.md §12). */
  mesures: number;
  /** Maisons voisines dont les corps et pignons ont ete reconstruits (§13.6). */
  corpsVoisins: number;
  /** Batiments deplaces d'un bloc sur le LiDAR, leur contour trace a cote de leur toit (§13.7). */
  recales: number;
  /** Batiments lus dont aucune forme simple n'explique les mesures : toit BD TOPO garde. */
  gardes: number;
  /** Pas de dalle LiDAR HD ici : rien n'a ete lu. */
  sansLidar: boolean;
}

export interface OptionsToitsLidar {
  /** Au-dela, on renonce aux batiments restants. */
  delaiMs?: number;
  /** Combien de batiments au plus, les plus proches du projet. */
  maxBatiments?: number;
  /** Les batiments a lire, dans cet ordre, au lieu des plus proches : un lot de la tache de fond. */
  candidats?: readonly ObjetAToit[];
  /** Combien de lectures en meme temps (EN_PARALLELE par defaut). */
  enParallele?: number;
  /** Attendue entre deux batiments : la tache de fond y rend la main a l'interface. */
  pause?: () => Promise<void>;
  lire?: LecteurMnh;
  /** La grille entiere, pour le toit mesure d'un batiment de la parcelle du projet ; `lire` donne, absente, et sinon la grille du service. */
  lireGrille?: LecteurGrilleMnh;
  dalles?: (pts: readonly PtBrut[], proj: ProjecteurLocal) => Promise<boolean>;
  /** Les cles des batiments mitoyens (`clesMitoyens`), deja calculees : la tache de fond lit un batiment a la fois. */
  mitoyens?: ReadonlySet<string>;
  /** L'horloge, pour le delai. */
  maintenant?: () => number;
  /**
   * Les batiments verifies sur place (model/toitVerifie.ts) : `garder` (defaut) les laisse tels quels,
   * sans lecture ; `relire` les lit comme les autres - l'actualisation que l'utilisateur demande
   * expressement, ou la tache de fond qui lit une copie pour dire si le calcul serait d'accord.
   */
  verifies?: 'garder' | 'relire';
  /** Les profils de toits a appliquer (PROFILS_TOITS, ceux du fichier livre, par defaut) : les tests en essaient d'autres. */
  profils?: readonly ProfilToit[];
}

/** Le delai donne a la lecture des toits, comme a celle des couleurs sur l'orthophoto. */
export const DELAI_TOITS_LIDAR_MS = 20000;
/**
 * A l'import et a l'actualisation, seuls les plus proches sont lus avant que le plan s'ouvre : le
 * projet et ses voisins immediats. Cent cinquante faisaient attendre ; le reste vient en tache de fond.
 */
export const MAX_BATIMENTS_LIDAR = 30;
/**
 * Une version de la lecture des toits : l'empreinte des reglages qu'elle lisait
 * (regles/toits/reglages.json, regles/toits/reglages.ts), celle des faits
 * (regles/toits/faits.json, regles/toits/faits.ts) ; sans `faits`, aucun fait ; et, depuis la
 * version 4, celle des seuils des formes du catalogue (regles/toits/formes.json), que la lecture
 * applique ; sans `formes`, la lecture ne les appliquait pas.
 */
export interface LectureToits { version: number; reglages: string; faits?: string; formes?: string }

/**
 * Les versions de la lecture des toits. Une regle de toit qui change assez pour meriter de tout
 * relire ajoute une ligne, avec les memes empreintes ; un reglage ou un fait change en ajoute une
 * avec les siennes (le test de tests/unit/model/reglagesToits.test.ts le rappelle).
 */
export const LECTURES_TOITS: readonly LectureToits[] = [
  // Les seuils sortis du code sans changer une valeur : la lecture d'avant, a l'identique.
  { version: 1, reglages: '3b9b6b2c' },
  // Le premier fait : l'appentis adosse de la facade sud d'AE 101 (regles/toits/faits.json), et les
  // seuils de sa lecture (facade/regles/toits/appentis.ts) ajoutes aux reglages.
  { version: 2, reglages: '6d05c3a9', faits: 'acde1a6a' },
  // Les deux pignons traversants de la facade sud d'AE 101, dits par le proprietaire (fait), et les
  // seuils de leur lecture (facade/regles/toits/pignons.ts) : la lecture LiDAR servie par l'IGN a change.
  { version: 3, reglages: 'b472cd75', faits: '43162115' },
  // Les formes du catalogue a la lecture (facade/regles/toits/catalogue.ts) : un Mansart, un coyau, une demi-croupe, un toit de
  // revolution que la mesure porte nettement mieux que les pentes droites remplace le corps principal ; tous les toits sont relus.
  { version: 4, reglages: 'b472cd75', faits: '43162115', formes: '83c56e39' },
  // Un appentis adosse s'arrete ou s'arrete le mur du contour (ECART_FACADE_APPENTIS_M) : la galerie d'AE 101 ne passe plus le
  // coin sud-ouest de la maison.
  { version: 5, reglages: '1e1e5338', faits: '43162115', formes: '83c56e39' },
  // Retour sur la version 5 : coupee au mur du contour, la galerie d'AE 101 s'arretait avant le coin du mur dessine. Elle court de
  // nouveau sur tout le cote du corps qui la porte (reglages de la version 4) ; c'est le dessin qui l'arrete au nu des murs.
  { version: 6, reglages: 'b472cd75', faits: '43162115', formes: '83c56e39' },
];

/**
 * La version de lecture qui correspond a ces reglages et a ces faits : la plus recente qui les a lus.
 * Des empreintes qu'aucune ligne ne connait (une valeur ou un fait change sans ligne nouvelle) donnent
 * la version suivante : mieux vaut relire les toits que les garder lus avec d'autres seuils.
 */
export function versionDeLecture(lectures: readonly LectureToits[], empreinte: string, faits: string = EMPREINTE_FAITS_VIDE, formes: string | null = null): number {
  let connue = 0, derniere = 0;
  for (const l of lectures) {
    derniere = Math.max(derniere, l.version);
    if (l.reglages === empreinte && (l.faits ?? EMPREINTE_FAITS_VIDE) === faits && (l.formes ?? null) === formes) connue = Math.max(connue, l.version);
  }
  return connue || derniere + 1;
}

/**
 * La version de la lecture qui a marque un batiment (`toitLidarLu`) : les batiments marques d'une
 * version plus ancienne redeviennent a lire. L'empreinte des reglages y entre (§9.2 des regles).
 */
export const VERSION_LECTURE_TOITS = versionDeLecture(LECTURES_TOITS, EMPREINTE_REGLAGES_TOITS, EMPREINTE_FAITS_TOITS, EMPREINTE_FORMES_TOITS);
/**
 * La marque d'un batiment lu avec des faits d'essai (`?regles=local`, regles/toits/faits.ts) : lu pour
 * la seance, mais pas a la version du depot. Enregistre ainsi, il sera relu a la prochaine ouverture,
 * avec les faits livres : l'essai ne laisse rien derriere lui.
 */
export const MARQUE_ESSAI_FAITS = VERSION_LECTURE_TOITS - 0.5;
/** Le toit de ce batiment a deja ete lu sur le LiDAR, a la version courante (ou avec l'essai en cours). */
export const toitLu = (o: { toitLidarLu?: number | null }): boolean => (o.toitLidarLu ?? 0) >= VERSION_LECTURE_TOITS || (essaiDeFaits() && o.toitLidarLu === MARQUE_ESSAI_FAITS);
/** La marque a poser sur un batiment qu'on vient de lire. */
export const marqueDeLecture = (o: ObjetAToit): number => (cleToucheeParEssai(cleDuBatiment(o)) ? MARQUE_ESSAI_FAITS : VERSION_LECTURE_TOITS);
/** Combien de lectures en meme temps : de petites grilles, le service repond vite. */
const EN_PARALLELE = 4;

/** Un batiment dont Plan choisit le toit : pas de toit, ou un toit BD TOPO ou LiDAR. */
export function toitAAjuster(o: ObjetAToit): o is ObjetAToit & { pts: PtBrut[] } {
  if (o.fonction !== 'batiment' || !Array.isArray(o.pts) || o.pts.length < 3) return false;
  // « Règles » coupées pour ce batiment (palette › Toit) : la lecture automatique ne le touche pas.
  if (o.toitFige) return false;
  const s = o.toit?.source;
  return !o.toit || s === 'bdtopo' || s === 'lidar';
}

/**
 * Le toit d'un batiment de la parcelle du projet, corps par corps : le contour decoupe en
 * rectangles, chacun ajuste sur les mesures qui tombent dedans ; un rectangle que le LiDAR
 * n'explique pas garde le toit par defaut a la pente du toit du batiment. Null quand le contour
 * ne se decoupe pas. `ajustes` compte les volumes que le LiDAR a mesures.
 */
export function volumesDepuisLidar(pts: readonly PtBrut[], ech: readonly EchantillonHauteur[], reference: Toit | null | undefined, mesure: ToitMesure | null = null): { volumes: VolumeToit[]; ajustes: number } | null {
  // Avec la surface mesuree, les rectangles sont recoupes la ou la couverture fait une marche (§11.2) :
  // une maison rectangulaire a deux niveaux et une annexe se separent, meme sous un seul rectangle.
  const bruts = mesure ? rectanglesDuContour(pts) : decomposerEnRectangles(pts);
  if (!bruts) return null;
  const rects = mesure ? decouperParHauteurs(mesure, bruts) : bruts;
  if (rects.length < 2) return null;
  const pente = reference ? penteDuToit(pts, reference) : PENTE_DEFAUT_DEG;
  let ajustes = 0;
  const volumes = rects.map((rect): VolumeToit => {
    const a = ajusterToit(rect, ech.filter((e) => pointInPolygon(e, rect)));
    // L'egout du corps : lu dans la surface mesuree quand on l'a, sinon celui de l'ajustement.
    const egout = mesure ? egoutDansRect(mesure, rect, pts) : a && egoutValide(a.egout) ? Math.round(a.egout * 10) / 10 : null;
    // Et la hauteur de chaque mur, la ou la couverture le rejoint : jamais sous l'egout, jamais au-dessus du faite.
    const murs = mesure && egout !== null ? rect.map((_, i) => Math.min(mesure.faite, Math.max(egout, hauteurMurMesuree(mesure, rect, i) ?? egout))) : null;
    const avecEgout = egout !== null ? { egout, ...(murs ? { hauteursMurs: murs } : {}) } : {};
    if (!a) return { pts: rect, toit: toitDuRectangle(rect, pente, reference?.source ?? 'bdtopo', true), ...avecEgout };
    ajustes++;
    return { pts: rect, toit: a.toit, ...avecEgout };
  });
  return { volumes, ajustes };
}

/**
 * Ce qu'on lit sous un batiment : les mesures de l'ajustement et, sur la parcelle du projet, la grille
 * entiere. `echec` : le service n'a pas repondu (le batiment n'est pas marque lu, il sera relu) ;
 * des mesures vides sans echec, c'est qu'il n'y a rien a lire ici.
 */
async function lireSous(o: ObjetAToit & { pts: PtBrut[] }, proj: ProjecteurLocal, lire: LecteurMnh, lireGrille: LecteurGrilleMnh | null, voisins: boolean): Promise<{ ech: EchantillonHauteur[]; grille: GrilleRelief | null; echec: boolean }> {
  if ((surParcellePrincipale(o) || voisins) && lireGrille) {
    const grille = await lireGrille(o.pts, proj).catch(() => null);
    if (grille) return { ech: echantillonsDeGrille(grille, o.pts), grille, echec: false };
  }
  try { return { ech: await lire(o.pts, proj), grille: null, echec: false }; }
  catch { return { ech: [], grille: null, echec: true }; }
}

/**
 * Les cles des batiments des parcelles mitoyennes, quand les toits du voisinage se lisent en corps et
 * pignons. Par la cle : la tache de fond lit des copies des batiments du plan.
 */
export function clesMitoyens(objets: readonly ObjetAToit[]): Set<string> {
  if (!corpsDuVoisinage(objets)) return new Set();
  return new Set([...batimentsMitoyens(objets)].map((m) => m.key).filter((k): k is string => !!k));
}

/** Le centre de la parcelle du projet, ou de tout ce qui a des sommets. */
function centreDuProjet(objets: readonly ObjetAToit[]): PtBrut {
  const parcelle = objets.find((o) => o.key === 'parcelle') ?? objets.find((o) => o.fonction === 'terrain');
  const pts = parcelle?.pts?.length ? parcelle.pts : objets.flatMap((o) => o.pts ?? []);
  return pts.length ? centroid(pts) : { x: 0, y: 0 };
}

/** Ou se trouve le batiment lu : le projet, une maison mitoyenne, et si le voisinage se lit en corps et pignons. */
interface PlaceDuBatiment { principal: boolean; mitoyen: boolean; voisins: boolean }

/**
 * Le toit d'un batiment, une fois sa grille lue (et le batiment recale) : la forme ajustee, la surface
 * mesuree, les volumes, les corps et pignons, la hauteur a l'egout. Synchrone : il tourne sous les
 * seuils du profil du batiment (avecSeuilsToit) sans que les lectures paralleles s'intercalent.
 */
function poserLeToit(o: ObjetAToit & { pts: PtBrut[] }, objets: readonly ObjetAToit[], ech: EchantillonHauteur[], grille: GrilleRelief | null, place: PlaceDuBatiment, bilan: BilanToitsLidar): void {
  const { principal, mitoyen, voisins } = place;
  // Une forme ajustee sur la cime d'un arbre n'est pas le toit du batiment qu'il couvre.
  const ajuste = ajusteVraisemblable(o, ajusteSelonFait(faitDuBatiment(o), o.pts, ech, ajusterToit(o.pts, ech)));
  const mesure = principal && grille ? mesureVraisemblable(o, toitMesureDepuisGrille(grille, o.pts)) : null;
  const volumes = principal ? volumesDepuisLidar(o.pts, ech, ajuste?.toit ?? o.toit, mesure) : null;
  // Et ses corps et pignons, lus sur cette surface (MD/spec-toit-ign.md §13).
  if (principal) {
    o.toitMesure = mesure; o.volumesToit = volumes?.volumes ?? null; o.corpsToit = mesure ? corpsLus(o, mesure, o.pts, grille) : null;
    // A cheval sur deux parcelles : la reponse donnee, ou le doute a lever (app/toitsACheval.ts).
    toitAChevalApresCalcul(o, objets, grille);
  }
  // Une maison voisine : ses corps et pignons. Sur une parcelle mitoyenne, le calcul entier, toit
  // mesure garde (la carte, « tel que mesure ») ; plus loin, sans la coupe par le modele (la plus
  // lourde, §13.6) et sans garder la grille, qui alourdirait le projet de quelques Kio par maison.
  else if (voisins && grille) {
    const mesureVoisine = mesureVraisemblable(o, toitMesureDepuisGrille(grille, o.pts));
    o.corpsToit = mesureVoisine ? corpsLus(o, mesureVoisine, o.pts, grille, mitoyen) : null;
    // Sans corps lisibles (un toit sous les arbres), la surface brute serait dessinee telle quelle :
    // chez le voisin, la forme simple vaut mieux qu'un relief de feuillage.
    if (mitoyen) o.toitMesure = o.corpsToit ? mesureVoisine : null;
    // A cheval sur deux parcelles : la reponse donnee, ou le doute a lever (app/toitsACheval.ts).
    if (mitoyen) toitAChevalApresCalcul(o, objets, grille);
    if (o.corpsToit) bilan.corpsVoisins++;
  }
  if (mesure) bilan.mesures++;
  else if (!ajuste && !volumes?.ajustes) { bilan.gardes++; return; }
  if (ajuste) o.toit = avecCouleurDe(o.toit, ajuste.toit);
  // La hauteur a l'egout : celle de la surface mesuree, sinon celle de l'ajustement, quand elle s'ecarte franchement.
  const egout = mesure ? mesure.egout : ajuste ? ajuste.egout : null;
  const elevation = elevationApresLecture(o.elevation, egout);
  if (elevation !== undefined) o.elevation = elevation;
  if (ajuste || volumes?.ajustes) bilan.ajustes++;
}

/**
 * Pose sur chaque batiment eligible le toit que le LiDAR HD mesure, en gardant la couleur de
 * couverture en place ; corrige la hauteur a l'egout quand la mesure s'en ecarte franchement.
 * Modifie les objets en place. Un service muet ne bloque rien : les toits BD TOPO restent.
 */
export async function toitsDepuisLidar(objets: readonly ObjetAToit[], proj: ProjecteurLocal, options: OptionsToitsLidar = {}): Promise<BilanToitsLidar> {
  const bilan: BilanToitsLidar = { ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false };
  const maintenant = options.maintenant ?? Date.now;
  const fin = maintenant() + (options.delaiMs ?? DELAI_TOITS_LIDAR_MS);
  const centre = centreDuProjet(objets);
  // Un batiment verifie sur place est le 100 % du projet (spec des regles §1) : on ne le relit pas sans qu'on le demande.
  const admis = (o: ObjetAToit): o is ObjetAToit & { pts: PtBrut[] } => toitAAjuster(o) && (options.verifies === 'relire' || !estVerifieSurPlace(o));
  const candidats = options.candidats
    ? options.candidats.filter(admis)
    : objets
      .filter(admis)
      .map((o) => ({ o, d: Math.hypot(centroid(o.pts).x - centre.x, centroid(o.pts).y - centre.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, options.maxBatiments ?? MAX_BATIMENTS_LIDAR)
      .map((c) => c.o);
  // Un fait en remplacement donne le toit sans rien lire : avant la question des dalles, il vaut aussi sans LiDAR.
  const aLire = candidats.filter((o) => { const f = faitDuBatiment(o); return !(f?.application === 'remplacement' && toitDuFait(o, f)); });
  if (!aLire.length) return bilan;
  if (!(await (options.dalles ?? dallesLidarSur)(aLire.flatMap((o) => o.pts), proj))) {
    bilan.sansLidar = true;
    return bilan;
  }
  // Un service muet fait echouer cette lecture (le batiment reste a relire) au lieu de la rendre vide.
  const lire = options.lire ?? lireHauteursSousStrict;
  // Un lecteur de mesures fourni sans lecteur de grille : pas de toit mesure (les tests, un service partiel).
  const lireGrille = options.lireGrille ?? (options.lire ? null : lireGrilleSous);
  const voisins = corpsDuVoisinage(objets);
  const mitoyens = options.mitoyens ?? clesMitoyens(objets);
  const estMitoyen = (o: ObjetAToit) => !!o.key && mitoyens.has(o.key);
  // Le lieu du projet et les contours de ses batiments, une fois pour toute la lecture.
  const lieu = contexteProfils(objets, options.profils);
  let suivant = 0;
  const ouvrier = async (): Promise<void> => {
    while (suivant < aLire.length && maintenant() < fin) {
      const o = aLire[suivant++];
      if (!o) break;
      if (options.pause) await options.pause();
      const lu = await lireSous(o, proj, lire, lireGrille, voisins);
      let { ech, grille } = lu;
      // Lu, meme sans rien dessous : seul un service muet laisse le batiment a relire.
      if (!lu.echec) o.toitLidarLu = marqueDeLecture(o);
      if (!ech.length) continue;
      // Sur la parcelle du projet, le toit est aussi garde tel que mesure (§12) et decoupe corps par corps (§11).
      const principal = surParcellePrincipale(o);
      // Les profils de toits du batiment (regles/toits/reglages.json, facade/regles/toits/profils.ts), choisis
      // une fois, sur le contour d'avant le recalage : sans profil livre, aucune surcharge.
      const seuils = surchargesDuBatiment(o, lieu, options.profils);
      // Un batiment vu de pres (le projet, une maison mitoyenne) trace a cote de son toit est d'abord
      // recale, d'un bloc, sur le LiDAR (MD/spec-toit-ign.md §13.7).
      if (grille && lireGrille && (principal || estMitoyen(o))) {
        const large = await recalerSurLidar(o, grille, proj, lireGrille, seuils);
        if (large) { grille = large; ech = echantillonsDeGrille(large, o.pts); bilan.recales++; }
      }
      // Le toit, sous les seuils du profil du batiment (facade/regles/toits/profils.ts) : un calcul synchrone.
      avecSeuilsToit(seuils, () => poserLeToit(o, objets, ech, grille, { principal, mitoyen: estMitoyen(o), voisins }, bilan));
    }
  };
  await Promise.all(Array.from({ length: options.enParallele ?? EN_PARALLELE }, ouvrier));
  return bilan;
}

/** La phrase du bilan, ou `null` s'il n'y a rien a dire. */
export function texteBilanToitsLidar(b: BilanToitsLidar): string | null {
  if (b.sansLidar) return null;
  if (!b.ajustes && !b.gardes && !b.mesures && !b.corpsVoisins && !b.recales) return null;
  const parts = [
    b.ajustes ? b.ajustes + ' toit(s) ajuste(s) sur le LiDAR HD' : '',
    b.mesures ? b.mesures + ' toit(s) de la parcelle garde(s) tel(s) que mesure(s)' : '',
    b.corpsVoisins ? b.corpsVoisins + ' toit(s) du voisinage en corps et pignons' : '',
    b.recales ? b.recales + ' batiment(s) recale(s) sur le LiDAR' : '',
    b.gardes ? b.gardes + ' garde(s) tel(s) quel(s) (forme trop complexe)' : '',
  ].filter(Boolean);
  return parts.join(', ');
}
