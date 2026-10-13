// Monte l'ecran de la consommation de Claude (`?admin&ecran=consommation`, zones/EcranConsommation.tsx).
//
// Un ecran de l'admin, comme la palette et les controleurs : main.ts ne l'ouvre qu'une fois la porte
// de l'admin franchie (les routes `admin/consommation` et `admin/claude/…` exigent sa session). Il
// prend toute la page ; Plan ne demarre pas dessous. Les chiffres viennent du journal du serveur,
// jamais d'un compte tenu par le navigateur (MD/spec-audit.md 13.3).

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranConsommation } from '../zones/EcranConsommation.js';
import { enregistrerPlafondsClaude, enregistrerTarifsClaude, lireConsommation, lirePlafondsClaude, lireTarifsClaude, type FiltresConsommation } from '../io/depotDemos.js';
import { telechargerTexte } from '../shell/download.js';
import type { Plafonds, Tarifs } from '../model/tarifsClaude.js';

/** L'adresse demande-t-elle l'ecran de la consommation ? */
export function demandeEcranConsommation(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'consommation';
}

export function ouvrirEcranConsommation(): void {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  let hote = document.getElementById('zoneEcranConsommation');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranConsommation';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — consommation de Claude';
  // Des fonctions stables : l'ecran relit le journal quand un filtre change, pas a chaque rendu.
  createRoot(hote).render(createElement(EcranConsommation, {
    aujourdhui: new Date().toISOString().slice(0, 10),
    charger: (filtres: FiltresConsommation) => lireConsommation(f, filtres),
    lireTarifs: () => lireTarifsClaude(f),
    enregistrerTarifs: (t: Tarifs) => enregistrerTarifsClaude(f, t),
    lirePlafonds: () => lirePlafondsClaude(f),
    enregistrerPlafonds: (p: Plafonds) => enregistrerPlafondsClaude(f, p),
    telecharger: (nom: string, texte: string) => telechargerTexte(nom, texte, 'text/csv;charset=utf-8')
  }));
}
