// La triangulation d'un polygone simple, par oreilles (MD/spec-ouvrages.md, etape 6.6).
//
// De la geometrie, partagee par les pans de toit (facade/toits/toit.ts), le releve et le toit mesure en 3D, et la cloture 3D (le
// muret, le portail) : elle vivait dans facade/toits/toit.ts, et la cloture la lisait chez le bati. Deplacee sans retouche.

import { au } from '../util/tableaux.js';
import { sommetDe } from './anneau.js';
import { signedArea } from './basic.js';
import type { PtBrut } from '../model/types.js';

/** Triangulation par oreilles d'un polygone simple ; renvoie des triplets d'indices. */
export function trianguler(poly: readonly PtBrut[]): [number, number, number][] {
  const n = poly.length;
  if (n < 3) return [];
  const idx = poly.map((_, i) => i);
  if (signedArea(poly) < 0) idx.reverse();
  const croix = (a: PtBrut, b: PtBrut, c: PtBrut) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const dedans = (p: PtBrut, a: PtBrut, b: PtBrut, c: PtBrut) => croix(a, b, p) >= -1e-12 && croix(b, c, p) >= -1e-12 && croix(c, a, p) >= -1e-12;
  const res: [number, number, number][] = [];
  let garde = 0;
  while (idx.length > 3 && garde++ < 10000) {
    let coupe = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = sommetDe(idx, k - 1),
        i1 = au(idx, k),
        i2 = sommetDe(idx, k + 1);
      const a = au(poly, i0),
        b = au(poly, i1),
        c = au(poly, i2);
      if (croix(a, b, c) <= 1e-12) continue;
      let vide = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (dedans(au(poly, j), a, b, c)) {
          vide = false;
          break;
        }
      }
      if (!vide) continue;
      res.push([i0, i1, i2]);
      idx.splice(k, 1);
      coupe = true;
      break;
    }
    // Polygone degenere (points alignes, sommet double) : on retire le sommet le plus plat plutot que
    // de boucler. Retirer le premier venu amputait le pan d'un triangle entier (les croupes d'AE 103).
    if (!coupe) {
      let plat = 0, min = Infinity;
      idx.forEach((_, k) => {
        const v = Math.abs(croix(au(poly, sommetDe(idx, k - 1)), au(poly, au(idx, k)), au(poly, sommetDe(idx, k + 1))));
        if (v < min) { min = v; plat = k; }
      });
      idx.splice(plat, 1);
    }
  }
  if (idx.length === 3) res.push([au(idx, 0), au(idx, 1), au(idx, 2)]);
  return res;
}
