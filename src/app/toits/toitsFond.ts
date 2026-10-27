// La lecture des toits en tache de fond (MD/roadmap-toits-fond.md, MD/spec-toit-ign.md §10).
//
// A l'import et a l'actualisation, seuls les trente batiments les plus proches sont lus sur le LiDAR
// avant que le plan s'ouvre (app/toits/toitsLidar.ts, MAX_BATIMENTS_LIDAR). Les autres le sont ici, apres,
// du plus proche au plus loin, sans bloquer l'interface : une pause avant chaque batiment rend la main
// au navigateur. La file est continue : chaque lecteur prend le batiment suivant des qu'il a fini (un
// lot attendait son batiment le plus lent), et ce qui est lu se dessine par paquets de LOT_TOITS_FOND.
//
// Chaque batiment se lit sur une copie. Un resultat ne s'ecrit dans le plan que si le
// batiment y est encore, a l'identique (meme contour, meme toit) : un batiment que l'utilisateur a
// deplace, supprime ou dont il a saisi le toit pendant la lecture n'est pas ecrase. Les ecritures ne
// passent pas par l'historique (Ctrl+Z ne defait pas une lecture), mais marquent le projet a
// enregistrer : le marque `toitLidarLu` de chaque batiment lu evite de le relire a la reouverture.
//
// Un service muet n'use pas la file en vain : LOT_TOITS_FOND batiments d'affilee sans rien de lu font
// attendre la suite, et apres quelques attentes d'affilee la lecture s'arrete jusqu'a la prochaine
// ouverture (ou « Reprendre »). Sans dalle LiDAR sur le secteur, seules les couleurs se lisent.
//
// Un batiment verifie sur place (model/toitVerifie.ts, le 100 % de la parcelle du projet) n'est pas
// recalcule par un changement de regle : sa copie est lue, comparee a ce qui est dans le plan, et seule
// la marque de lecture s'ecrit. Le bilan dit si le nouveau calcul serait d'accord - c'est la mesure de
// la regle, sans toucher au projet (MD/spec-regles-toits.md §1).

import { toitsDepuisLidar, toitAAjuster, toitLu, clesMitoyens, type ObjetAToit, type BilanToitsLidar } from './toitsLidar.js';
import { dallesLidarSur } from '../../geo/mnh.js';
import { lireMursEnFond, mursALire, avancementMurs, ECHECS_MURS_PAR_BATIMENT, LECTURE_MURS_EN_FOND } from './mursFond.js';
import type { Regulateur } from '../regulateur.js';
import { projecteurLocal, type ProjecteurLocal } from '../../geo/projection.js';
import { couleursToitsDepuisOrtho } from '../../render/couleurToitOrtho.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { aDesSommets } from '../../model/formes.js';
import { centroid } from '../../geometry/basic.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import type { ProgressionToits } from '../../core/lectureToits.js';
import { estVerifieSurPlace, lectureDAccord } from '../../model/toitVerifie.js';
import { champsBatiment } from '../../model/champsFonction.js';

/** Combien de batiments lus par dessin : assez pour que le plan ne se redessine pas a chaque toit. */
export const LOT_TOITS_FOND = 12;
/** Les lectures en meme temps : un peu plus qu'a l'import, le service repond vite a ces petites grilles. */
export const PARALLELE_TOITS_FOND = 6;
/** Apres LOT_TOITS_FOND batiments muets d'affilee, on attend avant de redemander ; apres tant d'attentes d'affilee, on s'arrete. */
export const ATTENTE_APRES_ECHEC_MS = 30000;
export const ECHECS_AVANT_ARRET = 3;
/**
 * Pendant la lecture, le projet s'enregistre seul au plus toutes ces millisecondes, et a la fin -
 * seulement si tout ce qui attend d'etre enregistre vient de la lecture : jamais une modification de
 * l'utilisateur a son insu. Sans cela, fermer le plan sans enregistrer faisait tout relire. Cinq
 * minutes : un voisinage d'un kilometre pese 9 Mo, et l'ecrire fige l'ecran une seconde (mesure).
 */
export const INTERVALLE_ENREGISTREMENT_MS = 300000;
/** Un batiment que le service refuse deux fois de suite est laisse pour cette seance : il ne bouche pas la file. */
export const ECHECS_PAR_BATIMENT = 2;

export type { ProgressionToits };

