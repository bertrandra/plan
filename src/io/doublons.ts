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
import { champsParasol } from '../model/champsFonction.js';

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
  // Calcule a chaque rendu du menu (l'entree se grise sans doublon) : la parcelle, qui n'en est jamais un et porte la grille du
  // relief, est ecartee ; la forme au centimetre, condition necessaire d'un doublon, se lit sur l'objet tel quel (la
  // serialisation en recopie les memes nombres) ; seuls les objets qui partagent leur forme sont serialises, pour la signature
  // entiere (MD/roadmap-architecture.md, etape 2.1).
  const candidats = objets.filter((o) => o.key !== 'parcelle');
  const forme = (o: ObjetPlan) => JSON.stringify(normalise(o.type === 'circle'
    ? [o.type, null, { x: o.center.x, y: o.center.y }, o.r]
    : [o.type, o.pts.map((p) => ({ x: p.x, y: p.y })), null, null]));
  const formes = candidats.map(forme);
  const parForme = new Map<string, number>();
  for (const f of formes) parForme.set(f, (parForme.get(f) ?? 0) + 1);
  const partagent = candidats.filter((_, i) => (parForme.get(formes[i] as string) ?? 0) > 1);
  const brut = serializeObjects(partagent) as unknown as Record<string, unknown>[];
  const parSignature = new Map<string, ObjetPlan[]>();
  partagent.forEach((o, i) => {
    const b = brut[i] as Record<string, unknown>;
    const signature = JSON.stringify(normalise(Object.fromEntries(Object.entries(b).filter(([k]) => !IGNORES.has(k)))));
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
  for (const o of objets) if (o.parasol?.terrasseLieeKey) champsParasol(o).terrasseLieeKey = vers(o.parasol?.terrasseLieeKey);
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
