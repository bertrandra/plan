// Les fichiers que le serveur lit (deploy/prompt-analyse.md, deploy/schema-analyse.json ; ceux du run d'une facade,
// deploy/prompt-facade.md et deploy/schema-facade.json ; ceux de la lecture du PLU, deploy/prompt-plu.md et deploy/schema-plu.json ;
// ceux de la lecture enrichie d'une facade, deploy/prompt-facade-enrichie.md et deploy/schema-facade-enrichie.json ; ceux du toit lu
// sur une facade, deploy/prompt-facade-toit.md et deploy/schema-facade-toit.json ; ceux de la lecture du jardin, deploy/prompt-jardin.md et deploy/schema-jardin.json ; ceux de la redaction d'un texte du dossier,
// deploy/prompt-texte.md et deploy/schema-texte.json), tels que
// les descriptions de sujets les donnent : un seul endroit, appele par le script de generation, par les
// tests et par l'ecran Admin › Regles.

import type { DescriptionSujet } from './description.js';
import { assemblerPrompt, assemblerSchema, avecEntete, textuel } from './assembler.js';
import { DESCRIPTIONS_SUJETS } from './liste.js';
import { NOTE_PROMPT, NOTE_PROMPT_FACADE, NOTE_PROMPT_FACADE_ENRICHIE, NOTE_SCHEMA_FACADE_ENRICHIE, VERSIONS_PROMPT_FACADE_ENRICHIE, VERSIONS_SCHEMA_FACADE_ENRICHIE, NOTE_PROMPT_FACADE_TOIT, NOTE_SCHEMA_FACADE_TOIT, VERSIONS_PROMPT_FACADE_TOIT, VERSIONS_SCHEMA_FACADE_TOIT, NOTE_PROMPT_JARDIN, NOTE_SCHEMA, NOTE_SCHEMA_FACADE, NOTE_SCHEMA_JARDIN, VERSIONS_PROMPT, VERSIONS_PROMPT_FACADE, VERSIONS_PROMPT_JARDIN, VERSIONS_SCHEMA, VERSIONS_SCHEMA_FACADE, VERSIONS_SCHEMA_JARDIN, versionCourante } from './versions.js';
import { RUN_FACADE } from './descriptions/facadesRun.js';
import { LECTURE_FACADE_ENRICHIE } from './descriptions/facadesEnrichie.js';
import { LECTURE_FACADE_TOIT } from './descriptions/facadesToit.js';
import { RUN_JARDIN } from './descriptions/jardinRun.js';
import { CONSIGNE_EXEMPLE_PLU, LECTURE_PLU } from '../plu/lecture.js';
import { NOTE_PROMPT_PLU, NOTE_SCHEMA_PLU, VERSIONS_PROMPT_PLU, VERSIONS_SCHEMA_PLU } from '../plu/versions.js';
import { CONSIGNE_EXEMPLE_TEXTE, REDACTION_TEXTE } from '../textes/redaction.js';
import { NOTE_PROMPT_TEXTE, NOTE_SCHEMA_TEXTE, VERSIONS_PROMPT_TEXTE, VERSIONS_SCHEMA_TEXTE } from '../textes/versions.js';

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

/** Les deux fichiers de la lecture enrichie d'une facade (usage `facade-enrichie` du serveur, lot L1), sous les versions en vigueur. */
export function genererFacadeEnrichie(): FichiersGeneres {
  const versionPrompt = versionCourante(VERSIONS_PROMPT_FACADE_ENRICHIE).version, versionSchema = versionCourante(VERSIONS_SCHEMA_FACADE_ENRICHIE).version;
  return {
    corpsPrompt: LECTURE_FACADE_ENRICHIE.prompt, versionPrompt, versionSchema,
    prompt: avecEntete(LECTURE_FACADE_ENRICHIE.prompt, { version: versionPrompt, note: NOTE_PROMPT_FACADE_ENRICHIE }),
    schema: textuel({ format: 'plan-schema-facade-enrichie', version: versionSchema, note: NOTE_SCHEMA_FACADE_ENRICHIE, schema: LECTURE_FACADE_ENRICHIE.schema, exemple: LECTURE_FACADE_ENRICHIE.exemple }),
  };
}

