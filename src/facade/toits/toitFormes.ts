// Les formes de toit que le dessin apprend apres les croupes (MD/spec-regles-toits.md §3, §4, §10) : le profil
// brise d'un pan (gambrel, Mansart), la demi-croupe et le brisis aux bouts, et les lucarnes.
//
// Un corps de ces formes est la **plus basse** de ses facettes planes : un toit a pentes qui diminuent vers le haut
// (brisis puis terrasson, croupe, demi-croupe) est concave, donc sa hauteur en un point est le minimum de ses plans.
// Chaque facette est alors la part du rectangle ou son plan est le plus bas (un polygone convexe, par coupes
// successives) : une seule regle pour les trois formes, les memes sommets partages, et la hauteur du toit en un
// point (`hauteurEtendue`) sort des memes plans que le dessin. Le debord de l'egout et la rive s'obtiennent en
// agrandissant le rectangle : les plans continuent sous l'egout, a leur pente.
//
// Pur, sans THREE. Un corps sans `profil` brise ni bout en demi-croupe ou brisis n'est pas concerne (`formeEtendue`
// rend null) : il garde le dessin d'avant a l'identique (three/toitCorps3d.ts), AE 101 compris. Les combinaisons
// que le dessin ne sait pas faire (un brisis avec une croupe, une demi-croupe avec un profil brise, des pignons
// traversants sur un pan brise) rendent aussi null : une forme que la 3D ne sait pas dessiner n'est pas produite.

import { couperDemiPlan } from './toit.js';
import { signedArea } from '../../geometry/basic.js';
import type { BoutToit, CorpsToit, DemiCroupe, ElementDeToit, Lucarne, PignonToit, PtBrut } from '../../model/types.js';

import { estSpecial, facettesSpeciales, hauteurSpeciale, type Sommet, type Debords } from './toitSpeciaux.js';
export type { Sommet, Debords };

/** Un plan z = a s + b t + c, dans le repere du corps. */
interface Plan { a: number; b: number; c: number }
const zDe = (p: Plan, s: number, t: number): number => p.a * s + p.b * t + p.c;

/** Le plan par trois sommets (s, t, z) ; null s'ils sont alignes dans le plan (s, t). */
function planPar3(A: Sommet, B: Sommet, C: Sommet): Plan | null {
  const ux = B.s - A.s, uy = B.t - A.t, vx = C.s - A.s, vy = C.t - A.t;
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-9) return null;
  const uz = B.z - A.z, vz = C.z - A.z;
  const a = (uz * vy - uy * vz) / det, b = (ux * vz - uz * vx) / det;
  return { a, b, c: A.z - a * A.s - b * A.t };
}

/** La largeur minimale d'un brisis ou d'une demi-croupe pour que sa forme tienne. */
const MIN_M = 0.2;

export interface FormeEtendue {
  /** Par pan : le bris (largeur du brisis a plat, hauteur de la ligne de bris au-dessus du sol) ; null : pente droite. */
  bris: [{ lb: number; hb: number } | null, { lb: number; hb: number } | null];
  bouts: [BoutToit, BoutToit];
  /** `mansart` : brisis aux bouts et bris des deux cotes ; `gambrel` : bris, bouts en pignon ; `demi-croupe`. */
  famille: 'mansart' | 'gambrel' | 'demi-croupe';
}

type CorpsForme = Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts' | 'croupes'> & Partial<Pick<CorpsToit, 'profil' | 'bouts' | 'pignons' | 'speciale'>>;

/** Les bouts d'un corps : ceux qu'il porte, sinon ceux que disent ses croupes. */
function boutsDe(c: CorpsForme): [BoutToit, BoutToit] {
  if (c.bouts) return c.bouts;
  const [h0, h1] = c.croupes ?? [0, 0];
  return [h0 > 0 ? { type: 'croupe', profondeurM: h0 } : { type: 'pignon' }, h1 > 0 ? { type: 'croupe', profondeurM: h1 } : { type: 'pignon' }];
}

/** Le bris valide d'un pan : entre l'egout et le faitage, a une distance qui reste dans le pan ; sinon null (pente droite). */
function brisDe(c: CorpsForme, n: 0 | 1, W: number): { lb: number; hb: number } | null {
  const pr = c.profil?.[n];
  if (!pr || pr.type !== 'brise') return null;
  const largeur = n === 0 ? c.posFaitage : W - c.posFaitage, e = c.egouts[n];
  if (!(pr.largeurBrisisM >= MIN_M && pr.largeurBrisisM <= largeur - MIN_M && pr.hauteurBrisM > e + 0.05 && pr.hauteurBrisM < c.faitage - 0.05)) return null;
  return { lb: pr.largeurBrisisM, hb: pr.hauteurBrisM };
}

