// Le debit du bois : couper des travees dans des longueurs de stock (MD/spec-ouvrages.md, etape 6.6).
//
// Partage par les ouvrages en bois : la terrasse (lames, solives, lambourdes : engine/debit.ts) et l'abri (engine/pergola.ts). Il
// ne connait d'aucun d'eux que des longueurs : les travees a couper, les longueurs achetables, la chute qui resservira. Il vivait
// dans le debit de la terrasse, et la pergola le lisait chez elle.
//
// Deplace sans retouche : l'ordre des operations est conserve tel quel (spec-migration-typescript.md §10.2).

import { au } from '../../util/tableaux.js';

/**
 * Ce que devient une barre d'une longueur donnee : quatre sorts, et deux totaux de chutes.
 *
 * Les distinguer n'est pas cosmetique — c'est ce qui separe une chute de 2 m qui repart dans le pot
 * d'un rebut de 6 cm. Les moyenner produirait un chiffre qui ne decrit ni l'un ni l'autre.
 */
export interface RolesLongueur {
  /** Posee telle quelle. */
  entiere: number;
  /** Recoupee, avec une chute trop courte pour resservir. */
  ajustee: number;
  /** Recoupee, avec une chute qui repart au pot. */
  recoupee: number;
  /** Troncon intermediaire d'une travee a joints. */
  troncon: number;
  rebutMl: number;
  potMl: number;
}

/** Un debit calcule : ce qu'on achete, ce qu'on pose, ce qu'on jette, ce qu'il reste. */
export interface Debit {
  /** Nombre de barres achetees, par longueur. */
  achats: Record<string, number>;
  roles: Record<string, RolesLongueur>;
  /** Metres reellement poses. */
  reelMl: number;
  achatMl: number;
  perdueMl: number;
  restantMl: number;
  /** Les chutes reutilisables restantes, de la plus longue a la plus courte. */
  pool: number[];
  chuteMl: number;
}

/** Une piece a prelever dans une barre : la longueur achetee, la longueur utile, et si elle finit la travee. */
interface PieceDebit { L: number; u: number; finit: boolean }

/** Le jeu de barres le moins cher couvrant une travee. */
interface PlanDebit { cout: number; pieces: PieceDebit[] }


export function optimiserDebitLames(
  runs: number[], dispo: number[], minReuseM: number, entraxeM: number, joints: boolean
): Debit {
  const tol = 1e-6;
  const achats: Record<string, number> = {}, roles: Record<string, RolesLongueur> = {};
  let pool: number[] = [];
  let reelMl = 0, achatMl = 0, perdueMl = 0;
  // Offcuts are tallied by where they end up, not lumped together: averaging a 2 m piece that
  // goes back in the pot with a 6 cm scrap produces a figure that describes neither.
  const noteRole = (L: number, key: 'entiere'|'ajustee'|'recoupee'|'troncon', chute: number) => {
    roles[L] = roles[L] || { entiere:0, ajustee:0, recoupee:0, troncon:0, rebutMl:0, potMl:0 };
    roles[L][key]++;
    const ch = chute || 0;
    if(ch >= minReuseM) roles[L].potMl += ch; else roles[L].rebutMl += ch;
  };
  // Length usable from a board of L, covering `reste` of a run. A piece that does not finish
  // the run has to end on a support, so it is cut to a whole number of spacings; a board too
  // short to reach even one support cannot serve in a jointed run at all.
  const utile = (L: number, reste: number) => {
    if(L >= reste - tol) return reste;
    if(!joints || entraxeM <= 0) return L;
    const k = Math.floor((L + tol) / entraxeM);
    return k > 0 ? k * entraxeM : 0;
  };
  // Cheapest board set covering one run, memoised on the remaining length.
  const memo = new Map<number, PlanDebit | null>();
  function plan(R: number): PlanDebit | null {
    if(R <= tol) return { cout:0, pieces:[] };
    const key = Math.round(R*1e4);
    if(memo.has(key)) return memo.get(key) as PlanDebit | null;
    let best: PlanDebit | null = null;
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
        const L = au(pool.splice(idx,1), 0);
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

// "3, 2.5, 2" -> [3, 2.5, 2], longest first. Tolerates commas, semicolons, spaces and the
// French decimal comma, because that is how the figure gets pasted off a merchant's page.
export function parseLongueurs(raw: unknown, defauts: number[]): number[] {
  const list: number[] = (raw || "").toString().split(/[;\s]+|,(?![0-9])/)
    .map(s=>parseFloat(s.replace(',','.')))
    .filter(v=>isFinite(v) && v>0.2);
  const uniq = [...new Set(list)].sort((a,b)=>b-a);
  return uniq.length ? uniq : defauts.slice();
}
