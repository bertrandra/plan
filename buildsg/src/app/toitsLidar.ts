// Les toits ajustes sur le LiDAR HD, apres un import ou une actualisation (MD/spec-toit-ign.md §10).
//
// Pour chaque batiment dont le toit vient de la BD TOPO (ou d'une lecture LiDAR anterieure), on lit
// le MNH sous son contour (geo/mnh.ts) et l'on y ajuste une forme (facade/toitLidar.ts). Un toit
// lu sur une photo ou saisi n'est pas touche. Les plus proches de la parcelle du projet d'abord,
// dans un delai borne : l'import ne doit pas attendre le service pour un voisinage de deux mille
// batiments, et ceux qu'on regarde de pres sont ceux qui comptent.

import { ajusterToit, type EchantillonHauteur } from '../facade/toitLidar.js';
import { lireHauteursSous, lireGrilleSous, echantillonsDeGrille, dallesLidarSur, type LecteurMnh, type LecteurGrilleMnh } from '../geo/mnh.js';
import { decomposerEnRectangles, rectanglesDuContour, penteDuToit, toitDuRectangle } from '../model/volumesToit.js';
import { PENTE_DEFAUT_DEG } from '../model/toitBdTopo.js';
import { toitMesureDepuisGrille, egoutDansRect, decouperParHauteurs, hauteurMurMesuree } from '../model/toitMesure.js';
import { reconstruireCorps, decalageSurMesure, partVideSous, PART_VIDE_RECALAGE, DECALAGE_MAX_M } from '../facade/toitCorps.js';
import { centroid, pointInPolygon } from '../geometry/basic.js';
import { surParcelleDuProjet } from '../model/fonctions.js';
import { batimentsMitoyens } from '../model/mitoyennete.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { GrilleRelief } from '../model/relief.js';
import type { CorpsToit, PtBrut, Toit, ToitMesure, VolumeToit } from '../model/types.js';

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
}

/** Un batiment de la parcelle du projet : celui dont le toit se garde tel que mesure (model/fonctions.ts). */
export const surParcellePrincipale = (o: ObjetAToit): boolean => surParcelleDuProjet(o);

/** Les batiments des parcelles mitoyennes : le meme calcul que la maison du projet (model/mitoyennete.ts). */
export { batimentsMitoyens };

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
async function recalerSurLidar(o: ObjetAToit & { pts: PtBrut[] }, grille: GrilleRelief, proj: ProjecteurLocal, lireGrille: LecteurGrilleMnh): Promise<GrilleRelief | null> {
  if (partVideSous(grille, o.pts) < PART_VIDE_RECALAGE) return null;
  const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y), m = DECALAGE_MAX_M;
  const boite = [{ x: Math.min(...xs) - m, y: Math.min(...ys) - m }, { x: Math.max(...xs) + m, y: Math.min(...ys) - m }, { x: Math.max(...xs) + m, y: Math.max(...ys) + m }, { x: Math.min(...xs) - m, y: Math.max(...ys) + m }];
  const large = await lireGrille(boite, proj).catch(() => null);
  const d = large ? decalageSurMesure(large, o.pts) : null;
  if (!large || !d) return null;
  o.pts = o.pts.map((p) => ({ x: Math.round((p.x + d.x) * 100) / 100, y: Math.round((p.y + d.y) * 100) / 100 }));
  return large;
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
  lire?: LecteurMnh;
  /** La grille entiere, pour le toit mesure d'un batiment de la parcelle du projet ; `lire` donne, absente, et sinon la grille du service. */
  lireGrille?: LecteurGrilleMnh;
  dalles?: (pts: readonly PtBrut[], proj: ProjecteurLocal) => Promise<boolean>;
  /** L'horloge, pour le delai. */
  maintenant?: () => number;
}

/** Le delai donne a la lecture des toits, comme a celle des couleurs sur l'orthophoto. */
export const DELAI_TOITS_LIDAR_MS = 20000;
/** Le voisinage etendu peut compter deux mille batiments : seuls les plus proches sont lus. */
export const MAX_BATIMENTS_LIDAR = 150;
/** Combien de lectures en meme temps : de petites grilles, le service repond vite. */
const EN_PARALLELE = 4;
/** En deca, l'egout mesure ne vaut pas de changer la hauteur BD TOPO ; au-dela de ces bornes, la mesure n'est pas un egout. */
const ECART_EGOUT_MIN_M = 0.3;
const EGOUT_MIN_M = 2;
const EGOUT_MAX_M = 40;

/** Un batiment dont Plan choisit le toit : pas de toit, ou un toit BD TOPO ou LiDAR. */
export function toitAAjuster(o: ObjetAToit): o is ObjetAToit & { pts: PtBrut[] } {
  if (o.fonction !== 'batiment' || !Array.isArray(o.pts) || o.pts.length < 3) return false;
  const s = o.toit?.source;
  return !o.toit || s === 'bdtopo' || s === 'lidar';
}

/** L'egout mesure vaut d'etre ecrit : entre les bornes d'un egout. */
const egoutValide = (e: number) => e >= EGOUT_MIN_M && e <= EGOUT_MAX_M;

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

