// Ou une poignee du mode Toit peut se poser a l'ecran (audit de la camera, 6 novembre 2026) : hors du panneau du mode et a une cible
// tactile des bords. Une poignee dont le point tombe sous le panneau (une orbite l'y a menee) se ramene au bord de la partie libre, la
// ou on peut la prendre ; son point reste le sien (le glisser se mesure la), un trait relie les deux. Pur : pas de DOM.

/** Un rectangle de l'ecran, en pixels du calque. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * La partie libre : un rectangle, moins ce qui se pose dessus sans en occuper tout un bord (le plan des facades, en haut a gauche de
 * la scene : une poignee dessous ne se prenait pas, nuit du 9 novembre 2026). Les obstacles sont deja agrandis de la marge voulue.
 */
export interface Bornes extends Rect { obstacles?: readonly Rect[] }

const dedans = (q: { x: number; y: number }, r: Rect) => q.x > r.x0 && q.x < r.x1 && q.y > r.y0 && q.y < r.y1;

/** Le point est-il dans la partie libre (le rectangle, hors des obstacles) ? */
export function dansLeLibre(q: { x: number; y: number }, b: Bornes): boolean {
  return q.x >= b.x0 && q.x <= b.x1 && q.y >= b.y0 && q.y <= b.y1 && !(b.obstacles ?? []).some((o) => dedans(q, o));
}

/**
 * Le point `q` ramene dans `b` (le plus proche), et s'il a fallu le deplacer. Sous un obstacle, il en sort par le bord le plus proche
 * qui reste dans le rectangle.
 */
export function ramenerDansLeLibre(q: { x: number; y: number }, b: Bornes): { x: number; y: number; ramene: boolean } {
  let x = Math.min(Math.max(q.x, b.x0), b.x1), y = Math.min(Math.max(q.y, b.y0), b.y1);
  for (const o of b.obstacles ?? []) {
    if (!dedans({ x, y }, o)) continue;
    const sorties = [{ x: o.x0, y }, { x: o.x1, y }, { x, y: o.y0 }, { x, y: o.y1 }]
      .filter((p) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1)
      .sort((p, r) => Math.hypot(p.x - x, p.y - y) - Math.hypot(r.x - x, r.y - y));
    if (sorties[0]) ({ x, y } = sorties[0]);
  }
  return { x, y, ramene: x !== q.x || y !== q.y };
}