/** Les deux fichiers du toit lu sur une facade (usage `facade-toit` du serveur, lot L2), sous les versions en vigueur. */
export function genererFacadeToit(): FichiersGeneres {
  const versionPrompt = versionCourante(VERSIONS_PROMPT_FACADE_TOIT).version, versionSchema = versionCourante(VERSIONS_SCHEMA_FACADE_TOIT).version;
  return {
    corpsPrompt: LECTURE_FACADE_TOIT.prompt, versionPrompt, versionSchema,
    prompt: avecEntete(LECTURE_FACADE_TOIT.prompt, { version: versionPrompt, note: NOTE_PROMPT_FACADE_TOIT }),
    schema: textuel({ format: 'plan-schema-facade-toit', version: versionSchema, note: NOTE_SCHEMA_FACADE_TOIT, schema: LECTURE_FACADE_TOIT.schema, exemple: LECTURE_FACADE_TOIT.exemple }),
  };
}

/** Les deux fichiers de la lecture du jardin (usage `jardin` du serveur, lot L3), sous les versions en vigueur. */
export function genererRunJardin(): FichiersGeneres {
  const versionPrompt = versionCourante(VERSIONS_PROMPT_JARDIN).version, versionSchema = versionCourante(VERSIONS_SCHEMA_JARDIN).version;
  return {
    corpsPrompt: RUN_JARDIN.prompt, versionPrompt, versionSchema,
    prompt: avecEntete(RUN_JARDIN.prompt, { version: versionPrompt, note: NOTE_PROMPT_JARDIN }),
    schema: textuel({ format: 'plan-schema-jardin', version: versionSchema, note: NOTE_SCHEMA_JARDIN, schema: RUN_JARDIN.schema, exemple: RUN_JARDIN.exemple, consigne: RUN_JARDIN.consigne }),
  };
}

/**
 * Les deux fichiers de la lecture du reglement du PLU (usage `plu` du serveur, lot L4), sous les versions en vigueur. Le schema porte
 * aussi l'exemple et la consigne du repli sans sortie structuree (la consigne du run d'une facade parle de parts d'une facade).
 */
export function genererLecturePlu(): FichiersGeneres {
  const versionPrompt = versionCourante(VERSIONS_PROMPT_PLU).version, versionSchema = versionCourante(VERSIONS_SCHEMA_PLU).version;
  return {
    corpsPrompt: LECTURE_PLU.prompt, versionPrompt, versionSchema,
    prompt: avecEntete(LECTURE_PLU.prompt, { version: versionPrompt, note: NOTE_PROMPT_PLU }),
    schema: textuel({ format: 'plan-schema-plu', version: versionSchema, note: NOTE_SCHEMA_PLU, schema: LECTURE_PLU.schema, exemple: LECTURE_PLU.exemple, consigne: CONSIGNE_EXEMPLE_PLU }),
  };
}

/** Les deux fichiers de la redaction d'un texte du dossier (usage `texte` du serveur, lot L5), sous les versions en vigueur. */
export function genererRedactionTexte(): FichiersGeneres {
  const versionPrompt = versionCourante(VERSIONS_PROMPT_TEXTE).version, versionSchema = versionCourante(VERSIONS_SCHEMA_TEXTE).version;
  return {
    corpsPrompt: REDACTION_TEXTE.prompt, versionPrompt, versionSchema,
    prompt: avecEntete(REDACTION_TEXTE.prompt, { version: versionPrompt, note: NOTE_PROMPT_TEXTE }),
    schema: textuel({ format: 'plan-schema-texte', version: versionSchema, note: NOTE_SCHEMA_TEXTE, schema: REDACTION_TEXTE.schema, exemple: REDACTION_TEXTE.exemple, consigne: CONSIGNE_EXEMPLE_TEXTE }),
  };
}
