// Les images que l'analyse par Claude recoit (MD/spec-regles-toits.md §14.1, lot L17), dessinees
// par le navigateur : une photo reduite a 1 024 px, l'orthophoto recadree sur le contour du
// batiment (512 px, contour trace), la carte des hauteurs LiDAR (bleu bas, rouge haut, contour,
// echelle). Le rendu du modele depuis la prise de vue est dans three/renduPrise.ts.
//
// Tout ce qui est pur (la rampe de couleurs, le cadrage) est exporte et teste ; le dessin lui-meme
// demande un canevas, et les tests de l'orchestration l'injectent.

import type { ToitMesure, PtBrut } from '../model/types.js';
import type { TuileOrtho } from './ortho.js';

/** Les photos partent a 1 024 px de grand cote (spec-regles-toits §14.1 et §14.4 : ~1 000 tokens chacune). */
export const COTE_ANALYSE_PX = 1024;
/** L'orthophoto et la carte des hauteurs, carrees, a 512 px (~360 tokens chacune). */
export const COTE_CARTE_PX = 512;
/** Autour du contour du batiment, en metres : on voit le bord du toit et ce qui le touche. */
export const MARGE_CARTE_M = 3;
const QUALITE_JPEG = 0.85;

export interface ImageAnalyse { base64: string; mediaType: 'image/jpeg' | 'image/png'; largeur: number; hauteur: number }

const base64De = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error('image illisible'));
    img.src = src;
  });
}

function canevas(l: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const c = document.createElement('canvas');
  c.width = l; c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
}

