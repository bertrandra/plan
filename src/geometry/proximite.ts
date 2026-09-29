// Distances entre contours (spec §3.2, geometry/).
//
// Trois mesures qui servent a decider ce qui est « a cote » : quelle parcelle est la plus proche
// d'une adresse, quelles parcelles sont mitoyennes, et sur quelle longueur elles le sont.
//
// Aucune n'est publiee sur un plan : ce sont des criteres de classement. C'est ce qui autorise
// l'echantillonnage de `longueurFrontiere` — une vraie intersection de segments serait plus juste
// et n'y changerait rien.

import { au } from '../util/tableaux.js';
import { distancePointSegment } from './segments.js';
import type { PtBrut } from '../model/types.js';

/** Distance d'un point au contour le plus proche du polygone (au bord, pas au centre). */
export function distancePointContour(p: PtBrut, pts: readonly PtBrut[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distancePointSegment(p, au(pts, i), au(pts, (i + 1) % pts.length)));
  return d;
}

/**
 * Distance minimale entre deux contours.
 *
 * Teste les sommets de A contre B **et** ceux de B contre A : sur deux formes tres inegales, les
 * sommets de la petite peuvent tous etre loin des sommets de la grande tout en frolant un de ses
 * cotes.
 */
export function distanceContours(A: readonly PtBrut[], B: readonly PtBrut[]): number {
  let d = Infinity;
  for (let i = 0; i < A.length; i++) d = Math.min(d, distancePointContour(au(A, i), B));
  for (let i = 0; i < B.length; i++) d = Math.min(d, distancePointContour(au(B, i), A));
  return d;
}

/**
 * Longueur de limite commune entre deux contours, par echantillonnage des cotes de A.
 *
 * Chaque cote est echantillonne tous les 50 cm environ (2 points minimum, 60 au plus), et la
 * fraction des echantillons qui tombent a moins de `tol` de B donne la part du cote consideree
 * comme mitoyenne. C'est un critere de classement des voisines : celle avec qui on partage le plus
 * de limite passe en tete.
 */
export function longueurFrontiere(A: readonly PtBrut[], B: readonly PtBrut[], tol: number): number {
  let total = 0;
  for (let i = 0; i < A.length; i++) {
    const a = au(A, i), b = au(A, (i + 1) % A.length);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const n = Math.max(2, Math.min(60, Math.ceil(len / 0.5)));
    let touchants = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (distancePointContour({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, B) < tol) touchants++;
    }
    total += len * touchants / (n + 1);
  }
  return total;
}
