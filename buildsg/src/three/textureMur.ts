// Les textures des murs en 3D, d'apres leur materiau (MD/spec-toit-ign.md §6.6).
//
// Comme les couvertures (three/couverture.ts), elles sont dessinees, pas telechargees : la vue 3D les
// a sans reseau et l'export GLB les emporte. Chacune est en niveaux de clair, autour de 0,85, et se
// raccorde a elle-meme sur ses quatre bords : la couleur des murs (lue sur une photo de rue, celle du
// materiau ou choisie) la teinte. Les coordonnees de texture des murs sont en metres ; chaque texture
// couvre TAILLE_M[materiau] metres, a l'echelle reelle des briques, des pierres ou des planches.

import type * as THREE_NS from 'three';
import type { MateriauTexture } from '../model/couleurMur.js';

/** Le cote d'une texture en pixels, et ce qu'elle couvre en metres. */
export const COTE_TEXTURE_MUR = 512;
export const TAILLE_M: Record<MateriauTexture, number> = { brique: 1, pierre: 2, meuliere: 1.5, beton: 2, enduit: 1, bois: 1 };

/** Un tirage reproductible : la meme texture d'une ouverture a l'autre, et dans les captures. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Un bruit de valeur periodique (periode `n` cellules sur le cote), lisse, entre 0 et 1. */
function bruit(n: number, graine: number): (x: number, y: number) => number {
  const rnd = tirage(graine);
  const g = Array.from({ length: n * n }, () => rnd());
  const lisse = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    // x, y dans [0, 1[ : la texture entiere.
    const fx = x * n, fy = y * n, i = Math.floor(fx), j = Math.floor(fy), tx = lisse(fx - i), ty = lisse(fy - j);
    const v = (a: number, b: number) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)] as number;
    const h0 = v(i, j) + (v(i + 1, j) - v(i, j)) * tx, h1 = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * tx;
    return h0 + (h1 - h0) * ty;
  };
}

/** Plusieurs octaves de bruit periodique, centrees sur 0 (entre -0,5 et 0,5 environ). */
function fbm(octaves: number, base: number, graine: number): (x: number, y: number) => number {
  const couches = Array.from({ length: octaves }, (_, k) => ({ f: bruit(base << k, graine + 17 * k), a: 1 / (1 << k) }));
  const somme = couches.reduce((s, c) => s + c.a, 0);
  return (x, y) => couches.reduce((s, c) => s + c.a * (c.f(x, y) - 0.5), 0) / somme;
}

type Peintre = (u: number, v: number) => number;

/**
 * Briques en panneresse : 4 par metre (25 cm, joint compris), 12 assises (8,3 cm), les assises
 * decalees d'une demi-brique ; chaque brique sa nuance, un grain, des joints de mortier plus clairs.
 */
function brique(): Peintre {
  const rnd = tirage(41), grain = fbm(3, 32, 7), colonnes = 4, assises = 12, joint = 0.012;
  const nuance = Array.from({ length: (colonnes + 1) * assises }, () => 0.72 + 0.16 * rnd());
  return (u, v) => {
    const a = Math.floor(v * assises), tv = v * assises - a;
    const us = (u + (a % 2 ? 0.5 / colonnes : 0)) % 1, c = Math.floor(us * colonnes), tu = us * colonnes - c;
    const jv = joint * assises, ju = joint * colonnes;
    if (tv < jv || tu < ju) return 0.93 + 0.04 * grain(u, v);
    // Une arete plus sombre sous le joint du dessus : le relief de la brique.
    const arete = tv < jv * 2.2 ? 0.9 : 1;
    return (nuance[a * (colonnes + 1) + c] as number) * arete + 0.08 * grain(u, v);
  };
}

/**
 * Pierre de taille ou moellons assises : des assises de 14 a 32 cm sur deux metres, des pierres de
 * 25 a 60 cm, chacune sa nuance et un leger bombe, des joints clairs.
 */