/**
 * Ce que le corps a de plus qu'un toit a croupes, et si le dessin sait le faire ; null sinon (le dessin d'avant).
 * `L` et `W` : le rectangle du corps.
 */
export function formeEtendue(c: CorpsForme, L: number, W: number): FormeEtendue | null {
  const p = c.posFaitage;
  if (c.faitage - Math.min(...c.egouts) < 0.05 || !(p > 0.01 && p < W - 0.01)) return null;
  const bris: FormeEtendue['bris'] = [brisDe(c, 0, W), brisDe(c, 1, W)];
  const bouts = boutsDe(c);
  const brisis = bouts.filter((b) => b.type === 'brisis').length, demi = bouts.filter((b) => b.type === 'demi-croupe').length;
  const croupe = bouts.some((b) => b.type === 'croupe');
  if (!bris[0] && !bris[1] && !brisis && !demi) return null;
  // Des pignons traversants : seulement sur des pans droits a demi-croupe (le dessin les entaille, `entaillerPourPignons`). Un pan brise
  // ou un brisis avec des pignons reste au dessin d'avant (null), comme avant le 5 novembre 2026.
  if (c.pignons?.length && (brisis || bris[0] || bris[1])) return null;
  if (brisis) return brisis === 2 && bris[0] && bris[1] && L > 0 ? { bris, bouts, famille: 'mansart' } : null;
  if (bris[0] || bris[1]) return !croupe && !demi ? { bris, bouts, famille: 'gambrel' } : null;
  return { bris, bouts, famille: 'demi-croupe' };
}

/** La hauteur du pan `n` a la distance `d` de son mur d'egout (negative sous le debord), bris compris. */
function hauteurPan(c: CorpsForme, W: number, n: 0 | 1, d: number, bris: { lb: number; hb: number } | null): number {
  const largeur = n === 0 ? c.posFaitage : W - c.posFaitage, e = c.egouts[n], F = c.faitage;
  if (!bris || d <= bris.lb) return e + ((bris ? bris.hb : F) - e) * d / (bris ? bris.lb : largeur);
  return bris.hb + (F - bris.hb) * (d - bris.lb) / (largeur - bris.lb);
}

/**
 * La coupe d'une demi-croupe (cul de geai) : la hauteur `zc` du pied de la petite croupe (le haut du pignon tronque), sa pente `g` (la
 * montee par metre a plat, du pied vers le faitage), et le debord `D` du faitage devant le mur. `egout` : l'egout le plus haut des deux
 * pans qu'elle coupe ; `F` : le faitage. Une seule regle pour le bout d'un corps et la pointe d'un pignon.
 */
export function coupeDemiCroupe(b: DemiCroupe, egout: number, F: number): { zc: number; g: number; D: number } {
  const h = Math.max(b.profondeurM, MIN_M), zc = Math.min(egout + Math.max(b.hauteurPignonM, 0.1), F - 0.05);
  return { zc, g: (F - zc) / h, D: Math.max(0, Math.min(DEBORD_FAITAGE_MAX_M, b.debordFaitageM ?? 0)) };
}

/** Le debord du faitage d'une demi-croupe ne depasse pas cette longueur, en metres (au-dela, c'est un auvent, pas un toit). */
export const DEBORD_FAITAGE_MAX_M = 2.5;

