// Dire la limite de projets, au geste qui la rencontre : « Nouveau projet » (une copie) ou
// « depuis une adresse ». Un dialogue plutot qu'une info-bulle : sur un ecran tactile, un bouton
// grise ne dit rien, et la personne ne sait pas si c'est elle ou le programme.

import { dialogues } from '../shell/dialogues.js';
//
// Le geste propose est « Voir les offres » (lot 2 de la simplification, 16 novembre 2026) : la vitrine de la plateforme, qui montre les
// offres du produit (`<BACKPROD_API_URL>/?product=plan`, comme la demonstration sans compte), et non sa racine, ou la personne devait
// chercher seule ou changer d'offre.

import { vitrinePlateforme } from '../plateforme/config.js';

export function signalerLimiteProjets(message: string): void {
  dialogues.ouvrir({
    type: 'choix',
    titre: 'Limite de projets atteinte',
    texte: message,
    principal: { libelle: 'Voir les offres', executer: () => { window.open(vitrinePlateforme(), '_blank', 'noopener'); } },
    secondaire: { libelle: 'Fermer', executer: () => {} }
  });
}