function pierre(): Peintre {
  const rnd = tirage(53), grain = fbm(4, 16, 11), joint = 0.008;
  // Les assises, en fractions de la texture (2 m), qui se raccordent au bord.
  const bords: number[] = [0];
  while (bords[bords.length - 1] as number < 1) bords.push((bords[bords.length - 1] as number) + (0.14 + 0.18 * rnd()) / TAILLE_M.pierre);
  const k = 1 / (bords[bords.length - 1] as number);
  const assises = bords.map((b) => b * k);
  const pierres = assises.slice(0, -1).map(() => {
    const coupes: number[] = [rnd()];
    let x = coupes[0] as number;
    while (x < (coupes[0] as number) + 1) { x += (0.25 + 0.35 * rnd()) / TAILLE_M.pierre; coupes.push(x); }
    coupes[coupes.length - 1] = (coupes[0] as number) + 1;
    return { coupes, nuances: coupes.map(() => 0.74 + 0.2 * rnd()) };
  });
  return (u, v) => {
    const a = Math.max(0, assises.findIndex((b, i) => v >= b && v < (assises[i + 1] ?? 2)));
    const v0 = assises[a] as number, v1 = assises[a + 1] ?? 1, tv = (v - v0) / (v1 - v0);
    const p = pierres[a] ?? pierres[0];
    if (!p) return 0.85;
    const uu = u < (p.coupes[0] as number) ? u + 1 : u;
    const i = Math.max(0, p.coupes.findIndex((c, n) => uu >= c && uu < (p.coupes[n + 1] ?? Infinity)));
    const c0 = p.coupes[i] as number, c1 = p.coupes[i + 1] ?? c0 + 0.2, tu = (uu - c0) / (c1 - c0);
    const ju = joint / (c1 - c0), jv = joint / (v1 - v0);
    if (tv < jv || tu < ju) return 0.92 + 0.05 * grain(u, v);
    const bombe = 0.94 + 0.06 * Math.sin(Math.PI * tu) * Math.sin(Math.PI * tv);
    return (p.nuances[i] as number) * bombe + 0.1 * grain(u, v);
  };
}

/**
 * Meuliere : des pierres irregulieres (une cellule de Voronoi par pierre, une tous les 18 cm environ),
 * poreuses (un bruit fort, pique de trous), des joints de mortier epais et clairs.
 */
function meuliere(): Peintre {
  const rnd = tirage(67), n = Math.round(TAILLE_M.meuliere / 0.16), pores = fbm(4, 32, 19), trous = fbm(2, 96, 23), epaisseur = fbm(2, 12, 29);
  // Des pierres de tailles inegales : chaque graine tiree n'importe ou dans sa cellule.
  const graines = Array.from({ length: n * n }, (_, k) => ({ x: ((k % n) + 0.05 + 0.9 * rnd()) / n, y: (Math.floor(k / n) + 0.05 + 0.9 * rnd()) / n, nuance: 0.55 + 0.3 * rnd() }));
  return (u, v) => {
    let d1 = Infinity, d2 = Infinity, proche = graines[0];
    const ci = Math.floor(u * n), cj = Math.floor(v * n);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const i = ci + di, j = cj + dj, g = graines[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
      if (!g) continue;
      const gx = g.x + Math.floor(i / n), gy = g.y + Math.floor(j / n);
      const d = Math.hypot(u - gx, v - gy);
      if (d < d1) { d2 = d1; d1 = d; proche = g; } else if (d < d2) d2 = d;
    }
    // Un joint de mortier clair, d'epaisseur inegale, comme jointoye a la main.
    if ((d2 - d1) * n < 0.09 + 0.12 * (epaisseur(u, v) + 0.5)) return 0.95 + 0.04 * pores(u, v);
    // La meuliere est poreuse : des creux sombres epars dans une pierre rugueuse.
    const creux = trous(u, v) > 0.2 ? 0.62 : 1;
    return (proche?.nuance ?? 0.72) * creux + 0.25 * pores(u, v);
  };
}

