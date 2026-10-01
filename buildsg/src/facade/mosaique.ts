// Plusieurs photos pour une facade (MD/spec-releve-facade.md §6.1).
//
// Sans recul, le mur ne tient pas dans une photo : on le photographie par morceaux qui se
// recouvrent, de gauche a droite. Chaque morceau est un rectangle du mur - de l'egout au pied, entre
// deux verticales quelconques - dont l'utilisateur place les quatre coins. Trois choses font de ces
// morceaux une seule elevation :
//
// 1. **La largeur de chaque morceau, en hauteurs de mur.** Tous les morceaux ont la meme hauteur
//    (du sol a l'egout) ; le rapport largeur/hauteur de chacun se retrouve sur la photo, parce que
//    la focale est connue : l'image d'un rectangle en perspective fixe ses proportions a une focale
//    pres (Zhang et He, « Whiteboard scanning », 2004). Chaque morceau est donc redresse a la meme
//    echelle.
// 2. **Sa place.** Deux morceaux voisins se recouvrent : le decalage horizontal qui les fait
//    coincider est celui ou leurs pixels communs se ressemblent le plus (correlation normalisee),
//    cherche grossierement a 10 px/m puis affine au pixel.
// 3. **La hauteur du mur.** Seule la largeur est connue - lue sur le plan ; la hauteur du cadastre
//    n'est qu'une estimation. Une premiere passe a cette hauteur donne la largeur de l'assemblage ;
//    le rapport a la largeur du plan corrige la hauteur (tout est proportionnel), et une seconde
//    passe redresse a la hauteur mesuree. Le petit ecart qui reste (decalages au pixel pres) est
//    absorbe par un recalage sur la largeur du plan.
//
// Pas de navigateur ici : tout opere sur des images brutes et se teste sous Node.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, redresser, resolutionTexture, rapportRectangle, type Image, type P2 } from './homographie.js';
import { finaliserReleve, hauteurBande, HAUTEUR_MIN, HAUTEUR_MAX, type MurDuReleve, type ResultatAnalyse } from './analyse.js';

export { rapportRectangle };

/** Une photo d'un morceau du mur, ses coins (haut gauche, haut droit, bas droit, bas gauche) et sa focale. */
export interface MorceauPhoto {
  photo: Image;
  coins: P2[];
  /** Focale en pixels de cette photo. */
  focalePx: number;
}

export interface EntreeMosaique extends MurDuReleve {
  morceaux: MorceauPhoto[];
  /** Largeur du mur, lue sur le plan. */
  largeur: number;
}

export interface ResultatMosaique extends ResultatAnalyse {
  /** Largeur totale de la seconde passe avant recalage, rapportee a la largeur du plan (1 = parfait). */
  rapportLargeur: number;
  /** Pour chaque jointure entre deux photos : la ressemblance de leur partie commune, de -1 a 1. */
  jointures: number[];
}

/** Repli sans focale : le rapport des longueurs moyennes des cotes sur l'image. */
function rapportApparent(c: readonly P2[]): number {
  const d = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.y - a.y);
  const larg = (d(au(c, 0), au(c, 1)) + d(au(c, 3), au(c, 2))) / 2;
  const haut = (d(au(c, 0), au(c, 3)) + d(au(c, 1), au(c, 2))) / 2;
  return haut > 0 ? larg / haut : 1;
}

interface Bande {
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

/** Etire une image (et son masque) horizontalement a la largeur voulue, bilineaire en x. */
function etirer(b: Bande, largeur: number): Bande {
  const L0 = b.image.largeur,
    H = b.image.hauteur;
  const donnees = new Uint8ClampedArray(largeur * H * 4);
  const vu = new Uint8Array(largeur * H);
  const k = L0 / largeur;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < largeur; x++) {
      const sx = Math.min(L0 - 1, Math.max(0, (x + 0.5) * k - 0.5));
      const x0 = Math.floor(sx),
        x1 = Math.min(L0 - 1, x0 + 1),
        t = sx - x0;
      const i0 = y * L0 + x0,
        i1 = y * L0 + x1,
        o = y * largeur + x;
      for (let c = 0; c < 4; c++) donnees[o * 4 + c] = (b.image.donnees[i0 * 4 + c] ?? 0) * (1 - t) + (b.image.donnees[i1 * 4 + c] ?? 0) * t;
      vu[o] = b.vu[i0] || b.vu[i1] ? 1 : 0;
    }
  }
  return { image: { largeur, hauteur: H, donnees }, vu };
}

