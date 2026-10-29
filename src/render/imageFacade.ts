// L'image du run d'une facade par Claude (MD/spec-facade-calage-audit.md §8, lots F2 et F3), dessinee par le navigateur : l'image
// prise pour la suite telle quelle (l'assemblage de la calibration, l'elevation du mur dans l'audit et le releve), sans grille ni
// numero (Claude rend des proportions, pas des reperes), reduite sous 1 024 px, et ce qu'aucune photo ne montre peint en gris.
//
// (Les deux images du renfort a trois passes, la photo a grille de reperes et l'elevation graduee, sont parties avec lui au lot F3.)

import { dimensionsAnalyse, type ImageAnalyse } from './imagesAnalyse.js';
import type { Image as ImagePixels } from '../facade/vision/homographie.js';

const QUALITE_JPEG = 0.85;

const base64De = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

function canevas(l: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(l)); c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
}

/** Une image de pixels (facade/vision/homographie.ts) sur un canevas a sa taille : la source du dessin. */
function canevasDe(img: ImagePixels): HTMLCanvasElement | null {
  const cv = canevas(img.largeur, img.hauteur);
  if (!cv) return null;
  cv.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.donnees), img.largeur, img.hauteur), 0, 0);
  return cv.c;
}

/**
 * L'image du run d'une facade : `img` telle quelle, reduite sous 1 024 px. Ce qu'aucune photo ne montre (`cache` a 1 : le masque
 * d'occlusion d'une fusion, ou le dehors d'un assemblage) est peint en gris, comme le prompt le dit. Null sans canevas.
 */
export function dessinerImageFacade(img: ImagePixels, cache: Uint8Array | null = null): ImageAnalyse | null {
  const src = cache && cache.length === img.largeur * img.hauteur ? griser(img, cache) : img;
  const source = canevasDe(src);
  const { l, h } = dimensionsAnalyse(img.largeur, img.hauteur);
  const cv = source ? canevas(l, h) : null;
  if (!source || !cv) return null;
  cv.ctx.drawImage(source, 0, 0, img.largeur, img.hauteur, 0, 0, l, h);
  return { base64: base64De(cv.c.toDataURL('image/jpeg', QUALITE_JPEG)), mediaType: 'image/jpeg', largeur: l, hauteur: h };
}

/** L'image, ses pixels caches (`cache` a 1) peints d'un gris moyen. */
function griser(img: ImagePixels, cache: Uint8Array): ImagePixels {
  const d = new Uint8ClampedArray(img.donnees);
  for (let i = 0; i < cache.length; i++) if (cache[i]) { d[i * 4] = 128; d[i * 4 + 1] = 128; d[i * 4 + 2] = 128; d[i * 4 + 3] = 255; }
  return { largeur: img.largeur, hauteur: img.hauteur, donnees: d };
}
