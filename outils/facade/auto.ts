// Calcul de facade.html : redressement automatique et fusion, sans aucune mesure saisie.
//
// Pour chaque photo :
//   1. la focale vient de l'EXIF (src/facade/vision/exif.ts, src/facade/vision/cadrage.ts) - 26 mm, 13 mm pour
//      le grand-angle 0,5x ... - ou, a defaut, du reglage ;
//   2. les segments de droite de l'image (une detection par croissance de regions de meme
//      orientation du gradient, a la maniere de LSD) ;
//   3. deux points de fuite sur la sphere de Gauss, la focale connue : les verticales du batiment,
//      puis les horizontales de la facade, orthogonales aux premieres ;
//   4. la rotation qui met l'appareil virtuel face au mur : l'image du mur y est alors a l'echelle
//      dans les deux sens (a un facteur pres), quelle que soit la prise de vue.
//
// Puis la fusion : deux vues redressees d'un meme mur ne different que d'une similitude (echelle et
// translation, la distance au mur changeant d'une photo a l'autre). Elle se trouve par points
// homologues (coins de Harris, descripteurs de voisinage cherches a plusieurs echelles) et RANSAC.
// Le rendu final va chercher chaque pixel sur la photo d'origine, a pleine resolution.
//
// Pas de DOM ici : tout se verifie sous Node (outils/facade/verifier.ts).

import type { Image } from '../../src/facade/vision/homographie.js';

export type { Image };
export interface P2 {
  x: number;
  y: number;
}
type V3 = [number, number, number];

const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function unitaire(a: V3): V3 | null {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : null;
}

/** Generateur pseudo-aleatoire deterministe : un meme jeu de photos donne le meme resultat. */
function alea(graine = 12345) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------------------------------------
 * Images en niveaux de gris
 * --------------------------------------------------------------------------------------------- */

export interface Gris {
  l: number;
  h: number;
  v: Float32Array;
}

export function versGris(img: Image): Gris {
  const n = img.largeur * img.hauteur;
  const v = new Float32Array(n);
  const d = img.donnees;
  for (let i = 0; i < n; i++) v[i] = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
  return { l: img.largeur, h: img.hauteur, v };
}

/** Flou gaussien separable. */
export function flou(g: Gris, sigma: number): Gris {
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / s;
  const { l: L, h: H } = g;
  const t = new Float32Array(L * H),
    o = new Float32Array(L * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r]! * g.v[y * L + Math.min(L - 1, Math.max(0, x + i))]!;
      t[y * L + x] = a;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r]! * t[Math.min(H - 1, Math.max(0, y + i)) * L + x]!;
      o[y * L + x] = a;
    }
  return { l: L, h: H, v: o };
}

function bilin(g: Gris, x: number, y: number): number {
  const x0 = Math.max(0, Math.min(g.l - 2, Math.floor(x))),
    y0 = Math.max(0, Math.min(g.h - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0)),
    fy = Math.max(0, Math.min(1, y - y0));
  const i = y0 * g.l + x0;
  return (g.v[i]! * (1 - fx) + g.v[i + 1]! * fx) * (1 - fy) + (g.v[i + g.l]! * (1 - fx) + g.v[i + g.l + 1]! * fx) * fy;
}

/* ------------------------------------------------------------------------------------------------
 * Segments de droite
 * --------------------------------------------------------------------------------------------- */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  long: number;
}

/**
 * Segments de l'image : des regions de pixels voisins dont le gradient a la meme orientation (a
 * 22,5 degres pres), semees du plus fort gradient au plus faible, puis ajustees par une droite.
 * Une region trop courte ou trop epaisse (un arc, une texture) est ecartee.
 */
export function detecterSegments(g0: Gris): Segment[] {
  const g = flou(g0, 0.8);
  const { l: L, h: H, v } = g;
  const n = L * H;
  const mag = new Float32Array(n),
    ang = new Float32Array(n);
  let maxi = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      const gx = (v[i - L + 1]! + 2 * v[i + 1]! + v[i + L + 1]! - v[i - L - 1]! - 2 * v[i - 1]! - v[i + L - 1]!) / 8;
      const gy = (v[i + L - 1]! + 2 * v[i + L]! + v[i + L + 1]! - v[i - L - 1]! - 2 * v[i - L]! - v[i - L + 1]!) / 8;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      ang[i] = Math.atan2(gy, gx);
      if (m > maxi) maxi = m;
    }
  const seuil = 4;
  // Tri par paquets, du gradient le plus fort au plus faible.
  const NB = 1024;
  const cle = (m: number) => NB - 1 - Math.min(NB - 1, Math.floor((m / (maxi || 1)) * NB));
  const cnt = new Int32Array(NB);
  for (let i = 0; i < n; i++) if (mag[i]! > seuil) cnt[cle(mag[i]!)]!++;
  const debut = new Int32Array(NB);
  for (let b = 1; b < NB; b++) debut[b] = debut[b - 1]! + cnt[b - 1]!;
  const ordre = new Int32Array(debut[NB - 1]! + cnt[NB - 1]!);
  for (let i = 0; i < n; i++) if (mag[i]! > seuil) ordre[debut[cle(mag[i]!)]!++] = i;

  const pris = new Uint8Array(n);
  const tol = Math.PI / 8;
  const ecart = (a: number, b: number) => {
    let d = Math.abs(a - b) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };
  const minLong = Math.max(12, 0.015 * Math.max(L, H));
  const segs: Segment[] = [];
  const reg: number[] = [];
  for (const graine of ordre) {
    if (pris[graine]) continue;
    reg.length = 0;
    reg.push(graine);
    pris[graine] = 1;
    let sc = Math.cos(ang[graine]!),
      ss = Math.sin(ang[graine]!),
      aR = ang[graine]!;
    for (let k = 0; k < reg.length; k++) {
      const p = reg[k]!;
      const px = p % L,
        py = (p - px) / L;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const qx = px + dx,
            qy = py + dy;
          if (qx < 1 || qy < 1 || qx >= L - 1 || qy >= H - 1) continue;
          const q = qy * L + qx;
          if (pris[q] || mag[q]! <= seuil || ecart(ang[q]!, aR) > tol) continue;
          pris[q] = 1;
          reg.push(q);
          sc += Math.cos(ang[q]!);
          ss += Math.sin(ang[q]!);
          aR = Math.atan2(ss, sc);
        }
    }
    if (reg.length < 10) continue;
    let sw = 0,
      mx = 0,
      my = 0;
    for (const p of reg) {
      const w = mag[p]!;
      sw += w;
      mx += w * (p % L);
      my += w * Math.floor(p / L);
    }
    mx /= sw;
    my /= sw;
    let cxx = 0,
      cyy = 0,
      cxy = 0;
    for (const p of reg) {
      const w = mag[p]!,
        dx = (p % L) - mx,
        dy = Math.floor(p / L) - my;
      cxx += w * dx * dx;
      cyy += w * dy * dy;
      cxy += w * dx * dy;
    }
    const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const c = Math.cos(th),
      s = Math.sin(th);
    let t0 = Infinity,
      t1 = -Infinity,
      s0 = Infinity,
      s1 = -Infinity;
    for (const p of reg) {
      const dx = (p % L) - mx,
        dy = Math.floor(p / L) - my;
      const t = dx * c + dy * s,
        u = -dx * s + dy * c;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
      if (u < s0) s0 = u;
      if (u > s1) s1 = u;
    }
    const long = t1 - t0 + 1,
      larg = s1 - s0 + 1;
    if (long < minLong || long < 4 * larg) continue;
    segs.push({ x1: mx + t0 * c, y1: my + t0 * s, x2: mx + t1 * c, y2: my + t1 * s, long });
  }
  return segs;
}

/* ------------------------------------------------------------------------------------------------
 * Points de fuite et redressement
 * --------------------------------------------------------------------------------------------- */

