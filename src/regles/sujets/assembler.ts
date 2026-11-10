// L'assemblage du prompt et du schema d'analyse a partir des descriptions de sujets (pur, sans
// reseau ni DOM : le script `scripts/generer-prompt-analyse.ts`, les tests et l'ecran Admin › Regles
// l'appellent tous). Le texte fixe est dans gabarit.ts, celui de chaque sujet dans sa description.
//
// Le prompt rendu est le CORPS du fichier livre : l'en-tete (version, note) est ajoute par
// `avecEntete`, parce que la version suit une decision (un changement de texte change la version,
// versions.ts) et non un calcul.

import type { BlocDeSection, BlocTitre, DescriptionSujet } from './description.js';
import { DEBUT_PROMPT, DEFINITIONS_COMMUNES, FIN_REMPLIR, INTRO_CONFUSIONS, INTRO_GRILLE, INTRO_REMPLIR } from './gabarit.js';

const parRang = <T extends { rang: number }>(l: readonly T[]): T[] => [...l].sort((a, b) => a.rang - b.rang);
const tous = <T>(sujets: readonly DescriptionSujet[], f: (s: DescriptionSujet) => T[]): T[] => sujets.flatMap(f);

/** Les sections du vocabulaire, dans l'ordre de leur premiere puce, chacune avec ses puces par rang. */
function sectionsDeVocabulaire(sujets: readonly DescriptionSujet[]): string[] {
  const blocs = parRang(tous<BlocDeSection>(sujets, (s) => s.vocabulaire));
  const noms = [...new Set(blocs.map((b) => b.section))];
  return noms.map((nom) => '## ' + nom + '\n\n' + blocs.filter((b) => b.section === nom).map((b) => b.texte).join('\n'));
}

const sections = (blocs: readonly BlocTitre[]): string[] => parRang(blocs).map((b) => '# ' + b.titre + '\n\n' + b.texte);

/** Le corps du prompt, sans en-tete : cadre fixe, puis ce que chaque sujet apporte, section par section. */
export function assemblerPrompt(sujets: readonly DescriptionSujet[]): string {
  const consignes = parRang(tous(sujets, (s) => s.consignes)).map((b) => b.texte).join('\n');
  const vocabulaire = sectionsDeVocabulaire(sujets);
  const confusions = parRang(tous(sujets, (s) => s.confusions)).map((b, i) => (i + 1) + '. ' + b.texte).join('\n');
  const morceaux = [
    DEBUT_PROMPT,
    '# Comment remplir la réponse\n\n' + INTRO_REMPLIR,
    consignes,
    FIN_REMPLIR,
    ...(vocabulaire.length ? ['# Vocabulaire', ...vocabulaire] : []),
    ...sections(tous(sujets, (s) => s.lectures)),
    INTRO_GRILLE_COMPLETE(),
    parRang(tous(sujets, (s) => s.grille)).map((b) => b.texte).join('\n'),
    ...(confusions ? [INTRO_CONFUSIONS, confusions] : []),
    ...sections(tous(sujets, (s) => s.rappels)),
  ];
  return morceaux.join('\n\n') + '\n';
}

function INTRO_GRILLE_COMPLETE(): string { return '# Grille de lecture\n\n' + INTRO_GRILLE; }

/** Le schema de la reponse : les champs de chaque sujet, dans l'ordre des sujets, tous requis. */
export function assemblerSchema(sujets: readonly DescriptionSujet[], entete: { version: number; note: string }): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const definitions: Record<string, unknown> = { ...DEFINITIONS_COMMUNES };
  for (const s of sujets) {
    Object.assign(properties, s.champs);
    Object.assign(definitions, s.definitions);
  }
  return {
    format: 'plan-schema-analyse',
    version: entete.version,
    note: entete.note,
    schema: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties, $defs: definitions },
  };
}

/** Le fichier du prompt tel qu'il est livre : l'en-tete, puis le corps. */
export function avecEntete(corps: string, entete: { version: number; note: string }): string {
  return '---\nversion: ' + entete.version + '\nnote: ' + entete.note + '\n---\n' + corps;
}

/** Le schema tel qu'il est ecrit dans deploy/schema-analyse.json. */
export const textuel = (schema: unknown): string => JSON.stringify(schema, null, 2) + '\n';
