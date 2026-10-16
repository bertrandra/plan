// La position de la prise, telle que l'audit de la parcelle s'en sert (MD/spec-audit.md §12.2).
//
// Le GPS d'un telephone, en banlieue pavillonnaire, se trompe de 5 a 15 m et saute d'un point a
// l'autre a chaque seconde (essai sur le terrain d'AE 101, 14 octobre : la vue sautait, et la
// reconnaissance proposait la maison d'a cote). Deux corrections, avant toute reconnaissance :
//
// 1. Le lissage : chaque position compte selon la precision annoncee, et l'estimation ne suit pas
//    plus vite qu'un marcheur (un filtre de Kalman sur chaque axe, a la vitesse VITESSE_MARCHE_MS).
//    Une position tres imprecise ne remplace pas une estimation deja meilleure.
// 2. Le recalage : on fait l'audit depuis la parcelle du projet ou depuis la rue, jamais depuis le
//    jardin d'un voisin. Un point qui tombe dans une parcelle voisine, a portee de l'erreur annoncee,
//    est ramene juste a l'interieur de la parcelle du projet. Dans la rue (aucune parcelle), il reste.
//
// Pur : position, precision et instant en entree, rien d'autre ; le repere est celui du plan.

import { pointInPolygon } from '../../../geometry/basic.js';
import { projectOntoSegment } from '../../../geometry/segments.js';
import { sommetDe } from '../../../geometry/anneau.js';
import { au } from '../../../util/tableaux.js';
import { aDesSommets } from '../../../model/formes.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';

/**
 * La vitesse qu'on prete au marcheur, departs et arrets compris : plus basse, le lissage efface mieux
 * les sauts du GPS mais traine derriere vous (1,5 m/s : 3 m de retard en marchant) ; a 3 m/s, il
 * divise les sauts par pres de deux et ne traine que d'un metre et demi.
 */
export const VITESSE_MARCHE_MS = 3;
/** Au-dela, une position ne remplace pas une estimation plus precise (un retour sous un arbre, un toit). */
export const PRECISION_IGNOREE_M = 30;
/** Le point ramene sur la parcelle est pose un peu a l'interieur : pas sur la limite meme. */
export const RECUL_DANS_PARCELLE_M = 0.5;
/** On ramene au moins de cela, meme si le GPS annonce mieux : la precision annoncee est optimiste. */
export const PORTEE_RECALAGE_MIN_M = 3;

export interface PositionEstimee { p: PtBrut; precisionM: number }

/** Le lissage des positions successives ; `oublier` repart de zero (l'ecran se ferme). */
export function filtrePosition() {
  let est: { p: PtBrut; variance: number; t: number } | null = null;
  return {
    /** Une position du GPS, a l'instant `t` (ms) : rend l'estimation lissee. */
    ajouter(p: PtBrut, precisionM: number, t: number): PositionEstimee {
      const r2 = Math.max(1, precisionM) ** 2;
      if (!est) { est = { p: { ...p }, variance: r2, t }; return { p: { ...p }, precisionM: Math.sqrt(r2) }; }
      const dt = Math.max(0, (t - est.t) / 1000);
      const prevue = est.variance + (VITESSE_MARCHE_MS * dt) ** 2;
      if (precisionM > PRECISION_IGNOREE_M && Math.sqrt(prevue) < precisionM) {
        est = { ...est, variance: prevue, t };
        return { p: { ...est.p }, precisionM: Math.sqrt(prevue) };
      }
      const k = prevue / (prevue + r2);
      est = { p: { x: est.p.x + k * (p.x - est.p.x), y: est.p.y + k * (p.y - est.p.y) }, variance: (1 - k) * prevue, t };
      return { p: { ...est.p }, precisionM: Math.sqrt(est.variance) };
    },
    oublier(): void { est = null; },
  };
}

/** Le point du contour le plus proche de `p`, et sa distance. */
function auPlusPres(p: PtBrut, pts: readonly PtBrut[]): { q: PtBrut; d: number } {
  let q = au(pts, 0), d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const r = projectOntoSegment(p, au(pts, i), sommetDe(pts, i + 1));
    const e = Math.hypot(p.x - r.x, p.y - r.y);
    if (e < d) { d = e; q = r; }
  }
  return { q, d };
}

/**
 * La position ramenee sur la parcelle du projet quand elle tombe chez un voisin a portee de
 * l'erreur ; telle quelle sur la parcelle, dans la rue, ou trop loin pour que ce soit une erreur.
 */
export function surLaParcelle(objets: readonly ObjetPlan[], p: PtBrut, precisionM: number): PtBrut {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  if (!parcelle || !aDesSommets(parcelle) || pointInPolygon(p, parcelle.pts)) return p;
  const chezUnVoisin = objets.some((o) => o !== parcelle && o.fonction === 'terrain' && aDesSommets(o) && pointInPolygon(p, o.pts));
  if (!chezUnVoisin) return p;
  const { q, d } = auPlusPres(p, parcelle.pts);
  if (d > Math.max(precisionM, PORTEE_RECALAGE_MIN_M)) return p;
  // Un pas vers l'interieur, depuis le point de la limite, dans la direction qui y rentre.
  const ux = d > 1e-9 ? (q.x - p.x) / d : 0, uy = d > 1e-9 ? (q.y - p.y) / d : 0;
  const dedans = { x: q.x + ux * RECUL_DANS_PARCELLE_M, y: q.y + uy * RECUL_DANS_PARCELLE_M };
  return pointInPolygon(dedans, parcelle.pts) ? dedans : q;
}
