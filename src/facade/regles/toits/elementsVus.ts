// Les elements de toit que l'on a vus, poses sur un corps du toit (MD/spec-regles-toits.md §2.6 et §2.7) : les souches de
// cheminee, la toiture-terrasse et ses edicules, les lucarnes. L'audit de la parcelle les propose (app/audit/parcelle/propositions.ts,
// arbitrages.ts), les sujets du moteur les ecrivent (app/regles/sujets/cheminees.ts, terrasse.ts). Une photo ne donne ni leur place
// exacte ni leur section : ce sont des valeurs par type, nommees ici. Pur.

import type { CeQueJeVois, SoucheVue } from '../../../model/ceQueJeVois.js';
import type { Cheminee, CorpsToit, EdiculeTerrasse, Lucarne, PtBrut, TerrasseToit, TypeLucarne } from '../../../model/types.js';

/** Un corps plat : moins de cela entre le faitage et l'egout le plus haut (spec-regles-toits §2.7). */
const MONTEE_PLATE_M = 0.3;
/** Le debouche d'une souche depasse le faitage de tant (DTU 24.1, spec-regles-toits §2.6). */
const DEPASSEMENT_SOUCHE_M = 0.4;
/** Les sections vues le plus souvent : une souche maconnee a un conduit, un tubage inox. */
const SOUCHE = { largeurM: 0.6, profondeurM: 0.5 };
const TUBAGE = { largeurM: 0.2, profondeurM: 0.2 };
/** Une souche adossee est plus large, et sort du mur de sa profondeur. */
const SOUCHE_ADOSSEE = { largeurM: 0.8, profondeurM: 0.5 };
/** Un edicule de terrasse : une cage d'escalier de 2,4 m de cote, 2,5 m au-dessus de la terrasse. */
const EDICULE = { coteM: 2.4, hauteurM: 2.5 };

