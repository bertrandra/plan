// Le releve de facade : le masque d'occlusion de la fusion de plusieurs vues (facade/fusion.ts, lot L13),
// hachure sur l'elevation de la verification (MD/spec-facades-calage-detection.md §8, lot G20). Ce qui
// reste cache sur toutes les photos (une voiture, une haie) n'est pas le mur : la texture y montre
// l'obstacle et la detection n'y cherche rien. Sans le hachure, la personne prendrait la carrosserie
// pour le mur et l'absence de baie pour un oubli de Plan.
//
// Sans React : le masque, pixel par pixel, devient quelques rectangles en fractions du mur, que
// l'elevation (Elevation.tsx) pose a l'echelle quelle que soit la hauteur corrigee ensuite.

import type { ResultatFusion } from '../../facade/fusion.js';

/** Un rectangle du masque, en fractions du mur : x depuis la gauche, y depuis l'egout (vers le bas). */
export interface ZoneMasque {
  x: number;
  y: number;
  l: number;
  h: number;
}

/** Ce que la verification garde du masque : ses zones, et la part du mur cachee sur toutes les vues. */
export interface MasqueReleve {
  zones: ZoneMasque[];
  part: number;
}

/**
 * Cote d'une cellule du hachure, en metres : 10 cm suffisent a suivre le contour d'une voiture, et
 * gardent le dessin a quelques dizaines de rectangles (le masque de la fusion est deja lu a 4 cm puis
 * elargi, son bord n'est pas plus fin).
 */
export const CELLULE_MASQUE_M = 0.1;

/**
 * Le masque d'occlusion en rectangles. Une cellule de `cellulePx` pixels est cachee si plus de la
 * moitie de ses pixels le sont ; chaque rangee de cellules donne ses plages, et les plages identiques
 * de rangees voisines se fondent en un seul rectangle.
 */
export function zonesDuMasque(masque: Uint8Array, largeurPx: number, hauteurPx: number, cellulePx: number): ZoneMasque[] {
  if (largeurPx <= 0 || hauteurPx <= 0 || masque.length < largeurPx * hauteurPx) return [];
  const c = Math.max(1, Math.round(cellulePx));
  const nx = Math.ceil(largeurPx / c),
    ny = Math.ceil(hauteurPx / c);
  const cachee = (ci: number, cj: number): boolean => {
    let n = 0,
      t = 0;
    for (let y = cj * c; y < Math.min(hauteurPx, (cj + 1) * c); y++)
      for (let x = ci * c; x < Math.min(largeurPx, (ci + 1) * c); x++) {
        t++;
        n += masque[y * largeurPx + x] ? 1 : 0;
      }
    return n * 2 > t;
  };
  const zones: ZoneMasque[] = [];
  // Les rectangles encore ouverts, par plage [debut, fin) de cellules : ils s'allongent vers le bas.
  let ouverts = new Map<string, { i0: number; i1: number; j0: number }>();
  const fermer = (o: { i0: number; i1: number; j0: number }, j1: number) => {
    const y1 = Math.min(hauteurPx, j1 * c);
    zones.push({ x: (o.i0 * c) / largeurPx, y: (o.j0 * c) / hauteurPx, l: (Math.min(largeurPx, o.i1 * c) - o.i0 * c) / largeurPx, h: (y1 - o.j0 * c) / hauteurPx });
  };
  for (let j = 0; j < ny; j++) {
    const suivants = new Map<string, { i0: number; i1: number; j0: number }>();
    let i = 0;
    while (i < nx) {
      if (!cachee(i, j)) { i++; continue; }
      const i0 = i;
      while (i < nx && cachee(i, j)) i++;
      const cle = i0 + ':' + i;
      const o = ouverts.get(cle);
      suivants.set(cle, o ?? { i0, i1: i, j0: j });
      ouverts.delete(cle);
    }
    for (const o of ouverts.values()) fermer(o, j);
    ouverts = suivants;
  }
  for (const o of ouverts.values()) fermer(o, ny);
  return zones;
}

/**
 * Le masque d'une fusion pour la verification, `null` s'il est vide (une photo seule, des morceaux
 * cote a cote, ou des vues qui se completent partout). Le masque couvre le mur seul, exactement
 * comme l'elevation analysee : meme largeur, meme hauteur.
 */
export function masqueDeFusion(f: Pick<ResultatFusion, 'occlusion' | 'masque' | 'elevation'> | null, largeurM: number): MasqueReleve | null {
  if (!f || !(f.masque > 0) || !(largeurM > 0)) return null;
  const { largeur, hauteur } = f.elevation;
  const zones = zonesDuMasque(f.occlusion, largeur, hauteur, (largeur / largeurM) * CELLULE_MASQUE_M);
  return zones.length ? { zones, part: f.masque } : null;
}
