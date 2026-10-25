// ORB : des points d'interet decrits par un motif binaire, pour retrouver la meme partie d'un mur sur deux photos
// (MD/spec-facades-calage-detection.md §8, fusion de plusieurs photos d'une facade).
//
// Trois temps, comme Rublee et al. (2011), sans bibliotheque :
//
// 1. **Les coins** : FAST-9 sur un cercle de 16 pixels (rayon 3) a trois echelles, le meilleur score gardant
//    la place d'un voisinage (suppression des non-maxima), puis les `POINTS_MAX` meilleurs repartis sur une
//    grille pour qu'un mur riche d'un cote ne prive pas l'autre de points.
// 2. **L'orientation** : le centre de gravite de l'intensite sur un disque de rayon 15 donne l'angle du point.
// 3. **Le descripteur** : 256 comparaisons de deux pixels d'un motif fixe (tire d'une graine : le meme motif
//    d'une execution a l'autre), tourne de l'angle du point, sur l'image lissee. Deux descripteurs se
//    comparent par la distance de Hamming.
//
// Une facade redressee a la meme echelle sur deux photos change peu de taille ni de rotation : les trois echelles
// couvrent surtout une resolution de source differente. Tout opere sur des tampons bruts (`Image`), sans navigateur.

import type { Image } from './homographie.js';

/** Un point d'interet : sa place sur l'image d'origine, son angle (radians) et son score FAST. */
export interface PointOrb {
  x: number;
  y: number;
  angle: number;
  score: number;
  /** L'echelle de la pyramide ou il a ete trouve (0 : la taille d'origine). */
  niveau: number;
}

/** Un point et son descripteur de 256 bits (8 mots de 32). */
export interface DescripteurOrb extends PointOrb {
  bits: Uint32Array;
}

/** Ce qui regle la detection. Les valeurs par defaut sont documentees une par une. */
export interface ReglagesOrb {
  /** Ecart de luminosite (0 a 255) au-dela duquel un pixel du cercle est « plus clair » ou « plus sombre » que le centre. */
  seuilFast: number;
  /** Combien de points au plus, au total (toutes echelles). */
  pointsMax: number;
  /** Combien d'echelles de la pyramide. */
  niveaux: number;
  /** Le rapport de taille d'une echelle a la suivante. */
  facteur: number;
  /** Un point d'une cellule de la grille de repartition au plus, a cette part de `pointsMax` pres (cellules de `cellule` pixels). */
  cellule: number;
}

export const REGLAGES_ORB: ReglagesOrb = {
  seuilFast: 10,
  pointsMax: 700,
  niveaux: 3,
  facteur: 1.4,
  cellule: 24,
};

/** Le rayon du disque de l'orientation, et la demi-taille du motif du descripteur : un point plus pres du bord est ecarte. */
const RAYON_ORIENTATION = 15;
const MARGE = 19;
/** Le nombre de bits d'un descripteur. */
export const BITS = 256;

/* ------------------------------------------------------------------------------------------------
 * Image en gris, pyramide, lissage
 * --------------------------------------------------------------------------------------------- */

interface Gris {
  l: number;
  h: number;
  d: Uint8Array;
}

function enGris(img: Image): Gris {
  const d = new Uint8Array(img.largeur * img.hauteur);
  for (let i = 0; i < d.length; i++) {
    const o = i * 4;
    d[i] = Math.round(0.299 * (img.donnees[o] ?? 0) + 0.587 * (img.donnees[o + 1] ?? 0) + 0.114 * (img.donnees[o + 2] ?? 0));
  }
  return { l: img.largeur, h: img.hauteur, d };
}

/** L'image reduite par `f` (> 1), par moyenne des pixels sources : sans repliement. */
function reduire(g: Gris, f: number): Gris {
  const l = Math.max(1, Math.floor(g.l / f)), h = Math.max(1, Math.floor(g.h / f));
  const d = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * f), y1 = Math.min(g.h, Math.max(y0 + 1, Math.floor((y + 1) * f)));
    for (let x = 0; x < l; x++) {
      const x0 = Math.floor(x * f), x1 = Math.min(g.l, Math.max(x0 + 1, Math.floor((x + 1) * f)));
      let s = 0, n = 0;
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) { s += g.d[j * g.l + i] as number; n++; }
      d[y * l + x] = Math.round(s / n);
    }
  }
  return { l, h, d };
}

