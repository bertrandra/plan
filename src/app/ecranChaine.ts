// Monte l'ecran Admin › Chaine (`?admin&ecran=chaine`, zones/EcranChaine.tsx) : de l'IGN a ma maison, de bout en bout.
//
// Un ecran de l'admin comme les autres : main.ts ne l'ouvre qu'une fois la porte franchie, et Plan ne demarre pas dessous.
// Il ne lit rien du serveur : la chaine est la liste de model/chaine.ts.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranChaine } from '../zones/EcranChaine.js';

/** L'adresse demande-t-elle l'ecran de la chaine ? */
export function demandeEcranChaine(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'chaine';
}

export function ouvrirEcranChaine(): void {
  let hote = document.getElementById('zoneEcranChaine');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranChaine';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — chaîne';
  createRoot(hote).render(createElement(EcranChaine, {}));
}
