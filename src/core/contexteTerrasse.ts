// La terrasse courante : un contexte du plan, pas une vue (spec-ihm-zones §7, decision 4).
//
// Depuis l'etape 3 de la reconstruction de l'interface, il n'y a plus de mode Terrasse. Ce qui en
// reste est une regle, appliquee avant chaque rendu :
//
// - selectionner une terrasse — sur le canevas, dans l'explorateur — en fait la terrasse courante ;
// - selectionner autre chose ne la change pas : on peut regler une terrasse puis deplacer un
//   parasol sans perdre le contexte ;
// - une terrasse courante disparue (supprimee, ou passee a une autre fonction) est remplacee par la
//   premiere qui reste, et faute de terrasse il n'y a pas de contexte.
//
// C'est la meme reparation que faisait l'ancienne barre de choix du mode Terrasse, sortie du DOM.

import type { ObjetPlan } from '../model/types.js';

/** Ce que la regle lit et ecrit. */
export interface EtatContexteTerrasse {
  objects: ObjetPlan[];
  selectedKey: string | null;
  terrasseSelectedKey: string | null;
}

export const estTerrasse = (o: ObjetPlan): boolean => o.fonction === 'terrasse';

/**
 * Aligne la terrasse courante sur la selection et sur les objets presents. Rend `true` quand elle a
 * change : l'appelant sait alors qu'il doit rafraichir ce qui la decrit.
 */
export function synchroniserContexteTerrasse(etat: EtatContexteTerrasse): boolean {
  const avant = etat.terrasseSelectedKey;
  const selection = etat.objects.find(o => o.key === etat.selectedKey);
  if (selection && estTerrasse(selection)) {
    etat.terrasseSelectedKey = selection.key;
  } else if (!etat.objects.some(o => o.key === etat.terrasseSelectedKey && estTerrasse(o))) {
    const premiere = etat.objects.find(estTerrasse);
    etat.terrasseSelectedKey = premiere ? premiere.key : null;
  }
  return etat.terrasseSelectedKey !== avant;
}

/** La terrasse courante, ou `undefined` quand le plan n'en a pas. */
export function terrasseCourante(etat: EtatContexteTerrasse): ObjetPlan | undefined {
  return etat.objects.find(o => o.key === etat.terrasseSelectedKey && estTerrasse(o));
}

/**
 * La terrasse selectionnee, ou `undefined` : la selection est autre chose, ou rien. Plus etroit
 * que la terrasse courante, qui survit a la selection d'un parasol — c'est ce que lisent les
 * resultats (Z6), qui n'apparaissent que pour une terrasse selectionnee (decision 4).
 */
export function terrasseSelectionnee(etat: EtatContexteTerrasse): ObjetPlan | undefined {
  const selection = etat.objects.find(o => o.key === etat.selectedKey);
  return selection && estTerrasse(selection) ? selection : undefined;
}
