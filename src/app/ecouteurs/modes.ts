// Les quatre commandes de vue (spec §6.4, app/).
//
// Quatre vues, un seul bouton allumé — la règle et son application vivent dans `app/modes.ts`. Les
// boutons eux-mêmes sont dans la barre d'application (zones/BarreApplication.tsx) depuis l'étape 1
// de la reconstruction : ici on ne fait que déclarer les commandes qu'ils exécutent.

import type { RegistreCommandes } from '../commandes.js';

/** Ce que les boutons du haut déclenchent. */
export interface ContexteBoutonsDeVue {
  allerAuPlan: () => void;
  allerAuModeTerrasse: () => void;
  goVue3D: () => void;
  ouvrirVisionneuse: () => void;
}

export function brancherBoutonsDeVue(ctx: ContexteBoutonsDeVue, cmd: RegistreCommandes): void {
  const vue = (id: string, libelle: string, executer: () => void) => cmd.declarer({ id, libelle, groupe: 'vue', executer });
  vue('vue.plan', 'Plan', () => ctx.allerAuPlan());
  vue('vue.terrasse', 'Terrasse', () => ctx.allerAuModeTerrasse());
  vue('vue.3d', 'Vue 3D', () => ctx.goVue3D());
  vue('vue.visionneuse', 'Visionneuse GLB', () => ctx.ouvrirVisionneuse());
}
