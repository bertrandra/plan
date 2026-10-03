// Monte l'ecran de la palette de l'admin (`?admin&ecran=palette`, zones/EcranPalette.tsx).
//
// Comme l'ecran des controleurs, il s'ouvre derriere la porte de l'admin et prend toute la page.
// Plan ne demarre pas : l'ecran ne lit que les jetons (styles/jetons.ts), sans serveur ni projet.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranPalette } from '../zones/EcranPalette.js';

/** L'adresse demande-t-elle l'ecran de la palette ? */
export function demandeEcranPalette(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'palette';
}

export function ouvrirEcranPalette(): void {
  let hote = document.getElementById('zoneEcranPalette');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranPalette';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — palette de l’interface';
  createRoot(hote).render(createElement(EcranPalette));
}
