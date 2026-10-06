// Glisser un portail ou un portillon le long de la cloture (interaction/).
//
// L'acces suit le cote de la parcelle le plus proche du pointeur, d'un cote a l'autre si on passe
// un angle, sans sortir du cote ni empieter sur ses bords (`poserAcces`, model/cloture.ts). Ce qui
// separait le pointeur du milieu de l'acces au moment de le saisir est garde : l'acces ne saute pas
// sous le doigt au premier mouvement.

import { coteLePlusProche, poserAcces } from '../model/cloture.js';
import { facadesDuContour, type Facade } from '../facade/geometrie.js';
import type { Portail, PtBrut } from '../model/types.js';

/** L'abscisse d'un point le long d'un cote, depuis son bord gauche vu de dehors, en metres. */
function abscisse(f: Facade, p: PtBrut): number {
  const L = f.largeur || 1;
  return ((p.x - f.gauche.x) * (f.droite.x - f.gauche.x) + (p.y - f.gauche.y) * (f.droite.y - f.gauche.y)) / L;
}

/** L'ecart entre le milieu de l'acces et le point ou on l'a saisi, le long de son cote. */
export function decalageDeSaisie(a: Portail, pts: readonly PtBrut[], p: PtBrut): number {
  const f = facadesDuContour(pts, 0).find(x => x.cote === a.cote);
  return f ? a.x + a.largeur / 2 - abscisse(f, p) : 0;
}

/**
 * Pose l'acces sur le cote le plus proche de `p`, decale de la prise. Rend `true` si l'acces a
 * bouge : un mouvement plus petit que le centimetre (l'arrondi de `poserAcces`) n'en est pas un.
 */
export function glisserAcces(a: Portail, pts: readonly PtBrut[], p: PtBrut, decalage: number): boolean {
  const proche = coteLePlusProche(pts, p);
  const f = facadesDuContour(pts, 0).find(x => x.cote === proche.cote);
  if (!f) return false;
  const L = f.largeur || 1;
  const ux = (f.droite.x - f.gauche.x) / L, uy = (f.droite.y - f.gauche.y) / L;
  const avant = a.cote + ':' + a.x;
  poserAcces(a, f, { x: p.x + ux * decalage, y: p.y + uy * decalage });
  return a.cote + ':' + a.x !== avant;
}