export interface ContexteToitsFond {
  /** Les objets du plan courant : relus a chaque batiment (une annulation remplace le tableau). */
  objets: () => ObjetPlan[];
  /** Un plan en lecture seule n'enregistrera pas ce qu'on lirait : rien ne se lance. */
  lectureSeule: () => boolean;
  /** Des batiments lus viennent d'etre ecrits dans le plan (leurs cles) : redessiner, marquer a enregistrer. */
  apresLot: (cles: string[]) => void;
  /** La progression, pour la barre d'etat ; null quand il n'y a rien a lire. */
  progression: (p: ProgressionToits | null) => void;
  /** La lecture d'un batiment (app/toits/toitsLidar.ts) ; remplacable dans les tests, qui ne touchent pas le reseau. */
  lire?: typeof toitsDepuisLidar;
  /** Y a-t-il des dalles LiDAR sur le secteur (geo/mnh.ts) : demande une fois par passe, a la premiere lecture. */
  dalles?: typeof dallesLidarSur;
  /** La lecture des murs sur les photos de rue, apres les toits (app/toits/mursFond.ts) ; remplacable dans les tests. */
  lireMurs?: typeof lireMursEnFond;
  /** Lire les murs apres les toits ; LECTURE_MURS_EN_FOND par defaut (arretee pour l'instant). */
  murs?: boolean;
  /** La lecture des couleurs sur l'orthophoto (render/couleurToitOrtho.ts) ; remplacable dans les tests. */
  lireCouleurs?: typeof couleursToitsDepuisOrtho;
  /** Rend la main au navigateur entre deux batiments ; remplacable dans les tests. */
  pause?: () => Promise<void>;
  /**
   * Le regulateur de charge (app/regulateur.ts) : combien de lectures en meme temps, quelle pause avant
   * chaque batiment, selon l'activite de l'utilisateur et le retard du fil principal ; l'enregistrement
   * seul attend un moment sans geste. `brancher` le met a l'ecoute pendant la lecture. Absent : `pause`.
   */
  regulateur?: { r: Regulateur; brancher: () => () => void };
  /** L'attente apres une suite de batiments muets ; remplacable dans les tests. */
  attendre?: (ms: number) => Promise<void>;
  /** La lecture est allee au bout, avec ce qu'elle a fait cette fois : le bilan, les questions. */
  fin?: (bilan: BilanFond) => void;
  /** Le compteur des modifications du projet (core/historique.ts) et son indicateur « a enregistrer ». */
  modifications?: () => number;
  sale?: () => boolean;
  /** Enregistre le projet sans bruit (app/projet.ts) ; absent : rien ne s'enregistre seul. */
  enregistrer?: () => Promise<boolean>;
  maintenant?: () => number;
}

/** Le projecteur du plan : son origine est le calage cadastral de la parcelle du projet (app/cadastre/importCadastre.ts). */
function projecteurDuProjet(objets: ObjetPlan[]): ProjecteurLocal | null {
  const cad = parcelleDuProjet(objets)?.cadastre;
  return typeof cad?.origineLat === 'number' && typeof cad.origineLon === 'number' ? projecteurLocal(cad.origineLat, cad.origineLon) : null;
}

/**
 * La couleur de ce toit reste a lire sur l'orthophoto : Plan la pose avec son origine
 * (render/couleurToitOrtho.ts) ; un toit sans couleur ne l'a jamais ete - ou l'actualisation l'a effacee.
 */
export const couleurALire = (o: { toit?: { couleur?: string } | null } | null | undefined): boolean => !!o?.toit && !o.toit.couleur;

/**
 * La forme (LiDAR) ou la couleur (orthophoto) de ce batiment reste a lire. Un batiment verifie sur
 * place ne se compare que sur la forme : sa couleur, validee, n'est pas relue.
 */
const resteALire = (o: ObjetPlan, lidar: boolean): boolean => (lidar && !toitLu(o.batiment)) || (!estVerifieSurPlace(o.batiment) && couleurALire(o.batiment));

/**
 * Les batiments dont Plan choisit le toit, et ceux qui restent a lire - forme ou couleur - du plus
 * proche au plus loin. `lidar` faux : le secteur n'a pas de dalle LiDAR, seule la couleur se lit.
 */
