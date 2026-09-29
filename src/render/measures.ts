// Geometrie des cotes (spec §3.2, render/measures.ts).
//
// Une cote enregistree ne stocke aucune coordonnee : elle designe un cote d'objet et un point
// d'objet, par leurs cles. La geometrie est recalculee a chaque rendu, ce qui la rend toujours
// juste quand un objet bouge - c'est un choix du fichier d'origine, conserve tel quel.
//
// Consequence : ces fonctions ont besoin de la liste des objets. Elle est passee en parametre,
// comme partout depuis la phase 3, au lieu d'etre lue dans la fermeture.

import { au } from '../util/tableaux.js';
import { dist, centroid } from '../geometry/basic.js';
import { creerSvg } from './svg.js';
import { versEcran, type EtatScene } from '../geometry/vue.js';
import { SVG_MEASURE_LINE, SVG_MEASURE_TEXT, SVG_LABEL_HALO, aLaVirgule } from './theme.js';
import type { PtBrut, Mesure } from '../model/types.js';

/**
 * Ce qu'une cote a besoin de connaitre d'un objet : sa cle, et de quoi retrouver sa geometrie.
 *
 * C'est une exigence, pas un type de donnees : tout `ObjetPlan` en est un, et c'est ce qui permet de
 * poser une cote dans un test sans fabriquer un objet complet. Ce fichier declarait pour cela sa
 * propre interface **nommee `ObjetPlan`**, homonyme de celle du modele et differente d'elle — deux
 * verites sous un seul nom. Le nom dit maintenant ce qui est demande.
 */
export type ObjetCote = { key: string; type?: string | undefined; pts?: readonly PtBrut[] | undefined; center?: PtBrut | undefined };

export type { Mesure };

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
  objets: ObjetCote[],
  ref: { objKey: string; segIndex: number }
): { a: PtBrut; b: PtBrut } | null {
  const obj = objets.find((o) => o.key === ref.objKey);
  if (!obj || !obj.pts) return null;
  const n = obj.pts.length;
  return { a: au(obj.pts, ref.segIndex), b: au(obj.pts, (ref.segIndex + 1) % n) };
}

/** Le point designe : un sommet, ou le centre s'il s'agit d'un cercle. */
export function coordonneesPoint(
  objets: ObjetCote[],
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
export function geometrieMesure(objets: ObjetCote[], m: Mesure): GeometrieMesure | null {
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
    const a = au(poly, i),
      b = au(poly, (i + 1) % n);
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

/** Ce que le dessin des cotes doit connaitre, en plus du groupe SVG ou il ecrit. */
export interface ContexteCotes {
  scene: EtatScene;
  objets: ObjetCote[];
  mesures: (Mesure & { show?: boolean; displayMode?: string })[];
  /** Cote de reference en cours de designation, s'il y en a un. */
  brouillonRef: { objKey: string; segIndex: number } | null;
  /** Points deja designes pour la cote en cours. */
  brouillonCibles: { objKey: string; ptIndex: number }[];
}

/**
 * Dessine les cotes enregistrees, plus la cote en cours de saisie.
 *
 * Une cote se compose d'un trait de rappel partant du point mesure, perpendiculaire au cote de
 * reference, prolonge jusqu'a sortir du contour - et de sa valeur, posee au bout. `⊥` designe la
 * distance perpendiculaire, `→` la distance le long du cote : deux facons de decrire le meme
 * point, et l'utilisateur choisit celle qui parle a son artisan.
 */
export function dessinerCotes(groupe: SVGElement, ctx: ContexteCotes): void {
  groupe.innerHTML = '';
  // Le contour de la parcelle, s'il y en a une a sommets : les etiquettes des cotes s'ancrent hors de lui.
  const pcObj = ctx.objets.find(o=>o.key==='parcelle');
  const pc = pcObj && pcObj.pts ? { pts: pcObj.pts } : null;

  // draft (in-progress) picks: highlight ref segment and picked targets
  if(ctx.brouillonRef){
    const seg = coordonneesCote(ctx.objets, ctx.brouillonRef);
    if(seg){
      const pa=versEcran(ctx.scene, seg.a), pb=versEcran(ctx.scene, seg.b);
      const l = creerSvg('line');
      l.setAttribute('x1', String(pa.x)); l.setAttribute('y1', String(pa.y)); l.setAttribute('x2', String(pb.x)); l.setAttribute('y2', String(pb.y));
      l.setAttribute('stroke',SVG_MEASURE_LINE); l.setAttribute('stroke-width','4'); l.setAttribute('stroke-opacity','0.55');
      groupe.appendChild(l);
    }
  }
  ctx.brouillonCibles.forEach(t=>{
    const p = coordonneesPoint(ctx.objets, t);
    if(!p) return;
    const ps = versEcran(ctx.scene, p);
    const c = creerSvg('circle');
    c.setAttribute('cx', String(ps.x)); c.setAttribute('cy', String(ps.y)); c.setAttribute('r', String('9'));
    c.setAttribute('fill','none'); c.setAttribute('stroke',SVG_MEASURE_LINE); c.setAttribute('stroke-width','2.5');
    groupe.appendChild(c);
  });

  ctx.mesures.forEach(m=>{
    if(!m.show || !pc) return;
    const g = geometrieMesure(ctx.objets, m);
    if(!g) return;
    const anchor = ancrageHorsContour(g.p, pc.pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = versEcran(ctx.scene, g.p), pAnchor = versEcran(ctx.scene, anchor);

    // witness line starts at the measured point and heads toward the reference segment
    // (perpendicular to it), continuing just past it until clear of the parcel by 2m
    const l1 = creerSvg('line');
    l1.setAttribute('x1', String(pPt.x)); l1.setAttribute('y1', String(pPt.y));
    l1.setAttribute('x2', String(pAnchor.x)); l1.setAttribute('y2', String(pAnchor.y));
    l1.setAttribute('stroke',SVG_MEASURE_LINE); l1.setAttribute('stroke-width','1.4'); l1.setAttribute('stroke-dasharray','4 2.5');
    groupe.appendChild(l1);

    [pPt, pAnchor].forEach(p=>{
      const tick = creerSvg('circle');
      tick.setAttribute('cx', String(p.x)); tick.setAttribute('cy', String(p.y)); tick.setAttribute('r', String('2'));
      tick.setAttribute('fill',SVG_MEASURE_LINE);
      groupe.appendChild(tick);
    });

    const value = (m.displayMode==='along') ? g.along : g.perp;
    const prefix = (m.displayMode==='along') ? '→ ' : '⊥ ';
    const t = creerSvg('text');
    t.setAttribute('x', String(pAnchor.x)); t.setAttribute('y', String(pAnchor.y));
    t.setAttribute('text-anchor','middle');
    t.setAttribute('font-family','Helvetica Neue, Arial, sans-serif'); t.setAttribute('font-size','11');
    t.setAttribute('fill',SVG_MEASURE_TEXT); t.setAttribute('font-weight','700');
    t.setAttribute('paint-order','stroke'); t.setAttribute('stroke',SVG_LABEL_HALO); t.setAttribute('stroke-width','4');
    t.textContent = prefix + aLaVirgule(value.toFixed(2))+' m';
    groupe.appendChild(t);
  });

}
