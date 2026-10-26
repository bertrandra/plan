// Le contour mis a l equerre et recale sur la mesure (MD/spec-toit-ign.md §13).
// Un morceau de facade/toits/toitCorps.ts, qui le reexporte : le reste du programme importe depuis lui.

import { au } from '../../../util/tableaux.js';
import { pointInPolygon } from '../../../geometry/basic.js';
import { distancePointContour } from '../../../geometry/proximite.js';
import { angleDuPlusLongCote } from '../../../geometry/faitage.js';
import type { PtBrut } from '../../../model/types.js';
import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import { cm, type Grille } from './ajustement.js';

/** Une cellule est batie quand la mesure y depasse cela : un rez-de-chaussee, pas une haie. */
export const HAUTEUR_BATIE_M = R.HAUTEUR_BATIE_M;

/**
 * L'axe d'un contour, en degres : celui (a l'equerre pres) qui aligne la plus grande longueur de
 * cotes, a la tolerance des rectangles. Le plus long cote ne suffit pas : ce peut etre le biais.
 */
export function axeDesCotes(contour: readonly PtBrut[]): number {
  const cotes = contour.map((q, i) => { const r = au(contour, (i + 1) % contour.length); return { angle: (Math.atan2(r.y - q.y, r.x - q.x) * 180) / Math.PI, l: Math.hypot(r.x - q.x, r.y - q.y) }; });
  const ecart = (a: number, b: number) => { const d = (((a - b) % 90) + 90) % 90; return Math.min(d, 90 - d); };
  let best = { angle: angleDuPlusLongCote(contour), l: -1 };
  for (const c of cotes) {
    const l = cotes.reduce((s, o) => s + (ecart(o.angle, c.angle) <= S.TOLERANCE_DEG ? o.l : 0), 0);
    if (l > best.l + 1e-6) best = { angle: c.angle, l };
  }
  return best.angle;
}

/**
 * Le contour mis a l'equerre : chaque cote de biais (au-dela de la tolerance des rectangles) devient
 * une marche - un cote, un ressaut, un cote - dont le ressaut tombe au droit d'un autre sommet du
 * contour (celui qui est le plus pres du milieu du biais, a une largeur de volume au moins de ses
 * bouts), a defaut au milieu. La marche rend au contour, d'un cote du biais, ce qu'elle lui prend de
 * l'autre ; posee au droit d'un sommet, elle prolonge une facade, et les tranches suivent le batiment
 * (une aile, une partie basse) plutot que le biais. Null quand le contour n'a pas de cote de biais.
 */
