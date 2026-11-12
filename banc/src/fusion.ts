// Fusionner plusieurs photos d'un meme mur, prises de gauche a droite et deja de face (etape 2), en une seule image (demande du
// proprietaire, 12 novembre 2026 : « regarde l'algorithme dans facade »). C'est celui de Plan (src/plan/facade/vision/mosaique.ts,
// copie figee) : deux voisines se posent la ou leurs pixels communs se ressemblent le plus (correlation normalisee, cherchee grossiere
// puis au pixel), et se fondent en pesant chaque photo d'autant plus qu'on est loin de son bord. Plan connait la hauteur du mur par ses
// coins ; ici chaque photo est redressee entiere, cadree a la main : deux voisines peuvent aussi differer un peu de hauteur (le pas a
// reculé) et d'echelle. La recherche essaie donc aussi un decalage vertical et quelques echelles, sur des images reduites. Sans DOM.

import { assembler, decalage, type Bande } from './plan/facade/vision/mosaique.js';
import type { Image } from './plan/facade/vision/homographie.js';

/** La hauteur des images de la recherche : assez pour les baies, assez petite pour essayer beaucoup de poses. */
export const HAUTEUR_RECHERCHE = 120;
/** La seconde passe, plus fine, autour de la pose trouvee : l'echelle a 1 % pres demande plus de lignes. */
export const HAUTEUR_FINE = 360;
const ECHELLES = [0.88, 0.94, 1, 1.06, 1.13];
/** L'image fusionnee garde au plus ce nombre de pixels (la somme ponderee tient en memoire, meme sur un telephone). */
export const PIXELS_FUSION = 8_000_000;

/** Ou poser une photo sur la precedente : B(u, v) tombe en A(s u + dx, s v + dy), en pixels de A ; `score` de -1 a 1. */
export interface Jointure { dx: number; dy: number; echelle: number; score: number }

export interface Fusion { image: Image; jointures: Jointure[] }

/** Les pixels vus : le redressement laisse du noir autour de la photo. */
export function vuDe(img: Image): Uint8Array {
  const n = img.largeur * img.hauteur, vu = new Uint8Array(n), d = img.donnees;
  for (let i = 0; i < n; i++) vu[i] = (d[i * 4] ?? 0) + (d[i * 4 + 1] ?? 0) + (d[i * 4 + 2] ?? 0) > 9 && (d[i * 4 + 3] ?? 255) > 0 ? 1 : 0;
  return vu;
}

/** Une bande a la hauteur `h` (moyenne des pixels vus de chaque case, bilineaire sinon : une reduction suffit ici). */
export function aLaHauteur(b: Bande, h: number): Bande {
  const k = b.image.hauteur / h, l = Math.max(1, Math.round(b.image.largeur / k)), L0 = b.image.largeur, H0 = b.image.hauteur;
  const donnees = new Uint8ClampedArray(l * h * 4), vu = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * k), y1 = Math.min(H0, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < l; x++) {
      const x0 = Math.floor(x * k), x1 = Math.min(L0, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let n = 0, r = 0, g = 0, bl = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = yy * L0 + xx;
        if (!b.vu[i]) continue;
        n++; r += b.image.donnees[i * 4] ?? 0; g += b.image.donnees[i * 4 + 1] ?? 0; bl += b.image.donnees[i * 4 + 2] ?? 0;
      }
      const o = y * l + x;
      donnees[o * 4 + 3] = 255;
      if (n * 2 < (x1 - x0) * (y1 - y0)) continue;
      vu[o] = 1; donnees[o * 4] = r / n; donnees[o * 4 + 1] = g / n; donnees[o * 4 + 2] = bl / n;
    }
  }
  return { image: { largeur: l, hauteur: h, donnees }, vu };
}

/** La bande `b` decalee de `dy` lignes, sur `h` lignes : ce qui sort est perdu, ce qui manque n'est pas vu. */
function decalerEnY(b: Bande, dy: number, h: number): Bande {
  const l = b.image.largeur, donnees = new Uint8ClampedArray(l * h * 4), vu = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const s = y - dy;
    if (s < 0 || s >= b.image.hauteur) continue;
    donnees.set(b.image.donnees.subarray(s * l * 4, (s + 1) * l * 4), y * l * 4);
    vu.set(b.vu.subarray(s * l, (s + 1) * l), y * l);
  }
  return { image: { largeur: l, hauteur: h, donnees }, vu };
}

