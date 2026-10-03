// Monte l'ecran de la palette (`?palette`, zones/EcranPalette.tsx).
//
// Un ecran de l'admin, comme celui des controleurs : main.ts ne l'ouvre qu'une fois la porte de
// l'admin franchie. Il prend toute la page, Plan ne demarre pas dessous. Il lit la palette du
// serveur (`admin/palette`), la fait regler et l'y enregistre ; `?admin&ecran=palette` y mene aussi.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranPalette } from '../zones/EcranPalette.js';
import { lirePalette, enregistrerPalette } from '../io/depotDemos.js';
import { lireDocumentPalette } from '../styles/paletteServeur.js';
import { appliquerPalette } from './paletteServeur.js';
import { showErrBanner } from '../shell/dialogs.js';

/** L'adresse demande-t-elle l'ecran de la palette ? */
export function demandeEcranPalette(recherche: string): boolean {
  const p = new URLSearchParams(recherche);
  return p.has('palette') || p.get('ecran') === 'palette';
}

export async function ouvrirEcranPalette(): Promise<void> {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  let enregistree: ReturnType<typeof lireDocumentPalette> = null;
  try {
    const d = await lirePalette(f);
    enregistree = d === null ? null : lireDocumentPalette(d);
    if (d !== null && !enregistree) showErrBanner('La palette du serveur n’a pas la forme attendue : les couleurs d’origine sont montrées. Un enregistrement la remplacera.');
  } catch (e) {
    showErrBanner('Palette du serveur illisible : ' + ((e as Error).message || e) + '. Les couleurs d’origine sont montrées.');
  }
  let hote = document.getElementById('zoneEcranPalette');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranPalette';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — palette de l’interface';
  createRoot(hote).render(createElement(EcranPalette, {
    enregistree,
    appliquer: appliquerPalette,
    enregistrer: async (document) => {
      try { await enregistrerPalette(f, document); return null; } catch (e) { return (e as Error).message || String(e); }
    }
  }));
}