export function batimentsALire(objets: ObjetPlan[], lidar = true): { eligibles: number; restants: ObjetPlan[] } {
  const eligibles = objets.filter((o) => toitAAjuster(o as ObjetAToit));
  const parcelle = parcelleDuProjet(objets);
  const contour = parcelle && aDesSommets(parcelle) ? parcelle.pts : [];
  const centre: PtBrut = contour.length ? centroid(contour) : { x: 0, y: 0 };
  const d = (o: ObjetPlan) => { const c = centroid((o as ObjetAToit).pts as PtBrut[]); return Math.hypot(c.x - centre.x, c.y - centre.y); };
  const restants = eligibles.filter((o) => resteALire(o, lidar)).map((o) => ({ o, d: d(o) })).sort((a, b) => a.d - b.d).map((x) => x.o);
  return { eligibles: eligibles.length, restants };
}

/** Ce que la lecture ecrit d'un batiment, et rien d'autre : son nom, ses couleurs choisies restent. */
const CHAMPS_LUS = ['pts', 'elevation'] as const;
/** Les memes, dans le sous-objet `batiment` (model/typesFonctions.ts). */
const CHAMPS_LUS_BATIMENT = ['toit', 'toitMesure', 'volumesToit', 'corpsToit', 'toitACheval', 'toitLidarLu'] as const;
/** D'un batiment verifie sur place, la lecture n'ecrit que sa marque : le toit valide reste, au centimetre. */
const CHAMPS_LUS_VERIFIE_BATIMENT = ['toitLidarLu'] as const;

/** L'empreinte de ce qui, change par l'utilisateur, rend une lecture caduque. */
const empreinte = (o: ObjetPlan) => JSON.stringify([(o as ObjetAToit).pts, o.batiment?.toit ?? null]);

/**
 * Ecrit dans le plan ce que la copie a lu, si le batiment y est encore tel qu'il a ete copie : la
 * forme lue (et tout ce qui vient avec), ou la seule couleur quand la forme n'a pas pu se lire - sans
 * quoi ce batiment repassait a chaque passe. Rend vrai s'il a ete ecrit.
 */
function reporter(objets: ObjetPlan[], copie: ObjetPlan, avant: string): boolean {
  const forme = toitLu(copie.batiment), couleur = !!copie.batiment?.toit?.couleur;
  if (!forme && !couleur) return false;
  const o = objets.find((x) => x.key === copie.key);
  if (!o || empreinte(o) !== avant || !toitAAjuster(o as ObjetAToit)) return false;
  if (forme) {
    const verifie = estVerifieSurPlace(o.batiment);
    if (!verifie) {
      const cible = o as unknown as Record<string, unknown>, source = copie as unknown as Record<string, unknown>;
      for (const k of CHAMPS_LUS) cible[k] = source[k] === undefined ? null : source[k];
    }
    const cible = champsBatiment(o) as Record<string, unknown>, source = (copie.batiment ?? {}) as Record<string, unknown>;
    for (const k of verifie ? CHAMPS_LUS_VERIFIE_BATIMENT : CHAMPS_LUS_BATIMENT) cible[k] = source[k] === undefined ? null : source[k];
    return true;
  }
  if (estVerifieSurPlace(o.batiment)) return false;
  if (!o.batiment?.toit || !couleurALire(o.batiment) || !copie.batiment?.toit) return false;
  champsBatiment(o).toit = { ...o.batiment?.toit, couleur: copie.batiment?.toit.couleur as string, ...(copie.batiment?.toit.origineCouleur ? { origineCouleur: copie.batiment?.toit.origineCouleur } : {}) };
  return true;
}

/**
 * Ce qu'une lecture a fait, du premier batiment au dernier : les formes lues sur le LiDAR, les couleurs
 * des toits sur la photo aerienne, celles des murs sur les photos de rue.
 */
export type BilanFond = BilanToitsLidar & {
  lus: number; couleurs: number; murs?: number;
  /** Les batiments verifies sur place, gardes tels quels : combien le nouveau calcul confirme, combien il contredit. */
  verifies?: { accord: number; desaccord: number };
};
const vide = (): BilanFond => ({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false, lus: 0, couleurs: 0, murs: 0 });
function ajouter(c: BilanFond, b: BilanToitsLidar | null, lus: number, couleurs: number, accord?: boolean): void {
  if (accord !== undefined) {
    // Un batiment verifie compte a part : son toit n'a pas ete lu dans le plan, il a ete compare.
    c.verifies = { accord: (c.verifies?.accord ?? 0) + (accord ? 1 : 0), desaccord: (c.verifies?.desaccord ?? 0) + (accord ? 0 : 1) };
    return;
  }
  if (b) { c.ajustes += b.ajustes; c.mesures += b.mesures; c.corpsVoisins += b.corpsVoisins; c.recales += b.recales; c.gardes += b.gardes; }
  c.lus += lus; c.couleurs += couleurs;
}

