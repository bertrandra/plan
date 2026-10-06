// Le relief du sol : la grille d'altitudes lue a l'IGN et ce qu'on en tire (MD/spec-relief.md).
//
// Une seule verite : la grille `Relief` rangee sur la parcelle du projet. Tout ce que le programme
// montre ou compte a partir du sol (pente, denivele, courbes, profil, sol de la Vue 3D, et demain
// la hauteur de chaque plot) passe par `altitudeNGF`, la lecture bilineaire d'ici. Rien d'autre
// n'interpole, et aucun objet n'enregistre une altitude copiee de la grille.
//
// Le repere est celui du plan : des metres, `y` vers le nord. Le zero des hauteurs du plan est
// `zRef`, l'altitude du sol au point de reference de la terrasse, fixee a la lecture.

import { centroid, pointInPolygon, shoelace } from '../geometry/basic.js';
import { parcelleDuProjet, terrasseOuPremiere } from './fonctions.js';
import type { AffichageRelief, ObjetPlan, PtBrut, Relief } from './types.js';

/** Ce que les lectures de grille demandent : la geometrie et les valeurs, sans les metadonnees. */
export type GrilleRelief = Pick<Relief, 'pas' | 'x0' | 'y0' | 'nx' | 'ny' | 'z'>;

/** La marge autour de la parcelle, en metres : le profil, les courbes et le sol 3D depassent la cloture. */
export const MARGE_RELIEF_M = 10;
/** Le plafond de cellules d'une grille : au-dela, le pas double (§3.1). */
export const MAX_CELLULES_RELIEF = 40000;
/** Le pas au-dela duquel la lecture est refusee : la parcelle est trop grande pour le relief. */
export const PAS_MAX_RELIEF = 5;
/** La pente en dessous de laquelle un terrain se dit « sensiblement plat », en pour cent. */
export const PENTE_PLATE_PCT = 1;

export const AFFICHAGE_RELIEF_DEFAUT: Required<AffichageRelief> = { courbes: true, equidistance: 0, sol3d: true };

/** Le relief du projet : celui de sa parcelle, s'il a ete lu. */
export function reliefDe(objets: readonly ObjetPlan[]): Relief | null {
  return parcelleDuProjet(objets as ObjetPlan[])?.relief ?? null;
}

/** Les preferences d'affichage completees de leurs defauts. */
export function affichageRelief(r: Relief | null | undefined): Required<AffichageRelief> {
  return { ...AFFICHAGE_RELIEF_DEFAUT, ...(r?.affichage ?? {}) };
}

export interface Emprise { xMin: number; xMax: number; yMin: number; yMax: number }

/** Le rectangle englobant des sommets, elargi de la marge. */
export function empriseRelief(pts: readonly PtBrut[], marge = MARGE_RELIEF_M): Emprise {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { xMin: Math.min(...xs) - marge, xMax: Math.max(...xs) + marge, yMin: Math.min(...ys) - marge, yMax: Math.max(...ys) + marge };
}

/**
 * Le pas de la grille pour cette emprise : la maille native, doublee tant que la grille depasse le
 * plafond de cellules (0,5 → 1 → 2 → 5 m) ; `null` au-dela de 5 m.
 */
export function pasPourEmprise(pasNatif: number, e: Emprise, maxCellules = MAX_CELLULES_RELIEF): number | null {
  const paliers = [0.5, 1, 2, 5].filter(p => p >= pasNatif - 1e-9);
  for (const pas of paliers) {
    const { nx, ny } = dimensionsGrille(e, pas);
    if (nx * ny <= maxCellules) return pas;
  }
  return null;
}

/** Les dimensions d'une grille a ce pas sur cette emprise : le centre nord-ouest, colonnes, lignes. */
export function dimensionsGrille(e: Emprise, pas: number): { x0: number; y0: number; nx: number; ny: number } {
  const nx = Math.max(2, Math.ceil((e.xMax - e.xMin) / pas)), ny = Math.max(2, Math.ceil((e.yMax - e.yMin) / pas));
  return { x0: e.xMin + pas / 2, y0: e.yMax - pas / 2, nx, ny };
}

