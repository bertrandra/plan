// Les trois departs d'une terrasse (audit de l'inspecteur, decision B5), en commandes du registre (app/).
//
// Les valeurs et leur ecriture sont dans ui/champs/prereglages.ts : un depart ecrit par les descripteurs de l'inspecteur ce que la
// personne aurait saisi champ par champ. Ici, ce qui fait d'un geste une commande : il porte la permission d'ecrire (grise en lecture
// seule, comme les autres gestes du plan), un seul instantane d'annulation pour toutes ses valeurs, le projet marque modifie, et la
// terrasse recalculee une fois.

import { PERMISSION_ECRITURE } from './acces.js';
import { estTerrasse } from '../model/fonctions.js';
import { sectionsConstruction } from '../ui/champs/construction.js';
import { appliquerPrereglage, prereglageEnPlace, PREREGLAGES_TERRASSE } from '../ui/champs/prereglages.js';
import type { RegistreCommandes } from './commandes.js';
import type { EtatApp } from '../core/state.js';
import type { ContexteChamps } from '../ui/champs/types.js';
import type { ObjetPlan } from '../model/types.js';

/** Ce qu'un depart demande au reste du programme : le contexte des champs, l'annulation, le marquage et le rendu. */
export interface DependancesPrereglages {
  contexte: (obj: ObjetPlan) => ContexteChamps;
  /** L'instantane d'avant ; la fonction rendue l'empile (core/historique.ts `preparer`). */
  preparerHistorique: (...objets: object[]) => () => void;
  markDirty: (...objets: object[]) => void;
  /** Ce qui suit l'ecriture d'un reglage de terrasse : ses panneaux, le plan, et la 3D si elle est ouverte. */
  apres: (obj: ObjetPlan) => void;
  toast: (message: string) => void;
}

export function brancherPrereglages(cmd: RegistreCommandes, etat: EtatApp, d: DependancesPrereglages): void {
  const terrasse = (): ObjetPlan | undefined => {
    const o = etat.objects.find((x) => x.key === etat.selectedKey);
    return o && estTerrasse(o) ? o : undefined;
  };
  // Une declaration par depart, son identifiant ecrit en entier : la carte d'exposition (app/exposition.ts) le lit dans le code.
  const commande = (id: string, libelle: string) => {
    const p = PREREGLAGES_TERRASSE.find((x) => x.commande === id);
    if (!p) throw new Error('Départ de terrasse inconnu : ' + id);
    cmd.declarer({
      id, libelle, groupe: 'terrasse', permission: PERMISSION_ECRITURE,
      actif: () => !!terrasse() && !etat.lectureSeule,
      executer: () => {
        const obj = terrasse();
        if (!obj || etat.lectureSeule) return;
        const c = d.contexte(obj);
        const champs = () => sectionsConstruction(c).flatMap((s) => s.champs);
        // Deja en place : rien a ecrire, et aucun pas d'annulation qui ne defairait rien.
        if (prereglageEnPlace(c, champs()) === p) { d.toast('« ' + p.libelle + ' » est déjà en place.'); return; }
        const empiler = d.preparerHistorique(obj);
        if (!appliquerPrereglage(c, p, champs)) return;
        empiler();
        d.markDirty(obj);
        d.apres(obj);
        d.toast('« ' + p.libelle + ' » posé : lame et structure réglées. Tout reste modifiable, et Ctrl+Z revient en arrière.');
      }
    });
  };
  commande('terrasse.prereglage.pinVis', 'Départ : pin sur vis');
  commande('terrasse.prereglage.pinPlots', 'Départ : pin sur plots');
  commande('terrasse.prereglage.exotiquePlots', 'Départ : exotique sur plots');
}
