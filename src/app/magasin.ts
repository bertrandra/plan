// Le magasin : l'etat observable que les zones de la nouvelle interface liront (spec-ihm-zones §5.1).
//
// `EtatApp` est mute en place par tout le programme — `etat.selectedKey = …`, puis `render()`. Le
// remplacer d'un coup par un etat immuable reviendrait a reecrire chaque geste, et c'est exactement
// ce que la migration a refuse de faire. Le magasin est donc un **pont** : il tient une reference a
// l'etat tel qu'il est, et un compteur de version que `render()` incremente. Un composant React qui
// s'abonne au compteur se redessine a chaque rendu du plan et lit l'etat directement — il voit ce
// que le plan voit, au meme moment.
//
// Etape 0 : le pont existe, personne ne s'y abonne encore. Les champs migreront vers un etat
// immuable zone par zone, quand une zone en aura besoin, pas avant.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EtatApp } from '../core/state.js';

export interface EtatMagasin {
  /** La reference vivante : la meme que celle que `boot()` mute. */
  etat: EtatApp;
  /** Incremente a chaque `render()` : c'est le signal d'abonnement, pas une donnee. */
  version: number;
}

export interface Magasin {
  store: StoreApi<EtatMagasin>;
  /** A appeler apres chaque rendu du plan. */
  notifier(): void;
  /** Version courante, pour les tests et le journal. */
  version(): number;
}

export function creerMagasin(etat: EtatApp): Magasin {
  const store = createStore<EtatMagasin>(() => ({ etat, version: 0 }));
  return {
    store,
    notifier: () => store.setState((s) => ({ version: s.version + 1 })),
    version: () => store.getState().version
  };
}
