// Polygones : decoupe, decalage, bissectrices (spec §3.2, geometry/polygon.ts).
//
// Deplace depuis legacy.ts sans retouche. Les commentaires d'origine sont conserves : ils portent
// le raisonnement qui a coute cher (pourquoi la normale vient du sens de parcours et non d'un
// sondage, pourquoi les coins convexes s'arrondissent au lieu de s'onglet).

import type { PtBrut } from '../model/types.js';
import { signedArea, pointInPolygon } from './basic.js';
import { lineSegIntersect, lineLineIntersect } from './segments.js';

interface FormeAPoints {
  pts: PtBrut[];
}

// Every stretch of the line that lies inside the polygon, as a list of segments. A convex shape
// gives one; a concave one gives several, and taking only the outer envelope would run the
// piece straight across the notch - outside the terrasse - which is exactly what an L-shaped
// deck exposes. Each consecutive pair of crossings is kept or dropped on whether its midpoint
// is actually inside, which also copes with the line grazing a vertex and registering twice.
export function clipLineToPolygon(origin: PtBrut, dir: PtBrut, poly: PtBrut[]): { a: PtBrut; b: PtBrut }[] {
  const hits=[]; const n=poly.length;
  for(let i=0;i<n;i++){
    const hit = lineSegIntersect(origin, dir, poly[i], poly[(i+1)%n]);
    if(hit) hits.push(hit);
  }
  if(hits.length<2) return [];
  hits.sort((a,b)=>a.t-b.t);
  const out=[];
  for(let i=0;i<hits.length-1;i++){
    const t0=hits[i].t, t1=hits[i+1].t;
    if(t1-t0 < 1e-7) continue;
    const mid = {x:origin.x+dir.x*(t0+t1)/2, y:origin.y+dir.y*(t0+t1)/2};
    if(pointInPolygon(mid, poly)) out.push({ a:hits[i].point, b:hits[i+1].point });
  }
  return out;
}

// Shrinks a polygon inward by distM (each edge moved inward along its normal, corners
// re-mitered as the intersection of consecutive offset edges) so the result stays the same
// shape/angles, just smaller - used so the main lames field stops short to leave room for a
// perimeter border instead of running under it.
// Offsets every edge by distM - positive inward, negative outward - and re-miters the corners
// as the intersection of consecutive offset edges. Offsetting each edge on its own instead
// leaves a wedge of gap at every convex corner and lets the pieces cross over at every concave
// one, so a border laid that way stops following the outline as soon as the shape is not a
// plain rectangle.
// The inward normal comes from the winding, which is exact at any scale; probing a fixed
// distance to find the interior breaks on anything thinner than the probe.
export function polygonOffset(pts: PtBrut[], distM: number): PtBrut[] {
  const n = pts.length;
  if(Math.abs(distM) < 1e-9) return pts.map(p=>({...p}));
  const ccw = signedArea(pts) > 0;
  const offsetLines = pts.map((p,i)=>{
    const a=p, b=pts[(i+1)%n];
    const ex=b.x-a.x, ey=b.y-a.y; const L=Math.hypot(ex,ey)||1;
    const nx = ccw ? -ey/L :  ey/L;
    const ny = ccw ?  ex/L : -ex/L;
    return { origin:{x:a.x+nx*distM, y:a.y+ny*distM}, dir:{x:ex/L, y:ey/L} };
  });
  return pts.map((p,i)=>{
    const prev = offsetLines[(i-1+n)%n], cur = offsetLines[i];
    const pt = lineLineIntersect(prev.origin, prev.dir, cur.origin, cur.dir);
    return pt || {...p};
  });
}

// A closed ring of points as the list of its edges.
export function ringSegments(ring: PtBrut[]): { a: PtBrut; b: PtBrut }[] {
  return ring.map((p,i)=>({ a:p, b:ring[(i+1)%ring.length] }));
}

// Sutherland-Hodgman. The subject may be concave - an L-shaped terrasse is - but the clip has
// to be convex, which a board's rectangle always is. Used to give each board the end its own
// outline calls for: a board whose centreline stops on an oblique edge, drawn as a box, sticks
// out on one side and falls short on the other, which is what makes a run of them look like a
// staircase instead of a clean diagonal cut.
export function clipPolygonByConvex(subject: PtBrut[], clip: PtBrut[]): PtBrut[] {
  let out = subject.map(p=>({x:p.x, y:p.y}));
  const n = clip.length;
  const ccw = signedArea(clip) > 0;
  for(let i=0; i<n && out.length; i++){
    const a = clip[i], b = clip[(i+1)%n];
    const ex = b.x-a.x, ey = b.y-a.y;
    const cote = p => (ex*(p.y-a.y) - ey*(p.x-a.x)) * (ccw ? 1 : -1);
    const dedans = p => cote(p) >= -1e-9;
    const input = out; out = [];
    for(let j=0; j<input.length; j++){
      const P = input[j], Q = input[(j+1)%input.length];
      const pin = dedans(P), qin = dedans(Q);
      if(pin) out.push(P);
      if(pin !== qin){
        const dx = Q.x-P.x, dy = Q.y-P.y;
        const den = ex*dy - ey*dx;
        if(Math.abs(den) > 1e-12){
          const t = (ey*(P.x-a.x) - ex*(P.y-a.y)) / den;
          out.push({ x:P.x + t*dx, y:P.y + t*dy });
        }
      }
    }
  }
  return out;
}