/** Un lissage par moyenne glissante de 5 x 5 (deux passes separables) : ce que le descripteur compare. */
function lisser(g: Gris): Gris {
  const { l, h } = g;
  const tmp = new Float32Array(l * h), out = new Uint8Array(l * h);
  const R = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let s = 0;
      for (let k = -R; k <= R; k++) s += g.d[y * l + Math.min(l - 1, Math.max(0, x + k))] as number;
      tmp[y * l + x] = s / (2 * R + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let s = 0;
      for (let k = -R; k <= R; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * l + x] as number;
      out[y * l + x] = Math.round(s / (2 * R + 1));
    }
  }
  return { l, h, d: out };
}

/* ------------------------------------------------------------------------------------------------
 * 1. Les coins : FAST-9
 * --------------------------------------------------------------------------------------------- */

/** Le cercle de Bresenham de rayon 3 : 16 decalages (dx, dy), dans l'ordre autour du centre. */
const CERCLE: readonly (readonly [number, number])[] = [
  [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3],
  [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3],
];

/** Le score FAST d'un pixel : 0 s'il n'est pas un coin (pas neuf voisins de suite plus clairs ou plus sombres), sinon la somme des ecarts de l'arc. */
function scoreFast(g: Gris, x: number, y: number, seuil: number): number {
  const c = g.d[y * g.l + x] as number;
  const ecart = new Int16Array(16);
  for (let k = 0; k < 16; k++) {
    const [dx, dy] = CERCLE[k] as readonly [number, number];
    ecart[k] = (g.d[(y + dy) * g.l + x + dx] as number) - c;
  }
  // Une rejet rapide : aux quatre points cardinaux, au moins trois doivent passer le seuil du meme cote.
  let claires = 0, sombres = 0;
  for (const k of [0, 4, 8, 12]) { if ((ecart[k] as number) > seuil) claires++; else if ((ecart[k] as number) < -seuil) sombres++; }
  if (claires < 3 && sombres < 3) return 0;
  let meilleur = 0;
  for (const signe of [1, -1]) {
    let serie = 0, somme = 0;
    // Deux tours : une serie peut enjamber le point de depart.
    for (let k = 0; k < 32; k++) {
      const e = (ecart[k % 16] as number) * signe;
      if (e > seuil) {
        serie++; somme += e - seuil;
        if (serie >= 9 && somme > meilleur) meilleur = somme;
      } else { serie = 0; somme = 0; }
    }
  }
  return meilleur;
}

interface Candidat { x: number; y: number; score: number }