/** Vecteurs propres d'une matrice 3x3 symetrique (Jacobi) : valeurs croissantes, vecteurs en colonnes. */
function propres(A0: number[][]): { vals: number[]; vecs: V3[] } {
  const A = A0.map((l) => [...l]);
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let it = 0; it < 50; it++) {
    let p = 0,
      q = 1,
      m = Math.abs(A[0]![1]!);
    if (Math.abs(A[0]![2]!) > m) [p, q, m] = [0, 2, Math.abs(A[0]![2]!)];
    if (Math.abs(A[1]![2]!) > m) [p, q, m] = [1, 2, Math.abs(A[1]![2]!)];
    if (m < 1e-15) break;
    const th = 0.5 * Math.atan2(2 * A[p]![q]!, A[q]![q]! - A[p]![p]!);
    const c = Math.cos(th),
      s = Math.sin(th);
    for (let k = 0; k < 3; k++) {
      const akp = A[k]![p]!,
        akq = A[k]![q]!;
      A[k]![p] = c * akp - s * akq;
      A[k]![q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = A[p]![k]!,
        aqk = A[q]![k]!;
      A[p]![k] = c * apk - s * aqk;
      A[q]![k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = V[k]![p]!,
        vkq = V[k]![q]!;
      V[k]![p] = c * vkp - s * vkq;
      V[k]![q] = s * vkp + c * vkq;
    }
  }
  const idx = [0, 1, 2].sort((a, b) => A[a]![a]! - A[b]![b]!);
  return { vals: idx.map((i) => A[i]![i]!), vecs: idx.map((i) => [V[0]![i]!, V[1]![i]!, V[2]![i]!] as V3) };
}

export interface Camera {
  f: number;
  cx: number;
  cy: number;
}

interface Ligne {
  n: V3;
  w: number;
  tol: number;
  seg: Segment;
}

function lignes(segs: Segment[], cam: Camera): Ligne[] {
  const r: Ligne[] = [];
  for (const s of segs) {
    const n = unitaire(croix([(s.x1 - cam.cx) / cam.f, (s.y1 - cam.cy) / cam.f, 1], [(s.x2 - cam.cx) / cam.f, (s.y2 - cam.cy) / cam.f, 1]));
    // Tolerance angulaire : un pixel d'erreur aux extremites pese plus sur un segment court.
    if (n) r.push({ n, w: s.long, tol: Math.min(0.04, Math.max(0.008, 1.5 / s.long)), seg: s });
  }
  return r;
}

const accord = (l: Ligne, d: V3) => Math.abs(scal(l.n, d)) < l.tol;

/** Point de fuite des verticales : RANSAC a deux segments, puis moindres carres sur les accords. */
function fuiteVerticale(ls: Ligne[]): { d: V3; accords: Ligne[] } | null {
  const cands = ls.filter((l) => {
    const dx = Math.abs(l.seg.x2 - l.seg.x1),
      dy = Math.abs(l.seg.y2 - l.seg.y1);
    return dx < Math.tan((35 * Math.PI) / 180) * dy;
  });
  if (cands.length < 3) return null;
  const tot = cands.reduce((a, l) => a + l.w, 0);
  const r = alea(7);
  const tirer = () => {
    let t = r() * tot;
    for (const l of cands) if ((t -= l.w) <= 0) return l;
    return cands[cands.length - 1]!;
  };
  let best: V3 | null = null,
    bestS = 0;
  for (let it = 0; it < 500; it++) {
    const a = tirer(),
      b = tirer();
    if (a === b) continue;
    const d = unitaire(croix(a.n, b.n));
    if (!d || Math.abs(d[1]) < 0.5) continue;
    let s = 0;
    for (const l of cands) if (accord(l, d)) s += l.w;
    if (s > bestS) [best, bestS] = [d, s];
  }
  if (!best) return null;
  let d = best;
  for (let k = 0; k < 3; k++) {
    const acc = cands.filter((l) => accord(l, d));
    if (acc.length < 2) break;
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => acc.reduce((a, l) => a + l.w * l.n[i]! * l.n[j]!, 0)));
    d = propres(M).vecs[0]!;
  }
  if (d[1] < 0) d = [-d[0], -d[1], -d[2]];
  const accords = cands.filter((l) => accord(l, d));
  return accords.length >= 3 ? { d, accords } : null;
}

/** Point de fuite des horizontales de la facade, orthogonal aux verticales : RANSAC a un segment. */
function fuiteHorizontale(ls: Ligne[], v: V3, exclus: Set<Ligne>): { d: V3; accords: Ligne[] } | null {
  const cands = ls.filter((l) => {
    if (exclus.has(l)) return false;
    const dx = Math.abs(l.seg.x2 - l.seg.x1),
      dy = Math.abs(l.seg.y2 - l.seg.y1);
    return dx > Math.tan((30 * Math.PI) / 180) * dy;
  });
  if (cands.length < 3) return null;
  const hyp = [...cands].sort((a, b) => b.w - a.w).slice(0, 400);
  let best: V3 | null = null,
    bestS = 0;
  for (const h of hyp) {
    const d = unitaire(croix(v, h.n));
    if (!d) continue;
    let s = 0;
    for (const l of cands) if (accord(l, d)) s += l.w;
    if (s > bestS) [best, bestS] = [d, s];
  }
  if (!best) return null;
  const e1 = unitaire(croix(v, [0, 0, 1])) ?? ([1, 0, 0] as V3);
  const e2 = croix(v, e1);
  let d = best;
  for (let k = 0; k < 3; k++) {
    const acc = cands.filter((l) => accord(l, d));
    if (acc.length < 2) break;
    let a = 0,
      b = 0,
      c = 0;
    for (const l of acc) {
      const p = scal(l.n, e1),
        q = scal(l.n, e2);
      a += l.w * p * p;
      b += l.w * p * q;
      c += l.w * q * q;
    }
    // Plus petit vecteur propre de [[a b][b c]].
    const th = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2;
    const cs = Math.cos(th),
      sn = Math.sin(th);
    d = unitaire([cs * e1[0] + sn * e2[0], cs * e1[1] + sn * e2[1], cs * e1[2] + sn * e2[2]]) ?? d;
  }
  if (d[0] < 0) d = [-d[0], -d[1], -d[2]];
  const accords = cands.filter((l) => accord(l, d));
  return accords.length >= 3 ? { d, accords } : null;
}

/** Une photo redressee : la rotation qui la met face au mur, et ce qu'on garde du plan du mur. */
export interface Redressement {
  /** Rotation, lignes h (horizontale du mur), v (verticale, vers le bas), n (normale). */
  R: V3[];
  /** Camera de la photo d'origine, en pixels pleine resolution. */
  cam: Camera;
  largeurPhoto: number;
  hauteurPhoto: number;
  /**
   * Distorsion radiale (modele de division, rayon rapporte a la demi-diagonale) : 0 pour un
   * objectif corrige par le telephone - le cas de l'iPhone. Un grand-angle Android non corrige
   * courbe les droites vers les bords ; ce parametre les redresse.
   */
  lambda: number;
  /** Cadre du mur dans le plan redresse (coordonnees normalisees, x vers la droite, y vers le bas). */
  boite: { x0: number; y0: number; x1: number; y1: number };
  /** Pixels de la photo d'origine par unite du plan redresse, au milieu du mur. */
  densite: number;
  /** Ce qui a ete trouve, pour le dire (et le dessiner) : segments en pixels pleine resolution. */
  verticales: Segment[];
  horizontales: Segment[];
  avis: string[];
  /** Comment le redressement a ete obtenu. */
  mode: 'auto' | 'autre-facade' | 'coins';
  /** Coins du mur sur la photo (haut gauche, haut droit, bas droit, bas gauche), pleine resolution. */
  coins: P2[];
}

const demiDiagonale = (L: number, H: number) => Math.hypot(L, H) / 2;

/** Pixel de la photo -> pixel sans distorsion. */
export function sansDistorsion(lambda: number, L: number, H: number, p: P2): P2 {
  if (!lambda) return p;
  const rn = demiDiagonale(L, H);
  const dx = (p.x - L / 2) / rn,
    dy = (p.y - H / 2) / rn;
  const s = 1 / (1 + lambda * (dx * dx + dy * dy));
  return { x: L / 2 + dx * s * rn, y: H / 2 + dy * s * rn };
}

