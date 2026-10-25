// Les reglages nommes de la structure et du classement des ouvertures (MD/spec-facades-calage-detection.md
// §10 et §11, lot L15), sur le modele de `reglagesDetection.ts`.
//
// Une valeur changee ici change ce que propose le releve : elle se justifie par le banc
// (`.claude/skills/facades`), avant et apres, jamais par une seule scene.

import fichierStructure from '../../../../regles/facades/structure.json';
import type { Reglage } from './detection.js';
import { surchargesCalibrees } from './surcharges.js';

// Les valeurs, leur unite et leur raison sont des donnees : regles/facades/structure.json (MD/architecture.md §5.2.4, un reglage n'est
// pas du code). Le fichier est compile dans le fichier livre ; son vocabulaire d'unites est verifie par tests/unit/facade/regles/reglagesFacadesJson.test.ts.
export const REGLAGES_STRUCTURE = fichierStructure.reglages as { readonly [K in keyof typeof fichierStructure.reglages]: Reglage };

export type NomReglageStructure = keyof typeof REGLAGES_STRUCTURE;

export type ValeursStructure = Record<NomReglageStructure, number>;

export function reglagesStructure(surcharges: Partial<ValeursStructure> = {}): ValeursStructure {
  const v = {} as ValeursStructure;
  for (const nom of Object.keys(REGLAGES_STRUCTURE) as NomReglageStructure[]) v[nom] = surcharges[nom] ?? surchargesCalibrees()[nom] ?? REGLAGES_STRUCTURE[nom].valeur;
  return v;
}
