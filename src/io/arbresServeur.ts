// La bibliotheque d'essences d'arbres du serveur (`admin/arbres`, model/especesArbre.ts), lue une fois
// par page, sans session : la 3D en a besoin pour dessiner les arbres, et l'inspecteur pour les
// proposer. Sans admin configure (404), sans reseau ou sans essence enregistree, c'est la bibliotheque
// livree avec Plan (model/especesParDefaut.ts) qui reste en usage.

import { lireArbres } from './depotDemos.js';
import { lireDocumentArbres, poserEspeces, especesChargees, bibliothequeEnUsage, type EspeceArbre } from '../model/especesArbre.js';

let lecture: Promise<readonly EspeceArbre[]> | null = null;

/**
 * Lit la bibliotheque du serveur et la pose (`poserEspeces`), une seule fois ; rend ses essences. Ne
 * leve jamais. `force` relit : l'ecran admin le demande apres avoir enregistre.
 */
export function chargerEspecesServeur(f: (entree: string, init?: RequestInit) => Promise<Response> = (e, i) => fetch(e, i), force = false): Promise<readonly EspeceArbre[]> {
  if (force) lecture = null;
  lecture ??= (async () => {
    try {
      const lue = lireDocumentArbres(await lireArbres(f));
      poserEspeces(bibliothequeEnUsage(lue?.especes ?? []));
    } catch {
      /* hors ligne : la bibliotheque reste ce qu'elle etait */
    }
    return especesChargees();
  })();
  return lecture;
}
