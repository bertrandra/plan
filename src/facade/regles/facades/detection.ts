// Les reglages nommes de la detection des ouvertures (MD/spec-facades-calage-detection.md §9, lot L14).
//
// Les seuils de la detection sortent du code avec leur raison, comme ceux des toits
// (MD/spec-regles-toits.md §6) : quand le banc ou les corrections d'un audit montrent qu'un seuil se
// trompe, on sait lequel toucher et pourquoi il valait ce qu'il vaut. Le code lit ces reglages ; il ne
// porte plus de nombre en dur pour ce qui decide d'une ouverture.
//
// Une valeur changee ici change ce que propose le releve : elle se justifie par le banc
// (`.claude/skills/facades`), avant et apres, jamais par une seule scene.

import fichierDetection from '../../../../regles/facades/detection.json';
import { surchargesCalibrees } from './surcharges.js';

export interface Reglage {
  valeur: number;
  unite: 'm' | 'm2' | 'niveaux' | 'rapport' | 'part' | 'nombre';
  pourquoi: string;
}

// Les valeurs, leur unite et leur raison sont des donnees : regles/facades/detection.json (MD/architecture.md §5.2.4, un reglage n'est
// pas du code). Le fichier est compile dans le fichier livre ; son vocabulaire d'unites est verifie par tests/unit/facade/regles/reglagesFacadesJson.test.ts.
export const REGLAGES_DETECTION = fichierDetection.reglages as { readonly [K in keyof typeof fichierDetection.reglages]: Reglage };

export type NomReglageDetection = keyof typeof REGLAGES_DETECTION;

/** Les valeurs des reglages, eventuellement surchargees (banc, profil de facade a venir). */
export type ValeursDetection = Record<NomReglageDetection, number>;

export function reglagesDetection(surcharges: Partial<ValeursDetection> = {}): ValeursDetection {
  const v = {} as ValeursDetection;
  for (const nom of Object.keys(REGLAGES_DETECTION) as NomReglageDetection[]) v[nom] = surcharges[nom] ?? surchargesCalibrees()[nom] ?? REGLAGES_DETECTION[nom].valeur;
  return v;
}
