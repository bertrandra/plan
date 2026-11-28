// Le cadre d'un apercu SVG qu'on agrandit et qu'on deplace (l'apercu des parcelles de l'import
// cadastral) : ce que montre son `viewBox`, en unites du dessin.
//
// Le dessin est en metres, X vers l'est et Y vers le BAS (le nord du plan retourne), pour que le
// `viewBox` se lise directement. Le cadre complet montre tout ; un cadre agrandi en est une partie,
// de meme proportion, qui ne sort jamais du complet : on ne recule pas au-dela de tout voir, et
// l'on n'avance pas au-dela du point ou la plus petite parcelle remplirait l'apercu.
//
// L'apercu est pose en `preserveAspectRatio` par defaut (xMidYMid meet) : le cadre est centre dans
// la boite de l'ecran, a l'echelle qui le fait tenir entier. `pointDuCadre` et `unitesParPixel`
// suivent cette regle pour passer d'un pixel de l'ecran a un point du dessin.

import type { PtBrut } from '../model/types.js';

export interface Cadre { x: number; y: number; w: number; h: number }
/** La taille a l'ecran de la boite qui montre le cadre, en pixels CSS. */
export interface Boite { largeur: number; hauteur: number }

/** En deca, on n'avance plus : une parcelle de quelques metres remplit deja l'apercu. */
export const LARGEUR_MIN_M = 5;
/** Un pas des boutons et du clavier : deux pas font un peu plus qu'un doublement. */
export const PAS_ZOOM = 1.5;
/**
 * Un toucher ou un clic qui a bouge de plus que ceci (en pixels) est un glisser : il deplace la vue
 * et ne choisit rien. Quelques pixels, pour qu'un doigt qui tremble choisisse encore.
 */
export const SEUIL_GLISSER_PX = 6;

/** Le cadre qui montre tous ces points, avec la marge de l'apercu (3 % de la demi-somme des cotes, 2 m au moins). */
export function cadreComplet(points: Iterable<PtBrut>): Cadre {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (!(minX <= maxX)) { minX = maxX = minY = maxY = 0; }
  const marge = Math.max(2, (maxX - minX + maxY - minY) * 0.03);
  // Y du dessin = -Y du plan : le haut du cadre est le nord le plus au nord.
  return { x: minX - marge, y: -maxY - marge, w: maxX - minX + 2 * marge, h: maxY - minY + 2 * marge };
}

/**
 * La largeur en deca de laquelle on n'agrandit plus : celle ou la plus petite de ces parcelles
 * remplirait l'apercu, `LARGEUR_MIN_M` au moins, le cadre complet au plus.
 */
export function largeurMinimale(complet: Cadre, parcelles: readonly (readonly PtBrut[])[]): number {
  let plusPetite = Infinity;
  for (const pts of parcelles) {
    if (!pts.length) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    plusPetite = Math.min(plusPetite, Math.max(maxX - minX, maxY - minY));
  }
  const l = Number.isFinite(plusPetite) ? Math.max(LARGEUR_MIN_M, plusPetite) : LARGEUR_MIN_M;
  return Math.min(complet.w, l);
}

/**
 * Le cadre ramene dans ses bornes : la proportion du complet, une largeur entre `largeurMin` et
 * celle du complet, et tout entier dans le complet. Un cadre `null` est le complet.
 */
export function borner(cadre: Cadre | null, complet: Cadre, largeurMin: number): Cadre {
  if (!cadre) return { ...complet };
  const w = Math.min(complet.w, Math.max(Math.min(largeurMin, complet.w), cadre.w));
  const h = complet.h * (w / complet.w);
  // Le centre est garde, puis le cadre rentre dans le complet s'il en deborde.
  const cx = cadre.x + cadre.w / 2, cy = cadre.y + cadre.h / 2;
  const x = Math.min(complet.x + complet.w - w, Math.max(complet.x, cx - w / 2));
  const y = Math.min(complet.y + complet.h - h, Math.max(complet.y, cy - h / 2));
  return { x, y, w, h };
}

/** Le cadre montre-t-il tout (a un millieme pres) ? */
export function estComplet(cadre: Cadre, complet: Cadre): boolean {
  return cadre.w >= complet.w * 0.999;
}

/** Le grossissement du cadre par rapport au complet : 1 quand on voit tout. */
export function grossissement(cadre: Cadre, complet: Cadre): number {
  return complet.w / cadre.w;
}

/**
 * Agrandit (facteur > 1) ou reduit (< 1) le cadre autour d'un point du dessin, qui reste sous le
 * pointeur ; sans point, autour du centre. Le resultat est borne.
 */
export function zoomer(cadre: Cadre, complet: Cadre, largeurMin: number, facteur: number, ancre?: PtBrut): Cadre {
  const a = ancre ?? { x: cadre.x + cadre.w / 2, y: cadre.y + cadre.h / 2 };
  const w = Math.min(complet.w, Math.max(Math.min(largeurMin, complet.w), cadre.w / facteur));
  const k = w / cadre.w;
  const brut = { x: a.x - (a.x - cadre.x) * k, y: a.y - (a.y - cadre.y) * k, w, h: cadre.h * k };
  return borner(brut, complet, largeurMin);
}

/** Deplace le cadre de (dx, dy) unites du dessin, sans sortir du complet. */
export function deplacer(cadre: Cadre, complet: Cadre, largeurMin: number, dx: number, dy: number): Cadre {
  return borner({ ...cadre, x: cadre.x + dx, y: cadre.y + dy }, complet, largeurMin);
}

/** Combien d'unites du dessin fait un pixel de la boite (le cadre y tient entier, centre). */
export function unitesParPixel(cadre: Cadre, boite: Boite): number {
  const echelle = Math.min(boite.largeur / cadre.w, boite.hauteur / cadre.h);
  return echelle > 0 ? 1 / echelle : 0;
}

/** Le point du dessin sous un pixel de la boite (origine en haut a gauche de la boite). */
export function pointDuCadre(cadre: Cadre, boite: Boite, px: number, py: number): PtBrut {
  const u = unitesParPixel(cadre, boite);
  if (!u) return { x: cadre.x + cadre.w / 2, y: cadre.y + cadre.h / 2 };
  const decalX = (boite.largeur - cadre.w / u) / 2, decalY = (boite.hauteur - cadre.h / u) / 2;
  return { x: cadre.x + (px - decalX) * u, y: cadre.y + (py - decalY) * u };
}

/** Un geste qui a bouge de (dx, dy) pixels est-il un glisser (et pas un toucher) ? */
export function estUnGlisser(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > SEUIL_GLISSER_PX;
}