/**
 * Pose les bandes a leurs decalages et les fond : dans un recouvrement, chaque bande pese d'autant
 * plus qu'on est loin de son bord, pour que la jointure ne se voie pas.
 */
function assembler(bandes: Bande[], positions: number[]): Bande {
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

/** Les morceaux redresses a la hauteur `hauteur`, poses a leurs decalages et fondus. */
function assemblerA(e: EntreeMosaique, hauteur: number, E: number, pxParM: number): { brut: Bande; jointures: number[] } | null {
  const bandes: Bande[] = [];
  for (const m of e.morceaux) {
    const r = rapportRectangle(m.coins, m.focalePx, m.photo.largeur / 2, m.photo.hauteur / 2) ?? rapportApparent(m.coins);
    const largeur = hauteur * r;
    const H = homographie(
      [
        { x: 0, y: 0 },
        { x: largeur, y: 0 },
        { x: largeur, y: hauteur },
        { x: 0, y: hauteur },
      ],
      m.coins,
    );
    if (!H) return null;
    const etendus = [
      { x: 0, y: -E },
      { x: largeur, y: -E },
      { x: largeur, y: hauteur },
      { x: 0, y: hauteur },
    ].map((q) => appliquer(H, q));
    const b = redresser(m.photo, etendus, largeur, hauteur + E, pxParM);
    if (!b) return null;
    bandes.push({ image: b.image, vu: b.vu });
  }
  // Toutes les bandes ont la meme hauteur (sol -> haut de la bande) : seules leurs largeurs different.
  const depuis = Math.round(E * pxParM);
  const positions = [0];
  const jointures: number[] = [];
  for (let k = 1; k < bandes.length; k++) {
    const { dx, score } = decalage(au(bandes, k - 1), au(bandes, k), depuis, pxParM);
    positions.push(au(positions, k - 1) + dx);
    jointures.push(score);
  }
  return { brut: assembler(bandes, positions), jointures };
}

/** Plusieurs photos d'un meme mur, de gauche a droite, assemblees en un seul releve. */
export function analyserMosaique(e: EntreeMosaique): ResultatMosaique | null {
  if (!e.morceaux.length) return null;
  const E = hauteurBande(e.largeur);
  // Premiere passe, a la hauteur estimee : la largeur de l'assemblage, rapportee a celle du plan,
  // donne la hauteur reelle. Une largeur de morceau est proportionnelle a la hauteur supposee.
  const px0 = resolutionTexture(e.largeur, e.hauteur + E);
  const premiere = assemblerA(e, e.hauteur, E, px0);
  if (!premiere) return null;
  const largeurVue = premiere.brut.image.largeur / px0;
  const mesuree = largeurVue > 0 ? Math.round(((e.hauteur * e.largeur) / largeurVue) * 100) / 100 : 0;
  const hauteurMesuree = mesuree >= HAUTEUR_MIN && mesuree <= HAUTEUR_MAX;
  const hauteur = hauteurMesuree ? mesuree : e.hauteur;
  const pxParM = resolutionTexture(e.largeur, hauteur + E);
  const seconde = hauteurMesuree ? assemblerA(e, hauteur, E, pxParM) : premiere;
  if (!seconde) return null;
  const { brut, jointures } = seconde;
  const cible = Math.max(1, Math.round(e.largeur * pxParM));
  const recale = etirer(brut, cible);
  const res = finaliserReleve(recale.image, recale.vu, E, pxParM, { ...e, hauteur }, null, hauteurMesuree);
  return { ...res, rapportLargeur: brut.image.largeur / cible, jointures };
}