export function exteriorBisector(obj: FormeAPoints, i: number): PtBrut {
  const n = obj.pts.length;
  const prev = obj.pts[(i-1+n)%n], cur = obj.pts[i], next = obj.pts[(i+1)%n];
  const u = {x:prev.x-cur.x, y:prev.y-cur.y}; const ul = Math.hypot(u.x,u.y)||1;
  const v = {x:next.x-cur.x, y:next.y-cur.y}; const vl = Math.hypot(v.x,v.y)||1;
  const un = {x:u.x/ul, y:u.y/ul}, vn = {x:v.x/vl, y:v.y/vl};
  let bis = {x:un.x+vn.x, y:un.y+vn.y};
  let bl = Math.hypot(bis.x,bis.y);
  if(bl < 1e-6){ bis = {x:-un.y, y:un.x}; bl = 1; } // u,v opposite (straight angle): use perpendicular
  bis = {x:bis.x/bl, y:bis.y/bl};
  // pick whichever side (bisector or its negation) actually lands outside the polygon
  const step = 0.05;
  const testPt = {x:cur.x+bis.x*step, y:cur.y+bis.y*step};
  return pointInPolygon(testPt, obj.pts) ? {x:-bis.x, y:-bis.y} : bis;
}

// "30 cm autour de l'equipement" veut dire une bande de 30 cm partout, pas un onglet. L'onglet
// est juste pour une planche de rive, qu'on coupe reellement en biseau ; applique a une zone de
// charge il degenere : mesure sur une emprise a 18 degres de pointe, une marge de 30 cm s'etirait
// en dard de 1,88 m et faisait poser des appuis a un metre de tout equipement. Les coins convexes
// sont donc arrondis - la zone est la somme de Minkowski de l'emprise et d'un disque de la marge,
// ce qui redonne exactement r + marge pour un spa rond. Les coins rentrants gardent l'onglet : la
// c'est bien l'intersection des deux bords decales qui borne la zone.
export function offsetZone(poly: PtBrut[], marge: number): PtBrut[] {
  const n = poly.length;
  if(!(marge > 1e-9) || n < 3) return poly.map(p=>({...p}));
  const ccw = signedArea(poly) > 0;
  const bords = poly.map((p,i)=>{
    const q = poly[(i+1)%n];
    const ex = q.x-p.x, ey = q.y-p.y, L = Math.hypot(ex,ey)||1;
    // Normale sortante : l'oppose de la normale interieure de polygonOffset.
    return { nx: ccw ? ey/L : -ey/L, ny: ccw ? -ex/L : ex/L, dx:ex/L, dy:ey/L };
  });
  const out = [];
  for(let i=0;i<n;i++){
    const p = poly[i];
    const a = bords[(i-1+n)%n], b = bords[i];
    const oa = { x:p.x + a.nx*marge, y:p.y + a.ny*marge };
    const ob = { x:p.x + b.nx*marge, y:p.y + b.ny*marge };
    const tourne = a.dx*b.dy - a.dy*b.dx;
    const convexe = ccw ? tourne > 1e-12 : tourne < -1e-12;
    if(convexe){
      const A0 = Math.atan2(oa.y-p.y, oa.x-p.x), A1 = Math.atan2(ob.y-p.y, ob.x-p.x);
      let d = A1 - A0;
      if(ccw){ while(d < 0) d += 2*Math.PI; } else { while(d > 0) d -= 2*Math.PI; }
      const pas = Math.max(1, Math.ceil(Math.abs(d)/(Math.PI/12)));   // un point tous les 15 deg
      for(let k=0;k<=pas;k++){
        const A = A0 + d*k/pas;
        out.push({ x:p.x + marge*Math.cos(A), y:p.y + marge*Math.sin(A) });
      }
    } else {
      const m = lineLineIntersect(oa, {x:a.dx,y:a.dy}, ob, {x:b.dx,y:b.dy});
      if(m) out.push(m); else { out.push(oa); out.push(ob); }
    }
  }
  // Un decalage vers l'exterieur ne peut qu'agrandir : si l'aire a diminue, c'est que la marge a
  // depasse une dimension de la forme et repliee le contour. On repart alors de l'emprise nue.
  const a0 = Math.abs(signedArea(poly)), a1 = Math.abs(signedArea(out));
  const sain = out.length >= 3 && out.every(p=>isFinite(p.x)&&isFinite(p.y)) && a1 >= a0;
  return sain ? out : poly.map(p=>({...p}));
}
