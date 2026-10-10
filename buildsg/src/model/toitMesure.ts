// Le toit tel que le LiDAR HD le mesure (MD/spec-toit-ign.md §12).
//
// Les formes simples (deux pans, croupes, appentis) ne decrivent pas toutes les maisons : un pan
// raide et un dessus presque plat, une aile basse a un pan, un faitage decentre. Le MNH LiDAR HD
// donne, tous les 50 cm, la hauteur de la couverture au-dessus du sol : pour les batiments de la
// parcelle du projet, on garde cette grille telle quelle et la 3D la dessine en surface. Elle est
// d'abord **nettoyee** : les arbres et cheminees (au-dessus du gros du toit, ou bien au-dessus de
// leurs voisines), les trous (pas de donnee, le sol vu a travers, le mur vu de biais sous l'egout),
// bouches de proche en proche depuis la couverture autour ; puis passee a la mediane pour que les
// marches de 50 cm ne se voient pas, sans fondre les faitages. L'egout est le dixieme centile des hauteurs loin des murs :
// la ou les murs s'arretent et ou le toit commence.
//
// Ce module ne lit rien : il recoit la grille (geo/mnh.ts) et rend le toit.

import { au } from '../util/tableaux.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointContour } from '../geometry/proximite.js';
import type { GrilleRelief } from './relief.js';
import type { PtBrut, ToitMesure } from './types.js';

/** Une cellule plus haute que la mediane de ses voisines de plus de cela est un arbre ou une cheminee : ramenee a elles. */
export const SAILLIE_M = 2;
/** Au-dessus du neuvieme decile des hauteurs de plus de cela, ce n'est plus le toit mais un arbre : un trou a boucher. */
export const DEPASSEMENT_M = 1;
/** En dessous, une cellule sous un toit est le sol vu entre deux batiments, pas une couverture : un trou a boucher. */
export const SOL_M = 0.5;
/** L'egout se lit a au moins cela des murs : au bord, le MNH mele la couverture et le mur. */
export const RETRAIT_EGOUT_M = 0.5;
/** Une cellule plus basse que l'egout de plus de cela est le mur vu de biais : un trou a boucher. */
export const SOUS_EGOUT_M = 0.3;
/** Il faut au moins tant de cellules sous le contour, et au moins la moitie des cellules du contour, pour un toit. */
export const CELLULES_MIN = 20;
/** Bornes de l'egout, en metres. */
const EGOUT_MIN_M = 1.8;
const EGOUT_MAX_M = 40;
/** Boucher de proche en proche : jamais plus de passes que cela (une grille de 30 m de cote). */
const PASSES_MAX = 60;

const dixieme = (v: number) => Math.round(v * 10) / 10;

/** Les valeurs valides des 3 x 3 cellules autour de (i, j), la centrale comprise ou non. */
function voisines(z: readonly (number | null)[], nx: number, ny: number, i: number, j: number, centrale: boolean): number[] {
  const out: number[] = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!centrale && di === 0 && dj === 0) continue;
    const ii = i + di, jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
    const v = z[jj * nx + ii];
    if (v !== null && v !== undefined) out.push(v);
  }
  return out;
}

const mediane = (v: number[]): number => { const t = [...v].sort((a, b) => a - b); return au(t, Math.floor(t.length / 2)); };
const moyenne = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length;

/** Bouche les cellules nulles depuis leurs voisines, de proche en proche, jusqu'a ce qu'il n'en reste plus a boucher. */
export function boucher(z: readonly (number | null)[], nx: number, ny: number): (number | null)[] {
  let courant = [...z];
  for (let passe = 0; passe < PASSES_MAX; passe++) {
    const suivant = [...courant];
    let change = false;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (courant[k] !== null && courant[k] !== undefined) continue;
      const autour = voisines(courant, nx, ny, i, j, false);
      if (autour.length < 3) continue;
      suivant[k] = mediane(autour);
      change = true;
    }
    courant = suivant;
    if (!change) break;
  }
  return courant;
}