/** La phrase des batiments verifies sur place, ou '' : gardes tels quels, et ce que le calcul d'aujourd'hui en dirait. */
export function texteVerifiesFond(v: BilanFond['verifies']): string {
  if (!v || !(v.accord + v.desaccord)) return '';
  const n = v.accord + v.desaccord;
  const tete = n > 1 ? n + ' bâtiments vérifiés sur place gardés tels quels' : 'Bâtiment vérifié sur place gardé tel quel';
  const avis = !v.desaccord ? 'le nouveau calcul serait d’accord'
    : !v.accord ? 'le nouveau calcul serait différent'
      : 'le nouveau calcul serait d’accord pour ' + v.accord + ', différent pour ' + v.desaccord;
  return tete + ' : ' + avis + '.';
}

/** Le bilan de fin, pour un toast : combien de toits lus, et ce qu'ils sont devenus. */
export function texteFinToitsFond(b: BilanFond): string {
  const n = (v: number) => v.toLocaleString('fr-FR');
  const parts = [
    b.ajustes ? n(b.ajustes) + ' ajusté' + (b.ajustes > 1 ? 's' : '') : '',
    b.corpsVoisins ? n(b.corpsVoisins) + ' en corps et pignons' : '',
    b.recales ? n(b.recales) + ' recalé' + (b.recales > 1 ? 's' : '') : '',
    b.gardes ? n(b.gardes) + ' gardé' + (b.gardes > 1 ? 's' : '') + ' d’après la BD TOPO' : '',
  ].filter(Boolean);
  const formes = b.lus ? 'Toits du voisinage lus sur le LiDAR HD : ' + n(b.lus) + (parts.length ? ' (' + parts.join(', ') + ')' : '') + '.' : '';
  const couleurs = b.couleurs ? n(b.couleurs) + ' couleur' + (b.couleurs > 1 ? 's' : '') + ' de toit lue' + (b.couleurs > 1 ? 's' : '') + ' sur la photo aérienne.' : '';
  const m = b.murs ?? 0;
  const murs = m ? n(m) + ' couleur' + (m > 1 ? 's' : '') + ' de murs lue' + (m > 1 ? 's' : '') + ' sur les photos de rue.' : '';
  return [formes, couleurs, murs, texteVerifiesFond(b.verifies)].filter(Boolean).join(' ');
}

/** Ou en est la lecture, pour la barre d'etat : les toits, ou les murs quand c'est leur tour ; null s'il n'y a rien a lire. */
function progressionDe(objets: ObjetPlan[], etat: ProgressionToits['etat'], lidar: boolean, murs: boolean): ProgressionToits | null {
  if (murs) { const m = avancementMurs(objets); return m.total ? { ...m, etat, phase: 'murs' } : null; }
  const { eligibles, restants } = batimentsALire(objets, lidar);
  return eligibles ? { faits: eligibles - restants.length, total: eligibles, etat } : null;
}

/**
 * Les batiments muets d'affilee, tous lecteurs confondus : apres LOT_TOITS_FOND, tous attendent
 * ATTENTE_APRES_ECHEC_MS ; apres ECHECS_AVANT_ARRET attentes d'affilee, la passe s'arrete. Un batiment
 * lu remet tout a zero. `noter` rend faux quand le lecteur doit s'arreter.
 */
function suiteMuette(attendre: (ms: number) => Promise<void>) {
  let deSuite = 0, attentes = 0, arret = false;
  let attente: Promise<void> | null = null;
  return {
    attente: async () => { if (attente) await attente; },
    arret: () => arret,
    noter(avance: boolean): boolean {
      if (avance) { deSuite = 0; attentes = 0; return true; }
      if (++deSuite < LOT_TOITS_FOND) return true;
      deSuite = 0;
      if (++attentes >= ECHECS_AVANT_ARRET) { arret = true; return false; }
      attente ??= attendre(ATTENTE_APRES_ECHEC_MS).finally(() => { attente = null; });
      return true;
    },
  };
}

