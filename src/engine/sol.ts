// Le sol sous un ouvrage : ce que le moteur lit du relief (MD/spec-relief.md §6, engine/).
//
// Le moteur ne connait pas la grille : il recoit un `Sol`, une fonction qui dit la hauteur du
// terrain naturel en un point, au-dessus du zero du plan (`zRef`). Sans relief, `null` : tout se
// calcule comme avant, sur un terrain plat, et aucun nombre d'un projet sans relief ne bouge.
//
// La regle d'un ouvrage pose sur un sol en pente est toujours la meme : sa reference est le point
// le plus HAUT du sol sous son emprise. La hauteur reglee (plot, poteau, bord de bassin) vaut la ;
// ailleurs, l'appui est plus long d'autant que le sol descend. C'est ce qui fait une terrasse de
// niveau, et ce qui fait que les plots d'aval s'achetent plus grands.

import { centroid, pointInPolygon } from '../geometry/basic.js';
import { cellulesDansPolygone, reliefDe, zLocal } from '../model/relief.js';
import type { ObjetPlan, PtBrut, Relief } from '../model/types.js';

export interface Sol {
  /** La hauteur du terrain naturel au point, au-dessus du zero du plan ; `null` hors de la grille. */
  z: (p: PtBrut) => number | null;
  relief: Relief;
}

/** Le sol d'un relief lu. */
export function solDuRelief(relief: Relief): Sol {
  return { z: (p) => zLocal(relief, p.x, p.y), relief };
}

/** Le sol du projet : celui de la parcelle, si son relief a ete lu ; sinon `null`, le plan est plat. */
export function solDuProjet(objets: readonly ObjetPlan[] | null | undefined): Sol | null {
  const r = objets ? reliefDe(objets) : null;
  return r ? solDuRelief(r) : null;
}

/** Le sol sous une emprise : son point le plus haut et le plus bas, au-dessus du zero du plan. */
export interface SolSousEmprise {
  zHaut: number;
  zBas: number;
  /** Le sol au centre de l'emprise, ou le plus haut a defaut. */
  zCentre: number;
}

/**
 * Le haut et le bas du sol sous un contour : lu aux sommets, au centre et dans chaque cellule de la
 * grille que le contour contient. `null` si rien n'est connu (contour hors de la grille).
 */
export function solSousEmprise(sol: Sol | null | undefined, contour: readonly PtBrut[]): SolSousEmprise | null {
  if (!sol || contour.length < 3) return null;
  const zs: number[] = [];
  contour.forEach(p => { const z = sol.z(p); if (z !== null) zs.push(z); });
  cellulesDansPolygone(sol.relief, contour).forEach(c => { if (c.z !== null) zs.push(c.z - sol.relief.zRef); });
  // Le centre, pour une petite emprise qui ne contient aucune cellule.
  const centre = centroid(contour);
  const zc = pointInPolygon(centre, contour) ? sol.z(centre) : null;
  if (zc !== null) zs.push(zc);
  if (!zs.length) return null;
  const zHaut = Math.max(...zs), zBas = Math.min(...zs);
  return { zHaut, zBas, zCentre: zc ?? zHaut };
}

/** Le point le plus haut du sol sous une emprise, ou 0 sans sol : la reference d'un ouvrage de niveau. */
export function zReferenceOuvrage(sol: Sol | null | undefined, contour: readonly PtBrut[]): number {
  return solSousEmprise(sol, contour)?.zHaut ?? 0;
}

/**
 * La hauteur d'un ouvrage au sens des reglements d'urbanisme : du terrain naturel au point le plus
 * BAS sous son emprise jusqu'a son point le plus haut. Sans sol, c'est la hauteur de l'ouvrage.
 */
export function hauteurDepuisTerrainNaturel(sol: Sol | null | undefined, contour: readonly PtBrut[], zSommet: number): number {
  const s = solSousEmprise(sol, contour);
  return zSommet - (s ? s.zBas : 0);
}
