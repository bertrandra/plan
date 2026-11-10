// Figer un cas (MD/spec-audit.md §9) : au moment ou un batiment est marque, ce que le calcul a lu
// (entrees) et ce qu'il en a fait (sorties). Les entrees suffisent a rejouer le calcul sans reseau,
// meme si l'IGN publie plus tard d'autres donnees : la grille LiDAR est relue a cet instant, comme le
// fait `village.mjs` pour le banc des toits.

import { estOuvrage, BATIMENT, TERRAIN } from '../../model/ouvrages/index.js';
import { centroid, pointInPolygon } from '../../geometry/basic.js';
import { aDesSommets } from '../../model/formes.js';
import { couleurMursRetenue } from '../../model/couleurMur.js';
import { grilleAuCentimetre, type EntreesCas, type SortiesCas } from '../../model/audit.js';
import type { GrilleRelief } from '../../model/relief.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

/** Les batiments a moins de cette distance sont gardes avec le cas : ce qui le touche ou le masque. */
export const DISTANCE_VOISINS_M = 5;

/** La plus petite distance entre deux contours, par leurs sommets (assez pour trier des voisins). */
function distanceContours(a: readonly PtBrut[], b: readonly PtBrut[]): number {
  let d = Infinity;
  for (const p of a) for (const q of b) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
  return d;
}

/** Ce que le code a produit pour ce batiment, tel quel. */
export function sortiesDe(o: ObjetPlan): SortiesCas {
  const murs = couleurMursRetenue(o);
  return {
    mode: 'entier',
    elevation: typeof o.elevation === 'number' ? o.elevation : null,
    toit: o.batiment?.toit ? JSON.parse(JSON.stringify(o.batiment?.toit)) : null,
    corps: o.batiment?.corpsToit ? JSON.parse(JSON.stringify(o.batiment?.corpsToit)) : null,
    toitMesure: o.batiment?.toitMesure ? JSON.parse(JSON.stringify(o.batiment?.toitMesure)) : null,
    couleurMurs: murs?.couleur ?? null,
    sourceMurs: murs?.source ?? null,
  };
}

/** Ce qu'il faut pour rejouer le calcul : le contour, la BD TOPO, la grille relue et les batiments proches. */
export function entreesDe(o: ObjetPlan, objets: readonly ObjetPlan[], grille: GrilleRelief | null): EntreesCas {
  const pts = aDesSommets(o) ? o.pts.map((p) => ({ x: p.x, y: p.y })) : [];
  const voisins = objets
    .filter((v) => v.key !== o.key && estOuvrage(v, BATIMENT) && aDesSommets(v) && distanceContours(pts, v.pts) <= DISTANCE_VOISINS_M)
    .map((v) => ({ cle: v.key, pts: (v as ObjetPlan & { pts: PtBrut[] }).pts.map((p) => ({ x: p.x, y: p.y })) }));
  return { pts, bdtopo: o.bdtopo ? JSON.parse(JSON.stringify(o.bdtopo)) : null, grille: grilleAuCentimetre(grille), voisins };
}

/** L'identite du batiment : son identifiant BD TOPO, et la parcelle sous son centre. */
export function identiteDe(o: ObjetPlan, objets: readonly ObjetPlan[]): { cleBdtopo: string | null; idu: string | null } {
  const b = o.bdtopo as { cleabs?: string | null; id?: string | null } | null | undefined;
  const c = aDesSommets(o) ? centroid(o.pts) : null;
  const parcelle = c ? objets.find((p) => estOuvrage(p, TERRAIN) && aDesSommets(p) && pointInPolygon(c, p.pts) && (p.cadastre as { idu?: string } | undefined)?.idu) : undefined;
  return { cleBdtopo: b?.cleabs ?? b?.id ?? null, idu: (parcelle?.cadastre as { idu?: string } | undefined)?.idu ?? null };
}
