// Trouver les objets en double d'un projet et les fusionner (menu Fichier et menu Admin, app/ecouteurs/doublons.ts).
//
// Un doublon est un objet qui dit exactement la meme chose qu'un autre : meme forme, memes sommets au
// centimetre, memes reglages. Seuls l'identifiant, le nom, le verrou et la visibilite n'y comptent pas :
// une copie posee sur l'original (import deux fois, « Dupliquer » puis rien deplace) est un doublon, une copie
// decalee n'en est pas un. La parcelle du projet n'en est jamais un. On garde l'objet verrouille s'il y en a
// un, sinon le premier du plan ; les cotes et les liens (`terrasseLieeKey`) qui visaient un doublon visent
// l'objet garde. Pur : rien n'est ecrit tant que l'appelant ne repose pas le resultat.

import { serializeObjects } from './serialisation.js';
import type { Mesure, ObjetPlan } from '../model/types.js';

/** Ce qui distingue deux objets sans les rendre differents : l'identite, le nom et l'etat d'affichage. */
const IGNORES = new Set(['key', 'name', 'locked', 'hidden', 'showName', 'showSegNames', 'showVertNames', 'showDims', 'showAngles']);

export interface GroupeDoublons { garde: ObjetPlan; doublons: ObjetPlan[] }

/** Les nombres a 1 cm : deux sommets a un millimetre l'un de l'autre sont le meme sommet. */
function normalise(v: unknown): unknown {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, normalise(x)]));
  }
  return v;
}

/** Les groupes d'objets identiques, dans l'ordre du plan. */
export function trouverDoublons(objets: readonly ObjetPlan[]): GroupeDoublons[] {
  const parSignature = new Map<string, ObjetPlan[]>();
  const brut = serializeObjects(objets as ObjetPlan[]);
  objets.forEach((o, i) => {
    if (o.key === 'parcelle') return;
    const signature = JSON.stringify(normalise(Object.fromEntries(Object.entries(brut[i] as Record<string, unknown>).filter(([k]) => !IGNORES.has(k)))));
    parSignature.set(signature, [...(parSignature.get(signature) ?? []), o]);
  });
  return [...parSignature.values()].filter((g) => g.length > 1).map((g) => {
    const garde = g.find((o) => o.locked) ?? (g[0] as ObjetPlan);
    return { garde, doublons: g.filter((o) => o !== garde) };
  });
}

export const nombreDeDoublons = (groupes: readonly GroupeDoublons[]): number => groupes.reduce((n, g) => n + g.doublons.length, 0);

/** Les objets sans leurs doublons, les cotes ramenees sur l'objet garde (puis dedoublonnees), les liens redirigés. */
export function fusionnerDoublons(objets: readonly ObjetPlan[], mesures: readonly Mesure[], groupes: readonly GroupeDoublons[]): { objets: ObjetPlan[]; mesures: Mesure[]; retires: number } {
  const verscle = new Map<string, string>();
  for (const g of groupes) for (const d of g.doublons) verscle.set(d.key, g.garde.key);
  const vers = (k: string) => verscle.get(k) ?? k;
  for (const o of objets) if (o.terrasseLieeKey) o.terrasseLieeKey = vers(o.terrasseLieeKey);
  const vus = new Set<string>();
  const ramenees = mesures.map((m) => ({ ...m, refObjKey: vers(m.refObjKey), targetObjKey: vers(m.targetObjKey) })).filter((m) => {
    // Deux cotes devenues la meme apres le renvoi n'en font qu'une.
    const k = [m.refObjKey, m.refSegIndex, m.startEnd, m.targetObjKey, m.targetPtIndex].join('|');
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  return { objets: objets.filter((o) => !verscle.has(o.key)), mesures: ramenees, retires: verscle.size };
}
