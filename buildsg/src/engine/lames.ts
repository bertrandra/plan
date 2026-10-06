// Geometrie d une lame : etendue, longueur reelle, emprise
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { au } from '../util/tableaux.js';
import { centroid, pointInPolygon } from '../geometry/basic.js';
import { differencePolygones, type PolygoneTroue } from '../geometry/difference.js';
import { clipLineToPolygon, clipPolygonByConvex } from '../geometry/polygon.js';
import type { PtBrut, Segment } from '../model/types.js';

export function etendueLame(a: PtBrut, b: PtBrut, largeurM: number, poly: PtBrut[] | null | undefined){
  const ex = b.x-a.x, ey = b.y-a.y;
  const L = Math.hypot(ex,ey) || 1;
  const ux = ex/L, uy = ey/L;
  const nx = -uy*(largeurM/2), ny = ux*(largeurM/2);
  // The overhang is read off the single edge the board ends on, and nothing else. Following the
  // board's own sides instead would work on a convex shape but jumps the notch of an L: a side
  // running along the re-entrant edge re-enters the other wing and stretches the board by metres.
  const debord = (pt: PtBrut) => {
    if(!poly || poly.length < 3) return 0;
    let best: Segment | null = null, bestD = Infinity;
    for(let i=0;i<poly.length;i++){
      const p = au(poly, i), q = au(poly, (i+1)%poly.length);
      const abx = q.x-p.x, aby = q.y-p.y;
      const l2 = abx*abx + aby*aby || 1e-12;
      let t = ((pt.x-p.x)*abx + (pt.y-p.y)*aby)/l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt.x-(p.x+t*abx), pt.y-(p.y+t*aby));
      if(d < bestD){ bestD = d; best = { a: p, b: q }; }
    }
    if(!best || bestD > 1e-3) return 0;            // l'about ne tombe pas sur un bord
    const vx = best.b.x-best.a.x, vy = best.b.y-best.a.y;
    const vl = Math.hypot(vx,vy) || 1;
    const sin = Math.abs(ux*(vy/vl) - uy*(vx/vl));
    const cos = Math.abs(ux*(vx/vl) + uy*(vy/vl));
    if(sin < 1e-4) return 0;                        // lame parallele au bord : about droit
    return Math.min((largeurM/2)*(cos/sin), largeurM*4);
  };
  const t0 = -debord(a), t1 = L + debord(b);
  return { t0, t1, ux, uy, nx, ny, longueur: t1-t0 };
}
// Length of stock a board needs: its longest side, not its centreline.
export function longueurLameReelle(a: PtBrut, b: PtBrut, largeurM: number, poly: PtBrut[] | null | undefined): number {
  return etendueLame(a, b, largeurM, poly).longueur;
}
// Footprint of one board: its full rectangle, cut to the outline it lives in.
export function empriseLame(a: PtBrut, b: PtBrut, largeurM: number, poly: PtBrut[] | null | undefined): PtBrut[] {
  const e = etendueLame(a, b, largeurM, poly);
  const coin = (t: number, s: number) => ({ x:a.x + e.ux*t + e.nx*s, y:a.y + e.uy*t + e.ny*s });
  const rect = [coin(e.t0,1), coin(e.t1,1), coin(e.t1,-1), coin(e.t0,-1)];
  if(!poly || poly.length < 3) return rect;
  const cut = clipPolygonByConvex(poly, rect);
  return cut.length >= 3 ? cut : rect;
}
/**
 * L'emprise d'une lame qui s'arrete sur un trou de la terrasse (bassin, tremie) : coupee a la forme
 * du trou, pas d'equerre. Chaque bout pose sur le bord d'un trou est prolonge d'une largeur, la lame
 * est recoupee au contour, puis privee des trous (geometry/difference.ts) ; on garde le morceau qui
 * porte son milieu. Sans trou qui la touche, c'est `empriseLame`.
 */
export function empriseLameTrouee(a: PtBrut, b: PtBrut, largeurM: number, poly: PtBrut[] | null | undefined, trous: PtBrut[][]): PolygoneTroue {
  const simple = { contour: empriseLame(a, b, largeurM, poly), trous: [] as PtBrut[][] };
  if(!trous.length) return simple;
  const L = Math.hypot(b.x-a.x, b.y-a.y) || 1;
  const ux = (b.x-a.x)/L, uy = (b.y-a.y)/L;
  const surUnTrou = (p: PtBrut) => trous.some(t => t.some((q, i) => {
    const r = au(t, (i+1)%t.length), dx = r.x-q.x, dy = r.y-q.y, l2 = dx*dx + dy*dy || 1e-12;
    const k = Math.max(0, Math.min(1, ((p.x-q.x)*dx + (p.y-q.y)*dy)/l2));
    return Math.hypot(p.x-(q.x+k*dx), p.y-(q.y+k*dy)) < 1e-3;
  }));
  const da = surUnTrou(a) ? largeurM : 0, db = surUnTrou(b) ? largeurM : 0;
  if(!da && !db) return simple;
  const a2 = { x:a.x - ux*da, y:a.y - uy*da }, b2 = { x:b.x + ux*db, y:b.y + uy*db };
  const long = empriseLame(a2, b2, largeurM, poly);
  const proches = trous.filter(t => t.some(p => pointInPolygon(p, long)) || long.some(p => pointInPolygon(p, t)));
  if(!proches.length) return simple;
  const milieu = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
  const morceaux = differencePolygones(long, proches);
  return morceaux.find(m => pointInPolygon(milieu, m.contour)) ?? simple;
}
// Shifts a boundary edge perpendicular to itself by distM (positive = away from the
// polygon's interior) - used to keep perimeter trim boards flush with the true edge instead
// of straddling it on its centerline.
// Parallel lines in direction `angleDeg`, spaced `spacingM` apart along the perpendicular,
// each clipped to where it crosses the polygon boundary. Used for solives/lambourdes/lames.
// Spacing is always measured from centroid(poly), so passing a `clipPoly` returns the very
// same family of lines merely cut shorter - which is what lets the screw layout sit under the
// drawn solives instead of beside them. Anchoring on the clip polygon's own centroid would
// shift every line by the offset between the two centroids.
export function generateParallelLines(poly: PtBrut[], angleDeg: number, spacingM: number, clipPoly?: PtBrut[] | null): Segment[] {
  if(spacingM<=0.01) return [];
  const rad = angleDeg*Math.PI/180;
  const dir = {x:Math.cos(rad), y:Math.sin(rad)};
  const perp = {x:-dir.y, y:dir.x};
  const c = centroid(poly);
  const target = clipPoly || poly;
  const projs = poly.map(p=>(p.x-c.x)*perp.x+(p.y-c.y)*perp.y);
  const minP=Math.min(...projs), maxP=Math.max(...projs);
  const lines: Segment[] = [];
  const start = Math.ceil(minP/spacingM)*spacingM;
  for(let off=start; off<=maxP; off+=spacingM){
    const origin = {x:c.x+perp.x*off, y:c.y+perp.y*off};
    clipLineToPolygon(origin, dir, target).forEach(s=>lines.push(s));
  }
  return lines;
}
// ---- foundation screw layout ----------------------------------------------------------