/**
 * Ou poser `B` a droite de `A` (deux bandes a la meme hauteur, celle de la recherche) : pour chaque echelle et chaque decalage vertical,
 * le decalage horizontal de Plan (`decalage`) ; la meilleure ressemblance l'emporte. Le recouvrement voulu : au moins 15 % de A.
 */
export function poserVoisine(A: Bande, B: Bande, ecartY = 0.2): Jointure {
  const h = A.image.hauteur, pxParM = 10, rec = (0.15 * A.image.largeur) / pxParM;
  let mieux: Jointure = { dx: Math.round(A.image.largeur * 0.7), dy: 0, echelle: 1, score: -2 };
  const essayer = (s: number, dy: number, Bs: Bande) => {
    const { dx, score } = decalage(A, decalerEnY(Bs, dy, h), 0, pxParM, rec, 4);
    if (score > mieux.score) mieux = { dx, dy, echelle: s, score };
  };
  const pas = 3, max = Math.round(ecartY * h);
  for (const s of ECHELLES) {
    const Bs = s === 1 ? B : aLaHauteur(B, Math.round(h * s));
    for (let dy = -max; dy <= max; dy += pas) essayer(s, dy, Bs);
  }
  // Affinage : l'echelle a 1 % pres autour de la retenue (la grille va de 6 en 6 %), puis le vertical a la ligne pres.
  const s0 = mieux.echelle, dy0 = mieux.dy;
  for (const ds of [-0.03, -0.02, -0.01, 0.01, 0.02, 0.03]) {
    const s = s0 + ds, Bs = aLaHauteur(B, Math.round(h * s));
    for (let dy = dy0 - pas; dy <= dy0 + pas; dy += pas) essayer(s, dy, Bs);
  }
  const s = mieux.echelle, Bs = s === 1 ? B : aLaHauteur(B, Math.round(h * s)), dy1 = mieux.dy;
  for (let dy = dy1 - pas + 1; dy <= dy1 + pas - 1; dy++) if (dy !== dy1) essayer(s, dy, Bs);
  return mieux;
}

/**
 * La seconde passe : la pose grossiere (a HAUTEUR_RECHERCHE lignes) reprise a HAUTEUR_FINE lignes, l'echelle a 1 % pres et le vertical a
 * la ligne pres autour d'elle. Le resultat est en pixels de la passe fine.
 */
export function affiner(A: Bande, B: Bande, g: Jointure): Jointure {
  const k = A.image.hauteur / HAUTEUR_RECHERCHE, h = A.image.hauteur, pxParM = 30, rec = (0.15 * A.image.largeur) / pxParM;
  let mieux: Jointure = { ...g, dx: Math.round(g.dx * k), dy: Math.round(g.dy * k), score: -2 };
  const centre = mieux;
  for (const ds of [-0.02, -0.01, 0, 0.01, 0.02]) {
    const s = centre.echelle + ds, Bs = aLaHauteur(B, Math.round(h * s));
    for (let dy = centre.dy - 3; dy <= centre.dy + 3; dy++) {
      const { dx, score } = decalage(A, decalerEnY(Bs, dy, h), 0, pxParM, rec, 3);
      if (score > mieux.score) mieux = { dx, dy, echelle: s, score };
    }
  }
  return mieux.score > -2 ? mieux : { ...centre, score: g.score };
}

/**
 * Fusionne les photos, dans l'ordre (de gauche a droite). Chaque photo est d'abord ramenee a la hauteur de la premiere ; les jointures
 * se cherchent a `HAUTEUR_RECHERCHE` lignes, s'affinent a `HAUTEUR_FINE` et se reportent a pleine taille. null : moins de deux photos.
 */
