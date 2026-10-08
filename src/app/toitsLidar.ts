// Les toits ajustes sur le LiDAR HD, apres un import ou une actualisation (MD/spec-toit-ign.md §10).
//
// Pour chaque batiment dont le toit vient de la BD TOPO (ou d'une lecture LiDAR anterieure), on lit
// le MNH sous son contour (geo/mnh.ts) et l'on y ajuste une forme (facade/toitLidar.ts). Un toit
// lu sur une photo ou saisi n'est pas touche. Les plus proches de la parcelle du projet d'abord,
// dans un delai borne : l'import ne doit pas attendre le service pour un voisinage de deux mille
// batiments, et ceux qu'on regarde de pres sont ceux qui comptent.

import { ajusterToit } from '../facade/toitLidar.js';
import { lireHauteursSous, dallesLidarSur, type LecteurMnh } from '../geo/mnh.js';
import { centroid } from '../geometry/basic.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { PtBrut, Toit } from '../model/types.js';

/** Ce que l'etape lit et ecrit d'un objet du plan : un batiment a contour, son toit, sa hauteur a l'egout. */
export interface ObjetAToit {
  key?: string;
  fonction?: string;
  pts?: PtBrut[];
  toit?: Toit | null;
  elevation?: number;
}

/** Ce que la lecture a fait, pour le bilan. */
export interface BilanToitsLidar {
  /** Toits dont la forme a ete ajustee sur le LiDAR (plats compris). */
  ajustes: number;
  /** Batiments lus dont aucune forme simple n'explique les mesures : toit BD TOPO garde. */
  gardes: number;
  /** Pas de dalle LiDAR HD ici : rien n'a ete lu. */
  sansLidar: boolean;
}

export interface OptionsToitsLidar {
  /** Au-dela, on renonce aux batiments restants. */
  delaiMs?: number;
  /** Combien de batiments au plus, les plus proches du projet. */
  maxBatiments?: number;
  lire?: LecteurMnh;
  dalles?: (pts: readonly PtBrut[], proj: ProjecteurLocal) => Promise<boolean>;
  /** L'horloge, pour le delai. */
  maintenant?: () => number;
}

/** Le delai donne a la lecture des toits, comme a celle des couleurs sur l'orthophoto. */
export const DELAI_TOITS_LIDAR_MS = 20000;
/** Le voisinage etendu peut compter deux mille batiments : seuls les plus proches sont lus. */
export const MAX_BATIMENTS_LIDAR = 150;
/** Combien de lectures en meme temps : de petites grilles, le service repond vite. */
const EN_PARALLELE = 4;
/** En deca, l'egout mesure ne vaut pas de changer la hauteur BD TOPO ; au-dela de ces bornes, la mesure n'est pas un egout. */
const ECART_EGOUT_MIN_M = 0.3;
const EGOUT_MIN_M = 2;
const EGOUT_MAX_M = 40;

/** Un batiment dont Plan choisit le toit : pas de toit, ou un toit BD TOPO ou LiDAR. */
export function toitAAjuster(o: ObjetAToit): o is ObjetAToit & { pts: PtBrut[] } {
  if (o.fonction !== 'batiment' || !Array.isArray(o.pts) || o.pts.length < 3) return false;
  const s = o.toit?.source;
  return !o.toit || s === 'bdtopo' || s === 'lidar';
}

/** Le centre de la parcelle du projet, ou de tout ce qui a des sommets. */
function centreDuProjet(objets: readonly ObjetAToit[]): PtBrut {
  const parcelle = objets.find((o) => o.key === 'parcelle') ?? objets.find((o) => o.fonction === 'terrain');
  const pts = parcelle?.pts?.length ? parcelle.pts : objets.flatMap((o) => o.pts ?? []);
  return pts.length ? centroid(pts) : { x: 0, y: 0 };
}

/**
 * Pose sur chaque batiment eligible le toit que le LiDAR HD mesure, en gardant la couleur de
 * couverture en place ; corrige la hauteur a l'egout quand la mesure s'en ecarte franchement.
 * Modifie les objets en place. Un service muet ne bloque rien : les toits BD TOPO restent.
 */
export async function toitsDepuisLidar(objets: readonly ObjetAToit[], proj: ProjecteurLocal, options: OptionsToitsLidar = {}): Promise<BilanToitsLidar> {
  const bilan: BilanToitsLidar = { ajustes: 0, gardes: 0, sansLidar: false };
  const maintenant = options.maintenant ?? Date.now;
  const fin = maintenant() + (options.delaiMs ?? DELAI_TOITS_LIDAR_MS);
  const centre = centreDuProjet(objets);
  const candidats = objets
    .filter(toitAAjuster)
    .map((o) => ({ o, d: Math.hypot(centroid(o.pts).x - centre.x, centroid(o.pts).y - centre.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, options.maxBatiments ?? MAX_BATIMENTS_LIDAR)
    .map((c) => c.o);
  if (!candidats.length) return bilan;
  if (!(await (options.dalles ?? dallesLidarSur)(candidats.flatMap((o) => o.pts), proj))) {
    bilan.sansLidar = true;
    return bilan;
  }
  const lire = options.lire ?? lireHauteursSous;
  let suivant = 0;
  const ouvrier = async (): Promise<void> => {
    while (suivant < candidats.length && maintenant() < fin) {
      const o = candidats[suivant++];
      if (!o) break;
      const ech = await lire(o.pts, proj).catch(() => []);
      if (!ech.length) continue;
      const ajuste = ajusterToit(o.pts, ech);
      if (!ajuste) { bilan.gardes++; continue; }
      const ancien = o.toit;
      o.toit = { ...ajuste.toit, ...(ancien?.couleur ? { couleur: ancien.couleur } : {}), ...(ancien?.origineCouleur ? { origineCouleur: ancien.origineCouleur } : {}) };
      const h = o.elevation ?? 0;
      if (ajuste.egout >= EGOUT_MIN_M && ajuste.egout <= EGOUT_MAX_M && Math.abs(ajuste.egout - h) >= ECART_EGOUT_MIN_M) o.elevation = Math.round(ajuste.egout * 10) / 10;
      bilan.ajustes++;
    }
  };
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier));
  return bilan;
}

/** La phrase du bilan, ou `null` s'il n'y a rien a dire. */
export function texteBilanToitsLidar(b: BilanToitsLidar): string | null {
  if (b.sansLidar) return null;
  if (!b.ajustes && !b.gardes) return null;
  return b.ajustes + ' toit(s) ajuste(s) sur le LiDAR HD' + (b.gardes ? ', ' + b.gardes + ' garde(s) tel(s) quel(s) (forme trop complexe)' : '');
}
