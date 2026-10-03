// Monte l'ecran de la palette (`?palette`, zones/EcranPalette.tsx).
//
// Il prend toute la page, comme l'ecran des controleurs, mais sans porte : il ne montre que les
// jetons de l'interface (styles/jetons.ts), rien du projet ni de la plateforme. Plan ne demarre pas.
// L'ancienne adresse `?admin&ecran=palette` y mene aussi.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranPalette } from '../zones/EcranPalette.js';

/** L'adresse demande-t-elle l'ecran de la palette ? */
export function demandeEcranPalette(recherche: string): boolean {
  const p = new URLSearchParams(recherche);
  return p.has('palette') || p.get('ecran') === 'palette';
}

export function ouvrirEcranPalette(): void {
  let hote = document.getElementById('zoneEcranPalette');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranPalette';
    document.body.appendChild(hote);
  }
  document.title = 'Plan — palette de l’interface';
  createRoot(hote).render(createElement(EcranPalette));
}
