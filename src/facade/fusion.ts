// Fusion de plusieurs vues d'une meme partie du mur (MD/spec-facades-calage-detection.md §8, lot L13).
//
// La mosaique (facade/mosaique.ts) met des morceaux cote a cote. Ici, chaque photo montre le mur
// entier, de face ou de biais : une voiture, une haie ou un poteau cachent une baie sur l'une, pas
// sur l'autre. Quatre temps en font une seule elevation :
//
// 1. **Le meme repere.** Chaque photo est redressee par ses propres coins dans l'elevation du mur
//    (largeur du plan, hauteur mesuree par la perspective : la mediane des vues). Chaque pixel recoit
//    une **qualite** (spec §7) : la resolution de la photo source au mur, dans le sens le moins bien
//    vu (une vue de biais ecrase les largeurs), et une surexposition qui la fait tomber.
// 2. **Le recalage fin.** Des coins poses a quelques centimetres pres decalent les elevations les
//    unes des autres : le decalage en x et en y qui les fait coincider est cherche par correlation
//    normalisee, comme la mosaique, mais en deux dimensions et sur quelques decimetres seulement.
// 3. **Les occlusions par la parallaxe.** Ce qui est devant le mur n'est pas dans son plan : d'une
//    elevation a l'autre, le mur reste en place, l'obstacle se deplace. Le centre optique de chaque
//    vue se tire de son homographie et de sa focale ; un point a `r` metres devant le mur, vu en x sur
//    une vue, tombe donc en un point connu de l'autre. Un pixel ou deux vues ne s'accordent pas est
//    pris pour un obstacle sur la vue A quand son voisinage se retrouve sur la vue B a une distance
//    `r` > 0 devant le mur, et que B, regardee depuis ce point, renvoie au meme `r` (verification
//    croisee : un mur uni ou des baies repetees se ressemblent partout, mais pas dans les deux sens).
// 4. **La composition.** Pour chaque pixel : la vue de meilleure qualite hors obstacle ; avec trois
//    vues libres ou plus, la mediane. Ce qui reste cache sur toutes les vues forme le **masque
//    d'occlusion** : il sort du masque des pixels vus, et aucune ouverture n'y est detectee.
//
// Pas de navigateur ici : tout opere sur des images brutes et se teste sous Node.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, redresser, resolutionTexture, type Homographie, type Image, type P2 } from './homographie.js';
import { finaliserReleve, hauteurBande, mesurerHauteur, type MurDuReleve, type ResultatAnalyse } from './analyse.js';
import { focalePx as focaleParDefaut } from './cadrage.js';

/** Une photo du mur entier, ses coins (haut gauche, haut droit, bas droit, bas gauche) et sa focale. */
export interface VuePhoto {
  photo: Image;
  coins: P2[];
  /** Focale en pixels ; sans elle, les 67 degres par defaut. */
  focalePx: number | null;
}

export interface EntreeFusion extends MurDuReleve {
  vues: VuePhoto[];
  /** Largeur du mur, lue sur le plan. */
  largeur: number;
}

/** Ce que la fusion dit de chaque vue. */
export interface BilanVue {
  /** Decalage du recalage fin au milieu du mur, en metres (la vue est lue en x + dx, y + dy). */
  dxM: number;
  dyM: number;
  /** Ressemblance avec la vue de reference apres recalage, de -1 a 1 (1 pour la reference). */
  ressemblance: number;
  /** Qualite moyenne de la vue sur le mur, en pixels par metre au mur. */
  qualite: number;
  /** Part du mur vu ou cette vue montre un obstacle. */
  occultee: number;
  /** Part des pixels du mur pris sur cette vue (seule ou dans une mediane). */
  part: number;
}

export interface ResultatFusion extends ResultatAnalyse {
  vues: BilanVue[];
  /** L'indice de la vue de reference : la meilleure en moyenne. */
  reference: number;
  /** Part du mur cachee sur toutes les vues. */
  masque: number;
  /** Le masque d'occlusion restant, pixel par pixel de l'elevation (mur seul) : 1 = cache partout. */
  occlusion: Uint8Array;
  /** La vue retenue pour chaque pixel de l'elevation (mur seul), `MEDIANE` pour une mediane. */
  source: Uint8Array;
}

/** Plage du recalage fin entre deux elevations, en metres. */
export const PLAGE_RECALAGE_M = 0.3;
/** Resolution de l'analyse des occlusions : une fenetre de 7 x 7 pixels y couvre 28 cm. */
export const PX_PAR_M_OCCLUSION = 25;
/** Distance au mur jusqu'a laquelle on cherche un obstacle : une voiture, une haie, un poteau. */
export const RECUL_MAX_M = 3;
/** En deca, le deplacement d'un obstacle d'une vue a l'autre se confond avec un defaut de recalage. */
export const RECUL_MIN_M = 0.15;
/**
 * Deplacement minimal d'un obstacle d'une vue a l'autre, sur le mur : en deca, un faible recul
 * imite un recalage imparfait de quelques centimetres (le bord d'une vitre, un petit bois).
 */
export const DEPLACEMENT_MIN_M = 0.2;
/** Valeur de `source` pour un pixel compose par la mediane des vues. */
export const MEDIANE = 255;

const PAS_RECUL = 24;
const DEMI_FENETRE = 3;
/** Un pixel surexpose (les trois canaux a 250 ou plus) ne dit plus rien du mur. */
const SUREXPOSE = 250;

type V3 = [number, number, number];

/** Une vue redressee dans le repere commun. */
interface VueRedressee {
  image: Image;
  vu: Uint8Array;
  qualite: Float32Array;
  /** Centre optique dans le repere du mur : x vers la droite, y depuis l'egout vers le bas, z hors du plan. */
  centre: V3 | null;
}

/* ------------------------------------------------------------------------------------------------
 * 1. Le meme repere
 * --------------------------------------------------------------------------------------------- */

