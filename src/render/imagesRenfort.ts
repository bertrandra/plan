// Les deux images du renfort de Claude (MD/spec-facades-calage-detection.md §12 bis, « Ce qu'il
// reçoit », lot L18), dessinees par le navigateur :
// - **la photo**, reduite a 1 024 px, entouree d'une marge grise ou la grille continue (un coin hors
//   cadre s'y situe), avec une grille de reperes numerotee de 0 a 10 dans chaque sens et le
//   quadrilatere que Plan croit etre le mur (plein si ses coins ont ete trouves, en tirets sinon) ;
// - **l'elevation redressee**, le mur seul, avec une graduation en metres en bas et a gauche, les
//   ouvertures detectees encadrees et numerotees, et le masque d'occlusion hachure.
// Un modele de langage situe mieux un point par rapport a des reperes visibles qu'en pixels bruts.
//
// Le cadrage est pur et teste ; le dessin demande un canevas, et les tests de l'orchestration
// l'injectent.

import { DEBORD_GRILLE, DIVISIONS_GRILLE, graduations } from '../facade/renfort.js';
import { COTE_ANALYSE_PX, dimensionsAnalyse, type ImageAnalyse } from './imagesAnalyse.js';
import type { Image as ImagePixels, P2 } from '../facade/homographie.js';

/** La marge autour de la photo, en part de son grand cote : un coin jusqu'a un repere et demi hors cadre y tient. */
export const MARGE_PHOTO = 0.15;
/** La bande de la graduation de l'elevation, en pixels. */
export const BANDE_GRADUATION_PX = 34;
const QUALITE_JPEG = 0.85;
const JAUNE = '#ffd400';
const ROUGE = '#e0201c';

/** Ou la photo tombe dans le canevas : son echelle, sa marge, et la taille du canevas. */
export interface CadragePhoto { k: number; marge: number; largeur: number; hauteur: number; l: number; h: number }

/** Le cadrage de la photo : reduite sous `max` (marge comprise), centree dans sa marge grise. */
export function cadragePhotoRenfort(largeurPx: number, hauteurPx: number, max = COTE_ANALYSE_PX): CadragePhoto {
  const total = 1 + 2 * MARGE_PHOTO;
  const { l } = dimensionsAnalyse(largeurPx * total, hauteurPx * total, max);
  const k = l / (largeurPx * total);
  const lp = Math.round(largeurPx * k), hp = Math.round(hauteurPx * k);
  const marge = Math.round(Math.max(lp, hp) * MARGE_PHOTO);
  return { k, marge, largeur: lp + 2 * marge, hauteur: hp + 2 * marge, l: lp, h: hp };
}

/** Un point de la photo (pixels) dans le canevas. */
export function versCanevas(p: P2, c: CadragePhoto, largeurPx: number, hauteurPx: number): P2 {
  return { x: c.marge + (p.x / largeurPx) * c.l, y: c.marge + (p.y / hauteurPx) * c.h };
}

const base64De = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

function canevas(l: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(l)); c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
}

/** Une image de pixels (facade/homographie.ts) sur un canevas a sa taille : la source des dessins. */
export function canevasDe(img: ImagePixels): HTMLCanvasElement | null {
  const cv = canevas(img.largeur, img.hauteur);
  if (!cv) return null;
  cv.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.donnees), img.largeur, img.hauteur), 0, 0);
  return cv.c;
}

/** Une image `data:` chargee, pour la dessiner ; null si le navigateur ne la lit pas. */
export function chargerSource(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function texteCentre(ctx: CanvasRenderingContext2D, t: string, x: number, y: number): void {
  const m = ctx.measureText(t);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - m.width / 2 - 3, y - 9, m.width + 6, 17);
  ctx.fillStyle = JAUNE;
  ctx.fillText(t, x - m.width / 2, y + 5);
}

/** La grille de reperes : une ligne par repere, de -2 a 12, numerotee de 0 a 10 dans la marge. */
function tracerGrille(ctx: CanvasRenderingContext2D, c: CadragePhoto): void {
  ctx.font = 'bold 13px sans-serif';
  ctx.lineWidth = 1;
  for (let i = -DEBORD_GRILLE; i <= DIVISIONS_GRILLE + DEBORD_GRILLE; i++) {
    const x = c.marge + (i / DIVISIONS_GRILLE) * c.l, y = c.marge + (i / DIVISIONS_GRILLE) * c.h;
    ctx.strokeStyle = i >= 0 && i <= DIVISIONS_GRILLE ? 'rgba(255,212,0,0.75)' : 'rgba(255,212,0,0.35)';
    if (x >= 0 && x <= c.largeur) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.hauteur); ctx.stroke(); }
    if (y >= 0 && y <= c.hauteur) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.largeur, y); ctx.stroke(); }
    if (i < 0 || i > DIVISIONS_GRILLE) continue;
    texteCentre(ctx, String(i), x, c.marge / 2);
    texteCentre(ctx, String(i), c.marge / 2, y);
  }
}

