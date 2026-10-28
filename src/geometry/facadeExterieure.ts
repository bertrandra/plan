// Un cote d'un volume est-il une facade du batiment ?
//
// Un batiment en plusieurs corps (model/volumesToit.ts, facade/toits/toitCorps.ts) a des murs communs :
// un corps contre un autre. Un debord de toit, une gouttiere n'ont de sens que sur une facade ; pose
// sur un mur commun, le debord traverse le mur voisin et ressort de l'autre cote. Devant une facade,
// a quelques decimetres, on est dehors : hors du contour du batiment, sur toute sa longueur.

import { pointInPolygon } from './basic.js';
import type { PtBrut } from '../model/types.js';

/** La distance devant le mur ou l'on regarde, en metres. */
export const DEVANT_FACADE_M = 0.4;

/**
 * Le segment `a -> b` d'un volume dont `dedans` est un point interieur est-il une facade du
 * `contour` ? Six points le long du segment, pousses de DEVANT_FACADE_M vers l'exterieur du volume,
 * doivent tous etre hors du contour.
 */
export function segmentEnFacade(a: PtBrut, b: PtBrut, dedans: PtBrut, contour: readonly PtBrut[], devant = DEVANT_FACADE_M): boolean {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return false;
  let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  // La normale vers l'exterieur du volume : du cote oppose a son interieur.
  if ((dedans.x - a.x) * nx + (dedans.y - a.y) * ny > 0) { nx = -nx; ny = -ny; }
  const n = 6;
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n;
    if (pointInPolygon({ x: a.x + (b.x - a.x) * f + nx * devant, y: a.y + (b.y - a.y) * f + ny * devant }, contour)) return false;
  }
  return true;
}

/**
 * L'ecart admis entre un cote d'un volume et le cote du contour qu'il double, en metres : un corps lu
 * au LiDAR est un rectangle remis a l'equerre, ses murs ne tombent pas au centimetre sur le contour.
 */
export const ECART_SUR_LE_CONTOUR_M = 0.6;
/** Au plus cet angle entre les deux cotes, en degres. */
const ANGLE_SUR_LE_CONTOUR_DEG = 10;

/**
 * Les cotes d'un volume (`pts[i] -> pts[i + 1]`) qui doublent l'un des `cotes` du `contour` : paralleles
 * a lui, a moins de ECART_SUR_LE_CONTOUR_M, et couverts par lui sur au moins la moitie de leur longueur.
 * Un mur se designe par son cote du contour (releves de facade) ; un corps a ses propres murs : c'est
 * ce qui fait passer de l'un a l'autre.
 */
export function cotesSurLesCotes(pts: readonly PtBrut[], contour: readonly PtBrut[], cotes: readonly number[]): number[] {
  const n = contour.length;
  const segments = cotes.filter((j) => j >= 0 && j < n).map((j) => [contour[j] as PtBrut, contour[(j + 1) % n] as PtBrut] as const);
  const sinMax = Math.sin((ANGLE_SUR_LE_CONTOUR_DEG * Math.PI) / 180);
  return pts.map((_, i) => i).filter((i) => {
    const a = pts[i] as PtBrut, b = pts[(i + 1) % pts.length] as PtBrut;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) return false;
    return segments.some(([p, q]) => {
      const M = Math.hypot(q.x - p.x, q.y - p.y);
      if (M < 1e-6) return false;
      const ux = (q.x - p.x) / M, uy = (q.y - p.y) / M;
      if (Math.abs(((b.x - a.x) * uy - (b.y - a.y) * ux) / L) > sinMax) return false;
      const ecart = (r: PtBrut) => Math.abs((r.x - p.x) * uy - (r.y - p.y) * ux);
      if (ecart(a) > ECART_SUR_LE_CONTOUR_M || ecart(b) > ECART_SUR_LE_CONTOUR_M) return false;
      const ta = (a.x - p.x) * ux + (a.y - p.y) * uy, tb = (b.x - p.x) * ux + (b.y - p.y) * uy;
      const recouvrement = Math.min(M, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
      return recouvrement >= L / 2;
    });
  });
}
