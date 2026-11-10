// Ce que le vote des passes sait lire sans code propre : les champs « simples » que les descriptions declarent.
//
// Un champ dont le schema est `{ indices, valeur }` (un terme du vocabulaire) ou `{ indices, nombre }` (un
// compte) se vote partout pareil : la valeur donnee par plus de la moitie des passes (model/analyseClaude.ts,
// `voter`). Plutot que d'ecrire un vote par champ, on le tire de la description : un sujet nouveau entre
// ainsi dans le prompt, le schema, la lecture ET le vote en une seule fois. Les champs de forme propre
// (facades, lucarnes, terrasse...) restent lus a la main (`CHAMPS_LUS_A_LA_MAIN`).

import { CHAMPS_LUS_A_LA_MAIN, type ChampSimple } from '../../model/analyseClaude.js';
import type { DescriptionSujet, SchemaJson } from './description.js';

/** Le champ est-il un objet `{ indices, valeur }` ou `{ indices, nombre }` ? Rend sa cle de conclusion, ou null. */
export function cleDeConclusion(schema: SchemaJson): 'valeur' | 'nombre' | null {
  if (schema.type !== 'object') return null;
  const requis = Array.isArray(schema.required) ? [...(schema.required as string[])].sort().join() : '';
  const proprietes = schema.properties as Record<string, SchemaJson> | undefined;
  if (!proprietes || !('indices' in proprietes) || (proprietes.indices as SchemaJson).$ref !== '#/$defs/indices') return null;
  if (requis === 'indices,valeur') return 'valeur';
  if (requis === 'indices,nombre') return 'nombre';
  return null;
}

/** Les champs simples de ces sujets, dans l'ordre du prompt, sans ceux que le vote lit deja a la main. */
export function champsSimples(sujets: readonly DescriptionSujet[]): ChampSimple[] {
  return sujets.flatMap((s) => Object.entries(s.champs).flatMap(([nom, schema]) => {
    const cle = CHAMPS_LUS_A_LA_MAIN.includes(nom) ? null : cleDeConclusion(schema);
    return cle ? [{ nom, cle }] : [];
  }));
}
