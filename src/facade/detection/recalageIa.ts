// Le recalage des points de Claude sur l'image (MD/spec-facades-calage-detection.md §12 bis, « Ce que Plan en fait »). Une position
// donnee par Claude n'est jamais une cote : c'est une **graine**.
// - Un coin propose est rattache au croisement de segments le plus proche (calage fin, F§6) : l'aide du releve.
// - Une boite proposee est ajustee sur les profils de contours (F§9) : l'accord des boites du run d'une facade avec la detection
//   (facade/regles/facades/ia.ts, lot F2), dans l'audit, le releve et la calibration.
// Une graine que rien ne soutient dans l'image (aucun segment, aucune arete a moins de 30 cm) reste ou elle est.
//
// Tout est pur. (Le renfort a trois passes votees, qui appliquait ici ses avis et ses graines, est parti au lot F3 : le run unique
// d'une facade le remplace, decide par le moteur de regles.)

import { au } from '../../util/tableaux.js';
import { pxParMetreDesCoins } from '../calage/calage.js';
import { intersection, ligneParPoints } from '../calage/calageFin.js';
import type { Image, P2 } from '../vision/homographie.js';
import type { Segment } from '../vision/segments.js';

/** Au-dela de 30 cm, une arete ne soutient plus une graine (F§12 bis). */
const RAYON_SOUTIEN_M = 0.3;
/** La part des lignes (ou colonnes) d'un cote ou l'arete se lit, au-dessus de laquelle le cote est soutenu. */
const COUVERTURE_ARETE = 0.6;
/** La resolution de travail des profils : 2 cm suffisent a un bord au centimetre pres apres affinage. */
const PX_PAR_M_PROFILS = 50;
/** La precision d'une graine de coin : un demi-dixieme de la photo (Claude situe un point a un dixieme pres). */
const DIXIEMES_PHOTO = 10;

const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------------------------------------
 * Les coins : le croisement de segments le plus proche
 * --------------------------------------------------------------------------------------------- */

interface CoinRecale {
  /** Le croisement retenu, en pixels de la photo. */
  point: P2;
  /** Distance de la graine au croisement, en pixels. */
  ecartPx: number;
}

/** Les deux voisins d'un coin (HG, HD, BD, BG) : les aretes qui en partent. */
const VOISINS: readonly [number, number][] = [[1, 3], [0, 2], [3, 1], [2, 0]];

const unitaire = (a: P2, b: P2): P2 | null => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return l > 1e-9 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : null;
};

/** Distance d'un point a un segment (et non a sa droite) : le segment doit atteindre le croisement. */
function distanceAuSegment(p: P2, g: Segment): number {
  const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - g.x1) * dx + (p.y - g.y1) * dy) / l2)) : 0;
  return Math.hypot(p.x - (g.x1 + t * dx), p.y - (g.y1 + t * dy));
}

/**
 * Une arete du mur est longue : un segment de moins de 15 % du cote attendu est un joint de brique,
 * une pierre, un petit bois, pas un bord de mur.
 */
const PART_COTE_MIN = 0.15;

/** Les segments qui suivent la direction `d` (a 15 degres pres), longs d'au moins `longueurMin`, et passent a moins de `rayon` de `graine`. */
function segmentsVers(segments: readonly Segment[], graine: P2, d: P2, rayon: number, longueurMin: number): Segment[] {
  const cosMax = Math.cos((15 * Math.PI) / 180);
  return segments.filter((g) => {
    if (g.longueur < longueurMin) return false;
    const u = unitaire({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 });
    if (!u || Math.abs(u.x * d.x + u.y * d.y) < cosMax) return false;
    return distanceAuSegment(graine, g) <= rayon;
  });
}

/**
 * Rattache les graines de coins (pixels de la photo ; null : Claude ne l'a pas situe) au croisement le
 * plus proche de deux segments qui suivent les deux aretes du coin. La recherche va jusqu'a un
 * demi-dixieme de la photo (la precision de la graine) ; le croisement n'est retenu que si chacun de
 * ses deux segments passe a moins de 30 cm de lui. Rend, pour chaque coin, le croisement, ou null :
 * la graine n'est soutenue par rien, elle est rejetee et le coin de l'algorithme reste.
 */
