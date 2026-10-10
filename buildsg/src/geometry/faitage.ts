// Le repere d'un faitage et l'axe d'un contour (geometry/) : de la geometrie pure, sans toit.
//
// `angleDuPlusLongCote` et `repereFaitage` vivaient dans facade/toit.ts ; le modele en a besoin
// (le toit deduit de la BD TOPO suit l'axe du batiment), et le modele n'importe pas facade/.

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import { signedArea } from './basic.js';
import type { PtBrut } from '../model/types.js';

const rad = (d: number) => (d * Math.PI) / 180;

/** Angle du plus long cote du contour, en degres : le faitage par defaut le suit. */
export function angleDuPlusLongCote(pts: readonly PtBrut[]): number {
  let best = 0,
    ang = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = au(pts, i),
      b = sommetDe(pts, i + 1);
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best) {
      best = l;
      ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }
  return ((ang % 180) + 180) % 180;
}

/** Le repere du faitage : origine au centre des etendues, demi-longueur `hl` et demi-largeur `hw`. */
export function repereFaitage(pts: readonly PtBrut[], angleFaitage: number) {
  const ux = Math.cos(rad(angleFaitage)),
    uy = Math.sin(rad(angleFaitage));
  const vx = -uy,
    vy = ux;
  let umin = Infinity,
    umax = -Infinity,
    vmin = Infinity,
    vmax = -Infinity;
  for (const p of pts) {
    const u = p.x * ux + p.y * uy,
      v = p.x * vx + p.y * vy;
    umin = Math.min(umin, u);
    umax = Math.max(umax, u);
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  return { ux, uy, vx, vy, u0: (umin + umax) / 2, v0: (vmin + vmax) / 2, hl: (umax - umin) / 2, hw: (vmax - vmin) / 2 };
}

/** Un contour est « un rectangle » quand il remplit au moins cette part de sa boite orientee sur son plus long cote. */
export const REMPLISSAGE_RECTANGLE = 0.86;
/** Et il a un axe quand il est au moins ce rapport de fois plus long que large : un carre n'en a pas. */
export const ELONGATION_MIN = 1.25;

/**
 * Le contour vu comme un rectangle pose sur son plus long cote : son angle, sa demi-longueur, sa
 * demi-largeur, la part de la boite qu'il remplit, et s'il est bien un rectangle allonge - de quoi
 * poser un faitage dans son axe. Un L, un T, un carre n'en sont pas.
 */
export function rectangleOriente(pts: readonly PtBrut[]): { angle: number; hl: number; hw: number; remplissage: number; rectangulaire: boolean } {
  const angle = angleDuPlusLongCote(pts);
  const r = repereFaitage(pts, angle);
  const boite = 4 * r.hl * r.hw;
  const remplissage = boite > 0 ? Math.abs(signedArea(pts)) / boite : 0;
  const rectangulaire = remplissage >= REMPLISSAGE_RECTANGLE && r.hw > 0 && r.hl / r.hw >= ELONGATION_MIN;
  return { angle, hl: r.hl, hw: r.hw, remplissage, rectangulaire };
}
