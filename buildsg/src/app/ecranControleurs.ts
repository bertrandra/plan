// Monte l'ecran des controleurs de l'admin (`?admin&ecran=controleurs`, zones/EcranControleurs.tsx).
//
// Plan a demarre dessous, sur la demonstration integree, en memoire et sans depot : rien ne peut
// y etre enregistre. On lit ce qu'il a monte (app/controleurs.ts), on va chercher le registre
// enregistre sur le serveur, et l'ecran compare les deux.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranControleurs } from '../zones/EcranControleurs.js';
import { construireArbre, type RegistreControleurs, type SourceControleurs } from './controleurs.js';
import { lireControleurs, enregistrerControleurs } from '../io/depotDemos.js';
import { showErrBanner } from '../shell/dialogs.js';

/** L'adresse demande-t-elle l'ecran des controleurs ? */
export function demandeEcranControleurs(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'controleurs';
}

function estRegistre(d: unknown): d is RegistreControleurs {
  return !!d && typeof d === 'object' && (d as { format?: unknown }).format === 'plan-controleurs'
    && typeof (d as { arbre?: unknown }).arbre === 'object';
}

export async function ouvrirEcranControleurs(source: SourceControleurs): Promise<void> {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  let enregistre: RegistreControleurs | null = null;
  try {
    const d = await lireControleurs(f);
    if (d !== null && !estRegistre(d)) throw new Error('le registre enregistré n’a pas la forme attendue');
    enregistre = d;
  } catch (e) {
    showErrBanner('Registre des contrôleurs illisible : ' + ((e as Error).message || e) + '. La découverte s’affiche quand même ; l’enregistrer le remplacera.');
  }
  let hote = document.getElementById('zoneControleurs');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneControleurs';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — contrôleurs de l’écran';
  createRoot(hote).render(createElement(EcranControleurs, {
    decouvert: construireArbre(source),
    decouvertLe: new Date().toISOString(),
    appVersion: source.appVersion,
    enregistre,
    enregistrer: async (registre) => {
      try { await enregistrerControleurs(f, registre); return null; } catch (e) { return (e as Error).message || String(e); }
    },
    redecouvrir: () => { location.reload(); }
  }));
}