/** Pixel sans distorsion -> pixel de la photo (inverse du modele de division). */
export function avecDistorsion(lambda: number, L: number, H: number, p: P2): P2 | null {
  if (!lambda) return p;
  const rn = demiDiagonale(L, H);
  const dx = (p.x - L / 2) / rn,
    dy = (p.y - H / 2) / rn;
  const ru = Math.hypot(dx, dy);
  if (ru < 1e-9) return p;
  const disc = 1 - 4 * lambda * ru * ru;
  if (disc < 0) return null;
  const rd = (1 - Math.sqrt(disc)) / (2 * lambda * ru);
  if (!(rd > 0)) return null;
  const s = rd / ru;
  return { x: L / 2 + dx * s * rn, y: H / 2 + dy * s * rn };
}

const redresserSeg = (lambda: number, L: number, H: number, s: Segment): Segment => {
  if (!lambda) return s;
  const a = sansDistorsion(lambda, L, H, { x: s.x1, y: s.y1 }),
    b = sansDistorsion(lambda, L, H, { x: s.x2, y: s.y2 });
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, long: Math.hypot(b.x - a.x, b.y - a.y) };
};

export function versRedresse(r: Redressement, p0: P2): P2 | null {
  const p = sansDistorsion(r.lambda, r.largeurPhoto, r.hauteurPhoto, p0);
  const x = (p.x - r.cam.cx) / r.cam.f,
    y = (p.y - r.cam.cy) / r.cam.f;
  const [h, v, n] = r.R as [V3, V3, V3];
  const qz = n[0] * x + n[1] * y + n[2];
  if (qz <= 1e-6) return null;
  return { x: (h[0] * x + h[1] * y + h[2]) / qz, y: (v[0] * x + v[1] * y + v[2]) / qz };
}

export function versPhoto(r: Redressement, q: P2): P2 | null {
  const [h, v, n] = r.R as [V3, V3, V3];
  // R^T (x, y, 1)
  const X = h[0] * q.x + v[0] * q.y + n[0],
    Y = h[1] * q.x + v[1] * q.y + n[1],
    Z = h[2] * q.x + v[2] * q.y + n[2];
  if (Z <= 1e-6) return null;
  return avecDistorsion(r.lambda, r.largeurPhoto, r.hauteurPhoto, { x: r.cam.f * (X / Z) + r.cam.cx, y: r.cam.f * (Y / Z) + r.cam.cy });
}

function quantile(t: number[], q: number): number {
  const s = [...t].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
}

/** Les segments d'une photo, depuis son apercu `gris` a `k` fois sa resolution, en pixels pleine resolution. */
export function segmentsPhoto(gris: Gris, k: number): Segment[] {
  return detecterSegments(gris).map((s) => ({ x1: s.x1 / k, y1: s.y1 / k, x2: s.x2 / k, y2: s.y2 / k, long: s.long / k }));
}

const focaleDe = (largeur: number, hauteur: number, champ: number) => Math.max(largeur, hauteur) / 2 / Math.tan((champ * Math.PI) / 360);
const champDeFocale = (largeur: number, hauteur: number, f: number) => (2 * Math.atan(Math.max(largeur, hauteur) / 2 / f) * 180) / Math.PI;

function lignesPhoto(segs: Segment[], k: number, cam: Camera): Ligne[] {
  const ls = lignes(segs, cam);
  // Les tolerances sont en pixels de l'apercu, ou les segments ont ete trouves.
  for (const l of ls) l.tol = Math.min(0.04, Math.max(0.008, 1.5 / (l.seg.long * k)));
  return ls;
}

/** f^2 depuis deux points de fuite orthogonaux, en pixels relatifs au centre ; null s'il n'a pas de sens. */
function focaleOrthogonale(vx: number, vy: number, hx: number, hy: number): number | null {
  const f2 = -(vx * hx + vy * hy);
  return f2 > 0 ? Math.sqrt(f2) : null;
}

/**
 * Le champ de l'objectif, quand l'EXIF ne le dit pas : les verticales et les horizontales du mur
 * sont orthogonales, et les points de fuite de deux directions orthogonales verifient
 * (v - c).(h - c) = -f^2. Il faut que les deux fuient : une photo de biais, en contre-plongee.
 * `null` sinon.
 */
export function estimerChamp(segs: Segment[], k: number, largeurPhoto: number, hauteurPhoto: number): number | null {
  const f0 = focaleDe(largeurPhoto, hauteurPhoto, 67);
  const cam: Camera = { f: f0, cx: largeurPhoto / 2, cy: hauteurPhoto / 2 };
  const ls = lignesPhoto(segs, k, cam);
  const fv = fuiteVerticale(ls);
  if (!fv) return null;
  const exclus = new Set(fv.accords);
  const cands = ls.filter((l) => !exclus.has(l) && Math.abs(l.seg.x2 - l.seg.x1) > Math.tan(Math.PI / 6) * Math.abs(l.seg.y2 - l.seg.y1));
  if (cands.length < 6) return null;
  const tot = cands.reduce((a, l) => a + l.w, 0);
  const r = alea(31);
  const tirer = () => {
    let t = r() * tot;
    for (const l of cands) if ((t -= l.w) <= 0) return l;
    return cands[cands.length - 1]!;
  };
  let best: V3 | null = null,
    bestS = 0;
  for (let it = 0; it < 800; it++) {
    const a = tirer(),
      b = tirer();
    if (a === b) continue;
    const d = unitaire(croix(a.n, b.n));
    if (!d || Math.abs(scal(d, fv.d)) > 0.5) continue;
    let s = 0;
    for (const l of cands) if (accord(l, d)) s += l.w;
    if (s > bestS) [best, bestS] = [d, s];
  }
  if (!best) return null;
  let d = best;
  for (let it = 0; it < 3; it++) {
    const acc = cands.filter((l) => accord(l, d));
    if (acc.length < 4) return null;
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => acc.reduce((a, l) => a + l.w * l.n[i]! * l.n[j]!, 0)));
    d = propres(M).vecs[0]!;
  }
  // Points de fuite dans l'image ; une fuite trop lointaine (vue de face, d'aplomb) ne dit rien.
  const v = fv.d;
  if (Math.abs(v[2]) < 0.05 || Math.abs(d[2]) < 0.05) return null;
  const f = focaleOrthogonale((f0 * v[0]) / v[2], (f0 * v[1]) / v[2], (f0 * d[0]) / d[2], (f0 * d[1]) / d[2]);
  if (!f) return null;
  const champ = champDeFocale(largeurPhoto, hauteurPhoto, f);
  return champ > 35 && champ < 125 ? champ : null;
}

/** Ce que les droites de la photo disent, pour une distorsion et une focale donnees. */
function fuites(segs: Segment[], k: number, cam: Camera, facade: number) {
  const ls = lignesPhoto(segs, k, cam);
  const fv = fuiteVerticale(ls);
  const v: V3 = fv ? fv.d : [0, 1, 0];
  const exclus = new Set(fv?.accords ?? []);
  let fh = fuiteHorizontale(ls, v, exclus);
  let autre = false;
  if (facade === 1 && fh) {
    // L'autre facade : la deuxieme famille d'horizontales, une fois la premiere ecartee.
    for (const l of fh.accords) exclus.add(l);
    const f2 = fuiteHorizontale(ls, v, exclus);
    if (f2 && Math.abs(scal(f2.d, fh.d)) < Math.cos((15 * Math.PI) / 180)) {
      fh = f2;
      autre = true;
    }
  }
  const poids = (fv?.accords.reduce((a, l) => a + l.w, 0) ?? 0) + (fh?.accords.reduce((a, l) => a + l.w, 0) ?? 0);
  return { fv, fh, v, autre, poids };
}

