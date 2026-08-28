// Segments : projection, distance, angle, intersections (spec §3.2, geometry/segments.ts).
//
// Deplace depuis legacy.ts sans retouche : les gardes numeriques (1e-9, 1e-6, le bornage a
// [0.02, 0.98]) sont des choix deliberes du code d'origine, pas des approximations a nettoyer.
// Les commentaires anglais sont ceux de l'auteur, conserves tels quels.

import type { PtBrut } from '../model/types.js';
import { dist } from './basic.js';

interface FormeAPoints {
  type?: string;
  pts: PtBrut[];
}

export function projectOntoSegment(p: PtBrut, a: PtBrut, b: PtBrut): PtBrut {
  const abx=b.x-a.x, aby=b.y-a.y;
  const len2 = abx*abx+aby*aby || 1e-9;
  let t = ((p.x-a.x)*abx + (p.y-a.y)*aby)/len2;
  t = Math.max(0.02, Math.min(0.98, t));
  return {x:a.x+t*abx, y:a.y+t*aby};
}

export function distancePointSegment(p: PtBrut, a: PtBrut, b: PtBrut): number {
  const dx = b.x-a.x, dy = b.y-a.y;
  const l2 = dx*dx + dy*dy;
  if(l2 === 0) return Math.hypot(p.x-a.x, p.y-a.y);
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy)/l2));
  return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
}

/** Angle du segment a->b, en radians, dans le repere du plan (Y vers le nord). */
export function angleOfSegment(a: PtBrut, b: PtBrut): number { return Math.atan2(b.y-a.y, b.x-a.x); }

export function nearestSegmentIndex(obj: FormeAPoints, target: { a: PtBrut; b: PtBrut }): number {
  const mid = {x:(target.a.x+target.b.x)/2, y:(target.a.y+target.b.y)/2};
  const n = obj.pts.length;
  const edgeCount = obj.type==='path' ? n-1 : n;
  let best=-1, bestD=Infinity;
  for(let i=0;i<edgeCount;i++){
    const a=obj.pts[i], b=obj.pts[(i+1)%n];
    const m = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    const d = dist(m,mid);
    if(d<bestD){ bestD=d; best=i; }
  }
  return best;
}

// ---- geometry helpers (Mode Terrasse only: line generation clipped to a polygon) ----
export function lineSegIntersect(origin: PtBrut, dir: PtBrut, p1: PtBrut, p2: PtBrut): { t: number; point: PtBrut } | null {
  const ex=p2.x-p1.x, ey=p2.y-p1.y;
  const denom = dir.x*ey - dir.y*ex;
  if(Math.abs(denom)<1e-9) return null;
  const dx=p1.x-origin.x, dy=p1.y-origin.y;
  const t = (dx*ey - dy*ex)/denom;
  const s = (dir.y*dx - dir.x*dy)/denom;
  if(s < -1e-6 || s > 1+1e-6) return null;
  return { t, point:{x:origin.x+t*dir.x, y:origin.y+t*dir.y} };
}

// Intersection of two infinite lines (unlike clipLineToPolygon/lineSegIntersect, which bound
// one side to a finite segment). Used to re-miter corners when inset-ing a polygon.
export function lineLineIntersect(p1: PtBrut, d1: PtBrut, p2: PtBrut, d2: PtBrut): PtBrut | null {
  const denom = d1.x*d2.y - d1.y*d2.x;
  if(Math.abs(denom)<1e-9) return null;
  const dx=p2.x-p1.x, dy=p2.y-p1.y;
  const t = (dx*d2.y - dy*d2.x)/denom;
  return { x:p1.x+t*d1.x, y:p1.y+t*d1.y };
}
