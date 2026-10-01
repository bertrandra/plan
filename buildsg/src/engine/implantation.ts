// Implantation : repere de tracage et cotes des appuis
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { au } from '../util/tableaux.js';
import { dist, pointInPolygon } from '../geometry/basic.js';
import { ensureConstruction } from './construction.js';
import { enPoints } from '../model/formes.js';
import type { CouchesTerrasse } from './layers.js';
import type { RoleAppui } from './structure.js';
import type { ObjetPlan, PtBrut, Segment } from '../model/types.js';

/** Un appui replace dans le repere de tracage : ses deux cotes, son role, et son numero de marquage. */
interface AppuiImplante extends PtBrut { role?: RoleAppui; n?: number }

/** Une piece porteuse a materialiser au cordeau, et les appuis a marquer le long d'elle. */
interface LignePorteuse { ref: string; type: string; seg: Segment }

/** Un appui a marquer le long d'une piece : a quelle distance de son depart, et sous quel numero. */
interface AppuiSurLigne { d: number; n?: number | undefined }

export function repereImplantation(obj: ObjetPlan){
  const c = ensureConstruction(obj);
  const pts = enPoints(obj).pts;
  const n = pts.length;
  const i0 = Math.min(c.segmentReference||0, n-1);
  const A = au(pts, i0), B = au(pts, (i0+1)%n);
  const ex = B.x-A.x, ey = B.y-A.y, L = Math.hypot(ex,ey) || 1;
  const ux = ex/L, uy = ey/L;
  let nx = -uy, ny = ux;
  const mid = { x:(A.x+B.x)/2, y:(A.y+B.y)/2 };
  if(!pointInPolygon({ x:mid.x+nx*0.01, y:mid.y+ny*0.01 }, pts)){ nx = -nx; ny = -ny; }
  return {
    origine:A, cote:i0, longueurCote:L,
    vers: (p: PtBrut) => ({ x:(p.x-A.x)*ux + (p.y-A.y)*uy, y:(p.x-A.x)*nx + (p.y-A.y)*ny })
  };
}
export function computeImplantation(obj: ObjetPlan, layers: CouchesTerrasse){
  const R = repereImplantation(obj);
  const pts = enPoints(obj).pts;
  const sommets = pts.map((p,i)=>({ i, ...R.vers(p) }));
  const appuis: AppuiImplante[] = layers.vis.map(p=>({ ...R.vers(p), role:p.role }));
  // Numerotes par rangee puis de gauche a droite : c'est l'ordre dans lequel on les marque,
  // un cordeau apres l'autre.
  appuis.sort((a,b)=> Math.abs(a.y-b.y) > 0.02 ? a.y-b.y : a.x-b.x);
  appuis.forEach((a,i)=>{ a.n = i+1; });
  // Regroupes par piece porteuse, pas par ordonnee : des que le contour est oblique, les appuis
  // d'une meme solive n'ont pas le meme Y et un regroupement par rangee les eparpille. Sur le
  // terrain on materialise une piece, puis on marque ses appuis au ruban le long d'elle - c'est
  // cette distance-la qu'il faut donner.
  const lignesPorteuses = ([] as LignePorteuse[]).concat(
    layers.cadre.map((s,i)=>({ ref:'C'+(i+1), type:'cadre', seg:s })),
    (layers.solives.length ? layers.solives : layers.lambourdes)
      .map((s,i)=>({ ref:'L'+(i+1), type:layers.solives.length?'solive':'lambourde', seg:s }))
  );
  const pris = new Set<number>();
  const lignes = lignesPorteuses.map(l=>{
    const A = l.seg.a, B = l.seg.b;
    const ex = B.x-A.x, ey = B.y-A.y, L = Math.hypot(ex,ey) || 1;
    const ux = ex/L, uy = ey/L;
    const sur: AppuiSurLigne[] = [];
    layers.vis.forEach((p,idx)=>{
      if(pris.has(idx)) return;
      const t = (p.x-A.x)*ux + (p.y-A.y)*uy;
      if(t < -0.02 || t > L+0.02) return;
      const ecart = Math.abs((p.x-A.x)*(-uy) + (p.y-A.y)*ux);
      if(ecart > 0.03) return;
      pris.add(idx);
      sur.push({ d:Math.max(0,t), n:appuis.find(a=>Math.abs(a.x-R.vers(p).x)<1e-9 &&
                                                   Math.abs(a.y-R.vers(p).y)<1e-9)?.n });
    });
    sur.sort((a,b)=>a.d-b.d);
    return { ...l, longueur:L, depart:R.vers(A), fin:R.vers(B), appuis:sur };
  }).filter(l=>l.appuis.length);
  // Diagonales : le seul controle qui prouve que le trace est d'equerre.
  const diagonales: { de: number; a: number; d: number }[] = [];
  const n = sommets.length;
  if(n === 4){
    diagonales.push({ de:0, a:2, d:dist(au(pts, 0), au(pts, 2)) });
    diagonales.push({ de:1, a:3, d:dist(au(pts, 1), au(pts, 3)) });
  } else {
    for(let i=0;i<n;i++){
      const j = (i + Math.floor(n/2)) % n;
      if(i < j) diagonales.push({ de:i, a:j, d:dist(au(pts, i), au(pts, j)) });
    }
  }
  const xs = sommets.map(s=>s.x), ys = sommets.map(s=>s.y);
  return { R, sommets, appuis, lignes, diagonales,
           bbox:{ x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys) } };
}

// ---- chantier : activites et durees ----------------------------------------------------
// Cadences en heures par unite, ordres de grandeur du metier pour une equipe qui sait faire, sur
// un chantier de particulier. Elles sont toutes reglables : une terrasse en fond de jardin sans
// acces engin n'a pas les memes que la meme terrasse devant un garage.
