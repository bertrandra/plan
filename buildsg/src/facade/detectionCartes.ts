// Les cartes de travail de la detection des ouvertures (MD/spec-facades-calage-detection.md §9) :
// l'elevation reduite a 5 cm, la morphologie, les taches, et les medianes glissantes qui donnent le
// fond local du mur.
//
// Tout se fait a 20 pixels par metre : largement assez pour trouver une baie, et vingt-cinq fois moins
// de pixels que l'elevation. Les bords sont ensuite affines au centimetre sur l'elevation elle-meme.

import { au } from '../util/tableaux.js';
import type { Image } from './homographie.js';

/** Resolution de travail : 20 pixels par metre, soit 5 cm. Largement assez pour une baie. */
export const PX_PAR_M = 20;

/** L'elevation reduite : trois canaux par pixel, et les pixels vus. */
export interface Reduite {
  rgb: Float32Array;
  vu: Uint8Array;
  l: number;
  h: number;
}

/** Reduit l'elevation a la resolution de travail, en moyennant les pixels vus. */
export function reduire(img: Image, pxParM: number, vu: Uint8Array | null): Reduite {
  const f = pxParM / PX_PAR_M;
  const l = Math.max(1, Math.round(img.largeur / f));
  const h = Math.max(1, Math.round(img.hauteur / f));
  const rgb = new Float32Array(l * h * 3);
  const n = new Float32Array(l * h);
  for (let y = 0; y < img.hauteur; y++) {
    const ry = Math.min(h - 1, Math.floor(y / f));
    for (let x = 0; x < img.largeur; x++) {
      const i = y * img.largeur + x;
      if (vu && !vu[i]) continue;
      const r = ry * l + Math.min(l - 1, Math.floor(x / f));
      rgb[r * 3] = (rgb[r * 3] ?? 0) + (img.donnees[i * 4] ?? 0);
      rgb[r * 3 + 1] = (rgb[r * 3 + 1] ?? 0) + (img.donnees[i * 4 + 1] ?? 0);
      rgb[r * 3 + 2] = (rgb[r * 3 + 2] ?? 0) + (img.donnees[i * 4 + 2] ?? 0);
      n[r] = (n[r] ?? 0) + 1;
    }
  }
  const vuR = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) {
    const k = n[i] ?? 0;
    if (k > 0) {
      rgb[i * 3] = (rgb[i * 3] ?? 0) / k;
      rgb[i * 3 + 1] = (rgb[i * 3 + 1] ?? 0) / k;
      rgb[i * 3 + 2] = (rgb[i * 3 + 2] ?? 0) / k;
      vuR[i] = 1;
    }
  }
  return { rgb, vu: vuR, l, h };
}

export function mediane(valeurs: number[]): number {
  if (!valeurs.length) return 0;
  const s = [...valeurs].sort((a, b) => a - b);
  return au(s, Math.floor(s.length / 2));
}

/**
 * La mediane, canal par canal, des pixels `garder` d'une carte a `k` canaux, a l'unite (par
 * histogramme : en temps lineaire, sans trier des dizaines de milliers de valeurs).
 */
export function medianeMasquee(valeurs: Float32Array, k: number, garder: Uint8Array): number[] {
  const histo = new Int32Array(256 * k);
  let n = 0;
  for (let i = 0; i < garder.length; i++) {
    if (!garder[i]) continue;
    n++;
    for (let c = 0; c < k; c++) {
      const b = Math.max(0, Math.min(255, Math.round(valeurs[i * k + c] ?? 0)));
      histo[c * 256 + b] = (histo[c * 256 + b] ?? 0) + 1;
    }
  }
  const res: number[] = [];
  for (let c = 0; c < k; c++) {
    let cumul = 0,
      b = 0;
    for (; b < 255; b++) {
      cumul += histo[c * 256 + b] ?? 0;
      if (cumul > n / 2) break;
    }
    res.push(n ? b : 0);
  }
  return res;
}

/** Dilatation (max) ou erosion (min) d'une carte binaire, sur un voisinage 3x3. */
export function morpho(b: Uint8Array, l: number, h: number, dilater: boolean): Uint8Array {
  const out = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let v = dilater ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          // Hors de l'image : neutre pour la dilatation, et pour l'erosion aussi - une fenetre qui
          // touche le bord de la photo ne doit pas etre rongee par ce bord.
          if (xx < 0 || yy < 0 || xx >= l || yy >= h) continue;
          const p = b[yy * l + xx] ?? 0;
          if (dilater ? p : !p) v = dilater ? 1 : 0;
        }
      }
      out[y * l + x] = v;
    }
  }
  return out;
}

export interface Tache {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
  /** Le numero de la tache dans la carte des etiquettes (a partir de 1). */
  id: number;
}

/** Composantes 4-connexes d'une carte binaire, et la carte de leurs etiquettes. */
export function taches(b: Uint8Array, l: number, h: number): { taches: Tache[]; etiquettes: Int32Array } {
  const etiquettes = new Int32Array(l * h);
  const res: Tache[] = [];
  const pile: number[] = [];
  for (let i = 0; i < l * h; i++) {
    if (!b[i] || etiquettes[i]) continue;
    const t: Tache = { x0: l, y0: h, x1: -1, y1: -1, n: 0, id: res.length + 1 };
    etiquettes[i] = t.id;
    pile.push(i);
    while (pile.length) {
      const j = pile.pop();
      if (j === undefined) break;
      const x = j % l,
        y = (j - x) / l;
      t.n++;
      if (x < t.x0) t.x0 = x;
      if (x > t.x1) t.x1 = x;
      if (y < t.y0) t.y0 = y;
      if (y > t.y1) t.y1 = y;
      const voisins = [x > 0 ? j - 1 : -1, x < l - 1 ? j + 1 : -1, y > 0 ? j - l : -1, y < h - 1 ? j + l : -1];
      for (const k of voisins) {
        if (k >= 0 && b[k] && !etiquettes[k]) {
          etiquettes[k] = t.id;
          pile.push(k);
        }
      }
    }
    res.push(t);
  }
  return { taches: res, etiquettes };
}

