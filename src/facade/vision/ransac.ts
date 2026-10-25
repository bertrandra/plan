// RANSAC : le recalage de deux elevations de facade a partir de correspondances dont une partie est fausse
// (MD/spec-facades-calage-detection.md §8).
//
// Deux photos redressees a la meme echelle d'un meme mur different d'une **similitude** : une translation, un peu
// d'echelle (resolutions de sources differentes) et, si les coins ne sont pas parfaits, un peu de rotation. Quatre
// parametres : x' = a x - b y + tx ; y' = b x + a y + ty, avec a = s cos(t), b = s sin(t). Deux correspondances
// suffisent a la fixer (en nombres complexes : z' = c z + t, c = a + ib), d'ou un tirage minimal de deux paires.
//
// Le tirage est **deterministe** (graine fixe) : rejouer le calcul donne le meme resultat, au bit pres.

import type { P2 } from './homographie.js';

/** x' = a x - b y + tx ; y' = b x + a y + ty. */
export interface Similitude {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITE: Similitude = { a: 1, b: 0, tx: 0, ty: 0 };

/** Une correspondance : un point de A et son homologue de B. */
export interface Paire {
  de: P2;
  vers: P2;
}

export const appliquerSimilitude = (s: Similitude, p: P2): P2 => ({ x: s.a * p.x - s.b * p.y + s.tx, y: s.b * p.x + s.a * p.y + s.ty });

/** L'echelle d'une similitude. */
export const echelleDe = (s: Similitude): number => Math.hypot(s.a, s.b);
/** Sa rotation, en degres. */
export const rotationDeg = (s: Similitude): number => (Math.atan2(s.b, s.a) * 180) / Math.PI;

/** La composee : d'abord `premiere`, puis `seconde`. */
export function composer(seconde: Similitude, premiere: Similitude): Similitude {
  return {
    a: seconde.a * premiere.a - seconde.b * premiere.b,
    b: seconde.b * premiere.a + seconde.a * premiere.b,
    tx: seconde.a * premiere.tx - seconde.b * premiere.ty + seconde.tx,
    ty: seconde.b * premiere.tx + seconde.a * premiere.ty + seconde.ty,
  };
}

/** L'inverse ; `null` pour une similitude degeneree (echelle nulle). */
export function inverse(s: Similitude): Similitude | null {
  const n = s.a * s.a + s.b * s.b;
  if (n < 1e-12) return null;
  const a = s.a / n, b = -s.b / n;
  return { a, b, tx: -(a * s.tx - b * s.ty), ty: -(b * s.tx + a * s.ty) };
}

/** La similitude qui envoie les deux points de A sur les deux points de B ; `null` si les deux points de A se confondent. */
function depuisDeuxPaires(p: Paire, q: Paire): Similitude | null {
  const dx = q.de.x - p.de.x, dy = q.de.y - p.de.y;
  const n = dx * dx + dy * dy;
  if (n < 1e-9) return null;
  const ex = q.vers.x - p.vers.x, ey = q.vers.y - p.vers.y;
  // c = (ex + i ey) / (dx + i dy)
  const a = (ex * dx + ey * dy) / n, b = (ey * dx - ex * dy) / n;
  return { a, b, tx: p.vers.x - (a * p.de.x - b * p.de.y), ty: p.vers.y - (b * p.de.x + a * p.de.y) };
}

/** Les moindres carres sur un ensemble de paires (forme fermee, en nombres complexes) ; `null` sans deux points distincts. */
export function ajuster(paires: readonly Paire[]): Similitude | null {
  const n = paires.length;
  if (n < 2) return null;
  let cx = 0, cy = 0, ux = 0, uy = 0;
  for (const p of paires) { cx += p.de.x; cy += p.de.y; ux += p.vers.x; uy += p.vers.y; }
  cx /= n; cy /= n; ux /= n; uy /= n;
  let re = 0, im = 0, norme = 0;
  for (const p of paires) {
    const zx = p.de.x - cx, zy = p.de.y - cy, wx = p.vers.x - ux, wy = p.vers.y - uy;
    // somme de conj(z) * w
    re += zx * wx + zy * wy;
    im += zx * wy - zy * wx;
    norme += zx * zx + zy * zy;
  }
  if (norme < 1e-9) return null;
  const a = re / norme, b = im / norme;
  return { a, b, tx: ux - (a * cx - b * cy), ty: uy - (b * cx + a * cy) };
}

/** Un generateur reproductible (mulberry32). */
function generateur(graine: number): () => number {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ReglagesRansac {
  /** Une paire est un inlier quand sa distance residuelle est sous ce seuil, en pixels. */
  seuilPx: number;
  /** Au plus ce nombre de tirages. */
  iterationsMax: number;
  /** La probabilite voulue de n'avoir tire qu'inliers au moins une fois : arrete plus tot quand elle est atteinte. */
  confiance: number;
  /** La graine du generateur : rejouer donne le meme modele. */
  graine: number;
}

export const REGLAGES_RANSAC: ReglagesRansac = { seuilPx: 3, iterationsMax: 800, confiance: 0.995, graine: 12345 };

export interface ResultatRansac {
  modele: Similitude;
  /** Les indices des paires retenues. */
  inliers: number[];
  /** L'ecart quadratique moyen des inliers apres l'ajustement final, en pixels. */
  rms: number;
}

const residu = (s: Similitude, p: Paire): number => {
  const q = appliquerSimilitude(s, p.de);
  return Math.hypot(q.x - p.vers.x, q.y - p.vers.y);
};

/**
 * La similitude qui explique le plus de paires. `null` quand il n'y en a pas assez (moins de deux) ou qu'aucun tirage ne tient.
 * Le modele final est ajuste sur tous les inliers, puis les inliers sont recomptes une fois.
 */
export function ransacSimilitude(paires: readonly Paire[], reglages: Partial<ReglagesRansac> = {}): ResultatRansac | null {
  const R = { ...REGLAGES_RANSAC, ...reglages };
  const n = paires.length;
  if (n < 2) return null;
  const rnd = generateur(R.graine);
  let meilleur: { modele: Similitude; inliers: number[] } | null = null;
  let iterations = R.iterationsMax;
  for (let t = 0; t < iterations; t++) {
    const i = Math.floor(rnd() * n);
    let j = Math.floor(rnd() * (n - 1));
    if (j >= i) j++;
    const m = depuisDeuxPaires(paires[i] as Paire, paires[j] as Paire);
    if (!m) continue;
    const inliers: number[] = [];
    for (let k = 0; k < n; k++) if (residu(m, paires[k] as Paire) <= R.seuilPx) inliers.push(k);
    if (!meilleur || inliers.length > meilleur.inliers.length) {
      meilleur = { modele: m, inliers };
      // Le nombre de tirages qui suffit pour avoir tire au moins une fois un echantillon sans faux, avec cette part d'inliers.
      const part = inliers.length / n;
      if (part > 0 && part < 1) iterations = Math.min(R.iterationsMax, Math.ceil(Math.log(1 - R.confiance) / Math.log(1 - part * part)));
      else if (part >= 1) iterations = Math.min(iterations, t + 1);
    }
  }
  if (!meilleur || meilleur.inliers.length < 2) return null;
  // L'ajustement final sur les inliers, puis un dernier comptage avec le modele ajuste.
  let modele = ajuster(meilleur.inliers.map((k) => paires[k] as Paire)) ?? meilleur.modele;
  let inliers: number[] = [];
  for (let k = 0; k < n; k++) if (residu(modele, paires[k] as Paire) <= R.seuilPx) inliers.push(k);
  if (inliers.length >= 2) {
    modele = ajuster(inliers.map((k) => paires[k] as Paire)) ?? modele;
    inliers = [];
    for (let k = 0; k < n; k++) if (residu(modele, paires[k] as Paire) <= R.seuilPx) inliers.push(k);
  }
  if (inliers.length < 2) return null;
  const rms = Math.sqrt(inliers.reduce((s, k) => s + residu(modele, paires[k] as Paire) ** 2, 0) / inliers.length);
  return { modele, inliers, rms };
}