/** Les coins d'une echelle, apres suppression des non-maxima sur 3 x 3. */
function coins(g: Gris, seuil: number): Candidat[] {
  const scores = new Float32Array(g.l * g.h);
  for (let y = 3; y < g.h - 3; y++) for (let x = 3; x < g.l - 3; x++) scores[y * g.l + x] = scoreFast(g, x, y, seuil);
  const out: Candidat[] = [];
  for (let y = 3; y < g.h - 3; y++) {
    for (let x = 3; x < g.l - 3; x++) {
      const s = scores[y * g.l + x] as number;
      if (s <= 0) continue;
      let max = true;
      for (let j = -1; j <= 1 && max; j++) for (let i = -1; i <= 1; i++) {
        if ((i || j) && (scores[(y + j) * g.l + x + i] as number) > s) { max = false; break; }
        // A egalite, le premier dans l'ordre de balayage l'emporte : le resultat ne depend pas du hasard.
        if ((i || j) && (scores[(y + j) * g.l + x + i] as number) === s && (j < 0 || (j === 0 && i < 0))) { max = false; break; }
      }
      if (max) out.push({ x, y, score: s });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * 2. L'orientation, 3. le descripteur
 * --------------------------------------------------------------------------------------------- */

/** Un generateur reproductible (mulberry32) et une loi normale (Box-Muller) : le motif du descripteur ne change jamais. */
function generateur(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le motif : 256 paires de points dans un carre de 31 x 31 autour du centre, tirees d'une gaussienne (ecart 6). */
const MOTIF: readonly (readonly [number, number, number, number])[] = (() => {
  const rnd = generateur(0x0b5eed);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
  const borne = (v: number) => Math.max(-15, Math.min(15, Math.round(v)));
  return Array.from({ length: BITS }, () => [borne(6 * gauss()), borne(6 * gauss()), borne(6 * gauss()), borne(6 * gauss())] as const);
})();

/** L'angle du centre de gravite de l'intensite sur un disque, en radians. */
function orientation(g: Gris, x: number, y: number): number {
  let m01 = 0, m10 = 0;
  for (let j = -RAYON_ORIENTATION; j <= RAYON_ORIENTATION; j++) {
    for (let i = -RAYON_ORIENTATION; i <= RAYON_ORIENTATION; i++) {
      if (i * i + j * j > RAYON_ORIENTATION * RAYON_ORIENTATION) continue;
      const v = g.d[(y + j) * g.l + x + i] as number;
      m10 += i * v;
      m01 += j * v;
    }
  }
  return Math.atan2(m01, m10);
}

function descripteur(g: Gris, x: number, y: number, angle: number): Uint32Array {
  const bits = new Uint32Array(BITS / 32);
  const c = Math.cos(angle), s = Math.sin(angle);
  const lire = (dx: number, dy: number) => {
    const u = Math.round(c * dx - s * dy), v = Math.round(s * dx + c * dy);
    return g.d[(y + v) * g.l + x + u] as number;
  };
  for (let k = 0; k < BITS; k++) {
    const [x1, y1, x2, y2] = MOTIF[k] as readonly [number, number, number, number];
    if (lire(x1, y1) < lire(x2, y2)) bits[k >> 5] = ((bits[k >> 5] as number) | (1 << (k & 31))) >>> 0;
  }
  return bits;
}

/** L'image integrale des pixels non vus (1 = non vu) : de quoi savoir en O(1) si un carre en contient. */
function sommeInvalides(l: number, h: number, vu: Uint8Array): Int32Array {
  const s = new Int32Array((l + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let ligne = 0;
    for (let x = 0; x < l; x++) {
      ligne += vu[y * l + x] ? 0 : 1;
      s[(y + 1) * (l + 1) + x + 1] = (s[y * (l + 1) + x + 1] as number) + ligne;
    }
  }
  return s;
}

/** Le carre de demi-cote `r` autour de (x, y) ne contient-il que des pixels vus ? */
function voisinageVu(s: Int32Array, l: number, h: number, x: number, y: number, r: number): boolean {
  const x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r)), x1 = Math.min(l, Math.ceil(x + r) + 1), y1 = Math.min(h, Math.ceil(y + r) + 1);
  const W = l + 1;
  return (s[y1 * W + x1] as number) - (s[y0 * W + x1] as number) - (s[y1 * W + x0] as number) + (s[y0 * W + x0] as number) === 0;
}

/* ------------------------------------------------------------------------------------------------
 * Detection
 * --------------------------------------------------------------------------------------------- */

/**
 * Les points ORB d'une image : jusqu'a `pointsMax`, repartis sur une grille (un point par cellule a la fois, du
 * meilleur au pire), chacun avec son orientation et son descripteur. Les coordonnees sont celles de l'image d'origine.
 */
export function detecterOrb(img: Image, reglages: Partial<ReglagesOrb> = {}, vu?: Uint8Array): DescripteurOrb[] {
  const R = { ...REGLAGES_ORB, ...reglages };
  const base = enGris(img);
  const invalides = vu ? sommeInvalides(img.largeur, img.hauteur, vu) : null;
  const candidats: { x: number; y: number; score: number; niveau: number; echelle: number; g: Gris; lisse: Gris }[] = [];
  let g = base;
  for (let n = 0; n < R.niveaux; n++) {
    const echelle = Math.pow(R.facteur, n);
    if (n > 0) g = reduire(base, echelle);
    if (g.l < 2 * MARGE + 8 || g.h < 2 * MARGE + 8) break;
    const lisse = lisser(g);
    for (const c of coins(g, R.seuilFast)) {
      if (c.x < MARGE || c.y < MARGE || c.x >= g.l - MARGE || c.y >= g.h - MARGE) continue;
      // Un point dont le voisinage touche un pixel non vu (rempli, pas photographie) decrirait la bordure, pas le mur.
      if (invalides && !voisinageVu(invalides, img.largeur, img.hauteur, c.x * echelle, c.y * echelle, MARGE * echelle)) continue;
      candidats.push({ ...c, niveau: n, echelle, g, lisse });
    }
  }
  // Meilleurs d'abord, a score egal dans l'ordre de balayage : repartition deterministe.
  candidats.sort((a, b) => b.score - a.score || a.niveau - b.niveau || a.y - b.y || a.x - b.x);
  const pris = new Map<string, number>();
  const parCellule = Math.max(1, Math.ceil((R.pointsMax * 3) / Math.max(1, Math.ceil(img.largeur / R.cellule) * Math.ceil(img.hauteur / R.cellule))));
  const out: DescripteurOrb[] = [];
  for (const c of candidats) {
    if (out.length >= R.pointsMax) break;
    const X = c.x * c.echelle, Y = c.y * c.echelle;
    const cle = Math.floor(X / R.cellule) + ':' + Math.floor(Y / R.cellule);
    if ((pris.get(cle) ?? 0) >= parCellule) continue;
    pris.set(cle, (pris.get(cle) ?? 0) + 1);
    const angle = orientation(c.g, c.x, c.y);
    out.push({ x: X, y: Y, angle, score: c.score, niveau: c.niveau, bits: descripteur(c.lisse, c.x, c.y, angle) });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Appariement
 * --------------------------------------------------------------------------------------------- */

/** Le nombre de bits a 1 d'un mot de 32 bits. */
function popcount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** La distance de Hamming entre deux descripteurs, de 0 a 256. */
export function hamming(a: Uint32Array, b: Uint32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += popcount(((a[i] as number) ^ (b[i] as number)) >>> 0);
  return d;
}

/** Une correspondance : le point `i` de A et le point `j` de B, a la distance `distance` bits. */
export interface Appariement {
  i: number;
  j: number;
  distance: number;
}

/** Ce qui regle l'appariement. */
export interface ReglagesAppariement {
  /** Le meilleur voisin doit etre plus proche que ce rapport fois le second : sinon la correspondance est ambigue (motif repete). */
  ratio: number;
  /** Au-dela, deux descripteurs ne se ressemblent pas assez. */
  distanceMax: number;
  /**
   * La portee, en pixels : deux points de plus de cela l'un de l'autre ne sont pas apparies. Deux elevations d'un meme mur redressees
   * par leurs coins ne se decalent que de quelques decimetres : une fenetre qui en ressemble une autre a l'autre bout du mur n'est
   * pas une correspondance possible. 0 : pas de limite.
   */
  portee: number;
}

export const REGLAGES_APPARIEMENT: ReglagesAppariement = { ratio: 0.85, distanceMax: 80, portee: 0 };

/**
 * Les correspondances de A vers B : le plus proche voisin par Hamming, retenu si il passe le test du rapport au second et la
 * distance maximale, et si B le renvoie a A (verification croisee). Une facade repete ses fenetres et ses briques : le test du
 * rapport et la verification croisee ecartent les correspondances ambigues, RANSAC ecarte le reste.
 */
export function apparier(a: readonly DescripteurOrb[], b: readonly DescripteurOrb[], reglages: Partial<ReglagesAppariement> = {}): Appariement[] {
  const R = { ...REGLAGES_APPARIEMENT, ...reglages };
  if (!a.length || b.length < 2) return [];
  const meilleurB = new Int32Array(b.length).fill(-1);
  const distB = new Int32Array(b.length).fill(1 << 20);
  const aVersB: { j: number; d: number; second: number }[] = [];
  for (let i = 0; i < a.length; i++) {
    let j1 = -1, d1 = 1 << 20, d2 = 1 << 20;
    const ai = a[i] as DescripteurOrb;
    const bi = ai.bits;
    for (let j = 0; j < b.length; j++) {
      if (R.portee > 0 && Math.hypot((b[j] as DescripteurOrb).x - ai.x, (b[j] as DescripteurOrb).y - ai.y) > R.portee) continue;
      const d = hamming(bi, (b[j] as DescripteurOrb).bits);
      if (d < d1) { d2 = d1; d1 = d; j1 = j; } else if (d < d2) d2 = d;
      if (d < (distB[j] as number)) { distB[j] = d; meilleurB[j] = i; }
    }
    aVersB.push({ j: j1, d: d1, second: d2 });
  }
  const out: Appariement[] = [];
  aVersB.forEach(({ j, d, second }, i) => {
    if (j < 0 || d > R.distanceMax || d >= R.ratio * second) return;
    if (meilleurB[j] !== i) return;
    out.push({ i, j, distance: d });
  });
  return out;
}