/** Ce qu'on lit sous un batiment : les mesures de l'ajustement et, sur la parcelle du projet, la grille entiere. */
async function lireSous(o: ObjetAToit & { pts: PtBrut[] }, proj: ProjecteurLocal, lire: LecteurMnh, lireGrille: LecteurGrilleMnh | null, voisins: boolean): Promise<{ ech: EchantillonHauteur[]; grille: GrilleRelief | null }> {
  if ((surParcellePrincipale(o) || voisins) && lireGrille) {
    const grille = await lireGrille(o.pts, proj).catch(() => null);
    if (grille) return { ech: echantillonsDeGrille(grille, o.pts), grille };
  }
  return { ech: await lire(o.pts, proj).catch(() => []), grille: null };
}

/** Le centre de la parcelle du projet, ou de tout ce qui a des sommets. */
function centreDuProjet(objets: readonly ObjetAToit[]): PtBrut {
  const parcelle = objets.find((o) => o.key === 'parcelle') ?? objets.find((o) => o.fonction === 'terrain');
  const pts = parcelle?.pts?.length ? parcelle.pts : objets.flatMap((o) => o.pts ?? []);
  return pts.length ? centroid(pts) : { x: 0, y: 0 };
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
  const candidats = objets
    .filter(toitAAjuster)
    .map((o) => ({ o, d: Math.hypot(centroid(o.pts).x - centre.x, centroid(o.pts).y - centre.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, options.maxBatiments ?? MAX_BATIMENTS_LIDAR)
    .map((c) => c.o);
  if (!candidats.length) return bilan;
  if (!(await (options.dalles ?? dallesLidarSur)(candidats.flatMap((o) => o.pts), proj))) {
    bilan.sansLidar = true;
    return bilan;
  }
  const lire = options.lire ?? lireHauteursSous;
  // Un lecteur de mesures fourni sans lecteur de grille : pas de toit mesure (les tests, un service partiel).
  const lireGrille = options.lireGrille ?? (options.lire ? null : lireGrilleSous);
  const voisins = corpsDuVoisinage(objets);
  const mitoyens = voisins ? batimentsMitoyens(objets) : new Set<ObjetAToit>();
  let suivant = 0;
  const ouvrier = async (): Promise<void> => {
    while (suivant < candidats.length && maintenant() < fin) {
      const o = candidats[suivant++];
      if (!o) break;
      const lu = await lireSous(o, proj, lire, lireGrille, voisins);
      let { ech, grille } = lu;
      if (!ech.length) continue;
      // Sur la parcelle du projet, le toit est aussi garde tel que mesure (§12) et decoupe corps par corps (§11).
      const principal = surParcellePrincipale(o);
      // Un batiment vu de pres (le projet, une maison mitoyenne) trace a cote de son toit est d'abord
      // recale, d'un bloc, sur le LiDAR (MD/spec-toit-ign.md §13.7).
      if (grille && lireGrille && (principal || mitoyens.has(o))) {
        const large = await recalerSurLidar(o, grille, proj, lireGrille);
        if (large) { grille = large; ech = echantillonsDeGrille(large, o.pts); bilan.recales++; }
      }
      const ajuste = ajusterToit(o.pts, ech);
      const mesure = principal && grille ? toitMesureDepuisGrille(grille, o.pts) : null;
      const volumes = principal ? volumesDepuisLidar(o.pts, ech, ajuste?.toit ?? o.toit, mesure) : null;
      // Et ses corps et pignons, lus sur cette surface (MD/spec-toit-ign.md §13).
      if (principal) { o.toitMesure = mesure; o.volumesToit = volumes?.volumes ?? null; o.corpsToit = mesure ? reconstruireCorps(mesure, o.pts, { grille }) : null; }
      // Une maison voisine : ses corps et pignons. Sur une parcelle mitoyenne, le calcul entier, toit
      // mesure garde (la carte, « tel que mesure ») ; plus loin, sans la coupe par le modele (la plus
      // lourde, §13.6) et sans garder la grille, qui alourdirait le projet de quelques Kio par maison.
      else if (voisins && grille) {
        const mesureVoisine = toitMesureDepuisGrille(grille, o.pts);
        const mitoyen = mitoyens.has(o);
        o.corpsToit = mesureVoisine ? reconstruireCorps(mesureVoisine, o.pts, { coupes: mitoyen, grille }) : null;
        // Sans corps lisibles (un toit sous les arbres), la surface brute serait dessinee telle quelle :
        // chez le voisin, la forme simple vaut mieux qu'un relief de feuillage.
        if (mitoyen) o.toitMesure = o.corpsToit ? mesureVoisine : null;
        if (o.corpsToit) bilan.corpsVoisins++;
      }
      if (mesure) bilan.mesures++;
      else if (!ajuste && !volumes?.ajustes) { bilan.gardes++; continue; }
      if (ajuste) {
        const ancien = o.toit;
        o.toit = { ...ajuste.toit, ...(ancien?.couleur ? { couleur: ancien.couleur } : {}), ...(ancien?.origineCouleur ? { origineCouleur: ancien.origineCouleur } : {}) };
      }
      // La hauteur a l'egout : celle de la surface mesuree, sinon celle de l'ajustement, quand elle s'ecarte franchement.
      const egout = mesure ? mesure.egout : ajuste ? ajuste.egout : null;
      const h = o.elevation ?? 0;
      if (egout !== null && egoutValide(egout) && Math.abs(egout - h) >= ECART_EGOUT_MIN_M) o.elevation = Math.round(egout * 10) / 10;
      if (ajuste || volumes?.ajustes) bilan.ajustes++;
    }
  };
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier));
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
