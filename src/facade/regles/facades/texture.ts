// Les reglages nommes de la texture des facades en 3D sans ses ombres (facade/sansOmbres.ts).
//
// Ils ne touchent que l'affichage : ni la detection, ni les cotes, ni la photo enregistree, ni l'export. Une valeur changee ici
// se justifie par le banc (`.claude/skills/facades`, section « Façades sans ombres »), avant et apres.

import fichierTexture from '../../../../regles/facades/texture.json';
import type { Reglage } from './detection.js';

// Les valeurs, leur unite et leur raison sont des donnees : regles/facades/texture.json (MD/architecture.md §5.2.4, un reglage n'est
// pas du code). Le fichier est compile dans le fichier livre ; son vocabulaire d'unites est verifie par tests/unit/facade/regles/reglagesFacadesJson.test.ts.
export const REGLAGES_TEXTURE = fichierTexture.reglages as { readonly [K in keyof typeof fichierTexture.reglages]: Reglage };

export type NomReglageTexture = keyof typeof REGLAGES_TEXTURE;
export type ValeursTexture = Record<NomReglageTexture, number>;

export function reglagesTexture(surcharges: Partial<ValeursTexture> = {}): ValeursTexture {
  const v = {} as ValeursTexture;
  for (const nom of Object.keys(REGLAGES_TEXTURE) as NomReglageTexture[]) v[nom] = surcharges[nom] ?? REGLAGES_TEXTURE[nom].valeur;
  return v;
}
