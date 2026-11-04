// Les travees des murs d'un corps (schema 14, decision du proprietaire du 4 novembre 2026) : un troncon d'un mur, sa nature (mur plein,
// poteaux, poteaux et garde-corps, ouvert) et son recul sous le toit.
//
// Le toit d'un corps ne change jamais avec ses travees : un mur qui recule laisse le toit continu au-dessus de lui (son debord grandit
// d'autant), un porche ouvert garde son toit. Ce module dit ce que la 3D et le Mode Toit en lisent :
//   - `contourAvecReculs` : le pied du corps, ses murs recules (le prisme, les fenetres) ;
//   - `reculEn` : le recul d'un mur a une abscisse (un pignon dans un troncon recule recule avec lui) ;
//   - `segmentsDuMurBas` : le mur bas d'un appentis, troncon par troncon (poteaux, garde-corps, mur, rien) ;
//   - les gestes : poser une travee sur un mur, la regler, la retirer.
//
// Pur : pas de DOM, pas de scene.

import { repere } from '../toits/toitCorps.js';
import { murDuCorps } from './saillies.js';
import type { CorpsToit, NatureTravee, PtBrut, TraveeMur } from '../../model/types.js';

const centi = (v: number) => Math.round(v * 100) / 100;

/** Les travees d'un mur, rangees de gauche a droite et bornees a sa longueur. */
export function traveesDuMur(c: CorpsToit, mur: number): TraveeMur[] {
  const L = murDuCorps(c, mur).L;
  return (c.travees ?? []).filter((t) => t.mur === mur).map((t) => ({ ...t, de: Math.max(0, t.de), a: Math.min(L, t.a) })).filter((t) => t.a - t.de > 0.01)
    .sort((p, q) => p.de - q.de);
}

/** Le recul du mur `mur` a l'abscisse `x` (depuis `pts[mur]`) : celui de la travee qui la contient, 0 sinon. */
export function reculEn(c: CorpsToit, mur: number, x: number): number {
  const t = traveesDuMur(c, mur).find((k) => x >= k.de - 1e-6 && x <= k.a + 1e-6 && (k.reculM ?? 0) > 0);
  return t?.reculM ?? 0;
}

/** Un cote du pied d'un corps : de quel mur il vient (-1 : le retour d'un recul), et son recul. */
export interface CotePied { mur: number; recul: number }

/**
 * Le pied du corps, ses murs recules : le rectangle `pts`, ou chaque travee qui recule entre de son recul vers l'interieur. Rend les
 * sommets et, pour chaque cote (`pts[i] -> pts[i + 1]`), le mur dont il vient. Sans recul, le rectangle tel quel.
 */
export function contourAvecReculs(c: CorpsToit): { pts: PtBrut[]; cotes: CotePied[] } {
  if (!(c.travees ?? []).some((t) => (t.reculM ?? 0) > 0)) return { pts: c.pts.slice(), cotes: c.pts.map((_, i) => ({ mur: i, recul: 0 })) };
  const pts: PtBrut[] = [], cotes: CotePied[] = [];
  const pousser = (p: PtBrut, cote: CotePied) => {
    const der = pts[pts.length - 1];
    if (der && Math.hypot(der.x - p.x, der.y - p.y) < 0.005) { cotes[cotes.length - 1] = cote; return; }
    pts.push({ x: centi(p.x), y: centi(p.y) });
    cotes.push(cote);
  };
  for (let m = 0; m < c.pts.length; m++) {
    const { a, u, n } = murDuCorps(c, m);
    // La normale de murDuCorps sort du corps : le recul va vers l'interieur, a l'oppose.
    const P = (x: number, d: number): PtBrut => ({ x: a.x + u.x * x - n.x * d, y: a.y + u.y * x - n.y * d });
    let x = 0;
    pousser(P(0, 0), { mur: m, recul: 0 });
    for (const t of traveesDuMur(c, m)) {
      const d = t.reculM ?? 0;
      if (d <= 0 || t.de < x - 1e-6) continue;
      // Le mur jusqu'a la travee, le retour vers l'interieur, le mur recule, le retour vers le nu du mur.
      if (t.de > x) { cotes[cotes.length - 1] = { mur: m, recul: 0 }; pousser(P(t.de, 0), { mur: -1, recul: d }); }
      else cotes[cotes.length - 1] = { mur: -1, recul: d };
      pousser(P(t.de, d), { mur: m, recul: d });
      pousser(P(t.a, d), { mur: -1, recul: d });
      pousser(P(t.a, 0), { mur: m, recul: 0 });
      x = t.a;
    }
  }
  // Le dernier cote ferme sur le premier sommet ; un sommet double a la fermeture se retire.
  const p0 = pts[0] as PtBrut, pn = pts[pts.length - 1] as PtBrut;
  if (pts.length > 1 && Math.hypot(p0.x - pn.x, p0.y - pn.y) < 0.005) { pts.pop(); cotes.pop(); }
  return { pts, cotes };
}

