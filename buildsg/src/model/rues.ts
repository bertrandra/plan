// Le nom des rues autour de la parcelle du projet (MD/spec-rues.md).
//
// Les rues viennent de la BD TOPO (geo/rues.ts) : des troncons, chacun le nom de sa voie. Ici, sans
// rien dessiner : on raboute les troncons d'une meme rue en lignes continues, et on dit ou poser son
// nom - au milieu d'une ligne assez longue, de nouveau tous les `PAS_ETIQUETTE_M` sur une longue
// rue, dans le sens de la voie et jamais la tete en bas. Le plan (render/rues.ts) et la Vue 3D
// (three/rues3d.ts) posent les memes etiquettes, chacun dans son repere.

import type { PtBrut, RueVoisine } from './types.js';
import type { Emprise } from './relief.js';

/** En dessous, une ligne ne porte pas de nom : une impasse de dix metres ne se nomme pas sur un plan. */
export const LONGUEUR_MIN_ETIQUETTE_M = 20;
/** Une longue rue repete son nom a peu pres a ce pas. */
export const PAS_ETIQUETTE_M = 120;
/** Deux extremites a moins de cette distance se touchent : les troncons d'une rue se raboutent. */
const JOINT_M = 0.5;

/** Une etiquette : le nom, son point d'ancrage et l'angle de la voie (degres, sens trigonometrique, y vers le nord). */
export interface EtiquetteRue { nom: string; x: number; y: number; angleDeg: number }

const proche = (a: PtBrut, b: PtBrut) => Math.hypot(a.x - b.x, a.y - b.y) <= JOINT_M;

/** Raboute des troncons en lignes continues, dans le sens qu'il faut : bout a bout, en retournant au besoin. */
export function rabouter(troncons: readonly PtBrut[][]): PtBrut[][] {
  const restes = troncons.filter((t) => t.length >= 2).map((t) => [...t]);
  const lignes: PtBrut[][] = [];
  while (restes.length) {
    const ligne = restes.shift() as PtBrut[];
    let prolonge = true;
    while (prolonge) {
      prolonge = false;
      for (let i = 0; i < restes.length; i++) {
        const t = restes[i] as PtBrut[];
        const debut = ligne[0] as PtBrut, fin = ligne[ligne.length - 1] as PtBrut;
        const td = t[0] as PtBrut, tf = t[t.length - 1] as PtBrut;
        if (proche(fin, td)) ligne.push(...t.slice(1));
        else if (proche(fin, tf)) ligne.push(...[...t].reverse().slice(1));
        else if (proche(debut, tf)) ligne.unshift(...t.slice(0, -1));
        else if (proche(debut, td)) ligne.unshift(...[...t].reverse().slice(0, -1));
        else continue;
        restes.splice(i, 1);
        prolonge = true;
        break;
      }
    }
    lignes.push(ligne);
  }
  return lignes;
}

/** La longueur d'une polyligne. */
export function longueur(pts: readonly PtBrut[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot((pts[i] as PtBrut).x - (pts[i - 1] as PtBrut).x, (pts[i] as PtBrut).y - (pts[i - 1] as PtBrut).y);
  return l;
}

/** Le point a l'abscisse `s` le long de la polyligne, et la direction du segment qui le porte. */
export function pointA(pts: readonly PtBrut[], s: number): { x: number; y: number; dx: number; dy: number } {
  let reste = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as PtBrut, b = pts[i] as PtBrut;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0 && (reste <= d || i === pts.length - 1)) {
      const t = Math.min(1, reste / d);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / d, dy: (b.y - a.y) / d };
    }
    reste -= d;
  }
  const p = pts[0] ?? { x: 0, y: 0 };
  return { x: p.x, y: p.y, dx: 1, dy: 0 };
}

/** Un angle de voie ramene dans ]-90, 90] : un nom ne se lit jamais la tete en bas. */
export function angleLisible(dx: number, dy: number): number {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return a;
}

/** Le morceau du segment [a, b] dans le rectangle (Liang-Barsky), ou null s'il est dehors. */
function couperSegment(a: PtBrut, b: PtBrut, e: Emprise): [PtBrut, PtBrut] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const bords: [number, number][] = [[-dx, a.x - e.xMin], [dx, e.xMax - a.x], [-dy, a.y - e.yMin], [dy, e.yMax - a.y]];
  for (const [p, q] of bords) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
}

/** Les morceaux d'une polyligne qui sont dans le rectangle, chacun d'un seul tenant. */
export function decouper(ligne: readonly PtBrut[], e: Emprise): PtBrut[][] {
  const morceaux: PtBrut[][] = [];
  let courant: PtBrut[] | null = null;
  for (let i = 1; i < ligne.length; i++) {
    const c = couperSegment(ligne[i - 1] as PtBrut, ligne[i] as PtBrut, e);
    if (!c) { courant = null; continue; }
    const fin = courant?.[courant.length - 1];
    if (courant && fin && Math.hypot(fin.x - c[0].x, fin.y - c[0].y) < 1e-9) courant.push(c[1]);
    else { courant = [c[0], c[1]]; morceaux.push(courant); }
    // Le segment sort du rectangle avant sa fin : le morceau suivant sera un autre.
    if (c[1].x !== (ligne[i] as PtBrut).x || c[1].y !== (ligne[i] as PtBrut).y) courant = null;
  }
  return morceaux;
}

/**
 * Ou poser le nom de chaque rue : sur chaque ligne d'au moins `LONGUEUR_MIN_ETIQUETTE_M`, une fois
 * au milieu, ou plusieurs fois, a intervalles egaux, sur une ligne de plus de deux pas. L'angle suit
 * la voie sur une dizaine de metres autour du point, pour qu'un virage ne tourne pas le nom de travers.
 * Avec `cadre` (l'ecran du plan, le sol de la 3D), les rues y sont d'abord decoupees : le nom se pose
 * au milieu de ce qu'on en voit, pas au milieu d'une rue qui sort du cadre.
 */
export function etiquettesDesRues(rues: readonly RueVoisine[], cadre?: Emprise): EtiquetteRue[] {
  const res: EtiquetteRue[] = [];
  for (const rue of rues) {
    for (const ligne of rabouter(rue.troncons).flatMap((l) => (cadre ? decouper(l, cadre) : [l]))) {
      const L = longueur(ligne);
      if (L < LONGUEUR_MIN_ETIQUETTE_M) continue;
      const n = Math.max(1, Math.floor(L / PAS_ETIQUETTE_M));
      for (let k = 0; k < n; k++) {
        const s = ((k + 0.5) * L) / n;
        const p = pointA(ligne, s);
        const avant = pointA(ligne, s - 5), apres = pointA(ligne, s + 5);
        const dx = apres.x - avant.x, dy = apres.y - avant.y;
        res.push({ nom: rue.nom, x: p.x, y: p.y, angleDeg: Math.hypot(dx, dy) > 1e-6 ? angleLisible(dx, dy) : angleLisible(p.dx, p.dy) });
      }
    }
  }
  return res;
}
