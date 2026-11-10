// L'accord avant de retoucher la forme d'un objet venu du cadastre ou de l'IGN (model/retouche.ts).
//
// Tout geste qui deforme son contour (tirer un sommet ou un cote, le rayon, ajouter ou retirer un sommet, saisir un angle, une
// longueur, le mode rectangle) passe par ici. Non retouche, l'objet demande d'abord : la confirmation est asynchrone, le geste ne
// se fait donc qu'a la reponse. « Annuler » : rien n'a lieu, aucun pas d'annulation. « Confirmer » : le marque se pose (le projet
// est a enregistrer), puis le geste suit. Une fois marque, plus de question.

import { showConfirm } from '../shell/dialogs.js';
import { toucher } from '../core/controleurObjets.js';
import { retoucheADemander, marquerRetouche, questionRetouche } from '../model/retouche.js';
import type { ObjetPlan } from '../model/types.js';

/** Ce que l'accord demande au reste de l'application. */
export interface DependancesRetouche {
  /** Le projet a change (le marque est pose). */
  markDirty: () => void;
  /** La question a la personne ; par defaut le dialogue de confirmation (Z8). */
  confirmer?: ((message: string, oui: () => void) => void) | undefined;
}

/**
 * Fait le geste `poursuivre` sur `obj`, avec l'accord de la personne s'il le faut. Rend `true` quand le geste a eu lieu tout de
 * suite, `false` quand il attend la reponse (il aura lieu au « Confirmer », ou jamais).
 */
export function avecAccordDeRetouche(obj: ObjetPlan, d: DependancesRetouche, poursuivre: () => void): boolean {
  if (!retoucheADemander(obj)) { poursuivre(); return true; }
  (d.confirmer ?? showConfirm)(questionRetouche(obj), () => {
    marquerRetouche(obj);
    toucher(obj);
    d.markDirty();
    poursuivre();
  });
  return false;
}

/** Apres l'accord donne a l'appui d'un glisser : le glisser ne reprend pas tout seul, la personne tire de nouveau. */
export const MESSAGE_RETOUCHE_PERMISE = 'Retouche permise : tirez de nouveau pour modifier la forme.';
