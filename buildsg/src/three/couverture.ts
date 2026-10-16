// Les textures des couvertures en 3D : tuiles romanes, plates ou canal, ardoises, zinc a joints
// debout, gravillons d'un toit-terrasse (MD/spec-toit-ign.md §6.2).
//
// Elles sont dessinees, pas telechargees : la vue 3D les a sans reseau, et l'export GLB les emporte.
// Chacune est en niveaux de clair, autour de 0,85 : la couleur du toit (lue sur l'orthophoto, de
// repli ou choisie) la teinte par le materiau. Une texture couvre un metre sur un metre ; les
// coordonnees de texture d'un pan sont en metres (`uvDuPan`), les rangs suivent l'egout.

import { inscrireHauteurs } from './materiauxVivants.js';
import type * as THREE_NS from 'three';
import type { MateriauCouverture } from '../model/couleurToit.js';

const COTE = 256;

/** Un tirage reproductible : la meme texture d'une ouverture a l'autre, et dans les captures. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Tuiles romanes : 4 tuiles et 3 rangs par metre. Chaque tuile est bombee (plus claire au sommet de
 * sa courbe), chaque rang plus sombre sous le recouvrement du rang du dessus.
 */
function tuiles(px: Uint8ClampedArray): void {
  const rnd = tirage(11);
  const colonnes = 4,
    rangs = 3,
    l = COTE / colonnes,
    h = Math.round(COTE / rangs);
  const nuance = Array.from({ length: colonnes * rangs }, () => 0.92 + 0.1 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.min(rangs - 1, Math.floor(y / h)),
      t = (y - r * h) / h;
    // En haut du rang (canevas vers le haut = vers le faitage), l'ombre du rang superieur.
    const recouvrement = 0.72 + 0.28 * Math.min(1, t / 0.35);
    const nez = t > 0.95 ? 0.6 : 1;
    for (let x = 0; x < COTE; x++) {
      const c = Math.floor(x / l),
        u = (x - c * l) / l;
      const bombe = 0.7 + 0.3 * Math.sin(Math.PI * u);
      const v = Math.min(1, bombe * recouvrement * nez * (nuance[r * colonnes + c] ?? 1) * (0.96 + 0.06 * rnd()));
      const k = (y * COTE + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = Math.round(255 * v);
      px[k + 3] = 255;
    }
  }
}

/** Ardoises : 4 par metre en largeur, 8 rangs, a joints croises, chacune de sa nuance. */
function ardoises(px: Uint8ClampedArray): void {
  const rnd = tirage(23);
  const colonnes = 4,
    rangs = 8,
    l = COTE / colonnes,
    h = COTE / rangs;
  const nuance = Array.from({ length: (colonnes + 1) * rangs }, () => 0.8 + 0.16 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.floor(y / h),
      t = (y - r * h) / h;
    const decalage = r % 2 ? l / 2 : 0;
    for (let x = 0; x < COTE; x++) {
      const xs = (x + decalage) % COTE,
        c = Math.floor(xs / l),
        u = (xs - c * l) / l;
      const joint = u < 0.025 || u > 0.975 || t > 0.94;
      const ombre = 0.85 + 0.15 * Math.min(1, t / 0.25);
      const v = joint ? 0.42 : Math.min(1, (nuance[r * (colonnes + 1) + c] ?? 1) * ombre * (0.97 + 0.04 * rnd()) + 0.1);
      const k = (y * COTE + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = Math.round(255 * v);
      px[k + 3] = 255;
    }
  }
}

/** Un bruit de valeur periodique sur la texture (periode `n` cellules), lisse, entre 0 et 1. */
function bruit(n: number, graine: number): (x: number, y: number) => number {
  const rnd = tirage(graine);
  const g = Array.from({ length: n * n }, () => rnd());
  const lisse = (t: number) => t * t * (3 - 2 * t);
  const v = (a: number, b: number) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)] as number;
  return (x, y) => {
    const fx = x * n, fy = y * n, i = Math.floor(fx), j = Math.floor(fy), tx = lisse(fx - i), ty = lisse(fy - j);
    const h0 = v(i, j) + (v(i + 1, j) - v(i, j)) * tx, h1 = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * tx;
    return h0 + (h1 - h0) * ty;
  };
}

/** Ecrit un gris (0 a 1) au pixel (x, y). */
function poser(px: Uint8ClampedArray, x: number, y: number, v: number): void {
  const k = (y * COTE + x) * 4;
  px[k] = px[k + 1] = px[k + 2] = Math.round(255 * Math.min(1, Math.max(0, v)));
  px[k + 3] = 255;
}

/**
 * Tuiles plates (petit moule, le toit raide du Nord et de l'Ile-de-France) : 6 par metre en largeur,
 * un pureau de 10 cm (10 rangs), a joints croises ; chaque tuile sa nuance et un grain, le nez du rang
 * du dessus ombrant le haut de chaque rang.
 */
function tuilesPlates(px: Uint8ClampedArray): void {
  const rnd = tirage(31), grain = bruit(48, 5), colonnes = 6, rangs = 10, l = COTE / colonnes, h = COTE / rangs;
  const nuance = Array.from({ length: (colonnes + 1) * rangs }, () => 0.78 + 0.18 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.floor(y / h), t = (y - r * h) / h;
    const decalage = r % 2 ? l / 2 : 0;
    const ombre = 0.7 + 0.3 * Math.min(1, t / 0.3);
    for (let x = 0; x < COTE; x++) {
      const xs = (x + decalage) % COTE, c = Math.floor(xs / l), u = (xs - c * l) / l;
      const joint = u < 0.03 || u > 0.97;
      const v = joint ? 0.5 : (nuance[r * (colonnes + 1) + c] as number) * ombre + 0.08 * (grain(x / COTE, y / COTE) - 0.5);
      poser(px, x, y, v);
    }
  }
}

