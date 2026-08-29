// Les quatre boutons du haut de page (spec §6.4, app/).
//
// Quatre boutons, quatre vues, un seul allumé — la règle et son application vivent dans
// `app/modes.ts`. Ici, il ne reste que le branchement, et c'est précisément ce qu'on voulait : avant
// le démêlage, chacun de ces clics corrigeait à la main l'apparence laissée par le précédent.

/** Ce que les boutons du haut déclenchent. */
export interface ContexteBoutonsDeVue {
  allerAuPlan: () => void;
  allerAuModeTerrasse: () => void;
  goVue3D: () => void;
  ouvrirVisionneuse: () => void;
}

export function brancherBoutonsDeVue(ctx: ContexteBoutonsDeVue): void {
  const surClic = (id: string, action: () => void) => document.getElementById(id).addEventListener('click', action);
  surClic('modePlanBtn', () => ctx.allerAuPlan());
  surClic('modeTerrasseBtn', () => ctx.allerAuModeTerrasse());
  surClic('mode3dBtn', () => ctx.goVue3D());
  surClic('glbViewerBtn', () => ctx.ouvrirVisionneuse());
}
