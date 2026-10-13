// Les seuils de la lecture des toits, sortis du code dans regles/toits/reglages.json
// (MD/spec-regles-toits.md §6, §9.2).
//
// Le fichier est importe, donc compile dans le fichier livre : pas de lecture reseau, un toit calcule
// hier se recalcule a l'identique. Chaque module de la lecture (model/toitMesure.ts,
// model/volumesToit.ts, model/aCheval.ts, facade/toitLidar.ts, facade/toitCorps.ts,
// app/toitsLidar.ts) garde ses noms de seuils, mais en lit la valeur ici : le nombre, sa raison et
// les cas qui le justifient vivent au meme endroit, et une PR qui en change un se voit dans le diff
// du fichier. Le type des noms vient du fichier lui-meme : un seuil retire du fichier ne compile plus.
//
// L'empreinte des valeurs entre dans la version de lecture des toits (app/toitsLidar.ts,
// VERSION_LECTURE_TOITS) : une valeur changee relit les toits deja lus.

import fichier from '../../regles/toits/reglages.json';

type Seuils = typeof fichier.seuils;
/** Le nom d'un seuil de la lecture des toits, tel que le fichier l'ecrit. */
export type NomReglageToit = keyof Seuils;

/** Un seuil tel que le fichier le decrit. */
export interface DescriptionReglage {
  valeur: number;
  unite: string;
  /** Le module qui le lit, et son nom dans le code quand il differe. */
  ou: string;
  pourquoi: string;
  /** Les cas qui l'ont montre, `village/batiment`. */
  cas: string[];
}

/** Un fichier de reglages illisible ne doit pas laisser lire les toits avec des seuils manquants. */
export class ReglagesToitsIllisibles extends Error {}

/**
 * Les seuils du fichier, verifies : chacun a une valeur finie. Rend la table nom -> valeur.
 * Exportee pour les tests, qui l'essaient sur un fichier abime.
 */
export function lireReglagesToits(donnees: unknown): Record<string, number> {
  const f = donnees as { format?: unknown; seuils?: unknown } | null;
  if (!f || typeof f !== 'object' || f.format !== 'plan-reglages-toits' || !f.seuils || typeof f.seuils !== 'object') throw new ReglagesToitsIllisibles('regles/toits/reglages.json : format inconnu');
  const out: Record<string, number> = {};
  for (const [nom, s] of Object.entries(f.seuils as Record<string, { valeur?: unknown } | null>)) {
    const v = s?.valeur;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new ReglagesToitsIllisibles('regles/toits/reglages.json : ' + nom + ' sans valeur numerique');
    out[nom] = v;
  }
  return out;
}

/** Les seuils de la lecture des toits, par nom. */
export const REGLAGES_TOITS = lireReglagesToits(fichier) as { readonly [K in NomReglageToit]: number };

/** Le fichier tel qu'il est livre : la description de chaque seuil, pour le dire (scripts, tests). */
export const DESCRIPTION_REGLAGES_TOITS: { readonly [K in NomReglageToit]: DescriptionReglage } = fichier.seuils;

/** FNV-1a sur 32 bits, en hexadecimal : assez pour reconnaitre un jeu de valeurs, sans dependance. */
function fnv1a(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * L'empreinte de ce qui change un toit lu : les valeurs, triees par nom, et les profils. Les raisons
 * et les cas n'y entrent pas : les reecrire ne relit aucun toit. `String(v)` ecrit le plus court
 * nombre qui redonne le meme double : l'empreinte suit la valeur au bit pres.
 */
export function empreinteReglagesToits(valeurs: Readonly<Record<string, number>>, profils: unknown = []): string {
  const lignes = Object.keys(valeurs).sort().map((k) => k + '=' + String(valeurs[k]));
  return fnv1a(lignes.join('\n') + '\nprofils=' + JSON.stringify(profils));
}

/** L'empreinte des reglages livres. */
export const EMPREINTE_REGLAGES_TOITS = empreinteReglagesToits(REGLAGES_TOITS, fichier.profils);
