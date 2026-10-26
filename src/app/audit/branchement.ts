// Le mode audit dans l'atelier (MD/spec-audit.md) : ce que app/boot.ts appelle quand l'adresse porte
// `?mode=audit` et que la personne est administrateur (main.ts).
//
// Le controleur (app/audit/controleur.ts) ne connait ni l'historique ni les vues : il recoit ici de
// quoi remplacer les objets du plan, rebatir ou repeindre la Vue 3D, et ses deux commandes sont
// declarees au registre comme les autres (la barre de la Vue 3D les lit, zones/vue3d/Vue3d.tsx).

import { abonnerSceneBatie, hotes3d, vue3d } from '../../three/etat3d.js';
import { creerControleurAudit, type ControleurAudit } from './controleur.js';
import { brancherDoigtAudit } from './doigt.js';
import { poserControleurAudit } from './courant.js';
import type { DemandeAudit } from './demande.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetBrut } from '../../model/types.js';
import type { RegistreCommandes } from '../commandes.js';

export interface AtelierAudit {
  etat: EtatApp;
  commandes: RegistreCommandes;
  restaurer: (instantane: { objects: ObjetBrut[]; measures: [] }) => void;
  rebuildSelector: () => void;
  buildThreeScene: () => void;
  /** Faux quand la scene ouverte n'est plus celle qui a ete batie : il faut la rebatir. */
  remplacerObjets3d: (cles: readonly string[]) => boolean;
  notifier: () => void;
  signaler: (message: string) => void;
}

// Le controleur courant se lit dans courant.ts (la Vue 3D le demande sans charger l'audit).
export { controleurAudit } from './courant.js';

export function brancherAudit(a: AtelierAudit, demande: DemandeAudit): ControleurAudit {
  const { etat, commandes } = a;
  const c = creerControleurAudit({
    etat,
    remplacerObjets: (objets) => {
      a.restaurer({ objects: objets, measures: [] });
      // Rien n'est selectionne : l'inspecteur ne s'ouvre pas sur un batiment pendant la marche.
      etat.selectedKey = null;
      a.rebuildSelector();
    },
    reconstruire3d: () => { if (vue3d.scene) a.buildThreeScene(); },
    repeindre3d: (cles) => { if (vue3d.scene && !a.remplacerObjets3d(cles)) a.buildThreeScene(); },
    ouvrir3d: () => { commandes.executer('vue.3d'); },
    notifier: a.notifier,
    signaler: a.signaler,
  }, demande);
  poserControleurAudit(c);

  commandes.declarer({
    id: 'audit.suivre', libelle: 'Me suivre', groupe: 'audit',
    actif: () => !!vue3d.scene,
    executer: () => c.reprendreSuivi(),
  });
  commandes.declarer({
    id: 'audit.cas', libelle: 'Cas notés', groupe: 'audit',
    executer: () => c.ouvrirListe(),
  });

  // L'hote de la scene est monte par la zone ; le doigt s'y pose une fois, la scene peut changer dessous.
  let hote: HTMLElement | null = null;
  const brancherHote = () => {
    if (hote || !hotes3d.vue3d) return;
    hote = hotes3d.vue3d;
    brancherDoigtAudit(c, hote);
  };
  brancherHote();
  // Une scene batie (la premiere, ou apres une lecture autour de vous) : la camera reprend le suivi.
  abonnerSceneBatie(() => { brancherHote(); c.sceneBatie(); });
  // L'ecran qui se verrouille, l'onglet mis en arriere-plan ou ferme : le brouillon s'ecrit sans
  // attendre son delai, le systeme peut tuer l'onglet juste apres (spec §10).
  const ecrire = () => { void c.ecrireBrouillon(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ecrire(); });
  window.addEventListener('pagehide', ecrire);
  return c;
}