/** Un troncon du mur bas d'un appentis, le long de son faitage (`s` du corps) : sa nature. */
export interface SegmentMurBas { s0: number; s1: number; nature: NatureTravee }

/** Le mur bas d'un appentis : le mur 2 (t = W) quand le faitage est sur le mur 0, le mur 0 sinon. */
export const murBasDeLAppentis = (c: CorpsToit): number => (c.posFaitage <= 0.01 ? 2 : 0);

/**
 * Le mur bas d'un appentis, troncon par troncon le long de son faitage : les travees de ce mur, et ailleurs la nature par defaut (des
 * poteaux s'il est ouvert, un mur s'il est ferme).
 */
export function segmentsDuMurBas(c: CorpsToit, parDefaut: NatureTravee): SegmentMurBas[] {
  const L = repere(c.pts).L, mur = murBasDeLAppentis(c);
  // Le mur 0 va de s = 0 a s = L ; le mur 2, de s = L a s = 0.
  const versS = (x: number) => (mur === 0 ? x : L - x);
  const t = traveesDuMur(c, mur).map((k) => ({ s0: Math.min(versS(k.de), versS(k.a)), s1: Math.max(versS(k.de), versS(k.a)), nature: k.nature })).sort((p, q) => p.s0 - q.s0);
  const out: SegmentMurBas[] = [];
  let s = 0;
  for (const k of t) {
    if (k.s0 > s + 0.01) out.push({ s0: s, s1: k.s0, nature: parDefaut });
    if (k.s1 > Math.max(s, k.s0) + 0.01) out.push({ s0: Math.max(s, k.s0), s1: k.s1, nature: k.nature });
    s = Math.max(s, k.s1);
  }
  if (L > s + 0.01) out.push({ s0: s, s1: L, nature: parDefaut });
  return out;
}

/** Les reculs qu'offre l'inspecteur, en metres. */
export const RECULS_TRAVEE_M = [0, 0.25, 0.5, 1];

/**
 * Une travee neuve sur le mur `mur` du corps : la partie droite du mur (vue de face), a partir du bord du pignon de gauche s'il y en a un
 * (le volume du pignon reste devant, comme a AE 101), sinon du milieu. Sur le mur bas d'un appentis : un garde-corps entre ses poteaux ;
 * ailleurs : un mur recule de 50 cm sous le toit (un decroche).
 */
export function traveeNeuve(c: CorpsToit, mur: number, coupe: number, gaucheAuDebut = true): TraveeMur {
  const L = murDuCorps(c, mur).L;
  const appentisBas = c.ouvert !== undefined && (c.posFaitage <= 0.01 || c.posFaitage >= repere(c.pts).W - 0.01) && mur === murBasDeLAppentis(c);
  // `coupe` se compte depuis la gauche du mur vue de face ; `de` et `a`, depuis son debut (`pts[mur]`), qui peut etre a droite.
  const x = centi(Math.min(Math.max(coupe, 0), L - 0.5));
  const [de, a] = gaucheAuDebut ? [x, centi(L)] : [0, centi(L - x)];
  return appentisBas ? { mur, de, a, nature: 'garde-corps' } : { mur, de, a, nature: 'mur', reculM: 0.5 };
}
