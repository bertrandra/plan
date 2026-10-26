// Monte l'ecran Admin › Principes (`?admin&ecran=principes`, zones/EcranPrincipes.tsx) : les principes de Plan, leur processus, leurs
// actions et ce qui se passe derriere. Un ecran de l'admin comme les autres : main.ts ne l'ouvre qu'une fois la porte franchie.
// Il ne lit rien du serveur : la liste est celle de model/principes.ts.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranPrincipes } from '../../zones/EcranPrincipes.js';
import { hoteDeZone } from '../../shell/dom.js';

/** L'adresse demande-t-elle l'ecran des principes ? */
export function demandeEcranPrincipes(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'principes';
}

export function ouvrirEcranPrincipes(): void {
  const hote = hoteDeZone('zoneEcranPrincipes');
  document.title = 'Admin — principes';
  createRoot(hote).render(createElement(EcranPrincipes, {}));
}
