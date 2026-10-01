// Le schema d'un document de projet, et le chemin d'une version a la suivante (RELEASE.md §3).
//
// ---------------------------------------------------------------------------------------------
// Pourquoi un document n'est pas ecrit, d'office, au schema le plus recent
// ---------------------------------------------------------------------------------------------
//
// `schema_version` est le seul contrat de forme entre Plan et ce qui stocke ses projets : la
// plateforme refuse a l'ecriture un numero qu'elle ne connait pas (`422
// UNSUPPORTED_SCHEMA_VERSION`), et une version plus ancienne de Plan refuse d'ouvrir un fichier
// plus recent qu'elle. Ecrire `2` sur un plan qui n'a ni releve ni toit, c'est donc se faire
// refuser pour une forme que le document n'utilise pas — c'est exactement ce qui empechait la
// demonstration de s'ouvrir sur une plateforme restee a `[1]`.
//
// La regle est donc : un document est ecrit au **plus petit schema qui le decrit**, sauf si le
// projet a ete mis a jour expres (`plancher`) — on ne redescend jamais un projet que quelqu'un a
// choisi de monter.
//
// ---------------------------------------------------------------------------------------------
// Les migrations
// ---------------------------------------------------------------------------------------------
//
// Une migration fait passer un document **brut** d'un schema au suivant ; elles s'appliquent a la
// lecture, en chaine, avant la normalisation. Le programme ne manipule ainsi jamais qu'une forme,
// la derniere. Mettre un projet « a jour » ne transforme plus rien en memoire : c'est declarer, a
// l'ecriture, qu'il est desormais de la forme courante.

import { SCHEMA_VERSION } from './version.js';
import type { ObjetBrut } from './types.js';

/** Un document de projet, tel qu'il est lu ou ecrit : la forme de `projet.json`. */
export interface DocumentBrut {
  objects: ObjetBrut[];
  measures?: unknown[];
}

export interface Migration {
  /** Le schema de depart ; la migration rend un document au schema `de + 1`. */
  de: number;
  /** Ce que la version d'arrivee apporte, en une phrase : le dialogue de mise a jour la montre. */
  apporte: string;
  migrer: (d: DocumentBrut) => DocumentBrut;
}

/**
 * La chaine, dans l'ordre. `tests/unit/model/migrations.test.ts` verifie qu'elle mene sans trou de
 * 1 a `SCHEMA_VERSION` : un numero de schema monte sans sa migration ne compile pas en silence.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    de: 1,
    apporte: 'les relevés de façade (ouvertures, texture, hauteurs d’un mur en L) et la forme du toit',
    // Le schema 2 n'ajoute que deux champs facultatifs a un batiment : un document 1 est deja un
    // document 2 valide. La migration existe pour que la chaine soit complete, pas pour transformer.
    migrer: (d) => d
  }
];

/** Le plus petit schema qui decrit ces objets : 2 des qu'un batiment porte un releve ou un toit. */
export function schemaMinimal(objets: readonly ObjetBrut[]): number {
  const releve = objets.some((o) => (Array.isArray(o.facades) && o.facades.length > 0) || !!o.toit);
  return releve ? 2 : 1;
}

/** Le schema a ecrire : celui qui decrit le document, jamais sous celui ou le projet a ete monte. */
export function schemaAEcrire(objets: readonly ObjetBrut[], plancher: number | null | undefined): number {
  return Math.min(SCHEMA_VERSION, Math.max(schemaMinimal(objets), plancher ?? 1));
}

/** Les schemas que ce programme sait lire : 1, puis chaque version ou une migration mene. */
export function schemasLisibles(): number[] {
  const v = new Set([1, ...MIGRATIONS.map((m) => m.de + 1)]);
  return [...v].filter((n) => n <= SCHEMA_VERSION).sort((a, b) => a - b);
}

/** Les migrations a appliquer pour lire un document de schema `de`. */
export function migrationsDepuis(de: number): Migration[] {
  return MIGRATIONS.filter((m) => m.de >= de && m.de < SCHEMA_VERSION);
}

/** Lit un document de schema `de` dans la forme courante. Un schema absent vaut 1. */
export function migrer<D extends DocumentBrut>(d: D, de: number | null | undefined): D {
  return migrationsDepuis(de ?? 1).reduce<DocumentBrut>((doc, m) => m.migrer(doc), d) as D;
}
