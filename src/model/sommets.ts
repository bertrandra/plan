// Ajout et retrait de sommets sur une forme (spec §3.2, model/).
//
// Une forme ne porte pas seulement ses points : elle porte trois tableaux qui doivent rester
// exactement en phase avec eux - le nom de chaque coin, le nom de chaque cote, et l'etat gele de
// chaque coin. Un `splice` oublie sur l'un des trois decale tous les noms suivants, et le plan
// affiche alors « Coin 3 » sur le quatrieme coin sans que rien ne signale l'erreur.
//
// C'est la seule raison d'etre de ce module : faire la chirurgie des quatre tableaux au meme
// endroit, une fois, plutot qu'a chaque appel.

import { projectOntoSegment } from '../geometry/segments.js';
import type { PtBrut } from '../model/types.js';

export interface FormeASommets {
  type?: string;
  pts: PtBrut[];
  vertexNames: string[];
  segmentNames: string[];
  frozenVertices: boolean[];
}

/**
 * Combien de sommets une forme doit garder pour rester elle-meme : trois pour un polygone (en
 * dessous il n'a plus d'aire), deux pour un chemin ouvert (en dessous il n'a plus de direction).
 */
export function minimumSommets(type: string | undefined): number {
  return type === 'path' ? 2 : 3;
}

/**
 * Insere un sommet sur le cote `indexCote`, au point du cote le plus proche du clic.
 *
 * Le point n'est pas pose la ou on a clique mais **projete sur le cote** : un double-clic vise un
 * trait, et un sommet pose a cote du trait deformerait la forme au lieu de la subdiviser.
 */
export function insererSommet(forme: FormeASommets, indexCote: number, clicMonde: PtBrut): PtBrut {
  const n = forme.pts.length;
  const a = forme.pts[indexCote];
  const b = forme.pts[(indexCote + 1) % n];
  const point = projectOntoSegment(clicMonde, a, b);
  forme.pts.splice(indexCote + 1, 0, point);
  // Les noms par defaut suivent le NOUVEAU nombre de sommets, pas la position d'insertion : deux
  // insertions successives peuvent donc produire deux « Coin 5 ». C'est le comportement du fichier
  // d'origine, conserve tel quel (§10.3) - ces noms sont des suggestions editables, pas des cles.
  forme.vertexNames.splice(indexCote + 1, 0, 'Coin ' + forme.pts.length);
  forme.segmentNames.splice(indexCote + 1, 0, 'Cote ' + forme.pts.length);
  forme.frozenVertices.splice(indexCote + 1, 0, false);
  return point;
}

/**
 * Retire un sommet. Rend `false` - sans rien modifier - si la forme est deja au minimum.
 *
 * Les noms de cotes se comptent comme les points, mais le dernier cote d'un polygone referme la
 * boucle : quand on retire le dernier sommet, il n'y a pas de nom a la position demandee et c'est
 * le nom de fin qui saute.
 */
export function supprimerSommet(forme: FormeASommets, index: number): boolean {
  if (forme.pts.length <= minimumSommets(forme.type)) return false;
  forme.pts.splice(index, 1);
  forme.vertexNames.splice(index, 1);
  if (index < forme.segmentNames.length) forme.segmentNames.splice(index, 1);
  else forme.segmentNames.pop();
  forme.frozenVertices.splice(index, 1);
  return true;
}
