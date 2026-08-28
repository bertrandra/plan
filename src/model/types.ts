// Primitives geometriques (spec-migration-typescript.md §5.1).
//
// La distinction Pt / PtEcran est le premier interet du typage sur ce code : `toScreen` et
// `toWorld` prennent et rendent aujourd'hui la meme forme `{x, y}`, donc rien n'empeche de passer
// des pixels la ou on attend des metres. Les deux types les rendent non interchangeables.

import type { Metres, Degres } from './units.js';

/** Coordonnees du plan, en metres, Y vers le nord (donc vers le haut a l'ecran). */
export interface Pt {
  x: Metres;
  y: Metres;
}

/** Pixels SVG, Y vers le bas - la convention de l'ecran, inverse de celle du plan. */
export interface PtEcran {
  x: number;
  y: number;
}

/** Coordonnees geographiques WGS84. */
export interface LonLat {
  lon: Degres;
  lat: Degres;
}

/** Un point tel qu'il arrive du code non encore migre : non marque. */
export interface PtBrut {
  x: number;
  y: number;
}

/**
 * Une forme du plan, telle que la manipulent le rendu, les exports et la 3D.
 *
 * Trois types cohabitent sous une seule forme, et c'est le champ `type` qui dit lequel : un
 * `polygon` et un `path` portent `pts`, un `circle` porte `center` et `r`. Les rendre optionnels
 * plutot que d'ecrire trois types separes est un choix de transition : le programme les traite
 * partout par la meme boucle, et un vrai type discrimine demanderait de reecrire ces boucles.
 * C'est un chantier du durcissement (spec §12), pas de la migration.
 *
 * Les champs `show*` sont ce que l'utilisateur a choisi d'afficher ; ils ne changent jamais la
 * geometrie, seulement ce qui s'ecrit dessus.
 */
export interface ObjetPlan {
  key: string;
  type?: string;
  name: string;

  /** Polygone ferme ou chemin ouvert. */
  pts?: PtBrut[];
  /** Cercle. */
  center?: PtBrut;
  r?: number;

  /** Un nom par sommet et par cote : ces tableaux suivent `pts`, indice par indice. */
  vertexNames?: string[];
  segmentNames?: string[];
  /** Un coin gele ne bouge plus, ni au glisser ni par saisie d'angle. */
  frozenVertices?: boolean[];

  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  /** Largeur d'un chemin, en metres - c'est un objet du plan, pas un trait d'ecran. */
  width?: number;
  curve?: boolean;

  showName?: boolean;
  showSegNames?: boolean;
  showVertNames?: boolean;
  showDims?: boolean;
  showAngles?: boolean;

  hidden?: boolean;
  locked?: boolean;
  /** Contraint a rester dans la parcelle. */
  constrained?: boolean;
  /** Ordre d'empilement au dessin. */
  priority?: number;

  fonction?: string;
  matiere?: string;
  /** Hauteur en metres, pour la Vue 3D et les ombres. */
  elevation?: number;

  [autreChamp: string]: unknown;
}