/** Le repere d'un corps : `pts[0] -> pts[1]` le long du faitage (s), `pts[0] -> pts[3]` en travers (t). */
function repereCorps(c: CorpsToit): { L: number; W: number; point: (s: number, t: number) => PtBrut } | null {
  const [p0, p1, , p3] = c.pts;
  if (!p0 || !p1 || !p3) return null;
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (!(L > 0) || !(W > 0)) return null;
  const u = { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v = { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W };
  const r = (x: number) => Math.round(x * 100) / 100;
  return { L, W, point: (s, t) => ({ x: r(p0.x + u.x * s + v.x * t), y: r(p0.y + u.y * s + v.y * t) }) };
}

const estPlat = (c: CorpsToit) => c.faitage - Math.max(c.egouts[0], c.egouts[1]) < MONTEE_PLATE_M;
const aire = (c: CorpsToit) => { const r = repereCorps(c); return r ? r.L * r.W : 0; };

/** Le plus grand corps parmi ceux qui conviennent : celui que l'on voit depuis la rue. */
function plusGrand(corps: readonly CorpsToit[], filtre: (c: CorpsToit) => boolean): number {
  let meilleur = -1, max = 0;
  corps.forEach((c, i) => { const a = aire(c); if (filtre(c) && a > max) { max = a; meilleur = i; } });
  return meilleur;
}

/**
 * Les souches vues, posees sur un corps (spec-regles-toits §2.6) : reparties le long du faitage,
 * sur le faitage, a mi-pan, dans le mur de bout ou adossees a l'exterieur de ce mur. On ne sait
 * d'elles que leur position : leur place exacte et leur section sont celles que l'on voit le plus.
 */
export function souchesSurLeCorps(c: CorpsToit, souches: readonly SoucheVue[]): Cheminee[] {
  const r = repereCorps(c);
  if (!r) return [];
  const n = souches.length;
  const sommetM = Math.round((c.faitage + DEPASSEMENT_SOUCHE_M) * 100) / 100;
  // Un appentis a son faitage sur un mur : le milieu du pan est a mi-largeur.
  const tPan = c.posFaitage > 0.5 && c.posFaitage < r.W - 0.5 ? c.posFaitage / 2 : r.W / 2;
  const tFaitage = c.posFaitage > 0.5 && c.posFaitage < r.W - 0.5 ? c.posFaitage : r.W / 2;
  return souches.map((sv, i) => {
    const position = sv.position ?? 'faitage';
    const section = position === 'facade' ? SOUCHE_ADOSSEE : sv.materiau === 'metal' ? TUBAGE : SOUCHE;
    // Les souches de bout alternent d'un bout a l'autre ; les autres se repartissent le long du faitage.
    const auBout0 = i % 2 === 0;
    let s = ((i + 1) / (n + 1)) * r.L, t = position === 'pan' ? tPan : tFaitage;
    if (position === 'pignon') s = auBout0 ? section.profondeurM / 2 : r.L - section.profondeurM / 2;
    if (position === 'facade') { s = auBout0 ? -section.profondeurM / 2 : r.L + section.profondeurM / 2; t = tFaitage; }
    const p = r.point(s, t);
    return {
      x: p.x, y: p.y, ...section, sommetM, position,
      ...(sv.materiau ? { materiau: sv.materiau } : {}),
      ...(sv.couronnement ? { couronnement: sv.couronnement } : {}),
      ...(sv.couronnement === 'mitrons' ? { conduits: 1 } : {}),
      source: 'observation' as const,
    };
  });
}

/** Les edicules vus, poses au milieu de la terrasse, le long de sa longueur, s'ils y tiennent. */
function ediculesSurLeCorps(c: CorpsToit, nombre: number): EdiculeTerrasse[] {
  const r = repereCorps(c);
  if (!r || nombre <= 0 || r.W < EDICULE.coteM + 0.6 || r.L < nombre * (EDICULE.coteM + 0.6)) return [];
  const sommetM = Math.round((Math.max(c.egouts[0], c.egouts[1]) + EDICULE.hauteurM) * 100) / 100;
  const d = EDICULE.coteM / 2;
  return Array.from({ length: nombre }, (_, i) => {
    const s = ((i + 1) / (nombre + 1)) * r.L, t = r.W / 2;
    return { pts: [r.point(s - d, t - d), r.point(s + d, t - d), r.point(s + d, t + d), r.point(s - d, t + d)], sommetM };
  });
}

/** La terrasse vue, dans le vocabulaire du corps (`TerrasseToit`). */
export function terrasseVueSurLeCorps(c: CorpsToit, vu: NonNullable<CeQueJeVois['terrasse']>): TerrasseToit {
  const edicules = ediculesSurLeCorps(c, vu.edicules ?? 0);
  return {
    ...(vu.accessible !== undefined ? { accessible: vu.accessible } : {}),
    ...(vu.revetement ? { revetement: vu.revetement } : {}),
    ...(vu.acrotereM !== undefined ? { acrotereM: vu.acrotereM } : {}),
    ...(vu.gardeCorps !== undefined ? { gardeCorps: vu.gardeCorps } : {}),
    ...(edicules.length ? { edicules } : {}),
    source: 'observation',
  };
}

/** Le corps qui porte les souches : le plus grand en pente, a defaut le plus grand ; -1 sans corps. */
export function corpsDesCheminees(corps: readonly CorpsToit[]): number {
  const i = plusGrand(corps, (c) => !estPlat(c));
  return i >= 0 ? i : plusGrand(corps, () => true);
}

/** La largeur d'une lucarne, en metres, selon son type (un outeau est une petite lucarne a croupe). */
const LARGEUR_LUCARNE_M: Partial<Record<TypeLucarne, number>> = { outeau: 0.9, 'oeil-de-boeuf': 0.8, lanterneau: 1.2, rampante: 1.6 };
/** Ou le faitage d'une lucarne rejoint le pan, en part de la hauteur de l'egout au faitage ; sa face recule d'autant. */
const MONTEE_LUCARNE = 0.6;
const PROFONDEUR_LUCARNE_M = 1.2;

/**
 * Les lucarnes vues, posees sur un corps : repartie(s) a egale distance le long du faitage, sur le pan que dit la vue (rue : le pan 0,
 * jardin : le pan 1, les deux : tour a tour). La photo ne donne ni leur place exacte ni leur largeur : ce sont des valeurs par type.
 */
export function lucarnesSurLeCorps(c: CorpsToit, n: number, types: readonly TypeLucarne[], pan: 'rue' | 'jardin' | 'les-deux'): Lucarne[] {
  const r = repereCorps(c);
  if (!r || n <= 0) return [];
  const pans: (0 | 1)[] = pan === 'rue' ? [0] : pan === 'jardin' ? [1] : [0, 1];
  const parPan = pans.map((_, k) => Array.from({ length: n }, (__, i) => i).filter((i) => i % pans.length === k));
  const out: Lucarne[] = [];
  pans.forEach((p, k) => {
    const idx = parPan[k] ?? [];
    const largeurPan = p === 0 ? c.posFaitage : r.W - c.posFaitage;
    const e = c.egouts[p];
    if (largeurPan < 0.5 || c.faitage - e < 0.3) return;
    idx.forEach((i, j) => {
      const type = types[i % Math.max(1, types.length)] ?? 'inconnue';
      const w = LARGEUR_LUCARNE_M[type] ?? 1.2;
      const centre = ((j + 1) / (idx.length + 1)) * r.L;
      out.push({ type, pan: p, debutM: Math.round((centre - w / 2) * 100) / 100, finM: Math.round((centre + w / 2) * 100) / 100, faitageM: Math.round((e + MONTEE_LUCARNE * (c.faitage - e)) * 100) / 100, profondeurM: PROFONDEUR_LUCARNE_M, source: 'observation' });
    });
  });
  return out;
}

/** Le corps qui porte la toiture-terrasse : le plus grand corps plat ; -1 s'il n'y en a pas. */
export const corpsDeLaTerrasse = (corps: readonly CorpsToit[]): number => plusGrand(corps, estPlat);
