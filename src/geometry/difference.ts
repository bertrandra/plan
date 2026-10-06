// Un polygone prive de ses trous (geometry/difference.ts).
//
// Une terrasse posee autour d'une piscine est percee par le bassin. Tant que le bassin est tout
// entier dans la terrasse, le trou est un anneau interieur et rien n'est a calculer. Des qu'il
// chevauche un bord, la terrasse change de contour : une encoche, ou plusieurs morceaux. La Vue 3D
// (qui extrude la terrasse) et le DXF (qui en ecrit le contour) ont besoin de cette forme vraie.
//
// Methode de Greiner et Hormann : on insere les points de croisement dans les deux contours, puis
// on suit le contour de la terrasse tant qu'il est hors du trou, et celui du trou, a rebours, tant
// qu'il est dans la terrasse. Le cas degenere (un sommet pose sur un cote, deux cotes confondus)
// n'a pas de reponse sure : on decale alors le trou d'un micron, ce qui ne se voit ni ne se mesure,
// et on recommence.

import { au } from '../util/tableaux.js';
import type { PtBrut } from '../model/types.js';
import { pointInPolygon, signedArea } from './basic.js';

/** Un morceau de polygone : son contour, et les trous qui le percent sans toucher son bord. */
export interface PolygoneTroue { contour: PtBrut[]; trous: PtBrut[][] }

interface Noeud {
  p: PtBrut;
  suivant: Noeud;
  precedent: Noeud;
  /** Le meme point de croisement, dans l'autre contour. */
  autre: Noeud | null;
  /** Croisement ou le contour de la terrasse entre dans le trou. */
  entree: boolean;
  vu: boolean;
}

interface Croisement { i: number; j: number; t: number; u: number; p: PtBrut }

const EPS = 1e-9;

/** Le sens trigonometrique : celui dans lequel le parcours ci-dessous est ecrit. */
function trigo(pts: PtBrut[]): PtBrut[] {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
}

/** Les croisements des deux contours ; `null` si l'un d'eux est degenere. */
function croisements(a: PtBrut[], b: PtBrut[]): Croisement[] | null {
  const res: Croisement[] = [];
  for (let i = 0; i < a.length; i++) {
    const a1 = au(a, i), a2 = au(a, (i + 1) % a.length);
    const dx = a2.x - a1.x, dy = a2.y - a1.y;
    for (let j = 0; j < b.length; j++) {
      const b1 = au(b, j), b2 = au(b, (j + 1) % b.length);
      const ex = b2.x - b1.x, ey = b2.y - b1.y;
      const den = dx * ey - dy * ex;
      const fx = b1.x - a1.x, fy = b1.y - a1.y;
      if (Math.abs(den) < EPS * Math.hypot(dx, dy) * Math.hypot(ex, ey)) {
        // Paralleles : sans importance s'ils sont distincts, degeneres s'ils sont sur une meme droite.
        if (Math.abs(fx * dy - fy * dx) < EPS * Math.hypot(dx, dy) * (1 + Math.hypot(fx, fy))) {
          const l2 = dx * dx + dy * dy;
          const s0 = (fx * dx + fy * dy) / l2, s1 = ((b2.x - a1.x) * dx + (b2.y - a1.y) * dy) / l2;
          if (Math.max(s0, s1) > -EPS && Math.min(s0, s1) < 1 + EPS) return null;
        }
        continue;
      }
      const t = (fx * ey - fy * ex) / den, u = (fx * dy - fy * dx) / den;
      if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) continue;
      // Un croisement sur un sommet : on ne sait pas s'il traverse ou s'il touche.
      if (t < EPS || t > 1 - EPS || u < EPS || u > 1 - EPS) return null;
      res.push({ i, j, t, u, p: { x: a1.x + t * dx, y: a1.y + t * dy } });
    }
  }
  return res;
}

/** Un contour en liste circulaire, les croisements inseres a leur place sur chaque cote. */
function chaine(pts: PtBrut[], cr: Croisement[], cote: (c: Croisement) => number, param: (c: Croisement) => number): { tete: Noeud; noeuds: Map<Croisement, Noeud> } {
  const noeuds = new Map<Croisement, Noeud>();
  const liste: Noeud[] = [];
  const nouveau = (p: PtBrut): Noeud => {
    const n = { p, autre: null, entree: false, vu: false } as unknown as Noeud;
    liste.push(n);
    return n;
  };
  pts.forEach((p, i) => {
    nouveau(p);
    cr.filter(c => cote(c) === i).sort((x, y) => param(x) - param(y)).forEach(c => noeuds.set(c, nouveau(c.p)));
  });
  liste.forEach((n, k) => { n.suivant = au(liste, (k + 1) % liste.length); n.precedent = au(liste, (k - 1 + liste.length) % liste.length); });
  return { tete: au(liste, 0), noeuds };
}