export function fusionner(images: readonly Image[], avancement?: (fait: number, total: number) => void): Fusion | null {
  if (images.length < 2) return null;
  const bandes: Bande[] = images.map((image) => ({ image, vu: vuDe(image) }));
  const petites = bandes.map((b) => aLaHauteur(b, HAUTEUR_RECHERCHE));
  // La pose de chaque photo dans le repere de la premiere : echelle (photo ramenee a la hauteur H de la premiere, puis s), position.
  const H = images[0]?.hauteur ?? 1, r = H / HAUTEUR_FINE;
  const poses = [{ s: 1, x: 0, y: 0 }];
  const jointures: Jointure[] = [];
  for (let k = 1; k < bandes.length; k++) {
    avancement?.(k - 1, bandes.length - 1);
    const j = affiner(aLaHauteur(bandes[k - 1] as Bande, HAUTEUR_FINE), aLaHauteur(bandes[k] as Bande, HAUTEUR_FINE), poserVoisine(petites[k - 1] as Bande, petites[k] as Bande));
    jointures.push(j);
    const p = poses[k - 1] as { s: number; x: number; y: number };
    poses.push({ s: p.s * j.echelle, x: p.x + p.s * j.dx * r, y: p.y + p.s * j.dy * r });
  }
  avancement?.(bandes.length - 1, bandes.length - 1);
  return { image: composer(bandes, poses, H), jointures };
}

/**
 * Pose chaque photo (ramenee a la hauteur `H`, a l'echelle s, en x y) sur une toile et les fond comme Plan (`assembler`) : dans un
 * recouvrement, chaque photo pese d'autant plus qu'on est loin de son bord gauche ou droit. La toile est reduite s'il le faut.
 */
function composer(bandes: Bande[], poses: { s: number; x: number; y: number }[], H: number): Image {
  const boites = bandes.map((b, k) => { const p = poses[k] as { s: number; x: number; y: number }; const e = (H / b.image.hauteur) * p.s; return { e, x0: p.x, y0: p.y, x1: p.x + b.image.largeur * e, y1: p.y + b.image.hauteur * e }; });
  const gx = Math.min(...boites.map((b) => b.x0)), gy = Math.min(...boites.map((b) => b.y0));
  const lt = Math.max(...boites.map((b) => b.x1)) - gx, ht = Math.max(...boites.map((b) => b.y1)) - gy;
  const z = Math.min(1, Math.sqrt(PIXELS_FUSION / (lt * ht)));
  const Ht = Math.max(1, Math.round(ht * z));
  // Chaque photo, reechantillonnee a sa taille sur la toile, devient une bande de la toile entiere, posee en x par `assembler` ; le
  // decalage vertical est pris dans la bande.
  const surToile: Bande[] = [], positions: number[] = [];
  bandes.forEach((b, k) => {
    const q = boites[k] as (typeof boites)[number];
    const x0 = Math.round((q.x0 - gx) * z), y0 = Math.round((q.y0 - gy) * z);
    const l = Math.max(1, Math.round((q.x1 - q.x0) * z)), h = Math.max(1, Math.round((q.y1 - q.y0) * z));
    const t = reechantillonner(b, l, h);
    surToile.push(decalerEnY(t, y0, Ht));
    positions.push(x0);
  });
  return assembler(surToile, positions).image;
}

/** Une bande a la taille l x h, bilineaire (au plus proche dans le masque). */
function reechantillonner(b: Bande, l: number, h: number): Bande {
  const L0 = b.image.largeur, H0 = b.image.hauteur, kx = L0 / l, ky = H0 / h, s = b.image.donnees;
  if (l === L0 && h === H0) return b;
  const donnees = new Uint8ClampedArray(l * h * 4), vu = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(H0 - 1, Math.max(0, (y + 0.5) * ky - 0.5)), y0 = Math.floor(sy), y1 = Math.min(H0 - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < l; x++) {
      const sx = Math.min(L0 - 1, Math.max(0, (x + 0.5) * kx - 0.5)), x0 = Math.floor(sx), x1 = Math.min(L0 - 1, x0 + 1), tx = sx - x0;
      const a = y0 * L0 + x0, bb = y0 * L0 + x1, c = y1 * L0 + x0, d = y1 * L0 + x1, o = y * l + x;
      vu[o] = b.vu[Math.round(sy) * L0 + Math.round(sx)] ?? 0;
      for (let ch = 0; ch < 4; ch++) {
        donnees[o * 4 + ch] = ((s[a * 4 + ch] ?? 0) * (1 - tx) + (s[bb * 4 + ch] ?? 0) * tx) * (1 - ty) + ((s[c * 4 + ch] ?? 0) * (1 - tx) + (s[d * 4 + ch] ?? 0) * tx) * ty;
      }
    }
  }
  return { image: { largeur: l, hauteur: h, donnees }, vu };
}