/** L'homographie du mur (x, y depuis l'egout, en metres) vers la photo. */
function homographieMur(coins: readonly P2[], largeur: number, hauteur: number): Homographie | null {
  return homographie(
    [
      { x: 0, y: 0 },
      { x: largeur, y: 0 },
      { x: largeur, y: hauteur },
      { x: 0, y: hauteur },
    ],
    coins,
  );
}

/**
 * Le centre optique d'une vue dans le repere du mur, d'apres l'homographie du mur vers la photo et
 * la focale (point principal au centre) : H ~ K [r1 r2 t], et le centre vaut -R^T t. `null` si la
 * decomposition est degeneree.
 */
export function centreOptique(H: Homographie, focale: number, cx: number, cy: number): V3 | null {
  const col = (k: number): V3 => {
    const a = H[k] ?? 0,
      b = H[3 + k] ?? 0,
      c = H[6 + k] ?? 0;
    return [(a - cx * c) / focale, (b - cy * c) / focale, c];
  };
  const m1 = col(0),
    m2 = col(1),
    m3 = col(2);
  const n = (v: V3) => Math.hypot(v[0], v[1], v[2]);
  const s = n(m1) + n(m2);
  if (!(s > 1e-12)) return null;
  // Le mur est devant l'objectif : la profondeur de son origine est positive.
  const lambda = (m3[2] >= 0 ? 2 : -2) / s;
  const r1 = m1.map((v) => v * lambda) as V3,
    r2 = m2.map((v) => v * lambda) as V3,
    t = m3.map((v) => v * lambda) as V3;
  const r3: V3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  const p = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const C: V3 = [-p(r1, t), -p(r2, t), -p(r3, t)];
  return C.every(Number.isFinite) && Math.abs(C[2]) > 0.5 ? C : null;
}

/**
 * La qualite de chaque pixel d'une elevation (spec §7) : la plus petite valeur singuliere du jacobien
 * du mur vers la photo - les pixels de la photo par metre de mur dans le sens le moins bien vu -,
 * ponderee par le rapport des deux (de face, c'est mieux) ; un pixel surexpose ne vaut presque rien.
 */
function carteQualite(H: Homographie, r: { image: Image; vu: Uint8Array }, pxParM: number, E: number): Float32Array {
  const { largeur: L, hauteur: Hh, donnees: d } = r.image;
  const q = new Float32Array(L * Hh);
  for (let y = 0; y < Hh; y++) {
    const Y = (y + 0.5) / pxParM - E;
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      if (!r.vu[i]) continue;
      const X = (x + 0.5) / pxParM;
      const w = H[6] * X + H[7] * Y + H[8];
      const u = (H[0] * X + H[1] * Y + H[2]) / w,
        v = (H[3] * X + H[4] * Y + H[5]) / w;
      const a = (H[0] - u * H[6]) / w,
        b = (H[1] - u * H[7]) / w,
        c = (H[3] - v * H[6]) / w,
        e = (H[4] - v * H[7]) / w;
      const s1 = a * a + c * c,
        s2 = b * b + e * e,
        s12 = a * b + c * e;
      const tr = (s1 + s2) / 2;
      const max = Math.sqrt(tr + Math.sqrt(Math.max(0, tr * tr - (s1 * s2 - s12 * s12))));
      const min = max > 0 ? Math.abs(a * e - b * c) / max : 0;
      let k = max > 0 ? min * Math.sqrt(min / max) : 0;
      if ((d[i * 4] ?? 0) >= SUREXPOSE && (d[i * 4 + 1] ?? 0) >= SUREXPOSE && (d[i * 4 + 2] ?? 0) >= SUREXPOSE) k *= 0.05;
      q[i] = k;
    }
  }
  return q;
}

/** Une vue redressee a la hauteur `hauteur`, avec la bande de `E` metres au-dessus de l'egout. */
function redresserVue(v: VuePhoto, largeur: number, hauteur: number, E: number, pxParM: number): VueRedressee | null {
  const H = homographieMur(v.coins, largeur, hauteur);
  if (!H) return null;
  const etendus = [
    { x: 0, y: -E },
    { x: largeur, y: -E },
    { x: largeur, y: hauteur },
    { x: 0, y: hauteur },
  ].map((q) => appliquer(H, q));
  const r = redresser(v.photo, etendus, largeur, hauteur + E, pxParM);
  if (!r) return null;
  const f = v.focalePx && v.focalePx > 0 ? v.focalePx : focaleParDefaut(v.photo.largeur, v.photo.hauteur);
  return { image: r.image, vu: r.vu, qualite: carteQualite(H, r, pxParM, E), centre: centreOptique(H, f, v.photo.largeur / 2, v.photo.hauteur / 2) };
}

/* ------------------------------------------------------------------------------------------------
 * 2. Le recalage fin
 * --------------------------------------------------------------------------------------------- */

/** Une image reduite d'un facteur entier, sur les lignes du mur : couleurs moyennes et pixels vus. */
interface Reduite {
  l: number;
  h: number;
  rgb: Float32Array;
  lum: Float32Array;
  vu: Uint8Array;
}

/** Les reductions deja faites : le recalage reprend les memes images a chaque niveau et chaque tiers. */
const reductions = new WeakMap<Uint8Array, Map<string, Reduite>>();

/** Les lignes `depuis`.. d'une elevation, reduites d'un facteur entier en moyennant les pixels vus. */
function reduire(img: Image, vu: Uint8Array, depuis: number, facteur: number): Reduite {
  const cle = depuis + ":" + facteur;
  const deja = reductions.get(vu)?.get(cle);
  if (deja) return deja;
  const r = reduireSansMemoire(img, vu, depuis, facteur);
  const m = reductions.get(vu) ?? new Map<string, Reduite>();
  m.set(cle, r);
  reductions.set(vu, m);
  return r;
}