/**
 * La distorsion d'un grand-angle non corrige, estimee sur la photo : celle qui rend les droites du
 * batiment les plus concourantes. Une photo d'objectif corrige (tout iPhone) rend 0.
 */
export function estimerDistorsion(segs: Segment[], k: number, largeurPhoto: number, hauteurPhoto: number, champ: number): number {
  if (champ < 80) return 0;
  const cam: Camera = { f: focaleDe(largeurPhoto, hauteurPhoto, champ), cx: largeurPhoto / 2, cy: hauteurPhoto / 2 };
  const longs = segs.filter((s) => s.long * k > 25);
  const score = (lambda: number) => fuites(longs.map((s) => redresserSeg(lambda, largeurPhoto, hauteurPhoto, s)), k, cam, 0).poids;
  const s0 = score(0);
  let best = 0,
    bestS = s0;
  for (let l = -0.4; l <= 0.1001; l += 0.05) {
    const s = score(l);
    if (s > bestS) [best, bestS] = [l, s];
  }
  for (let l = best - 0.04; l <= best + 0.0401; l += 0.01) {
    const s = score(l);
    if (s > bestS) [best, bestS] = [l, s];
  }
  // Un gain marginal ne justifie pas de deformer la photo.
  return bestS > s0 * 1.08 ? Math.round(best * 100) / 100 : 0;
}

/** Les cadres, la densite : ce qui suit la rotation, quel que soit le moyen de l'avoir trouvee. */
function finir(red: Redressement, b: { x0: number; y0: number; x1: number; y1: number }): Redressement {
  const { largeurPhoto: L, hauteurPhoto: H } = red;
  const bord: P2[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    for (const p of [
      { x: t * L, y: 0 },
      { x: t * L, y: H },
      { x: 0, y: t * H },
      { x: L, y: t * H },
    ]) {
      const q = versRedresse(red, p);
      if (q) bord.push(q);
    }
  }
  if (bord.length && red.mode !== 'coins') {
    b.x0 = Math.max(b.x0, Math.min(...bord.map((q) => q.x)));
    b.x1 = Math.min(b.x1, Math.max(...bord.map((q) => q.x)));
    b.y0 = Math.max(b.y0, Math.min(...bord.map((q) => q.y)));
    b.y1 = Math.min(b.y1, Math.max(...bord.map((q) => q.y)));
  }
  red.boite = b;
  const ds: number[] = [];
  const e = 1e-4;
  for (let i = 1; i < 6; i++)
    for (let j = 1; j < 6; j++) {
      const q = { x: b.x0 + ((b.x1 - b.x0) * i) / 6, y: b.y0 + ((b.y1 - b.y0) * j) / 6 };
      const p = versPhoto(red, q),
        px = versPhoto(red, { x: q.x + e, y: q.y }),
        py = versPhoto(red, { x: q.x, y: q.y + e });
      if (!p || !px || !py) continue;
      const det = ((px.x - p.x) * (py.y - p.y) - (px.y - p.y) * (py.x - p.x)) / (e * e);
      ds.push(Math.sqrt(Math.abs(det)));
    }
  if (ds.length) red.densite = quantile(ds, 0.5);
  red.coins = [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ].map((q) => versPhoto(red, q) ?? { x: L / 2, y: H / 2 });
  return red;
}

/** Repere orthonorme depuis les directions verticale et horizontale du mur. */
function repere(v0: V3, h0: V3): V3[] {
  let v = v0;
  if (v[1] < 0) v = [-v[0], -v[1], -v[2]];
  let h = h0;
  if (h[0] < 0) h = [-h[0], -h[1], -h[2]];
  const hv = scal(h, v);
  h = unitaire([h[0] - hv * v[0], h[1] - hv * v[1], h[2] - hv * v[2]]) ?? [1, 0, 0];
  let n = croix(h, v);
  if (n[2] < 0) {
    h = [-h[0], -h[1], -h[2]];
    n = croix(h, v);
  }
  return [h, v, n];
}

export interface OptionsRedressement {
  /** 0 : la facade la mieux vue ; 1 : l'autre (photo d'angle). */
  facade?: number;
  /** Distorsion radiale deja estimee. */
  lambda?: number;
}

/** Le redressement automatique d'une photo, d'apres ses segments. */
export function redresserPhoto(segs0: Segment[], k: number, largeurPhoto: number, hauteurPhoto: number, champ: number, o: OptionsRedressement = {}): Redressement {
  const lambda = o.lambda ?? 0;
  const f = focaleDe(largeurPhoto, hauteurPhoto, champ);
  const cam: Camera = { f, cx: largeurPhoto / 2, cy: hauteurPhoto / 2 };
  const segs = segs0.map((s) => redresserSeg(lambda, largeurPhoto, hauteurPhoto, s));
  const avis: string[] = [];
  const { fv, fh, v, autre } = fuites(segs, k, cam, o.facade ?? 0);
  if (!fv) avis.push('verticales introuvables : la photo est supposée prise d’aplomb');
  let h: V3 = unitaire(croix(v, [0, 0, 1])) ?? [1, 0, 0];
  if (fh) h = fh.d;
  else avis.push('horizontales introuvables : la photo est supposée prise de face');
  if (o.facade === 1 && !autre) avis.push('pas d’autre façade trouvée sur cette photo');
  // Les segments a dessiner restent ceux de la photo (avec sa distorsion).
  const origine = new Map(segs.map((s, i) => [s, segs0[i]!]));
  const red: Redressement = {
    R: repere(v, h),
    cam,
    largeurPhoto,
    hauteurPhoto,
    lambda,
    boite: { x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 },
    densite: f,
    verticales: fv?.accords.map((l) => origine.get(l.seg) ?? l.seg) ?? [],
    horizontales: fh?.accords.map((l) => origine.get(l.seg) ?? l.seg) ?? [],
    avis,
    mode: autre ? 'autre-facade' : 'auto',
    coins: [],
  };
  // Le mur : la ou sont ses lignes (1er et 99e centiles des extremites des segments retenus), avec
  // une marge, double au-dessus pour les pignons.
  const xs: number[] = [],
    ys: number[] = [];
  for (const s of [...(fv?.accords ?? []), ...(fh?.accords ?? [])].map((l) => origine.get(l.seg) ?? l.seg))
    for (const p of [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]) {
      const q = versRedresse(red, p);
      if (q) {
        xs.push(q.x);
        ys.push(q.y);
      }
    }
  let b = { x0: 0, y0: 0, x1: 0, y1: 0 };
  if (xs.length >= 8) {
    b = { x0: quantile(xs, 0.01), x1: quantile(xs, 0.99), y0: quantile(ys, 0.005), y1: quantile(ys, 0.99) };
    const mx = 0.04 * (b.x1 - b.x0),
      my = 0.06 * (b.y1 - b.y0);
    b = { x0: b.x0 - mx, x1: b.x1 + mx, y0: b.y0 - 2 * my, y1: b.y1 + my };
  } else {
    // Sans lignes : le centre de la photo.
    const c = versRedresse(red, { x: cam.cx, y: cam.cy }) ?? { x: 0, y: 0 };
    const e = (0.4 * Math.max(largeurPhoto, hauteurPhoto)) / f;
    b = { x0: c.x - e, x1: c.x + e, y0: c.y - e, y1: c.y + e };
  }
  return finir(red, b);
}

/** Droite (homogene) par deux pixels, relatifs au centre et a la focale. */
const droite = (cam: Camera, a: P2, b: P2): V3 | null => unitaire(croix([(a.x - cam.cx) / cam.f, (a.y - cam.cy) / cam.f, 1], [(b.x - cam.cx) / cam.f, (b.y - cam.cy) / cam.f, 1]));

/**
 * Le champ que donnent quatre coins poses a la main, quand la photo n'a pas d'EXIF : les cotes
 * gauche et droit fuient vers les verticales, le haut et le bas vers les horizontales.
 */
