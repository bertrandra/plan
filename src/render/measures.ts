// Geometrie des cotes (spec §3.2, render/measures.ts).
//
// Une cote enregistree ne stocke aucune coordonnee : elle designe un cote d'objet et un point
// d'objet, par leurs cles. La geometrie est recalculee a chaque rendu, ce qui la rend toujours
// juste quand un objet bouge - c'est un choix du fichier d'origine, conserve tel quel.
//
// Consequence : ces fonctions ont besoin de la liste des objets. Elle est passee en parametre,
// comme partout depuis la phase 3, au lieu d'etre lue dans la fermeture.

import { dist, centroid } from '../geometry/basic.js';
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

/**
 * Distance a laquelle un rayon partant de `depuis` sort du polygone : la plus grande intersection
 * vers l'avant. On prend le MAXIMUM et non la premiere : sur une forme concave, le rayon peut
 * ressortir puis rentrer, et l'etiquette doit se poser au-dela de la derniere sortie.
 */
export function distanceSortiePolygone(depuis: PtBrut, dir: PtBrut, poly: readonly PtBrut[]): number {
  let maxT = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i],
      b = poly[(i + 1) % n];
    const ex = b.x - a.x,
      ey = b.y - a.y;
    const det = ex * dir.y - ey * dir.x;
    if (Math.abs(det) < 1e-9) continue;
    const acx = a.x - depuis.x,
      acy = a.y - depuis.y;
    const t = (ex * acy - ey * acx) / det;
    const s = (dir.x * acy - dir.y * acx) / det;
    if (t >= 0 && s >= 0 && s <= 1 && t > maxT) maxT = t;
  }
  return maxT;
}

/**
 * Ou poser l'etiquette d'une cote : hors du contour, du cote oppose au centre de la parcelle, a
 * `degagement` metres de la sortie. Une cote posee sur le contour se confond avec lui a
 * l'impression - c'est le defaut qu'un dossier PDF rend immediatement visible.
 */
export function ancrageHorsContour(
  point: PtBrut,
  poly: readonly PtBrut[],
  degagement: number,
  dirSegment: PtBrut
): PtBrut & { dirX: number; dirY: number } {
  // Les deux perpendiculaires au cote de reference.
  const sl = Math.hypot(dirSegment.x, dirSegment.y) || 1;
  const nx = -dirSegment.y / sl,
    ny = dirSegment.x / sl;
  const c = centroid(poly as PtBrut[]);
  // On garde celle qui s'eloigne du centre de la parcelle.
  const versExterieur = (point.x - c.x) * nx + (point.y - c.y) * ny >= 0;
  const dirX = versExterieur ? nx : -nx;
  const dirY = versExterieur ? ny : -ny;
  const sortie = Math.max(distanceSortiePolygone(point, { x: dirX, y: dirY }, poly), 0);
  return { x: point.x + dirX * (sortie + degagement), y: point.y + dirY * (sortie + degagement), dirX, dirY };
}
