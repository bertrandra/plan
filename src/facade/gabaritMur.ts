// Le gabarit du mur : la silhouette de toute la facade que donnent le plan et le LiDAR, une forme fixe. C'est la silhouette que trace
// le mode Toit en 3D, corps par corps, projetee sur le plan du mur et vue de face (facade/regles/toits/silhouetteDesCorps.ts::
// silhouetteDeFace ; demande du proprietaire, 28 octobre 2026). Il ne se lit pas sur la photo et ne s'y deforme jamais : il se pose
// sur l'image redressee une fois le mur cale (facade/releve/calageAncres.ts, sans lui : il vient du toit, que la photo met en question),
// et seuls ses bouts, son egout et son sol s'y calent (zones/releve/AjusterMur.tsx a la main). Les reperes ne disent que les
// directions ; la dimension vient de ce calage (decision de l'utilisateur, 21 octobre 2026). Sans corps, un rectangle.

import { homographie, appliquer, type P2 } from './vision/homographie.js';
import { silhouetteDeFace } from './regles/toits/silhouetteDesCorps.js';
import type { Facade } from '../geometry/cotesVusDeDehors.js';
import type { CorpsToit } from '../model/types.js';
import { simplifierLigne } from '../geometry/simplifierLigne.js';

/**
 * Le haut de la facade, de gauche a droite (vu de dehors) : `u` le long du mur, 0 et 1 a ses angles (le cote du contour), en deca
 * ou au-dela quand le mur d'un corps continue la facade (le pignon d'une maison en L au-dessus de l'aile) ; `v` la hauteur en part
 * de celle du mur (1 a l'egout que pose la chaine, 0 au sol). Un corps plus bas descend sous 1, un pignon monte au-dessus.
 */
export type GabaritMur = readonly { u: number; v: number }[];

/** Le gabarit d'un mur sans corps lu : un rectangle, le haut a l'egout. */
export const GABARIT_RECTANGLE: GabaritMur = Object.freeze([{ u: 0, v: 1 }, { u: 1, v: 1 }]);

/** Un haut qui ne s'ecarte pas de l'egout de plus que cette part de la hauteur du mur est un rectangle. */
const RELIEF_GABARIT = 0.03;
/** La ligne du haut garde ses sommets a 2 cm pres (Douglas-Peucker, en metres). */
const TOLERANCE_M = 0.02;
/** Un gabarit relu ne s'etend pas au-dela de tant de fois la largeur de son mur, de chaque cote. */
const DEBORD_MAX = 4;

/**
 * Le gabarit d'un mur sous les corps du toit (le LiDAR) : la silhouette de la facade vue de face (silhouetteDeFace, celle du mode
 * Toit), en part de `hauteurMur`, la hauteur du mur que pose la chaine (le rectangle egout -> sol). La ou aucun corps n'est derriere,
 * l'egout. Un rectangle sans corps, ou quand le haut ne s'ecarte pas de l'egout.
 */
export function gabaritDesCorps(f: Facade, corps: readonly CorpsToit[] | null | undefined, hauteurMur: number): GabaritMur {
  if (!corps?.length || !(f.largeur > 0) || !(hauteurMur > 0)) return GABARIT_RECTANGLE;
  const { haut } = silhouetteDeFace(f, corps);
  const ligne = simplifierLigne(haut.map((p) => ({ x: p.x, y: p.y ?? hauteurMur })), TOLERANCE_M);
  const g: { u: number; v: number }[] = [];
  for (const p of ligne) {
    const q = { u: p.x / f.largeur, v: p.y / hauteurMur };
    const m = g[g.length - 2], l = g[g.length - 1];
    if (m && l && Math.abs((l.u - m.u) * (q.v - m.v) - (l.v - m.v) * (q.u - m.u)) < 1e-6) g[g.length - 1] = q;
    else g.push(q);
  }
  return g.length < 2 || g.every((p) => Math.abs(p.v - 1) < RELIEF_GABARIT) ? GABARIT_RECTANGLE : g;
}

/**
 * Le gabarit d'un haut de mur donne en parts de la largeur (`x`) et en metres (`y`, au-dessus du sol), ramene a `reference` (la hauteur
 * du mur ; par defaut l'egout, le plus bas des deux angles). Trois points alignes n'en font qu'un.
 */
export function gabaritDuHaut(haut: readonly P2[], reference: number | null = null): GabaritMur {
  const pts = [...haut].sort((a, b) => a.x - b.x);
  const a = pts[0], b = pts[pts.length - 1];
  if (!a || !b || pts.length < 2) return GABARIT_RECTANGLE;
  const ref = reference ?? Math.min(a.y, b.y);
  if (!(ref > 0)) return GABARIT_RECTANGLE;
  const g: { u: number; v: number }[] = [];
  for (const p of pts) {
    const q = { u: Math.min(1, Math.max(0, p.x)), v: p.y / ref };
    const m = g[g.length - 2], l = g[g.length - 1];
    if (m && l && Math.abs((l.u - m.u) * (q.v - m.v) - (l.v - m.v) * (q.u - m.u)) < 1e-6) g[g.length - 1] = q;
    else g.push(q);
  }
  return g.every((p) => Math.abs(p.v - 1) < RELIEF_GABARIT) ? GABARIT_RECTANGLE : g;
}

/** L'ecart du gabarit a l'egout, en part de sa hauteur : un pignon qui monte comme un corps plus bas qui descend. */
export function relief(g: GabaritMur): number {
  return Math.max(0, ...g.map((p) => Math.abs(p.v - 1)));
}

/** Le contour ferme du mur sous son gabarit : le pied sous son premier point, le haut, le pied sous son dernier point. */
export function contourDuGabarit(g: GabaritMur): { u: number; v: number }[] {
  const a = g[0], b = g[g.length - 1];
  return a && b ? [{ u: a.u, v: 0 }, ...g, { u: b.u, v: 0 }] : [];
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
  return g.every((p) => p && Number.isFinite(p.u) && Number.isFinite(p.v) && p.u >= -DEBORD_MAX && p.u <= 1 + DEBORD_MAX && p.v > 0) ? (g as { u: number; v: number }[]) : null;
}
