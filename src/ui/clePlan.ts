// La cle du contenu du plan : tout le plan serialise, pour qu'un calcul qui ne depend que de lui (le chiffrage, les cotes, la recherche
// des doublons) se reprenne tel quel tant que rien n'a change. Un rendu la demande plusieurs fois (feuille de selection, bandeau de
// l'inspecteur, tuiles et resume des resultats, cotes, menu) ; la serialiser a chaque fois coutait plus que le reste du rendu au
// telephone (feuille de route, etape 2.2). Elle se calcule donc une fois par tache : les appels d'un meme rendu la partagent, une
// micro-tache l'efface avant que le plan ne puisse changer (un geste est une autre tache).

import type { ObjetPlan } from '../model/types.js';

let cleDuTour: { objets: readonly ObjetPlan[]; cle: string } | null = null;
// Les grilles d'altitudes (`z` du relief, de son paysage, du toit mesure) entrent dans la cle par leur identite : des dizaines de
// milliers de valeurs, jamais modifiees sur place, seulement remplacees (« Actualiser le relief », une relecture du toit).
const grilles = new WeakMap<object, number>();
let prochaineGrille = 0;
const grilleParIdentite = (k: string, v: unknown): unknown => {
  if (k !== 'z' || !Array.isArray(v)) return v;
  let n = grilles.get(v);
  if (n === undefined) { n = ++prochaineGrille; grilles.set(v, n); }
  return 'grille#' + n;
};
/** La cle du contenu du plan pour cette tache : la meme pour tous les appels d'un rendu. */
export function cleDuPlan(objets: readonly ObjetPlan[]): string {
  if (cleDuTour && cleDuTour.objets === objets) return cleDuTour.cle;
  const cle = JSON.stringify(objets, grilleParIdentite);
  cleDuTour = { objets, cle };
  queueMicrotask(() => { cleDuTour = null; });
  return cle;
}
