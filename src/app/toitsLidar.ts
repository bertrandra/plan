// Les toits ajustes sur le LiDAR HD, apres un import ou une actualisation (MD/spec-toit-ign.md §10).
//
// Pour chaque batiment dont le toit vient de la BD TOPO (ou d'une lecture LiDAR anterieure), on lit
// le MNH sous son contour (geo/mnh.ts) et l'on y ajuste une forme (facade/toitLidar.ts). Un toit
// lu sur une photo ou saisi n'est pas touche. Les plus proches de la parcelle du projet d'abord,
// dans un delai borne : l'import ne doit pas attendre le service pour un voisinage de deux mille
// batiments, et ceux qu'on regarde de pres sont ceux qui comptent.

import { ajusterToit, type EchantillonHauteur } from '../facade/toitLidar.js';
import { lireHauteursSous, lireGrilleSous, echantillonsDeGrille, dallesLidarSur, type LecteurMnh, type LecteurGrilleMnh } from '../geo/mnh.js';
import { centroid, pointInPolygon } from '../geometry/basic.js';
import { decomposerEnRectangles, penteDuToit, toitDuRectangle } from '../model/volumesToit.js';
import { PENTE_DEFAUT_DEG } from '../model/toitBdTopo.js';
import { toitMesureDepuisGrille, egoutDansRect } from '../model/toitMesure.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { GrilleRelief } from '../model/relief.js';
import type { PtBrut, Toit, ToitMesure, VolumeToit } from '../model/types.js';

/** Ce que l'etape lit et ecrit d'un objet du plan : un batiment a contour, son toit, sa hauteur a l'egout. */
export interface ObjetAToit {
  key?: string;
  fonction?: string;
  pts?: PtBrut[];
  toit?: Toit | null;
  elevation?: number;
  /** Les attributs BD TOPO : `surParcellePrincipale` dit si le batiment est celui du projet. */
  bdtopo?: unknown;
  /** Le toit en plusieurs volumes (model/volumesToit.ts), pour un batiment de la parcelle du projet. */
  volumesToit?: VolumeToit[] | null;
  /** Le toit tel que le LiDAR le mesure (model/toitMesure.ts), pour un batiment de la parcelle du projet. */
  toitMesure?: ToitMesure | null;
}

/** Un batiment de la parcelle du projet : le seul dont le toit se mesure corps par corps. */
export function surParcellePrincipale(o: ObjetAToit): boolean {
  return (o.bdtopo as { surParcellePrincipale?: unknown } | null | undefined)?.surParcellePrincipale === true;
}

