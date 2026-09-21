// Les quatre boutons du haut de page (spec §6.4, app/).
//
// Quatre boutons, quatre vues, un seul allumé — la règle et son application vivent dans
// `app/modes.ts`. Ici, il ne reste que le branchement, et c'est précisément ce qu'on voulait : avant
// le démêlage, chacun de ces clics corrigeait à la main l'apparence laissée par le précédent.

import type { RegistreCommandes } from '../commandes.js';

/** Ce que les boutons du haut déclenchent. */
export interface ContexteBoutonsDeVue {
  allerAuPlan: () => void;
  allerAuModeTerrasse: () => void;
  goVue3D: () => void;
  ouvrirVisionneuse: () => void;
}

export function brancherBoutonsDeVue(ctx: ContexteBoutonsDeVue, cmd: RegistreCommandes): void {
  const vue = (idDom: string, id: string, libelle: string, executer: () => void) => cmd.bouton(idDom, { id, libelle, groupe: 'vue', executer });
  vue('modePlanBtn', 'vue.plan', 'Plan', () => ctx.allerAuPlan());
  vue('modeTerrasseBtn', 'vue.terrasse', 'Terrasse', () => ctx.allerAuModeTerrasse());
  vue('mode3dBtn', 'vue.3d', 'Vue 3D', () => ctx.goVue3D());
  vue('glbViewerBtn', 'vue.visionneuse', 'Visionneuse GLB', () => ctx.ouvrirVisionneuse());
}