export function recalerCoins(graines: readonly (P2 | null)[], segments: readonly Segment[], largeurM: number, hauteurM: number, image: { largeur: number; hauteur: number }, repli: readonly P2[]): (CoinRecale | null)[] {
  // Le quadrilatere de reference : les graines, completees par les coins de l'algorithme.
  const quad = [0, 1, 2, 3].map((k) => graines[k] ?? au(repli, k));
  const pxParM = pxParMetreDesCoins(quad, largeurM, hauteurM) ?? 0;
  const soutien = Math.max(4, RAYON_SOUTIEN_M * pxParM);
  const demiRepere = 0.5 * Math.max(image.largeur, image.hauteur) / DIXIEMES_PHOTO;
  const recherche = Math.max(soutien, demiRepere);
  return [0, 1, 2, 3].map((k) => {
    const g = graines[k];
    if (!g) return null;
    const [a, b] = au(VOISINS, k);
    const da = unitaire(g, au(quad, a)), db = unitaire(g, au(quad, b));
    if (!da || !db) return null;
    const la = Math.hypot(au(quad, a).x - g.x, au(quad, a).y - g.y), lb = Math.hypot(au(quad, b).x - g.x, au(quad, b).y - g.y);
    const A = segmentsVers(segments, g, da, recherche, Math.max(12, PART_COTE_MIN * la)), B = segmentsVers(segments, g, db, recherche, Math.max(12, PART_COTE_MIN * lb));
    let meilleur: { point: P2; score: number; ecart: number } | null = null;
    for (const s of A) for (const t of B) {
      const ls = ligneParPoints({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }), lt = ligneParPoints({ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 });
      const p = ls && lt ? intersection(ls, lt) : null;
      if (!p) continue;
      const ecart = Math.hypot(p.x - g.x, p.y - g.y);
      if (ecart > recherche || distanceAuSegment(p, s) > soutien || distanceAuSegment(p, t) > soutien) continue;
      // Le plus proche, et a distance egale le mieux soutenu (les plus longs segments).
      const score = ecart / recherche - 0.5 * Math.min(1, (s.longueur + t.longueur) / Math.max(1, la + lb));
      if (!meilleur || score < meilleur.score) meilleur = { point: p, score, ecart };
    }
    return meilleur ? { point: { x: Math.round(meilleur.point.x * 10) / 10, y: Math.round(meilleur.point.y * 10) / 10 }, ecartPx: Math.round(meilleur.ecart * 10) / 10 } : null;
  });
}

/* ------------------------------------------------------------------------------------------------
 * Les boites : les profils de contours
 * --------------------------------------------------------------------------------------------- */

/** Les gradients de l'elevation, a 2 cm : de quoi lire un bord le long d'un cote. */
export interface CartesAretes {
  l: number;
  h: number;
  pxParM: number;
  /** Gradient horizontal et vertical (le canal qui varie le plus), en niveaux. */
  gx: Float32Array;
  gy: Float32Array;
  /** Au-dessus, un pixel est sur une arete : trois fois le gradient median du mur, six niveaux au moins. */
  seuil: number;
}

/** Les cartes d'aretes d'une elevation (le mur seul, sol en bas) a `pxParM`. `vu` masque ce que la photo n'a pas couvert. */
export function cartesAretes(img: Image, pxParM: number, vu: Uint8Array | null = null): CartesAretes {
  const s = Math.max(1, Math.floor(pxParM / PX_PAR_M_PROFILS));
  const l = Math.max(1, Math.floor(img.largeur / s)), h = Math.max(1, Math.floor(img.hauteur / s));
  const c = new Float32Array(l * h * 3);
  const vus = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    let r = 0, g = 0, b = 0, n = 0, v = 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const X = x * s + i, Y = y * s + j;
      const o = (Y * img.largeur + X) * 4;
      r += img.donnees[o] ?? 0; g += img.donnees[o + 1] ?? 0; b += img.donnees[o + 2] ?? 0; n++;
      v += vu ? (vu[Y * img.largeur + X] ?? 0) : 1;
    }
    const k = (y * l + x) * 3;
    c[k] = r / n; c[k + 1] = g / n; c[k + 2] = b / n;
    vus[y * l + x] = v * 2 >= n ? 1 : 0;
  }
  const gx = new Float32Array(l * h), gy = new Float32Array(l * h);
  const echantillon: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < l - 1; x++) {
    const i = y * l + x;
    if (!vus[i]) continue;
    let mx = 0, my = 0;
    for (let k = 0; k < 3; k++) {
      mx = Math.max(mx, Math.abs((c[(i + 1) * 3 + k] ?? 0) - (c[(i - 1) * 3 + k] ?? 0)) / 2);
      my = Math.max(my, Math.abs((c[(i + l) * 3 + k] ?? 0) - (c[(i - l) * 3 + k] ?? 0)) / 2);
    }
    gx[i] = mx; gy[i] = my;
    if ((x + y) % 3 === 0) echantillon.push(mx, my);
  }
  echantillon.sort((a, b) => a - b);
  const med = echantillon.length ? (echantillon[Math.floor(echantillon.length / 2)] ?? 0) : 0;
  return { l, h, pxParM: pxParM / s, gx, gy, seuil: Math.max(6, 3 * med) };
}

