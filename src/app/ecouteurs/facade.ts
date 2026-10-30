// Les commandes d'une facade relevee (spec-releve-facade §4, MD/spec-facade-calage-audit.md §6, lot F6).
//
// Deux commandes, declenchees depuis la section « Facades et toit » de l'inspecteur : modifier le releve d'un mur (l'editeur,
// zones/Releve.tsx), et le retirer. Le mur vise est designe juste avant par le bouton de sa ligne (interaction/choixFacade.ts). La
// photo d'un mur se prend dans l'audit de la parcelle (`facade.photographier`, app/audit/parcelle/commande.ts) : le releve n'a plus
// de capture.
//
// Un batiment verrouille se modifie quand meme : le verrou fige sa position sur le plan, pas ce qu'on sait de ses murs.

import { PERMISSION_ECRITURE } from '../acces.js';
import { reprendreFacadeDesignee } from '../../interaction/choixFacade.js';
import { vue3d } from '../../three/etat3d.js';
import { terrasseCourante } from '../../core/contexteTerrasse.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ServiceReleve } from '../releve/releve.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan } from '../../model/types.js';
import { estBatiment } from '../../model/fonctions.js';
import { champsBatiment } from '../../model/champsFonction.js';

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
    id: 'facade.modifier',
    libelle: 'Modifier la façade',
    groupe: 'facade',
    permission: PERMISSION_ECRITURE,
    actif: () => !!batiment()?.batiment?.facades?.length,
    executer: () => {
      const o = batiment();
      const cote = reprendreFacadeDesignee();
      if (o && cote !== null) ctx.releve.ouvrir(o.key, cote);
    },
  });

  cmd.declarer({
    id: 'facade.retirer',
    libelle: 'Retirer le relevé',
    groupe: 'facade',
    permission: PERMISSION_ECRITURE,
    actif: () => !!batiment()?.batiment?.facades?.length,
    executer: () => {
      const o = batiment();
      const cote = reprendreFacadeDesignee();
      if (!o || cote === null) return;
      ctx.pushHistory();
      const b = champsBatiment(o);
      b.facades = (b.facades || []).filter((r) => r.cote !== cote);
      if (!b.facades.length) delete b.facades;
      ctx.render();
      if (vue3d.scene) ctx.buildThreeScene(terrasseCourante(ctx.etat) || null);
    },
  });
}
