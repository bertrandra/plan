// Le calque du plan : ce que couvrent le sol de la Vue 3D et l'orthophoto, en 2D comme en 3D.
//
// Une seule emprise pour les deux vues : celle des parcelles affichees (la parcelle du projet et
// son voisinage visible), plus `MARGE_CALQUE_M` de chaque cote. Le sol 3D en fait ses bornes ; la
// photo aerienne est lue pour couvrir le calque de toutes les parcelles, puis coupee a celui des
// parcelles affichees.

import { estTerrain } from './fonctions.js';
import { aDesSommets } from './formes.js';
import type { Emprise } from './relief.js';
import type { ObjetPlan } from './types.js';

/** La marge du calque autour des parcelles, en metres. */
export const MARGE_CALQUE_M = 10;

/** L'emprise des parcelles non masquees, plus la marge ; `null` sans parcelle (plan dessine a la main). */
export function empriseDuCalque(objets: readonly ObjetPlan[], masque: (o: ObjetPlan) => boolean = () => false): Emprise | null {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const o of objets) {
    if (!estTerrain(o) || !aDesSommets(o) || masque(o)) continue;
    for (const p of o.pts) {
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    }
  }
  if (!Number.isFinite(xMin)) return null;
  return { xMin: xMin - MARGE_CALQUE_M, xMax: xMax + MARGE_CALQUE_M, yMin: yMin - MARGE_CALQUE_M, yMax: yMax + MARGE_CALQUE_M };
}

/** Ce que deux emprises ont en commun, ou `null` si elles ne se touchent pas. */
export function intersectionEmprises(a: Emprise, b: Emprise): Emprise | null {
  const r = { xMin: Math.max(a.xMin, b.xMin), xMax: Math.min(a.xMax, b.xMax), yMin: Math.max(a.yMin, b.yMin), yMax: Math.min(a.yMax, b.yMax) };
  return r.xMin < r.xMax && r.yMin < r.yMax ? r : null;
}

/** `a` contient-elle `b` en entier (a un centimetre pres) ? */
export function contientEmprise(a: Emprise, b: Emprise): boolean {
  const e = 0.01;
  return a.xMin <= b.xMin + e && a.xMax >= b.xMax - e && a.yMin <= b.yMin + e && a.yMax >= b.yMax - e;
}
