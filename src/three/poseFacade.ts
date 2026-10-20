// La pose de la camera devant une facade (mode Toit de la Vue 3D) : en elevation, perpendiculaire au mur, a mi-hauteur.
//
// Les coordonnees de la scene sont celles du plan recentrees sur `cen`, l'axe y du plan devenant -z : x_scene = x - cen.x,
// z_scene = cen.y - y. La camera recule assez pour que tout le mur et la hauteur du batiment tiennent dans le champ.
//
// Pur : pas de scene, pas de DOM.

import type { PtBrut } from '../model/types.js';

export interface PoseCamera {
  position: { x: number; y: number; z: number };
  cible: { x: number; y: number; z: number };
}

/** Plus la marge est grande, plus le mur est petit dans l'image. */
const MARGE = 1.25;

/**
 * `a`, `b` : les bouts du mur ; `n` : la normale qui sort du batiment (unitaire, dans le plan) ; `hauteur` : la hauteur du faitage ;
 * `fovDeg` : le champ vertical de la camera ; `aspect` : largeur sur hauteur de l'image.
 */
export function poseDeFacade(a: PtBrut, b: PtBrut, n: PtBrut, hauteur: number, cen: PtBrut, fovDeg: number, aspect: number): PoseCamera {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const largeur = Math.hypot(b.x - a.x, b.y - a.y);
  const demiChamp = Math.tan((fovDeg * Math.PI) / 360);
  const h = Math.max(hauteur, 2);
  const distance = Math.max(largeur / (2 * demiChamp * Math.max(aspect, 0.3)), h / (2 * demiChamp)) * MARGE + 1;
  const cible = { x: mx - cen.x, y: h / 2, z: cen.y - my };
  return { cible, position: { x: cible.x + n.x * distance, y: cible.y, z: cible.z - n.y * distance } };
}

/**
 * La camera au-dessus d'un batiment, presque a la verticale (un leger recul evite l'alignement degenere de l'orbite) : `etendue` est le plus grand
 * cote du batiment, `centre` son milieu dans le plan.
 */
export function poseDeDessus(centre: PtBrut, etendue: number, cen: PtBrut, fovDeg: number, aspect: number): PoseCamera {
  const demiChamp = Math.tan((fovDeg * Math.PI) / 360);
  const hauteur = (Math.max(etendue, 4) / (2 * demiChamp * Math.min(Math.max(aspect, 0.3), 1))) * MARGE + 2;
  const cible = { x: centre.x - cen.x, y: 0, z: cen.y - centre.y };
  return { cible, position: { x: cible.x, y: hauteur, z: cible.z + hauteur * 0.02 } };
}