function reduireSansMemoire(img: Image, vu: Uint8Array, depuis: number, facteur: number): Reduite {
  const l = Math.max(1, Math.floor(img.largeur / facteur)),
    h = Math.max(1, Math.floor((img.hauteur - depuis) / facteur));
  const rgb = new Float32Array(l * h * 3),
    n = new Float32Array(l * h);
  for (let y = 0; y < h * facteur; y++) {
    const ligne = (y + depuis) * img.largeur;
    const j0 = Math.floor(y / facteur) * l;
    for (let x = 0; x < l * facteur; x++) {
      const i = ligne + x;
      if (!vu[i]) continue;
      const j = j0 + Math.floor(x / facteur);
      for (let c = 0; c < 3; c++) rgb[j * 3 + c] = (rgb[j * 3 + c] ?? 0) + (img.donnees[i * 4 + c] ?? 0);
      n[j] = (n[j] ?? 0) + 1;
    }
  }
  const lum = new Float32Array(l * h),
    vuR = new Uint8Array(l * h);
  // Un pixel reduit n'est « vu » que si la moitie au moins de ses pixels l'etait.
  const min = (facteur * facteur) / 2;
  for (let j = 0; j < l * h; j++) {
    const c = n[j] ?? 0;
    if (c < min) continue;
    for (let k = 0; k < 3; k++) rgb[j * 3 + k] = (rgb[j * 3 + k] ?? 0) / c;
    lum[j] = 0.299 * (rgb[j * 3] ?? 0) + 0.587 * (rgb[j * 3 + 1] ?? 0) + 0.114 * (rgb[j * 3 + 2] ?? 0);
    vuR[j] = 1;
  }
  return { l, h, rgb, lum, vu: vuR };
}

/**
 * Correlation normalisee de A(x, y) et B(x + sx, y + sy), une ligne et une colonne sur `pas`, sur les
 * colonnes `x0` a `x1` de A (toutes par defaut).
 */
