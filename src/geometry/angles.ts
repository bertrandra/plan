// Angles d'un polygone (spec §3.2, geometry/).

import { au } from '../util/tableaux.js';
import { signedArea } from './basic.js';

/**
 * Angle **interieur** au sommet `i`, en degres.
 *
 * Le calcul brut donne l'angle entre les deux cotes qui s'y rejoignent, mais son signe depend du
 * sens dans lequel le polygone est parcouru — et rien n'impose ce sens : un contour importe du
 * cadastre et un contour dessine a la main ne tournent pas forcement dans le meme. On corrige donc
 * avec l'aire signee, qui dit ce sens, et l'angle rendu est toujours celui qu'on mesurerait a
 * l'interieur de la forme.
 *
 * Sans cette correction, un rectangle affiche quatre angles de 270° au lieu de 90° dès qu'il est
 * dessine dans l'autre sens.
 */
export function interiorAngleDeg(obj: { pts: { x: number; y: number }[] }, i: number): number {
  const n = obj.pts.length;
  const prev = au(obj.pts, (i - 1 + n) % n), cur = au(obj.pts, i), next = au(obj.pts, (i + 1) % n);
  const u = { x: prev.x - cur.x, y: prev.y - cur.y };
  const v = { x: next.x - cur.x, y: next.y - cur.y };
  let a = (Math.atan2(v.y, v.x) - Math.atan2(u.y, u.x)) * 180 / Math.PI;
  a = ((a % 360) + 360) % 360;
  const ccw = signedArea(obj.pts) > 0;
  return ccw ? (360 - a) : a;
}
