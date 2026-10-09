// Le cote sur rue d'une parcelle, devine (MD/spec-cloture.md §2.1).
//
// Le plan sait deux choses qui disent ou est la rue : le point d'adresse de la BAN, pose sur la
// voirie devant la porte (l'import le range sur la parcelle, `cadastre.adresseLat/Lon`), et les
// parcelles voisines importees — un cote accole a une voisine est mitoyen, pas sur rue. Le point
// d'adresse l'emporte quand il est hors de la parcelle et pres d'elle ; sinon le plus long des
// cotes sans voisine. Sans aucune de ces informations, rien n'est devine (`null`).

import { projecteurLocal } from './projection.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointContour, longueurFrontiere } from '../geometry/proximite.js';
import { sommetDe } from '../geometry/anneau.js';
import { au } from '../util/tableaux.js';
import { aDesSommets } from '../model/formes.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/** Au-dela, le point d'adresse ne dit plus rien de la parcelle (adresse resolue a la rue, a la commune). */
export const DISTANCE_ADRESSE_MAX_M = 30;
/** Un cote dont plus de cette part longe une voisine est mitoyen. */
const PART_MITOYENNE = 0.5;
const TOLERANCE_FRONTIERE_M = 0.5;

/** Le point d'adresse dans le repere du plan, s'il est enregistre et que le plan est cale. */
export function pointAdresse(parcelle: ObjetPlan): PtBrut | null {
  const cad = parcelle.cadastre;
  if (!cad) return null;
  const { origineLat, origineLon, adresseLat, adresseLon } = cad as Record<string, unknown>;
  if (typeof origineLat !== 'number' || typeof origineLon !== 'number' || typeof adresseLat !== 'number' || typeof adresseLon !== 'number') return null;
  // L'origine du plan est le point de calage : le point d'adresse se projette depuis lui.
  return projecteurLocal(origineLat, origineLon).versMetres(adresseLon, adresseLat);
}

/** La distance d'un point a un cote du contour. */
function distanceAuCote(p: PtBrut, pts: readonly PtBrut[], i: number): number {
  return distancePointContour(p, [au(pts, i), sommetDe(pts, i + 1)]);
}

/** Les cotes de la parcelle qui ne longent aucune parcelle voisine du plan : vrai pour chacun, `null` sans voisine connue. */
export function cotesSansMitoyen(parcelle: ObjetPlan, objets: readonly ObjetPlan[]): boolean[] | null {
  if (!aDesSommets(parcelle)) return null;
  const pts = parcelle.pts;
  const voisines = objets.filter((o) => o !== parcelle && o.fonction === 'terrain' && !!o.cadastre?.idu && aDesSommets(o) && o.pts.length >= 3);
  if (!voisines.length) return null;
  return pts.map((a, i) => {
    const b = sommetDe(pts, i + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.05) return false;
    // `longueurFrontiere` parcourt les deux sens du segment : la longueur commune compte deux fois.
    const commune = Math.max(...voisines.map((v) => longueurFrontiere([a, b], (v as ObjetPlan & { pts: PtBrut[] }).pts, TOLERANCE_FRONTIERE_M))) / 2;
    return commune / L < PART_MITOYENNE;
  });
}

/**
 * Le cote sur rue devine : le plus pres du point d'adresse quand celui-ci est hors de la parcelle
 * et a moins de `DISTANCE_ADRESSE_MAX_M` ; sinon le plus long des cotes sans voisine accolee ;
 * `null` quand rien ne permet de deviner.
 */
export function coteRueDevine(parcelle: ObjetPlan, objets: readonly ObjetPlan[]): number | null {
  if (!aDesSommets(parcelle) || parcelle.pts.length < 3) return null;
  const pts = parcelle.pts;
  const adresse = pointAdresse(parcelle);
  if (adresse && !pointInPolygon(adresse, pts)) {
    let meilleur = -1, min = Infinity;
    pts.forEach((_, i) => { const d = distanceAuCote(adresse, pts, i); if (d < min) { min = d; meilleur = i; } });
    if (meilleur >= 0 && min <= DISTANCE_ADRESSE_MAX_M) return meilleur;
  }
  const libres = cotesSansMitoyen(parcelle, objets);
  if (!libres) return null;
  let meilleur = -1, max = 0;
  pts.forEach((a, i) => {
    if (!libres[i]) return;
    const b = sommetDe(pts, i + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > max) { max = L; meilleur = i; }
  });
  return meilleur >= 0 ? meilleur : null;
}
