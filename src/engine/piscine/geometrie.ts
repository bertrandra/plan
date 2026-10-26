// La piscine, sa geometrie : contour, decalages, axe et profil du fond, volume d'eau.
// Un morceau de engine/piscine.ts, qui les reexporte tous : le reste du programme importe depuis lui.

import { au } from '../../util/tableaux.js';
import { centroid, dist, shoelace, signedArea } from '../../geometry/basic.js';
import { clipLineToPolygon, polygonOffset } from '../../geometry/polygon.js';
import { estPiscine } from '../../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { type ReglagesPiscine } from './reglages.js';

// ---- Geometrie -------------------------------------------------------------------------------

/** Un cercle en polygone de 48 cotes : assez fin pour les decalages et les coupes, assez court pour le plan. */
export const COTES_CERCLE = 48;

/** Le contour du plan d'eau, en polygone dans tous les cas. Vide si l'objet n'est pas une piscine utilisable. */
export function contourPiscine(o: ObjetPlan): PtBrut[] {
  if (o.type === 'circle') {
    if (!(o.r > 0.05)) return [];
    return Array.from({ length: COTES_CERCLE }, (_, i) => {
      const a = 2 * Math.PI * i / COTES_CERCLE;
      return { x: o.center.x + o.r * Math.cos(a), y: o.center.y + o.r * Math.sin(a) };
    });
  }
  if (o.type !== 'polygon' || o.pts.length < 3 || shoelace(o.pts) < 0.5) return [];
  return o.pts.map(p => ({ x: p.x, y: p.y }));
}

/** Decale un contour vers l'exterieur, sans jamais le retourner. */
export function elargir(contour: PtBrut[], d: number): PtBrut[] {
  if (d <= 1e-9) return contour.map(p => ({ ...p }));
  const off = polygonOffset(contour, -d);
  return off.length >= 3 && off.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) && Math.sign(signedArea(off)) === Math.sign(signedArea(contour)) ? off : contour.map(p => ({ ...p }));
}

export const perimetre = (pts: PtBrut[]): number => pts.reduce((s, p, i) => s + dist(p, au(pts, (i + 1) % pts.length)), 0);

/** L'axe des profondeurs : l'origine sur le cote du petit bain, `v` vers le grand bain, `L` la longueur du bassin dans ce sens. */
export interface AxeProfondeur { origine: PtBrut; u: PtBrut; v: PtBrut; L: number }

export function axeProfondeur(contour: PtBrut[], cotePetitBain: number): AxeProfondeur {
  const n = contour.length;
  const a = au(contour, cotePetitBain % n), b = au(contour, (cotePetitBain + 1) % n);
  const Lab = dist(a, b) || 1;
  const u = { x: (b.x - a.x) / Lab, y: (b.y - a.y) / Lab };
  const ccw = signedArea(contour) > 0;
  // Normale interieure : a gauche du sens de parcours pour un polygone trigonometrique.
  const v = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  const L = Math.max(...contour.map(p => (p.x - a.x) * v.x + (p.y - a.y) * v.y));
  return { origine: a, u, v, L: Math.max(0.1, L) };
}

/** Un point du profil de fond : la distance `s` depuis le petit bain, la profondeur d'eau `z`. */
export interface PointProfil { s: number; z: number }

/** Le profil du fond le long de l'axe, en quelques points : ce que la coupe dessine. */
export function profilFond(r: ReglagesPiscine, L: number): PointProfil[] {
  const p1 = r.profondeurPetitBain, p2 = r.profondeurGrandBain;
  if (r.fond === 'plat' || p2 - p1 < 1e-6) return [{ s: 0, z: p1 }, { s: L, z: p1 }];
  if (r.fond === 'pente') return [{ s: 0, z: p1 }, { s: L, z: p2 }];
  // Fosse : plat, puis une descente sur la moitie de la part de fosse, puis le fond de fosse.
  const sDebut = L * (1 - r.partFosse), sFond = sDebut + L * r.partFosse / 2;
  return [{ s: 0, z: p1 }, { s: sDebut, z: p1 }, { s: sFond, z: p2 }, { s: L, z: p2 }];
}

/** La profondeur d'eau a la distance `s` du petit bain, lue sur le profil. */
export function profondeurA(profil: PointProfil[], s: number): number {
  for (let i = 0; i < profil.length - 1; i++) {
    const a = au(profil, i), b = au(profil, i + 1);
    if (s <= b.s + 1e-9) return b.s - a.s < 1e-9 ? b.z : a.z + (b.z - a.z) * Math.max(0, s - a.s) / (b.s - a.s);
  }
  return au(profil, profil.length - 1).z;
}

