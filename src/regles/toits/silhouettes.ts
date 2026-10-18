// Les regles de lecture des silhouettes de facades, sorties du code dans regles/toits/silhouettes.json
// (MD/spec-regles-toits.md §14) : deux seuils et la table qui dit, pour une silhouette et le bout que Claude lui
// donne, le role de la facade (un bout du faitage, un long pan) et ce qu'elle dit. L'application est dans
// facade/regles/toits/silhouettes.ts.
//
// Le fichier est importe, donc compile dans le fichier livre. Il ne change aucune toiture deja lue : il ne sert
// qu'aux propositions de l'audit, son empreinte n'entre donc pas dans la version de lecture des toits (app/toitsLidar.ts).

import fichier from '../../../regles/toits/silhouettes.json';
import { fnv1a } from './reglages.js';
import { SILHOUETTES_FACADE, type BoutVu, type SilhouetteFacade } from '../../model/silhouetteFacade.js';

/** Ce qu'une facade dit des bouts : un bout que le moteur produit, un appentis, ou un bout qu'il ne sait pas produire. */
export type ValeurSilhouette = 'pignon' | 'croupe' | 'appentis' | 'hors-moteur';
export type RoleSilhouette = 'bout' | 'long';

export interface ConditionSilhouette {
  /** Le `bout` que Claude donne a la facade ; absent : n'importe lequel, y compris aucun. */
  bout?: Exclude<BoutVu, 'indetermine'>;
  /** Les silhouettes admises ; absent : n'importe laquelle. */
  silhouette?: readonly Exclude<SilhouetteFacade, 'indetermine'>[];
  /** `false` : sous un toit plat, la ligne ne s'applique pas. */
  toitPlat?: false;
}

export interface LigneLecture {
  si: ConditionSilhouette;
  /** `null` : la facade ne dit rien. */
  role: RoleSilhouette | null;
  valeur?: ValeurSilhouette;
  pourquoi: string;
}

export interface SilhouettesToits {
  seuils: { TOLERANCE_BOUT_DEG: number; PART_SECOND_SENS: number; MUR_CORPS_DISTANCE_M: number; MUR_CORPS_RECOUVREMENT: number };
  lecture: readonly LigneLecture[];
}

export class SilhouettesToitsIllisibles extends Error {}

const BOUTS = ['pignon', 'croupe', 'demi-croupe', 'brisis', 'sans-objet'];
const SILHOUETTES: readonly string[] = SILHOUETTES_FACADE.map((s) => s.code);
const VALEURS = ['pignon', 'croupe', 'appentis', 'hors-moteur'];
const refus = (m: string): never => { throw new SilhouettesToitsIllisibles('regles/toits/silhouettes.json : ' + m); };

/** Le fichier, verifie : un vocabulaire ferme, des seuils finis, une table dont chaque ligne dit un role et une valeur coherents. */
export function lireSilhouettesToits(donnees: unknown): SilhouettesToits {
  const f = donnees as { format?: unknown; seuils?: Record<string, { valeur?: unknown } | null>; lecture?: unknown } | null;
  if (!f || typeof f !== 'object' || f.format !== 'plan-silhouettes-toits' || !f.seuils || !Array.isArray(f.lecture)) return refus('format inconnu');
  const seuil = (nom: string, borne: [number, number]): number => {
    const v = f.seuils?.[nom]?.valeur;
    if (typeof v !== 'number' || !Number.isFinite(v)) return refus(nom + ' sans valeur numerique');
    if (v < borne[0] || v > borne[1]) return refus(nom + ' hors de [' + borne[0] + ', ' + borne[1] + ']');
    return v;
  };
  const seuils = { TOLERANCE_BOUT_DEG: seuil('TOLERANCE_BOUT_DEG', [1, 44]), PART_SECOND_SENS: seuil('PART_SECOND_SENS', [0, 1]), MUR_CORPS_DISTANCE_M: seuil('MUR_CORPS_DISTANCE_M', [0.1, 5]), MUR_CORPS_RECOUVREMENT: seuil('MUR_CORPS_RECOUVREMENT', [0.1, 1]) };
  const lecture = (f.lecture as Record<string, unknown>[]).map((l, i): LigneLecture => {
    const ou = 'lecture[' + i + '] : ';
    const si = (l.si ?? {}) as Record<string, unknown>;
    for (const cle of Object.keys(si)) if (!['bout', 'silhouette', 'toitPlat'].includes(cle)) refus(ou + 'condition « ' + cle + ' » inconnue');
    if (si.bout !== undefined && !BOUTS.includes(String(si.bout))) refus(ou + 'bout « ' + String(si.bout) + ' » inconnu');
    if (si.silhouette !== undefined && (!Array.isArray(si.silhouette) || !si.silhouette.length || si.silhouette.some((s) => !SILHOUETTES.includes(String(s))))) refus(ou + 'silhouette inconnue');
    if (si.toitPlat !== undefined && si.toitPlat !== false) refus(ou + 'toitPlat ne vaut que false');
    if (si.bout === undefined && si.silhouette === undefined) refus(ou + 'une ligne sans bout ni silhouette dirait tout de n\'importe quel mur');
    if (l.role !== null && l.role !== 'bout' && l.role !== 'long') refus(ou + 'role « ' + String(l.role) + ' » inconnu');
    if (l.role === null && l.valeur !== undefined) refus(ou + 'un mur qui ne dit rien n\'a pas de valeur');
    if (l.role !== null && !VALEURS.includes(String(l.valeur))) refus(ou + 'valeur « ' + String(l.valeur) + ' » inconnue');
    if (l.role === 'long' && l.valeur !== 'pignon' && l.valeur !== 'croupe') refus(ou + 'un long pan ne dit que des pignons ou des croupes');
    const pourquoi = typeof l.pourquoi === 'string' ? l.pourquoi : '';
    if (!pourquoi.trim()) refus(ou + 'sans raison');
    return { si: si as ConditionSilhouette, role: l.role as RoleSilhouette | null, ...(l.valeur !== undefined ? { valeur: l.valeur as ValeurSilhouette } : {}), pourquoi };
  });
  return { seuils, lecture };
}

/** L'empreinte de ce qui change une lecture : les valeurs des seuils et la table (la raison d'une ligne n'en fait pas partie). */
export function empreinteSilhouettesToits(r: SilhouettesToits): string {
  return fnv1a(JSON.stringify([r.seuils, r.lecture.map((l) => [l.si, l.role, l.valeur ?? null])]));
}

/** Les regles en vigueur : celles du depot. */
export const SILHOUETTES_TOITS: Readonly<SilhouettesToits> = Object.freeze(lireSilhouettesToits(fichier));
export const EMPREINTE_SILHOUETTES_TOITS = empreinteSilhouettesToits(SILHOUETTES_TOITS);