function correlation2D(A: Reduite, B: Reduite, sx: number, sy: number, pas: number, colonnes: readonly [number, number] = [0, A.l]): number {
  let n = 0,
    sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0;
  const y0 = Math.max(0, -sy),
    y1 = Math.min(A.h, B.h - sy),
    x0 = Math.max(colonnes[0], -sx),
    x1 = Math.min(colonnes[1], A.l, B.l - sx);
  for (let y = y0; y < y1; y += pas) {
    for (let x = x0; x < x1; x += pas) {
      const ia = y * A.l + x,
        ib = (y + sy) * B.l + x + sx;
      if (!A.vu[ia] || !B.vu[ib]) continue;
      const a = A.lum[ia] ?? 0,
        b = B.lum[ib] ?? 0;
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  if (n < 50) return -1;
  const cov = sab - (sa * sb) / n,
    va = saa - (sa * sa) / n,
    vb = sbb - (sb * sb) / n;
  return va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : -1;
}

type Images = { image: Image; vu: Uint8Array };

/** Un decalage en pixels de l'elevation, et la ressemblance qu'il donne. */
export interface Decalage {
  sx: number;
  sy: number;
  score: number;
}

/**
 * Le meilleur decalage autour de (sx, sy) a +/- `plagePx` pixels de l'elevation, cherche niveau par
 * niveau : chaque facteur de reduction affine le precedent. `colonnes` borne la partie comparee.
 */
function chercherDecalage(A: Images, B: Images, depuis: number, facteurs: number[], sx0: number, sy0: number, plagePx: number, colonnes: readonly [number, number] | null): Decalage {
  let sx = sx0,
    sy = sy0,
    score = -1,
    precedent = 0;
  for (const f of facteurs) {
    const a = reduire(A.image, A.vu, depuis, f),
      b = reduire(B.image, B.vu, depuis, f);
    const cx = Math.round(sx / f),
      cy = Math.round(sy / f);
    const R = precedent ? Math.ceil(precedent / f) + 1 : Math.max(1, Math.ceil(plagePx / f));
    const pas = f === 1 ? 2 : 1;
    const cols: [number, number] = colonnes ? [Math.floor(colonnes[0] / f), Math.ceil(colonnes[1] / f)] : [0, a.l];
    let meilleur = { x: cx, y: cy, s: -2 };
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const s = correlation2D(a, b, cx + dx, cy + dy, pas, cols);
        if (s > meilleur.s) meilleur = { x: cx + dx, y: cy + dy, s };
      }
    sx = meilleur.x * f;
    sy = meilleur.y * f;
    score = meilleur.s;
    precedent = f;
  }
  return { sx, sy, score };
}

/**
 * Le decalage (en pixels de l'elevation) qui fait coincider la vue `B` avec la reference `A` : B est
 * lue en (x + sx, y + sy). Recherche exhaustive a 10 px/m sur la plage, puis affinage a 33 px/m et au
 * pixel autour du meilleur.
 */
export function recalage2D(A: Images, B: Images, depuis: number, pxParM: number, plageM = PLAGE_RECALAGE_M): Decalage {
  const facteurs = [...new Set([Math.max(1, Math.round(pxParM / 10)), Math.max(1, Math.round(pxParM / 33)), 1])].sort((a, b) => b - a);
  const d = chercherDecalage(A, B, depuis, facteurs, 0, 0, plageM * pxParM, null);
  // Jamais au-dela de la plage : un pic plus loin serait une baie voisine, pas le meme mur.
  const max = Math.ceil(plageM * pxParM);
  return { sx: Math.max(-max, Math.min(max, d.sx)), sy: Math.max(-max, Math.min(max, d.sy)), score: d.score };
}

/** Un recalage qui varie lineairement le long du mur : (sx, sy) = (ax + bx x, ay + by x), en pixels. */
export interface RecalageLineaire extends Decalage {
  bx: number;
  by: number;
}

/** Ecart que le recalage local peut prendre autour du recalage global, en metres. */
const PLAGE_LOCALE_M = 0.08;

/**
 * Le recalage affine le long du mur. Des coins decales de quelques pixels sur une vue de biais ne
 * decalent pas l'elevation d'un bloc : le bout eloigne du mur bouge plus que le bout proche. Le
 * recalage global est donc repris sur chaque tiers du mur, et une droite passe par les trois.
 */
export function recalageLineaire(A: Images, B: Images, depuis: number, pxParM: number, global: Decalage): RecalageLineaire {
  const L = A.image.largeur;
  const facteurs = [...new Set([Math.max(1, Math.round(pxParM / 33)), 1])].sort((a, b) => b - a);
  const tiers = [0, 1, 2].map((k) => {
    const cols: [number, number] = [Math.round((k * L) / 3), Math.round(((k + 1) * L) / 3)];
    return { x: (cols[0] + cols[1]) / 2, ...chercherDecalage(A, B, depuis, facteurs, global.sx, global.sy, PLAGE_LOCALE_M * pxParM, cols) };
  });
  const surs = tiers.filter((t) => t.score > 0.3);
  if (surs.length < 2) return { ...global, bx: 0, by: 0 };
  // Moindres carres d'une droite par les tiers surs.
  const mx = surs.reduce((s, t) => s + t.x, 0) / surs.length;
  const vx = surs.reduce((s, t) => s + (t.x - mx) ** 2, 0);
  const pente = (f: (t: Decalage) => number) => (vx > 0 ? surs.reduce((s, t) => s + (t.x - mx) * (f(t) - surs.reduce((u, w) => u + f(w), 0) / surs.length), 0) / vx : 0);
  const bx = pente((t) => t.sx),
    by = pente((t) => t.sy);
  const ax = surs.reduce((s, t) => s + t.sx, 0) / surs.length - bx * mx,
    ay = surs.reduce((s, t) => s + t.sy, 0) / surs.length - by * mx;
  return { sx: ax, sy: ay, bx, by, score: global.score };
}

/** La vue lue en (x + sx(x), y + sy(x)) : image, pixels vus et qualite decales d'autant, colonne par colonne. */
function decaler(v: VueRedressee, r: RecalageLineaire, pxParM: number): VueRedressee {
  const { largeur: L, hauteur: H } = v.image;
  const donnees = new Uint8ClampedArray(L * H * 4),
    vu = new Uint8Array(L * H),
    qualite = new Float32Array(L * H);
  for (let x = 0; x < L; x++) {
    const xs = x + Math.round(r.sx + r.bx * x),
      dy = Math.round(r.sy + r.by * x);
    if (xs < 0 || xs >= L) continue;
    for (let y = 0; y < H; y++) {
      const ys = y + dy;
      if (ys < 0 || ys >= H) continue;
      const i = y * L + x,
        j = ys * L + xs;
      for (let c = 0; c < 4; c++) donnees[i * 4 + c] = v.image.donnees[j * 4 + c] ?? 0;
      vu[i] = v.vu[j] ?? 0;
      qualite[i] = v.qualite[j] ?? 0;
    }
  }
  // Le centre optique suit, au decalage du milieu du mur : le point x du repere commun est le point
  // x + s de la vue.
  const c = v.centre;
  const sx = r.sx + (r.bx * L) / 2,
    sy = r.sy + (r.by * L) / 2;
  const centre: V3 | null = c ? [c[0] - sx / pxParM, c[1] - sy / pxParM, c[2]] : null;
  return { image: { largeur: L, hauteur: H, donnees }, vu, qualite, centre };
}

/* ------------------------------------------------------------------------------------------------
 * 3. Les occlusions par la parallaxe
 * --------------------------------------------------------------------------------------------- */

/**
 * Le point du mur ou la vue de centre `Cb` voit ce que la vue de centre `Ca` voit en (x, y), si c'est
 * a `r` metres devant le mur. `null` si les deux vues ne sont pas du meme cote du mur.
 */
export function transfert(Ca: V3, Cb: V3, x: number, y: number, r: number): P2 | null {
  if (Ca[2] * Cb[2] <= 0) return null;
  const k = r / Math.abs(Ca[2]);
  if (k >= 0.9) return null;
  const P: V3 = [x + k * (Ca[0] - x), y + k * (Ca[1] - y), k * Ca[2]];
  const t = Cb[2] / (Cb[2] - P[2]);
  return { x: Cb[0] + (P[0] - Cb[0]) * t, y: Cb[1] + (P[1] - Cb[1]) * t };
}

/** La grille de l'analyse des occlusions : facteur de reduction, et passage d'un indice au mur. */
interface Grille {
  l: number;
  h: number;
  facteur: number;
  pxParM: number;
  /** Ligne de l'egout dans l'elevation etendue. */
  egout: number;
  E: number;
}

const centreX = (g: Grille, i: number) => ((i + 0.5) * g.facteur) / g.pxParM;
const centreY = (g: Grille, j: number) => (g.egout + (j + 0.5) * g.facteur) / g.pxParM - g.E;
const indiceDe = (g: Grille, q: P2): number => {
  const i = Math.floor((q.x * g.pxParM) / g.facteur),
    j = Math.floor(((q.y + g.E) * g.pxParM - g.egout) / g.facteur);
  return i < 0 || j < 0 || i >= g.l || j >= g.h ? -1 : j * g.l + i;
};

/** Somme glissante sur une fenetre carree, par une image integrale. */
function sommeFenetre(v: Float32Array, l: number, h: number, r: number): Float32Array {
  const I = new Float64Array((l + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let ligne = 0;
    for (let x = 0; x < l; x++) {
      ligne += v[y * l + x] ?? 0;
      I[(y + 1) * (l + 1) + x + 1] = (I[y * (l + 1) + x + 1] ?? 0) + ligne;
    }
  }
  const s = new Float32Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r),
      y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < l; x++) {
      const x0 = Math.max(0, x - r),
        x1 = Math.min(l, x + r + 1);
      s[y * l + x] = (I[y1 * (l + 1) + x1] ?? 0) - (I[y0 * (l + 1) + x1] ?? 0) - (I[y1 * (l + 1) + x0] ?? 0) + (I[y0 * (l + 1) + x0] ?? 0);
    }
  }
  return s;
}