/** La valeur de la cellule (colonne `i`, ligne `j`), `null` hors grille ou sans donnee. */
export function cellule(r: GrilleRelief, i: number, j: number): number | null {
  if (i < 0 || j < 0 || i >= r.nx || j >= r.ny) return null;
  return r.z[j * r.nx + i] ?? null;
}

/** Le centre de la cellule (colonne `i`, ligne `j`) dans le repere du plan. */
export function centreCellule(r: GrilleRelief, i: number, j: number): PtBrut {
  return { x: r.x0 + i * r.pas, y: r.y0 - j * r.pas };
}

/**
 * L'altitude NGF du sol en un point, par interpolation bilineaire entre les quatre cellules
 * voisines ; `null` hors de l'emprise (au-dela du bord des cellules) ou des qu'une voisine manque.
 */
export function altitudeNGF(r: GrilleRelief, x: number, y: number): number | null {
  const fi = (x - r.x0) / r.pas, fj = (r.y0 - y) / r.pas;
  if (fi < -0.5 || fj < -0.5 || fi > r.nx - 0.5 || fj > r.ny - 0.5) return null;
  const ci = Math.min(Math.max(fi, 0), r.nx - 1), cj = Math.min(Math.max(fj, 0), r.ny - 1);
  const i0 = Math.floor(ci), j0 = Math.floor(cj);
  const i1 = Math.min(i0 + 1, r.nx - 1), j1 = Math.min(j0 + 1, r.ny - 1);
  const tx = ci - i0, ty = cj - j0;
  const z00 = cellule(r, i0, j0), z10 = cellule(r, i1, j0), z01 = cellule(r, i0, j1), z11 = cellule(r, i1, j1);
  if (z00 === null || z10 === null || z01 === null || z11 === null) return null;
  return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;
}

/** La hauteur du sol au-dessus du zero du plan, en metres ; `null` la ou la grille ne dit rien. */
export function zLocal(r: Relief, x: number, y: number): number | null {
  const z = altitudeNGF(r, x, y);
  return z === null ? null : z - r.zRef;
}

/** Les cellules dont le centre est dans le polygone, avec leur altitude (les sans-donnee aussi). */
export function cellulesDansPolygone(r: GrilleRelief, poly: readonly PtBrut[]): { i: number; j: number; x: number; y: number; z: number | null }[] {
  const out: { i: number; j: number; x: number; y: number; z: number | null }[] = [];
  for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
    const p = centreCellule(r, i, j);
    if (pointInPolygon(p, poly)) out.push({ i, j, x: p.x, y: p.y, z: cellule(r, i, j) });
  }
  return out;
}

/** Le plus petit et le plus grand des altitudes connues de la grille, ou `null` si elle est vide. */
export function etendueAltitudes(r: GrilleRelief): { zMin: number; zMax: number } | null {
  let zMin = Infinity, zMax = -Infinity;
  r.z.forEach(z => { if (z !== null) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; } });
  return Number.isFinite(zMin) ? { zMin, zMax } : null;
}

export interface PenteParcelle {
  /** La pente moyenne, en pour cent. */
  pentePct: number;
  /** La direction vers laquelle le terrain descend, en degres depuis le nord, dans le sens horaire. */
  azimutDeg: number;
  /** Le point cardinal de cette direction : « S », « SO »… */
  orientation: string;
  zMin: number;
  zMax: number;
  denivele: number;
  /** Le nombre de cellules qui ont servi. */
  n: number;
}

const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Le point cardinal d'un azimut (degres depuis le nord, sens horaire). */
export function texteOrientation(azimutDeg: number): string {
  const a = ((azimutDeg % 360) + 360) % 360;
  return ORIENTATIONS[Math.round(a / 45) % 8] as string;
}

/**
 * La pente moyenne et l'orientation du sol a l'interieur d'un polygone : un plan `z = a·x + b·y + c`
 * ajuste par moindres carres sur les cellules de la grille qu'il contient. `null` sous trois cellules.
 */
