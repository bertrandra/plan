// Les regles de reconciliation des sources, sorties du code dans regles/reconciliation.json
// (MD/spec-reconciliation.md) : le poids de chaque source, ce qui compte pour un accord, et les seuils de la decision
// automatique. L'application est dans facade/regles/reconciliation.ts.
//
// Le fichier est importe, donc compile dans le fichier livre. Il ne change aucune toiture deja lue : il regle les
// propositions de l'audit, son empreinte n'entre donc pas dans la version de lecture des toits.

import fichier from '../../regles/reconciliation.json';
import { fnv1a } from './toits/reglages.js';

/** D'ou vient un constat. `projet` n'est pas un electeur : c'est la valeur de depart (spec §1). */
export const SOURCES = ['ign', 'lidar', 'photo', 'claude', 'terrain'] as const;
export type SourceConstat = (typeof SOURCES)[number];
export const CIBLES_ATTRIBUT = ['batiment', 'facade', 'parcelle'] as const;
export type CibleAttribut = (typeof CIBLES_ATTRIBUT)[number];

/** Ce que sont les attributs que le moteur arbitre. */
export const ATTRIBUTS = ['hauteurEgout', 'hauteurTotale', 'formeToit', 'boutsToit', 'sensFaitage', 'silhouetteFacade', 'ouverturesFacade', 'cheminees', 'lucarnes', 'appentis', 'materiauMurs', 'couverture'] as const;
export type IdAttribut = (typeof ATTRIBUTS)[number];

/** Quand deux valeurs s'accordent : a une tolerance (`nombre`, `angle` modulo 180), exactement (`egal`), comme deux ensembles (`ensemble`). */
export type Accord =
  | { type: 'nombre'; tolerance: number; unite: string }
  | { type: 'angle'; tolerance: number; unite: string }
  | { type: 'egal' }
  | { type: 'ensemble' };

export interface DescriptionSource { libelle: string; poids: number; seule: boolean; voit: string }
export interface DescriptionAttribut {
  libelle: string;
  cible: CibleAttribut;
  accord: Accord;
  /** Le poids des sources pour cet attribut ; une source absente vaut son poids par defaut. */
  poids: Partial<Record<SourceConstat, number>>;
  /** Les valeurs que la personne peut forcer quand l'attribut est un mot ou un ensemble de mots ; absent : une cote ou un angle, qui se tape. */
  valeurs?: readonly (string | readonly string[])[];
  /** Les seuils propres a l'attribut ; absents : ceux du fichier. */
  scoreAutoMin?: number;
  margeAutoMin?: number;
  /** Les sources qui ont le droit d'etre seules pour cet attribut, en plus de celles que le fichier autorise (une photo sur ses ouvertures). */
  seules?: readonly SourceConstat[];
}

/** Une etape de la lecture du LiDAR : ce qu'elle fait, et les modules dont les seuils (regles/toits/reglages.json) la reglent. */
export interface EtapeLidar { ordre: number; etape: string; modules: string[]; dit: string }

export interface ReglesReconciliation {
  /** La lecture du LiDAR, etape par etape : de quoi montrer ses seuils par module a cote des regles d'arbitrage. */
  lecturesLidar: EtapeLidar[];
  seuils: { SCORE_AUTO_MIN: number; MARGE_AUTO_MIN: number; CONFIANCE_ABSENTE: number };
  sources: Record<SourceConstat, DescriptionSource>;
  attributs: Record<IdAttribut, DescriptionAttribut>;
}

export class ReconciliationIllisible extends Error {}
const refus = (m: string): never => { throw new ReconciliationIllisible('regles/reconciliation.json : ' + m); };
const nombre = (v: unknown, ou: string, borne: [number, number] = [0, Infinity]): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return refus(ou + ' sans valeur numerique');
  if (v < borne[0] || v > borne[1]) return refus(ou + ' hors de [' + borne[0] + ', ' + (borne[1] === Infinity ? 'plus l’infini' : borne[1]) + ']');
  return v;
};

