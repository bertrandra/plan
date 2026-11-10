// La courbe d'un trace ouvert (un chemin) : une seule definition, pour le plan a l'ecran
// (geometry/path.ts), les exports SVG et PDF et la Vue 3D (three/). Elle etait ecrite quatre fois ;
// quatre copies d'une meme courbe finissent par en dessiner deux.
//
// Catmull-Rom converti en Bezier cubiques : la courbe passe exactement par tous les points saisis,
// ce qu'une Bezier dont on choisirait les controles a la main ne garantit pas. Les extremites se
// repetent (le premier et le dernier troncon n'ont qu'un voisin). Elle ne s'applique qu'a un trace
// marque `curve` d'au moins trois points ; sinon le trace est la ligne brisee de ses points.
//
// La construction est affine : la courbe des points transformes (ecran, page PDF) est la
// transformee de la courbe du plan. Les appelants qui ecrivent des coordonnees d'ecran ou de page
// lui passent donc leurs points deja transformes, ce qui garde leurs chiffres a l'octet pres.

import { dist } from './basic.js';
import { sommetDe } from './anneau.js';
import type { PtBrut } from '../model/types.js';

/** Un troncon de Bezier cubique, dans le repere des points recus (plan, ecran ou page) : de `p1` a `p2`, controles `c1` et `c2`. */
export interface TronconBezier { p1: PtBrut; c1: PtBrut; c2: PtBrut; p2: PtBrut }

/** Echantillons par troncon de la Vue 3D : le nombre d'avant la mise en commun, la 3D ne bouge pas. */
export const ECHANTILLONS_RENDU = 12;

/**
 * Echantillons par troncon pour mesurer la longueur d'une courbe. Une Bezier de chemin (un virage
 * de jardin, controles au sixieme des cordes voisines) est approchee par 32 cordes a mieux que le
 * dix-millieme de sa longueur : bien en dessous du centimetre qu'un export affiche.
 */
export const ECHANTILLONS_LONGUEUR = 32;

/** Le trace se dessine-t-il en courbe ? Seulement marque `curve`, et a partir de trois points. */
export function estCourbe(pts: readonly PtBrut[], curve?: boolean): boolean {
  return !!curve && pts.length >= 3;
}

/** Les troncons de Bezier qui passent par chaque point, dans l'ordre (n points, n - 1 troncons). */
export function tronconsBezier(pts: readonly PtBrut[]): TronconBezier[] {
  const borne = (i: number) => sommetDe(pts, Math.max(0, Math.min(pts.length - 1, i)));
  const out: TronconBezier[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = borne(i - 1), p1 = borne(i), p2 = borne(i + 1), p3 = borne(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    out.push({ p1, c1, c2, p2 });
  }
  return out;
}

/** Le point de parametre `t` (0 a 1) d'un troncon. */
export function pointBezier(b: TronconBezier, t: number): PtBrut {
  const mt = 1 - t, { p1, c1, c2, p2 } = b;
  return {
    x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
    y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y
  };
}

/**
 * Le trace en polyligne : les points eux-memes s'il est droit, la courbe echantillonnee
 * (`segsParTroncon` cordes par troncon, le premier point en tete) s'il est courbe.
 */
export function echantillonnerTrace(pts: readonly PtBrut[], curve?: boolean, segsParTroncon = ECHANTILLONS_RENDU): PtBrut[] {
  const premier = pts[0];
  if (!estCourbe(pts, curve) || !premier) return pts.slice();
  const out: PtBrut[] = [premier];
  for (const b of tronconsBezier(pts)) {
    for (let k = 1; k <= segsParTroncon; k++) out.push(pointBezier(b, k / segsParTroncon));
  }
  return out;
}

/** La longueur d'une ligne brisee ouverte. */
function longueurPolyligne(pts: readonly PtBrut[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += dist(sommetDe(pts, i), sommetDe(pts, i + 1));
  return L;
}

/**
 * La longueur du trace dessine : la ligne brisee s'il est droit, la courbe s'il est courbe
 * (`ECHANTILLONS_LONGUEUR` cordes par troncon).
 */
export function longueurTrace(pts: readonly PtBrut[], curve?: boolean): number {
  if (!estCourbe(pts, curve)) return longueurPolyligne(pts);
  return longueurPolyligne(echantillonnerTrace(pts, true, ECHANTILLONS_LONGUEUR));
}
