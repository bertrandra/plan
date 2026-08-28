// Geometrie des cotes (spec §3.2, render/measures.ts).
//
// Une cote enregistree ne stocke aucune coordonnee : elle designe un cote d'objet et un point
// d'objet, par leurs cles. La geometrie est recalculee a chaque rendu, ce qui la rend toujours
// juste quand un objet bouge - c'est un choix du fichier d'origine, conserve tel quel.
//
// Consequence : ces fonctions ont besoin de la liste des objets. Elle est passee en parametre,
// comme partout depuis la phase 3, au lieu d'etre lue dans la fermeture.

import { dist } from '../geometry/basic.js';
import type { PtBrut } from '../model/types.js';

interface ObjetPlan {
  key: string;
  type?: string;
  pts?: PtBrut[];
  center?: PtBrut;
}

/** Une cote telle qu'elle est enregistree : deux references, pas des coordonnees. */
export interface Mesure {
  refObjKey: string;
  refSegIndex: number;
  startEnd: string;
  targetObjKey: string;
  targetPtIndex: number;
}

/** Geometrie recalculee d'une cote : origine, direction, pied de la perpendiculaire, distances. */
export interface GeometrieMesure {
  A: PtBrut;
  B: PtBrut;
  foot: PtBrut;
  p: PtBrut;
  /** Distance le long du cote, depuis l'origine choisie. */
  along: number;
  /** Distance perpendiculaire au cote. */
  perp: number;
}

/** Les deux extremites d'un cote designe par (cle d'objet, indice de cote). */
export function coordonneesCote(
  objets: ObjetPlan[],
  ref: { objKey: string; segIndex: number }
): { a: PtBrut; b: PtBrut } | null {
  const obj = objets.find((o) => o.key === ref.objKey);
  if (!obj || !obj.pts) return null;
  const n = obj.pts.length;
  return { a: obj.pts[ref.segIndex], b: obj.pts[(ref.segIndex + 1) % n] };
}

/** Le point designe : un sommet, ou le centre s'il s'agit d'un cercle. */
export function coordonneesPoint(
  objets: ObjetPlan[],
  cible: { objKey: string; ptIndex: number }
): PtBrut | null {
  const obj = objets.find((o) => o.key === cible.objKey);
  if (!obj) return null;
  return (obj.type === 'circle' ? obj.center : obj.pts?.[cible.ptIndex]) || null;
}

/**
 * Recalcule la geometrie d'une cote. Rend `null` si l'objet reference a disparu - une cote peut
 * survivre a la suppression de sa cible, et le rendu doit alors l'ignorer plutot que d'echouer.
 *
 * `startEnd` choisit laquelle des deux extremites du cote sert d'origine : c'est ce qui permet de
 * coter « a 4,56 m du coin nord » plutot que du coin sud.
 */
export function geometrieMesure(objets: ObjetPlan[], m: Mesure): GeometrieMesure | null {
  const seg = coordonneesCote(objets, { objKey: m.refObjKey, segIndex: m.refSegIndex });
  const p = coordonneesPoint(objets, { objKey: m.targetObjKey, ptIndex: m.targetPtIndex });
  if (!seg || !p) return null;
  const A = m.startEnd === 'B' ? seg.b : seg.a;
  const B = m.startEnd === 'B' ? seg.a : seg.b;
  const ux = B.x - A.x,
    uy = B.y - A.y;
  const L = Math.hypot(ux, uy) || 1e-9;
  const nx = ux / L,
    ny = uy / L;
  const dx = p.x - A.x,
    dy = p.y - A.y;
  const along = dx * nx + dy * ny;
  const foot = { x: A.x + nx * along, y: A.y + ny * along };
  const perp = dist(p, foot);
  return { A, B, foot, p, along, perp };
}
