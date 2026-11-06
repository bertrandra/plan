// Ou une poignee du mode Toit peut se poser a l'ecran (audit de la camera, 6 novembre 2026) : hors du panneau du mode et a une cible
// tactile des bords. Une poignee dont le point tombe sous le panneau (une orbite l'y a menee) se ramene au bord de la partie libre, la
// ou on peut la prendre ; son point reste le sien (le glisser se mesure la), un trait relie les deux. Pur : pas de DOM.

export interface Bornes { x0: number; y0: number; x1: number; y1: number }

/** Le point `q` ramene dans `b` (le plus proche), et s'il a fallu le deplacer. */
export function ramenerDansLeLibre(q: { x: number; y: number }, b: Bornes): { x: number; y: number; ramene: boolean } {
  const x = Math.min(Math.max(q.x, b.x0), b.x1), y = Math.min(Math.max(q.y, b.y0), b.y1);
  return { x, y, ramene: x !== q.x || y !== q.y };
}
