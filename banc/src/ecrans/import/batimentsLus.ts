// Le lecteur des batiments de la BD TOPO de l'ecran d'import : un seul pour le tri des photos (useFacades.ts) et la couverture grise
// de la carte (CoucheCouverture.tsx), pour qu'une case ne se lise qu'une fois (casesBatiments.ts).

import { useSyncExternalStore } from 'react';
import { LecteurDeCases } from '../../casesBatiments.js';

async function lireJson(url: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export const BATIMENTS = new LecteurDeCases(lireJson);

/** La version du lecteur : un composant qui la lit se redessine a chaque case lue ou en panne. */
export const useVersionDesBatiments = (): number => useSyncExternalStore(BATIMENTS.abonner, () => BATIMENTS.version);