/**
 * Nettoie : le sol (sous SOL_M) et ce qui depasse `plafond` (un arbre au-dessus du gros du toit)
 * deviennent des trous, bouches de proche en proche ; puis, en deux passes, une cellule bien
 * au-dessus de ses voisines (une cheminee, le bord d'un houppier) est ramenee a elles.
 */
export function nettoyer(z: readonly (number | null)[], nx: number, ny: number, plafond = Infinity): (number | null)[] {
  let courant = boucher(z.map((v) => (v === null || v === undefined || v < SOL_M || v > plafond ? null : v)), nx, ny);
  for (let passe = 0; passe < 2; passe++) {
    const suivant = [...courant];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const v = courant[k];
      if (v === null || v === undefined) continue;
      const autour = voisines(courant, nx, ny, i, j, false);
      if (autour.length < 3) continue;
      const m = mediane(autour);
      if (v > m + SAILLIE_M) suivant[k] = m;
    }
    courant = suivant;
  }
  return courant;
}

/** Une mediane 3 x 3 : de quoi effacer les marches de 50 cm sans arrondir les faitages (une moyenne les fondrait). */
export function lisser(z: readonly (number | null)[], nx: number, ny: number): (number | null)[] {
  return z.map((v, k) => (v === null ? null : dixieme(mediane(voisines(z, nx, ny, k % nx, Math.floor(k / nx), true)))));
}

/** Le `p`-ieme centile (0 a 1) d'une liste. */
function centile(v: readonly number[], p: number): number {
  const t = [...v].sort((a, b) => a - b);
  return au(t, Math.min(t.length - 1, Math.max(0, Math.floor(p * (t.length - 1)))));
}

/** L'egout d'une liste de hauteurs : le dixieme centile, borne. */
const egoutDe = (v: readonly number[]) => Math.min(EGOUT_MAX_M, Math.max(EGOUT_MIN_M, dixieme(centile(v, 0.1))));

/**
 * Le toit mesure sous un contour, depuis la grille du MNH : recadree sur les cellules du contour,
 * nettoyee, lissee ; `null` si le LiDAR n'y voit pas assez de toit.
 */
export function toitMesureDepuisGrille(g: GrilleRelief, contour: readonly PtBrut[]): ToitMesure | null {
  if (contour.length < 3 || g.nx < 2 || g.ny < 2) return null;
  // Les cellules du toit : celles du contour ; les autres n'existent pas. Au coeur : loin des murs.
  let iMin = g.nx, iMax = -1, jMin = g.ny, jMax = -1;
  const dedans: boolean[] = [];
  const coeur: boolean[] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const p = { x: g.x0 + i * g.pas, y: g.y0 - j * g.pas };
    const inside = pointInPolygon(p, contour);
    dedans.push(inside); coeur.push(inside && distancePointContour(p, contour) >= RETRAIT_EGOUT_M);
    if (inside) { iMin = Math.min(iMin, i); iMax = Math.max(iMax, i); jMin = Math.min(jMin, j); jMax = Math.max(jMax, j); }
  }
  if (iMax < iMin || jMax < jMin) return null;
  const nx = iMax - iMin + 1, ny = jMax - jMin + 1;
  const brut: (number | null)[] = [];
  const coeurRecadre: boolean[] = [];
  let nDedans = 0;
  for (let j = jMin; j <= jMax; j++) for (let i = iMin; i <= iMax; i++) {
    const k = j * g.nx + i;
    brut.push(dedans[k] ? (g.z[k] ?? null) : null);
    coeurRecadre.push(!!coeur[k]);
    if (dedans[k]) nDedans++;
  }
  const mesures = brut.filter((v): v is number => v !== null && v >= SOL_M);
  if (mesures.length < CELLULES_MIN || mesures.length < nDedans / 2) return null;
  // Un arbre sur le toit est au-dessus du gros du toit : au-dela du neuvieme decile et d'un depassement.
  const propre = nettoyer(brut, nx, ny, centile(mesures, 0.9) + DEPASSEMENT_M);
  const auCoeur = propre.filter((v, k): v is number => v !== null && coeurRecadre[k] === true);
  const egout = egoutDe(auCoeur.length >= 4 ? auCoeur : propre.filter((v): v is number => v !== null));
  // Sous l'egout, ce n'est pas la couverture mais le mur vu de biais : un trou de plus a boucher.
  const z = lisser(boucher(propre.map((v) => (v !== null && v < egout - SOUS_EGOUT_M ? null : v)), nx, ny), nx, ny);
  const valides = z.filter((v): v is number => v !== null);
  if (valides.length < CELLULES_MIN) return null;
  return { pas: g.pas, x0: g.x0 + iMin * g.pas, y0: g.y0 - jMin * g.pas, nx, ny, z, egout, faite: dixieme(Math.max(...valides)), source: 'lidar' };
}

