// Les fichiers que le serveur lit (deploy/prompt-analyse.md, deploy/schema-analyse.json ; et ceux du run d'une facade,
// deploy/prompt-facade.md et deploy/schema-facade.json), tels que
// les descriptions de sujets les donnent : un seul endroit, appele par le script de generation, par les
// tests et par l'ecran Admin › Regles.

import type { DescriptionSujet } from './description.js';
import { assemblerPrompt, assemblerSchema, avecEntete, textuel } from './assembler.js';
import { DESCRIPTIONS_SUJETS } from './liste.js';
import { NOTE_PROMPT, NOTE_PROMPT_FACADE, NOTE_SCHEMA, NOTE_SCHEMA_FACADE, VERSIONS_PROMPT, VERSIONS_PROMPT_FACADE, VERSIONS_SCHEMA, VERSIONS_SCHEMA_FACADE, versionCourante } from './versions.js';
import { RUN_FACADE } from './descriptions/facadesRun.js';

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

/** Les deux fichiers du run d'une facade (usage `facade` du serveur), sous les versions en vigueur. */
export function genererRunFacade(): FichiersGeneres {
  const versionPrompt = versionCourante(VERSIONS_PROMPT_FACADE).version, versionSchema = versionCourante(VERSIONS_SCHEMA_FACADE).version;
  return {
    corpsPrompt: RUN_FACADE.prompt, versionPrompt, versionSchema,
    prompt: avecEntete(RUN_FACADE.prompt, { version: versionPrompt, note: NOTE_PROMPT_FACADE }),
    schema: textuel({ format: 'plan-schema-facade', version: versionSchema, note: NOTE_SCHEMA_FACADE, schema: RUN_FACADE.schema, exemple: RUN_FACADE.exemple }),
  };
}