export function champDepuisCoins(coins: P2[], largeurPhoto: number, hauteurPhoto: number, lambda = 0): number | null {
  const c = coins.map((p) => sansDistorsion(lambda, largeurPhoto, hauteurPhoto, p));
  const cam: Camera = { f: 1, cx: largeurPhoto / 2, cy: hauteurPhoto / 2 };
  const [hg, hd, bd, bg] = c as [P2, P2, P2, P2];
  const vp = (a: P2, b: P2, p: P2, q: P2) => {
    const l1 = croix([a.x - cam.cx, a.y - cam.cy, 1], [b.x - cam.cx, b.y - cam.cy, 1]);
    const l2 = croix([p.x - cam.cx, p.y - cam.cy, 1], [q.x - cam.cx, q.y - cam.cy, 1]);
    const x = croix(l1, l2);
    return Math.abs(x[2]) < 1e-9 ? null : { x: x[0] / x[2], y: x[1] / x[2] };
  };
  const v = vp(hg, bg, hd, bd),
    h = vp(hg, hd, bg, bd);
  if (!v || !h) return null;
  const diag = Math.max(largeurPhoto, hauteurPhoto);
  // Une fuite tres lointaine (cote presque parallele) ne mesure rien.
  if (Math.hypot(v.x, v.y) > 30 * diag || Math.hypot(h.x, h.y) > 30 * diag) return null;
  const f = focaleOrthogonale(v.x, v.y, h.x, h.y);
  if (!f) return null;
  const champ = champDeFocale(largeurPhoto, hauteurPhoto, f);
  return champ > 35 && champ < 125 ? champ : null;
}

/** Le redressement par quatre coins poses a la main (haut gauche, haut droit, bas droit, bas gauche). */
export function redresserDepuisCoins(coins: P2[], largeurPhoto: number, hauteurPhoto: number, champ: number, lambda = 0): Redressement | null {
  const f = focaleDe(largeurPhoto, hauteurPhoto, champ);
  const cam: Camera = { f, cx: largeurPhoto / 2, cy: hauteurPhoto / 2 };
  const c = coins.map((p) => sansDistorsion(lambda, largeurPhoto, hauteurPhoto, p));
  const [hg, hd, bd, bg] = c as [P2, P2, P2, P2];
  const gauche = droite(cam, hg, bg),
    droit = droite(cam, hd, bd),
    haut = droite(cam, hg, hd),
    bas = droite(cam, bg, bd);
  if (!gauche || !droit || !haut || !bas) return null;
  const v = unitaire(croix(gauche, droit)),
    h = unitaire(croix(haut, bas));
  if (!v || !h || Math.abs(scal(v, h)) > 0.6) return null;
  const seg = (a: P2, b: P2): Segment => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, long: Math.hypot(b.x - a.x, b.y - a.y) });
  const [o0, o1, o2, o3] = coins as [P2, P2, P2, P2];
  const red: Redressement = {
    R: repere(v, h),
    cam,
    largeurPhoto,
    hauteurPhoto,
    lambda,
    boite: { x0: 0, y0: 0, x1: 1, y1: 1 },
    densite: f,
    verticales: [seg(o0, o3), seg(o1, o2)],
    horizontales: [seg(o0, o1), seg(o3, o2)],
    avis: [],
    mode: 'coins',
    coins: [],
  };
  const q = coins.map((p) => versRedresse(red, p));
  if (q.some((x) => !x)) return null;
  const xs = q.map((x) => x!.x),
    ys = q.map((x) => x!.y);
  const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  if (!(b.x1 - b.x0 > 1e-6 && b.y1 - b.y0 > 1e-6)) return null;
  const r = finir(red, b);
  r.coins = coins.map((p) => ({ ...p }));
  return r;
}

/* ------------------------------------------------------------------------------------------------
 * Vues redressees de travail, points homologues
 * --------------------------------------------------------------------------------------------- */

/** Une vue redressee basse resolution : `fa` pixels par unite du plan, a partir du coin du cadre. */
export interface Vue {
  red: Redressement;
  g: Gris;
  valide: Uint8Array;
  fa: number;
}

export function vueRedressee(red: Redressement, gris: Gris, k: number, fa: number): Vue {
  const b = red.boite;
  const L = Math.max(8, Math.round((b.x1 - b.x0) * fa)),
    H = Math.max(8, Math.round((b.y1 - b.y0) * fa));
  const v = new Float32Array(L * H),
    valide = new Uint8Array(L * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const p = versPhoto(red, { x: b.x0 + (x + 0.5) / fa, y: b.y0 + (y + 0.5) / fa });
      if (!p) continue;
      const gx = p.x * k - 0.5,
        gy = p.y * k - 0.5;
      if (gx < 0 || gy < 0 || gx > gris.l - 1 || gy > gris.h - 1) continue;
      v[y * L + x] = bilin(gris, gx, gy);
      valide[y * L + x] = 1;
    }
  return { red, g: { l: L, h: H, v }, valide, fa };
}

interface PointCle {
  x: number;
  y: number;
  d: Float32Array;
}

const RAYON = 20;

/** Coins de Harris, repartis sur l'image, et leur descripteur (voisinage 16 x 16 normalise). */
function pointsCles(g0: Gris, valide: Uint8Array, max: number): PointCle[] {
  const g = flou(g0, 1);
  const { l: L, h: H } = g;
  const ixx = new Float32Array(L * H),
    iyy = new Float32Array(L * H),
    ixy = new Float32Array(L * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      const gx = (g.v[i + 1]! - g.v[i - 1]!) / 2,
        gy = (g.v[i + L]! - g.v[i - L]!) / 2;
      ixx[i] = gx * gx;
      iyy[i] = gy * gy;
      ixy[i] = gx * gy;
    }
  const sxx = flou({ l: L, h: H, v: ixx }, 1.5).v,
    syy = flou({ l: L, h: H, v: iyy }, 1.5).v,
    sxy = flou({ l: L, h: H, v: ixy }, 1.5).v;
  const rep = new Float32Array(L * H);
  for (let i = 0; i < L * H; i++) rep[i] = sxx[i]! * syy[i]! - sxy[i]! * sxy[i]! - 0.04 * (sxx[i]! + syy[i]!) ** 2;
  // Maxima locaux, loin du bord de ce qui a ete vu.
  const m = RAYON + 2;
  const cands: { x: number; y: number; r: number }[] = [];
  for (let y = m; y < H - m; y++)
    for (let x = m; x < L - m; x++) {
      const i = y * L + x;
      const r = rep[i]!;
      if (r <= 1) continue;
      let maxLocal = true;
      for (let dy = -3; dy <= 3 && maxLocal; dy++) for (let dx = -3; dx <= 3; dx++) if ((dx || dy) && rep[i + dy * L + dx]! > r) { maxLocal = false; break; }
      if (!maxLocal) continue;
      if (!valide[i - m * L - m] || !valide[i - m * L + m] || !valide[i + m * L - m] || !valide[i + m * L + m]) continue;
      cands.push({ x, y, r });
    }
  // Repartition : les meilleurs de chaque case d'une grille 6 x 6, puis les meilleurs restants.
  cands.sort((a, b) => b.r - a.r);
  const parCase = Math.ceil(max / 36) * 2;
  const n = new Map<number, number>();
  const choisis: { x: number; y: number }[] = [];
  for (const c of cands) {
    const k = Math.floor((c.x / L) * 6) + 6 * Math.floor((c.y / H) * 6);
    const nb = n.get(k) ?? 0;
    if (nb >= parCase) continue;
    n.set(k, nb + 1);
    choisis.push(c);
    if (choisis.length >= max) break;
  }
  // Descripteur : voisinage echantillonne en 8 x 8, sur une image lissee a son pas.
  const gd = flou(g0, RAYON / 6);
  const res: PointCle[] = [];
  for (const c of choisis) {
    const d = new Float32Array(64);
    let s = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) s += d[j * 8 + i] = bilin(gd, c.x - RAYON + (RAYON / 8) * (2 * i + 1), c.y - RAYON + (RAYON / 8) * (2 * j + 1));
    const moy = s / 64;
    let q = 0;
    for (let i = 0; i < 64; i++) {
      d[i] = d[i]! - moy;
      q += d[i]! * d[i]!;
    }
    if (q < 64 * 4) continue;
    const inv = 1 / Math.sqrt(q);
    for (let i = 0; i < 64; i++) d[i] = d[i]! * inv;
    res.push({ x: c.x, y: c.y, d });
  }
  return res;
}

