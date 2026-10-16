// Ce qu'est un SUJET de l'audit, cote donnees : ce que Claude doit lire et comment il doit repondre.
//
// Une description est pure (rien que des textes et un morceau de schema JSON) : l'assembleur
// (assembler.ts) en tire le prompt et le schema d'analyse, l'ecran Admin › Regles les montre et les
// recalcule en direct, et un test les compare aux fichiers livres (deploy/). Le pendant qui sait
// PROPOSER au projet est `Sujet` (app/regles/sujets/contrat.ts), apparie par `attributs`.
//
// Chaque morceau de texte porte un `rang` : l'ordre dans le prompt. Plusieurs sujets contribuent a la
// meme section (« Ouvertures et saillies », les confusions) ; le rang dit ou la puce s'intercale, et
// une puce nouvelle prend un rang libre sans renumeroter les autres.

import type { AttributClaude } from '../../model/analyseClaude.js';

/** Un morceau de schema JSON, tel qu'il est ecrit dans deploy/schema-analyse.json. */
export type SchemaJson = Record<string, unknown>;

export interface Bloc { rang: number; texte: string }
export interface BlocDeSection extends Bloc { section: string }
export interface BlocTitre extends Bloc { titre: string }

export interface DescriptionSujet {
  /** Identifiant stable : minuscules, chiffres, tirets. */
  id: string;
  /** Son nom a l'ecran. */
  libelle: string;
  /** Les attributs dont le taux d'accord de Claude se mesure (regles/conformite.ts) ; vide : observation seule. */
  attributs: AttributClaude[];
  /** Les proprietes de premier niveau du schema de la reponse, par nom. */
  champs: Record<string, SchemaJson>;
  /** Les definitions (`$defs`) que ces champs referencent et que les autres sujets n'ont pas. */
  definitions: Record<string, SchemaJson>;
  /** Les puces de « Comment remplir la reponse » : une par champ ou par groupe de champs. */
  consignes: Bloc[];
  /** Les puces du « Vocabulaire », rangees sous la section qu'elles nomment. */
  vocabulaire: BlocDeSection[];
  /** Des sections entieres, avant la grille de lecture (« Lire les pignons d'abord »). */
  lectures: BlocTitre[];
  /** Les puces de la « Grille de lecture » : ce qui signe chaque forme. */
  grille: Bloc[];
  /** Les confusions qui comptent : chaque texte commence par son titre en gras ; le numero est rendu par l'assembleur. */
  confusions: Bloc[];
  /** Des sections entieres, apres les confusions (« Facades », « Regles de prudence »). */
  rappels: BlocTitre[];
}