/** Les plans qui bornent le toit par le haut : ses pans (un par pente), puis ses bouts. */
function plansDe(c: CorpsForme, L: number, W: number, f: FormeEtendue): Plan[] {
  const p = c.posFaitage, F = c.faitage, [e0, e1] = c.egouts;
  const plans: Plan[] = [];
  // Les pans : z = e + k d, d = t (pan 0) ou W - t (pan 1) ; chaque pente d'un pan brise est un plan.
  const pente = (n: 0 | 1, d0: number, z0: number, d1: number, z1: number) => {
    const k = (z1 - z0) / (d1 - d0);
    return n === 0 ? { a: 0, b: k, c: z0 - k * d0 } : { a: 0, b: -k, c: z0 + k * (W - d0) };
  };
  ([0, 1] as const).forEach((n) => {
    const largeur = n === 0 ? p : W - p, e = c.egouts[n], b = f.bris[n];
    if (b) { plans.push(pente(n, 0, e, b.lb, b.hb)); plans.push(pente(n, b.lb, b.hb, largeur, F)); } else plans.push(pente(n, 0, e, largeur, F));
  });
  // Un bout, a la distance u de son mur (u = s au bout 0, L - s au bout 1) : z = base(t) + g u.
  const bout = (i: 0 | 1, b: BoutToit) => {
    const dep = (q: Plan): Plan => (i === 0 ? q : { a: -q.a, b: q.b, c: q.c + q.a * L });
    const eT = (t: number) => e0 + ((e1 - e0) * t) / W;
    const base = { a: 0, b: (e1 - e0) / W, c: e0 };
    if (b.type === 'croupe') {
      const h = Math.max(b.profondeurM, MIN_M), g = (F - eT(p)) / h;
      plans.push(dep({ a: g, b: base.b, c: base.c }));
    } else if (b.type === 'demi-croupe') {
      // Le pied de la petite croupe est a zc, a D devant le mur (le faitage qui deborde la porte en avant) ; D nul : sur le mur.
      const { zc, g, D } = coupeDemiCroupe(b, Math.max(e0, e1), F);
      plans.push(dep({ a: g, b: 0, c: zc + g * D }));
    } else if (b.type === 'brisis') {
      const [b0, b1] = f.bris as [{ lb: number; hb: number }, { lb: number; hb: number }];
      const w = Math.max(b.largeurM, MIN_M);
      // Le brisis du bout : de l'egout du bout a la ligne de bris, a w du mur.
      plans.push(dep({ a: (b0.hb - eT(b0.lb)) / w, b: base.b, c: base.c }));
      // Le terrasson du bout : de cette ligne au bout du faitage, a w + (p - lb) du mur (la pente des aretiers, a 45 degres).
      const R = w + Math.max(p - b0.lb, MIN_M);
      const q = planPar3({ s: w, t: b0.lb, z: b0.hb }, { s: w, t: W - b1.lb, z: b1.hb }, { s: R, t: p, z: F });
      if (q) plans.push(dep(q));
    }
  };
  bout(0, f.bouts[0]);
  bout(1, f.bouts[1]);
  return plans;
}

const memo = new WeakMap<object, { L: number; W: number; f: FormeEtendue | null; plans: Plan[] }>();
function formeDe(c: CorpsForme, L: number, W: number): { f: FormeEtendue; plans: Plan[] } | null {
  const vu = memo.get(c);
  if (vu && vu.L === L && vu.W === W) return vu.f ? { f: vu.f, plans: vu.plans } : null;
  const f = formeEtendue(c, L, W);
  const plans = f ? plansDe(c, L, W, f) : [];
  memo.set(c, { L, W, f, plans });
  return f ? { f, plans } : null;
}

/** La hauteur du toit au point (s, t) d'un corps de forme etendue ; null pour les autres (le dessin d'avant). */
export function hauteurEtendue(c: CorpsForme, L: number, W: number, s: number, t: number): number | null {
  const special = hauteurSpeciale(c, L, W, s, t);
  if (special !== null) return special;
  const x = formeDe(c, L, W);
  return x ? Math.min(...x.plans.map((p) => zDe(p, s, t))) : null;
}

/** Le polygone sans sommets doubles : une coupe qui passe par un sommet le laisse deux fois, et les facettes ne se retrouvent plus (plan, triangulation). */
function sansDoublons(poly: PtBrut[]): PtBrut[] {
  const proche = (a: PtBrut, b: PtBrut) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  const out = poly.filter((q, i) => i === 0 || !proche(q, poly[i - 1] as PtBrut));
  while (out.length > 1 && proche(out[0] as PtBrut, out[out.length - 1] as PtBrut)) out.pop();
  return out;
}

/** Les facettes d'un ensemble de plans sur une region convexe : la part ou chacun est le plus bas, coupee encore par `garder` (f <= 0). */
function facettesMin(region: PtBrut[], plans: readonly Plan[], garder: (p: Plan) => readonly ((m: PtBrut) => number)[] = () => []): Sommet[][] {
  const out: Sommet[][] = [];
  plans.forEach((p, i) => {
    let poly = region;
    for (let j = 0; j < plans.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const q = plans[j] as Plan;
      poly = couperDemiPlan(poly, (m) => zDe(p, m.x, m.y) - zDe(q, m.x, m.y));
    }
    for (const f of garder(p)) if (poly.length >= 3) poly = couperDemiPlan(poly, f);
    poly = sansDoublons(poly);
    if (poly.length >= 3 && Math.abs(signedArea(poly)) > 1e-3) out.push(poly.map((m) => ({ s: m.x, t: m.y, z: zDe(p, m.x, m.y) })));
  });
  return out;
}

/** Une demi-croupe dont le faitage deborde plus loin que la rive : le pied de sa croupe, en avant du mur, et la rive qu'elle depasse. */
interface Capuchon { send: number; dehors: -1 | 1; zc: number; D: number; rive: number }