/**
 * Le volume d'eau : la surface fois la profondeur pour un fond plat ; sinon l'integrale de la
 * profondeur sur le plan d'eau, par bandes perpendiculaires a l'axe (exacte sur un fond en pente
 * pour un rectangle, approchee au millieme ailleurs).
 */
export function volumeEau(contour: PtBrut[], axe: AxeProfondeur, profil: PointProfil[], surface: number): number {
  if (profil.length === 2 && Math.abs(au(profil, 0).z - au(profil, 1).z) < 1e-9) return surface * au(profil, 0).z;
  const N = 400;
  let vol = 0;
  for (let k = 0; k < N; k++) {
    const s = axe.L * (k + 0.5) / N;
    const origine = { x: axe.origine.x + axe.v.x * s, y: axe.origine.y + axe.v.y * s };
    const largeur = clipLineToPolygon(origine, axe.u, contour).reduce((t, seg) => t + dist(seg.a, seg.b), 0);
    vol += largeur * profondeurA(profil, s) * axe.L / N;
  }
  return vol;
}

/**
 * L'interieur du bassin, pour la 3D : les parois (chaque cote, avec la profondeur d'eau a ses deux
 * bouts) et le fond (des bandes perpendiculaires a l'axe, une par pan du profil, avec la profondeur
 * a chaque sommet). Les cotes sont recoupes aux cassures du profil : entre deux sommets, la
 * profondeur varie lineairement, et un rendu qui interpole entre les sommets est exact.
 */
export interface InterieurBassin {
  parois: { a: PtBrut; b: PtBrut; profA: number; profB: number }[];
  fond: { pts: PtBrut[]; prof: number[] }[];
}

export function interieurBassin(contour: PtBrut[], axe: AxeProfondeur, profil: PointProfil[]): InterieurBassin {
  const sDe = (p: PtBrut) => (p.x - axe.origine.x) * axe.v.x + (p.y - axe.origine.y) * axe.v.y;
  const cassures = profil.map(q => q.s).filter((s, i, t) => i > 0 && i < t.length - 1 && s > 1e-6 && s < axe.L - 1e-6);
  // Les cotes, recoupes la ou ils traversent une cassure du profil.
  const dense: PtBrut[] = [];
  contour.forEach((a, i) => {
    const b = au(contour, (i + 1) % contour.length);
    dense.push(a);
    const sa = sDe(a), sb = sDe(b);
    const coupes = cassures.filter(s => (s - sa) * (s - sb) < 0).map(s => (s - sa) / (sb - sa)).sort((x, y) => x - y);
    coupes.forEach(t => dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
  });
  const prof = (p: PtBrut) => profondeurA(profil, Math.min(axe.L, Math.max(0, sDe(p))));
  const parois = dense.map((a, i) => { const b = au(dense, (i + 1) % dense.length); return { a, b, profA: prof(a), profB: prof(b) }; });
  // Le fond : le contour coupe en bandes entre deux cassures (Sutherland-Hodgman sur deux demi-plans).
  const bornes = [-Infinity, ...cassures, Infinity];
  const fond: InterieurBassin['fond'] = [];
  for (let i = 0; i < bornes.length - 1; i++) {
    const s0 = au(bornes, i), s1 = au(bornes, i + 1);
    let poly = dense;
    if (s0 > -Infinity) poly = demiPlan(poly, sDe, s0, 1);
    if (s1 < Infinity) poly = demiPlan(poly, sDe, s1, -1);
    if (poly.length >= 3 && Math.abs(shoelace(poly)) > 1e-6) fond.push({ pts: poly, prof: poly.map(prof) });
  }
  return { parois, fond };
}

/** Garde la partie du polygone ou `sens * (s(p) - s0) >= 0`. */
function demiPlan(poly: PtBrut[], sDe: (p: PtBrut) => number, s0: number, sens: 1 | -1): PtBrut[] {
  const dedans = (p: PtBrut) => sens * (sDe(p) - s0) >= -1e-9;
  const res: PtBrut[] = [];
  poly.forEach((a, i) => {
    const b = au(poly, (i + 1) % poly.length);
    const ia = dedans(a), ib = dedans(b);
    if (ia) res.push(a);
    if (ia !== ib) {
      const sa = sDe(a), sb = sDe(b);
      const t = (s0 - sa) / (sb - sa);
      res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  });
  return res;
}


/** Les piscines calculables du plan. */
export const piscinesDu = (objets: ObjetPlan[]): ObjetPlan[] => objets.filter(estPiscine);

/** Le centre du bassin, pour les etiquettes et les cotes. */
export const centrePiscine = (o: ObjetPlan): PtBrut => o.type === 'circle' ? { x: o.center.x, y: o.center.y } : centroid(o.pts);
