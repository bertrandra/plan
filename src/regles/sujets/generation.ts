// Les deux fichiers que le serveur lit (deploy/prompt-analyse.md, deploy/schema-analyse.json), tels que
// les descriptions de sujets les donnent : un seul endroit, appele par le script de generation, par les
// tests et par l'ecran Admin › Regles.

import type { DescriptionSujet } from './description.js';
import { assemblerPrompt, assemblerSchema, avecEntete, textuel } from './assembler.js';
import { DESCRIPTIONS_SUJETS } from './liste.js';
import { NOTE_PROMPT, NOTE_SCHEMA, VERSIONS_PROMPT, VERSIONS_SCHEMA, versionCourante } from './versions.js';

export interface FichiersGeneres { prompt: string; schema: string; corpsPrompt: string; versionPrompt: number; versionSchema: number }

/** Les fichiers de ces descriptions, sous les versions en vigueur (ou celles que l'on donne : un essai de l'ecran). */
export function genererFichiers(sujets: readonly DescriptionSujet[] = DESCRIPTIONS_SUJETS, versions: { prompt?: number; schema?: number } = {}): FichiersGeneres {
  const versionPrompt = versions.prompt ?? versionCourante(VERSIONS_PROMPT).version;
  const versionSchema = versions.schema ?? versionCourante(VERSIONS_SCHEMA).version;
  const corpsPrompt = assemblerPrompt(sujets);
  return {
    corpsPrompt, versionPrompt, versionSchema,
    prompt: avecEntete(corpsPrompt, { version: versionPrompt, note: NOTE_PROMPT }),
    schema: textuel(assemblerSchema(sujets, { version: versionSchema, note: NOTE_SCHEMA })),
  };
}