/** Ce que la vue A dit d'elle-meme face a la vue B, pixel par pixel de la grille. */
interface Parallaxe {
  /** Ecart des voisinages au meme point du mur (r = 0). */
  ecart0: Float32Array;
  /** Plus petit ecart pour un recul de RECUL_MIN_M a RECUL_MAX_M, et le pas de recul qui le donne. */
  meilleur: Float32Array;
  pas: Int16Array;
}

/** Les reculs essayes, de 0 a RECUL_MAX_M. */
const reculs = Array.from({ length: PAS_RECUL + 1 }, (_, k) => (RECUL_MAX_M * k) / PAS_RECUL);

/**
 * Pour chaque pixel de A : l'ecart moyen (somme des carres des trois canaux, sur une fenetre) entre
 * son voisinage et celui de B au point ou B verrait la meme chose a `r` metres devant le mur.
 */
function parallaxe(g: Grille, A: Reduite, B: Reduite, Ca: V3, Cb: V3, gainB: number[]): Parallaxe {
  const n = g.l * g.h;
  const ecart0 = new Float32Array(n).fill(Infinity),
    meilleur = new Float32Array(n).fill(Infinity),
    pas = new Int16Array(n).fill(-1);
  const d = new Float32Array(n),
    ok = new Float32Array(n);
  const plein = (2 * DEMI_FENETRE + 1) ** 2 / 2;
  const kMin = Math.ceil((RECUL_MIN_M / RECUL_MAX_M) * PAS_RECUL);
  const [g0, g1, g2] = [au(gainB, 0), au(gainB, 1), au(gainB, 2)];
  const memeCote = Ca[2] * Cb[2] > 0;
  reculs.forEach((r, k) => {
    if (k > 0 && k < kMin) return;
    if (!memeCote) return;
    d.fill(0);
    ok.fill(0);
    // transfert() deroule ici : cette boucle tourne pour chaque pixel, chaque recul et chaque paire.
    const t = r / Math.abs(Ca[2]);
    if (t >= 0.9) return;
    const Pz = t * Ca[2],
      f = Cb[2] / (Cb[2] - Pz);
    for (let j = 0; j < g.h; j++) {
      const y = centreY(g, j);
      const Py = y + t * (Ca[1] - y);
      const qy = Cb[1] + (Py - Cb[1]) * f;
      const bj = Math.floor(((qy + g.E) * g.pxParM - g.egout) / g.facteur);
      if (bj < 0 || bj >= g.h) continue;
      for (let i = 0; i < g.l; i++) {
        const a = j * g.l + i;
        if (!A.vu[a]) continue;
        const x = centreX(g, i);
        const qx = Cb[0] + (x + t * (Ca[0] - x) - Cb[0]) * f;
        if (k > 0 && Math.hypot(qx - x, qy - y) < DEPLACEMENT_MIN_M) continue;
        const bi = Math.floor((qx * g.pxParM) / g.facteur);
        if (bi < 0 || bi >= g.l) continue;
        const b = bj * g.l + bi;
        if (!B.vu[b]) continue;
        const e0 = (A.rgb[a * 3] ?? 0) - (B.rgb[b * 3] ?? 0) * g0,
          e1 = (A.rgb[a * 3 + 1] ?? 0) - (B.rgb[b * 3 + 1] ?? 0) * g1,
          e2 = (A.rgb[a * 3 + 2] ?? 0) - (B.rgb[b * 3 + 2] ?? 0) * g2;
        d[a] = e0 * e0 + e1 * e1 + e2 * e2;
        ok[a] = 1;
      }
    }
    const S = sommeFenetre(d, g.l, g.h, DEMI_FENETRE),
      N = sommeFenetre(ok, g.l, g.h, DEMI_FENETRE);
    for (let a = 0; a < n; a++) {
      const m = au(N, a);
      if (m < plein || !A.vu[a]) continue;
      const v = au(S, a) / m;
      if (k === 0) ecart0[a] = v;
      else if (v < au(meilleur, a)) {
        meilleur[a] = v;
        pas[a] = k;
      }
    }
  });
  return { ecart0, meilleur, pas };
}

/** Le seuil d'ecart au-dela duquel deux vues ne s'accordent pas : bien au-dessus du bruit commun. */
function seuilAccord(p: Parallaxe): number {
  const v: number[] = [];
  for (let a = 0; a < p.ecart0.length; a += 3) {
    const e = au(p.ecart0, a);
    if (Number.isFinite(e)) v.push(e);
  }
  if (!v.length) return Infinity;
  v.sort((x, y) => x - y);
  return Math.max(300, 6 * au(v, Math.floor(v.length / 2)));
}

/**
 * Les pixels de A qui montrent un obstacle, d'apres la vue B : A et B ne s'accordent pas au meme point
 * du mur, le voisinage de A se retrouve sur B a un recul r > 0, et B, depuis ce point, retrouve A au
 * meme recul (a trois pas pres).
 */
function obstaclesDe(g: Grille, pAB: Parallaxe, pBA: Parallaxe, seuilAB: number, seuilBA: number, Ca: V3, Cb: V3): Uint8Array {
  const n = g.l * g.h;
  const occ = new Uint8Array(n);
  const deplace = (p: Parallaxe, seuil: number, a: number) => au(p.ecart0, a) > seuil && au(p.meilleur, a) < Math.min(seuil, 0.4 * au(p.ecart0, a)) && au(p.pas, a) > 0;
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.l; i++) {
      const a = j * g.l + i;
      if (!deplace(pAB, seuilAB, a)) continue;
      const k = au(pAB.pas, a);
      const q = transfert(Ca, Cb, centreX(g, i), centreY(g, j), au(reculs, k));
      const b = q ? indiceDe(g, q) : -1;
      if (b < 0 || !deplace(pBA, seuilBA, b)) continue;
      if (Math.abs(au(pBA.pas, b) - k) <= 3) occ[a] = 1;
    }
  return occ;
}

