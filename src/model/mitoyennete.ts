// Les parcelles mitoyennes de celle du projet, et leurs batiments (MD/spec-toit-ign.md §13.6).
//
// Ce sont les maisons qu'on voit de pres depuis le jardin : elles recoivent le calcul entier des
// toits (app/toitsLidar.ts), et la Vue 3D les cadre par defaut (three/scene.ts) ; le reste du
// voisinage importe se voit en reculant.

import { centroid, pointInPolygon } from '../geometry/basic.js';
import { longueurFrontiere } from '../geometry/proximite.js';
import { surParcelleDuProjet } from './fonctions.js';
import type { PtBrut } from './types.js';

/** Une parcelle est mitoyenne quand elle partage au moins cela de limite avec celle du projet… */
export const FRONTIERE_MITOYENNE_M = 1;
/** … a cela pres : deux traces du cadastre ne tombent pas exactement l'un sur l'autre. */
const TOLERANCE_FRONTIERE_M = 0.5;

/** Ce que le calcul lit d'un objet du plan. */
export interface ObjetMitoyen {
  key?: string;
  fonction?: string;
  pts?: readonly PtBrut[] | undefined;
  bdtopo?: unknown;
  voisinage?: boolean;
}

const contour = (o: ObjetMitoyen): readonly PtBrut[] | null => (Array.isArray(o.pts) && o.pts.length >= 3 ? o.pts : null);

/** Les parcelles (fonction terrain) qui touchent celle du projet. */
export function parcellesMitoyennes<T extends ObjetMitoyen>(objets: readonly T[]): T[] {
  const projet = objets.find((o) => o.key === 'parcelle');
  const limite = projet ? contour(projet) : null;
  if (!limite) return [];
  return objets.filter((o) => {
    const pts = o !== projet && o.fonction === 'terrain' ? contour(o) : null;
    return !!pts && longueurFrontiere(pts, limite, TOLERANCE_FRONTIERE_M) >= FRONTIERE_MITOYENNE_M;
  });
}

/** Les batiments voisins poses sur une parcelle mitoyenne (leur centroide y tombe). */
export function batimentsMitoyens<T extends ObjetMitoyen>(objets: readonly T[], mitoyennes: readonly T[] = parcellesMitoyennes(objets)): Set<T> {
  const out = new Set<T>();
  for (const b of objets) {
    const pts = b.fonction === 'batiment' && !surParcelleDuProjet(b) ? contour(b) : null;
    if (!pts) continue;
    const c = centroid(pts as PtBrut[]);
    if (mitoyennes.some((m) => pointInPolygon(c, m.pts as PtBrut[]))) out.add(b);
  }
  return out;
}

/**
 * Le voisinage proche : tout ce qui n'est pas arrive avec le voisinage importe, plus les parcelles
 * mitoyennes et leurs batiments. Ce que la Vue 3D cadre par defaut.
 */
export function procheDuProjet<T extends ObjetMitoyen>(objets: readonly T[]): (o: T) => boolean {
  const mitoyennes = parcellesMitoyennes(objets);
  const proches = new Set<T>([...mitoyennes, ...batimentsMitoyens(objets, mitoyennes)]);
  return (o) => !o.voisinage || proches.has(o);
}
