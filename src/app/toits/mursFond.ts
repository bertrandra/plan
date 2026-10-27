// La couleur des murs du voisinage lue en tache de fond sur les photos de rue Panoramax
// (MD/roadmap-toits-fond.md, MD/spec-toit-ign.md §6.5).
//
// A l'import, seuls les murs des 150 batiments les plus proches sont lus, en 20 s au plus
// (render/couleurMurPhoto.ts::couleursMursDepuisPhotos). Les autres le sont ici, apres les toits
// (app/toits/toitsFond.ts : l'egout lu sur le LiDAR place mieux les points du mur sur la photo), sans
// limite de distance au projet : le voisinage est decoupe en zones de COTE_ZONE_MURS_M, lues de la
// plus proche a la plus loin ; les photos d'une zone se cherchent d'un coup, autour d'elle.
//
// Un batiment dont `couleurMurs.photo` est absent reste a lire. Lu, il porte la lecture, ou `null`
// quand aucune photo ne montre ses murs ou qu'aucune ne conclut, avec la version de la lecture
// (`couleurMurs.lecture`) : il n'est relu que si une regle meilleure passe VERSION_LECTURE_MURS. Un batiment dont
// une photo n'a pas pu se telecharger reste a lire ; refuse deux fois, il est laisse pour la seance.
// Seul `couleurMurs.photo` s'ecrit : la source choisie a la main reste.

import { couleursMursDUneZone, COTE_ZONE_MURS_M, DISTANCE_MUR_MAX_M, type IssueMurs } from '../../render/couleurMurPhoto.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { aDesSommets } from '../../model/formes.js';
import { centroid } from '../../geometry/basic.js';
import type { ProjecteurLocal } from '../../geo/projection.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';

/**
 * La lecture des murs en tache de fond est arretee (decision de l'utilisateur, octobre 2026) : sur les
 * photos Panoramax disponibles, elle ne concluait que pour quelques batiments (2 sur 31 au Vesinet,
 * 2 sur 9 a Rennes, garde-fous compris) pour des centaines de Mo telecharges. Elle reprend en passant
 * ceci a vrai, quand la lecture conclura plus souvent (MD/roadmap-toits-fond.md, etape 5) ; l'import
 * lit toujours les murs des 150 batiments les plus proches.
 */
export const LECTURE_MURS_EN_FOND = false;

/** Les photos d'une zone se telechargent autant a la fois : des images de 2 048 px, pas de petites grilles. */
export const PARALLELE_MURS_FOND = 4;
/** Une zone dont la recherche echoue d'affilee tant de fois arrete la lecture des murs pour la seance. */
export const ZONES_MUETTES_AVANT_ARRET = 5;
/** Un batiment dont une photo n'a pas pu se lire deux fois de suite est laisse pour cette seance. */
export const ECHECS_MURS_PAR_BATIMENT = 2;

type Batiment = ObjetPlan & { pts: PtBrut[] };
const estBatiment = (o: ObjetPlan): o is Batiment => o.fonction === 'batiment' && aDesSommets(o) && (o as Batiment).pts.length >= 3;

/**
 * La version de la lecture des murs. Une regle de lecture qui conclut plus souvent (model/couleurMur.ts,
 * render/couleurMurPhoto.ts) passe ce numero : les murs restes sans lecture concluante sont relus.
 * 2 : facade en partie cachee lue sur ce qui en reste, ciel et teintes froides ecartes.
 */
export const VERSION_LECTURE_MURS = 2;

/** La couleur des murs de ce batiment reste a lire sur les photos de rue : jamais lue, ou sans conclusion a une version plus ancienne. */
export const mursALire = (o: ObjetPlan): boolean => {
  if (!estBatiment(o)) return false;
  const c = o.batiment?.couleurMurs;
  return c?.photo === undefined || (c.photo === null && (c.lecture ?? 0) < VERSION_LECTURE_MURS);
};

/** Combien de batiments ont leurs murs lus, sur combien : la progression de la barre d'etat. */
export function avancementMurs(objets: readonly ObjetPlan[]): { faits: number; total: number } {
  let total = 0, restent = 0;
  for (const o of objets) if (estBatiment(o)) { total++; if (mursALire(o)) restent++; }
  return { faits: total - restent, total };
}

