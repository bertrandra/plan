// Isolignes d'une grille scalaire par « marching squares » (MD/spec-relief.md §5.3, geometry/).
//
// Une grille de valeurs (les altitudes du relief), un niveau : les lignes ou la grille vaut ce
// niveau, interpolees lineairement sur les aretes de chaque cellule. Chaque point d'une ligne est
// identifie par l'arete qui le porte, pas par ses coordonnees : deux segments voisins se raccordent
// ainsi exactement, sans arrondi ni seuil, et les lignes se recousent en polylignes fermees ou
// ouvertes. Une cellule dont un coin manque (sans donnee) n'est pas tracee.

import type { PtBrut } from '../model/types.js';

/** Ce que l'algorithme lit d'une grille : ses dimensions, une valeur et une position par noeud. */
export interface GrilleScalaire {
  nx: number;
  ny: number;
  /** La valeur au noeud (colonne `i`, ligne `j`), ou `null` : sans donnee. */
  valeur: (i: number, j: number) => number | null;
  /** La position du noeud dans le plan. */
  position: (i: number, j: number) => PtBrut;
}

/** Un point d'isoligne, sur une arete : horizontale (entre (i,j) et (i+1,j)) ou verticale (entre (i,j) et (i,j+1)). */
interface Arete { h: boolean; i: number; j: number }

const cleArete = (a: Arete): string => (a.h ? 'h' : 'v') + a.i + ',' + a.j;

/** Le point de l'arete ou la valeur passe par `niveau`, par interpolation lineaire. */
function pointSurArete(g: GrilleScalaire, a: Arete, niveau: number): PtBrut {
  const i2 = a.h ? a.i + 1 : a.i, j2 = a.h ? a.j : a.j + 1;
  const v1 = g.valeur(a.i, a.j) ?? 0, v2 = g.valeur(i2, j2) ?? 0;
  const p1 = g.position(a.i, a.j), p2 = g.position(i2, j2);
  const d = v2 - v1;
  const t = Math.abs(d) < 1e-12 ? 0.5 : Math.min(1, Math.max(0, (niveau - v1) / d));
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

/**
 * Les isolignes au niveau donne : des polylignes, dans le repere de `position`. Les points sont
 * ordonnes le long de chaque ligne ; une ligne fermee repete son premier point a la fin.
 */
export function isolignes(g: GrilleScalaire, niveau: number): PtBrut[][] {
  // Chaque segment relie deux aretes d'une cellule ; on garde, par arete, les segments qui y passent.
  const segments: [Arete, Arete][] = [];
  const parArete = new Map<string, number[]>();
  const noter = (a: Arete, s: number) => {
    const k = cleArete(a);
    const l = parArete.get(k);
    if (l) l.push(s); else parArete.set(k, [s]);
  };
  for (let j = 0; j < g.ny - 1; j++) {
    for (let i = 0; i < g.nx - 1; i++) {
      const v = [g.valeur(i, j), g.valeur(i + 1, j), g.valeur(i + 1, j + 1), g.valeur(i, j + 1)];
      if (v.some(x => x === null)) continue;
      const dessus = v.map(x => (x as number) >= niveau);
      // Les quatre aretes de la cellule, dans l'ordre haut, droite, bas, gauche.
      const aretes: Arete[] = [
        { h: true, i, j }, { h: false, i: i + 1, j }, { h: true, i, j: j + 1 }, { h: false, i, j }
      ];
      // Une arete est traversee quand ses deux coins sont de part et d'autre du niveau.
      const coins = [[0, 1], [1, 2], [2, 3], [3, 0]];
      const traversees = coins.map(([a, b]) => dessus[a as number] !== dessus[b as number]);
      const idx = traversees.map((t, k) => (t ? k : -1)).filter(k => k >= 0);
      if (idx.length === 2) {
        segments.push([aretes[idx[0] as number] as Arete, aretes[idx[1] as number] as Arete]);
      } else if (idx.length === 4) {
        // Un col : les deux paires sont choisies d'apres la valeur au centre de la cellule, pour
        // que les lignes ne se croisent pas.
        const centre = (v as number[]).reduce((s, x) => s + x, 0) / 4 >= niveau;
        const premierCoinDessus = dessus[0];
        if (centre === premierCoinDessus) {
          segments.push([aretes[0] as Arete, aretes[1] as Arete], [aretes[2] as Arete, aretes[3] as Arete]);
        } else {
          segments.push([aretes[3] as Arete, aretes[0] as Arete], [aretes[1] as Arete, aretes[2] as Arete]);
        }
      }
    }
  }
  segments.forEach(([a, b], s) => { noter(a, s); noter(b, s); });

  // Recoudre : on part d'une arete de bout (un seul segment), sinon de n'importe laquelle (ligne fermee).
  const vus = new Array<boolean>(segments.length).fill(false);
  const lignes: PtBrut[][] = [];
  const suivant = (arete: Arete, depuis: number): number | null => {
    const l = parArete.get(cleArete(arete)) ?? [];
    const s = l.find(x => x !== depuis && !vus[x]);
    return s === undefined ? null : s;
  };
  const parcourir = (depart: number, areteDepart: Arete): PtBrut[] => {
    const pts: PtBrut[] = [pointSurArete(g, areteDepart, niveau)];
    let s: number | null = depart;
    let arete = areteDepart;
    while (s !== null && !vus[s]) {
      vus[s] = true;
      const [a, b] = segments[s] as [Arete, Arete];
      arete = cleArete(a) === cleArete(arete) ? b : a;
      pts.push(pointSurArete(g, arete, niveau));
      s = suivant(arete, s);
    }
    return pts;
  };
  // D'abord les lignes ouvertes, depuis leurs bouts : une ligne fermee n'a pas de bout.
  for (const [k, l] of parArete) {
    if (l.length !== 1) continue;
    const s = l[0] as number;
    if (vus[s]) continue;
    const [a, b] = segments[s] as [Arete, Arete];
    lignes.push(parcourir(s, cleArete(a) === k ? a : b));
  }
  for (let s = 0; s < segments.length; s++) {
    if (vus[s]) continue;
    const [a] = segments[s] as [Arete, Arete];
    lignes.push(parcourir(s, a));
  }
  return lignes.filter(l => l.length >= 2);
}