/** Ce que la lecture a fait, pour le bilan. */
export interface BilanToitsLidar {
  /** Toits dont la forme a ete ajustee sur le LiDAR (plats compris). */
  ajustes: number;
  /** Toits de la parcelle du projet gardes tels que mesures, en surface (MD/spec-toit-ign.md §12). */
  mesures: number;
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
  /** La grille entiere, pour le toit mesure d'un batiment de la parcelle du projet ; `lire` donne, absente, et sinon la grille du service. */
  lireGrille?: LecteurGrilleMnh;
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

/** L'egout mesure vaut d'etre ecrit : entre les bornes d'un egout. */
const egoutValide = (e: number) => e >= EGOUT_MIN_M && e <= EGOUT_MAX_M;

/**
 * Le toit d'un batiment de la parcelle du projet, corps par corps : le contour decoupe en
 * rectangles, chacun ajuste sur les mesures qui tombent dedans ; un rectangle que le LiDAR
 * n'explique pas garde le toit par defaut a la pente du toit du batiment. Null quand le contour
 * ne se decoupe pas. `ajustes` compte les volumes que le LiDAR a mesures.
 */
export function volumesDepuisLidar(pts: readonly PtBrut[], ech: readonly EchantillonHauteur[], reference: Toit | null | undefined, mesure: ToitMesure | null = null): { volumes: VolumeToit[]; ajustes: number } | null {
  const rects = decomposerEnRectangles(pts);
  if (!rects) return null;
  const pente = reference ? penteDuToit(pts, reference) : PENTE_DEFAUT_DEG;
  let ajustes = 0;
  const volumes = rects.map((rect): VolumeToit => {
    const a = ajusterToit(rect, ech.filter((e) => pointInPolygon(e, rect)));
    // L'egout du corps : lu dans la surface mesuree quand on l'a, sinon celui de l'ajustement.
    const egout = mesure ? egoutDansRect(mesure, rect, pts) : a && egoutValide(a.egout) ? Math.round(a.egout * 10) / 10 : null;
    const avecEgout = egout !== null ? { egout } : {};
    if (!a) return { pts: rect, toit: toitDuRectangle(rect, pente, reference?.source ?? 'bdtopo', true), ...avecEgout };
    ajustes++;
    return { pts: rect, toit: a.toit, ...avecEgout };
  });
  return { volumes, ajustes };
}

/** Ce qu'on lit sous un batiment : les mesures de l'ajustement et, sur la parcelle du projet, la grille entiere. */
async function lireSous(o: ObjetAToit & { pts: PtBrut[] }, proj: ProjecteurLocal, lire: LecteurMnh, lireGrille: LecteurGrilleMnh | null): Promise<{ ech: EchantillonHauteur[]; grille: GrilleRelief | null }> {
  if (surParcellePrincipale(o) && lireGrille) {
    const grille = await lireGrille(o.pts, proj).catch(() => null);
    if (grille) return { ech: echantillonsDeGrille(grille, o.pts), grille };
  }
  return { ech: await lire(o.pts, proj).catch(() => []), grille: null };
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
  const bilan: BilanToitsLidar = { ajustes: 0, mesures: 0, gardes: 0, sansLidar: false };
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
  // Un lecteur de mesures fourni sans lecteur de grille : pas de toit mesure (les tests, un service partiel).
  const lireGrille = options.lireGrille ?? (options.lire ? null : lireGrilleSous);
  let suivant = 0;
  const ouvrier = async (): Promise<void> => {
    while (suivant < candidats.length && maintenant() < fin) {
      const o = candidats[suivant++];
      if (!o) break;
      const { ech, grille } = await lireSous(o, proj, lire, lireGrille);
      if (!ech.length) continue;
      const ajuste = ajusterToit(o.pts, ech);
      // Sur la parcelle du projet, le toit est aussi garde tel que mesure (§12) et decoupe corps par corps (§11).
      const principal = surParcellePrincipale(o);
      const mesure = principal && grille ? toitMesureDepuisGrille(grille, o.pts) : null;
      const volumes = principal ? volumesDepuisLidar(o.pts, ech, ajuste?.toit ?? o.toit, mesure) : null;
      if (principal) { o.toitMesure = mesure; o.volumesToit = volumes?.volumes ?? null; }
      if (mesure) bilan.mesures++;
      else if (!ajuste && !volumes?.ajustes) { bilan.gardes++; continue; }
      if (ajuste) {
        const ancien = o.toit;
        o.toit = { ...ajuste.toit, ...(ancien?.couleur ? { couleur: ancien.couleur } : {}), ...(ancien?.origineCouleur ? { origineCouleur: ancien.origineCouleur } : {}) };
      }
      // La hauteur a l'egout : celle de la surface mesuree, sinon celle de l'ajustement, quand elle s'ecarte franchement.
      const egout = mesure ? mesure.egout : ajuste ? ajuste.egout : null;
      const h = o.elevation ?? 0;
      if (egout !== null && egoutValide(egout) && Math.abs(egout - h) >= ECART_EGOUT_MIN_M) o.elevation = Math.round(egout * 10) / 10;
      if (ajuste || volumes?.ajustes) bilan.ajustes++;
    }
  };
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier));
  return bilan;
}

/** La phrase du bilan, ou `null` s'il n'y a rien a dire. */
export function texteBilanToitsLidar(b: BilanToitsLidar): string | null {
  if (b.sansLidar) return null;
  if (!b.ajustes && !b.gardes && !b.mesures) return null;
  const parts = [
    b.ajustes ? b.ajustes + ' toit(s) ajuste(s) sur le LiDAR HD' : '',
    b.mesures ? b.mesures + ' toit(s) de la parcelle garde(s) tel(s) que mesure(s)' : '',
    b.gardes ? b.gardes + ' garde(s) tel(s) quel(s) (forme trop complexe)' : '',
  ].filter(Boolean);
  return parts.join(', ');
}
