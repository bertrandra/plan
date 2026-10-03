// Ce que l'explorateur (zones/Explorateur.tsx) demande au plan (spec-ihm-zones §4.3, app/).
//
// L'explorateur liste, l'atelier agit : selectionner, masquer, choisir les etiquettes d'un objet,
// afficher les couches de la terrasse courante, retenir une terrasse pour le dossier. Chaque
// methode mute l'etat puis redessine — c'est le contrat de tout le programme — et la zone se
// redessine a son tour en lisant le magasin. Rien ici ne touche au DOM.
//
// Masquer un objet et choisir ses etiquettes sont des preferences d'affichage (decision produit,
// comme le filaire de la Vue 3D) : ni annulation, ni « projet modifie », permis en lecture seule.
// Les cases restent rangees dans l'objet pour etre retrouvees a la reouverture, rien de plus.

import { terrasseLayerVisible } from '../render/terrasseCouches.js';
import { dossierSelection } from './dossier.js';
import type { EtatApp } from '../core/state.js';
import type { Magasin } from './magasin.js';

/** Les cases d'un objet : masque, et les cinq etiquettes du plan. */
export type ChampVisibilite = 'hidden' | 'showName' | 'showSegNames' | 'showVertNames' | 'showDims' | 'showAngles';

/** Ce que l'explorateur doit pouvoir declencher ailleurs. */
export interface ContexteExplorateur {
  render: () => void;
  /** Le plan reprend ou rend la largeur de l'explorateur. */
  redimensionner: () => void;
}

export interface Explorateur {
  selectionner(cle: string | null): void;
  definirVisibilite(cle: string, champ: ChampVisibilite, valeur: boolean): void;
  definirVisibiliteTous(champ: ChampVisibilite, valeur: boolean): void;
  /** Montre ou cache les couches de la terrasse courante sur le plan. */
  basculerCalques(): void;
  basculerCalque(couche: string): void;
  basculerDossier(cle: string): void;
  basculerOuverture(): void;
}

export function creerExplorateur(etat: EtatApp, ctx: ContexteExplorateur, magasin: Magasin): Explorateur {
  const objet = (cle: string) => etat.objects.find(o => o.key === cle);
  return {
    selectionner(cle) {
      etat.selectedKey = cle;
      etat.highlight = { type: null, index: null };
      ctx.render();
    },
    definirVisibilite(cle, champ, valeur) {
      const o = objet(cle);
      if (!o) return;
      o[champ] = valeur;
      ctx.render();
    },
    definirVisibiliteTous(champ, valeur) {
      etat.objects.forEach(o => { o[champ] = valeur; });
      ctx.render();
    },
    basculerCalques() {
      etat.calquesVisibles = !etat.calquesVisibles;
      ctx.render();
    },
    basculerCalque(couche) {
      terrasseLayerVisible[couche] = !terrasseLayerVisible[couche];
      ctx.render();
    },
    basculerDossier(cle) {
      if (dossierSelection.has(cle)) dossierSelection.delete(cle); else dossierSelection.add(cle);
      magasin.notifier();
    },
    basculerOuverture() {
      const ouvert = !magasin.store.getState().explorateurOuvert;
      magasin.definirExplorateurOuvert(ouvert);
      // Le conteneur de la zone (index.html) porte le repli : c'est lui qui a une largeur dans la
      // rangee de l'atelier. Le composant, lui, ne fait que lire l'etat.
      document.getElementById('zoneExplorateur')?.classList.toggle('replie', !ouvert);
      ctx.redimensionner();
    }
  };
}