function reechantillonner(g: Gris, valide: Uint8Array, s: number): { g: Gris; valide: Uint8Array } {
  const src = s < 1 ? flou(g, 0.6 / s) : g;
  const L = Math.max(8, Math.round(g.l * s)),
    H = Math.max(8, Math.round(g.h * s));
  const v = new Float32Array(L * H),
    va = new Uint8Array(L * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const sx = (x + 0.5) / s - 0.5,
        sy = (y + 0.5) / s - 0.5;
      const xi = Math.round(sx),
        yi = Math.round(sy);
      if (xi < 0 || yi < 0 || xi >= g.l || yi >= g.h || !valide[yi * g.l + xi]) continue;
      v[y * L + x] = bilin(src, sx, sy);
      va[y * L + x] = 1;
    }
  return { g: { l: L, h: H, v }, valide: va };
}

/** Similitude x' = a x - b y + tx, y' = b x + a y + ty. */
export interface Sim {
  a: number;
  b: number;
  tx: number;
  ty: number;
}
export const ID: Sim = { a: 1, b: 0, tx: 0, ty: 0 };
export const appliquerSim = (S: Sim, p: P2): P2 => ({ x: S.a * p.x - S.b * p.y + S.tx, y: S.b * p.x + S.a * p.y + S.ty });
/** S1 apres S2. */
export const composer = (S1: Sim, S2: Sim): Sim => ({
  a: S1.a * S2.a - S1.b * S2.b,
  b: S1.a * S2.b + S1.b * S2.a,
  tx: S1.a * S2.tx - S1.b * S2.ty + S1.tx,
  ty: S1.b * S2.tx + S1.a * S2.ty + S1.ty,
});
export function inverser(S: Sim): Sim {
  const n = S.a * S.a + S.b * S.b;
  const a = S.a / n,
    b = -S.b / n;
  return { a, b, tx: -(a * S.tx - b * S.ty), ty: -(b * S.tx + a * S.ty) };
}
const echelle = (S: Sim) => Math.hypot(S.a, S.b);

function simDepuis(P: P2[], Q: P2[]): Sim | null {
  const n = P.length;
  if (n < 2) return null;
  let px = 0,
    py = 0,
    qx = 0,
    qy = 0;
  for (let i = 0; i < n; i++) {
    px += P[i]!.x;
    py += P[i]!.y;
    qx += Q[i]!.x;
    qy += Q[i]!.y;
  }
  px /= n;
  py /= n;
  qx /= n;
  qy /= n;
  let sa = 0,
    sb = 0,
    sp = 0;
  for (let i = 0; i < n; i++) {
    const ux = P[i]!.x - px,
      uy = P[i]!.y - py,
      vx = Q[i]!.x - qx,
      vy = Q[i]!.y - qy;
    sa += ux * vx + uy * vy;
    sb += ux * vy - uy * vx;
    sp += ux * ux + uy * uy;
  }
  if (sp < 1e-9) return null;
  const a = sa / sp,
    b = sb / sp;
  return { a, b, tx: qx - (a * px - b * py), ty: qy - (b * px + a * py) };
}

/** Les points cles d'une vue : a son echelle, et a neuf echelles de 0,42 a 2,4 pour l'apparier. */
export interface Signature {
  base: PointCle[];
  echelles: { s: number; pts: PointCle[] }[];
}

export function signature(vue: Vue): Signature {
  const base = pointsCles(vue.g, vue.valide, 500);
  const echelles: Signature['echelles'] = [];
  for (let l = -5; l <= 5; l++) {
    const s = 2 ** (l / 4);
    if (l === 0) {
      echelles.push({ s, pts: base });
      continue;
    }
    if (vue.g.l * s * vue.g.h * s > 2_500_000) continue;
    const r = reechantillonner(vue.g, vue.valide, s);
    echelles.push({ s, pts: pointsCles(r.g, r.valide, 400) });
  }
  return { base, echelles };
}

export interface Appariement {
  /** Vue j (pixels de travail) -> vue i (pixels de travail). */
  S: Sim;
  accords: number;
  /** Gain a appliquer a j pour egaler la luminosite de i. */
  gain: number;
}

/** Apparie la vue j sur la vue i : points homologues, RANSAC sur une similitude presque sans rotation. */
export function apparier(vi: Vue, si: Signature, vj: Vue, sj: Signature): Appariement | null {
  const P: P2[] = [],
    Q: P2[] = [];
  const tous: { p: PointCle; s: number }[] = [];
  for (const e of sj.echelles) for (const p of e.pts) tous.push({ p, s: e.s });
  if (!tous.length) return null;
  for (const q of si.base) {
    let b1 = -2,
      b2 = -2,
      bi = -1;
    for (let k = 0; k < tous.length; k++) {
      const d = tous[k]!.p.d;
      let c = 0;
      for (let i = 0; i < 64; i++) c += q.d[i]! * d[i]!;
      if (c > b1) {
        b2 = b1;
        b1 = c;
        bi = k;
      } else if (c > b2) b2 = c;
    }
    // Test du rapport (en distance : |a-b|^2 = 2 - 2c).
    if (bi < 0 || b1 < 0.75 || 2 - 2 * b1 > 0.64 * (2 - 2 * b2)) continue;
    const t = tous[bi]!;
    P.push({ x: t.p.x / t.s, y: t.p.y / t.s });
    Q.push({ x: q.x, y: q.y });
  }
  if (P.length < 8) return null;
  const r = alea(99);
  let best: number[] = [];
  const seuil = 3;
  const accords = (S: Sim) => {
    const acc: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const m = appliquerSim(S, P[i]!);
      if (Math.hypot(m.x - Q[i]!.x, m.y - Q[i]!.y) < seuil) acc.push(i);
    }
    return acc;
  };
  for (let it = 0; it < 1500; it++) {
    const a = Math.floor(r() * P.length),
      b = Math.floor(r() * P.length);
    if (a === b) continue;
    const S = simDepuis([P[a]!, P[b]!], [Q[a]!, Q[b]!]);
    if (!S) continue;
    const e = echelle(S);
    if (e < 0.3 || e > 3.5 || Math.abs(Math.atan2(S.b, S.a)) > 0.12) continue;
    const acc = accords(S);
    if (acc.length > best.length) best = acc;
  }
  if (best.length < 10) return null;
  let S = simDepuis(best.map((i) => P[i]!), best.map((i) => Q[i]!))!;
  for (let k = 0; k < 2; k++) {
    const acc = accords(S);
    if (acc.length < 10) break;
    best = acc;
    S = simDepuis(best.map((i) => P[i]!), best.map((i) => Q[i]!)) ?? S;
  }
  let li = 0,
    lj = 0;
  for (const i of best) {
    li += bilin(vi.g, Q[i]!.x, Q[i]!.y);
    lj += bilin(vj.g, P[i]!.x, P[i]!.y);
  }
  const gain = lj > 0 ? Math.min(2, Math.max(0.5, li / lj)) : 1;
  return { S, accords: best.length, gain };
}

/** Passage pixels de travail -> plan redresse d'une vue. */
const travailVersPlan = (v: Vue): Sim => ({ a: 1 / v.fa, b: 0, tx: v.red.boite.x0, ty: v.red.boite.y0 });

export interface Placement {
  /** Pour chaque vue : plan de la vue -> plan de la reference (la premiere placee), ou null. */
  T: (Sim | null)[];
  gains: number[];
  liaisons: { i: number; j: number; accords: number }[];
}

