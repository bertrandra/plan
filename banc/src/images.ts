// Les images dans le navigateur : lire un fichier (l'orientation de l'EXIF appliquee), reduire, passer en pixels et en JPEG.

import type { Image } from './plan/facade/vision/homographie.js';

/** Le grand cote d'une photo gardee : assez pour lire un petit bois a 15 m, assez peu pour l'hebergement. */
export const COTE_SOURCE = 3200;
/** Le grand cote du travail de redressement (les points de fuite n'ont pas besoin de plus). */
export const COTE_TRAVAIL = 1600;
export const COTE_VIGNETTE = 360;
/**
 * Le plus grand canevas qu'on dessine. Safari (iPhone, iPad) refuse un canevas de plus de 16 777 216 pixels : il reste vide, sans
 * erreur, et la photo importee avec lui (un panoramique 360 ramene a 6000 x 3000 en fait 18 millions).
 */
export const PIXELS_MAX = 16_000_000;

export function canevas(l: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(l));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canevas indisponible dans ce navigateur.');
  return { c, ctx };
}

/** Une image source (fichier, Blob ou adresse) en bitmap, l'orientation de l'EXIF appliquee. */
export async function bitmap(source: Blob | string): Promise<ImageBitmap> {
  const blob = typeof source === 'string' ? await (await fetch(source, { credentials: 'same-origin' })).blob() : source;
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Image illisible par ce navigateur (une photo HEIC ? importez-la depuis l’iPhone, qui la convertit en JPEG).');
  }
}

/** Le facteur qui ramene une image de `l` x `h` a un grand cote de `cote` au plus, et a PIXELS_MAX pixels au plus. */
export const facteurDeReduction = (l: number, h: number, cote: number): number => Math.min(1, cote / Math.max(l, h), Math.sqrt(PIXELS_MAX / Math.max(1, l * h)));

/** Le bitmap reduit pour que son grand cote ne depasse pas `cote` (ni le canevas PIXELS_MAX), sur un canevas. */
export function reduire(b: CanvasImageSource & { width: number; height: number }, cote: number): HTMLCanvasElement {
  const k = facteurDeReduction(b.width, b.height, cote);
  const { c, ctx } = canevas(b.width * k, b.height * k);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(b, 0, 0, c.width, c.height);
  return c;
}

export function pixels(c: HTMLCanvasElement): Image {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canevas indisponible.');
  const img = { largeur: c.width, hauteur: c.height, donnees: ctx.getImageData(0, 0, c.width, c.height).data };
  if (estVide(img.donnees)) throw new Error('Le navigateur n’a pas pu dessiner l’image (mémoire des canevas épuisée ?) : rechargez la page et réessayez.');
  return img;
}

/** Une image toute transparente : ce que rend un canevas que le navigateur n'a pas pu allouer. Lue sur un pixel sur mille au plus. */
export function estVide(donnees: ArrayLike<number>): boolean {
  const n = donnees.length / 4, pas = Math.max(1, Math.floor(n / 1000));
  for (let i = 0; i < n; i += pas) if (donnees[i * 4 + 3] !== 0) return false;
  return true;
}

/**
 * Rend la memoire d'un canevas tout de suite. Safari plafonne la memoire de tous les canevas de la page et ne la rend qu'au ramasse-miettes :
 * sans cela, une suite d'imports finit en canevas vides.
 */
export function liberer(...l: (HTMLCanvasElement | null | undefined)[]): void {
  for (const c of l) if (c) { c.width = 0; c.height = 0; }
}

export function versCanevas(img: Image): HTMLCanvasElement {
  const { c, ctx } = canevas(img.largeur, img.hauteur);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.donnees), img.largeur, img.hauteur), 0, 0);
  return c;
}

export function jpeg(c: HTMLCanvasElement, qualite = 0.9): Promise<Blob> {
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Encodage JPEG impossible.'))), 'image/jpeg', qualite));
}

/** La vignette d'une image (JPEG). */
export async function vignette(b: CanvasImageSource & { width: number; height: number }): Promise<Blob> {
  const c = reduire(b, COTE_VIGNETTE);
  try { return await jpeg(c, 0.8); } finally { liberer(c); }
}
