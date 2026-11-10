// Redresser les coins predits d'une photo de facade sur ses verticales.
//
// Quand le calage fin ne trouve pas les aretes du mur, les coins restent ceux que predit la prise de vue (GPS, boussole, cadrage
// suppose). Leur perspective est approximative : redressee, la photo garde des verticales qui penchent d'un a trois degres (audit
// d'AE 101). Or les verticales du mur (tableaux des baies, chaines d'angle, descentes d'eau) se lisent sur la photo : elles
// concourent en un point, le point de fuite vertical. Faire passer les cotes gauche et droit du quadrilatere par ce point, c'est
// ce qui rend ces verticales verticales une fois la photo redressee (l'homographie envoie ce point a l'infini vers le haut).
//
// On ne lit ici que la photo, sans la prise de vue : le point est celui qui rassemble le plus de segments presque verticaux,
// par moindres carres ponderes, repris en ecartant ceux qui ne le visent pas. Le pied du quadrilatere ne bouge pas ; ses coins
// hauts glissent le long de son bord haut. Pure : testee seule.

import type { P2 } from './homographie.js';
import type { Segment } from './segments.js';

type V3 = [number, number, number];

/** Les segments retenus : a moins de cet angle de la verticale de l'image. */
const ANGLE_MAX_DEG = 15;
/** Un segment vise le point s'il en passe a moins de cet angle. */
const TOLERANCE_DEG = 1.5;
/** Il faut au moins ce nombre de segments, et cette longueur cumulee (en part de la hauteur de la photo). */
const SEGMENTS_MIN = 3;
const SOUTIEN_MIN = 0.6;

const rad = (d: number) => (d * Math.PI) / 180;

/** Le vecteur propre de la plus petite valeur propre d'une matrice symetrique 3 x 3 (methode de Jacobi). */
function plusPetitVecteurPropre(m: number[][]): V3 {
  const a = m.map((l) => [...l]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const at = (i: number, j: number) => (a[i] as number[])[j] as number;
  for (let tour = 0; tour < 50; tour++) {
    let p = 0, q = 1;
    if (Math.abs(at(0, 2)) > Math.abs(at(p, q))) [p, q] = [0, 2];
    if (Math.abs(at(1, 2)) > Math.abs(at(p, q))) [p, q] = [1, 2];
    if (Math.abs(at(p, q)) < 1e-15) break;
    const theta = (at(q, q) - at(p, p)) / (2 * at(p, q));
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (const l of [a, v]) {
      // Rotation des colonnes p et q (a : puis des lignes, pour rester symetrique).
      for (let k = 0; k < 3; k++) {
        const r = l[k] as number[];
        const x = r[p] as number, y = r[q] as number;
        r[p] = c * x - s * y;
        r[q] = s * x + c * y;
      }
      if (l === a) {
        const rp = a[p] as number[], rq = a[q] as number[];
        for (let k = 0; k < 3; k++) {
          const x = rp[k] as number, y = rq[k] as number;
          rp[k] = c * x - s * y;
          rq[k] = s * x + c * y;
        }
      }
    }
  }
  let k = 0;
  if (at(1, 1) < at(k, k)) k = 1;
  if (at(2, 2) < at(k, k)) k = 2;
  return [(v[0] as number[])[k] as number, (v[1] as number[])[k] as number, (v[2] as number[])[k] as number];
}

/** L'ecart angulaire (radians) entre un segment et la droite qui joint son milieu au point homogene `v`. */
function ecart(g: Segment, v: V3): number {
  const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
  const dx = v[0] - v[2] * mx, dy = v[1] - v[2] * my;
  const ux = g.x2 - g.x1, uy = g.y2 - g.y1;
  const n = Math.hypot(dx, dy) * Math.hypot(ux, uy);
  return n < 1e-12 ? Math.PI / 2 : Math.acos(Math.min(1, Math.abs(dx * ux + dy * uy) / n));
}

export interface FuiteVerticale {
  /** Le point, en coordonnees homogenes de la photo (pixels) ; un troisieme terme nul : les verticales sont paralleles. */
  point: V3;
  /** Les segments qui le visent, et leur longueur cumulee. */
  segments: number;
  soutien: number;
}

/**
 * Le point de fuite des verticales d'une photo, lu sur ses seuls segments ; null quand la photo n'offre pas assez de verticales
 * qui s'accordent (on ne conclut pas).
 */
export function fuiteVerticaleDesSegments(segments: readonly Segment[], largeurPx: number, hauteurPx: number, angleMaxDeg = ANGLE_MAX_DEG): FuiteVerticale | null {
  // Coordonnees centrees et reduites : la matrice reste bien conditionnee.
  const cx = largeurPx / 2, cy = hauteurPx / 2, e = Math.max(largeurPx, hauteurPx);
  const candidats = segments.filter((g) => g.longueur >= 0.03 * hauteurPx && Math.atan2(Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1)) < rad(angleMaxDeg));
  let retenus = candidats;
  let point: V3 | null = null;
  for (let tour = 0; tour < 6 && retenus.length >= SEGMENTS_MIN; tour++) {
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const g of retenus) {
      // La droite du segment, normee, ponderee par sa longueur.
      const p1: V3 = [(g.x1 - cx) / e, (g.y1 - cy) / e, 1], p2: V3 = [(g.x2 - cx) / e, (g.y2 - cy) / e, 1];
      const l: V3 = [p1[1] - p2[1], p2[0] - p1[0], p1[0] * p2[1] - p1[1] * p2[0]];
      const n = Math.hypot(l[0], l[1]);
      if (!(n > 0)) continue;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) (m[i] as number[])[j] = ((m[i] as number[])[j] as number) + (g.longueur * (l[i] as number) * (l[j] as number)) / (n * n);
    }
    const u = plusPetitVecteurPropre(m);
    // Retour aux pixels de la photo.
    point = [u[0] * e + cx * u[2], u[1] * e + cy * u[2], u[2]];
    const garder = candidats.filter((g) => ecart(g, point as V3) < rad(TOLERANCE_DEG * (tour < 3 ? 3 - tour : 1)));
    if (garder.length === retenus.length && tour >= 3) break;
    retenus = garder;
  }
  if (!point) return null;
  const vises = candidats.filter((g) => ecart(g, point as V3) < rad(TOLERANCE_DEG));
  const soutien = vises.reduce((s, g) => s + g.longueur, 0);
  if (vises.length < SEGMENTS_MIN || soutien < SOUTIEN_MIN * hauteurPx) return null;
  return { point, segments: vises.length, soutien };
}

