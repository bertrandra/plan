// Les points de fuite d'une photo de facade (MD/spec-facades-calage-detection.md §6.2, lot L7).
//
// Les droites verticales du monde (aretes du mur, tableaux des baies, descentes d'eau) concourent sur
// la photo en un point : le point de fuite vertical. Les horizontales du mur (egout, pied, linteaux,
// appuis, joints) concourent en un autre, sur l'horizon. Leur position dit l'orientation exacte du
// telephone :
// - le **vertical** donne l'inclinaison et le roulis. L'accelerometre les donne deja au degre pres,
//   mais au retour de l'appareil photo, pas au declenchement : on cherche donc le point dans les bornes
//   de cette mesure (`Incertitude`), jamais au-dela ;
// - l'**horizontal du mur** donne l'angle sous lequel on voit le mur, donc l'**azimut reel** de la
//   prise : c'est le calage de la boussole, qui se trompe de 5 a 15 degres pres d'un mur.
//
// Plutot que d'ajuster un point libre puis de le ramener dans les bornes, on balaie les angles
// eux-memes dans leurs bornes, et l'on garde ceux dont le point de fuite rassemble le plus de segments
// (chacun pese sa longueur, et son ecart angulaire compte de moins en moins jusqu'a une tolerance).
// Cela tient les bornes par construction, et une photo sans aretes nettes rend simplement les angles
// mesures, sans rien inventer.

import { repereCamera, type Incertitude, type MurVu, type PriseDeVue, type V3 } from '../calage/calage.js';
import type { Segment } from './segments.js';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Le point de fuite d'une direction du monde, en coordonnees homogenes de la photo (pixels). */
export function pointDeFuite(p: PriseDeVue, D: V3): V3 {
  const s = repereCamera(p);
  const X = scal(D, s.droite),
    Y = scal(D, s.bas),
    Z = scal(D, s.avant);
  return [s.f * X + s.cx * Z, s.f * Y + s.cy * Z, Z];
}

/**
 * L'ecart angulaire, en radians dans [0, pi/2], entre un segment et la droite qui joint son milieu au
 * point `v` (homogene : un point a l'infini est une direction). C'est ce qui dit si le segment
 * « vise » ce point de fuite.
 */
export function ecartAuPoint(g: Segment, v: V3): number {
  const mx = (g.x1 + g.x2) / 2,
    my = (g.y1 + g.y2) / 2;
  const dx = v[0] - v[2] * mx,
    dy = v[1] - v[2] * my;
  const ux = g.x2 - g.x1,
    uy = g.y2 - g.y1;
  const n = Math.hypot(dx, dy) * Math.hypot(ux, uy);
  if (n < 1e-12) return Math.PI / 2;
  return Math.acos(Math.min(1, Math.abs(dx * ux + dy * uy) / n));
}

/** Le poids d'un segment pour un point : sa longueur, decroissante avec son ecart jusqu'a `tolerance`. */
function poids(g: Segment, v: V3, tolerance: number): number {
  const e = ecartAuPoint(g, v) / tolerance;
  return e < 1 ? g.longueur * (1 - e * e) : 0;
}

/** Ce que le point de fuite vertical a trouve : l'attitude, le point, et les segments qui le soutiennent. */
export interface ResultatVertical {
  inclinaisonDeg: number;
  roulisDeg: number;
  point: V3;
  /** Les segments verticaux retenus (ecart sous la tolerance fine). */
  segments: Segment[];
  /** Somme de leurs longueurs, en pixels. */
  soutien: number;
  /** Vrai : assez de segments pour que l'attitude vienne de la photo ; faux : celle mesuree est gardee. */
  trouve: boolean;
}

/** Tolerance fine d'un segment a son point de fuite : l'epaisseur d'une arete de quelques pixels sur sa longueur. */
export const TOLERANCE_FINE_DEG = 1.5;
/** Soutien minimal d'un point de fuite, en part du cote de l'image qui le porte. */
const SOUTIEN_MIN = 0.25;

/**
 * Un balayage a deux niveaux d'une fonction de un ou deux angles dans leurs bornes : une grille large,
 * puis deux affinages autour du meilleur. Rend les angles qui la maximisent.
 */
function balayer(f: (a: number, b: number) => number, a0: number, da: number, b0: number, db: number): [number, number, number] {
  let best: [number, number, number] = [a0, b0, f(a0, b0)];
  let pasA = Math.max(0.05, da / 12),
    pasB = Math.max(0.05, db / 12);
  let [ca, cb, ra, rb] = [a0, b0, da, db];
  for (let niveau = 0; niveau < 3; niveau++) {
    for (let a = ca - ra; a <= ca + ra + 1e-9; a += pasA)
      for (let b = cb - rb; b <= cb + rb + 1e-9; b += pasB) {
        if (Math.abs(a - a0) > da + 1e-9 || Math.abs(b - b0) > db + 1e-9) continue;
        const v = f(a, b);
        if (v > best[2]) best = [a, b, v];
      }
    [ca, cb] = [best[0], best[1]];
    [ra, rb] = [pasA, pasB];
    pasA = Math.max(0.01, pasA / 5);
    pasB = Math.max(0.01, pasB / 5);
    // Un angle sans incertitude reste a sa valeur : une seule colonne de la grille.
    if (da === 0) ra = 0;
    if (db === 0) rb = 0;
  }
  return best;
}

/**
 * Le point de fuite vertical, borne par l'inclinaison et le roulis mesures et leur incertitude. Rend
 * l'attitude qui rassemble le plus de segments presque verticaux ; celle mesuree s'il n'y en a pas assez.
 */
