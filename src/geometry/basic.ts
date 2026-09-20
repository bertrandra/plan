// Geometrie de base : distances, aires, centroides, appartenance (spec §3.2, geometry/basic.ts).
//
// Ces fonctions sont deplacees depuis legacy.ts SANS changement de formule. L'ordre des operations
// est conserve tel quel : les sorties du moteur terrasse contiennent des artefacts d'accumulation
// flottante (267.49999999999994) qui servent de preuve que l'arithmetique n'a pas bouge (§10.2).

import type { PtBrut } from '../model/types.js';

/** Distance euclidienne entre deux points. */
export function dist(a: PtBrut, b: PtBrut): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Aire d'un polygone, en valeur absolue (formule du lacet).
 * Le polygone est implicitement ferme : le dernier point est relie au premier.
 */
export function shoelace(P: readonly PtBrut[]): number {
  let s = 0;
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const p1 = P[i]!,
      p2 = P[(i + 1) % n]!;
    s += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Aire signee : positive si les sommets tournent dans le sens trigonometrique, negative sinon.
 * C'est elle qui donne le sens de parcours, donc la normale sortante d'un cote - une cote de PDF
 * placee du mauvais cote vient toujours d'un signe pris a l'envers.
 */
export function signedArea(pts: readonly PtBrut[]): number {
  let s = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!,
      b = pts[(i + 1) % n]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Barycentre des sommets - pas le centre de masse du polygone. */
export function centroid(pts: readonly PtBrut[]): PtBrut {
  let cx = 0,
    cy = 0;
  pts.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  return { x: cx / pts.length, y: cy / pts.length };
}

/**
 * Lancer de rayon horizontal. Le `|| 1e-12` evite la division par zero sur un cote parfaitement
 * horizontal ; il est conserve tel quel, changer cette garde deplacerait des points frontieres.
 */
export function pointInPolygon(pt: PtBrut, poly: readonly PtBrut[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x,
      yi = poly[i]!.y,
      xj = poly[j]!.x,
      yj = poly[j]!.y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Angle interieur au sommet `i`, en degres.
 *
 * Le sens de parcours decide de quel cote se trouve l'interieur : sur un polygone horaire, l'angle
 * brut mesure l'exterieur. C'est l'aire signee qui tranche - sonder la position des voisins
 * donnerait un resultat faux sur une forme concave, justement la ou l'angle est interessant.
 */
export function angleInterieurDeg(pts: readonly PtBrut[], i: number): number {
  const n = pts.length;
  const prec = pts[(i - 1 + n) % n]!,
    cur = pts[i]!,
    suiv = pts[(i + 1) % n]!;
  const u = { x: prec.x - cur.x, y: prec.y - cur.y };
  const v = { x: suiv.x - cur.x, y: suiv.y - cur.y };
  let a = ((Math.atan2(v.y, v.x) - Math.atan2(u.y, u.x)) * 180) / Math.PI;
  a = ((a % 360) + 360) % 360;
  const sensTrigo = signedArea(pts) > 0;
  return sensTrigo ? 360 - a : a;
}