/** L'intersection des droites (a, b) et (c, d), la seconde donnee par un point et un point homogene. */
function intersection(a: P2, b: P2, c: P2, v: V3): P2 | null {
  const l1: V3 = [a.y - b.y, b.x - a.x, a.x * b.y - a.y * b.x];
  // La droite de c vers v : c x v.
  const l2: V3 = [c.y * v[2] - v[1], v[0] - c.x * v[2], c.x * v[1] - c.y * v[0]];
  const w = l1[0] * l2[1] - l1[1] * l2[0];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (l1[1] * l2[2] - l1[2] * l2[1]) / w, y: (l1[2] * l2[0] - l1[0] * l2[2]) / w };
}

/**
 * Les coins (haut gauche, haut droit, bas droit, bas gauche) dont les cotes passent par le point de fuite vertical : le pied ne
 * bouge pas, les coins hauts glissent sur le bord haut. Null si le point est du mauvais cote (au-dessous du pied) ou si un coin
 * part trop loin (le point ne decrit pas ce mur).
 */
export function coinsSurLaVerticale(coins: readonly P2[], v: V3): P2[] | null {
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  const ng = intersection(hg, hd, bg, v), nd = intersection(hg, hd, bd, v);
  if (!ng || !nd) return null;
  const haut = Math.hypot(hd.x - hg.x, hd.y - hg.y);
  // Le haut doit rester au-dessus du pied, et chaque coin bouger de moins d'un tiers de la largeur.
  if (ng.y >= bg.y || nd.y >= bd.y) return null;
  if (Math.hypot(ng.x - hg.x, ng.y - hg.y) > haut / 3 || Math.hypot(nd.x - hd.x, nd.y - hd.y) > haut / 3) return null;
  return [ng, nd, { ...bd }, { ...bg }];
}