/** Le fichier, verifie : un vocabulaire ferme (sources, attributs, accords), des poids et des seuils finis. */
export function lireReconciliation(donnees: unknown): ReglesReconciliation {
  const f = donnees as { format?: unknown; seuils?: Record<string, { valeur?: unknown } | null>; sources?: Record<string, Record<string, unknown>>; attributs?: Record<string, Record<string, unknown>>; lecturesLidar?: unknown } | null;
  if (!f || typeof f !== 'object' || f.format !== 'plan-reconciliation' || !f.seuils || !f.sources || !f.attributs) return refus('format inconnu');
  const seuils = {
    SCORE_AUTO_MIN: nombre(f.seuils.SCORE_AUTO_MIN?.valeur, 'SCORE_AUTO_MIN', [0.01, 100]),
    MARGE_AUTO_MIN: nombre(f.seuils.MARGE_AUTO_MIN?.valeur, 'MARGE_AUTO_MIN', [1, 100]),
    CONFIANCE_ABSENTE: nombre(f.seuils.CONFIANCE_ABSENTE?.valeur, 'CONFIANCE_ABSENTE', [0.01, 1]),
  };
  for (const id of Object.keys(f.sources)) if (!(SOURCES as readonly string[]).includes(id)) refus('source « ' + id + ' » inconnue');
  const sources = Object.fromEntries(SOURCES.map((id) => {
    const s = f.sources?.[id];
    if (!s) return refus('source « ' + id + ' » absente');
    if (typeof s.libelle !== 'string' || !s.libelle.trim()) refus('source « ' + id + ' » sans libelle');
    if (typeof s.seule !== 'boolean') refus('source « ' + id + ' » : seule vaut true ou false');
    return [id, { libelle: String(s.libelle), poids: nombre(s.poids, 'poids de ' + id, [0, 100]), seule: s.seule, voit: typeof s.voit === 'string' ? s.voit : '' }];
  })) as Record<SourceConstat, DescriptionSource>;
  for (const id of Object.keys(f.attributs)) if (!(ATTRIBUTS as readonly string[]).includes(id)) refus('attribut « ' + id + ' » inconnu');
  const attributs = Object.fromEntries(ATTRIBUTS.map((id) => {
    const a = f.attributs?.[id];
    if (!a) return refus('attribut « ' + id + ' » absent');
    const ou = 'attribut ' + id + ' : ';
    if (typeof a.libelle !== 'string' || !a.libelle.trim()) refus(ou + 'sans libelle');
    if (!(CIBLES_ATTRIBUT as readonly string[]).includes(String(a.cible))) refus(ou + 'cible « ' + String(a.cible) + ' » inconnue');
    const ac = (a.accord ?? {}) as Record<string, unknown>;
    let accord: Accord;
    if (ac.type === 'nombre' || ac.type === 'angle') accord = { type: ac.type, tolerance: nombre(ac.tolerance, ou + 'tolerance', [0.001, 1000]), unite: typeof ac.unite === 'string' ? ac.unite : '' };
    else if (ac.type === 'egal' || ac.type === 'ensemble') accord = { type: ac.type };
    else return refus(ou + 'accord « ' + String(ac.type) + ' » inconnu');
    const poids: Partial<Record<SourceConstat, number>> = {};
    for (const [src, v] of Object.entries((a.poids ?? {}) as Record<string, unknown>)) {
      if (!(SOURCES as readonly string[]).includes(src)) refus(ou + 'poids d’une source « ' + src + ' » inconnue');
      poids[src as SourceConstat] = nombre(v, ou + 'poids de ' + src, [0, 100]);
    }
    const valeurs = lireValeurs(a.valeurs, accord, ou);
    return [id, { libelle: String(a.libelle), cible: a.cible as CibleAttribut, accord, poids, ...(valeurs ? { valeurs } : {}), ...(a.scoreAutoMin !== undefined ? { scoreAutoMin: nombre(a.scoreAutoMin, ou + 'scoreAutoMin', [0.01, 100]) } : {}), ...(a.margeAutoMin !== undefined ? { margeAutoMin: nombre(a.margeAutoMin, ou + 'margeAutoMin', [1, 100]) } : {}), ...(a.seules !== undefined ? { seules: lireSeules(a.seules, ou) } : {}) }];
  })) as Record<IdAttribut, DescriptionAttribut>;
  const lecturesLidar = lireEtapes(f.lecturesLidar);
  return { lecturesLidar, seuils, sources, attributs };
}

