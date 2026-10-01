// Les trois commandes de vue (spec §6.4, app/).
//
// Trois vues — le plan, la Vue 3D, la visionneuse — et un seul bouton allumé : la règle et son
// application vivent dans `app/modes.ts`. Les boutons eux-mêmes sont dans la barre d'application (zones/BarreApplication.tsx) depuis l'étape 1
// de la reconstruction : ici on ne fait que déclarer les commandes qu'ils exécutent.

import type { RegistreCommandes } from '../commandes.js';
import { CAPACITES } from '../../plateforme/capacites.js';

/** Ce que les boutons du haut déclenchent. */
export interface ContexteBoutonsDeVue {
  allerAuPlan: () => void;
  goVue3D: () => void;
  ouvrirVisionneuse: () => void;
}

export function brancherBoutonsDeVue(ctx: ContexteBoutonsDeVue, cmd: RegistreCommandes): void {
  const vue = (id: string, libelle: string, executer: () => void, capacite?: string) =>
    cmd.declarer({ id, libelle, groupe: 'vue', executer, ...(capacite ? { capacite } : {}) });
  vue('vue.plan', 'Plan', () => ctx.allerAuPlan());
  // La 3D est une fonction de l'offre (`plan.3d`) : sans elle, les deux boutons disparaissent et
  // three.js n'est jamais charge.
  vue('vue.3d', 'Vue 3D', () => ctx.goVue3D(), CAPACITES.vue3d.code);
  vue('vue.visionneuse', 'Visionneuse GLB', () => ctx.ouvrirVisionneuse(), CAPACITES.vue3d.code);
}