/** Les bouts en demi-croupe dont le faitage deborde au-dela de la rive : un capuchon en avant du pignon tronque. */
function capuchons(c: CorpsForme, L: number, f: FormeEtendue, d: Debords): Capuchon[] {
  const out: Capuchon[] = [];
  ([0, 1] as const).forEach((i) => {
    const b = f.bouts[i];
    if (b.type !== 'demi-croupe') return;
    const { zc, D } = coupeDemiCroupe(b, Math.max(...c.egouts), c.faitage), rive = i === 0 ? d.rive0 : d.rive1;
    if (D > rive + 1e-6) out.push({ send: i === 0 ? 0 : L, dehors: i === 0 ? -1 : 1, zc, D, rive });
  });
  return out;
}

/**
 * Les pans d'un corps entailles par ses pignons traversants, comme le dessin d'avant (three/toitCorps3d.ts, `pan`) : de chaque pignon,
 * on retire la part du pan sous ses deux noues, du pied du pignon sur le mur (ou de la rive, quand il touche le bout du corps) jusqu'au
 * bout de son faitage. Sans cela, le grand pan et son debord passaient sous le pignon et ressortaient devant son triangle. Chaque
 * facette (plane, convexe) se coupe en morceaux convexes : la part hors de la noue gauche, puis la part hors de la noue droite.
 */
export function entaillerPourPignons(pans: readonly Sommet[][], pignons: readonly PignonToit[] | undefined, L: number, W: number, d: Pick<Debords, 'rive0' | 'rive1'>, largeurs: readonly [number, number]): Sommet[][] {
  if (!pignons?.length) return pans.slice();
  let morceaux: PtBrut[][] = [], plans: Plan[] = [];
  const out: Sommet[][] = [];
  for (const f of pans) {
    const pl = f.length >= 3 ? planPar3(f[0] as Sommet, f[1] as Sommet, f[2] as Sommet) : null;
    if (!pl) { out.push(f); continue; }
    morceaux = [f.map((q) => ({ x: q.s, y: q.t }))];
    plans = [pl];
    for (const g of pignons) {
      const largeur = largeurs[g.pan], D = Math.max(0.1, Math.min(largeur, g.profondeur)), sc = (g.debut + g.fin) / 2;
      const a = g.debut <= 0.3 ? -d.rive0 : g.debut, b = g.fin >= L - 0.3 ? L + d.rive1 : g.fin;
      if (!(sc - a > 1e-6 && b - sc > 1e-6)) continue;
      // La distance au mur d'egout du pan du pignon, et les noues : d <= D (s - a) / (sc - a), d <= D (b - s) / (b - sc).
      const dist = (m: PtBrut) => (g.pan === 0 ? m.y : W - m.y);
      const noueG = (m: PtBrut) => dist(m) - (D * (m.x - a)) / (sc - a), noueD = (m: PtBrut) => dist(m) - (D * (b - m.x)) / (b - sc);
      const suivants: PtBrut[][] = [];
      for (const poly of morceaux) {
        const hors1 = sansDoublons(couperDemiPlan(poly, (m) => -noueG(m)));
        const hors2 = sansDoublons(couperDemiPlan(couperDemiPlan(poly, noueG), (m) => -noueD(m)));
        for (const q of [hors1, hors2]) if (q.length >= 3 && Math.abs(signedArea(q)) > 1e-4) suivants.push(q);
      }
      morceaux = suivants;
    }
    const p0 = plans[0] as Plan;
    for (const q of morceaux) out.push(q.map((m) => ({ s: m.x, t: m.y, z: zDe(p0, m.x, m.y) })));
  }
  return out;
}

