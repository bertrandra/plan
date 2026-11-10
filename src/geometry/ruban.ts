// Le ruban d'un chemin : sa largeur reelle autour du trace, en coordonnees du plan. C'est de la
// geometrie, pas de la 3D : il vivait dans three/primitives.ts, qui le pose au sol, et y reste
// importe (le ruban plat, le ruban drape, l'empreinte du gazon).

import type { PtBrut } from '../model/types.js';
import { dist } from './basic.js';
import { sommetDe } from './anneau.js';
import { lineLineIntersect } from './segments.js';

// Un chemin est une largeur reelle, pas un trait : chaque bord est decale perpendiculairement au
// trace d'une demi-largeur. Aux sommets interieurs les deux bords adjacents sont mitres par
// intersection ; aux extremites, un seul segment voisin, un simple decalage suffit.
export function ribbonChemin(pts: PtBrut[], largeur: number): PtBrut[] | null {
  const n = pts.length;
  if (n < 2 || !(largeur > 0)) return null;
  const demi = largeur / 2;
  const segs = pts.slice(0, -1).map((a, i) => {
    const b = sommetDe(pts, i + 1);
    const ex = b.x - a.x, ey = b.y - a.y; const L = Math.hypot(ex, ey) || 1;
    return { ux: ex / L, uy: ey / L, nx: -ey / L, ny: ex / L };
  });
  const seg = (i: number) => sommetDe(segs, i);
  function bord(p: PtBrut, i: number, sens: number): PtBrut {
    if (i === 0) return { x: p.x + seg(0).nx * demi * sens, y: p.y + seg(0).ny * demi * sens };
    if (i === n - 1) return { x: p.x + seg(n - 2).nx * demi * sens, y: p.y + seg(n - 2).ny * demi * sens };
    const s1 = seg(i - 1), s2 = seg(i);
    const o1 = { x: p.x + s1.nx * demi * sens, y: p.y + s1.ny * demi * sens };
    const o2 = { x: p.x + s2.nx * demi * sens, y: p.y + s2.ny * demi * sens };
    const inter = lineLineIntersect(o1, { x: s1.ux, y: s1.uy }, o2, { x: s2.ux, y: s2.uy });
    // Un virage tres serre pousse le mitre tres loin : au-dela d'une distance raisonnable on
    // retombe sur un simple biseau (moyenne des deux bords), qui reste proche du trace.
    if (!inter || dist(inter, p) > demi * 4) return { x: (o1.x + o2.x) / 2, y: (o1.y + o2.y) / 2 };
    return inter;
  }
  const gauche = pts.map((p, i) => bord(p, i, 1));
  const droite = pts.map((p, i) => bord(p, i, -1));
  return gauche.concat(droite.reverse());
}
