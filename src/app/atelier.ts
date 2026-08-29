// L'atelier : ce que les écouteurs ont le droit de demander à l'application (spec §6.4, app/).
//
// Tout ce qui reste dans `legacy.ts` est du câblage, et il tient dans une seule fermeture parce que
// tout y ferme sur `etat`, sur la racine SVG et sur une soixantaine d'enveloppes. C'est ce qui l'a
// rendu insécable jusqu'ici : sortir un écouteur, c'est sortir tout ce sur quoi il ferme.
//
// L'atelier est la réponse : **la fermeture devient un objet nommé**. `boot()` le construit une fois
// que tout existe, et chaque groupe d'écouteurs le reçoit en paramètre. Rien ne change de place dans
// l'ordre d'exécution — seule la portée devient explicite.
//
// Ce qu'il n'est pas : un conteneur d'injection, ni un bus. C'est la liste, écrite noir sur blanc, de
// ce dont le câblage a besoin. Elle est longue parce que le câblage l'est ; la voir longue est
// précisément l'intérêt — et elle raccourcira à mesure que la phase 7 typera ce qu'elle transporte.

import type { ObjetPlan } from '../model/types.js';

/**
 * L'état du plan, tel que le câblage le voit. Non décrit plus finement ici : sa forme appartient à
 * `core/state.ts`, et la fixer sera un travail de la phase 7.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EtatPlan = any;

/** Ce que l'application expose à ses écouteurs. */
export interface Atelier {
  // ---- L'état, et de quoi le lire -------------------------------------------------------------
  etat: EtatPlan;
  /** Un objet par sa clé, ou `undefined`. */
  objByKey: (key: string) => ObjetPlan | undefined;
  /** L'état du plan au chargement — la référence du bouton « Réinitialiser ». */
  initialState: () => ObjetPlan[];
  initialMeasures: () => EtatPlan[];

  // ---- Historique -----------------------------------------------------------------------------
  pushHistory: () => void;
  markDirty: () => void;
  undo: () => void;
  restoreState: (instantane: { objects: ObjetPlan[]; measures: EtatPlan[] }) => void;

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
  addNewViewpoint: () => void;
  duplicateSelectedObject: () => void;
  deleteSelectedObject: () => void;
  sendObjectBackward: (obj: ObjetPlan) => void;
}