/** Les facettes planes du toit, dans le repere du corps. `debord` : l'egout (en t) et la rive (en s) que le dessin prolonge. */
export function facettesEtendues(c: CorpsForme, L: number, W: number, d: Debords, bas: number): { pans: Sommet[][]; murs: Sommet[][] } | null {
  // Un toit a profil libre ou de revolution (toitSpeciaux.ts) : ni faitage ni plans a couper.
  const special = facettesSpeciales(c, L, W, d, bas);
  if (special) return c.speciale ? special : { ...special, pans: entaillerPourPignons(special.pans, c.pignons, L, W, d, [c.posFaitage, W - c.posFaitage]) };
  const x = formeDe(c, L, W);
  if (!x) return null;
  const { plans, f } = x;
  // Les plans qui se confondent ne font qu'une facette.
  const uniques = plans.filter((p, i) => plans.findIndex((q) => Math.abs(q.a - p.a) + Math.abs(q.b - p.b) + Math.abs(q.c - p.c) < 1e-9) === i);
  const rect: PtBrut[] = [{ x: -d.rive0, y: -d.egout0 }, { x: L + d.rive1, y: -d.egout0 }, { x: L + d.rive1, y: W + d.egout1 }, { x: -d.rive0, y: W + d.egout1 }];
  const pans: Sommet[][] = facettesMin(rect, uniques);
  // Le capuchon d'une demi-croupe au faitage debordant (schema 15) : au-dela de la rive, le toit n'existe qu'au-dessus du pied de sa
  // croupe ; dessous, une sous-face horizontale du mur jusqu'a son bord.
  const caps = capuchons(c, L, f, d);
  const murs: Sommet[][] = [];
  for (const k of caps) {
    const s0 = k.send + k.dehors * k.rive, s1 = k.send + k.dehors * k.D;
    const bande: PtBrut[] = [{ x: Math.min(s0, s1), y: -d.egout0 }, { x: Math.max(s0, s1), y: -d.egout0 }, { x: Math.max(s0, s1), y: W + d.egout1 }, { x: Math.min(s0, s1), y: W + d.egout1 }];
    pans.push(...facettesMin(bande, uniques, (p) => [(m) => k.zc - zDe(p, m.x, m.y)]));
    // La sous-face : entre les deux points ou les pans atteignent le pied de la croupe.
    const [t0, t1] = ([0, 1] as const).map((n) => { const q = plans[n] as Plan; return Math.abs(q.b) > 1e-9 ? (k.zc - q.c) / q.b : n === 0 ? 0 : W; }) as [number, number];
    if (t1 - t0 > 0.05) murs.push([{ s: k.send, t: t0, z: k.zc }, { s: s1, t: t0, z: k.zc }, { s: s1, t: t1, z: k.zc }, { s: k.send, t: t1, z: k.zc }]);
  }
  // Les murs de bout : du prisme jusqu'au toit, la ou aucune croupe ne les couvre ; sous un capuchon, jusqu'a son pied.
  for (const send of [0, L]) {
    const cap = caps.find((k) => k.send === send);
    const ts = new Set<number>([0, W]);
    for (let i = 0; i < uniques.length; i++) for (let j = i + 1; j < uniques.length; j++) {
      const A = uniques[i] as Plan, B = uniques[j] as Plan;
      if (Math.abs(A.b - B.b) < 1e-9) continue;
      const t = -((A.a - B.a) * send + (A.c - B.c)) / (A.b - B.b);
      if (t > 1e-6 && t < W - 1e-6) ts.add(Math.round(t * 1e6) / 1e6);
    }
    if (cap) for (const q of uniques) if (Math.abs(q.b) > 1e-9) { const t = (cap.zc - q.a * send - q.c) / q.b; if (t > 1e-6 && t < W - 1e-6) ts.add(Math.round(t * 1e6) / 1e6); }
    const prof = [...ts].sort((a, b) => a - b).map((t) => ({ s: send, t, z: Math.min(cap ? cap.zc : Infinity, ...uniques.map((p) => zDe(p, send, t))) }));
    // Sans les sommets alignes : une facette de moins a trianguler.
    const nets = prof.filter((m, k) => {
      const a = prof[k - 1], b = prof[k + 1];
      return !a || !b || Math.abs((m.t - a.t) * (b.z - a.z) - (m.z - a.z) * (b.t - a.t)) > 1e-7;
    });
    const mur = [{ s: send, t: 0, z: bas }, ...nets, { s: send, t: W, z: bas }];
    const aire = mur.reduce((acc, m, k) => { const n = mur[(k + 1) % mur.length] as Sommet; return acc + (m.t * n.z - n.t * m.z); }, 0) / 2;
    if (Math.abs(aire) > 1e-3) murs.push(mur);
  }
  return { pans: entaillerPourPignons(pans, c.pignons, L, W, d, [c.posFaitage, W - c.posFaitage]), murs };
}

/** Un sommet dans le repere d'un pignon traversant : `s` le long du faitage du corps, `d` depuis le mur d'egout du pan qui le porte. */
export interface SommetPignon { s: number; d: number; z: number }

/** Ce qui situe un pignon dans son pan, tel que le dessin d'avant le calcule (three/toitCorps3d.ts) : ses bords, ses noues, son avancee. */
export interface CadrePignon {
  /** Ses rives le long du mur (debord compris), et le pied de chaque noue. */
  gauche: number; droite: number; piedG: number; piedD: number; pied: number;
  /** Sa profondeur (le bout de son faitage, depuis le mur d'egout). */
  profondeur: number;
  /** L'avancee de son mur devant le mur du corps (negative : recule), et le debord de l'egout devant lui. */
  avance: number; debord: number;
  /** Le bas de son mur quand il avance (le prisme). */
  bas: number;
}

/**
 * La pointe d'un pignon traversant coupee en demi-croupe (cul de geai, schema 15) : ses deux pans, la petite croupe, son mur (un trapeze,
 * ou un pentagone quand le faitage du capuchon deborde) et, sous un capuchon, sa sous-face. Les memes plans que le bout d'un corps
 * (`coupeDemiCroupe`) : le pied de la croupe au mur du pignon (ou a son debord devant), la croupe qui monte vers l'interieur.
 */
