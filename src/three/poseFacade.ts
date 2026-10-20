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

/** La part de l'image que le panneau du mode recouvre : la facade se cadre dans le reste, pas derriere lui. Tout en pixels. */
export interface Reserve { largeur: number; hauteur: number; droite: number; bas: number }

/**
 * `a`, `b` : les bouts du mur ; `n` : la normale qui sort du batiment (unitaire, dans le plan) ; `hauteur` : la hauteur du faitage ;
 * `fovDeg` : le champ vertical de la camera ; `aspect` : largeur sur hauteur de l'image ; `reserve` : ce que le panneau recouvre.
 */
export function poseDeFacade(a: PtBrut, b: PtBrut, n: PtBrut, hauteur: number, cen: PtBrut, fovDeg: number, aspect: number, reserve?: Reserve): PoseCamera {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const largeur = Math.hypot(b.x - a.x, b.y - a.y);
  const demiChamp = Math.tan((fovDeg * Math.PI) / 360);
  const h = Math.max(hauteur, 2);
  // La partie de l'image qui reste libre, en part de l'image entiere.
  const libreL = reserve ? Math.max(0.3, 1 - reserve.droite / reserve.largeur) : 1, libreH = reserve ? Math.max(0.3, 1 - reserve.bas / reserve.hauteur) : 1;
  const distance = Math.max(largeur / (2 * demiChamp * Math.max(aspect, 0.3) * libreL), h / (2 * demiChamp * libreH)) * MARGE + 1;
  const cible = { x: mx - cen.x, y: h / 2, z: cen.y - my };
  // Ce que vaut un metre a l'ecran, en part de la hauteur de l'image : le decalage qui recentre la facade dans la partie libre.
  const parMetre = 1 / (2 * distance * demiChamp);
  const ns = { x: n.x, z: -n.y };
  // Vers la droite de l'ecran quand on regarde le mur : (-fz, fx) avec le regard f = -ns.
  const droite = { x: ns.z, z: -ns.x };
  const dx = reserve ? (reserve.droite / reserve.hauteur / 2) / parMetre : 0, dy = reserve ? (reserve.bas / reserve.hauteur / 2) / parMetre : 0;
  const centre = { x: cible.x + droite.x * dx, y: cible.y - dy, z: cible.z + droite.z * dx };
  return { cible: centre, position: { x: centre.x + ns.x * distance, y: centre.y, z: centre.z + ns.z * distance } };
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
