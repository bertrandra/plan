// Demander par quoi commencer, quand il n'y a aucun plan a ouvrir.
//
// Meme forme que la porte (app/porte.ts), et pour la meme raison : cet ecran s'affiche **avant**
// que l'atelier ne soit monte, donc il ne peut pas passer par les dialogues de `shell/` — personne
// ne les ecoute encore. Il monte sa propre racine React, rend un choix, et se retire.
//
// Il est appele depuis `io/api.ts`, par injection plutot que par import : `io/` est une couche plus
// basse que `zones/`, et aller y chercher un ecran serait la remontee que le test d'architecture
// refuse. C'est exactement le montage de `definirDepot`.

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { PremierPas, type Choix, type Empechement } from '../zones/PremierPas.js';
import { BACKPROD_API_URL } from '../plateforme/config.js';
import { peutEcrire, droitsCourants } from './acces.js';

/** Le quota que consomme un plan, tel que la plateforme le nomme. */
const QUOTA_PLANS = 'plan.documents';

/**
 * Ce qui empeche de creer, s'il y a lieu.
 *
 * Les deux cas sont des impasses vraies : la personne a beau repondre, rien ne se creera. Les
 * detecter ici plutot que de laisser l'echec arriver evite de montrer deux boutons qui ne
 * marchent pas — et surtout de laisser croire que c'est le geste qui a rate.
 */
export function empechementCourant(): Empechement | null {
  if (!peutEcrire()) return { raison: 'lecture' };
  return droitsCourants().reste(QUOTA_PLANS) === 0 ? { raison: 'quota' } : null;
}

/** L'element qui porte l'ecran. Cree a la demande : la plupart des sessions n'en ont pas besoin. */
function conteneur(): HTMLElement {
  let e = document.getElementById('zonePremierPas');
  if (!e) {
    e = document.createElement('div');
    e.id = 'zonePremierPas';
    document.body.appendChild(e);
  }
  return e;
}

/**
 * Pose la question, et ne rend la main qu'une fois repondue.
 *
 * **Une impasse ne resout jamais.** Quand rien ne peut etre cree, l'ecran reste : il n'y a pas de
 * plan a montrer derriere, et rendre la main afficherait un atelier vide au lieu de la raison.
 *
 * @param projetsEtrangers vrai quand l'organisation a des projets, mais qu'aucun n'est un plan.
 */
export function demanderPremierPas(projetsEtrangers: boolean): Promise<Choix> {
  return new Promise<Choix>((resoudre) => {
    const racine: Root = createRoot(conteneur());
    const fermer = () => {
      racine.unmount();
      document.getElementById('zonePremierPas')?.remove();
    };
    racine.render(createElement(PremierPas, {
      empechement: empechementCourant(),
      plateforme: BACKPROD_API_URL,
      aDesProjetsEtrangers: projetsEtrangers,
      choisir: (c: Choix) => { fermer(); resoudre(c); }
    }));
  });
}