/** Dilatation (ou erosion) d'un masque binaire par un carre de rayon 1. */
function morpho(m: Uint8Array, l: number, h: number, dilater: boolean): Uint8Array {
  const s = new Uint8Array(l * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let v = dilater ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          const w = xx < 0 || yy < 0 || xx >= l || yy >= h ? (dilater ? 0 : 1) : (m[yy * l + xx] ?? 0);
          v = dilater ? v | w : v & w;
        }
      s[y * l + x] = v;
    }
  return s;
}

/** Plus petit obstacle retenu, en pixels de la grille : 16 pixels a 25 px/m, environ 0,025 m2. */
const TACHE_MIN = 16;

/**
 * Le masque sans ses taches de moins de `min` pixels (4-connexite) : un pixel isole au bord d'une
 * baie, la ou deux vues se recalent mal, n'est pas un obstacle.
 */
function sansPoussiere(m: Uint8Array, l: number, h: number, min: number): Uint8Array {
  const s = new Uint8Array(l * h);
  const vu = new Uint8Array(l * h);
  for (let a0 = 0; a0 < l * h; a0++) {
    if (!m[a0] || vu[a0]) continue;
    const tache = [a0];
    vu[a0] = 1;
    for (let t = 0; t < tache.length; t++) {
      const a = au(tache, t);
      const x = a % l,
        y = (a - x) / l;
      for (const n of [x > 0 ? a - 1 : -1, x < l - 1 ? a + 1 : -1, y > 0 ? a - l : -1, y < h - 1 ? a + l : -1]) {
        if (n < 0 || !m[n] || vu[n]) continue;
        vu[n] = 1;
        tache.push(n);
      }
    }
    if (tache.length >= min) for (const a of tache) s[a] = 1;
  }
  return s;
}

/** Le gain par canal qui ramene la vue B a l'exposition de la reference A : rapport des medianes. */
function gain(A: Reduite, B: Reduite): number[] {
  return [0, 1, 2].map((c) => {
    const med = (R: Reduite) => {
      const v: number[] = [];
      for (let j = 0; j < R.l * R.h; j += 2) if (R.vu[j]) v.push(R.rgb[j * 3 + c] ?? 0);
      v.sort((x, y) => x - y);
      return v.length ? au(v, Math.floor(v.length / 2)) : 0;
    };
    const a = med(A),
      b = med(B);
    return a > 1 && b > 1 ? Math.max(0.6, Math.min(1.6, a / b)) : 1;
  });
}

/**
 * Les obstacles de chaque vue, sur la grille : un pixel l'est s'il l'est face a l'une des autres vues.
 * Le masque est nettoye (fermeture, poussieres), etendu a l'obstacle entier (`etendre`), puis elargi
 * d'un pixel : le bord d'une haie deborde toujours.
 */
function occlusions(g: Grille, vues: VueRedressee[], reference: number): Uint8Array[] {
  const R = vues.map((v) => reduire(v.image, v.vu, g.egout, g.facteur));
  const gains = R.map((r) => gain(au(R, reference), r));
  const occ = vues.map(() => new Uint8Array(g.l * g.h));
  for (let a = 0; a < vues.length; a++)
    for (let b = a + 1; b < vues.length; b++) {
      const Ca = au(vues, a).centre,
        Cb = au(vues, b).centre;
      if (!Ca || !Cb || Ca[2] * Cb[2] <= 0) continue;
      // Les deux vues ramenees a l'exposition de la reference : B relativement a A, et l'inverse.
      const gAB = [0, 1, 2].map((c) => au(au(gains, b), c) / au(au(gains, a), c));
      const gBA = gAB.map((v) => 1 / v);
      const pAB = parallaxe(g, au(R, a), au(R, b), Ca, Cb, gAB),
        pBA = parallaxe(g, au(R, b), au(R, a), Cb, Ca, gBA);
      const sAB = seuilAccord(pAB),
        sBA = seuilAccord(pBA);
      const oa = obstaclesDe(g, pAB, pBA, sAB, sBA, Ca, Cb),
        ob = obstaclesDe(g, pBA, pAB, sBA, sAB, Cb, Ca);
      for (let i = 0; i < g.l * g.h; i++) {
        if (oa[i]) au(occ, a)[i] = 1;
        if (ob[i]) au(occ, b)[i] = 1;
      }
    }
  const mur = teinteDuMur(R, occ);
  return occ.map((m, k) => {
    const nette = sansPoussiere(morpho(morpho(m, g.l, g.h, true), g.l, g.h, false), g.l, g.h, TACHE_MIN);
    return morpho(etendre(nette, au(R, k), mur), g.l, g.h, true);
  });
}

/** La teinte du mur : la mediane, canal par canal, des pixels libres de toutes les vues. */
function teinteDuMur(R: Reduite[], occ: Uint8Array[]): number[] {
  return [0, 1, 2].map((c) => {
    const v: number[] = [];
    R.forEach((r, k) => {
      for (let j = 0; j < r.l * r.h; j += 3) if (r.vu[j] && !au(occ, k)[j]) v.push(r.rgb[j * 3 + c] ?? 0);
    });
    return v.length ? mediane(v) : 0;
  });
}

/** Ecart de teinte entre deux pixels d'une image reduite (ou un pixel et une teinte). */
const ecartTeinte = (r: Reduite, a: number, t: readonly number[]) => Math.hypot((r.rgb[a * 3] ?? 0) - au(t, 0), (r.rgb[a * 3 + 1] ?? 0) - au(t, 1), (r.rgb[a * 3 + 2] ?? 0) - au(t, 2));
const teinteDe = (r: Reduite, a: number) => [r.rgb[a * 3] ?? 0, r.rgb[a * 3 + 1] ?? 0, r.rgb[a * 3 + 2] ?? 0];

