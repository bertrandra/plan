// Contrainte rectangle (spec §3.2, geometry/rect.ts).

import { sommetDe } from './anneau.js';
import type { PtBrut } from '../model/types.js';

/** Cote minimale d'un rectangle : en dessous, le glissement est refuse plutot que de degenerer. */
export const RECT_MIN_M = 0.10;

interface FormeRect {
  type?: string;
  pts: PtBrut[];
  frozenVertices?: boolean[];
}

// ================= Geometry helpers =================
// Le mode rectangle se lit sur l'etat de gel des 4 coins - pas de drapeau separe, donc pas de
// migration pour les projets deja enregistres. Mais il doit CONTRAINDRE les angles, pas
// interdire toute modification : un rectangle qu'on ne peut plus redimensionner sans sortir du
// mode, puis y rentrer (ce qui le redresse sur sa boite englobante), est un cul-de-sac.
// Note de migration : la fonction rend `obj && ...`, donc `null` ou `undefined` - jamais `false` -
// quand on ne lui passe rien. Tous les appelants la lisent comme une valeur falsy, le comportement
// est donc juste, mais le type doit le dire. Le barreau 3 (strictNullChecks) fera remonter toute
// cette famille de cas ; d'ici la, on decrit la realite plutot que de la corriger (spec §10.3).
export function estRectangle(obj: FormeRect | null | undefined): boolean | null | undefined {
  return obj && obj.type==='polygon' && obj.pts.length===4 &&
         obj.frozenVertices && obj.frozenVertices.length===4 && obj.frozenVertices.every(Boolean);
}

// Reconstruit les 4 coins quand on tire le coin `idx` vers `w`. Le coin oppose ne bouge pas.
// On travaille dans le repere du rectangle lui-meme (les deux cotes issus du coin oppose), pas
// dans celui de l'ecran : un rectangle tourne reste ainsi manipulable sans se redresser.
export function rectangleDepuisCoin(pts: PtBrut[], idx: number, w: PtBrut): PtBrut[] | null {
  // Un rectangle a quatre coins : `estRectangle` le garantit chez l'appelant, la borne le redit ici.
  if(pts.length !== 4) return null;
  const opp = (idx+2)%4, O = sommetDe(pts, opp);
  const A = sommetDe(pts, opp+1), B = sommetDe(pts, opp+3);
  const lu = Math.hypot(A.x-O.x, A.y-O.y) || 1, lv = Math.hypot(B.x-O.x, B.y-O.y) || 1;
  const u = { x:(A.x-O.x)/lu, y:(A.y-O.y)/lu };
  const v = { x:(B.x-O.x)/lv, y:(B.y-O.y)/lv };
  const rel = { x:w.x-O.x, y:w.y-O.y };
  const a = rel.x*u.x + rel.y*u.y;
  const b = rel.x*v.x + rel.y*v.y;
  if(Math.abs(a) < RECT_MIN_M || Math.abs(b) < RECT_MIN_M) return null;
  const en = (ka: number, kb: number) => ({ x:O.x + u.x*ka + v.x*kb, y:O.y + u.y*ka + v.y*kb });
  const out: PtBrut[] = new Array(4);
  out[opp] = { x:O.x, y:O.y };
  out[(opp+1)%4] = en(a, 0);
  out[idx] = en(a, b);
  out[(opp+3)%4] = en(0, b);
  return out;
}

// Translation d'un cote perpendiculairement a lui-meme, les deux cotes voisins s'allongent.
// `ref` est la position du point i au DEBUT du glisser : partir de la position courante
// cumulerait le deplacement d'une image a l'autre et ferait fuir le cote.
export function rectangleDepuisCote(pts: PtBrut[], i: number, j: number, ref: PtBrut, dx: number, dy: number): PtBrut[] | null {
  if(pts.length !== 4) return null;
  const Pi = sommetDe(pts, i), Pj = sommetDe(pts, j);
  const ex = Pj.x-Pi.x, ey = Pj.y-Pi.y;
  const L = Math.hypot(ex,ey) || 1;
  const n = { x:-ey/L, y:ex/L };                 // normale au cote
  const t = dx*n.x + dy*n.y;                     // deplacement projete sur cette normale
  const nx = ref.x + t*n.x, ny = ref.y + t*n.y;
  const oppose = sommetDe(pts, i+2);
  if(Math.abs((nx-oppose.x)*n.x + (ny-oppose.y)*n.y) < RECT_MIN_M) return null;
  const decx = nx - Pi.x, decy = ny - Pi.y;
  const out = pts.map(p=>({...p}));
  out[i] = { x:Pi.x+decx, y:Pi.y+decy };
  out[j] = { x:Pj.x+decx, y:Pj.y+decy };
  return out;
}