export function pointFuiteVertical(segments: readonly Segment[], p: PriseDeVue, i: Incertitude): ResultatVertical {
  const t0 = p.inclinaisonDeg ?? 0,
    r0 = p.roulisDeg ?? 0;
  const haut: V3 = [0, 0, 1];
  const vDe = (t: number, r: number) => pointDeFuite({ ...p, inclinaisonDeg: t, roulisDeg: r }, haut);
  // Pre-selection large : le roulis tourne toutes les verticales d'autant, l'inclinaison les fait
  // converger d'environ la moitie de son ecart au bord de l'image.
  const large = rad(Math.min(35, i.roulisDeg + 0.6 * i.inclinaisonDeg + 3));
  const v0 = vDe(t0, r0);
  const candidats = segments.filter((g) => g.longueur >= 15 && ecartAuPoint(g, v0) < large);
  const fine = rad(TOLERANCE_FINE_DEG);
  const score = (t: number, r: number) => {
    const v = vDe(t, r);
    let s = 0;
    for (const g of candidats) s += poids(g, v, fine);
    return s;
  };
  const [t, r] = candidats.length ? balayer(score, t0, i.inclinaisonDeg, r0, i.roulisDeg) : [t0, r0];
  const v = vDe(t, r);
  const retenus = candidats.filter((g) => ecartAuPoint(g, v) < fine);
  const soutien = retenus.reduce((s, g) => s + g.longueur, 0);
  const trouve = retenus.length >= 2 && soutien >= SOUTIEN_MIN * p.hauteurPx;
  if (!trouve) return { inclinaisonDeg: t0, roulisDeg: r0, point: v0, segments: retenus, soutien, trouve };
  return { inclinaisonDeg: t, roulisDeg: r, point: v, segments: retenus, soutien, trouve };
}

/** Ce que le point de fuite horizontal du mur a trouve : l'azimut de la prise, le point, les segments. */
export interface ResultatHorizontal {
  azimutDeg: number;
  point: V3;
  segments: Segment[];
  soutien: number;
  /**
   * Vrai : le point rassemble assez de segments, et nettement mieux qu'un azimut voisin, pour corriger
   * la boussole. De face, toutes les horizontales sont presque paralleles et l'azimut se lit mal : on
   * garde alors celui du telephone.
   */
  trouve: boolean;
}

/** La spec (§6.2) : les segments orientes comme le mur projete, a 20 degres pres. */
export const ECART_HORIZONTALES_DEG = 20;

/** La direction horizontale du mur, de son bout gauche a son bout droit, en vecteur unitaire. */
export function directionDuMur(m: MurVu): V3 {
  const dx = m.droite.x - m.gauche.x,
    dy = m.droite.y - m.gauche.y;
  const n = Math.hypot(dx, dy) || 1;
  return [dx / n, dy / n, 0];
}

/**
 * Le point de fuite horizontal du mur, et l'azimut qu'il donne : balaye dans les bornes de la
 * boussole, l'attitude de `p` etant tenue pour juste (celle du point vertical). Les segments
 * verticaux deja retenus en sont exclus.
 */
export function azimutParPointFuite(segments: readonly Segment[], p: PriseDeVue, m: MurVu, i: Incertitude, verticaux: readonly Segment[] = []): ResultatHorizontal {
  const D = directionDuMur(m);
  const a0 = p.azimutDeg;
  const vDe = (a: number) => pointDeFuite({ ...p, azimutDeg: a }, D);
  const v0 = vDe(a0);
  const exclus = new Set(verticaux);
  const candidats = segments.filter((g) => g.longueur >= 15 && !exclus.has(g) && ecartAuPoint(g, v0) < rad(ECART_HORIZONTALES_DEG));
  const fine = rad(TOLERANCE_FINE_DEG);
  const score = (a: number) => {
    const v = vDe(a);
    let s = 0;
    for (const g of candidats) s += poids(g, v, fine);
    return s;
  };
  const [a, , meilleur] = candidats.length ? balayer((x) => score(x), a0, i.azimutDeg, 0, 0) : [a0, 0, 0];
  const v = vDe(a);
  const retenus = candidats.filter((g) => ecartAuPoint(g, v) < fine);
  const soutien = retenus.reduce((s, g) => s + g.longueur, 0);
  // Nettete du pic : le meilleur azimut a 3 degres ou plus doit rassembler nettement moins.
  let voisin = 0;
  for (let x = a0 - i.azimutDeg; x <= a0 + i.azimutDeg + 1e-9; x += 0.5) if (Math.abs(x - a) >= 3) voisin = Math.max(voisin, score(x));
  const net = meilleur > 1.25 * voisin;
  const trouve = net && retenus.length >= 3 && soutien >= SOUTIEN_MIN * p.largeurPx;
  if (!trouve) return { azimutDeg: a0, point: v0, segments: retenus, soutien, trouve };
  return { azimutDeg: a, point: v, segments: retenus, soutien, trouve };
}

/** L'attitude que donne un point de fuite vertical (homogene), pour une focale et un point principal. */
export function attitudeDuPointVertical(v: V3, f: number, cx: number, cy: number): { inclinaisonDeg: number; roulisDeg: number } {
  // Le haut du monde dans le repere de l'image (droite, bas, avant) vaut (-sin r cos t, -cos r cos t, sin t).
  let u: V3 = [(v[0] - cx * v[2]) / f, (v[1] - cy * v[2]) / f, v[2]];
  const n = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / n, u[1] / n, u[2] / n];
  // Le point de fuite vaut pour le haut comme pour le bas : on prend le sens ou le haut monte dans l'image.
  if (u[1] > 0) u = [-u[0], -u[1], -u[2]];
  return { inclinaisonDeg: deg(Math.asin(Math.max(-1, Math.min(1, u[2])))), roulisDeg: deg(Math.atan2(-u[0], -u[1])) };
}
