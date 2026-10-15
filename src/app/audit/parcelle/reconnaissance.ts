// La facade devant vous, pendant l'audit de la parcelle (MD/spec-audit.md §6.1, §12.2) : la
// reconnaissance du lot L2 (facade/priseDeVue.ts), restreinte aux facades de la liste de controle,
// avec « Ce n'est pas cette façade » qui propose la suivante.
//
// Pur : position, cap et batiments en entree, la facade retenue en sortie.

import { obstacle, type Obstacle } from '../../../geometry/ligneDeVue.js';
import { ecartAuCap, facadesDevant, TOLERANCE_CAP_DEG, type FacadeDevant, type FacadesDUnBatiment } from '../../../facade/priseDeVue.js';
import { aDesSommets } from '../../../model/formes.js';
import { estBatiment } from '../../../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';

/** La cle d'une facade, pour la mettre de cote : le batiment et le rang de son cote. */
export const cleFacade = (cle: string, cote: number): string => cle + '#' + cote;

/**
 * Les facades devant lesquelles on se tient, dans l'ordre ou on les propose : celles que la
 * boussole designe (a la tolerance pres), de la plus proche de l'axe a la plus loin ; puis les
 * autres que l'on voit, de la plus proche a la plus lointaine. Sans cap, par distance.
 */
export function facadesProposees(pos: PtBrut, cap: number | null, batiments: readonly FacadesDUnBatiment[], obstacles: readonly Obstacle[]): FacadeDevant[] {
  const vues = facadesDevant(pos, batiments, obstacles);
  if (cap === null) return vues;
  const avecEcart = vues.map((v) => ({ ...v, ecartCap: ecartAuCap(pos, v.facade, cap) }));
  const dansAxe = avecEcart.filter((v) => v.ecartCap <= TOLERANCE_CAP_DEG).sort((a, b) => a.ecartCap - b.ecartCap || a.distance - b.distance);
  const autres = avecEcart.filter((v) => v.ecartCap > TOLERANCE_CAP_DEG);
  return [...dansAxe, ...autres];
}

/** La premiere facade proposee qui n'a pas ete ecartee ; null quand toutes l'ont ete. */
export function facadeRetenue(proposees: readonly FacadeDevant[], ecartees: ReadonlySet<string>): FacadeDevant | null {
  return proposees.find((v) => !ecartees.has(cleFacade(v.cle, v.facade.cote))) ?? null;
}

/** Au-dela, un batiment ne peut ni etre devant vous, ni cacher un mur qui l'est. */
const RAYON_M = 70;

/**
 * Ce que la reconnaissance regarde : les facades des batiments de la parcelle du projet qui se
 * photographient (ni mitoyennes, ni inaccessibles), et tous les batiments proches comme obstacles a
 * la vue : les maisons voisines n'ont plus de facade a proposer (elles ne sont plus dans la liste),
 * mais elles cachent toujours un mur. `verrou` : le batiment que la personne a verrouille pour la
 * prise (une annexe a cote de la maison) ; lui seul est alors propose.
 */
export function entreesReconnaissance(objets: readonly ObjetPlan[], lignes: readonly LigneBatiment[], pos: PtBrut, verrou: string | null = null): { batiments: FacadesDUnBatiment[]; obstacles: Obstacle[] } {
  const r = RAYON_M;
  const obstacles = objets.filter((o): o is ObjetPlan & { pts: PtBrut[] } => estBatiment(o) && aDesSommets(o))
    .map((o) => obstacle(o.pts))
    .filter((e) => e.x1 > pos.x - r && e.x0 < pos.x + r && e.y1 > pos.y - r && e.y0 < pos.y + r);
  const batiments = lignes.filter((b) => verrou === null || b.cle === verrou).map((b) => ({ cle: b.cle, facades: b.facades.filter((f) => f.statut !== 'mitoyenne' && f.statut !== 'inaccessible').map((f) => f.facade) }))
    .filter((b) => b.facades.length > 0);
  return { batiments, obstacles };
}
