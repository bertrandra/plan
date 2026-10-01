// Ce qu'une cote lue d'un fichier doit prouver avant d'entrer dans l'etat.
//
// Une cote enregistree ne porte pas de coordonnees : deux references (un cote d'un objet, un point
// d'un autre) que `render/measures.ts::geometrieMesure` resout a chaque rendu. Un fichier peut donc
// livrer une cote qui designe un objet absent, un cote au-dela du polygone, ou un cercle comme
// reference — et jusqu'au 20 septembre 2026, les deux imports (SVG et JSON) ne verifiaient que
// l'existence des deux objets : les indices etaient recopies tels quels, et une cote abimee
// entrait dans l'etat pour ne jamais se dessiner, ou pire, pour se dessiner de travers.
//
// Ce module est le seul juge, pour les deux imports. Il ne lit que ce que le rendu lira.

import type { Mesure, PtBrut } from './types.js';

/** Ce qu'il faut savoir d'un objet pour dire si une cote peut s'y accrocher. */
export interface ObjetCotable {
  key: string;
  type?: string | undefined;
  pts?: readonly PtBrut[] | undefined;
}

/** Les cinq references d'une cote, verifiees. `startEnd` vaut 'A' ou 'B', ce que le rendu distingue. */
export type ReferencesDeCote = Pick<Mesure, 'refObjKey' | 'refSegIndex' | 'startEnd' | 'targetObjKey' | 'targetPtIndex'>;

function indiceEntier(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Rend les references verifiees d'une cote brute, ou `null` si elle ne peut pas se dessiner :
 * objet de reference ou cible absent, cote de reference sur un cercle (un cercle n'a pas de cote),
 * indice de cote ou de sommet hors du polygone.
 *
 * Un point cible sur un cercle est son centre, quel que soit l'indice : il doit seulement etre un
 * entier positif, comme le fichier le porte.
 */
export function referencesDeCote(brut: unknown, objets: readonly ObjetCotable[]): ReferencesDeCote | null {
  if (!brut || typeof brut !== 'object') return null;
  const m = brut as Partial<Mesure>;
  if (typeof m.refObjKey !== 'string' || typeof m.targetObjKey !== 'string') return null;
  const ref = objets.find((o) => o.key === m.refObjKey);
  const cible = objets.find((o) => o.key === m.targetObjKey);
  if (!ref || !cible) return null;
  if (!ref.pts || !indiceEntier(m.refSegIndex) || m.refSegIndex >= ref.pts.length) return null;
  if (!indiceEntier(m.targetPtIndex)) return null;
  if (cible.type !== 'circle' && (!cible.pts || m.targetPtIndex >= cible.pts.length)) return null;
  return {
    refObjKey: m.refObjKey,
    refSegIndex: m.refSegIndex,
    startEnd: m.startEnd === 'B' ? 'B' : 'A',
    targetObjKey: m.targetObjKey,
    targetPtIndex: m.targetPtIndex
  };
}
