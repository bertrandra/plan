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
