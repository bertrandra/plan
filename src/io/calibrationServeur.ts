// Les reglages calibres de la detection du serveur (`admin/calibration`, facade/corpusReel.ts), lus une fois par page, sans
// session : chaque page applique les valeurs que l'admin a calibrees sur ses photos. Sans admin configure (404), sans reseau
// ou sans calibration enregistree, ce sont les valeurs livrees avec Plan qui restent en usage.

import { lireCalibration } from './depotDemos.js';
import { lireDocumentCalibration } from '../facade/corpusReel.js';
import { poserSurchargesCalibrees, surchargesCalibrees } from '../facade/regles/facades/surcharges.js';

let lecture: Promise<Readonly<Record<string, number>>> | null = null;

/**
 * Lit la calibration du serveur et la pose (`poserSurchargesCalibrees`), une seule fois ; rend les valeurs en usage. Ne leve
 * jamais. `force` relit : l'ecran admin le demande apres avoir enregistre.
 */
export function chargerCalibrationServeur(f: (entree: string, init?: RequestInit) => Promise<Response> = (e, i) => fetch(e, i), force = false): Promise<Readonly<Record<string, number>>> {
  if (force) lecture = null;
  lecture ??= (async () => {
    try {
      const doc = lireDocumentCalibration(await lireCalibration(f));
      poserSurchargesCalibrees(doc?.parametres ?? {});
    } catch {
      /* hors ligne : les valeurs restent ce qu'elles etaient */
    }
    return surchargesCalibrees();
  })();
  return lecture;
}
