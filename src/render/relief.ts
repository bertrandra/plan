// Les courbes de niveau du relief sur le plan (MD/spec-relief.md §5.3, render/).
//
// Coquille posee par la branche de l'interface : le corps est ecrit par l'agent du rendu et
// remplace celui-ci a la fusion. Seule la signature compte ici — c'est elle que le crochet
// `dessinerRelief` de la pipeline (app/boot.ts) appelle a chaque rendu, dans le groupe `reliefGroup`
// pose juste au-dessus de la grille.

import type { EtatScene } from '../geometry/vue.js';
import type { ObjetPlan } from '../model/types.js';

/** Dessine les courbes de niveau de la parcelle du projet dans `groupe` ; le vide quand il n'y a pas de relief. */
export function dessinerCourbesRelief(groupe: SVGElement, objets: ObjetPlan[], scene: EtatScene): void {
  // Remplacee par l'agent rendu a la fusion.
  void groupe; void objets; void scene;
}