/** La valeur de la cellule (i, j), `null` hors grille ou sans donnee. */
const cellule = (t: ToitMesure, i: number, j: number): number | null => (i < 0 || j < 0 || i >= t.nx || j >= t.ny ? null : t.z[j * t.nx + i] ?? null);

/**
 * La hauteur du toit mesure en un point, par interpolation bilineaire des quatre cellules qui
 * l'entourent ; une cellule manquante prend la valeur de ses voisines presentes ; `null` quand
 * aucune ne l'est.
 */
export function hauteurToitMesure(t: ToitMesure, x: number, y: number): number | null {
  const fi = (x - t.x0) / t.pas, fj = (t.y0 - y) / t.pas;
  const i0 = Math.floor(fi), j0 = Math.floor(fj);
  const tx = fi - i0, ty = fj - j0;
  const coins = [cellule(t, i0, j0), cellule(t, i0 + 1, j0), cellule(t, i0, j0 + 1), cellule(t, i0 + 1, j0 + 1)];
  const presents = coins.filter((v): v is number => v !== null);
  if (!presents.length) return null;
  const rempli = coins.map((v) => (v === null ? moyenne(presents) : v)) as [number, number, number, number];
  const haut = rempli[0] * (1 - tx) + rempli[1] * tx, bas = rempli[2] * (1 - tx) + rempli[3] * tx;
  return haut * (1 - ty) + bas * ty;
}

/**
 * L'egout d'une partie du toit (un corps de batiment) : le dixieme centile des cellules dans
 * `rect`, loin des murs du `contour` quand il est donne ; a defaut de cellules, celui du toit entier.
 */
export function egoutDansRect(t: ToitMesure, rect: readonly PtBrut[], contour?: readonly PtBrut[]): number {
  const v: number[] = [];
  for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
    const z = t.z[j * t.nx + i];
    if (z === null || z === undefined) continue;
    const p = { x: t.x0 + i * t.pas, y: t.y0 - j * t.pas };
    if (pointInPolygon(p, rect) && (!contour || distancePointContour(p, contour) >= RETRAIT_EGOUT_M)) v.push(z);
  }
  return v.length >= 4 ? egoutDe(v) : t.egout;
}

/** Ce que la 3D montre du toit d'un batiment : la surface mesuree, un toit par corps, ou le toit unique. */
export function modeToitActif(o: { toit?: unknown; toitMesure?: ToitMesure | null; volumesToit?: unknown[] | null; modeToit?: 'simple' | 'volumes' | 'mesure' }): 'mesure' | 'volumes' | 'simple' {
  const corps = !!o.volumesToit && o.volumesToit.length >= 2;
  if (o.modeToit === 'simple') return 'simple';
  if (o.modeToit === 'volumes') return corps ? 'volumes' : 'simple';
  if (o.toitMesure) return 'mesure';
  return corps ? 'volumes' : 'simple';
}
