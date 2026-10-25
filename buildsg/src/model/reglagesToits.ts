// Les seuils de la lecture des toits, sortis du code dans regles/toits/reglages.json
// (MD/spec-regles-toits.md §6, §9.2).
//
// Le fichier est importe, donc compile dans le fichier livre : pas de lecture reseau, un toit calcule
// hier se recalcule a l'identique. Chaque module de la lecture (model/toitMesure.ts,
// model/volumesToit.ts, model/aCheval.ts, facade/toits/toitLidar.ts, facade/toits/toitCorps.ts,
// app/toitsLidar.ts) garde ses noms de seuils, mais en lit la valeur ici : le nombre, sa raison et
// les cas qui le justifient vivent au meme endroit, et une PR qui en change un se voit dans le diff
// du fichier. Le type des noms vient du fichier lui-meme : un seuil retire du fichier ne compile plus.
//
// L'empreinte des valeurs entre dans la version de lecture des toits (app/toitsLidar.ts,
// VERSION_LECTURE_TOITS) : une valeur changee relit les toits deja lus.

import fichier from '../../regles/toits/reglages.json';
import { formeEmpreinteProfils, lireProfilsToits, type ProfilToit } from './profilsToits.js';

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

/** Une table complete des seuils, par nom. */
export type TableSeuilsToits = { [K in NomReglageToit]: number };
/** Les valeurs que des profils changent pour un batiment : seulement celles-la. */
export type SurchargesSeuilsToits = Partial<Record<NomReglageToit, number>>;

/** Les seuils de la lecture des toits, par nom, tels que le fichier les donne. */
export const REGLAGES_TOITS: Readonly<TableSeuilsToits> = Object.freeze(lireReglagesToits(fichier) as TableSeuilsToits);

/**
 * Les seuils en vigueur pour le calcul en cours : ceux du fichier, ou, le temps d'un batiment, ceux que
 * ses profils surchargent (facade/profilsToits.ts, avecSeuilsToit). Les modules de la lecture les
 * lisent ici a chaque appel, jamais une copie prise au chargement du module : une copie ignorerait
 * le profil du batiment. Hors d'avecSeuilsToit, la table vaut REGLAGES_TOITS au bit pres.
 */
export const SEUILS_TOITS: Readonly<TableSeuilsToits> = { ...REGLAGES_TOITS };

/** Un calcul asynchrone sous des seuils surcharges laisserait d'autres batiments les lire entre deux attentes. */
export class CalculAsynchroneRefuse extends Error {}

/**
 * Fait `calcul` avec ces seuils a la place de ceux du fichier, puis remet les precedents, meme sur une
 * erreur. Le calcul doit etre synchrone : JavaScript n'execute alors rien d'autre pendant qu'il tourne,
 * et les lectures paralleles des autres batiments (app/toitsLidar.ts) ne voient jamais ces valeurs.
 * Sans surcharge, `calcul` est appele tel quel : sans profil, rien ne change.
 */
export function avecSeuilsToit<T>(surcharges: SurchargesSeuilsToits, calcul: () => T): T {
  const noms = Object.keys(surcharges) as NomReglageToit[];
  if (!noms.length) return calcul();
  const table = SEUILS_TOITS as TableSeuilsToits;
  const avant: SurchargesSeuilsToits = {};
  for (const n of noms) { avant[n] = table[n]; table[n] = surcharges[n] as number; }
  try {
    const r = calcul();
    if (r && typeof (r as { then?: unknown }).then === 'function') throw new CalculAsynchroneRefuse('avecSeuilsToit : le calcul doit etre synchrone');
    return r;
  } finally {
    Object.assign(table, avant);
  }
}

/** Le fichier tel qu'il est livre : la description de chaque seuil, pour le dire (scripts, tests). */
export const DESCRIPTION_REGLAGES_TOITS: { readonly [K in NomReglageToit]: DescriptionReglage } = fichier.seuils;

/** FNV-1a sur 32 bits, en hexadecimal : assez pour reconnaitre un jeu de valeurs, sans dependance. */
export function fnv1a(texte: string): string {
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

/**
 * Les profils livres (model/profilsToits.ts), verifies au chargement comme les seuils : un profil mal
 * ecrit, ou deux profils de meme precision sur le meme seuil, et le fichier est refuse.
 */
export const PROFILS_TOITS: readonly ProfilToit[] = Object.freeze(lireProfilsToits(fichier.profils, Object.keys(REGLAGES_TOITS)));

/**
 * L'empreinte des reglages livres : les seuils et les profils (leurs conditions, leurs surcharges et le
 * vocabulaire qui les lit). Sans profil, c'est l'empreinte d'avant le moteur des profils.
 */
export const EMPREINTE_REGLAGES_TOITS = empreinteReglagesToits(REGLAGES_TOITS, formeEmpreinteProfils(PROFILS_TOITS));
