// Les facades d'un batiment pour le mode Toit : un cote de corps, ou, sans corps, un cote du contour.
//
// Une facade est un mur (`pts[mur] -> pts[mur + 1]`) d'un corps du toit (`rang`), ou, quand le batiment n'a pas de
// corps, du contour du plan (`rang` nul). Le mode Toit en choisit une d'un toucher dans la Vue 3D (le mur le plus proche
// du point touche) et cadre la camera devant elle, quel que soit l'angle du mur.
//
// Pur : pas de DOM, pas de scene.

import { nomOrientation } from '../../geometrie.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

export interface FacadeVisee {
  /** Le rang du corps dans `corpsToit` ; null : un cote du contour du batiment sans corps. */
  rang: number | null;
  mur: number;
  a: PtBrut;
  b: PtBrut;
  /** La normale unitaire qui sort du batiment, dans le plan. */
  n: PtBrut;
  /** La longueur du mur, en metres. */
  L: number;
}

const un = (v: number, i: number) => v || i;

/** Les murs d'un polygone, normale sortante par rapport a son centre (assez pour un rectangle ou un contour presque convexe). */
function mursDe(pts: readonly PtBrut[], rang: number | null): FacadeVisee[] {
  const n = pts.length;
  if (n < 3) return [];
  const cx = pts.reduce((t, q) => t + q.x, 0) / n, cy = pts.reduce((t, q) => t + q.y, 0) / n;
  const murs: FacadeVisee[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i] as PtBrut, b = pts[(i + 1) % n] as PtBrut;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.1) continue;
    let nx = (b.y - a.y) / L, ny = -(b.x - a.x) / L;
    if ((((a.x + b.x) / 2) - cx) * nx + (((a.y + b.y) / 2) - cy) * ny < 0) { nx = -nx; ny = -ny; }
    murs.push({ rang, mur: i, a, b, n: { x: nx, y: ny }, L });
  }
  return murs;
}

/** Tous les murs du batiment, corps par corps ; sans corps, le contour. */
export function facadesDuBatiment(corps: readonly CorpsToit[] | null | undefined, contour: readonly PtBrut[]): FacadeVisee[] {
  if (corps?.length) return corps.flatMap((c, i) => mursDe(c.pts, i));
  return mursDe(contour, null);
}

/** Le mur le plus proche d'un point du plan. Null : aucun mur. */
export function facadeProche(facades: readonly FacadeVisee[], p: PtBrut): FacadeVisee | null {
  let meilleur: FacadeVisee | null = null, dmin = Infinity;
  for (const f of facades) {
    const vx = f.b.x - f.a.x, vy = f.b.y - f.a.y, l2 = un(vx * vx + vy * vy, 1);
    const t = Math.min(Math.max(((p.x - f.a.x) * vx + (p.y - f.a.y) * vy) / l2, 0), 1);
    const d = Math.hypot(p.x - (f.a.x + vx * t), p.y - (f.a.y + vy * t));
    if (d < dmin) { dmin = d; meilleur = f; }
  }
  return meilleur;
}

/** « Sud », « Nord-est »… : l'orientation d'une facade, comme `facadesDuContour`. */
export function orientationDe(f: FacadeVisee): string {
  return nomOrientation(((Math.atan2(f.n.x, f.n.y) * 180) / Math.PI + 360) % 360);
}
