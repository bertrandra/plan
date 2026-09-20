// Glisser-deposer : deplacer une forme, un sommet, un cote, ou changer un rayon
// (spec §3.2, interaction/pointer.ts).
//
// Un principe traverse tout ce fichier : **on refuse plutot que de deformer**. Chaque geste
// calcule un candidat, le teste contre le contour de contrainte, et ne l'applique que s'il tient
// entierement dedans. Rien n'est tronque ni ramene au bord - un objet qui s'arreterait au contour
// en changeant de forme mentirait sur ce qu'on vient de dessiner.
//
// Le cablage des evenements (capture du pointeur, choix de la cible, appels a render) vit dans
// interaction/pointeur.ts : ici, seul le calcul.

import { pointInPolygon, dist } from '../geometry/basic.js';
import { estRectangle, rectangleDepuisCoin, rectangleDepuisCote } from '../geometry/rect.js';
import type { PtBrut } from '../model/types.js';

export interface FormeGlissable {
  type?: string;
  pts: PtBrut[];
  center?: PtBrut;
  r?: number;
  frozenVertices?: boolean[];
  constrained?: boolean;
}

/** Le geste en cours, tel que le `pointerdown` l'a enregistre. */
export interface GlisserEnCours {
  type: 'shapeMove' | 'circleMove' | 'point' | 'edge' | 'radius' | 'pan';
  obj: FormeGlissable;
  startWorld: PtBrut;
  startCenter?: PtBrut;
  startPts?: PtBrut[];
  startPt?: PtBrut;
  startA?: PtBrut;
  startB?: PtBrut;
  startR?: number;
  idx?: number;
  i?: number;
  j?: number;
  /** Passe a vrai des que le geste a produit un mouvement : distingue un glisser d'un simple clic. */
  moved?: boolean;
}

/**
 * Un cercle tient-il dans le contour ? Teste par 16 points de son bord.
 *
 * Un echantillonnage, donc, et non une vraie intersection cercle/polygone : sur une parcelle aux
 * cotes de plusieurs metres, seize points suffisent, et le cout est paye a chaque image d'un
 * glisser. C'est un choix du fichier d'origine, conserve tel quel.
 */
export function cercleTientDansContour(centre: PtBrut, r: number, contour: PtBrut[]): boolean {
  for (let a = 0; a < 16; a++) {
    const ang = ((a / 16) * 2 * Math.PI);
    const bord = { x: centre.x + r * Math.cos(ang), y: centre.y + r * Math.sin(ang) };
    if (!pointInPolygon(bord, contour)) return false;
  }
  return true;
}

/**
 * Position d'un sommet qu'on tire, en tenant compte des voisins geles.
 *
 * Deux voisins geles : aucun mouvement ne conserve les deux angles, on refuse (`null`).
 * Un seul voisin gele : le sommet ne peut plus que coulisser sur la direction d'origine depuis ce
 * coin, ce qui garde son angle intact. Sinon, le sommet suit librement le pointeur.
 */
export function sommetTire(obj: FormeGlissable, idx: number, depart: PtBrut, monde: PtBrut): PtBrut | null {
  if (obj.type !== 'polygon' || !obj.frozenVertices) return monde;
  const n = obj.pts.length;
  const precIdx = (idx - 1 + n) % n;
  const suivIdx = (idx + 1) % n;
  const precGele = obj.frozenVertices[precIdx];
  const suivGele = obj.frozenVertices[suivIdx];
  if (precGele && suivGele) return null;
  if (!precGele && !suivGele) return monde;

  const ancre = obj.pts[precGele ? precIdx : suivIdx]!;
  const dirOrig = { x: depart.x - ancre.x, y: depart.y - ancre.y };
  const longueur = Math.hypot(dirOrig.x, dirOrig.y) || 1e-9;
  const ux = dirOrig.x / longueur,
    uy = dirOrig.y / longueur;
  const rel = { x: monde.x - ancre.x, y: monde.y - ancre.y };
  // Distance signee le long de la direction figee, avec un minimum : un cote de longueur nulle
  // ferait disparaitre le sommet dans son voisin.
  const t = Math.max(0.05, rel.x * ux + rel.y * uy);
  return { x: ancre.x + ux * t, y: ancre.y + uy * t };
}

/**
 * Applique le geste en cours a l'objet, ou ne fait rien si le resultat sortirait du contour.
 *
 * Mutation assumee : c'est ce que faisait le fichier d'origine, et les elements SVG sont relus
 * depuis l'objet au rendu suivant. La rendre pure changerait le cycle de vie de tout le rendu.
 */
export function appliquerGlisser(drag: GlisserEnCours, monde: PtBrut, contour: PtBrut[] | null): void {
  const obj = drag.obj;
  const dx = monde.x - drag.startWorld.x;
  const dy = monde.y - drag.startWorld.y;
  const dansContour = (p: PtBrut) => !contour || pointInPolygon(p, contour);

  if (drag.type === 'circleMove') {
    drag.moved = true;
    const cand = { x: drag.startCenter!.x + dx, y: drag.startCenter!.y + dy };
    const ok = dansContour(cand) && (!contour || cercleTientDansContour(cand, obj.r!, contour));
    if (ok) obj.center = cand;
    return;
  }

  if (drag.type === 'point' && estRectangle(obj)) {
    // Tirer un coin redimensionne le rectangle : l'oppose reste fixe, les voisins suivent.
    const pts = rectangleDepuisCoin(obj.pts, drag.idx!, monde);
    if (pts && pts.every(dansContour)) obj.pts = pts;
    return;
  }

  if (drag.type === 'edge' && estRectangle(obj)) {
    const pts = rectangleDepuisCote(obj.pts, drag.i!, drag.j!, drag.startA!, dx, dy);
    if (pts && pts.every(dansContour)) obj.pts = pts;
    return;
  }

  if (drag.type === 'point') {
    const cand = sommetTire(obj, drag.idx!, drag.startPt!, monde);
    if (cand && dansContour(cand)) obj.pts[drag.idx!] = cand;
    return;
  }

  if (drag.type === 'edge') {
    const na = { x: drag.startA!.x + dx, y: drag.startA!.y + dy };
    const nb = { x: drag.startB!.x + dx, y: drag.startB!.y + dy };
    if (dansContour(na) && dansContour(nb)) {
      obj.pts[drag.i!] = na;
      obj.pts[drag.j!] = nb;
    }
    return;
  }

  if (drag.type === 'shapeMove') {
    drag.moved = true;
    const cand = drag.startPts!.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    if (cand.every(dansContour)) obj.pts = cand;
    return;
  }

  if (drag.type === 'radius') {
    // Rayon minimal : un cercle de rayon nul ne se rattrape plus a la souris.
    const nouveauR = Math.max(0.15, dist(obj.center!, monde));
    if (!contour || cercleTientDansContour(obj.center!, nouveauR, contour)) obj.r = nouveauR;
  }
}
