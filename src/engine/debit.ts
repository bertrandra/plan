// Debit : optimisation des coupes dans les longueurs disponibles
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { dist } from '../geometry/basic.js';
import { longueursBois, longueursDispo, longueursLambourde } from './bom.js';
import { ensureConstruction } from './construction.js';
import { longueurLameReelle } from './lames.js';
import { dimsSection, porteeVisM, sectionLambourde } from './structure.js';

export function optimiserDebitLames(runs, dispo, minReuseM, entraxeM, joints){
  const tol = 1e-6;
  const achats = {}, roles = {};
  let pool = [], reelMl = 0, achatMl = 0, perdueMl = 0;
  // Offcuts are tallied by where they end up, not lumped together: averaging a 2 m piece that
  // goes back in the pot with a 6 cm scrap produces a figure that describes neither.
  const noteRole = (L, key, chute) => {
    roles[L] = roles[L] || { entiere:0, ajustee:0, recoupee:0, troncon:0, rebutMl:0, potMl:0 };
    roles[L][key]++;
    const ch = chute || 0;
    if(ch >= minReuseM) roles[L].potMl += ch; else roles[L].rebutMl += ch;
  };
  // Length usable from a board of L, covering `reste` of a run. A piece that does not finish
  // the run has to end on a support, so it is cut to a whole number of spacings; a board too
  // short to reach even one support cannot serve in a jointed run at all.
  const utile = (L, reste) => {
    if(L >= reste - tol) return reste;
    if(!joints || entraxeM <= 0) return L;
    const k = Math.floor((L + tol) / entraxeM);
    return k > 0 ? k * entraxeM : 0;
  };
  // Cheapest board set covering one run, memoised on the remaining length.
  const memo = new Map();
  function plan(R){
    if(R <= tol) return { cout:0, pieces:[] };
    const key = Math.round(R*1e4);
    if(memo.has(key)) return memo.get(key);
    let best = null;
    for(const L of dispo){
      const u = utile(L, R);
      if(u <= tol) continue;
      const sub = plan(R - u);
      if(!sub) continue;
      const cout = L + sub.cout;
      if(!best || cout < best.cout - 1e-9){
        best = { cout, pieces:[{ L, u, finit: u >= R - tol }].concat(sub.pieces) };
      }
    }
    memo.set(key, best);
    return best;
  }
  runs.slice().sort((a,b)=>b-a).forEach(run=>{
    reelMl += run;
    const p = plan(run);
    if(!p) return;   // aucune longueur du stock ne peut servir sur cette travee
    p.pieces.forEach(pc=>{
      // Serve from the offcut pool first - the tightest saved piece that still covers it.
      let idx = -1, meilleurReste = Infinity;
      pool.forEach((L,i)=>{
        const reste = L - pc.u;
        if(reste >= -tol && reste < meilleurReste){ meilleurReste = reste; idx = i; }
      });
      if(idx >= 0){
        const L = pool.splice(idx,1)[0];
        const rem = L - pc.u;
        if(rem >= minReuseM) pool.push(rem); else perdueMl += rem;
        return;                                   // rien achete pour cette piece
      }
      achats[pc.L] = (achats[pc.L]||0) + 1;
      achatMl += pc.L;
      const rem = pc.L - pc.u;
      // Four distinct fates, because they mean different things on site: used as-is, trimmed to
      // length with a scrap, cut with a piece worth keeping, or a mid-run section between joints.
      noteRole(pc.L,
        rem <= tol ? 'entiere'
        : !pc.finit ? 'troncon'
        : rem >= minReuseM ? 'recoupee'
        : 'ajustee',
        rem);
      if(rem >= minReuseM) pool.push(rem); else perdueMl += rem;
    });
  });
  const restantMl = pool.reduce((s,x)=>s+x, 0);
  return { achats, roles, reelMl, achatMl, perdueMl, restantMl, pool:pool.slice().sort((a,b)=>b-a),
           chuteMl: achatMl - reelMl };
}
// Runs to cut: the deck boards themselves plus the flat border, which is the same product
// bought at the same time.
// Every load-bearing piece, cut out of stock lengths. A splice in a beam has to sit over a
// screw, so the same joint rule applies with the screw spacing standing in for the support
// spacing. Reported with the metre breakdown by role, since one cut-list covers all three.
// Returns one cut-list group per product actually bought. Lambourdes share the solives' group
// while they share their section - same piece, same order - and split into their own group with
// their own stock lengths and prices as soon as the section differs, because then they are a
// different product and mixing the two would price and cut them wrong.
export function computeDebitsBois(obj, layers){
  const c = ensureConstruction(obj);
  const ml = a => a.reduce((s,l)=>s+dist(l.a,l.b),0);
  const secS = c.soliveSection, secL = sectionLambourde(c);
  const wS = dimsSection(secS).b/1000, wL = dimsSection(secL).b/1000;
  const separe = secL !== secS && layers.lambourdes.length > 0;
  // Tuple et non tableau : ces trois valeurs sont etalees dans optimiserDebitLames, dont la
  // signature attend trois parametres distincts.
  const opt = [ (c.chuteMinReutilisable!==undefined ? c.chuteMinReutilisable : 50)/100,
                porteeVisM(c), c.jointsBoisSurAppui !== false ] as [number, number, boolean];
  // Same rule as the lames: a beam ending on an oblique edge is cut to its longest side. The
  // cadre follows the outline and is already mitred, so its own centreline is the right measure.
  const runsLamb = layers.lambourdes.map(s=>longueurLameReelle(s.a, s.b, wL, obj.pts));
  const runsPorteur = [].concat(
    layers.cadre.map(s=>dist(s.a,s.b)),
    layers.solives.map(s=>longueurLameReelle(s.a, s.b, wS, obj.pts)),
    separe ? [] : runsLamb
  );
  const avecLamb = layers.lambourdes.length > 0 && !separe;
  const roles = ['Cadre'];
  if(layers.solives.length) roles.push('solives');
  if(avecLamb) roles.push('lambourdes');
  const groupes = [{
    cle:'bois', section:secS,
    titre: roles.join(', ') + ' (' + secS + ')',
    champLongueurs:'longueursBois',
    parts: Object.assign({ cadre:ml(layers.cadre) } as Record<string, number>,
             layers.solives.length ? { solives:ml(layers.solives) } : {},
             avecLamb ? { lambourdes:ml(layers.lambourdes) } : {}),
    debit: optimiserDebitLames(runsPorteur.filter(L=>L>0.05), longueursBois(c), ...opt)
  }];
  if(separe){
    groupes.push({
      cle:'lambourde', section:secL, titre:'Lambourdes (' + secL + ')',
      champLongueurs:'longueursLambourde',
      parts:{ lambourdes: ml(layers.lambourdes) } as Record<string, number>,
      debit: optimiserDebitLames(runsLamb.filter(L=>L>0.05), longueursLambourde(c), ...opt)
    });
  }
  return groupes;
}
export function computeDebitLames(obj, layers){
  const c = ensureConstruction(obj);
  const largeurLameM = (c.largeurLame||140)/1000;
  // Measured on the longest side of each board, so an angled end orders the piece that actually
  // has to be cut rather than the shorter centreline.
  const runs = layers.lames.map(s=>longueurLameReelle(s.a, s.b, largeurLameM, layers.lamesFieldPoly))
    .concat(layers.lamePlat.map(s=>dist(s.a,s.b)))
    .filter(L=>L > 0.05);
  // Supports under the lames: the lambourdes when there are any, otherwise the solives.
  const entraxeAppui = (c.avecLambourde ? (c.lambourdeEntraxe||40) : (c.soliveEntraxe||40))/100;
  return optimiserDebitLames(runs, longueursDispo(c),
    (c.chuteMinReutilisable!==undefined ? c.chuteMinReutilisable : 50)/100,
    entraxeAppui, c.jointsSurAppui !== false);
}
