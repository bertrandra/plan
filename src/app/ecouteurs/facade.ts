// Les commandes du releve de facade (spec-releve-facade §4, app/).
//
// Deux commandes, declenchees depuis la section « Facades et toit » de l'inspecteur : relever un
// mur (le dialogue de prise de vue), et retirer le releve d'un mur. Le mur vise est designe juste
// avant par le bouton de sa ligne (facade/choix.ts) ; sans designation, le dialogue commence par le
// faire choisir sur le contour du batiment.
//
// Un batiment verrouille se releve quand meme : le verrou fige sa position sur le plan, pas ce
// qu'on sait de ses murs.

import { PERMISSION_ECRITURE } from '../acces.js';
import { reprendreFacadeDesignee } from '../../facade/choix.js';
import { vue3d } from '../../three/etat3d.js';
import { terrasseCourante } from '../../core/contexteTerrasse.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ServiceReleve } from '../releve.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan } from '../../model/types.js';
import { estBatiment } from '../../model/fonctions.js';

export interface ContexteCommandesFacade {
  etat: EtatApp;
  releve: ServiceReleve;
  pushHistory: () => void;
  render: () => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
}

export function brancherFacade(ctx: ContexteCommandesFacade, cmd: RegistreCommandes): void {
  const batiment = () => {
    const o = ctx.etat.objects.find((x) => x.key === ctx.etat.selectedKey);
    return o && estBatiment(o) ? o : null;
  };

  cmd.declarer({
    id: 'facade.relever',
    libelle: 'Relever une façade',
    description: "Photographier un mur du bâtiment : Plan le redresse, en retrouve les ouvertures, leurs dimensions et la forme du toit.",
    groupe: 'facade',
    permission: PERMISSION_ECRITURE,
    actif: () => !!batiment(),
    executer: () => {
      const o = batiment();
      if (o) ctx.releve.ouvrir(o.key, reprendreFacadeDesignee());
    },
  });

  cmd.declarer({
    id: 'facade.retirer',
    libelle: 'Retirer le relevé',
    groupe: 'facade',
    permission: PERMISSION_ECRITURE,
    actif: () => !!batiment()?.facades?.length,
    executer: () => {
      const o = batiment();
      const cote = reprendreFacadeDesignee();
      if (!o || cote === null) return;
      ctx.pushHistory();
      o.facades = (o.facades || []).filter((r) => r.cote !== cote);
      if (!o.facades.length) delete o.facades;
      ctx.render();
      if (vue3d.scene) ctx.buildThreeScene(terrasseCourante(ctx.etat) || null);
    },
  });
}
