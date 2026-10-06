// L'atelier : ce que les écouteurs ont le droit de demander à l'application (spec §6.4, app/).
//
// Tout ce qui restait dans `legacy.ts` était du câblage, et il tenait dans une seule fermeture parce
// que tout y fermait sur `etat`, sur la racine SVG et sur une soixantaine d'enveloppes. C'est ce qui
// l'avait rendu insécable : sortir un écouteur, c'était sortir tout ce sur quoi il ferme. Cette
// fermeture vit désormais dans `app/boot.ts`, un module typé (phase 4).
//
// L'atelier est la réponse : **la fermeture devient un objet nommé**. `boot()` le construit une fois
// que tout existe, et chaque groupe d'écouteurs le reçoit en paramètre. Rien ne change de place dans
// l'ordre d'exécution — seule la portée devient explicite.
//
// Ce qu'il n'est pas : un conteneur d'injection, ni un bus. C'est la liste, écrite noir sur blanc, de
// ce dont le câblage a besoin. Elle est longue parce que le câblage l'est ; la voir longue est
// précisément l'intérêt — et elle raccourcira à mesure que la phase 7 typera ce qu'elle transporte.

import type { ObjetPlan, ObjetBrut, Mesure } from '../model/types.js';
import type { FormePiscine } from '../model/creation.js';
import type { EtatApp } from '../core/state.js';

/**
 * L'état du plan, tel que le câblage le voit — **c'est `EtatApp`**, pas une forme à part.
 *
 * Ce nom était un `any` en attendant la phase 7 : `core/state.ts` décrivait déjà l'état, mais rien ne
 * reliait les deux, et le câblage pouvait lire un champ qui n'existe pas sans que personne ne le
 * remarque. L'alias reste parce qu'il se lit mieux ici ; ce qu'il désigne est désormais vérifié.
 */
export type EtatPlan = EtatApp;

/** Ce que l'application expose à ses écouteurs. */
export interface Atelier {
  // ---- L'état, et de quoi le lire -------------------------------------------------------------
  etat: EtatPlan;
  /** Un objet par sa clé, ou `undefined`. */
  objByKey: (key: string | null) => ObjetPlan | undefined;
  /** L'état du plan au chargement — la référence du bouton « Réinitialiser ». */
  initialState: () => ObjetPlan[];
  initialMeasures: () => Mesure[];

  // ---- Historique -----------------------------------------------------------------------------
  pushHistory: () => void;
  markDirty: () => void;
  undo: () => void;
  /**
   * Remplace le plan par un instantane, **avant normalisation** : `core/history.ts` fait passer
   * `objects` par `normalizeObjects` en le restaurant, exactement comme au chargement d'un fichier.
   * C'est pourquoi le parametre accepte `ObjetBrut`, pas `ObjetPlan` — un `ObjetPlan[]` deja complet
   * (le cas de `initialState()`) le satisfait aussi, puisque tous ses champs sont alors presents.
   */
  restoreState: (instantane: { objects: ObjetBrut[]; measures: Partial<Mesure>[] }) => void;

  // ---- Redessiner -----------------------------------------------------------------------------
  render: () => void;
  rebuildSelector: () => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  reapplyStackingOrder: () => void;
  fitToObject: (obj: ObjetPlan | null) => void;

  // ---- Modifier le plan -----------------------------------------------------------------------
  addNewObject: (enRectangle: boolean) => void;
  addNewPath: () => void;
  addNewCircle: () => void;
  addNewParasol: () => void;
  addNewPergola: () => void;
  addNewCarport: () => void;
  addNewPiscine: (forme: FormePiscine) => void;
  addNewViewpoint: () => void;
  /** Pose une terrasse sur plots autour de la piscine, liee a elle, et la selectionne. */
  addTerrassePiscine: (piscine: ObjetPlan) => void;
  /** Pose un trou au centre de la terrasse, et le selectionne. */
  addTrouTerrasse: (terrasse: ObjetPlan) => void;
  /** Selectionne un objet existant. */
  selectObject: (key: string) => void;
  duplicateSelectedObject: () => void;
  deleteSelectedObject: () => void;
  sendObjectBackward: (obj: ObjetPlan) => void;
}