/**
 * Un batiment pris dans la file : sa copie, et l'empreinte de l'original au moment ou il a ete pris.
 * Pour un batiment verifie sur place, aussi l'original tel qu'il etait : la lecture s'y compare.
 */
type Lu = { copie: ObjetPlan; avant: string; reference?: ObjetPlan };

/**
 * La file d'une passe : rend, dans l'ordre, la copie du prochain batiment encore dans le plan, encore
 * a lire et admis (`admis`) ; null quand la file est vide. Le plan est relu a chaque fois : une
 * annulation remplace le tableau des objets.
 */
function fileDeLecture(cles: readonly string[], objets: () => ObjetPlan[], admis: (o: ObjetPlan) => boolean): () => Lu | null {
  let i = 0;
  return () => {
    const courants = objets();
    while (i < cles.length) {
      const cle = cles[i++];
      const o = courants.find((x) => x.key === cle);
      if (o && toitAAjuster(o as ObjetAToit) && admis(o)) return { copie: structuredClone(o), avant: empreinte(o), ...(estVerifieSurPlace(o.batiment) ? { reference: structuredClone(o) } : {}) };
    }
    return null;
  };
}

/**
 * Lit la copie d'un batiment : d'abord la forme (elle dit si le toit est plat, ce que la lecture de la
 * couleur prend en compte), puis la couleur s'il n'en a pas. Un service qui echoue rend un bilan vide.
 */
async function lireUnBatiment(copie: ObjetPlan, lidar: boolean, lireForme: (c: ObjetAToit) => Promise<BilanToitsLidar>, lireCouleur: (c: ObjetPlan) => Promise<{ lus: number; replis: number }>): Promise<{ bilan: BilanToitsLidar | null; forme: boolean; couleur: boolean; couleurs: number }> {
  const pourForme = lidar && !toitLu(copie.batiment);
  const bilan = pourForme ? await lireForme(copie as ObjetAToit).catch(() => null) : null;
  const pourCouleur = !estVerifieSurPlace(copie.batiment) && couleurALire(copie.batiment);
  const lues = pourCouleur ? await lireCouleur(copie).catch(() => null) : null;
  return { bilan, forme: pourForme && toitLu(copie.batiment), couleur: pourCouleur && !couleurALire(copie.batiment), couleurs: lues ? lues.lus + lues.replis : 0 };
}

/**
 * L'enregistrement seul : depuis le dernier etat enregistre (`base.c`), combien de modifications sont
 * celles de la lecture (`base.nos`) ; null quand des modifications de l'utilisateur attendent. Un
 * enregistrement refuse (un projet trop lourd pour la plateforme) arrete les essais pour la seance :
 * le bandeau d'erreur ne reviendrait qu'a chaque dessin.
 */
function creerEnregistreur(ctx: ContexteToitsFond) {
  const maintenant = ctx.maintenant ?? Date.now;
  const modifs = () => ctx.modifications?.() ?? 0;
  let base: { c: number; nos: number } | null = null;
  let dernier = 0, refuse = false;
  return {
    /** Une lecture commence : tout ce qui attend d'etre enregistre, s'il y en a, n'est pas a elle. */
    repartir() { base = ctx.sale?.() ? null : { c: modifs(), nos: 0 }; dernier = maintenant(); },
    /** La lecture ecrit dans le plan (`ecrire`) : ce que cela modifie est a elle. */
    noter(ecrire: () => void) {
      // Tout etait enregistre : nouveau depart du compte. Sinon, ce qui attend n'est peut-etre pas a nous.
      if (!ctx.sale?.()) base = { c: modifs(), nos: 0 };
      const avant = modifs();
      ecrire();
      if (base) base.nos += modifs() - avant;
    },
    async siPermis(force: boolean) {
      const notres = !!base && !!ctx.sale?.() && modifs() - base.c === base.nos;
      if (!ctx.enregistrer || refuse || !notres || (!force && maintenant() - dernier < INTERVALLE_ENREGISTREMENT_MS)) return;
      dernier = maintenant();
      if (await ctx.enregistrer().catch(() => false)) base = { c: modifs(), nos: 0 };
      else refuse = true;
    },
  };
}

export interface ToitsFond {
  /** Lance la lecture si des batiments restent a lire ; sans effet si elle tourne deja. */
  relancer: () => void;
  /** Met la lecture en pause ; `relancer` la reprend. */
  arreter: () => void;
  enCours: () => boolean;
}

