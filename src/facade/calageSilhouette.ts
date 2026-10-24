// Le calage de la silhouette du mur sur la facade complete (Admin › Calibrer la detection, etapes 5 et 6 ; zones/CalageSilhouette.tsx
// le montre) : ses bouts et son sol en pixels de l'assemblage, sa hauteur tenue par le rapport du plan, et l'etirement vertical de la
// photo autour du sol. Pur.

import type { P2 } from './homographie.js';

/** Le calage : les bouts et le sol de la silhouette (pixels de l'assemblage), et l'etirement vertical de la photo autour du sol. */
export interface Calage { x0: number; x1: number; sol: number; k: number }
export type Prise = 'gauche' | 'droite' | 'sol' | 'tout' | 'haut';

/** Un pas au clavier, en part du grand cote ; l'ecart minimal entre les bouts ; l'etirement admis. */
export const PAS_CLAVIER = 0.002, ECART_MIN = 0.05, ETIREMENT: readonly [number, number] = [0.5, 2];

/** Le calage de depart : le mur retenu (ses coins sur l'assemblage), l'etirement qui fait tomber son egout sur celui de la silhouette. */
export function calageDe(coins: readonly P2[], rapport: number): Calage {
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  const x0 = (hg.x + bg.x) / 2, x1 = (hd.x + bd.x) / 2, sol = (bd.y + bg.y) / 2, egout = (hg.y + hd.y) / 2;
  const k = sol - egout > 0 ? ((x1 - x0) * rapport) / (sol - egout) : 1;
  return { x0, x1, sol, k: Math.min(ETIREMENT[1], Math.max(ETIREMENT[0], k)) };
}

/** L'egout de la silhouette sur la photo etiree : sa hauteur suit sa largeur, au rapport du plan (hauteur / largeur). */
export function egoutDuCalage(c: Calage, rapport: number): number {
  return c.sol - (c.x1 - c.x0) * rapport;
}

/**
 * Un geste sur le calage : un bout, le sol, la silhouette entiere, ou le haut de la photo (qui suit le doigt, le sol restant ou il
 * est). Les bouts restent ecartes de `min` pixels ; l'etirement reste dans ETIREMENT.
 */
export function bouger(p: Prise, dx: number, dy: number, d: Calage, min: number): Calage {
  if (p === 'gauche') return { ...d, x0: Math.min(d.x0 + dx, d.x1 - min) };
  if (p === 'droite') return { ...d, x1: Math.max(d.x1 + dx, d.x0 + min) };
  if (p === 'sol') return { ...d, sol: d.sol + dy };
  if (p === 'tout') return { ...d, x0: d.x0 + dx, x1: d.x1 + dx, sol: d.sol + dy };
  // La poignee du haut : le haut de l'image suit le doigt, le sol reste ou il est.
  const k = d.sol > 0 ? (d.sol - (d.sol - d.k * d.sol + dy)) / d.sol : d.k;
  return { ...d, k: Math.min(ETIREMENT[1], Math.max(ETIREMENT[0], k)) };
}

/** Les coins du mur sur l'assemblage non etire que donne le calage : l'egout de la silhouette y est ramene. */
export function coinsDuCalage(c: Calage, rapport: number): P2[] {
  const e = c.sol - (c.sol - egoutDuCalage(c, rapport)) / c.k;
  return [{ x: c.x0, y: e }, { x: c.x1, y: e }, { x: c.x1, y: c.sol }, { x: c.x0, y: c.sol }];
}