/** Les dimensions ramenees sous `max` de grand cote, sans jamais agrandir. */
export function dimensionsAnalyse(l: number, h: number, max = COTE_ANALYSE_PX): { l: number; h: number } {
  const k = Math.min(1, max / Math.max(l, h));
  return { l: Math.max(1, Math.round(l * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Une photo de la capture (base64 JPEG) reduite pour l'analyse ; null si le navigateur ne la lit pas. */
export async function reduirePhotoAnalyse(base64: string, max = COTE_ANALYSE_PX): Promise<ImageAnalyse | null> {
  try {
    const img = await chargerImage('data:image/jpeg;base64,' + base64);
    const { l, h } = dimensionsAnalyse(img.naturalWidth, img.naturalHeight, max);
    if (l === img.naturalWidth && h === img.naturalHeight) return { base64, mediaType: 'image/jpeg', largeur: l, hauteur: h };
    const cv = canevas(l, h);
    if (!cv) return null;
    cv.ctx.drawImage(img, 0, 0, l, h);
    return { base64: base64De(cv.c.toDataURL('image/jpeg', QUALITE_JPEG)), mediaType: 'image/jpeg', largeur: l, hauteur: h };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Le cadrage carre autour d'un contour
 * --------------------------------------------------------------------------------------------- */

export interface Cadrage { xMin: number; yMin: number; coteM: number; px: (p: PtBrut) => { x: number; y: number } }

/** Un carre, en metres, centre sur le contour avec sa marge, et la projection vers un canevas de `taille` px (y vers le bas). */
export function cadrageCarre(contour: readonly PtBrut[], taille = COTE_CARTE_PX, margeM = MARGE_CARTE_M): Cadrage {
  const xs = contour.map((p) => p.x), ys = contour.map((p) => p.y);
  const xMin0 = Math.min(...xs), xMax0 = Math.max(...xs), yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const coteM = Math.max(xMax0 - xMin0, yMax0 - yMin0) + 2 * margeM;
  const xMin = (xMin0 + xMax0) / 2 - coteM / 2, yMin = (yMin0 + yMax0) / 2 - coteM / 2;
  const k = taille / coteM;
  return { xMin, yMin, coteM, px: (p) => ({ x: (p.x - xMin) * k, y: taille - (p.y - yMin) * k }) };
}

/* ------------------------------------------------------------------------------------------------
 * La carte des hauteurs LiDAR
 * --------------------------------------------------------------------------------------------- */

/** La rampe de `rendu.py` : bleu en bas, cyan, vert, jaune, rouge en haut ; `t` de 0 a 1. */
export function couleurHauteur(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  const paliers: [number, number, number][] = [[40, 60, 200], [40, 190, 220], [60, 190, 80], [240, 220, 60], [220, 50, 40]];
  const s = x * (paliers.length - 1);
  const i = Math.min(paliers.length - 2, Math.floor(s)), f = s - i;
  const a = paliers[i] ?? [0, 0, 0], b = paliers[i + 1] ?? a;
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

function tracerContour(ctx: CanvasRenderingContext2D, contour: readonly PtBrut[], cad: Cadrage, couleur: string): void {
  if (contour.length < 2) return;
  ctx.beginPath();
  contour.forEach((p, i) => { const q = cad.px(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
  ctx.closePath();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** L'echelle (une barre de 5 m) et le nord, en bas a gauche ; la legende des hauteurs a droite si on la donne. */
function tracerEchelle(ctx: CanvasRenderingContext2D, cad: Cadrage, taille: number, legende: { min: number; max: number } | null): void {
  const pxParM = taille / cad.coteM;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(8, taille - 34, 5 * pxParM + 16, 26);
  ctx.fillStyle = '#111';
  ctx.fillRect(16, taille - 20, 5 * pxParM, 4);
  ctx.font = '12px sans-serif';
  ctx.fillText('5 m', 16, taille - 24);
  ctx.fillText('N ↑', taille - 36, 18);
  if (!legende) return;
  for (let i = 0; i < 100; i++) {
    const [r, g, b] = couleurHauteur(1 - i / 99);
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    ctx.fillRect(taille - 24, 30 + i, 12, 1.2);
  }
  ctx.fillStyle = '#111';
  ctx.fillText(legende.max.toFixed(1) + ' m', taille - 60, 28);
  ctx.fillText(legende.min.toFixed(1) + ' m', taille - 60, 144);
}

/**
 * La carte des hauteurs du toit mesure (spec-regles-toits §14.1) : chaque cellule de la grille en
 * couleur, du bleu (le plus bas) au rouge (le faite), le contour et l'echelle. Null sans canevas.
 */
export function dessinerCarteHauteurs(mesure: ToitMesure, contour: readonly PtBrut[], taille = COTE_CARTE_PX): ImageAnalyse | null {
  const cv = canevas(taille, taille);
  if (!cv) return null;
  const { ctx } = cv;
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, taille, taille);
  const cad = cadrageCarre(contour, taille);
  const valeurs = mesure.z.filter((v): v is number => v !== null);
  const min = valeurs.length ? Math.min(...valeurs) : 0, max = valeurs.length ? Math.max(...valeurs) : 1;
  const k = taille / cad.coteM;
  const pasPx = Math.max(1, mesure.pas * k);
  for (let j = 0; j < mesure.ny; j++) for (let i = 0; i < mesure.nx; i++) {
    const v = mesure.z[j * mesure.nx + i];
    if (v === null || v === undefined) continue;
    const [r, g, b] = couleurHauteur(max > min ? (v - min) / (max - min) : 0.5);
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    // La grille court du nord au sud : la ligne j est a `y0 - j * pas` ; la cellule couvre son pas.
    const q = cad.px({ x: mesure.x0 + i * mesure.pas, y: mesure.y0 - j * mesure.pas });
    ctx.fillRect(q.x, q.y, pasPx + 0.5, pasPx + 0.5);
  }
  tracerContour(ctx, contour, cad, '#111');
  tracerEchelle(ctx, cad, taille, { min, max });
  return { base64: base64De(cv.c.toDataURL('image/png')), mediaType: 'image/png', largeur: taille, hauteur: taille };
}

/* ------------------------------------------------------------------------------------------------
 * L'orthophoto recadree
 * --------------------------------------------------------------------------------------------- */

/** Les tuiles qui touchent le carre du cadrage. */
export function tuilesDuCadrage(tuiles: readonly TuileOrtho[], cad: Cadrage): TuileOrtho[] {
  return tuiles.filter((t) => !!t.dataUri && t.xMin < cad.xMin + cad.coteM && t.xMin + t.largeur > cad.xMin && t.yMin < cad.yMin + cad.coteM && t.yMin + t.hauteur > cad.yMin);
}

/**
 * L'orthophoto recadree sur le contour (spec-regles-toits §14.1) : les tuiles deja chargees pour le
 * fond du plan (render/ortho.ts, en coordonnees monde), posees dans le carre, le contour trace. Null
 * sans tuile sous le batiment ou sans canevas.
 */
export async function dessinerOrthoRecadree(tuiles: readonly TuileOrtho[], contour: readonly PtBrut[], taille = COTE_CARTE_PX): Promise<ImageAnalyse | null> {
  const cad = cadrageCarre(contour, taille);
  const utiles = tuilesDuCadrage(tuiles, cad);
  if (!utiles.length) return null;
  const cv = canevas(taille, taille);
  if (!cv) return null;
  const { ctx } = cv;
  ctx.fillStyle = '#ddd';
  ctx.fillRect(0, 0, taille, taille);
  const k = taille / cad.coteM;
  let posees = 0;
  for (const t of utiles) {
    try {
      const img = await chargerImage(t.dataUri as string);
      const hg = cad.px({ x: t.xMin, y: t.yMin + t.hauteur });
      ctx.drawImage(img, hg.x, hg.y, t.largeur * k, t.hauteur * k);
      posees++;
    } catch { /* une tuile illisible laisse un trou gris */ }
  }
  if (!posees) return null;
  tracerContour(ctx, contour, cad, '#ffeb3b');
  tracerEchelle(ctx, cad, taille, null);
  return { base64: base64De(cv.c.toDataURL('image/jpeg', QUALITE_JPEG)), mediaType: 'image/jpeg', largeur: taille, hauteur: taille };
}
