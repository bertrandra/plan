// La photo jointe a un cas (MD/spec-audit.md §5.1) : prise avec l'appareil, reduite a 1 280 px de
// large en JPEG, environ 300 Ko, puis gardee en base64 dans le fichier de la promenade.

import type { PhotoCas } from '../../model/audit.js';

/** La largeur (ou hauteur) maxi de l'image reduite. */
export const COTE_PHOTO_MAX_PX = 1280;
/** Le poids vise ; la qualite JPEG descend jusqu'a l'atteindre. */
export const OCTETS_PHOTO_MAX = 300 * 1024;

/** Les dimensions reduites d'une image, proportions gardees. */
export function dimensionsReduites(l: number, h: number, max = COTE_PHOTO_MAX_PX): { l: number; h: number } {
  const k = Math.min(1, max / Math.max(l, h));
  return { l: Math.round(l * k), h: Math.round(h * k) };
}

/** Le poids en octets d'une chaine base64. */
export const octetsBase64 = (b64: string): number => Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Reduit un fichier image (l'appareil photo du telephone) en JPEG d'environ 300 Ko. */
export async function reduirePhoto(fichier: Blob): Promise<PhotoCas> {
  const image = await createImageBitmap(fichier);
  const { l, h } = dimensionsReduites(image.width, image.height);
  const toile = document.createElement('canvas');
  toile.width = l; toile.height = h;
  const g = toile.getContext('2d');
  if (!g) throw new Error('canevas indisponible');
  g.drawImage(image, 0, 0, l, h);
  image.close?.();
  let base64 = '';
  for (let q = 0.85; q >= 0.4; q -= 0.1) {
    base64 = toile.toDataURL('image/jpeg', q).split(',')[1] ?? '';
    if (octetsBase64(base64) <= OCTETS_PHOTO_MAX) break;
  }
  return { type: 'image/jpeg', base64 };
}
