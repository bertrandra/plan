// Un cote d'un volume est-il une facade du batiment ?
//
// Un batiment en plusieurs corps (model/volumesToit.ts, facade/toitCorps.ts) a des murs communs :
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
