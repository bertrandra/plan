// Le registre des ouvrages du plan (MD/spec-ouvrages.md, etape 6.4) : ce que le dessin du plan fait d'un ouvrage en plus de sa forme,
// declare une fois par fonction. Le dessin (render/objects.ts) le lit ici, jamais par une comparaison de la fonction : un ouvrage
// qui dessine autrement s'ajoute a cette table, sans toucher au dessin.
//
// Les dessins propres d'un ouvrage (couches de la terrasse, ombre du parasol, bassin, charpente de l'abri) ont leur module a eux
// (render/terrasseCouches.ts, parasolOverlay.ts, piscineOverlay.ts, pergolaOverlay.ts) ; ce registre ne dit que l'habit du trace.

import { POINT_DE_VUE, LIMITE, ouvrageDeclare, type Ouvrage } from '../../model/ouvrages/index.js';

/** Ce que le plan ajoute au trace d'un ouvrage dessine en chemin. */
export interface TraceAuPlan {
  /**
   * Un point de vue : un point (la position) et un vecteur (la direction), pas un chemin qu'on arpente. Le premier point porte un
   * marqueur rond permanent (visible meme non selectionne), le second une pointe de fleche orientee sur le trait.
   */
  pointDeVue?: true;
  /**
   * Le pointille du trait. Une limite cadastrale interne a une propriete fusionnee n'est plus une limite de terrain, seulement un
   * reperage : le pointille dit exactement cela, et la distingue au premier coup d'oeil du contour plein de la parcelle.
   */
  pointille?: string;
}

const TRACES = new Map<Ouvrage, TraceAuPlan>([
  [POINT_DE_VUE, { pointDeVue: true }],
  [LIMITE, { pointille: '10 7' }]
]);

const AUCUN: TraceAuPlan = {};

/** L'habit du trace d'un objet, selon sa fonction ; rien de plus qu'un trait pour une fonction absente, inconnue ou sans habit. */
export function traceAuPlan(fonction: string | undefined | null): TraceAuPlan {
  const ouv = ouvrageDeclare(fonction);
  return (ouv && TRACES.get(ouv)) ?? AUCUN;
}
