// La ligne de vue entre deux points du plan, et les contours qui la coupent.
//
// Deux usages : la lecture de la couleur des murs sur les photos de rue (render/couleurMurPhoto.ts)
// et la facade devant laquelle on se tient pendant un audit (facade/priseDeVue.ts). Le calcul vit
// ici, sous les deux couches, pour qu'aucune n'ait a importer l'autre.

import type { PtBrut } from '../model/types.js';

/** Vrai quand les segments [p, q] et [a, b] se coupent (hors extremites communes). */
function seCoupent(p: PtBrut, q: PtBrut, a: PtBrut, b: PtBrut): boolean {
  const o = (u: PtBrut, v: PtBrut, w: PtBrut) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = o(a, b, p), d2 = o(a, b, q), d3 = o(p, q, a), d4 = o(p, q, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Un contour et son emprise, pour ecarter d'un coup ceux qui ne sont pas sur le chemin de la vue. */
export interface Obstacle { pts: readonly PtBrut[]; x0: number; y0: number; x1: number; y1: number }

export function obstacle(pts: readonly PtBrut[]): Obstacle {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { pts, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Vrai quand un contour coupe la vue de `cam` vers `cible` (un batiment devant le mur, ou le batiment lui-meme). */
export function vueCachee(cam: PtBrut, cible: PtBrut, obstacles: readonly Obstacle[]): boolean {
  const x0 = Math.min(cam.x, cible.x), x1 = Math.max(cam.x, cible.x), y0 = Math.min(cam.y, cible.y), y1 = Math.max(cam.y, cible.y);
  return obstacles.some((o) => o.x1 >= x0 && o.x0 <= x1 && o.y1 >= y0 && o.y0 <= y1
    && o.pts.some((a, i) => seCoupent(cam, cible, a, o.pts[(i + 1) % o.pts.length] as PtBrut)));
}
