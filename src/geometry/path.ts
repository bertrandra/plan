// Chemins : lecture d'un attribut `d` SVG (spec §3.2, geometry/path.ts).
//
// La spec range aussi `pathD` et `polyStr` ici, mais les deux appellent `toScreen()` : elles
// dependent de l'etat de la vue et ne sont donc pas des feuilles pures au sens de la phase 2.
// Elles restent dans legacy.ts jusqu'a ce qu'elles recoivent une projection en parametre
// (phase 4, quand l'etat devient explicite).

import type { PtBrut } from '../model/types.js';

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
  const pts = [];
  let cur = {x:0,y:0}, start = {x:0,y:0};
  let cmd = null, i = 0;
  const isCmdTok = t => /^[MLHVCSQTAZ]$/i.test(t);
  const num = ()=>{ const v = parseFloat(tokens[i++]); return Number.isFinite(v) ? v : 0; };
  while(i < tokens.length){
    if(isCmdTok(tokens[i])){ cmd = tokens[i]; i++; }
    if(cmd===null) break;
    const rel = cmd === cmd.toLowerCase();
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