/** Ecart a la teinte du pixel de depart au-dela duquel on n est plus sur le meme obstacle. */
const SAUT_OBSTACLE = 20;
/** Ecart a la teinte du mur en deca duquel un pixel est le mur, pas l'obstacle. */
const ECART_MUR = 40;
/** Portee de l'extension depuis un pixel trouve par la parallaxe : 1,2 m a 25 px/m. */
const PORTEE_EXTENSION = 30;

/**
 * Etend les obstacles trouves par la parallaxe a l'obstacle entier. La parallaxe ne voit que ce qui a
 * du relief : le bord d'une voiture, ses vitres, ses roues ; le flanc uni de la carrosserie se
 * ressemble d'une vue a l'autre et ne se trahit pas. On le gagne de proche en proche : un voisin de
 * la teinte du pixel trouve (a SAUT_OBSTACLE pres, sans derive de proche en proche : les feuilles d'une
 * haie ne doivent pas mener a la vitre d'a cote), qui n'est pas de la teinte du mur, est le meme obstacle.
 */
function etendre(m: Uint8Array, r: Reduite, mur: readonly number[]): Uint8Array {
  const s = m.slice();
  const profondeur = new Int16Array(r.l * r.h).fill(-1);
  const origine = new Int32Array(r.l * r.h).fill(-1);
  const file: number[] = [];
  for (let a = 0; a < s.length; a++)
    if (s[a]) {
      profondeur[a] = 0;
      origine[a] = a;
      file.push(a);
    }
  for (let t = 0; t < file.length; t++) {
    const a = au(file, t);
    const p = au(profondeur, a);
    if (p >= PORTEE_EXTENSION) continue;
    const depart = teinteDe(r, au(origine, a));
    const x = a % r.l,
      y = (a - x) / r.l;
    const voisins = [x > 0 ? a - 1 : -1, x < r.l - 1 ? a + 1 : -1, y > 0 ? a - r.l : -1, y < r.h - 1 ? a + r.l : -1];
    for (const n of voisins) {
      if (n < 0 || s[n] || !r.vu[n]) continue;
      if (ecartTeinte(r, n, depart) > SAUT_OBSTACLE || ecartTeinte(r, n, mur) < ECART_MUR) continue;
      s[n] = 1;
      profondeur[n] = p + 1;
      origine[n] = au(origine, a);
      file.push(n);
    }
  }
  return s;
}

/* ------------------------------------------------------------------------------------------------
 * 4. La composition
 * --------------------------------------------------------------------------------------------- */

interface Composition {
  image: Image;
  vu: Uint8Array;
  /** Sur les lignes du mur : cache partout (1), et la vue retenue. */
  occlusion: Uint8Array;
  source: Uint8Array;
}

/** La mediane d'une petite liste (modifiee sur place). */
/** La mediane de trois valeurs, sans tri : le cas courant de la composition. */
const mediane3 = (a: number, b: number, c: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

function mediane(v: number[]): number {
  v.sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? au(v, m) : (au(v, m - 1) + au(v, m)) / 2;
}

/** La vue de meilleure qualite parmi les `n` premieres `candidates` qui voient le pixel `i`, ou -1. */
function meilleureVue(vues: VueRedressee[], candidates: number[], i: number, n = candidates.length): number {
  let k = -1,
    q = -1;
  for (let t = 0; t < n; t++) {
    const c = au(candidates, t);
    const v = au(vues, c);
    if (v.vu[i] && au(v.qualite, i) > q) {
      q = au(v.qualite, i);
      k = c;
    }
  }
  return k;
}

/**
 * Compose l'elevation : au-dessus de l'egout, la reference (la silhouette du toit ne se fond pas, un
 * long pan n'est pas dans le plan du mur) ; sur le mur, la meilleure vue libre, ou la mediane de trois
 * vues libres ou plus ; cache partout, la meilleure vue, hors du masque des pixels vus.
 */
function composer(g: Grille, vues: VueRedressee[], occ: Uint8Array[], reference: number): Composition {
  const ref = au(vues, reference);
  const { largeur: L, hauteur: Ht } = ref.image;
  const donnees = new Uint8ClampedArray(L * Ht * 4),
    vu = new Uint8Array(L * Ht);
  const Hm = Ht - g.egout;
  const occlusion = new Uint8Array(L * Hm),
    source = new Uint8Array(L * Hm);
  const toutes = vues.map((_, k) => k);
  const autres = toutes.filter((k) => k !== reference);
  const libres = new Array<number>(vues.length).fill(0),
    valeurs = new Array<number>(vues.length).fill(0);
  const copier = (k: number, i: number) => {
    const d = au(vues, k).image.donnees;
    donnees[i * 4] = d[i * 4] ?? 0;
    donnees[i * 4 + 1] = d[i * 4 + 1] ?? 0;
    donnees[i * 4 + 2] = d[i * 4 + 2] ?? 0;
    vu[i] = 1;
  };
  for (let y = 0; y < Ht; y++)
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      donnees[i * 4 + 3] = 255;
      if (y < g.egout) {
        const k = ref.vu[i] ? reference : meilleureVue(vues, autres, i);
        if (k >= 0) copier(k, i);
        continue;
      }
      const m = (y - g.egout) * L + x;
      const gi = Math.min(g.l - 1, Math.floor(x / g.facteur)),
        gj = Math.min(g.h - 1, Math.floor((y - g.egout) / g.facteur));
      // Les vues libres en ce pixel (sans tableau neuf : cette boucle passe sur chaque pixel du mur).
      let n = 0;
      for (let k = 0; k < vues.length; k++) if (au(vues, k).vu[i] && !au(au(occ, k), gj * g.l + gi)) libres[n++] = k;
      if (n >= 3) {
        for (let c = 0; c < 3; c++) {
          for (let t = 0; t < n; t++) valeurs[t] = au(au(vues, au(libres, t)).image.donnees, i * 4 + c);
          donnees[i * 4 + c] = n === 3 ? mediane3(au(valeurs, 0), au(valeurs, 1), au(valeurs, 2)) : mediane(valeurs.slice(0, n));
        }
        vu[i] = 1;
        source[m] = MEDIANE;
        continue;
      }
      const k = n ? meilleureVue(vues, libres, i, n) : meilleureVue(vues, toutes, i);
      if (k < 0) continue;
      copier(k, i);
      source[m] = k;
      if (!n) {
        // Cache sur toutes les vues : la texture montre l'obstacle, la detection n'y cherche rien.
        vu[i] = 0;
        occlusion[m] = 1;
      }
    }
  return { image: { largeur: L, hauteur: Ht, donnees }, vu, occlusion, source };
}

