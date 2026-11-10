// Chemins : lecture d'un attribut `d` SVG (spec §3.2, geometry/path.ts).
//
// `pathD` et `polyStr` etaient restees dans legacy.ts a la phase 2 : elles appellent la
// transformation de la vue, qui n'existait pas encore comme objet. Elles l'ont rejointe en phase 4
// et vivent maintenant ici, la scene passee en parametre (voir plus bas).

import { sommetDe } from './anneau.js';
import type { PtBrut } from '../model/types.js';
import { versEcran, type EtatScene } from './vue.js';
import { estCourbe, tronconsBezier } from './courbe.js';

// Best-effort SVG path 'd' parser: reduces a path to an ordered list of {x,y} endpoint vertices,
// matching how this app already represents imported curves (plain polyline points, not bezier
// control points - a C command already only kept its endpoint before this fix). Handles
// M/L/H/V/C/S/Q/T/A/Z, both absolute and uppercase and relative/lowercase forms, and implicit
// repeated coordinate pairs after the initial command letter. Arc (A) commands are read (so
// their parameters don't corrupt the token stream) but only their endpoint is kept - drawing the
// true elliptical arc as a polyline is out of scope for a best-effort importer; document this
// limitation rather than silently misinterpreting the arc's numeric parameters as extra points,
// which is what the previous M/L/C-only parser did for H/V/Q/S/T/A.
export function parseSvgPathPoints(d: string): PtBrut[] {
  const tokens = String(d).match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const pts: PtBrut[] = [];
  let cur = {x:0,y:0}, start = {x:0,y:0};
  let cmd: string | null = null, i = 0;
  const isCmdTok = (t: string) => /^[MLHVCSQTAZ]$/i.test(t);
  // Un chemin tronque lit au-dela de sa fin : le nombre manquant vaut 0, comme un nombre illisible.
  const num = ()=>{ const v = parseFloat(tokens[i++] ?? ''); return Number.isFinite(v) ? v : 0; };
  while(i < tokens.length){
    const jeton = tokens[i];
    if(jeton !== undefined && isCmdTok(jeton)){ cmd = jeton; i++; }
    if(cmd===null) break;
    const rel: boolean = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if(C==='M'){
      const x=num(), y=num();
      cur = rel ? {x:cur.x+x, y:cur.y+y} : {x,y};
      start = {...cur};
      pts.push({...cur});
      cmd = rel ? 'l' : 'L'; // subsequent coordinate pairs without a new letter are implicit linetos
    } else if(C==='L'){
      const x=num(), y=num();
      cur = rel ? {x:cur.x+x, y:cur.y+y} : {x,y};
      pts.push({...cur});
    } else if(C==='H'){
      const x=num();
      cur = {x: rel ? cur.x+x : x, y:cur.y};
      pts.push({...cur});
    } else if(C==='V'){
      const y=num();
      cur = {x:cur.x, y: rel ? cur.y+y : y};
      pts.push({...cur});
    } else if(C==='C'){
      num();num(); num();num(); // two control points - not stored, endpoint-only representation
      const x=num(), y=num();
      cur = rel ? {x:cur.x+x, y:cur.y+y} : {x,y};
      pts.push({...cur});
    } else if(C==='S' || C==='Q'){
      num();num(); // one control point - not stored
      const x=num(), y=num();
      cur = rel ? {x:cur.x+x, y:cur.y+y} : {x,y};
      pts.push({...cur});
    } else if(C==='T'){
      const x=num(), y=num();
      cur = rel ? {x:cur.x+x, y:cur.y+y} : {x,y};
      pts.push({...cur});
    } else if(C==='A'){
      num();num();num();num();num(); // rx, ry, x-axis-rotation, large-arc-flag, sweep-flag - not stored
      const x=num(), y=num();
      cur = rel ? {x:cur.x+x, y:cur.y+y} : {x,y};
      pts.push({...cur});
    } else if(C==='Z'){
      cur = {...start};
      pts.push({...cur});
      cmd = null;
    } else {
      break; // unrecognized command letter: stop rather than risk mis-consuming tokens
    }
  }
  return pts;
}

// ---- Trace a l'ecran ----------------------------------------------------------------------
// Ces deux fonctions produisent des coordonnees d'ECRAN, pas du plan : elles ont donc besoin de
// la transformation de scene. C'est la raison pour laquelle elles etaient restees dans legacy.ts
// a la phase 2 - la scene n'existait pas encore comme objet. Elle est maintenant un parametre.

/** Liste de points pour l'attribut `points` d'un `<polygon>`, en pixels. */
export function polyStr(scene: EtatScene, pts: PtBrut[]): string {
  return pts
    .map((p) => {
      const s = versEcran(scene, p);
      return s.x + ',' + s.y;
    })
    .join(' ');
}

/**
 * Attribut `d` d'un `<path>`, en pixels.
 *
 * Sans lissage, une simple polyligne. Avec lissage, la courbe des chemins (geometry/courbe.ts),
 * calculee sur les points deja passes a l'ecran.
 */
export function pathD(scene: EtatScene, pts: PtBrut[], curve?: boolean): string {
  if (pts.length < 2) return '';
  const s = pts.map((p) => versEcran(scene, p));
  if (!estCourbe(s, curve)) {
    return 'M ' + s.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' L ');
  }
  const f = (p: PtBrut) => p.x.toFixed(1) + ',' + p.y.toFixed(1);
  let d = 'M ' + f(sommetDe(s, 0)) + ' ';
  for (const b of tronconsBezier(s)) d += 'C ' + f(b.c1) + ' ' + f(b.c2) + ' ' + f(b.p2) + ' ';
  return d;
}
