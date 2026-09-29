// Plusieurs photos pour une facade (MD/spec-releve-facade.md §6.1).
//
// Sans recul, le mur ne tient pas dans une photo : on le photographie par morceaux qui se
// recouvrent, de gauche a droite. Chaque morceau est un rectangle du mur - de l'egout au pied, entre
// deux verticales quelconques - dont l'utilisateur place les quatre coins. Trois choses font de ces
// morceaux une seule elevation :
//
// 1. **La largeur de chaque morceau.** Sa hauteur est connue (du sol a l'egout) ; son rapport
//    largeur/hauteur se retrouve sur la photo, parce que la focale est connue : l'image d'un
//    rectangle en perspective fixe ses proportions a une focale pres (Zhang et He, « Whiteboard
//    scanning », 2004). Chaque morceau est donc redresse a la meme echelle, en pixels par metre.
// 2. **Sa place.** Deux morceaux voisins se recouvrent : le decalage horizontal qui les fait
//    coincider est celui ou leurs pixels communs se ressemblent le plus (correlation normalisee),
//    cherche grossierement a 10 px/m puis affine au pixel.
// 3. **La largeur du tout**, lue sur le plan : l'assemblage y est recale, ce qui absorbe les petites
//    erreurs de focale ou d'alignement. L'ecart avant recalage est rendu : au-dela de quelques pour
//    cent, les photos se recouvraient mal.
//
// Pas de navigateur ici : tout opere sur des images brutes et se teste sous Node.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, redresser, resolutionTexture, type Image, type P2 } from './homographie.js';
import { finaliserReleve, hauteurBande, type MurDuReleve, type ResultatAnalyse } from './analyse.js';

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
  /** Largeur totale avant recalage, rapportee a la largeur du plan (1 = parfait). */
  rapportLargeur: number;
  /** Pour chaque jointure entre deux photos : la ressemblance de leur partie commune, de -1 a 1. */
  jointures: number[];
}

type V3 = [number, number, number];
const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Rapport largeur / hauteur du rectangle reel dont \`coins\` est l'image, pour une focale \`f\` en
 * pixels et un point principal au centre de l'image (\`cx\`, \`cy\`). \`null\` si la configuration est
 * degeneree. Coins dans l'ordre haut gauche, haut droit, bas droit, bas gauche.
 */
export function rapportRectangle(coins: readonly P2[], f: number, cx: number, cy: number): number | null {
  const h = (p: P2): V3 => [p.x, p.y, 1];
  // Notation de Zhang et He : m1 m2 en haut, m3 m4 en bas, m1 m3 a gauche.
  const m1 = h(au(coins, 0)),
    m2 = h(au(coins, 1)),
    m4 = h(au(coins, 2)),
    m3 = h(au(coins, 3));
  const d2 = scal(croix(m2, m4), m3),
    d3 = scal(croix(m3, m4), m2);
  if (Math.abs(d2) < 1e-12 || Math.abs(d3) < 1e-12) return null;
  const k2 = scal(croix(m1, m4), m3) / d2;
  const k3 = scal(croix(m1, m4), m2) / d3;
  const n2: V3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: V3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  // Longueurs dans le repere camera : A^-1 n, avec A = [[f,0,cx],[0,f,cy],[0,0,1]].
  const metrique = (n: V3) => {
    const x = (n[0] - cx * n[2]) / f,
      y = (n[1] - cy * n[2]) / f;
    return x * x + y * y + n[2] * n[2];
  };
  const r = Math.sqrt(metrique(n2) / metrique(n3));
  return Number.isFinite(r) && r > 0 ? r : null;
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
 * Le decalage (en pixels de \`A\`) ou \`B\` commence, et la ressemblance obtenue. \`B\` doit recouvrir
 * \`A\` sur au moins \`recouvrementMin\` metres.
 */
export function decalage(A: Bande, B: Bande, depuis: number, pxParM: number, recouvrementMin = 0.4): { dx: number; score: number } {
  const facteur = Math.max(1, Math.round(pxParM / 10));
  const a = luminance(A, depuis, facteur),
    b = luminance(B, depuis, facteur);
  const minRec = Math.max(2, Math.round((recouvrementMin * pxParM) / facteur));
  let meilleur = { dx: 0, score: -2 };
  for (let dx = 1; dx <= a.l - minRec; dx++) {
    const s = correlation(a, b, dx);
    if (s > meilleur.score) meilleur = { dx, score: s };
  }
  // Affinage au pixel pres, autour du meilleur decalage grossier.
  const A1 = luminance(A, depuis, 1),
    B1 = luminance(B, depuis, 1);
  let fin = { dx: meilleur.dx * facteur, score: -2 };
  for (let dx = Math.max(1, (meilleur.dx - 1) * facteur); dx <= Math.min(A1.l - 2, (meilleur.dx + 1) * facteur); dx++) {
    const s = correlation(A1, B1, dx, 2);
    if (s > fin.score) fin = { dx, score: s };
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

/** Plusieurs photos d'un meme mur, de gauche a droite, assemblees en un seul releve. */
export function analyserMosaique(e: EntreeMosaique): ResultatMosaique | null {
  if (!e.morceaux.length) return null;
  const E = hauteurBande(e.largeur);
  const pxParM = resolutionTexture(e.largeur, e.hauteur + E);
  const bandes: Bande[] = [];
  for (const m of e.morceaux) {
    const r = rapportRectangle(m.coins, m.focalePx, m.photo.largeur / 2, m.photo.hauteur / 2) ?? rapportApparent(m.coins);
    const largeur = e.hauteur * r;
    const H = homographie(
      [
        { x: 0, y: 0 },
        { x: largeur, y: 0 },
        { x: largeur, y: e.hauteur },
        { x: 0, y: e.hauteur },
      ],
      m.coins,
    );
    if (!H) return null;
    const etendus = [
      { x: 0, y: -E },
      { x: largeur, y: -E },
      { x: largeur, y: e.hauteur },
      { x: 0, y: e.hauteur },
    ].map((q) => appliquer(H, q));
    const b = redresser(m.photo, etendus, largeur, e.hauteur + E, pxParM);
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
  const brut = assembler(bandes, positions);
  const cible = Math.max(1, Math.round(e.largeur * pxParM));
  const recale = etirer(brut, cible);
  const res = finaliserReleve(recale.image, recale.vu, E, pxParM, e);
  return { ...res, rapportLargeur: brut.image.largeur / cible, jointures };
}