/* ------------------------------------------------------------------------------------------------
 * L'enchainement
 * --------------------------------------------------------------------------------------------- */

/** La hauteur commune des vues : la mediane de celles que la perspective mesure, sinon l'estimation. */
function hauteurDesVues(e: EntreeFusion): { hauteur: number; mesuree: boolean } {
  const h = e.vues.flatMap((v) => {
    const m = v.focalePx ? mesurerHauteur(v.coins, e.largeur, v.focalePx, v.photo.largeur, v.photo.hauteur) : null;
    return m === null ? [] : [m];
  });
  return h.length ? { hauteur: Math.round(mediane(h) * 100) / 100, mesuree: true } : { hauteur: e.hauteur, mesuree: false };
}

/** La qualite moyenne d'une vue sur les lignes du mur. */
function qualiteMoyenne(v: VueRedressee, egout: number): number {
  let s = 0,
    n = 0;
  for (let i = egout * v.image.largeur; i < v.qualite.length; i++) {
    s += au(v.qualite, i);
    n++;
  }
  return n ? s / n : 0;
}

/** Ce que la fusion dit de chaque vue : son recalage, sa qualite, ses obstacles, sa part du mur. */
function bilans(vues: VueRedressee[], occ: Uint8Array[], c: Composition, g: Grille, recalages: RecalageLineaire[], qualites: number[]): BilanVue[] {
  const L = c.image.largeur;
  const total = c.source.length;
  return vues.map((v, k) => {
    let vus = 0,
      occultes = 0,
      part = 0;
    for (let m = 0; m < total; m++) {
      const i = g.egout * L + m;
      if (!v.vu[i]) continue;
      vus++;
      const x = m % L,
        y = Math.floor(m / L);
      const gi = Math.min(g.l - 1, Math.floor(x / g.facteur)),
        gj = Math.min(g.h - 1, Math.floor(y / g.facteur));
      if (au(occ, k)[gj * g.l + gi]) occultes++;
      else if (c.source[m] === k || c.source[m] === MEDIANE) part++;
    }
    const r = au(recalages, k);
    const arrondi = (x: number) => Math.round(x * 1000) / 1000;
    // Le decalage au milieu du mur : le recalage varie le long du mur (recalageLineaire).
    return { dxM: arrondi((r.sx + (r.bx * L) / 2) / g.pxParM), dyM: arrondi((r.sy + (r.by * L) / 2) / g.pxParM), ressemblance: Math.round(r.score * 100) / 100, qualite: Math.round(au(qualites, k) * 10) / 10, occultee: vus ? arrondi(occultes / vus) : 0, part: arrondi(part / total) };
  });
}

/**
 * Plusieurs vues du meme mur (de face, de biais), fondues en un seul releve : la hauteur mesuree, le
 * recalage fin, le masque d'occlusion, la composition, puis la suite commune (ouvertures, toit,
 * texture). `null` si aucune vue ne se redresse.
 */
export function analyserVues(e: EntreeFusion): ResultatFusion | null {
  if (!e.vues.length) return null;
  const { hauteur, mesuree } = hauteurDesVues(e);
  const E = hauteurBande(e.largeur);
  const pxParM = resolutionTexture(e.largeur, hauteur + E);
  const brutes = e.vues.map((v) => redresserVue(v, e.largeur, hauteur, E, pxParM));
  if (brutes.some((v) => !v)) return null;
  const redressees = brutes as VueRedressee[];
  const egout = Math.round(E * pxParM);
  const qualites = redressees.map((v) => qualiteMoyenne(v, egout));
  const reference = qualites.indexOf(Math.max(...qualites));
  const ref = au(redressees, reference);
  const recalages: RecalageLineaire[] = redressees.map((v, k) => (k === reference ? { sx: 0, sy: 0, bx: 0, by: 0, score: 1 } : recalageLineaire(ref, v, egout, pxParM, recalage2D(ref, v, egout, pxParM))));
  const vues = redressees.map((v, k) => (k === reference ? v : decaler(v, au(recalages, k), pxParM)));
  const facteur = Math.max(1, Math.round(pxParM / PX_PAR_M_OCCLUSION));
  const g: Grille = { facteur, pxParM, egout, E, l: Math.max(1, Math.floor(ref.image.largeur / facteur)), h: Math.max(1, Math.floor((ref.image.hauteur - egout) / facteur)) };
  const occ = vues.length > 1 ? occlusions(g, vues, reference) : vues.map(() => new Uint8Array(g.l * g.h));
  const c = composer(g, vues, occ, reference);
  const res = finaliserReleve(c.image, c.vu, E, pxParM, { ...e, hauteur }, null, mesuree);
  const masque = c.occlusion.reduce((s, v) => s + v, 0) / Math.max(1, c.occlusion.length);
  return { ...res, vues: bilans(vues, occ, c, g, recalages, qualites), reference, masque: Math.round(masque * 1000) / 1000, occlusion: c.occlusion, source: c.source };
}