export function creerToitsFond(ctx: ContexteToitsFond): ToitsFond {
  const lire = ctx.lire ?? toitsDepuisLidar;
  const lireCouleurs = ctx.lireCouleurs ?? couleursToitsDepuisOrtho;
  // Le secteur n'a pas de dalle LiDAR : pour cette seance, seules les couleurs se lisent encore.
  let lidar = true;
  const pause = ctx.pause ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const attendre = ctx.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Une generation par lancement : un arret, ou un autre plan ouvert, rend caduque la boucle en cours.
  let generation = 0;
  let enCours = false;
  // Les batiments que le service a refuses, et combien de fois, pour cette seance.
  const refus = new Map<string, number>();
  const aTenter = (objets: ObjetPlan[]) => batimentsALire(objets, lidar).restants.filter((o) => (refus.get(o.key) ?? 0) < ECHECS_PAR_BATIMENT);

  // Ce que cette lecture a fait, batiment apres batiment, pour le bilan de fin.
  let cumul: BilanFond = vide();
  const enregistreur = creerEnregistreur(ctx);
  // Les murs, apres les toits : les batiments refuses, et le service de photos qui s'est tu, pour cette seance.
  const refusMurs = new Map<string, number>();
  let mursMuets = false, phaseMurs = false;
  const mursATenter = (objets: ObjetPlan[]) => (ctx.murs ?? LECTURE_MURS_EN_FOND) && !mursMuets && objets.some((o) => mursALire(o) && (refusMurs.get(o.key) ?? 0) < ECHECS_MURS_PAR_BATIMENT);

  const dire = (etat: ProgressionToits['etat']) => ctx.progression(progressionDe(ctx.objets(), etat, lidar, phaseMurs));
  /** Des batiments lus viennent d'etre ecrits : les redessiner, et enregistrer si c'est le moment. */
  // Pendant un geste, l'enregistrement seul attendra le paquet suivant : il ne coupe pas le geste.
  const annoncer = async (ecrits: string[]) => { enregistreur.noter(() => ctx.apresLot(ecrits)); if (!ctx.regulateur?.r.occupe()) await enregistreur.siPermis(false); };
  let debrancher: (() => void) | null = null; // la sonde et les ecouteurs du regulateur, le temps d'une lecture
  const finDeLecture = () => { debrancher?.(); debrancher = null; };

  /** Ecrit dans le plan ce qui a ete lu depuis le dernier dessin, le redessine, l'enregistre au besoin. */
  let tampon: Lu[] = [];
  async function vider(): Promise<void> {
    const lot = tampon;
    tampon = [];
    // Le plan a pu changer pendant la lecture (annulation, autre plan) : on ecrit dans celui d'aujourd'hui.
    const courants = ctx.objets();
    const ecrits = lot.filter((l) => reporter(courants, l.copie, l.avant)).map((l) => l.copie.key);
    if (lot.length) dire('enCours');
    if (ecrits.length) await annoncer(ecrits);
  }

  /**
   * Une passe sur ce qui reste a lire : PARALLELE_TOITS_FOND lecteurs prennent les batiments dans
   * l'ordre, chacun le suivant des qu'il a fini. Un batiment lu sans etre ecrit (modifie entre-temps)
   * reste a lire : la passe suivante le reprend. Rend vrai si une suite de batiments muets l'a arretee.
   */
  async function passe(g: number, objets: ObjetPlan[], proj: ProjecteurLocal, restants: ObjetPlan[]): Promise<boolean> {
    // Une seule fois par passe : les mitoyens (sur tout le plan) et les dalles LiDAR (sur tout ce qui reste).
    const mitoyens = clesMitoyens(objets as ObjetAToit[]);
    let dallesLues: Promise<boolean> | null = null;
    const dalles = (_pts: readonly PtBrut[], p: ProjecteurLocal) =>
      (dallesLues ??= (ctx.dalles ?? dallesLidarSur)(restants.flatMap((o) => ((o as ObjetAToit).pts ?? []) as PtBrut[]), p));
    const muets = suiteMuette(attendre);

    const prochain = fileDeLecture(restants.map((o) => o.key), ctx.objets, (o) => resteALire(o, lidar) && (refus.get(o.key) ?? 0) < ECHECS_PAR_BATIMENT);

    const ouvrier = async (rang: number): Promise<void> => {
      for (;;) {
        await muets.attente();
        if (ctx.regulateur) await ctx.regulateur.r.tour(rang);
        if (g !== generation || muets.arret()) return;
        const t = prochain();
        if (!t) return;
        if (!ctx.regulateur) await pause();
        if (g !== generation) return;
        const { copie } = t;
        // La copie d'un batiment verifie se lit comme les autres (`relire`) : c'est le plan qu'on ne touche pas.
        const r = await lireUnBatiment(copie, lidar, (c) => lire(objets as ObjetAToit[], proj, { candidats: [c], delaiMs: Number.POSITIVE_INFINITY, enParallele: 1, dalles, mitoyens, verifies: 'relire' }),
          (c) => lireCouleurs([c], proj, Number.POSITIVE_INFINITY, 1));
        if (g !== generation) return;
        // Pas de dalle sur le secteur : pour cette seance, seules les couleurs se lisent encore.
        if (r.bilan?.sansLidar) lidar = false;
        // Un batiment dont rien de ce qui manquait n'a pu se lire compte un refus.
        const avance = r.forme || r.couleur;
        if (!avance) refus.set(copie.key, (refus.get(copie.key) ?? 0) + 1);
        ajouter(cumul, t.reference ? null : r.bilan, r.forme && !t.reference ? 1 : 0, r.couleurs, t.reference && r.forme ? lectureDAccord(t.reference, copie) : undefined);
        tampon.push(t);
        if (!muets.noter(avance)) return;
        if (tampon.length >= LOT_TOITS_FOND) await vider();
      }
    };
    await Promise.all(Array.from({ length: PARALLELE_TOITS_FOND }, (_, rang) => ouvrier(rang)));
    if (g !== generation) return false;
    await vider();
    return muets.arret();
  }

  async function boucle(g: number): Promise<void> {
    while (g === generation) {
      const objets = ctx.objets();
      const proj = projecteurDuProjet(objets);
      const restants = aTenter(objets);
      if (proj && !restants.length && mursATenter(objets)) {
        // Les toits sont lus : les murs, zone par zone. Une passe qui n'ecrit rien ne se repete pas.
        phaseMurs = true;
        dire('enCours');
        const r = await (ctx.lireMurs ?? lireMursEnFond)({ objets: ctx.objets, proj, vivant: () => g === generation, ecrire: annoncer, avance: () => dire('enCours'), refus: refusMurs, pause });
        if (g !== generation) return;
        cumul.murs = (cumul.murs ?? 0) + r.photos;
        if (r.arret || !r.ecrits) mursMuets = true;
        continue;
      }
      if (!proj || !restants.length) {
        enCours = false;
        // Sans LiDAR, la forme des toits n'a pas ete lue ; sans photos de rue, les murs non plus : « arretee ».
        phaseMurs = (ctx.murs ?? LECTURE_MURS_EN_FOND) && mursMuets && !!proj && objets.some(mursALire);
        dire(lidar && !phaseMurs ? 'finie' : 'arretee');
        finDeLecture();
        if (cumul.lus || cumul.couleurs || cumul.murs || cumul.verifies) {
          const b = cumul; cumul = vide(); ctx.fin?.(b);
          // Le dernier enregistrement seul attend que l'utilisateur lache la souris (dix secondes au plus).
          await ctx.regulateur?.r.calme(10000);
          await enregistreur.siPermis(true);
        }
        return;
      }
      phaseMurs = false;
      const arret = await passe(g, objets, proj, restants);
      if (g !== generation) return;
      if (arret) { enCours = false; finDeLecture(); dire('arretee'); return; }
    }
  }

  return {
    relancer() {
      if (enCours || ctx.lectureSeule()) return;
      // « Reprendre » redonne sa chance au service de photos.
      mursMuets = false;
      if ((!aTenter(ctx.objets()).length && !mursATenter(ctx.objets())) || !projecteurDuProjet(ctx.objets())) { phaseMurs = false; dire('finie'); return; }
      enCours = true;
      cumul = vide();
      enregistreur.repartir();
      finDeLecture();
      debrancher = ctx.regulateur?.brancher() ?? null;
      const g = ++generation;
      // Ce qu'une lecture arretee avait lu sans l'ecrire est perime : elle repart de ce qui reste.
      tampon = [];
      dire('enCours');
      void boucle(g);
    },
    arreter() {
      if (!enCours) return;
      generation++;
      enCours = false;
      finDeLecture();
      dire('pause');
    },
    enCours: () => enCours,
  };
}
