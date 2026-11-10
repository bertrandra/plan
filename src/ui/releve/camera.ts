// Les photos d'une facade cote navigateur : passer d'un canevas a une `Image` brute que le calcul (facade/) sait traiter, et retour,
// pour encoder la texture en JPEG. La camera du releve (son flux video, ses objectifs) est partie avec sa capture (lot F6) : les
// photos d'une facade se prennent dans l'audit de la parcelle, par le champ fichier du telephone (app/audit/photo.ts).

import type { Image } from '../../facade/vision/homographie.js';
import type { Photo } from '../../facade/releve/prise.js';

export type { Photo };

/** Plus grand cote d'une photo traitee : au-dela, le redressement ne gagne rien et coute. */
export const PHOTO_MAX_PX = 2400;


/** Le contexte 2D d'un canevas : sans lui (memoire epuisee, canevas trop grand), rien ne se dessine. */
function contexte2d(c: HTMLCanvasElement, lecturesFrequentes = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: lecturesFrequentes });
  if (!ctx) throw new Error("Le navigateur n'a pas pu ouvrir un canevas de " + c.width + ' x ' + c.height + ' pixels.');
  return ctx;
}

/** Un canevas a la taille voulue, reduit si besoin pour ne pas depasser `maxPx` (`PHOTO_MAX_PX`). */
export function canevasPour(l: number, h: number, maxPx = PHOTO_MAX_PX): { c: HTMLCanvasElement; k: number } {
  const k = Math.min(1, maxPx / Math.max(l, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(l * k));
  c.height = Math.max(1, Math.round(h * k));
  return { c, k };
}

export function imageDuCanevas(c: HTMLCanvasElement): Image {
  const ctx = contexte2d(c, true);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { largeur: c.width, hauteur: c.height, donnees: d.data };
}

/** Charge une image depuis une URL (fichier, data:) dans un canevas. */
// Par `onload` et non `img.decode()` : `decode()` attend que la page soit visible, et une vue web
// cachee un instant (bascule d'application, module natif qui reprend la main) le laissait suspendu.
export function chargerUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("L'image n'a pas pu être lue."));
    img.src = url;
  });
}

/** Encode une image brute en JPEG. */
export function versJpeg(img: Image, qualite = 0.82): string {
  const c = document.createElement('canvas');
  c.width = img.largeur;
  c.height = img.hauteur;
  const ctx = contexte2d(c);
  const d = ctx.createImageData(img.largeur, img.hauteur);
  d.data.set(img.donnees);
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/jpeg', qualite);
}