/** `a` prive de `b`, tous deux simples ; `null` si la position est degeneree. */
function priver(a: PtBrut[], b: PtBrut[]): PtBrut[][] | null {
  const cr = croisements(a, b);
  if (!cr) return null;
  if (!cr.length) {
    if (pointInPolygon(au(a, 0), b)) return [];
    // Un trou tout entier dedans n'est pas affaire de contour : l'appelant le garde en anneau.
    return [a];
  }
  const A = chaine(a, cr, c => c.i, c => c.t);
  const B = chaine(b, cr, c => c.j, c => c.u);
  for (const c of cr) {
    const na = A.noeuds.get(c), nb = B.noeuds.get(c);
    if (!na || !nb) return null;
    na.autre = nb; nb.autre = na;
  }
  // En suivant la terrasse depuis son premier sommet, chaque croisement fait entrer dans le trou
  // ou en sortir, alternativement.
  let dedans = pointInPolygon(au(a, 0), b);
  for (let n = A.tete.suivant; n !== A.tete; n = n.suivant) {
    if (n.autre) { n.entree = !dedans; dedans = !dedans; }
  }
  const morceaux: PtBrut[][] = [];
  for (let depart = A.tete.suivant; depart !== A.tete; depart = depart.suivant) {
    // Un morceau commence la ou la terrasse sort du trou.
    if (!depart.autre || depart.entree || depart.vu) continue;
    const anneau: PtBrut[] = [];
    let n: Noeud = depart;
    let garde = 0;
    do {
      // Sur la terrasse, en avant, jusqu'a rentrer dans le trou.
      do { n.vu = true; if (n.autre) n.autre.vu = true; anneau.push(n.p); n = n.suivant; } while (!n.autre);
      const entree = n.autre;
      if (n === depart || !entree) break;
      n.vu = true; entree.vu = true;
      // Sur le trou, a rebours, tant qu'il est dans la terrasse.
      n = entree;
      do { anneau.push(n.p); n = n.precedent; } while (!n.autre);
      n = n.autre;
      if (++garde > 4 * (a.length + b.length + cr.length)) return null;
    } while (n !== depart);
    if (anneau.length >= 3 && Math.abs(signedArea(anneau)) > 1e-9) morceaux.push(anneau);
  }
  return morceaux;
}

/**
 * `poly` prive des `trous` : un ou plusieurs morceaux (aucun si un trou le couvre). Un trou tout
 * entier a l'interieur reste un anneau du morceau qui le contient ; un trou qui chevauche le bord
 * en change le contour ; un trou dehors ne compte pas. Deux trous qui se chevauchent ne sont pas
 * fusionnes : le second ne s'applique alors qu'aux contours.
 */
export function differencePolygones(poly: readonly PtBrut[], trous: readonly PtBrut[][]): PolygoneTroue[] {
  let morceaux: PtBrut[][] = poly.length >= 3 ? [trigo([...poly])] : [];
  const interieurs: PtBrut[][] = [];
  trous.filter(t => t.length >= 3).forEach(t0 => {
    const t = trigo(t0);
    const suivants: PtBrut[][] = [];
    let interieur = false;
    morceaux.forEach(m => {
      let r: PtBrut[][] | null = null;
      // Decalages d'un micron au plus, dans des directions sans rapport avec un dessin a angles droits.
      for (let k = 0; k <= 4 && !r; k++) {
        const d = k * 1e-6;
        r = priver(m, k ? t.map(p => ({ x: p.x + d * 0.8137, y: p.y + d * 0.5813 })) : t);
      }
      if (!r) { suivants.push(m); return; }
      if (r.length === 1 && r[0] === m && t.every(p => pointInPolygon(p, m))) interieur = true;
      suivants.push(...r);
    });
    morceaux = suivants;
    if (interieur) interieurs.push(t0);
  });
  return morceaux.map(contour => ({ contour, trous: interieurs.filter(t => pointInPolygon(au(t, 0), contour)) }));
}