/**
 * Place toutes les vues dans le plan de la premiere : on apparie d'abord les photos qui se suivent,
 * puis, si une photo reste a part, toutes les paires qui la relieraient. Chaque photo rejoint
 * l'ensemble par sa meilleure liaison.
 */
export function placer(vues: Vue[], sigs: Signature[], progres?: (i: number, j: number) => void): Placement {
  const n = vues.length;
  const T: (Sim | null)[] = vues.map((_, i) => (i === 0 ? ID : null));
  const gains = vues.map(() => 1);
  const liaisons: Placement['liaisons'] = [];
  if (n === 1) return { T, gains, liaisons };
  const cache = new Map<string, Appariement | null>();
  const app = (i: number, j: number) => {
    const c = `${i},${j}`;
    if (!cache.has(c)) {
      progres?.(i, j);
      cache.set(c, apparier(vues[i]!, sigs[i]!, vues[j]!, sigs[j]!));
    }
    return cache.get(c) ?? null;
  };
  // Une liaison i <- j, exprimee entre plans : plan j -> plan i.
  const entrePlans = (i: number, j: number, A: Appariement) => composer(travailVersPlan(vues[i]!), composer(A.S, inverser(travailVersPlan(vues[j]!))));
  const essayer = (paires: [number, number][]) => {
    for (;;) {
      let meilleur: { i: number; j: number; A: Appariement } | null = null;
      for (const [a, b] of paires)
        for (const [i, j] of [
          [a, b],
          [b, a],
        ] as [number, number][]) {
          if (!T[i] || T[j]) continue;
          const A = app(i, j);
          if (A && (!meilleur || A.accords > meilleur.A.accords)) meilleur = { i, j, A };
        }
      if (!meilleur) return;
      const { i, j, A } = meilleur;
      T[j] = composer(T[i]!, entrePlans(i, j, A));
      gains[j] = gains[i]! * A.gain;
      liaisons.push({ i, j, accords: A.accords });
    }
  };
  const suivantes: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) suivantes.push([i, i + 1]);
  essayer(suivantes);
  if (T.some((t) => !t)) {
    const toutes: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) toutes.push([i, j]);
    essayer(toutes);
  }
  return { T, gains, liaisons };
}

/* ------------------------------------------------------------------------------------------------
 * Rendu pleine resolution
 * --------------------------------------------------------------------------------------------- */

/** Les pixels utiles d'une photo d'origine : une region, a un facteur `k` pres. */
export interface Source {
  image: Image;
  ox: number;
  oy: number;
  k: number;
}

/** Region de la photo d'origine dont le rendu a besoin : le cadre du mur, ramene sur la photo. */
export function regionUtile(red: Redressement) {
  const b = red.boite;
  const pts: P2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    for (const q of [
      { x: b.x0 + t * (b.x1 - b.x0), y: b.y0 },
      { x: b.x0 + t * (b.x1 - b.x0), y: b.y1 },
      { x: b.x0, y: b.y0 + t * (b.y1 - b.y0) },
      { x: b.x1, y: b.y0 + t * (b.y1 - b.y0) },
    ]) {
      const p = versPhoto(red, q);
      if (p) pts.push(p);
    }
  }
  if (pts.length < 4) return { x0: 0, y0: 0, x1: red.largeurPhoto, y1: red.hauteurPhoto };
  return {
    x0: Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - 2)),
    y0: Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - 2)),
    x1: Math.min(red.largeurPhoto, Math.ceil(Math.max(...pts.map((p) => p.x)) + 2)),
    y1: Math.min(red.hauteurPhoto, Math.ceil(Math.max(...pts.map((p) => p.y)) + 2)),
  };
}

export interface Cadre {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Pixels de sortie par unite du plan de reference, a la resolution native. */
  native: number;
}

/** Le cadre de la fusion, dans le plan de la reference, et la resolution native. */
export function cadreFusion(reds: Redressement[], T: (Sim | null)[]): Cadre {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    native = 0;
  reds.forEach((r, i) => {
    const S = T[i];
    if (!S) return;
    const b = r.boite;
    for (const q of [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x1, y: b.y1 },
      { x: b.x0, y: b.y1 },
    ]) {
      const m = appliquerSim(S, q);
      x0 = Math.min(x0, m.x);
      y0 = Math.min(y0, m.y);
      x1 = Math.max(x1, m.x);
      y1 = Math.max(y1, m.y);
    }
    native = Math.max(native, r.densite / echelle(S));
  });
  return { x0, y0, x1, y1, native };
}

/* ------------------------------------------------------------------------------------------------
 * Coutures entre photos
 * --------------------------------------------------------------------------------------------- */

/**
 * Qui fournit chaque pixel : une grille basse resolution du cadre de fusion, ou chaque photo a un
 * poids de 0 a 1. Les poids viennent de coutures tracees la ou deux photos se ressemblent le plus
 * (un aplat d'enduit plutot qu'un porche en saillie, qui ne tombe pas au meme endroit sur les
 * deux), puis adoucies sur quelques pixels.
 */
export interface Coutures {
  l: number;
  h: number;
  /** Cases de la grille par unite du plan de reference. */
  pas: number;
  poids: (Float32Array | null)[];
}

/** Une couture qui suit la plus faible difference : programmation dynamique sur la bande commune. */
function couture(cout: Float32Array, l: number, h: number): Int32Array {
  // Une colonne x par ligne y, qui ne saute que d'une case d'une ligne a l'autre.
  const E = new Float32Array(l * h),
    D = new Int8Array(l * h);
  for (let x = 0; x < l; x++) E[x] = cout[x]!;
  for (let y = 1; y < h; y++)
    for (let x = 0; x < l; x++) {
      let m = E[(y - 1) * l + x]!,
        d = 0;
      if (x > 0 && E[(y - 1) * l + x - 1]! < m) [m, d] = [E[(y - 1) * l + x - 1]!, -1];
      if (x + 1 < l && E[(y - 1) * l + x + 1]! < m) [m, d] = [E[(y - 1) * l + x + 1]!, 1];
      E[y * l + x] = m + cout[y * l + x]!;
      D[y * l + x] = d;
    }
  const s = new Int32Array(h);
  let x = 0;
  for (let i = 1; i < l; i++) if (E[(h - 1) * l + i]! < E[(h - 1) * l + x]!) x = i;
  for (let y = h - 1; y >= 0; y--) {
    s[y] = x;
    x += D[y * l + x]!;
  }
  return s;
}

