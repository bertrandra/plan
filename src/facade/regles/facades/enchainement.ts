// Les objectifs des etapes de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 ter.1) : ce qui dit qu'une etape
// automatique a reussi. Ils ne touchent pas a la chaine (decision 16) : seulement a l'etat que l'orchestrateur donne a chaque etape,
// et a la mesure contre la verite que montre la calibration.

import fichierEnchainement from '../../../../regles/facades/enchainement.json';
import type { Reglage } from './detection.js';
import { fnv1a } from '../../../regles/toits/reglages.js';

// Les valeurs, leur unite et leur raison sont des donnees : regles/facades/enchainement.json (MD/architecture.md §5.2.4). Leur
// vocabulaire d'unites est verifie par tests/unit/facade/regles/reglagesFacadesJson.test.ts.
export const REGLAGES_ENCHAINEMENT = fichierEnchainement.reglages as { readonly [K in keyof typeof fichierEnchainement.reglages]: Reglage };

export type NomObjectif = keyof typeof REGLAGES_ENCHAINEMENT;
export type Objectifs = Record<NomObjectif, number>;

/** Les objectifs en usage ; une surcharge (un essai, un test) passe devant la valeur livree. */
export function objectifsEnchainement(surcharges: Partial<Objectifs> = {}): Objectifs {
  const v = {} as Objectifs;
  for (const nom of Object.keys(REGLAGES_ENCHAINEMENT) as NomObjectif[]) v[nom] = surcharges[nom] ?? REGLAGES_ENCHAINEMENT[nom].valeur;
  return v;
}

/** L'empreinte des objectifs livres (les valeurs, triees par nom), inscrite dans chaque rejeu : un etat d'hier se relit avec ses objectifs. */
export const EMPREINTE_OBJECTIFS: string = fnv1a(Object.entries(REGLAGES_ENCHAINEMENT).map(([n, r]) => n + '=' + String(r.valeur)).sort().join(';'));
