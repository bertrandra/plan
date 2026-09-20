// Alignement d'une forme sur un cote de reference (spec §3.2, geometry/).
//
// Aligner, c'est faire tourner la forme jusqu'a ce que l'un de ses cotes soit parallele a un cote
// designe ailleurs sur le plan - typiquement une limite de parcelle - puis, si on le demande, la
// poser a une distance donnee de cette limite. C'est le geste qui sert a placer un abri « a 3 m de
// la cloture, dans son alignement ».
//
// Le module ne fait que le calcul : il rend de nouveaux points, sans toucher a la forme ni decider
// si le resultat est acceptable. La verification du contour et l'historique restent a l'appelant.

import { angleOfSegment } from './segments.js';
import type { PtBrut } from '../model/types.js';

export interface CoteCible {
  a: PtBrut;
  b: PtBrut;
}

/**
 * Angle de rotation pour rendre le cote (a,b) parallele a la cible, replie dans [-90°, +90°].
 *
 * Le repli est la decision qui compte : un cote s'aligne sur une **droite**, pas sur une direction.
 * Tourner de 170° pour aligner ce qu'une rotation de -10° aligne aussi bien retournerait l'objet
 * bout pour bout - un abri se retrouverait porte au fond. On prend donc toujours le plus petit des
 * deux mouvements possibles.
 */
export function rotationDAlignement(a: PtBrut, b: PtBrut, cible: CoteCible): number {
  const angleActuel = angleOfSegment(a, b);
  const angleCible = angleOfSegment(cible.a, cible.b);
  // atan2(sin, cos) ramene l'ecart dans [-180°, +180°] sans se soucier des tours complets.
  let diff = Math.atan2(Math.sin(angleCible - angleActuel), Math.cos(angleCible - angleActuel));
  if (diff > Math.PI / 2) diff -= Math.PI;
  else if (diff < -Math.PI / 2) diff += Math.PI;
  return diff;
}

/** Fait tourner des points d'un angle donne autour d'un pivot. */
export function tourner(pts: readonly PtBrut[], pivot: PtBrut, angle: number): PtBrut[] {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return pts.map((p) => {
    const dx = p.x - pivot.x,
      dy = p.y - pivot.y;
    return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
  });
}

/**
 * Aligne la forme en faisant tourner son cote `indexCote` parallelement a `cible`, puis - si
 * `distance` est fournie - la translate pour poser ce cote a cette distance de la droite cible.
 *
 * Le pivot est le milieu du cote aligne : c'est lui qui bouge le moins, le reste de la forme tourne
 * autour. Choisir le centre de la forme ferait glisser le cote qu'on cherchait justement a caler.
 *
 * La translation garde la forme **du cote ou elle est deja** : une distance est un ecart, pas une
 * position, et traverser la limite pour respecter un « 3 m » serait le contraire de ce qu'on
 * demande.
 *
 * La distance se mesure depuis le cote aligne, pas depuis la forme entiere : un carre de 4 m pose a
 * 3 m d'une limite la depasse donc de 1 m par son cote oppose. C'est bien ce qu'on demande - « ce
 * cote-la, a 3 m » - et c'est a l'appelant de refuser le resultat s'il sort du contour.
 */
export function alignerSurCote(
  pts: readonly PtBrut[],
  indexCote: number,
  cible: CoteCible,
  distance: number | null = null
): PtBrut[] {
  const n = pts.length;
  const a = pts[indexCote]!,
    b = pts[(indexCote + 1) % n]!;
  const pivot = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tournes = tourner(pts, pivot, rotationDAlignement(a, b, cible));
  if (distance === null || !(distance >= 0)) return tournes;

  const ux = cible.b.x - cible.a.x,
    uy = cible.b.y - cible.a.y;
  const L = Math.hypot(ux, uy) || 1e-9;
  // Normale unitaire a la droite cible.
  const nx = -uy / L,
    ny = ux / L;
  const distanceSignee = (pivot.x - cible.a.x) * nx + (pivot.y - cible.a.y) * ny;
  const sens = distanceSignee >= 0 ? 1 : -1;
  const delta = sens * distance - distanceSignee;
  return tournes.map((p) => ({ x: p.x + nx * delta, y: p.y + ny * delta }));
}
