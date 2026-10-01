// Dire la limite de projets, au geste qui la rencontre : « Nouveau projet » (une copie) ou
// « depuis une adresse ». Un dialogue plutot qu'une info-bulle : sur un ecran tactile, un bouton
// grise ne dit rien, et la personne ne sait pas si c'est elle ou le programme.

import { dialogues } from '../shell/dialogues.js';
import { BACKPROD_API_URL } from '../plateforme/config.js';

export function signalerLimiteProjets(message: string): void {
  dialogues.ouvrir({
    type: 'choix',
    titre: 'Limite de projets atteinte',
    texte: message,
    principal: { libelle: 'Ouvrir la plateforme', executer: () => { window.open(BACKPROD_API_URL, '_blank', 'noopener'); } },
    secondaire: { libelle: 'Fermer', executer: () => {} }
  });
}
