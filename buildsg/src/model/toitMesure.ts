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
import { pointInPolygon, centroid } from '../geometry/basic.js';
import { sommetDe } from '../geometry/anneau.js';
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
/**
 * Une marche de la couverture d'au moins cela, d'un cote a l'autre d'une ligne, coupe un corps en deux
 * blocs. A 1,5 m, l'annexe de plain-pied du Vesinet (1,2 m sous le pan du corps) restait fondue dans
 * le corps ; une marche se distingue d'un pan raide par sa brutalite, pas par sa hauteur (ci-dessous).
 */
export const SEUIL_MARCHE_M = 0.8;
/** Un bloc coupe par une marche fait au moins cela de large. */
export const LARGEUR_BLOC_MIN_M = 1.5;
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

/** Le dixieme centile, arrondi au decimetre, ou null sans assez de valeurs. */
const bas = (v: readonly number[], min = 3): number | null => (v.length >= min ? dixieme(centile(v, 0.1)) : null);

/**
 * Les hauteurs de la surface le long d'un cote `a -> b`, tous les 50 cm, lues en retrait du mur
 * vers `interieur` (RETRAIT_EGOUT_M) : au bord, le MNH mele la couverture et le mur.
 */
export function hauteursLeLongDe(t: ToitMesure, a: PtBrut, b: PtBrut, interieur: PtBrut): number[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return [];
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  let nx = -uy, ny = ux;
  if ((interieur.x - a.x) * nx + (interieur.y - a.y) * ny < 0) { nx = -nx; ny = -ny; }
  const out: number[] = [];
  const n = Math.max(1, Math.round(L / PAS_PROFIL_M));
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) * L) / n;
    const z = hauteurToitMesure(t, a.x + ux * s + nx * RETRAIT_EGOUT_M, a.y + uy * s + ny * RETRAIT_EGOUT_M);
    if (z !== null) out.push(z);
  }
  return out;
}
const PAS_PROFIL_M = 0.5;

/**
 * La hauteur du mur `i` d'un bloc (de `pts[i]` a `pts[i + 1]`) : la ou la couverture rejoint le
 * mur, soit le dixieme centile des hauteurs le long du mur - l'egout sous un pan, le dessus plat
 * d'un mur qui monte jusqu'a lui, le bas d'un pignon. Null si la surface n'y est pas.
 */
export function hauteurMurMesuree(t: ToitMesure, pts: readonly PtBrut[], i: number): number | null {
  return bas(hauteursLeLongDe(t, au(pts, i), sommetDe(pts, i + 1), centroid(pts)));
}

/** Le repere d'un rectangle : son coin, ses deux directions unitaires et ses deux longueurs. */
function repereRect(rect: readonly PtBrut[]) {
  const p0 = au(rect, 0), p1 = au(rect, 1), p3 = au(rect, 3);
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  return { p0, u: { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v: { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W }, L, W };
}
const cm = (v: number) => Math.round(v * 100) / 100;

/**
 * Coupe un rectangle en deux blocs la ou la couverture fait une marche : un corps a deux niveaux et
 * une annexe a un seul sous un meme contour, un toit-terrasse accole a un toit en pente. Sur la
 * grille des cellules du rectangle, chaque colonne (puis chaque ligne) a sa hauteur basse (dixieme
 * centile) ; une coupe est une position ou cette hauteur saute d'au moins SEUIL_MARCHE_M sur un
 * metre, et ou les deux cotes, pris en entier, different d'autant - un pan en pente monte
 * doucement, une marche d'un coup. La coupe la plus franche l'emporte ; null s'il n'y en a pas, ou
 * si un bloc serait trop etroit.
 */
export function decouperParHauteur(t: ToitMesure, rect: readonly PtBrut[]): [PtBrut[], PtBrut[]] | null {
  if (rect.length !== 4) return null;
  const { p0, u, v, L, W } = repereRect(rect);
  const pas = t.pas;
  const nu = Math.floor(L / pas), nv = Math.floor(W / pas);
  if (nu < 4 || nv < 1) return null;
  // Les hauteurs par colonne (le long de u) et par ligne (le long de v).
  const colonnes: number[][] = Array.from({ length: nu }, () => []);
  const lignes: number[][] = Array.from({ length: nv }, () => []);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const su = (i + 0.5) * pas, sv = (j + 0.5) * pas;
    const z = hauteurToitMesure(t, p0.x + u.x * su + v.x * sv, p0.y + u.y * su + v.y * sv);
    if (z !== null) { (colonnes[i] as number[]).push(z); (lignes[j] as number[]).push(z); }
  }
  const meilleure = (series: number[][], longueur: number): { k: number; score: number } | null => {
    const basses = series.map((c) => bas(c, 1));
    let best: { k: number; score: number } | null = null;
    for (let k = 2; k + 2 <= series.length; k++) {
      if (k * pas < LARGEUR_BLOC_MIN_M || longueur - k * pas < LARGEUR_BLOC_MIN_M) continue;
      const avant = [basses[k - 2], basses[k - 1]].filter((x): x is number => x !== null);
      const apres = [basses[k], basses[k + 1]].filter((x): x is number => x !== null);
      if (avant.length < 2 || apres.length < 2) continue;
      const saut = Math.abs(moyenne(apres) - moyenne(avant));
      const gauche = bas(series.slice(0, k).flat()), droite = bas(series.slice(k).flat());
      if (gauche === null || droite === null) continue;
      // Une marche est brutale : sur le metre qui la franchit, la hauteur change bien plus que sur le
      // metre d'avant ou d'apres. Un pan raide change autant partout, un faitage ne change pas.
      const pente = (a: number, b: number): number | null => {
        const x = [basses[a], basses[a + 1]].filter((v): v is number => v !== null && v !== undefined);
        const y = [basses[b], basses[b + 1]].filter((v): v is number => v !== null && v !== undefined);
        return x.length && y.length ? Math.abs(moyenne(y) - moyenne(x)) : null;
      };
      const voisines = [k >= 4 ? pente(k - 4, k - 2) : null, k + 3 < series.length ? pente(k, k + 2) : null].filter((v): v is number => v !== null);
      const calme = voisines.length ? Math.min(...voisines) : 0;
      if (saut < 1.6 * calme) continue;
      const score = Math.min(saut, Math.abs(droite - gauche));
      if (score >= SEUIL_MARCHE_M && (!best || score > best.score)) best = { k, score };
    }
    return best;
  };
  const selonU = meilleure(colonnes, L), selonV = meilleure(lignes, W);
  const choix = selonU && (!selonV || selonU.score >= selonV.score) ? { axe: 'u' as const, k: selonU.k } : selonV ? { axe: 'v' as const, k: selonV.k } : null;
  if (!choix) return null;
  const s = choix.k * pas;
  const P = (a: number, b: number): PtBrut => ({ x: cm(p0.x + u.x * a + v.x * b), y: cm(p0.y + u.y * a + v.y * b) });
  return choix.axe === 'u'
    ? [[P(0, 0), P(s, 0), P(s, W), P(0, W)], [P(s, 0), P(L, 0), P(L, W), P(s, W)]]
    : [[P(0, 0), P(L, 0), P(L, s), P(0, s)], [P(0, s), P(L, s), P(L, W), P(0, W)]];
}

