// Les travees des murs d'un corps (schema 14, decision du proprietaire du 4 novembre 2026) : un troncon d'un mur, sa nature (mur plein,
// poteaux, poteaux et garde-corps, ouvert) et son recul sous le toit.
//
// Le toit d'un corps ne change jamais avec ses travees : un mur qui recule laisse le toit continu au-dessus de lui (son debord grandit
// d'autant), un porche ouvert garde son toit. Ce module dit ce que la 3D et le Mode Toit en lisent :
//   - `contourAvecReculs` : le pied du corps, ses murs recules et ses travees ouvertes (le prisme, ses murs, les fenetres) ;
//   - `reculEn` : le recul d'un mur a une abscisse (un pignon dans un troncon recule recule avec lui) ;
//   - `segmentsDuMurBas` : le mur bas d'un appentis, troncon par troncon (poteaux, garde-corps, mur, rien) ;
//   - les gestes : poser une travee sur un mur, la regler, la retirer.
//
// Pur : pas de DOM, pas de scene.

import { repere } from '../toits/toitCorps.js';
import { murDuCorps } from './saillies.js';
import { RECUL_TRAVEE_MAX_M } from '../../model/corpsToitEtendu.js';
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

/** Un cote du pied d'un corps : de quel mur il vient (-1 : le retour d'un recul), son recul, et ce qu'il est (un mur, ou une travee ouverte). */
export interface CotePied { mur: number; recul: number; nature: NatureTravee }

/** Un corps ferme dont un mur a une travee ouverte (poteaux, garde-corps, rien) : son pied se dessine mur par mur, pas en prisme. */
export const aDesTraveesOuvertes = (c: CorpsToit): boolean => !c.saillie && (c.travees ?? []).some((t) => t.nature !== 'mur');

/**
 * Le pied du corps, ses murs recules et ses travees : le rectangle `pts`, ou chaque travee qui recule entre de son recul vers l'interieur,
 * et ou chaque travee ouverte (poteaux, garde-corps, rien) devient un cote a part. Rend les sommets et, pour chaque cote
 * (`pts[i] -> pts[i + 1]`), le mur dont il vient et sa nature. Sans recul ni travee ouverte, le rectangle tel quel.
 */
export function contourAvecReculs(c: CorpsToit): { pts: PtBrut[]; cotes: CotePied[] } {
  const utiles = (c.travees ?? []).some((t) => (t.reculM ?? 0) > 0 || t.nature !== 'mur');
  if (!utiles) return { pts: c.pts.slice(), cotes: c.pts.map((_, i) => ({ mur: i, recul: 0, nature: 'mur' as const })) };
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
    const plein: CotePied = { mur: m, recul: 0, nature: 'mur' };
    let x = 0;
    pousser(P(0, 0), plein);
    for (const t of traveesDuMur(c, m)) {
      if (t.de < x - 1e-6) continue;
      const d = t.nature === 'mur' ? t.reculM ?? 0 : 0;
      if (d > 0) {
        // Le mur jusqu'a la travee, le retour vers l'interieur, le mur recule, le retour vers le nu du mur.
        const retour: CotePied = { mur: -1, recul: d, nature: 'mur' };
        if (t.de > x) { cotes[cotes.length - 1] = plein; pousser(P(t.de, 0), retour); }
        else cotes[cotes.length - 1] = retour;
        pousser(P(t.de, d), { mur: m, recul: d, nature: 'mur' });
        pousser(P(t.a, d), retour);
        pousser(P(t.a, 0), plein);
      } else if (t.nature !== 'mur') {
        // Une travee ouverte : un cote a part, au nu du mur.
        if (t.de > x) { cotes[cotes.length - 1] = plein; pousser(P(t.de, 0), { mur: m, recul: 0, nature: t.nature }); }
        else cotes[cotes.length - 1] = { mur: m, recul: 0, nature: t.nature };
        pousser(P(t.a, 0), plein);
      } else continue;
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

/** Le recul que propose un decroche pose au point (en centimetres) : celui d'une travee posee par le catalogue. */
export const RECUL_DECROCHE_CM = 50;
/** Le plus court troncon que decroche un geste : en deca, ce n'est plus un decroche mais un pli du mur. */
export const DECROCHE_MIN_M = 0.3;

/**
 * Un recul tire ou saisi, au centimetre, colle aux 5 cm ronds quand il en est a moins de 1,5 cm (une aimantation douce : 40 cm se prend sans
 * viser, 42 cm reste possible), borne entre 0 et `RECUL_TRAVEE_MAX_M`.
 */
export function reculAimante(v: number): number {
  const b = Math.min(Math.max(v, 0), RECUL_TRAVEE_MAX_M), rond = Math.round(b * 20) / 20;
  return Math.abs(b - rond) < 0.015 ? rond : centi(b);
}

/**
 * Le decroche pose au point (demande du proprietaire, novembre 2026 : « je selectionne un point sur l'egout et je recule a droite ou a gauche
 * de x cm ») : une travee de mur reculee de `reculM`, du point `x` (en metres depuis `pts[mur]`) jusqu'au bout du mur du cote choisi (vu de
 * face, `gaucheAuDebut` : le debut du mur est a gauche), ou jusqu'au premier bord d'une autre travee ou d'un pignon de ce mur. Null : le
 * point est dans une travee, ou ce qui reste fait moins de `DECROCHE_MIN_M`.
 */
export function traveeDecrochee(c: CorpsToit, mur: number, x: number, cote: 'gauche' | 'droite', reculM: number, gaucheAuDebut: boolean): TraveeMur | null {
  const L = murDuCorps(c, mur).L, x0 = Math.min(Math.max(x, 0), L);
  if (traveesDuMur(c, mur).some((t) => x0 > t.de + 1e-6 && x0 < t.a - 1e-6)) return null;
  // Vers la droite vue de face : vers la fin du mur si son debut est a gauche, vers son debut sinon.
  const versLaFin = (cote === 'droite') === gaucheAuDebut;
  const s = repere(c.pts).L, pan = mur === 0 ? 0 : mur === 2 ? 1 : null;
  // Les bords qui arretent le decroche : ceux des autres travees du mur et, sur un long pan, ceux de ses pignons (en metres du mur).
  const bords = [...traveesDuMur(c, mur).flatMap((t) => [t.de, t.a]),
    ...(pan === null ? [] : c.pignons.filter((g) => g.pan === pan).flatMap((g) => [g.debut, g.fin].map((v) => (mur === 0 ? v : s - v))))];
  const fin = versLaFin ? Math.min(L, ...bords.filter((b) => b > x0 + 1e-6)) : Math.max(0, ...bords.filter((b) => b < x0 - 1e-6));
  const [de, a] = versLaFin ? [x0, fin] : [fin, x0];
  if (a - de < DECROCHE_MIN_M) return null;
  return { mur, de: centi(de), a: centi(a), nature: 'mur', reculM: Math.max(reculAimante(reculM), 0.01) };
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