/**
 * Tuiles canal (le toit provencal, peu pentu) : 3 paires par metre, chacune une tuile de couvert
 * etroite et bombee (claire a sa crete) puis un canal plus large, en creux, ombre au pied du couvert ;
 * 3 tuiles par metre dans la pente, chevauchant la suivante, les couverts decales d'une demi-tuile ;
 * des nuances fortes - de vieilles tuiles melees.
 */
function tuilesCanal(px: Uint8ClampedArray): void {
  const rnd = tirage(37), grain = bruit(32, 9), paires = 3, rangs = 3, l = COTE / paires, h = COTE / rangs, part = 0.42;
  const nuance = Array.from({ length: paires * 2 * rangs }, () => 0.7 + 0.28 * rnd());
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      const p = Math.floor(x / l), u = (x - p * l) / l, couvert = u < part;
      const w = couvert ? u / part : (u - part) / (1 - part);
      const yy = (y + (couvert ? h / 2 : 0)) % COTE, r = Math.floor(yy / h), t = (yy - r * h) / h;
      const forme = couvert
        ? 0.66 + 0.4 * Math.sin(Math.PI * w)
        // Le canal : plus sombre en son fond, et dans l'ombre du couvert sur ses deux bords.
        : (0.86 - 0.18 * Math.sin(Math.PI * w)) * (0.72 + 0.28 * Math.min(1, w / 0.12, (1 - w) / 0.12));
      const chevauchement = 0.7 + 0.3 * Math.min(1, t / 0.2);
      const n = nuance[(r * paires + p) * 2 + (couvert ? 0 : 1)] as number;
      poser(px, x, y, n * forme * chevauchement + 0.06 * (grain(x / COTE, y / COTE) - 0.5));
    }
  }
}

/** Zinc a joints debout : des bandes de 50 cm dans la pente, un joint clair et son ombre, un leger moire. */
function zinc(px: Uint8ClampedArray): void {
  const moire = bruit(6, 13), fin = bruit(64, 17), bandes = 2, l = COTE / bandes;
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const u = (x % l) / l;
    const joint = u < 0.02 ? 1 : u < 0.04 ? 0.62 : 0;
    const base = 0.8 + 0.08 * (moire(x / COTE, y / COTE) - 0.5) + 0.03 * (fin(x / COTE, y / COTE) - 0.5);
    poser(px, x, y, joint ? joint : base);
  }
}

/** Toit-terrasse en gravillons : un semis serre de petits graviers, plus ou moins clairs, sur une teinte qui varie a peine. */
function terrasse(px: Uint8ClampedArray): void {
  const rnd = tirage(59), large = bruit(4, 19), gravier = bruit(128, 61);
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const g = gravier(x / COTE, y / COTE);
    poser(px, x, y, 0.8 + 0.06 * (large(x / COTE, y / COTE) - 0.5) + 0.16 * (g - 0.5) + 0.06 * (rnd() - 0.5));
  }
}

const DESSINS: Record<MateriauCouverture, (px: Uint8ClampedArray) => void> = {
  tuile: tuiles, 'tuile-plate': tuilesPlates, 'tuile-canal': tuilesCanal, ardoise: ardoises, zinc, terrasse,
};

/** Les pixels (RGBA a plat, en gris) d'une couverture, sur COTE pixels de cote : pour les tests. */
export function pixelsCouverture(materiau: MateriauCouverture): Uint8ClampedArray {
  const px = new Uint8ClampedArray(COTE * COTE * 4);
  DESSINS[materiau](px);
  return px;
}

/** La matiere d'une couverture en 3D : une tuile est mate, une ardoise un peu moins, le zinc brille un peu. */
export function matiereCouverture(materiau: MateriauCouverture): { roughness: number; metalness: number } {
  if (materiau === 'zinc') return { roughness: 0.45, metalness: 0.35 };
  if (materiau === 'ardoise') return { roughness: 0.7, metalness: 0 };
  if (materiau === 'terrasse') return { roughness: 0.95, metalness: 0 };
  return { roughness: 0.85, metalness: 0 };
}

const cache = new Map<MateriauCouverture, THREE_NS.Texture>();

/** La texture d'une couverture, ou `null` sans canevas (tests, environnement sans DOM). */
export function textureCouverture(materiau: MateriauCouverture): THREE_NS.Texture | null {
  const deja = cache.get(materiau);
  if (deja) return deja;
  if (typeof document === 'undefined' || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
  const canevas = document.createElement('canvas');
  canevas.width = canevas.height = COTE;
  const c2d = canevas.getContext('2d');
  if (!c2d) return null;
  const img = c2d.createImageData(COTE, COTE);
  DESSINS[materiau](img.data);
  c2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canevas);
  // Le relief de la couverture (R3, three/materiauxVivants.ts) : l'ombre sous chaque tuile est en creux.
  inscrireHauteurs(tex, new Uint8ClampedArray(img.data), COTE, false, materiau === 'zinc' ? 1.5 : 3);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(materiau, tex);
  return tex;
}