/**
 * La photo du renfort : `source` (la photo analysee, de `largeurPx` x `hauteurPx`), la grille et le
 * quadrilatere des coins (`coins`, pixels de la photo ; en tirets s'ils ne sont que predits). Null
 * sans canevas.
 */
export function dessinerPhotoRenfort(source: CanvasImageSource, largeurPx: number, hauteurPx: number, coins: readonly P2[], coinsTrouves: boolean): ImageAnalyse | null {
  const c = cadragePhotoRenfort(largeurPx, hauteurPx);
  const cv = canevas(c.largeur, c.hauteur);
  if (!cv) return null;
  const { ctx } = cv;
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, c.largeur, c.hauteur);
  ctx.drawImage(source, c.marge, c.marge, c.l, c.h);
  tracerGrille(ctx, c);
  if (coins.length === 4) {
    ctx.strokeStyle = JAUNE;
    ctx.lineWidth = 3;
    ctx.setLineDash(coinsTrouves ? [] : [10, 7]);
    ctx.beginPath();
    coins.forEach((p, i) => { const q = versCanevas(p, c, largeurPx, hauteurPx); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  return { base64: base64De(cv.c.toDataURL('image/jpeg', QUALITE_JPEG)), mediaType: 'image/jpeg', largeur: c.largeur, hauteur: c.hauteur };
}

/** Ce que l'elevation montre : le mur, ses ouvertures numerotees, et ce qui est cache. */
export interface EntreeElevationRenfort {
  source: CanvasImageSource;
  /** La taille de la source, en pixels, et la part qui est le mur (du haut `y0` au bas), si la source deborde (texture avec la bande du toit). */
  largeurPx: number;
  hauteurPx: number;
  y0Px?: number;
  largeurM: number;
  hauteurM: number;
  ouvertures: readonly { x: number; y: number; l: number; h: number }[];
  /** Le masque d'occlusion (1 : cache), a la resolution de la source ; facultatif. */
  cache?: { masque: Uint8Array; largeur: number; hauteur: number } | null;
}

/** L'elevation du renfort, graduee en metres, ouvertures numerotees. Null sans canevas. */
export function dessinerElevationRenfort(e: EntreeElevationRenfort): ImageAnalyse | null {
  const y0 = e.y0Px ?? 0;
  const { l, h } = dimensionsAnalyse(e.largeurPx, e.hauteurPx - y0, COTE_ANALYSE_PX - BANDE_GRADUATION_PX);
  const g = BANDE_GRADUATION_PX;
  const cv = canevas(l + g, h + g);
  if (!cv) return null;
  const { ctx } = cv;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, l + g, h + g);
  ctx.drawImage(e.source, 0, y0, e.largeurPx, e.hauteurPx - y0, g, 0, l, h);
  const kx = l / e.largeurM, ky = h / e.hauteurM;
  if (e.cache) {
    ctx.strokeStyle = 'rgba(200,0,200,0.55)';
    ctx.lineWidth = 1;
    const m = e.cache;
    for (let j = 0; j < m.hauteur; j += 6) for (let i = 0; i < m.largeur; i += 6) {
      if (!m.masque[j * m.largeur + i]) continue;
      const x = g + (i / m.largeur) * l, y = (j / m.hauteur) * h;
      ctx.beginPath(); ctx.moveTo(x, y + 6 * (h / m.hauteur)); ctx.lineTo(x + 6 * (l / m.largeur), y); ctx.stroke();
    }
  }
  // La graduation : en bas depuis la gauche, a gauche depuis le sol.
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#111';
  ctx.font = '12px sans-serif';
  for (const v of graduations(e.largeurM)) {
    const x = g + v * kx;
    ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x, h + 8); ctx.stroke();
    if (Number.isInteger(v)) ctx.fillText(v + ' m', Math.min(x + 2, l + g - 28), h + 22);
  }
  for (const v of graduations(e.hauteurM)) {
    const y = h - v * ky;
    ctx.beginPath(); ctx.moveTo(g - 8, y); ctx.lineTo(g, y); ctx.stroke();
    if (Number.isInteger(v)) ctx.fillText(String(v), 4, Math.max(12, y + 4));
  }
  ctx.font = 'bold 15px sans-serif';
  e.ouvertures.forEach((o, i) => {
    const x = g + o.x * kx, y = h - (o.y + o.h) * ky;
    ctx.strokeStyle = ROUGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, o.l * kx, o.h * ky);
    ctx.fillStyle = ROUGE;
    ctx.fillRect(x, y, 20, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(i + 1), x + 4, y + 14);
  });
  return { base64: base64De(cv.c.toDataURL('image/png')), mediaType: 'image/png', largeur: l + g, hauteur: h + g };
}