export function contourEquerre(contour: readonly PtBrut[]): PtBrut[] | null {
  const a = (axeDesCotes(contour) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const local = (p: PtBrut): PtBrut => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const plan = (p: PtBrut): PtBrut => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const L = contour.map(local);
  const out: PtBrut[] = [];
  let biais = false;
  L.forEach((p, i) => {
    out.push(p);
    const q = au(L, (i + 1) % L.length);
    const angle = Math.abs((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI) % 180;
    if (Math.min(angle, 180 - angle) <= S.TOLERANCE_DEG || Math.abs(angle - 90) <= S.TOLERANCE_DEG) return;
    biais = true;
    // Le ressaut est vertical sur un biais plutot couche, horizontal sur un biais plutot dresse.
    const couche = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
    const [u0, u1] = couche ? [p.x, q.x] : [p.y, q.y];
    const lo = Math.min(u0, u1) + S.LARGEUR_CORPS_MIN_M, hi = Math.max(u0, u1) - S.LARGEUR_CORPS_MIN_M, milieu = (u0 + u1) / 2;
    const appuis = L.filter((_, k) => k !== i && k !== (i + 1) % L.length).map((v) => (couche ? v.x : v.y)).filter((u) => u >= lo && u <= hi);
    const u = appuis.reduce((m, v) => (Math.abs(v - milieu) < Math.abs(m - milieu) ? v : m), appuis[0] ?? milieu);
    out.push(...(couche ? [{ x: u, y: p.y }, { x: u, y: q.y }] : [{ x: p.x, y: u }, { x: q.x, y: u }]));
  });
  return biais ? out.map(plan).map((p) => ({ x: cm(p.x), y: cm(p.y) })) : null;
}

/** Au-dela de cette part de cellules non baties sous son contour, un batiment est recale sur la mesure. */
export const PART_VIDE_RECALAGE = R.PART_VIDE_RECALAGE;
/** Le plus grand decalage essaye, dans chaque sens, et son pas. */
export const DECALAGE_MAX_M = R.DECALAGE_MAX_M;
// Son pas : S.PAS_DECALAGE_M. La bande autour du contour ou le LiDAR ne devrait plus rien voir de bati,
// au-dela du debord : de S.BANDE_DEHORS_DEBUT_M a S.BANDE_DEHORS_FIN_M.

/**
 * Les cellules de la grille sous le contour decale de (dx, dy) : baties et non baties (sans mesure
 * comprise) ; et, dans la bande juste dehors, baties et non baties.
 */
function sousLeContour(g: Grille, contour: readonly PtBrut[], dx: number, dy: number): { bati: number; vide: number; batiDehors: number; videDehors: number } {
  const P = contour.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const m = S.BANDE_DEHORS_FIN_M;
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - m - g.x0) / g.pas)), i1 = Math.min(g.nx - 1, Math.ceil((Math.max(...xs) + m - g.x0) / g.pas));
  const j0 = Math.max(0, Math.floor((g.y0 - Math.max(...ys) - m) / g.pas)), j1 = Math.min(g.ny - 1, Math.ceil((g.y0 - Math.min(...ys) + m) / g.pas));
  const c = { bati: 0, vide: 0, batiDehors: 0, videDehors: 0 };
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const p = { x: g.x0 + i * g.pas, y: g.y0 - j * g.pas };
    const bati = (g.z[j * g.nx + i] ?? 0) >= S.HAUTEUR_BATIE_M;
    if (pointInPolygon(p, P)) { if (bati) c.bati++; else c.vide++; continue; }
    const d = distancePointContour(p, P);
    if (d <= S.BANDE_DEHORS_DEBUT_M || d > m) continue;
    if (bati) c.batiDehors++; else c.videDehors++;
  }
  return c;
}

/** La part des cellules non baties sous le contour, tel qu'il est trace. */
export function partVideSous(g: Grille, contour: readonly PtBrut[]): number {
  const { bati, vide } = sousLeContour(g, contour, 0, 0);
  return bati + vide ? vide / (bati + vide) : 0;
}

/**
 * Le decalage qui pose le contour sur ce que le LiDAR montre bati, quand il est trace a cote : la BD
 * TOPO decale parfois une maison de deux metres, et ses corps se lisaient alors sur un quart de toit
 * et un bout de jardin. Seulement si plus de PART_VIDE_RECALAGE du contour tombe sur du non bati, et
 * si le meilleur decalage (bati sous le contour et rien dans une bande juste dehors, au pas de
 * 25 cm, a 3 m au plus) divise ce non bati par deux au moins. Null sinon : le contour tel qu'il est trace.
 */
export function decalageSurMesure(g: Grille, contour: readonly PtBrut[]): PtBrut | null {
  const zero = sousLeContour(g, contour, 0, 0);
  if (!(zero.bati + zero.vide) || zero.vide / (zero.bati + zero.vide) < S.PART_VIDE_RECALAGE) return null;
  // Bati sous le contour, rien juste dehors : le batiment se pose au milieu de ce que le LiDAR voit,
  // au lieu de glisser contre un bord du bati.
  const score = (c: typeof zero) => c.bati - c.vide + c.videDehors - c.batiDehors;
  let best = { dx: 0, dy: 0, ...zero };
  const n = Math.round(S.DECALAGE_MAX_M / S.PAS_DECALAGE_M);
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
    const c = sousLeContour(g, contour, a * S.PAS_DECALAGE_M, b * S.PAS_DECALAGE_M);
    if (score(c) > score(best)) best = { dx: a * S.PAS_DECALAGE_M, dy: b * S.PAS_DECALAGE_M, ...c };
  }
  return best.vide <= zero.vide / 2 && Math.hypot(best.dx, best.dy) >= 2 * S.PAS_DECALAGE_M ? { x: best.dx, y: best.dy } : null;
}