export function penteParcelle(r: Relief, poly: readonly PtBrut[]): PenteParcelle | null {
  const cells = cellulesDansPolygone(r, poly).filter((c): c is typeof c & { z: number } => c.z !== null);
  if (cells.length < 3) return null;
  const n = cells.length;
  const mx = cells.reduce((s, c) => s + c.x, 0) / n, my = cells.reduce((s, c) => s + c.y, 0) / n, mz = cells.reduce((s, c) => s + c.z, 0) / n;
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  cells.forEach(c => {
    const dx = c.x - mx, dy = c.y - my, dz = c.z - mz;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxz += dx * dz; syz += dy * dz;
  });
  const det = sxx * syy - sxy * sxy;
  let a = 0, b = 0;
  if (Math.abs(det) > 1e-12) {
    a = (sxz * syy - syz * sxy) / det;
    b = (syz * sxx - sxz * sxy) / det;
  } else if (sxx > 1e-12) a = sxz / sxx;
  else if (syy > 1e-12) b = syz / syy;
  const pente = Math.hypot(a, b);
  // Le terrain descend a l'oppose du gradient ; l'azimut se compte depuis le nord (+y), sens horaire.
  const azimut = pente < 1e-9 ? 0 : ((Math.atan2(-a, -b) * 180 / Math.PI) + 360) % 360;
  const zs = cells.map(c => c.z);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  return { pentePct: pente * 100, azimutDeg: azimut, orientation: texteOrientation(azimut), zMin, zMax, denivele: zMax - zMin, n };
}

/** Le texte de la pente pour l'inspecteur : « 4,2 % vers le SO », ou « sensiblement plat ». */
export function textePente(p: PenteParcelle): string {
  if (p.pentePct < PENTE_PLATE_PCT) return 'sensiblement plat';
  return p.pentePct.toFixed(1).replace('.', ',') + ' % vers le ' + p.orientation;
}

/** Un echantillon d'un profil : l'abscisse le long de la ligne et l'altitude NGF (ou rien). */
export interface PointProfil { s: number; x: number; y: number; z: number | null }

/** Le profil du sol le long de la ligne `a → b`, echantillonne tous les `pasEch` metres (un demi-pas par defaut). */
export function profilRelief(r: Relief, a: PtBrut, b: PtBrut, pasEch = r.pas / 2): PointProfil[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(L / Math.max(pasEch, 1e-3)));
  const out: PointProfil[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    out.push({ s: L * t, x, y, z: altitudeNGF(r, x, y) });
  }
  return out;
}

/**
 * La ligne de plus grande pente qui passe par `pRef`, coupee a l'emprise de la grille : la coupe
 * que Plan propose avant qu'on en trace une. Sur un terrain plat, une ligne ouest-est.
 */
export function ligneDePlusGrandePente(r: Relief, poly: readonly PtBrut[], pRef: PtBrut): { a: PtBrut; b: PtBrut } {
  const p = penteParcelle(r, poly);
  const az = p && p.pentePct >= PENTE_PLATE_PCT ? p.azimutDeg * Math.PI / 180 : Math.PI / 2;
  const d = { x: Math.sin(az), y: Math.cos(az) };
  const e = empriseGrille(r);
  // Les deux intersections de la droite avec le rectangle de la grille.
  const bornes: number[] = [];
  const essayer = (t: number) => { if (Number.isFinite(t)) { const q = { x: pRef.x + d.x * t, y: pRef.y + d.y * t }; if (q.x >= e.xMin - 1e-6 && q.x <= e.xMax + 1e-6 && q.y >= e.yMin - 1e-6 && q.y <= e.yMax + 1e-6) bornes.push(t); } };
  if (Math.abs(d.x) > 1e-9) { essayer((e.xMin - pRef.x) / d.x); essayer((e.xMax - pRef.x) / d.x); }
  if (Math.abs(d.y) > 1e-9) { essayer((e.yMin - pRef.y) / d.y); essayer((e.yMax - pRef.y) / d.y); }
  const tMin = Math.min(...bornes, 0), tMax = Math.max(...bornes, 0);
  // Le haut de la pente a gauche : on lit un profil qui descend.
  return { a: { x: pRef.x + d.x * tMin, y: pRef.y + d.y * tMin }, b: { x: pRef.x + d.x * tMax, y: pRef.y + d.y * tMax } };
}

/** Le rectangle couvert par la grille, au bord exterieur de ses cellules. */
export function empriseGrille(r: GrilleRelief): Emprise {
  return { xMin: r.x0 - r.pas / 2, xMax: r.x0 + (r.nx - 0.5) * r.pas, yMin: r.y0 - (r.ny - 0.5) * r.pas, yMax: r.y0 + r.pas / 2 };
}