/** Une carte a `k` valeurs par pixel, et les pixels ou elle est connue. */
export interface CarteK {
  v: Float32Array;
  ok: Uint8Array;
}

/**
 * Mediane glissante (ou tout autre quantile), canal par canal, des pixels `garder` sur une fenetre de
 * (2 rx + 1) x (2 ry + 1) pixels. Histogrammes glissants, et quantile suivi d'un pixel au suivant (il
 * bouge peu) : le cout ne depend pas de la taille de la fenetre. Un pixel dont la fenetre compte moins
 * de `partMin` de pixels gardes reste inconnu (`ok` a 0) : son fond se lit ailleurs. Les valeurs sont
 * prises entre 0 et 255, a l'unite.
 */
export function medianeGlissante(valeurs: Float32Array, k: number, garder: Uint8Array, l: number, h: number, rx: number, ry: number, partMin: number, quantile = 0.5): CarteK {
  const v = new Float32Array(l * h * k);
  const ok = new Uint8Array(l * h);
  const histo = new Int32Array(256 * k);
  // Pour chaque canal : la case du quantile courant, et le nombre de valeurs sous elle.
  const med = new Int32Array(k),
    sous = new Int32Array(k);
  // Les valeurs a l'unite, une fois pour toutes (Uint8ClampedArray arrondit et borne).
  const qv = new Uint8ClampedArray(valeurs);
  const colonne = (x: number, y0: number, y1: number, signe: number): number => {
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const i = y * l + x;
      if (!garder[i]) continue;
      n++;
      for (let c = 0; c < k; c++) {
        const b = qv[i * k + c] ?? 0;
        histo[c * 256 + b] = (histo[c * 256 + b] ?? 0) + signe;
        if (b < (med[c] ?? 0)) sous[c] = (sous[c] ?? 0) + signe;
      }
    }
    return n * signe;
  };
  // La plus petite case b dont le cumul (valeurs sous b, plus celles de b) depasse n x quantile.
  const lire = (c: number, n: number): number => {
    const t = n * quantile,
      base = c * 256;
    let m = med[c] ?? 0,
      s = sous[c] ?? 0;
    while (m < 255 && s + (histo[base + m] ?? 0) <= t) s += histo[base + m++] ?? 0;
    while (m > 0 && s > t) s -= histo[base + --m] ?? 0;
    med[c] = m;
    sous[c] = s;
    return m;
  };
  for (let y = 0; y < h; y++) {
    histo.fill(0);
    med.fill(0);
    sous.fill(0);
    const y0 = Math.max(0, y - ry),
      y1 = Math.min(h - 1, y + ry);
    let n = 0;
    for (let x = 0; x <= Math.min(rx, l - 1); x++) n += colonne(x, y0, y1, 1);
    for (let x = 0; x < l; x++) {
      // Fenetre de toute la largeur (fond de rang) : la meme pour toute la ligne.
      if (x > 0 && rx >= l - 1) {
        const i = y * l + x;
        ok[i] = ok[y * l] ?? 0;
        for (let c = 0; c < k; c++) v[i * k + c] = v[y * l * k + c] ?? 0;
        continue;
      }
      if (x > 0) {
        if (x + rx < l) n += colonne(x + rx, y0, y1, 1);
        if (x - rx - 1 >= 0) n += colonne(x - rx - 1, y0, y1, -1);
      }
      const surface = (Math.min(l - 1, x + rx) - Math.max(0, x - rx) + 1) * (y1 - y0 + 1);
      if (n < 1 || n < partMin * surface) continue;
      const i = y * l + x;
      ok[i] = 1;
      for (let c = 0; c < k; c++) v[i * k + c] = lire(c, n);
    }
  }
  return { v, ok };
}

/**
 * Complete une carte a `k` canaux la ou elle est inconnue, par `defaut` (une carte de meme taille).
 * Un fond inconnu au milieu d'une grande baie prend le fond de son rang.
 */
export function completer(carte: CarteK, k: number, defaut: Float32Array): Float32Array {
  const v = new Float32Array(carte.v);
  for (let i = 0; i < carte.ok.length; i++) {
    if (carte.ok[i]) continue;
    for (let c = 0; c < k; c++) v[i * k + c] = defaut[i * k + c] ?? 0;
  }
  return v;
}

/**
 * Complete une carte de rangs (la meme valeur sur toute une ligne) : une ligne inconnue prend la ligne
 * connue la plus proche, sinon `defaut`. Une rangee toute occupee par des baies prend le fond du mur
 * au-dessus ou au-dessous.
 */
export function completerRangs(carte: CarteK, k: number, l: number, h: number, defaut: readonly number[]): Float32Array {
  const v = new Float32Array(carte.v);
  const connues: number[] = [];
  for (let y = 0; y < h; y++) if (carte.ok[y * l]) connues.push(y);
  for (let y = 0; y < h; y++) {
    if (carte.ok[y * l]) continue;
    let src = -1;
    for (const c of connues) if (src < 0 || Math.abs(c - y) < Math.abs(src - y)) src = c;
    for (let x = 0; x < l; x++) for (let c = 0; c < k; c++) v[(y * l + x) * k + c] = src < 0 ? (defaut[c] ?? 0) : (carte.v[(src * l + x) * k + c] ?? 0);
  }
  return v;
}
