// Le MNH LiDAR HD de l'IGN sous un batiment : les hauteurs de sa couverture (MD/spec-toit-ign.md §10).
//
// Le modele numerique de hauteur (MNH = MNS − MNT) donne, tous les 50 cm, la hauteur du sursol
// au-dessus du sol. Sur l'emprise d'un batiment, c'est la hauteur de son toit, mesuree et non
// deduite de deux altitudes photogrammetriques a un metre pres. Il se lit comme le relief
// (geo/relief.ts) : le meme service WMS, le meme format BIL, la meme grille.
//
// On lit une petite grille par batiment plutot qu'une grande pour tout le plan : la plupart des
// batiments sont des maisons de quelques dizaines de metres, et une grille de tout le voisinage
// ferait des millions de cellules pour n'en utiliser que quelques pour cent.

import { urlGrille, urlDallesLidar, decoderBil, lireNombreMatched, requeteAvecReprise } from './relief.js';
import { pasPourEmprise, dimensionsGrille, cellulesDansPolygone } from '../model/relief.js';
import { distancePointContour } from '../geometry/proximite.js';
import type { Emprise } from '../model/relief.js';
import type { ProjecteurLocal } from './projection.js';
import type { PtBrut } from '../model/types.js';
import type { EchantillonHauteur } from '../facade/toitLidar.js';

/** La couche WMS du MNH LiDAR HD (verifiee au GetCapabilities de data.geopf.fr). */
export const COUCHE_MNH = 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93';
/** Le pas natif du MNH, en metres. */
export const PAS_MNH_M = 0.5;
/** La valeur « sans donnee » du MNH. */
export const SANS_DONNEE_MNH = -9999;
/** Retrait des murs, en metres : la rive, la gouttiere et l'ombre du mur ne sont pas la couverture. */
export const RETRAIT_MNH_M = 0.6;
/** Un batiment plus grand que cela de cellules est lu a un pas plus large (1, 2 ou 5 m). */
export const CELLULES_MAX_MNH = 10000;
/** Autour du contour, en metres : la cellule du bord est entiere. */
const MARGE_M = 1;

/** Ce qu'un lecteur de MNH fait : les hauteurs sous un contour du plan. Injectable pour les tests. */
export type LecteurMnh = (pts: readonly PtBrut[], proj: ProjecteurLocal) => Promise<EchantillonHauteur[]>;

function empriseDe(pts: readonly PtBrut[], marge: number): Emprise {
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return { xMin: Math.min(...xs) - marge, xMax: Math.max(...xs) + marge, yMin: Math.min(...ys) - marge, yMax: Math.max(...ys) + marge };
}

function enDegres(e: Emprise, proj: ProjecteurLocal) {
  const so = proj.versDegres(e.xMin, e.yMin),
    ne = proj.versDegres(e.xMax, e.yMax);
  return { lonMin: so.lon, latMin: so.lat, lonMax: ne.lon, latMax: ne.lat };
}

/** Y a-t-il des dalles LiDAR HD sur cette emprise du plan ? Une seule requete pour tout le plan. */
export async function dallesLidarSur(pts: readonly PtBrut[], proj: ProjecteurLocal, rechercher: typeof fetch = fetch): Promise<boolean> {
  if (pts.length < 2) return false;
  const xml = await requeteAvecReprise(urlDallesLidar(enDegres(empriseDe(pts, MARGE_M), proj)), (r) => r.text(), rechercher).catch(() => '');
  return lireNombreMatched(xml) > 0;
}

/**
 * Les hauteurs du MNH sous un contour, en retrait des murs (ou entier si le retrait ne laisse
 * rien : un abri etroit). Vide si le service ne repond pas ou n'a pas de donnee ici.
 */
export async function lireHauteursSous(pts: readonly PtBrut[], proj: ProjecteurLocal, rechercher: typeof fetch = fetch): Promise<EchantillonHauteur[]> {
  if (pts.length < 3) return [];
  const emprise = empriseDe(pts, MARGE_M);
  const pas = pasPourEmprise(PAS_MNH_M, emprise, CELLULES_MAX_MNH);
  if (pas === null) return [];
  const { x0, y0, nx, ny } = dimensionsGrille(emprise, pas);
  const bords: Emprise = { xMin: x0 - pas / 2, xMax: x0 + (nx - 0.5) * pas, yMin: y0 - (ny - 0.5) * pas, yMax: y0 + pas / 2 };
  let z: (number | null)[];
  try {
    const octets = await requeteAvecReprise(urlGrille(COUCHE_MNH, enDegres(bords, proj), nx, ny), (r) => r.arrayBuffer(), rechercher);
    z = decoderBil(octets, nx, ny, SANS_DONNEE_MNH);
  } catch {
    return [];
  }
  const cellules = cellulesDansPolygone({ pas, x0, y0, nx, ny, z }, pts).filter((c): c is typeof c & { z: number } => c.z !== null);
  const enRetrait = cellules.filter((c) => distancePointContour(c, pts) >= RETRAIT_MNH_M);
  return (enRetrait.length ? enRetrait : cellules).map((c) => ({ x: c.x, y: c.y, z: c.z }));
}
