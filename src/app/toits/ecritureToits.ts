// Ce que la lecture des toits a le droit d'ecrire sur un batiment (model/protections.ts), et ce qu'elle reporte au lieu de
// l'ecrire : un morceau de app/toits/toitsLidar.ts, qui le reexporte.

import { corpsAvecCeQuIlsPortaient } from '../../facade/regles/toits/elementsVus.js';
import { peutEcrire, type BatimentProtege } from '../../model/protections.js';
import type { CorpsToit, PtBrut } from '../../model/types.js';

/** Ce que ce module lit d'un batiment : sa fonction, son contour, ce que lisent les protections. */
type ObjetAToit = BatimentProtege & { fonction?: string; pts?: PtBrut[] };

export { peutEcrire };

/** Un batiment dont Plan choisit le toit : pas de toit, ou un toit BD TOPO ou LiDAR. */
export function toitAAjuster<T extends ObjetAToit>(o: T): o is T & { pts: PtBrut[] } {
  if (o.fonction !== 'batiment' || !Array.isArray(o.pts) || o.pts.length < 3) return false;
  // « Règles » coupées, toit saisi ou lu sur une photo (model/protections.ts) : la lecture automatique ne le touche pas. Un
  // batiment verifie sur place reste eligible : la tache de fond lit sa copie pour la comparer (`admis` l'ecarte du plan).
  return peutEcrire(o, 'lidar', 'toit', { relireVerifies: true });
}

/**
 * Les corps neufs d'une lecture (LiDAR, fait du moteur) a la place des anciens. Ce qui est pose sur les corps (cheminees, lucarnes,
 * fenetres de toit, terrasse, appentis ouvert, saillies), la lecture ne l'ecrit jamais (model/protections.ts) : elle le reporte sur
 * les corps neufs, la ou il tient encore (facade/regles/toits/elementsVus.ts).
 */
export function corpsRelus(o: ObjetAToit, anciens: readonly CorpsToit[] | null | undefined, nouveaux: CorpsToit[] | null, ecrivain: 'lidar' | 'faits'): CorpsToit[] | null {
  return peutEcrire(o, ecrivain, 'elements') ? nouveaux : corpsAvecCeQuIlsPortaient(anciens, nouveaux);
}
