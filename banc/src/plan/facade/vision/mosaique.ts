// Copie figee de Plan (src/facade/vision/mosaique.ts) : seulement la recherche du decalage entre deux bandes voisines (correlation
// normalisee, grossiere puis au pixel) et leur fondu. Le banc s'en sert pour fusionner plusieurs photos d'un meme mur (fusion.ts) ;
// la mise a l'echelle par la largeur du plan et le releve n'y sont pas.

import { au } from '../../util/tableaux.js';
import type { Image } from './homographie.js';

export interface Bande {
  image: Image;
  vu: Uint8Array;
}

/** Luminance d'une bande, reduite d'un facteur entier, sur les lignes du mur seulement. */
function luminance(b: Bande, depuis: number, facteur: number): { l: number; h: number; v: Float32Array; vu: Uint8Array } {
  const L = Math.max(1, Math.floor(b.image.largeur / facteur)),
    Hm = Math.max(1, Math.floor((b.image.hauteur - depuis) / facteur));
  const v = new Float32Array(L * Hm),
    n = new Float32Array(L * Hm);
  for (let y = 0; y < Hm * facteur; y++) {
    for (let x = 0; x < L * facteur; x++) {
      const i = (y + depuis) * b.image.largeur + x;
      if (!b.vu[i]) continue;
      const d = b.image.donnees;
      const j = Math.floor(y / facteur) * L + Math.floor(x / facteur);
      v[j] = (v[j] ?? 0) + 0.299 * (d[i * 4] ?? 0) + 0.587 * (d[i * 4 + 1] ?? 0) + 0.114 * (d[i * 4 + 2] ?? 0);
      n[j] = (n[j] ?? 0) + 1;
    }
  }
  const vu = new Uint8Array(L * Hm);
  for (let j = 0; j < L * Hm; j++) {
    const c = n[j] ?? 0;
    if (c > 0) {
      v[j] = (v[j] ?? 0) / c;
      vu[j] = 1;
    }
  }
  return { l: L, h: Hm, v, vu };
}

/** Correlation normalisee de A (colonnes dx..) et B (colonnes 0..) sur leur partie commune. */
function correlation(A: ReturnType<typeof luminance>, B: ReturnType<typeof luminance>, dx: number, pasLignes = 1): number {
  const largeur = Math.min(A.l - dx, B.l);
  const h = Math.min(A.h, B.h);
  if (largeur <= 0) return -1;
  let n = 0,
    sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0;
  for (let y = 0; y < h; y += pasLignes) {
    for (let x = 0; x < largeur; x++) {
      const ia = y * A.l + x + dx,
        ib = y * B.l + x;
      if (!A.vu[ia] || !B.vu[ib]) continue;
      const a = A.v[ia] ?? 0,
        b = B.v[ib] ?? 0;
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  if (n < 20) return -1;
  const cov = sab - (sa * sb) / n,
    va = saa - (sa * sa) / n,
    vb = sbb - (sb * sb) / n;
  return va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : -1;
}

/**
 * Le decalage (en pixels de `A`) ou `B` commence, et la ressemblance obtenue. `B` doit recouvrir
 * `A` sur au moins `recouvrementMin` metres.
 *
 * La recherche grossiere (a 10 px/m) ne garde pas son seul meilleur decalage : le pic de
 * ressemblance d'un mur uni perce de baies nettes est plus etroit qu'une case grossiere, et un vrai
 * decalage qui tombe entre deux cases y parait mediocre. Les meilleurs pics locaux sont donc tous
 * affines au pixel, et c'est l'affinage qui tranche.
 */
export function decalage(A: Bande, B: Bande, depuis: number, pxParM: number, recouvrementMin = 0.4, pics = 6): { dx: number; score: number } {
  const facteur = Math.max(1, Math.round(pxParM / 10));
  const a = luminance(A, depuis, facteur),
    b = luminance(B, depuis, facteur);
  const minRec = Math.max(2, Math.round((recouvrementMin * pxParM) / facteur));
  const grossier: number[] = [];
  for (let dx = 1; dx <= a.l - minRec; dx++) grossier[dx] = correlation(a, b, dx);
  const s = (dx: number) => grossier[dx] ?? -2;
  const candidats: number[] = [];
  for (let dx = 1; dx <= a.l - minRec; dx++) if (s(dx) >= s(dx - 1) && s(dx) >= s(dx + 1)) candidats.push(dx);
  candidats.sort((x, y) => s(y) - s(x));
  // Affinage au pixel pres, autour de chaque pic retenu.
  const A1 = luminance(A, depuis, 1),
    B1 = luminance(B, depuis, 1);
  let fin = { dx: (candidats[0] ?? 1) * facteur, score: -2 };
  for (const c of candidats.slice(0, pics)) {
    for (let dx = Math.max(1, (c - 1) * facteur); dx <= Math.min(A1.l - 2, (c + 1) * facteur); dx++) {
      const r = correlation(A1, B1, dx, 2);
      if (r > fin.score) fin = { dx, score: r };
    }
  }
  return fin;
}

/**
 * Pose les bandes a leurs decalages et les fond : dans un recouvrement, chaque bande pese d'autant
 * plus qu'on est loin de son bord, pour que la jointure ne se voie pas.
 */
export function assembler(bandes: Bande[], positions: number[]): Bande {
  const H = au(bandes, 0).image.hauteur;
  const L = Math.max(...bandes.map((b, k) => au(positions, k) + b.image.largeur));
  const somme = new Float32Array(L * H * 3),
    poids = new Float32Array(L * H);
  bandes.forEach((b, k) => {
    const x0 = au(positions, k),
      Lb = b.image.largeur;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < Lb; x++) {
        const i = y * Lb + x;
        if (!b.vu[i]) continue;
        const w = Math.min(x + 1, Lb - x);
        const o = y * L + x0 + x;
        for (let c = 0; c < 3; c++) somme[o * 3 + c] = (somme[o * 3 + c] ?? 0) + w * (b.image.donnees[i * 4 + c] ?? 0);
        poids[o] = (poids[o] ?? 0) + w;
      }
    }
  });
  const donnees = new Uint8ClampedArray(L * H * 4);
  const vu = new Uint8Array(L * H);
  for (let o = 0; o < L * H; o++) {
    const w = poids[o] ?? 0;
    donnees[o * 4 + 3] = 255;
    if (w <= 0) continue;
    vu[o] = 1;
    for (let c = 0; c < 3; c++) donnees[o * 4 + c] = (somme[o * 3 + c] ?? 0) / w;
  }
  return { image: { largeur: L, hauteur: H, donnees }, vu };
}

