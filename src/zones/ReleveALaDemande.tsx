// Z8, l'editeur d'une facade relevee, charge a l'ouverture (AD-10) : l'editeur (zones/Releve.tsx) et ce qu'il atteint ne se
// telechargent que quand il s'ouvre. Cette coquille ne fait que l'attendre.

import { lazy, Suspense, useSyncExternalStore } from 'react';
import type { ServiceReleve } from '../app/releve/releve.js';

const Releve = lazy(() => import('./Releve.js').then((m) => ({ default: m.Releve })));

export function ReleveALaDemande({ releve }: { releve: ServiceReleve }) {
  const ouvert = useSyncExternalStore(releve.abonner, releve.courant, releve.courant);
  if (!ouvert) return null;
  return <Suspense fallback={null}><Releve releve={releve} /></Suspense>;
}
