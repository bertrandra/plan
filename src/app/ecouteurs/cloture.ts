// Les deux listes de points de vue des vues 3D (spec §6.4, app/).
//
// La clôture, qui vivait ici avec elles, se règle depuis l'étape 4 dans la section Parcelle de
// l'inspecteur (ui/champs/objet.ts) : elle est rangée sur la parcelle, comme le lieu, et se
// sauvegarde avec le plan.

import type { ObjetPlan } from '../../model/types.js';

/** Ce que les listes de points de vue déclenchent. */
export interface ContexteCloture {
  /** Un objet du plan par sa clé. */
  objByKey: (cle: string) => ObjetPlan | undefined;
  allerAuPointDeVue: (vp: ObjetPlan) => void;
  allerAuPointDeVueGlb: (vp: ObjetPlan) => void;
}

export function brancherCloture(ctx: ContexteCloture): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  /**
   * Les deux listes déroulantes se **remettent à vide** après usage : elles servent à déclencher un
   * déplacement, pas à afficher un choix courant. Laisser le point de vue sélectionné donnerait
   * l'impression qu'on y est resté, alors que la caméra a pu bouger depuis.
   */
  const brancherListeDeVues = (id: string, aller: (vp: ObjetPlan) => void) => {
    el(id).addEventListener('change', function () {
      const vp = ctx.objByKey(this.value);
      this.value = '';
      if (vp) aller(vp);
    });
  };
  brancherListeDeVues('terrasse3dViewSelect', ctx.allerAuPointDeVue);
  brancherListeDeVues('glbViewerViewSelect', ctx.allerAuPointDeVueGlb);
}