/** L'equidistance des courbes d'apres le denivele : 10 cm sous 1 m, 25 cm sous 3 m, 50 cm sous 10 m, 1 m au-dela. */
export function equidistanceAuto(deniveleM: number): number {
  if (deniveleM < 1) return 0.1;
  if (deniveleM < 3) return 0.25;
  if (deniveleM < 10) return 0.5;
  return 1;
}

/** L'equidistance en vigueur : celle reglee, sinon l'automatique sur le denivele de la parcelle (a defaut, de la grille). */
export function equidistanceRelief(r: Relief, poly?: readonly PtBrut[]): number {
  const reglee = r.affichage?.equidistance;
  if (reglee && reglee > 0) return reglee;
  const p = poly ? penteParcelle(r, poly) : null;
  const etendue = p ? { zMin: p.zMin, zMax: p.zMax } : etendueAltitudes(r);
  return equidistanceAuto(etendue ? etendue.zMax - etendue.zMin : 0);
}

/** Les niveaux des courbes : les multiples de l'equidistance entre le plus bas et le plus haut de la grille. */
export function niveauxCourbes(r: GrilleRelief, equidistance: number): number[] {
  const e = etendueAltitudes(r);
  if (!e || equidistance <= 0) return [];
  const out: number[] = [];
  const k0 = Math.ceil(e.zMin / equidistance - 1e-9), k1 = Math.floor(e.zMax / equidistance + 1e-9);
  for (let k = k0; k <= k1; k++) out.push(Math.round(k * equidistance * 1000) / 1000);
  return out;
}

/** Une courbe sur quatre est maitresse : etiquetee, en trait plus fort. */
export function estCourbeMaitresse(niveau: number, equidistance: number): boolean {
  return Math.abs(Math.round(niveau / equidistance) % 4) === 0;
}

/**
 * Le point de reference du relief : le centroide de la terrasse courante (sinon la premiere),
 * sinon celui de la parcelle. C'est la que `zRef` est lu, et de la que part la coupe proposee.
 */
export function pointDeReference(objets: ObjetPlan[], cleTerrasse?: string | null): PtBrut | null {
  const t = terrasseOuPremiere(objets, cleTerrasse);
  if (t && t.type === 'polygon' && t.pts.length >= 3 && shoelace(t.pts) > 1e-9) return centroid(t.pts);
  const p = parcelleDuProjet(objets);
  if (p && p.type === 'polygon' && p.pts.length >= 3) return centroid(p.pts);
  return null;
}

/**
 * Le zero du plan pour une grille qu'on vient de lire : le sol au point de reference, arrondi au
 * centimetre ; a defaut (point hors grille, sans donnee), la mediane des altitudes connues.
 */
export function zRefPour(r: GrilleRelief, objets: ObjetPlan[], cleTerrasse?: string | null): number {
  const p = pointDeReference(objets, cleTerrasse);
  const z = p ? altitudeNGF(r, p.x, p.y) : null;
  if (z !== null) return Math.round(z * 100) / 100;
  const connues = r.z.filter((v): v is number => v !== null).sort((a, b) => a - b);
  return connues.length ? (connues[Math.floor(connues.length / 2)] as number) : 0;
}

/** « LiDAR HD, 50 cm » ou « RGE ALTI, 1 m » : la source et son pas, pour l'inspecteur et les pieces. */
export function libelleSource(r: Relief): string {
  const nom = r.source === 'lidar-hd' ? 'LiDAR HD' : 'RGE ALTI';
  const pas = r.pas < 1 ? Math.round(r.pas * 100) + ' cm' : r.pas + ' m';
  return nom + ', ' + pas;
}

/** La ligne qui resume le relief dans l'inspecteur et les pieces : source, date, precision. */
export function resumeRelief(r: Relief): string {
  const annee = (r.dateDonnees ?? r.dateLecture).slice(0, 4);
  return libelleSource(r) + ' · ' + (r.dateDonnees ? 'acquis en ' + annee : 'lu en ' + annee) + ' · ' + r.precision;
}