/** La boite d'un contour. */
const boite = (pts: readonly PtBrut[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
};

/**
 * Les zones a lire, de la plus proche du projet a la plus loin : les cles des batiments a lire,
 * rangees par case de COTE_ZONE_MURS_M selon leur centre.
 */
export function zonesDeMurs(objets: readonly ObjetPlan[], admis: (o: ObjetPlan) => boolean = () => true): string[][] {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const tous = objets.filter(estBatiment);
  const centre = parcelle && aDesSommets(parcelle) ? centroid(parcelle.pts) : tous.length ? centroid(tous.flatMap((o) => o.pts)) : { x: 0, y: 0 };
  const cases = new Map<string, { d: number; cles: string[] }>();
  for (const o of tous) {
    if (!mursALire(o) || !admis(o)) continue;
    const c = centroid(o.pts), i = Math.floor(c.x / COTE_ZONE_MURS_M), j = Math.floor(c.y / COTE_ZONE_MURS_M), k = i + ':' + j;
    const z = cases.get(k) ?? { d: Math.hypot((i + 0.5) * COTE_ZONE_MURS_M - centre.x, (j + 0.5) * COTE_ZONE_MURS_M - centre.y), cles: [] };
    z.cles.push(o.key);
    cases.set(k, z);
  }
  return [...cases.values()].sort((a, b) => a.d - b.d).map((z) => z.cles);
}

export interface ContexteMursFond {
  objets: () => ObjetPlan[];
  proj: ProjecteurLocal;
  /** Faux des que la lecture est arretee ou qu'un autre plan est ouvert : on s'arrete sans rien ecrire. */
  vivant: () => boolean;
  /** Des murs viennent d'etre ecrits (les cles des batiments) : redessiner, marquer a enregistrer. */
  ecrire: (cles: string[]) => Promise<void>;
  /** Une zone de plus est lue. */
  avance: () => void;
  /** Les refus de cette seance, par batiment. */
  refus: Map<string, number>;
  lireZone?: typeof couleursMursDUneZone;
  pause?: () => Promise<void>;
}

/**
 * Une passe sur les murs qui restent a lire, zone par zone. Rend le nombre de murs lus sur une photo,
 * celui des batiments ecrits (lus, ou sans photo concluante), et vrai dans `arret` quand le service
 * s'est tu (ZONES_MUETTES_AVANT_ARRET zones d'affilee).
 */
export async function lireMursEnFond(ctx: ContexteMursFond): Promise<{ photos: number; ecrits: number; arret: boolean }> {
  const lireZone = ctx.lireZone ?? couleursMursDUneZone;
  const admis = (o: ObjetPlan) => (ctx.refus.get(o.key) ?? 0) < ECHECS_MURS_PAR_BATIMENT;
  let photos = 0, muettes = 0, total = 0;
  for (const cles of zonesDeMurs(ctx.objets(), admis)) {
    if (ctx.pause) await ctx.pause();
    if (!ctx.vivant()) return { photos, ecrits: total, arret: false };
    const objets = ctx.objets();
    const parCle = new Map(objets.map((o) => [o.key, o]));
    const cibles = cles.map((k) => parCle.get(k)).filter((o): o is Batiment => !!o && mursALire(o) && admis(o));
    if (!cibles.length) continue;
    // Ce qui peut cacher un mur ou porter une cloture : les batiments et les parcelles a portee de photo.
    const b = boite(cibles.flatMap((o) => o.pts)), m = DISTANCE_MUR_MAX_M;
    const proche = (o: ObjetPlan) => { if (!aDesSommets(o)) return false; const c = boite(o.pts); return c.x1 >= b.x0 - m && c.x0 <= b.x1 + m && c.y1 >= b.y0 - m && c.y0 <= b.y1 + m; };
    const avant = new Map(cibles.map((o) => [o.key, JSON.stringify(o.pts)]));
    // Des copies de ce que la lecture regarde : rien du plan n'est touche avant le retour.
    const copie = (o: ObjetPlan) => ({ key: o.key, fonction: 'batiment', pts: (o as Batiment).pts.map((p) => ({ x: p.x, y: p.y })), ...(typeof o.elevation === 'number' ? { elevation: o.elevation } : {}) });
    const issues: IssueMurs[] = await lireZone(cibles.map(copie), objets.filter((o) => estBatiment(o) && proche(o)).map(copie),
      objets.filter((o) => (o.key === 'parcelle' || o.fonction === 'terrain') && proche(o)), ctx.proj, { enParallele: PARALLELE_MURS_FOND }).catch(() => cibles.map((o) => ({ cle: o.key, echec: true as const })));
    if (!ctx.vivant()) return { photos, ecrits: total, arret: false };
    // Le plan a pu changer pendant la lecture : on ecrit dans celui d'aujourd'hui, sur un contour inchange.
    const courants = new Map(ctx.objets().map((o) => [o.key, o]));
    const ecrits: string[] = [];
    for (const r of issues) {
      if ('echec' in r) { ctx.refus.set(r.cle, (ctx.refus.get(r.cle) ?? 0) + 1); continue; }
      const o = courants.get(r.cle);
      if (!o || !estBatiment(o) || JSON.stringify(o.pts) !== avant.get(r.cle) || !mursALire(o)) continue;
      const reste = { ...(o.batiment?.couleurMurs ?? {}) };
      delete reste.lecture;
      champsBatiment(o).couleurMurs = r.photo ? { ...reste, photo: r.photo } : { ...reste, photo: null, lecture: VERSION_LECTURE_MURS };
      if (r.photo) photos++;
      ecrits.push(r.cle);
    }
    muettes = issues.length && issues.every((r) => 'echec' in r) ? muettes + 1 : 0;
    total += ecrits.length;
    if (ecrits.length) await ctx.ecrire(ecrits);
    ctx.avance();
    if (muettes >= ZONES_MUETTES_AVANT_ARRET) return { photos, ecrits: total, arret: true };
  }
  return { photos, ecrits: total, arret: false };
}