export function facettesPignonCoupe(g: Pick<PignonToit, 'debut' | 'fin' | 'faitage'>, e: number, pointe: DemiCroupe, k: CadrePignon): { pans: SommetPignon[][]; murs: SommetPignon[][] } {
  const sc = (g.debut + g.fin) / 2, demi = (g.fin - g.debut) / 2, Fp = g.faitage;
  const pente = demi > 0 ? (Fp - e) / demi : 0;
  const { zc, g: gc, D } = coupeDemiCroupe(pointe, e, Fp);
  const avant = -k.avance;
  // Les plans dans (x = s, y = d) : le pan gauche, le pan droit, la croupe (qui monte de son pied, a D devant le mur, vers l'interieur).
  const PL: Plan = { a: pente, b: 0, c: e - pente * g.debut }, PR: Plan = { a: -pente, b: 0, c: e + pente * g.fin };
  const H: Plan = { a: 0, b: gc, c: zc - gc * (avant - D) };
  const enS = (l: Sommet[][]): SommetPignon[][] => l.map((f) => f.map((q) => ({ s: q.s, d: q.t, z: q.z })));
  const front = avant - k.debord;
  const QL: PtBrut[] = [{ x: k.gauche, y: front }, { x: sc, y: front }, { x: sc, y: k.profondeur }, { x: k.piedG, y: k.pied }];
  const QR: PtBrut[] = [{ x: sc, y: front }, { x: k.droite, y: front }, { x: k.piedD, y: k.pied }, { x: sc, y: k.profondeur }];
  const pans = [...facettesMin(QL, [PL, H]), ...facettesMin(QR, [PR, H])];
  const murs: Sommet[][] = [];
  const capuchon = D > k.debord + 1e-6;
  // Le haut du mur du pignon : le pied de la croupe, ou la croupe la ou elle passe sur le mur.
  const haut = Math.min(Fp, capuchon ? zc : zc + gc * D);
  const sL = pente > 0 ? g.debut + (haut - e) / pente : sc, sR = pente > 0 ? g.fin - (haut - e) / pente : sc;
  if (capuchon) {
    const bande: PtBrut[] = [{ x: k.gauche, y: avant - D }, { x: k.droite, y: avant - D }, { x: k.droite, y: front }, { x: k.gauche, y: front }];
    pans.push(...facettesMin(bande, [PL, PR, H], (p) => [(m) => zc - zDe(p, m.x, m.y)]));
    if (sR - sL > 0.05) murs.push([{ s: sL, t: avant, z: zc }, { s: sR, t: avant, z: zc }, { s: sR, t: avant - D, z: zc }, { s: sL, t: avant - D, z: zc }]);
  }
  const sommet = sR - sL > 1e-6 ? [{ s: sR, t: avant, z: haut }, { s: sL, t: avant, z: haut }] : [{ s: sc, t: avant, z: haut }];
  murs.push(k.avance > 0
    ? [{ s: g.debut, t: avant, z: k.bas }, { s: g.fin, t: avant, z: k.bas }, { s: g.fin, t: avant, z: e }, ...sommet, { s: g.debut, t: avant, z: e }]
    : [{ s: g.debut, t: avant, z: e }, { s: g.fin, t: avant, z: e }, ...sommet]);
  return { pans: enS(pans), murs: enS(murs) };
}

/* ------------------------------------------------------------------------------------------------
 * Les lucarnes
 * --------------------------------------------------------------------------------------------- */

/** La pente du toit d'une lucarne a deux pans ou a croupe (tangente) : 35 degres. */
/** Les dimensions d'un element de toit type, en metres : sa largeur le long du faitage et sa longueur sur la pente. */
export const DIMENSIONS_ELEMENT_TOIT = { 'fenetre-toit': { w: 0.8, l: 1.2 }, solaire: { w: 2.55, l: 1.1 } } as const;
const CADRE_ELEMENT_M = 0.06;
const RELIEF_ELEMENT_M = 0.04;

/** Un element de toit dessine : son cadre (un peu plus grand) et sa vitre ou ses cellules, poses sur le pan. */
export interface ElementDessine { type: 'fenetre-toit' | 'solaire'; cadre: Sommet[]; vitre: Sommet[] }

/**
 * Les fenetres de toit et panneaux solaires d'un corps, poses sur leur pan : un quadrilatere de cadre et un de vitre, a quelques
 * centimetres au-dessus du pan pour ne pas scintiller avec lui. Rien sur un toit de revolution, ni sur un pan trop bas.
 */
