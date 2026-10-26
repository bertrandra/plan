// Z8, le releve de facade charge a l'ouverture (AD-10) : le parcours (zones/Releve.tsx) et ce qu'il atteint — l'analyse des
// facades, le calage, la camera — ne se telechargent que quand un releve s'ouvre. Cette coquille ne fait que l'attendre.

import { lazy, Suspense, useSyncExternalStore } from 'react';
import type { ServiceReleve } from '../app/releve.js';

const Releve = lazy(() => import('./Releve.js').then((m) => ({ default: m.Releve })));

export function ReleveALaDemande({ releve }: { releve: ServiceReleve }) {
  const ouvert = useSyncExternalStore(releve.abonner, releve.courant, releve.courant);
  if (!ouvert) return null;
  return <Suspense fallback={null}><Releve releve={releve} /></Suspense>;
}
