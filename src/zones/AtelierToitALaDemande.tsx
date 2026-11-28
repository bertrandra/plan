// Z10, l'atelier du toit, charge a l'ouverture (AD-10) : l'atelier (zones/AtelierToit.tsx), ses vignettes et le dessin qu'elles lisent ne
// se telechargent qu'a la premiere session. Cette coquille ne fait que l'attendre.

import { lazy, Suspense } from 'react';
import { sessionToit } from '../app/toits/modeToit.js';
import { useCle, CLE_GELEE } from './composants/abonnement.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';

const AtelierToit = lazy(() => import('./AtelierToit.js').then((m) => ({ default: m.AtelierToit })));

export function AtelierToitALaDemande({ magasin, commandes }: { magasin: Magasin; commandes: RegistreCommandes }) {
  // Hors d'une session, rien a montrer : la zone ne suit pas les rendus du plan ; en session, elle les suit tous.
  useCle(magasin, 'atelier du toit', (s) => (sessionToit() ? String(s.version) : CLE_GELEE));
  if (!sessionToit()) return null;
  return <Suspense fallback={null}><AtelierToit magasin={magasin} commandes={commandes} /></Suspense>;
}
