// La cle du plan pour un tour : un calcul qui ne depend que du plan (le chiffrage, les cotes, la recherche des doublons) se reprend tel
// quel entre les appels d'un meme rendu (feuille de selection, bandeau de l'inspecteur, tuiles et resume des resultats, cotes, menu).
// Elle vaut pour une tache : une micro-tache l'efface avant que le plan ne puisse changer (un geste est une autre tache).
//
// Ce n'est plus le plan serialise : a 600 objets, la serialisation (800 Ko, 78 ms au telephone) coutait plus que les calculs
// qu'elle evitait de refaire (le chiffrage d'une terrasse, une vingtaine de ms), et elle se payait a chaque rendu, change ou non.
// La recherche des doublons, elle, ne se fait plus qu'a l'ouverture du menu qui la propose (zones/BarreApplication.tsx).

import type { ObjetPlan } from '../model/types.js';

let jeton = 0;
let cleDuTour: { objets: readonly ObjetPlan[]; cle: string } | null = null;

/** La cle du plan pour cette tache : la meme pour tous les appels d'un rendu, une autre a la tache suivante. */
export function cleDuPlan(objets: readonly ObjetPlan[]): string {
  if (cleDuTour && cleDuTour.objets === objets) return cleDuTour.cle;
  const cle = 'tour#' + ++jeton;
  cleDuTour = { objets, cle };
  queueMicrotask(() => { cleDuTour = null; });
  return cle;
}