export function tracerCoutures(vues: Vue[], T: (Sim | null)[], gains: number[], cadre: Cadre, cases = 700): Coutures {
  const lw = cadre.x1 - cadre.x0,
    lh = cadre.y1 - cadre.y0;
  const pas = cases / Math.max(lw, lh);
  const l = Math.max(2, Math.round(lw * pas)),
    h = Math.max(2, Math.round(lh * pas));
  const n = vues.length;
  // Le gris de chaque photo sur la grille (NaN la ou elle ne voit rien).
  const gris: (Float32Array | null)[] = vues.map((v, i) => {
    const S = T[i];
    if (!S) return null;
    const inv = inverser(S);
    const g = new Float32Array(l * h).fill(NaN);
    const b = v.red.boite;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < l; x++) {
        const q = appliquerSim(inv, { x: cadre.x0 + (x + 0.5) / pas, y: cadre.y0 + (y + 0.5) / pas });
        const X = (q.x - b.x0) * v.fa - 0.5,
          Y = (q.y - b.y0) * v.fa - 0.5;
        const xi = Math.round(X),
          yi = Math.round(Y);
        if (xi < 0 || yi < 0 || xi >= v.g.l || yi >= v.g.h || !v.valide[yi * v.g.l + xi]) continue;
        g[y * l + x] = bilin(v.g, X, Y) * gains[i]!;
      }
    return g;
  });
  const etiquette = new Int16Array(l * h).fill(-1);
  for (let b = 0; b < n; b++) {
    const gb = gris[b];
    if (!gb) continue;
    // La bande commune avec ce qui est deja pose, et ce que b voit seul.
    let ox0 = l,
      ox1 = -1,
      oy0 = h,
      oy1 = -1,
      sx = 0,
      sy = 0,
      ns = 0,
      cx = 0,
      cy = 0,
      nc = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < l; x++) {
        const i = y * l + x;
        if (Number.isNaN(gb[i]!)) continue;
        if (etiquette[i]! >= 0) {
          ox0 = Math.min(ox0, x);
          ox1 = Math.max(ox1, x);
          oy0 = Math.min(oy0, y);
          oy1 = Math.max(oy1, y);
          cx += x;
          cy += y;
          nc++;
        } else {
          sx += x;
          sy += y;
          ns++;
        }
      }
    if (!nc) {
      for (let i = 0; i < l * h; i++) if (!Number.isNaN(gb[i]!) && etiquette[i]! < 0) etiquette[i] = b;
      continue;
    }
    if (!ns) continue; // b ne voit rien de plus : on garde ce qui est pose.
    // Bande haute et etroite (photos cote a cote) : couture verticale ; sinon horizontale.
    const verticale = oy1 - oy0 >= ox1 - ox0;
    const versPlus = verticale ? sx / ns > cx / nc : sy / ns > cy / nc;
    const U = verticale ? ox1 - ox0 + 1 : oy1 - oy0 + 1,
      V = verticale ? oy1 - oy0 + 1 : ox1 - ox0 + 1;
    const idx = (u: number, w: number) => (verticale ? (oy0 + w) * l + ox0 + u : (oy0 + u) * l + ox0 + w);
    const cout = new Float32Array(U * V);
    for (let w = 0; w < V; w++)
      for (let u = 0; u < U; u++) {
        const i = idx(u, w);
        const e = etiquette[i]!;
        const ga = e >= 0 ? gris[e]![i]! : NaN;
        const c = Number.isNaN(gb[i]!) || Number.isNaN(ga) ? 1e4 : Math.abs(ga - gb[i]!) + 0.5;
        cout[w * U + u] = c;
      }
    const s = couture(cout, U, V);
    for (let w = 0; w < V; w++)
      for (let u = 0; u < U; u++) {
        const i = idx(u, w);
        if (Number.isNaN(gb[i]!) || etiquette[i]! < 0) continue;
        if (versPlus ? u >= s[w]! : u <= s[w]!) etiquette[i] = b;
      }
    for (let i = 0; i < l * h; i++) if (!Number.isNaN(gb[i]!) && etiquette[i]! < 0) etiquette[i] = b;
  }
  // Masques adoucis : une jointure franche se verrait, une large fondrait la saillie en double.
  const poids = vues.map((_, i) => {
    if (!gris[i]) return null;
    const m = new Float32Array(l * h);
    for (let k = 0; k < l * h; k++) m[k] = etiquette[k] === i ? 1 : 0;
    return flou({ l, h, v: m }, 1.5).v;
  });
  return { l, h, pas, poids };
}

/**
 * Le rendu : chaque pixel de sortie va chercher son point sur chaque photo qui le voit. Dans un
 * recouvrement, chaque photo pese d'autant plus qu'on s'eloigne de son bord. Ce qu'aucune photo n'a
 * vu reste blanc.
 */
export function preparerRendu(reds: Redressement[], T: (Sim | null)[], gains: number[], sources: (Source | null)[], cadre: Cadre, px: number, cout: Coutures | null = null) {
  const L = Math.max(1, Math.round((cadre.x1 - cadre.x0) * px)),
    Hh = Math.max(1, Math.round((cadre.y1 - cadre.y0) * px));
  const sortie = new Uint8ClampedArray(L * Hh * 4);
  /** 1 la ou une photo a vu le mur : la detection des baies ignore le reste. */
  const vu = new Uint8Array(L * Hh);
  const actives = reds.map((_, i) => i).filter((i) => T[i] && sources[i]);
  const inv = reds.map((_, i) => (T[i] ? inverser(T[i]!) : ID));
  const seul = actives.length === 1;
  const acc = [0, 0, 0];
  const grilles: (Gris | null)[] = reds.map((_, i) => {
    const p = cout?.poids[i];
    return p && cout ? { l: cout.l, h: cout.h, v: p } : null;
  });

  function echantillon(s: Source, X: number, Y: number): boolean {
    const x = (X - s.ox) * s.k - 0.5,
      y = (Y - s.oy) * s.k - 0.5;
    const im = s.image;
    if (x < -0.5 || y < -0.5 || x > im.largeur - 0.5 || y > im.hauteur - 0.5) return false;
    const x0 = Math.max(0, Math.min(im.largeur - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(im.hauteur - 1, Math.floor(y)));
    const x1 = Math.min(im.largeur - 1, x0 + 1),
      y1 = Math.min(im.hauteur - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, x - x0)),
      fy = Math.max(0, Math.min(1, y - y0));
    const d = im.donnees,
      W = im.largeur;
    const a = (y0 * W + x0) * 4,
      b = (y0 * W + x1) * 4,
      e = (y1 * W + x0) * 4,
      f = (y1 * W + x1) * 4;
    for (let q = 0; q < 3; q++) acc[q] = (d[a + q]! * (1 - fx) + d[b + q]! * fx) * (1 - fy) + (d[e + q]! * (1 - fx) + d[f + q]! * fx) * fy;
    return true;
  }

  function lignes(y0: number, y1: number) {
    for (let Y = y0; Y < Math.min(y1, Hh); Y++) {
      const yr = cadre.y0 + (Y + 0.5) / px;
      for (let X = 0; X < L; X++) {
        const xr = cadre.x0 + (X + 0.5) / px;
        let sr = 0,
          sg = 0,
          sb = 0,
          sw = 0,
          cr = 0,
          cg = 0,
          cb = 0,
          cw = 0;
        // Case de la grille des coutures (interpolee).
        const gx = cout ? (xr - cadre.x0) * cout.pas - 0.5 : 0,
          gy = cout ? (yr - cadre.y0) * cout.pas - 0.5 : 0;
        for (const i of actives) {
          const r = reds[i]!,
            b = r.boite;
          const q = appliquerSim(inv[i]!, { x: xr, y: yr });
          if (q.x < b.x0 || q.x > b.x1 || q.y < b.y0 || q.y > b.y1) continue;
          const p = versPhoto(r, q);
          if (!p) continue;
          if (!echantillon(sources[i]!, p.x, p.y)) continue;
          let w = 1;
          if (!seul) {
            const wb = Math.min(q.x - b.x0, b.x1 - q.x, q.y - b.y0, b.y1 - q.y) / Math.min(b.x1 - b.x0, b.y1 - b.y0);
            const wp = Math.min(p.x, p.y, r.largeurPhoto - p.x, r.hauteurPhoto - p.y) / Math.max(r.largeurPhoto, r.hauteurPhoto);
            w = Math.max(1e-4, Math.min(wb, wp));
          }
          const g = gains[i]! * w;
          sr += acc[0]! * g;
          sg += acc[1]! * g;
          sb += acc[2]! * g;
          sw += w;
          const gm = grilles[i];
          if (gm && !seul) {
            const wc = bilin(gm, gx, gy);
            if (wc > 1e-3) {
              const gc = gains[i]! * wc;
              cr += acc[0]! * gc;
              cg += acc[1]! * gc;
              cb += acc[2]! * gc;
              cw += wc;
            }
          }
        }
        // Les coutures decident ; au bord de la grille, ou rien n'a ete decide, le fondu reprend.
        if (cw > 0.05) [sr, sg, sb, sw] = [cr, cg, cb, cw];
        const o = (Y * L + X) * 4;
        if (sw <= 0) {
          sortie[o] = sortie[o + 1] = sortie[o + 2] = sortie[o + 3] = 255;
          continue;
        }
        vu[Y * L + X] = 1;
        sortie[o] = sr / sw;
        sortie[o + 1] = sg / sw;
        sortie[o + 2] = sb / sw;
        sortie[o + 3] = 255;
      }
    }
  }
  return { largeur: L, hauteur: Hh, sortie, vu, lignes };
}
