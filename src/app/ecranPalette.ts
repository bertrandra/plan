// Monte l'ecran de la palette (`?palette`, zones/EcranPalette.tsx).
//
// Un ecran de l'admin, comme celui des controleurs : main.ts ne l'ouvre qu'une fois la porte de
// l'admin franchie. Il prend toute la page et ne lit que les jetons de l'interface
// (styles/jetons.ts) : Plan ne demarre pas dessous. `?admin&ecran=palette` y mene aussi.

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
  document.title = 'Admin — palette de l’interface';
  createRoot(hote).render(createElement(EcranPalette));
}