/** Les sources admises seules pour un attribut : une liste de noms de sources. */
function lireSeules(v: unknown, ou: string): readonly SourceConstat[] {
  if (!Array.isArray(v) || v.some((s) => !(SOURCES as readonly string[]).includes(String(s)))) return refus(ou + 'seules : une liste de sources connues est attendue');
  return v as SourceConstat[];
}

/** Les valeurs forcables d'un attribut en mots : des mots, ou des ensembles de mots quand l'accord est un ensemble ; absentes, rien n'est propose. */
function lireValeurs(v: unknown, accord: Accord, ou: string): readonly (string | readonly string[])[] | undefined {
  if (v === undefined) return undefined;
  if (accord.type === 'nombre' || accord.type === 'angle') return refus(ou + 'valeurs : une cote ou un angle se tape, il n’a pas de liste');
  if (!Array.isArray(v) || !v.length) return refus(ou + 'valeurs : une liste est attendue');
  return v.map((x) => {
    if (accord.type === 'egal' && typeof x === 'string' && x.trim()) return x;
    if (accord.type === 'ensemble' && Array.isArray(x) && x.length && x.every((m) => typeof m === 'string' && m.trim())) return [...(x as string[])];
    return refus(ou + 'valeurs : une valeur ne va pas avec l’accord « ' + accord.type + ' »');
  });
}

/** Les etapes de la lecture du LiDAR : numerotees, nommees, avec leurs modules, sans qu'un module serve deux etapes. */
function lireEtapes(v: unknown): EtapeLidar[] {
  if (!Array.isArray(v) || !v.length) return refus('lecturesLidar : une liste d’étapes est attendue');
  const modules = new Set<string>();
  const etapes = (v as Record<string, unknown>[]).map((e, i): EtapeLidar => {
    const ou = 'lecturesLidar[' + i + '] : ';
    if (typeof e.etape !== 'string' || !e.etape.trim()) refus(ou + 'sans nom');
    if (typeof e.dit !== 'string' || !e.dit.trim()) refus(ou + 'sans description');
    if (!Array.isArray(e.modules) || !e.modules.length || e.modules.some((m) => typeof m !== 'string' || !m.trim())) refus(ou + 'sans modules');
    for (const m of e.modules as string[]) { if (modules.has(m)) refus(ou + 'le module « ' + m + ' » sert deux étapes'); modules.add(m); }
    return { ordre: nombre(e.ordre, ou + 'ordre', [1, 100]), etape: String(e.etape), modules: [...(e.modules as string[])], dit: String(e.dit) };
  });
  return etapes.sort((a, b) => a.ordre - b.ordre);
}

/** L'empreinte de ce qui change une decision : les valeurs, jamais les phrases. */
export function empreinteReconciliation(r: ReglesReconciliation): string {
  return fnv1a(JSON.stringify([r.seuils, SOURCES.map((s) => [s, r.sources[s].poids, r.sources[s].seule]), ATTRIBUTS.map((a) => [a, r.attributs[a].cible, r.attributs[a].accord, r.attributs[a].poids, r.attributs[a].valeurs ?? null, r.attributs[a].scoreAutoMin ?? null, r.attributs[a].margeAutoMin ?? null, r.attributs[a].seules ?? null])]));
}

/** Les regles en vigueur : celles du depot. */
export const RECONCILIATION: Readonly<ReglesReconciliation> = Object.freeze(lireReconciliation(fichier));
export const EMPREINTE_RECONCILIATION = empreinteReconciliation(RECONCILIATION);
