// La geometrie des objets marques : boites, surfaces, recouvrement, et le parent d'un objet dans l'arbre des classes.

import type { Classe, Objet, P } from './types.js';

export interface Boite { x0: number; y0: number; x1: number; y1: number }

/** La boite englobante de points. */
export function boite(points: readonly P[]): Boite {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

/** Le contour d'un objet : les quatre coins d'un rectangle, les sommets d'un polygone. */
export function contour(o: Pick<Objet, 'forme' | 'points'>): P[] {
  if (o.forme === 'polygone') return o.points;
  const b = boite(o.points);
  return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
}

/** La surface d'un contour (formule du lacet). */
export function aire(pts: readonly P[]): number {
  let s = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length] as P; s += p.x * q.y - q.x * p.y; });
  return Math.abs(s) / 2;
}

/** Le point est-il dans le contour (pair-impair) ? */
export function dedans(p: P, pts: readonly P[]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as P, b = pts[j] as P;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Le recouvrement de deux boites : intersection sur union. */
export function iou(a: Boite, b: Boite): number {
  const l = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const i = l * h, u = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i;
  return u > 0 ? i / u : 0;
}

/** La part de `a` qui est dans `b`. */
export function partDans(a: Boite, b: Boite): number {
  const l = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const s = (a.x1 - a.x0) * (a.y1 - a.y0);
  return s > 0 ? (l * h) / s : 0;
}

/**
 * Le parent d'un objet : parmi les objets de la classe parente (dans l'arbre des classes), le plus petit qui le contient
 * (au moins 80 % de sa boite dedans). Null quand sa classe est a la racine ou qu'aucun ne le contient.
 */
export function parentDe(o: Objet, objets: readonly Objet[], classes: readonly Classe[]): string | null {
  const cp = classes.find((c) => c.id === o.classe)?.parent;
  if (!cp) return null;
  const b = boite(contour(o));
  let mieux: { id: string; s: number } | null = null;
  for (const p of objets) {
    if (p.id === o.id || p.classe !== cp) continue;
    const bp = boite(contour(p));
    if (partDans(b, bp) < 0.8) continue;
    const s = aire(contour(p));
    if (!mieux || s < mieux.s) mieux = { id: p.id, s };
  }
  return mieux?.id ?? null;
}

/** Les parents de tous les objets recalcules, sauf ceux qu'on a poses a la main et qui existent encore. */
export function rangerLesParents(objets: readonly Objet[], classes: readonly Classe[]): Objet[] {
  const ids = new Set(objets.map((o) => o.id));
  return objets.map((o) => ({ ...o, parent: o.parent && ids.has(o.parent) && o.origine !== 'auto' ? o.parent : parentDe(o, objets, classes) }));
}

/** Un identifiant d'objet, court et unique dans une annotation. */
export function nouvelId(objets: readonly Objet[], prefixe = 'o'): string {
  const ids = new Set(objets.map((o) => o.id));
  let n = objets.length + 1;
  while (ids.has(prefixe + n)) n++;
  return prefixe + n;
}

/** Un objet deplace de (dx, dy) : tous ses points. */
export function deplacer(o: Objet, dx: number, dy: number): Objet {
  return { ...o, points: o.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/** Le meme objet borne a l'image : ses points ramenes dans [0, L] x [0, H]. */
export function borner(o: Objet, L: number, H: number): Objet {
  return { ...o, points: o.points.map((p) => ({ x: Math.min(L, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) })) };
}
