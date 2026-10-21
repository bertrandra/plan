// Le gabarit du mur : la silhouette de la facade que donnent le plan et le LiDAR (la largeur du cadastre, l'egout et le pignon des corps
// du toit), une forme fixe. Il ne se lit pas sur la photo et ne s'y deforme jamais : il se pose sur l'image redressee, et seuls ses bouts,
// son egout et son sol s'y calent (facade/mosaiqueFuites.ts::affinerEgoutEtSol, zones/releve/AjusterMur.tsx). Les reperes ne disent
// que les directions ; la dimension vient de ce calage (decision de l'utilisateur, 21 octobre 2026). Sans corps, un rectangle.

import { homographie, appliquer, type P2 } from './homographie.js';
import { hautDuMurSousCorps } from './regles/toits/silhouetteDesCorps.js';
import type { Facade } from './geometrie.js';
import type { CorpsToit } from '../model/types.js';

/**
 * Le haut du mur, de l'angle gauche a l'angle droit : `u` de 0 a 1 le long du mur, `v` la hauteur en part de celle de l'egout (1 a
 * l'egout, 0 au sol). L'egout est le plus bas des deux angles (sous une rampe, c'est le bas).
 */
export type GabaritMur = readonly { u: number; v: number }[];

/** Le gabarit d'un mur sans corps lu : un rectangle, le haut a l'egout. */
export const GABARIT_RECTANGLE: GabaritMur = Object.freeze([{ u: 0, v: 1 }, { u: 1, v: 1 }]);

/** Au-dessous de cette montee au-dessus de l'egout (part de sa hauteur), le gabarit est un rectangle : rien a caler sur le profil. */
const RELIEF_GABARIT = 0.03;

/** Le gabarit d'un mur sous les corps du toit (le LiDAR) : le haut du mur lu le long de sa face ; un rectangle sans corps. */
export function gabaritDesCorps(f: Facade, corps: readonly CorpsToit[] | null | undefined, hauteurMur: number): GabaritMur {
  if (!corps?.length || !(f.largeur > 0) || !(hauteurMur > 0)) return GABARIT_RECTANGLE;
  const haut = hautDuMurSousCorps(f, corps, hauteurMur);
  return gabaritDuHaut(haut.map((p) => ({ x: p.x / f.largeur, y: p.y })));
}

/** Le gabarit d'un haut de mur donne en parts de la largeur (`x`) et en metres (`y`, au-dessus du sol). */
export function gabaritDuHaut(haut: readonly P2[]): GabaritMur {
  const pts = [...haut].sort((a, b) => a.x - b.x);
  const a = pts[0], b = pts[pts.length - 1];
  if (!a || !b || pts.length < 2) return GABARIT_RECTANGLE;
  const egout = Math.min(a.y, b.y);
  if (!(egout > 0)) return GABARIT_RECTANGLE;
  const g = pts.map((p) => ({ u: Math.min(1, Math.max(0, p.x)), v: p.y / egout }));
  return relief(g) < RELIEF_GABARIT ? GABARIT_RECTANGLE : g;
}

/** La montee du gabarit au-dessus de l'egout, en part de sa hauteur. */
export function relief(g: GabaritMur): number {
  return Math.max(0, ...g.map((p) => p.v - 1));
}

/** La hauteur du gabarit en `u`, en part de celle de l'egout (interpolee entre ses sommets). */
export function hauteurEn(g: GabaritMur, u: number): number {
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i] as { u: number; v: number }, b = g[i + 1] as { u: number; v: number };
    if (u >= a.u && u <= b.u) return b.u > a.u ? a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u) : Math.max(a.v, b.v);
  }
  return u < (g[0]?.u ?? 0) ? (g[0]?.v ?? 1) : (g[g.length - 1]?.v ?? 1);
}

/** Le gabarit pose sur une vue de face entre ses bouts (`x0`, `x1`), son egout (`y0`) et son sol (`y1`), en pixels de la vue. */
export function gabaritSurLaVue(g: GabaritMur, r: { x0: number; x1: number; y0: number; y1: number }): P2[] {
  return g.map((p) => ({ x: r.x0 + p.u * (r.x1 - r.x0), y: r.y1 - p.v * (r.y1 - r.y0) }));
}

/**
 * Le gabarit pose sur une photo par les coins du mur (haut gauche, haut droit, bas droit, bas gauche : l'egout et le sol) : le rectangle
 * du mur ramene sur la photo par leur homographie. Null quand les coins ne forment pas un quadrilatere.
 */
export function gabaritSurLaPhoto(g: GabaritMur, coins: readonly P2[]): P2[] | null {
  if (coins.length !== 4) return null;
  const versPhoto = homographie([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }], coins);
  return versPhoto ? g.map((p) => { const q = appliquer(versPhoto, { x: p.u, y: p.v }); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }; }) : null;
}

/** Relit un gabarit enregistre (un cas de calibration, une correction) ; null s'il n'en est pas un. */
export function lireGabarit(brut: unknown): GabaritMur | null {
  if (!Array.isArray(brut) || brut.length < 2) return null;
  const g = brut.map((p) => (p && typeof p === 'object' ? { u: Number((p as { u?: unknown }).u), v: Number((p as { v?: unknown }).v) } : null));
  return g.every((p) => p && Number.isFinite(p.u) && Number.isFinite(p.v) && p.u >= 0 && p.u <= 1 && p.v > 0) ? (g as { u: number; v: number }[]) : null;
}
