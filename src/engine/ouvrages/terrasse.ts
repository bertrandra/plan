// Ce que la terrasse publie : ce que les autres ouvrages et les autres couches ont le droit d'en lire (MD/spec-ouvrages.md,
// etape 6.6). Le reste du moteur de la terrasse (structure, couches, debit, nomenclature) lui est interne.
//
// Sa forme trouee et sa surface nette sont lues par le plan, la 3D, les exports, l'explorateur et l'inspecteur : elles se
// definissent ici, et une terrasse ne connait ses trous que par le lien « percer » (engine/ouvrages/liens.ts).

import { pointInPolygon, shoelace } from '../../geometry/basic.js';
import { differencePolygones, type PolygoneTroue } from '../../geometry/difference.js';
import { aireCommune } from '../../geometry/polygon.js';
import { estTerrasse } from '../../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { objetsQuiPercent } from './liens.js';

export { constructionTerrasseNeuve } from '../construction.js';
export { hauteurStructureMm } from '../hauteurs.js';
/** Comment une piece de la structure s'arrete a une ouverture : la plage en bois d'une piscine se dessine avec la meme regle. */
export { retirerOuvertures } from '../structure.js';

/**
 * La surface d'une terrasse, ses ouvertures (bassins, trous) retirees : celle qu'on platelage, qu'on
 * visse et qu'on declare. Sans ouverture, la surface du contour, au bit pres.
 */
export function surfaceNetteTerrasse(poly: PtBrut[], objets: ObjetPlan[]): number {
  return shoelace(poly) - objetsQuiPercent(poly, objets).reduce((s, x) => s + aireCommune(x.contour, poly), 0);
}

/**
 * Les trous d'une terrasse : le bord exterieur des margelles d'un bassin, le contour d'un trou de
 * terrasse — tout entiers dedans ou a cheval sur son bord. Le plan, le SVG et le PDF les decoupent
 * de la terrasse par un gabarit ; la 3D et le DXF, qui ont besoin de la forme, la tirent de
 * `formeDeTerrasse`. Vide pour tout autre objet.
 */
export function trousDeTerrasse(o: ObjetPlan, objets: ObjetPlan[]): PtBrut[][] {
  if(!estTerrasse(o) || o.type !== 'polygon') return [];
  return objetsQuiPercent(o.pts, objets).map(x => x.contour);
}

/**
 * La forme vraie d'une terrasse percee : ses morceaux, chacun avec les trous qui le percent sans
 * toucher son bord. Un bassin a cheval sur le bord y fait une encoche. `null` quand aucun trou ne
 * chevauche le bord : le contour d'origine et ses trous interieurs suffisent alors, tels quels.
 */
export function formeDeTerrasse(o: ObjetPlan, objets: ObjetPlan[]): PolygoneTroue[] | null {
  if(o.type !== 'polygon') return null;
  const trous = trousDeTerrasse(o, objets);
  if(trous.every(t => t.every(p => pointInPolygon(p, o.pts)))) return null;
  return differencePolygones(o.pts, trous);
}
