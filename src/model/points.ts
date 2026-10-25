// Les points et les segments du plan (spec-migration-typescript.md §5.1) : la distinction Pt / PtEcran est le premier interet du
// typage, `toScreen` et `toWorld` prenant la meme forme `{x, y}`. A part de model/types.ts, qui les re-exporte : les autres
// fichiers de types du modele s'en servent sans revenir a lui.

import type { Metres } from './units.js';

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

/** Un point tel qu'il arrive du code non encore migre : non marque. */
export interface PtBrut {
  x: number;
  y: number;
}

/**
 * Un segment oriente : d'ou il part, ou il va.
 *
 * La forme `{ a, b }` etait ecrite a la main dans une dizaine de signatures — decoupe de ligne,
 * cotes d'un anneau, solives, lambourdes, cadre. Elle porte un nom pour la meme raison que `PtBrut` :
 * la voir passer de fonction en fonction dit ce que le calcul manipule.
 *
 * A ne pas confondre avec `LimiteBrute` (`geometry/rings.ts`), qui est une **paire** `[p0, p1]` :
 * deux formes distinctes, et confondre les deux etait precisement l'erreur que le typage a trouvee.
 */
export interface Segment {
  a: PtBrut;
  b: PtBrut;
}