/** Beton banche : un gris lisse, des nuances larges, les joints des banches tous les 50 cm et leurs trous de tiges. */
function beton(): Peintre {
  const large = fbm(2, 4, 29), fin = fbm(3, 64, 31);
  return (u, v) => {
    const y = (v * TAILLE_M.beton) % 0.5, x = (u * TAILLE_M.beton) % 1;
    const banche = y < 0.006 ? 0.9 : 1;
    const tige = Math.hypot(x - 0.5, y - 0.25) < 0.012 ? 0.7 : 1;
    return (0.86 + 0.07 * large(u, v) + 0.04 * fin(u, v)) * banche * tige;
  };
}

/** Enduit gratte ou crepi : un grain fin et serre, de legeres nuances. */
function enduit(): Peintre {
  const grain = fbm(3, 96, 37), large = fbm(2, 4, 39);
  return (u, v) => 0.89 + 0.08 * grain(u, v) + 0.03 * large(u, v);
}

/** Bardage bois vertical : 6 planches par metre, un joint sombre, chaque planche sa nuance et son veinage. */
function bois(): Peintre {
  const rnd = tirage(43), planches = 6, veine = bruit(48, 47), noeuds = bruit(24, 53);
  const nuance = Array.from({ length: planches }, () => 0.7 + 0.16 * rnd());
  return (u, v) => {
    const p = Math.floor(u * planches), t = u * planches - p;
    if (t < 0.025) return 0.42;
    // Le veinage court le long de la planche : un bruit etire dans sa longueur.
    const fibre = veine((u * 4) % 1, (v * 0.25 + p * 0.13) % 1);
    const noeud = noeuds(u, (v + p * 0.37) % 1) > 0.93 ? 0.8 : 1;
    return ((nuance[p] as number) + 0.12 * (fibre - 0.5)) * noeud;
  };
}

const PEINTRES: Record<MateriauTexture, () => Peintre> = { brique, pierre, meuliere, beton, enduit, bois };

/** Les pixels (RGBA a plat, en gris) de la texture d'un materiau, `cote` pixels de cote. */
export function pixelsTextureMur(materiau: MateriauTexture, cote = COTE_TEXTURE_MUR): Uint8ClampedArray {
  const peindre = PEINTRES[materiau]();
  const px = new Uint8ClampedArray(cote * cote * 4);
  for (let y = 0; y < cote; y++) for (let x = 0; x < cote; x++) {
    // Le haut du canevas est le haut du mur (v croit vers le haut dans les coordonnees du mur).
    const g = Math.round(255 * Math.min(1, Math.max(0, peindre((x + 0.5) / cote, 1 - (y + 0.5) / cote))));
    const k = (y * cote + x) * 4;
    px[k] = px[k + 1] = px[k + 2] = g;
    px[k + 3] = 255;
  }
  return px;
}

const cache = new Map<MateriauTexture, THREE_NS.Texture>();

/** La texture des murs d'un materiau, ou `null` sans canevas (tests, environnement sans DOM). */
export function textureMur(materiau: MateriauTexture): THREE_NS.Texture | null {
  const deja = cache.get(materiau);
  if (deja) return deja;
  if (typeof document === 'undefined' || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
  const canevas = document.createElement('canvas');
  canevas.width = canevas.height = COTE_TEXTURE_MUR;
  const c2d = canevas.getContext('2d');
  if (!c2d) return null;
  const img = c2d.createImageData(COTE_TEXTURE_MUR, COTE_TEXTURE_MUR);
  img.data.set(pixelsTextureMur(materiau));
  c2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canevas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Les coordonnees des murs sont en metres : une texture couvre TAILLE_M metres.
  tex.repeat.set(1 / TAILLE_M[materiau], 1 / TAILLE_M[materiau]);
  tex.anisotropy = 4;
  cache.set(materiau, tex);
  return tex;
}