/**
 * Le bord le mieux soutenu pres de `pos` (metres) : pour chaque colonne (ou ligne) a moins de 30 cm,
 * la part des pixels du cote ou le gradient passe le seuil (a un pixel pres de travers). Rend la
 * position retenue (metres) et sa couverture ; null si aucun bord n'atteint `COUVERTURE_ARETE`.
 */
function bordLe(C: CartesAretes, vertical: boolean, pos: number, debut: number, fin: number): number | null {
  const k = C.pxParM;
  const R = Math.round(RAYON_SOUTIEN_M * k);
  const centre = Math.round(pos * k);
  // Le milieu du cote seulement : les coins d'une baie touchent le linteau, l'appui, un volet.
  const a = Math.round((debut + 0.15 * (fin - debut)) * k), b = Math.round((debut + 0.85 * (fin - debut)) * k);
  const N = vertical ? C.l : C.h, long = vertical ? C.h : C.l;
  const g = vertical ? C.gx : C.gy;
  let meilleur: { p: number; couv: number; force: number } | null = null;
  for (let p = Math.max(1, centre - R); p <= Math.min(N - 2, centre + R); p++) {
    let fort = 0, total = 0, somme = 0;
    for (let q = Math.max(0, a); q <= Math.min(long - 1, b); q++) {
      let m = 0;
      for (let d = -1; d <= 1; d++) {
        const pp = p + d;
        if (pp < 0 || pp >= N) continue;
        m = Math.max(m, (vertical ? g[q * C.l + pp] : g[pp * C.l + q]) ?? 0);
      }
      total++;
      somme += m;
      if (m >= C.seuil) fort++;
    }
    if (!total) continue;
    const couv = fort / total, force = somme / total;
    const mieux = !meilleur || couv > meilleur.couv + 1e-9 || (Math.abs(couv - meilleur.couv) <= 1e-9 && (force > meilleur.force + 1e-9 || (Math.abs(force - meilleur.force) <= 1e-9 && Math.abs(p - centre) < Math.abs(meilleur.p - centre))));
    if (mieux) meilleur = { p, couv, force };
  }
  return meilleur && meilleur.couv >= COUVERTURE_ARETE ? meilleur.p / k : null;
}

interface BoiteRecalee {
  x: number;
  y: number;
  l: number;
  h: number;
  /** Les cotes soutenus par une arete : gauche, droite, bas (appui), haut (linteau). */
  soutenus: number;
}

/**
 * Une boite proposee (metres, y depuis le sol) ajustee sur les profils de contours : chaque cote va au
 * bord le mieux soutenu a moins de 30 cm, ou reste ou il est. Rend aussi le nombre de cotes soutenus.
 */
export function recalerBoite(b: { x: number; y: number; l: number; h: number }, C: CartesAretes): BoiteRecalee {
  const Hm = C.h / C.pxParM;
  // En lignes de l'image, le haut de la baie (linteau) est plus petit que son bas (appui).
  const haut = Hm - (b.y + b.h), bas = Hm - b.y;
  const gauche = bordLe(C, true, b.x, haut, bas), droite = bordLe(C, true, b.x + b.l, haut, bas);
  const lin = bordLe(C, false, haut, b.x, b.x + b.l), app = bordLe(C, false, bas, b.x, b.x + b.l);
  let x0 = gauche ?? b.x, x1 = droite ?? b.x + b.l;
  let yHaut = lin ?? haut, yBas = app ?? bas;
  // Un ajustement qui retournerait la boite, ou la ramenerait sous 30 cm, n'en est pas un.
  if (x1 - x0 < 0.3) { x0 = b.x; x1 = b.x + b.l; }
  if (yBas - yHaut < 0.3) { yHaut = haut; yBas = bas; }
  const soutenus = [gauche, droite, app, lin].filter((v) => v !== null).length;
  return { x: r2(x0), y: r2(Math.max(0, Hm - yBas)), l: r2(x1 - x0), h: r2(yBas - yHaut), soutenus };
}