/**
 * Les rectangles d'un contour recoupes par les marches de la couverture, jusqu'a deux fois chacun.
 * Un morceau qui tient aux trois quarts dans un autre rectangle de depart (deux rectangles se
 * chevauchent : un corps et l'aile qui le penetre) n'est pas un bloc de plus : il est oublie.
 */
export function decouperParHauteurs(t: ToitMesure, rects: readonly PtBrut[][]): PtBrut[][] {
  const couvertAilleurs = (piece: readonly PtBrut[], origine: readonly PtBrut[]): boolean => {
    const { p0, u, v, L, W } = repereRect(piece);
    let total = 0, dedans = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const su = ((i + 0.5) * L) / 4, sv = ((j + 0.5) * W) / 4;
      const q = { x: p0.x + u.x * su + v.x * sv, y: p0.y + u.y * su + v.y * sv };
      total++;
      if (rects.some((r) => r !== origine && pointInPolygon(q, r))) dedans++;
    }
    return dedans >= total * 0.75;
  };
  const out: PtBrut[][] = [];
  const couper = (rect: readonly PtBrut[], origine: readonly PtBrut[], profondeur: number): void => {
    const deux = profondeur < 2 ? decouperParHauteur(t, rect) : null;
    if (!deux) { if (rect === origine || !couvertAilleurs(rect, origine)) out.push([...rect]); return; }
    deux.forEach((piece) => couper(piece, origine, profondeur + 1));
  };
  rects.forEach((r) => couper(r, r, 0));
  return out;
}

/** Ce que la 3D montre du toit d'un batiment : les corps et pignons, la surface mesuree, un toit par corps, ou le toit unique. */
export function modeToitActif(o: { toit?: unknown; toitMesure?: ToitMesure | null; volumesToit?: unknown[] | null; corpsToit?: unknown[] | null; modeToit?: 'simple' | 'volumes' | 'mesure' | 'corps' }): 'corps' | 'mesure' | 'volumes' | 'simple' {
  const volumes = !!o.volumesToit && o.volumesToit.length >= 2;
  const corps = !!o.corpsToit && o.corpsToit.length >= 1;
  if (o.modeToit === 'simple') return 'simple';
  if (o.modeToit === 'volumes') return volumes ? 'volumes' : 'simple';
  if (o.modeToit === 'mesure' && o.toitMesure) return 'mesure';
  if (corps) return 'corps';
  // Sans corps, un toit construit (des volumes, sinon la forme simple) plutot que la surface brute :
  // un relief de LiDAR n'est pas un toit. « Tel que mesure » reste propose, a la demande.
  return volumes ? 'volumes' : 'simple';
}
