// Rejouer la detection d'un releve avec les seuils qui l'ont produit (MD/roadmap-architecture.md, etape 1.4).
//
// La calibration de l'admin (surcharges.ts) change la prochaine detection, pas les releves deja enregistres. Un releve garde les
// valeurs calibrees en vigueur quand il a ete fait (`ReleveFacade.calibration`) : pour le rejouer, chaque reglage de la detection
// et de la structure prend la valeur gardee, ou la valeur livree si le releve n'en gardait pas, et jamais la calibration du moment.
// Le resultat se passe en `reglages` a la detection (facade/detection/detection.ts), ou une surcharge explicite passe devant.

import { REGLAGES_DETECTION, type ValeursDetection } from './detection.js';
import { REGLAGES_STRUCTURE, type ValeursStructure } from './structure.js';
import type { ReleveFacade } from '../../../model/typesReleve.js';

/**
 * Les reglages a passer a la detection pour rejouer ce releve ; null pour un releve d'avant l'etape 1.4, dont on ne sait pas quels
 * seuils l'ont produit (la detection prend alors ceux du moment).
 */
export function reglagesDuReleve(r: Pick<ReleveFacade, 'calibration'>): (ValeursDetection & ValeursStructure) | null {
  if (!r.calibration) return null;
  const v: Record<string, number> = {};
  for (const [nom, reglage] of Object.entries({ ...REGLAGES_DETECTION, ...REGLAGES_STRUCTURE })) v[nom] = r.calibration[nom] ?? reglage.valeur;
  return v as ValeursDetection & ValeursStructure;
}