export function facettesElementsToit(c: CorpsForme & { elementsToit?: readonly ElementDeToit[] }, L: number, W: number): ElementDessine[] {
  const res: ElementDessine[] = [];
  if (estSpecial(c, W)) return res;
  const f = formeDe(c, L, W)?.f ?? null;
  for (const el of c.elementsToit ?? []) {
    const n = el.pan, largeur = n === 0 ? c.posFaitage : W - c.posFaitage, F = c.faitage, egout = c.egouts[n] ?? 0;
    if (largeur < 0.5 || F - egout < 0.3) continue;
    const bris = f ? f.bris[n] ?? null : null;
    const zP = (d: number) => hauteurPan(c, W, n, d, bris);
    const dim = DIMENSIONS_ELEMENT_TOIT[el.type], k = el.echelle ?? 1;
    // La longueur sur la pente se projette a plat : la pente de l'ensemble du pan en donne le cosinus.
    const cos = 1 / Math.sqrt(1 + ((F - egout) / largeur) ** 2);
    const w = Math.min(dim.w * k, L - 0.2), lp = Math.min(dim.l * k * cos, largeur - 0.1);
    if (w < 0.3 || lp < 0.2) continue;
    const s0 = Math.min(Math.max(el.sM - w / 2, 0.1), L - 0.1 - w), d0 = Math.min(Math.max(el.dM - lp / 2, 0.05), largeur - 0.05 - lp);
    const T = (s: number, d: number, dz: number): Sommet => ({ s, t: n === 0 ? d : W - d, z: zP(d) + dz });
    const quad = (m: number, dz: number): Sommet[] => [T(s0 - m, d0 - m, dz), T(s0 + w + m, d0 - m, dz), T(s0 + w + m, d0 + lp + m, dz), T(s0 - m, d0 + lp + m, dz)];
    res.push({ type: el.type, cadre: quad(CADRE_ELEMENT_M, RELIEF_ELEMENT_M), vitre: quad(0, RELIEF_ELEMENT_M * 1.6) });
  }
  return res;
}

const PENTE_LUCARNE = 0.7;
/** La pente inverse du toit d'un chien-assis (tangente) : 15 degres. */
const PENTE_CHIEN_ASSIS = 0.27;

/**
 * Les facettes des lucarnes d'un corps : leur face, leurs joues et leur toit, poses sur le pan. Une lucarne n'entaille pas le
 * pan (ses facettes sont au-dessus de lui) : pas de coupe a faire. Sa face est a `profondeurM` en deca du point ou son
 * faitage rejoint le pan, a plat. Une meuniere affleure le mur d'egout.
 */
