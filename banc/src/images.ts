// Les images dans le navigateur : lire un fichier (l'orientation de l'EXIF appliquee), reduire, passer en pixels et en JPEG.

import type { Image } from './plan/facade/vision/homographie.js';

/** Le grand cote d'une photo gardee : assez pour lire un petit bois a 15 m, assez peu pour l'hebergement. */
export const COTE_SOURCE = 3200;
/** Le grand cote du travail de redressement (les points de fuite n'ont pas besoin de plus). */
export const COTE_TRAVAIL = 1600;
export const COTE_VIGNETTE = 360;

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

/** Le bitmap reduit pour que son grand cote ne depasse pas `cote`, sur un canevas. */
export function reduire(b: CanvasImageSource & { width: number; height: number }, cote: number): HTMLCanvasElement {
  const k = Math.min(1, cote / Math.max(b.width, b.height));
  const { c, ctx } = canevas(b.width * k, b.height * k);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(b, 0, 0, c.width, c.height);
  return c;
}

export function pixels(c: HTMLCanvasElement): Image {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canevas indisponible.');
  return { largeur: c.width, hauteur: c.height, donnees: ctx.getImageData(0, 0, c.width, c.height).data };
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
export function vignette(b: CanvasImageSource & { width: number; height: number }): Promise<Blob> {
  return jpeg(reduire(b, COTE_VIGNETTE), 0.8);
}
