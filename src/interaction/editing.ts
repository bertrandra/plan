// Edition d'une forme par ses cotes et ses angles (spec §3.2, interaction/editing.ts).
//
// Ces deux fonctions modifient l'objet en place et rendent `true` si le changement a ete accepte.
// Elles refusent au lieu de deformer dans deux cas, et c'est tout leur interet :
//
//   - un sommet gele ne bouge pas. Deux sommets geles sur un meme cote : rien ne peut bouger ;
//   - un objet contraint reste dans son contour. Le point candidat est calcule, teste, et rejete
//     s'il sort - jamais tronque, ce qui produirait une forme fausse sans le dire.
//
// Le contour de contrainte est passe en parametre : ces fonctions ne connaissent pas la parcelle,
// ni la liste des objets.

import { indiceValide, sommetDe } from '../geometry/anneau.js';
import { signedArea, pointInPolygon } from '../geometry/basic.js';
import type { PtBrut } from '../model/types.js';

export interface FormeEditable {
  pts: PtBrut[];
  frozenVertices?: boolean[];
  constrained?: boolean;
  key?: string;
}

/**
 * Le contour dans lequel un objet doit rester, ou `null` s'il est libre. Aujourd'hui c'est
 * toujours la parcelle : la regle vit ici pour que les editeurs n'aient pas a la connaitre.
 */
export function contourDeContrainte(
  objets: { key: string; pts?: PtBrut[] }[],
  obj: FormeEditable
): PtBrut[] | null {
  if (!obj.constrained) return null;
  const parcelle = objets.find((o) => o.key === 'parcelle');
  return parcelle && parcelle.pts ? parcelle.pts : null;
}

/**
 * Impose l'angle interieur au sommet `i`, en faisant pivoter le sommet suivant autour de lui.
 *
 * Le signe depend du sens de parcours : sur un polygone parcouru en sens horaire, le meme angle
 * demande fait tourner dans l'autre sens. C'est l'aire signee qui le dit - sonder la position des
 * voisins donnerait un resultat faux sur une forme concave.
 */
export function editerAngle(
  obj: FormeEditable,
  i: number,
  nouvelAngleDeg: number,
  contour: PtBrut[] | null
): boolean {
  // L'indice vient de l'inspecteur : un sommet qui n'existe pas ne s'edite pas.
  if (!indiceValide(obj.pts, i)) return false;
  const n = obj.pts.length;
  if (obj.frozenVertices && obj.frozenVertices[(i + 1) % n]) return false;
  const prec = sommetDe(obj.pts, i - 1),
    cur = sommetDe(obj.pts, i),
    suiv = sommetDe(obj.pts, i + 1);
  const u = { x: prec.x - cur.x, y: prec.y - cur.y };
  const v = { x: suiv.x - cur.x, y: suiv.y - cur.y };
  const L = Math.hypot(v.x, v.y);
  const angleU = Math.atan2(u.y, u.x);
  const sensTrigo = signedArea(obj.pts) > 0;
  const delta = ((sensTrigo ? -nouvelAngleDeg : nouvelAngleDeg) * Math.PI) / 180;
  const nouvelAngleV = angleU + delta;
  const candidat = { x: cur.x + L * Math.cos(nouvelAngleV), y: cur.y + L * Math.sin(nouvelAngleV) };
  if (!contour || pointInPolygon(candidat, contour)) {
    obj.pts[(i + 1) % n] = candidat;
    return true;
  }
  return false;
}

/**
 * Impose la longueur du cote `i`, en deplacant l'extremite libre le long de la direction actuelle.
 *
 * Quand la seconde extremite est gelee, c'est la premiere qui bouge : le cote garde sa direction
 * et atteint la longueur demandee, sans deplacer le sommet que l'utilisateur a verrouille.
 */
export function editerLongueur(
  obj: FormeEditable,
  i: number,
  nouvelleLongueur: number,
  contour: PtBrut[] | null
): boolean {
  if (!indiceValide(obj.pts, i)) return false;
  const n = obj.pts.length;
  const j = (i + 1) % n;
  const aGele = !!(obj.frozenVertices && obj.frozenVertices[i]);
  const bGele = !!(obj.frozenVertices && obj.frozenVertices[j]);
  if (aGele && bGele) return false; // les deux extremites verrouillees : rien ne peut bouger

  const a = sommetDe(obj.pts, i),
    b = sommetDe(obj.pts, j);

  if (bGele) {
    const dx = a.x - b.x,
      dy = a.y - b.y;
    const cur = Math.hypot(dx, dy) || 1;
    const candidat = { x: b.x + (dx / cur) * nouvelleLongueur, y: b.y + (dy / cur) * nouvelleLongueur };
    if (!contour || pointInPolygon(candidat, contour)) {
      obj.pts[i] = candidat;
      return true;
    }
    return false;
  }

  // Cas courant : on deplace b (y compris quand a est gele, b etant alors l'extremite libre).
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const cur = Math.hypot(dx, dy) || 1;
  const candidat = { x: a.x + (dx / cur) * nouvelleLongueur, y: a.y + (dy / cur) * nouvelleLongueur };
  if (!contour || pointInPolygon(candidat, contour)) {
    obj.pts[j] = candidat;
    return true;
  }
  return false;
}