export function facettesLucarnes(c: CorpsForme & { lucarnes?: readonly Lucarne[] }, L: number, W: number): { pans: Sommet[][]; murs: Sommet[][] } {
  const pans: Sommet[][] = [], murs: Sommet[][] = [];
  // Sur un toit a profil libre ou de revolution, la hauteur du pan n'est pas celle d'un pan droit : pas de lucarne posee a l'aveugle.
  if (estSpecial(c, W)) return { pans, murs };
  const f = formeDe(c, L, W)?.f ?? null;
  for (const l of c.lucarnes ?? []) {
    const n = l.pan, largeur = n === 0 ? c.posFaitage : W - c.posFaitage, F = c.faitage;
    if (largeur < 0.5 || (F - c.egouts[n] < 0.3 && l.type !== 'lanterneau')) continue;
    const bris = f ? f.bris[n] : null;
    const zP = (d: number) => hauteurPan(c, W, n, d, bris);
    // La distance a laquelle le pan atteint la hauteur z (le pan monte avec d).
    const dePour = (z: number): number => { let a = 0, b = largeur; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (zP(m) < z) a = m; else b = m; } return (a + b) / 2; };
    let x0 = Math.max(0.1, l.debutM), x1 = Math.min(L - 0.1, l.finM);
    const w = x1 - x0;
    if (w < 0.4) continue;
    const sm = (x0 + x1) / 2;
    // Un outeau est une petite lucarne a croupe : au plus un metre de large.
    const demi = l.type === 'outeau' ? Math.min(w / 2, 0.5) : w / 2;
    if (l.type === 'outeau') { x0 = sm - demi; x1 = sm + demi; }
    if (l.type === 'lanterneau') {
      // Un lanterneau : un coffre bas a dessus plat vitre, pose sur le pan (ou sur le toit plat).
      const d0 = Math.max(0, Math.min(largeur - 1.2, l.profondeurM)), d1 = d0 + Math.min(1.2, largeur);
      const A = zP(d0), B = zP(d1), zT = Math.max(l.faitageM, Math.max(A, B) + 0.3);
      const T = (s: number, d: number, z: number): Sommet => ({ s, t: n === 0 ? d : W - d, z });
      murs.push([T(x0, d0, A), T(x1, d0, A), T(x1, d0, zT), T(x0, d0, zT)], [T(x0, d1, B), T(x1, d1, B), T(x1, d1, zT), T(x0, d1, zT)]);
      murs.push([T(x0, d0, A), T(x0, d1, B), T(x0, d1, zT), T(x0, d0, zT)], [T(x1, d0, A), T(x1, d1, B), T(x1, d1, zT), T(x1, d0, zT)]);
      pans.push([T(x0, d0, zT), T(x1, d0, zT), T(x1, d1, zT), T(x0, d1, zT)]);
      continue;
    }
    const zf = Math.min(Math.max(l.faitageM, c.egouts[n] + 0.6), F - 0.1);
    const meuniere = l.type === 'meuniere';
    const dB = dePour(zf);
    const dF = meuniere ? 0 : Math.max(0, Math.min(dB - 0.3, dB - l.profondeurM));
    const z0 = zP(dF);
    if (zf - z0 < 0.3) continue;
    const S = (s: number, d: number, z: number): Sommet => ({ s, t: n === 0 ? d : W - d, z });
    // Le toit d'une lucarne a deux pans ou a croupe : l'egout de ses pans, plus bas que le faitage de la moitie de sa largeur.
    const ze = Math.max(zf - demi * PENTE_LUCARNE, z0 + 0.25);
    const dE = dePour(ze);
    if (l.type === 'oeil-de-boeuf') {
      // Un oeil-de-boeuf : un disque debout sur le pan, et un cylindre court qui le rejoint.
      const rr = Math.min(0.55, Math.max(0.25, (zf - z0) * 0.45), w / 2), zc = z0 + rr + 0.1, N = 12;
      const anneau = (d: (z: number) => number) => Array.from({ length: N }, (_, k) => { const a = (k / N) * 2 * Math.PI; const z = zc + rr * Math.sin(a); return S(sm + rr * Math.cos(a), d(z), z); });
      const face = anneau(() => dF), fond = anneau((z) => dePour(z));
      for (let k = 0; k < N; k++) pans.push([face[k] as Sommet, face[(k + 1) % N] as Sommet, fond[(k + 1) % N] as Sommet, fond[k] as Sommet]);
      murs.push(face);
      continue;
    }
    if (l.type === 'chien-assis' || l.type === 'rampante') {
      // Un seul pan : le chien-assis descend vers le faitage du corps (pente inverse), la rampante monte, moins raide que le pan.
      const pente = l.type === 'chien-assis' ? -PENTE_CHIEN_ASSIS : 0.5 * Math.max(0, (F - c.egouts[n]) / largeur);
      const zToit = (d: number) => zf + pente * (d - dF);
      let a = dF, b = largeur;
      for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (zP(m) < zToit(m)) a = m; else b = m; }
      const dR = (a + b) / 2, zR = zToit(dR);
      murs.push([S(x0, dF, z0), S(x1, dF, z0), S(x1, dF, zf), S(x0, dF, zf)]);
      pans.push([S(x0, dF, zf), S(x1, dF, zf), S(x1, dR, zR), S(x0, dR, zR)]);
      murs.push([S(x0, dF, z0), S(x0, dF, zf), S(x0, dR, zR)]);
      murs.push([S(x1, dF, z0), S(x1, dR, zR), S(x1, dF, zf)]);
      continue;
    }
    // Jacobine, meuniere, inconnue : deux pans et un petit pignon en facade ; capucine : une croupe en facade.
    const capucine = l.type === 'capucine' || l.type === 'outeau';
    if (capucine) {
      const dr = dF + demi;
      murs.push([S(x0, dF, z0), S(x1, dF, z0), S(x1, dF, ze), S(x0, dF, ze)]);
      pans.push([S(x0, dF, ze), S(x1, dF, ze), S(sm, dr, zf)]);
      pans.push([S(x0, dF, ze), S(sm, dr, zf), S(sm, dB, zf), S(x0, dE, ze)]);
      pans.push([S(x1, dF, ze), S(x1, dE, ze), S(sm, dB, zf), S(sm, dr, zf)]);
    } else {
      murs.push([S(x0, dF, z0), S(x1, dF, z0), S(x1, dF, ze), S(sm, dF, zf), S(x0, dF, ze)]);
      pans.push([S(x0, dF, ze), S(sm, dF, zf), S(sm, dB, zf), S(x0, dE, ze)]);
      pans.push([S(sm, dF, zf), S(x1, dF, ze), S(x1, dE, ze), S(sm, dB, zf)]);
    }
    murs.push([S(x0, dF, z0), S(x0, dF, ze), S(x0, dE, ze)]);
    murs.push([S(x1, dF, z0), S(x1, dE, ze), S(x1, dF, ze)]);
  }
  return { pans, murs };
}
