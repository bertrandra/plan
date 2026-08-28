// Transformation de la scene : monde (metres) <-> ecran (pixels SVG).
//
// Spec-migration-typescript.md §6.1 : « un seul objet d'etat explicite, passe en parametre ».
// L'echelle et l'origine etaient deux variables libres de la fermeture de boot(), lues et
// ecrites depuis une quarantaine d'endroits - le zoom, le deplacement, le rendu, les exports,
// la grille. Les regrouper dans un objet nomme ne change rien a l'execution, mais rend la
// dependance visible : une fonction qui transforme des coordonnees le dit maintenant dans sa
// signature.
//
// Convention du plan, conservee telle quelle : X+ vers l'est, Y+ vers le nord - donc l'ecran,
// dont l'axe Y descend, inverse le signe de Y et seulement lui.

import type { PtBrut, PtEcran } from '../model/types.js';

export interface EtatScene {
  /** Pixels par metre. */
  scale: number;
  /** Position, en pixels, du point (0,0) du plan. */
  origine: PtEcran;
  // La taille utile de la scene (W, H) reste pour l'instant dans legacy.ts : ce sont deux
  // identifiants d'une lettre, dont le remplacement global serait plus risque que profitable
  // tant que render/** n'est pas sorti. Ils rejoindront cet objet avec le rendu (phase 4, suite).
}

export function creerScene(): EtatScene {
  return { scale: 16.5, origine: { x: 430, y: 90 } };
}

export function versEcran(scene: EtatScene, p: PtBrut): PtEcran {
  return { x: scene.origine.x + p.x * scene.scale, y: scene.origine.y - p.y * scene.scale };
}

export function versMonde(scene: EtatScene, p: PtEcran): PtBrut {
  return { x: (p.x - scene.origine.x) / scene.scale, y: -(p.y - scene.origine.y) / scene.scale };
}
