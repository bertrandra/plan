// Les cheminees et lucarnes vues sur la ligne du haut d'un mur, posees par le moteur sur le corps de ce mur (lot F7,
// MD/spec-facade-calage-audit.md §4 E8, §5 quater) : la photo d'une facade (le haut lu, Claude) les voit ; l'audit les propose, decochees
// (app/audit/parcelle/formeFacades.ts) ; le moteur des toits les pose (corpsSousContrainte, facade/regles/toits/faits.ts) une fois la
// proposition cochee. Ce qui est deja pose (le Mode Toit, une observation) ne bouge jamais. Les valeurs d'une souche et d'une lucarne
// que la photo ne donne pas (section, largeur, ou le faitage d'une lucarne rejoint le pan) sont celles des elements vus
// (facade/regles/toits/elementsVus.ts, qui les lit ici). Pur.

import { murDuCorps as murPorteur } from './murDuCorps.js';
import type { ElementDeMurFait } from '../../../regles/toits/faits.js';
import type { Cheminee, CorpsToit, Lucarne, PtBrut, TypeLucarne } from '../../../model/types.js';

/** Un corps plat : moins de cela entre le faitage et l'egout le plus haut (spec-regles-toits §2.7). */
export const MONTEE_PLATE_M = 0.3;
/** Le debouche d'une souche depasse le faitage de tant (DTU 24.1, spec-regles-toits §2.6). */
export const DEPASSEMENT_SOUCHE_M = 0.4;
/** La section vue le plus souvent : une souche maconnee a un conduit. */
export const SOUCHE = { largeurM: 0.6, profondeurM: 0.5 };
/** La largeur d'une lucarne, en metres, selon son type (un outeau est une petite lucarne a croupe). */
export const LARGEUR_LUCARNE_M: Partial<Record<TypeLucarne, number>> = { outeau: 0.9, 'oeil-de-boeuf': 0.8, lanterneau: 1.2, rampante: 1.6 };
/** Ou le faitage d'une lucarne rejoint le pan, en part de la hauteur de l'egout au faitage ; sa face recule d'autant. */
export const MONTEE_LUCARNE = 0.6;
export const PROFONDEUR_LUCARNE_M = 1.2;
/** La largeur d'une lucarne dont la photo ne dit pas le type. */
const LARGEUR_LUCARNE_INCONNUE_M = 1.2;

export const estPlat = (c: CorpsToit): boolean => c.faitage - Math.max(c.egouts[0], c.egouts[1]) < MONTEE_PLATE_M;
export const cm = (v: number): number => Math.round(v * 100) / 100;

/** Le repere complet d'un corps : son origine, ses deux directions, sa longueur et sa largeur. */
export function cadreCorps(c: CorpsToit): { p0: PtBrut; u: PtBrut; v: PtBrut; L: number; W: number } | null {
  const [p0, p1, , p3] = c.pts;
  if (!p0 || !p1 || !p3) return null;
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (!(L > 0) || !(W > 0)) return null;
  return { p0, u: { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v: { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W }, L, W };
}

export type Cadre = NonNullable<ReturnType<typeof cadreCorps>>;
export const versCadre = (r: Cadre, p: PtBrut): { s: number; t: number } => ({ s: (p.x - r.p0.x) * r.u.x + (p.y - r.p0.y) * r.u.y, t: (p.x - r.p0.x) * r.v.x + (p.y - r.p0.y) * r.v.y });
export const depuisCadre = (r: Cadre, s: number, t: number): PtBrut => ({ x: r.p0.x + r.u.x * s + r.v.x * t, y: r.p0.y + r.u.y * s + r.v.y * t });

/**
 * Deux elements du meme genre a moins de cela l'un de l'autre (au sol, de centre a centre) sont le meme : une cheminee deja posee, a
 * la main ou par une observation, n'est pas posee une seconde fois, et ne bouge pas (MD/spec-facade-calage-audit.md §5 quater).
 */
const MEME_ELEMENT_M = 1;
/** Un element vu se tient a tant au moins des bouts du corps (une souche, une lucarne ne pend pas dans le vide). */
const MARGE_BOUT_M = 0.3;

/** Ce que le moteur pose pour un element vu : le corps (son rang) et la souche ou la lucarne, dans le repere du corps. */
export interface ElementPose { corps: number; cote: 0 | 1 | 2 | 3; cheminee: Cheminee | null; lucarne: Lucarne | null }

/** Le centre d'une lucarne au sol : au milieu de ses bords, a mi-pan. */
function centreLucarne(c: CorpsToit, r: Cadre, l: Lucarne): PtBrut {
  return depuisCadre(r, (l.debutM + l.finM) / 2, l.pan === 0 ? c.posFaitage / 2 : (c.posFaitage + r.W) / 2);
}

/**
 * Pose un element vu sur un mur (lot F7, l'E8 de la spec) : le corps que designe le mur (murDuCorps, quelle que soit la renumerotation),
 * le point du mur vu ramene dans son repere. Une cheminee vue sur un long pan se pose sur le faitage (a mi-pan sur un appentis), a cette
 * place le long du faitage ; vue sur un mur de bout, dans ce mur (`pignon`), a cette place en travers. Une lucarne ne se pose que sur un
 * long pan en pente : sur le pan de ce mur, centree a cette place, aux valeurs du type inconnu (la photo ne dit ni son type, ni sa
 * largeur, ni sa hauteur ; les hauteurs restent celles du corps, decision 12). Rien quand le corps ne la porte pas, ou quand un element
 * du meme genre y est deja a moins de MEME_ELEMENT_M : ce qui est pose (Mode Toit, une observation) ne bouge jamais. Pur.
 */
export function elementPoseSurLeMur(corps: readonly CorpsToit[], e: ElementDeMurFait): ElementPose | null {
  const m = murPorteur(corps, e.mur.gauche, e.mur.droite);
  const c = m ? corps[m.corps] : undefined;
  const r = c ? cadreCorps(c) : null;
  const l = Math.hypot(e.mur.droite.x - e.mur.gauche.x, e.mur.droite.y - e.mur.gauche.y);
  if (!m || !c || !r || !(l > 0)) return null;
  const vu = versCadre(r, { x: e.mur.gauche.x + ((e.mur.droite.x - e.mur.gauche.x) * e.a) / l, y: e.mur.gauche.y + ((e.mur.droite.y - e.mur.gauche.y) * e.a) / l });
  const long = m.cote === 0 || m.cote === 2;
  const faitageInterieur = c.posFaitage > 0.5 && c.posFaitage < r.W - 0.5;
  if (e.element === 'cheminee') {
    const s = long ? Math.min(Math.max(vu.s, MARGE_BOUT_M), r.L - MARGE_BOUT_M) : m.cote === 3 ? SOUCHE.profondeurM / 2 : r.L - SOUCHE.profondeurM / 2;
    const t = long ? (faitageInterieur ? c.posFaitage : r.W / 2) : Math.min(Math.max(vu.t, MARGE_BOUT_M), r.W - MARGE_BOUT_M);
    const p = depuisCadre(r, s, t);
    if ((c.cheminees ?? []).some((ch) => Math.hypot(ch.x - p.x, ch.y - p.y) < MEME_ELEMENT_M)) return null;
    const position: Cheminee['position'] = !long ? 'pignon' : faitageInterieur ? 'faitage' : 'pan';
    return { corps: m.corps, cote: m.cote, cheminee: { x: cm(p.x), y: cm(p.y), ...SOUCHE, sommetM: cm(c.faitage + DEPASSEMENT_SOUCHE_M), position, source: 'observation' }, lucarne: null };
  }
  if (!long || estPlat(c)) return null;
  const pan: 0 | 1 = m.cote === 0 ? 0 : 1;
  const largeurPan = pan === 0 ? c.posFaitage : r.W - c.posFaitage, eg = c.egouts[pan];
  const w = LARGEUR_LUCARNE_INCONNUE_M;
  if (largeurPan < 0.5 || c.faitage - eg < MONTEE_PLATE_M || r.L < w + 2 * MARGE_BOUT_M) return null;
  const centre = Math.min(Math.max(vu.s, w / 2 + MARGE_BOUT_M), r.L - w / 2 - MARGE_BOUT_M);
  const lucarne: Lucarne = { type: 'inconnue', pan, debutM: cm(centre - w / 2), finM: cm(centre + w / 2), faitageM: cm(eg + MONTEE_LUCARNE * (c.faitage - eg)), profondeurM: PROFONDEUR_LUCARNE_M, source: 'observation' };
  const p = centreLucarne(c, r, lucarne);
  if ((c.lucarnes ?? []).some((x) => { const q = centreLucarne(c, r, x); return Math.hypot(q.x - p.x, q.y - p.y) < MEME_ELEMENT_M; })) return null;
  return { corps: m.corps, cote: m.cote, cheminee: null, lucarne };
}

/**
 * Les corps avec les elements que montrent leurs murs (lot F7), chacun pose par elementPoseSurLeMur sur le corps retrouve par son mur ;
 * ce qui y etait reste tel quel (un element pose a la main ne bouge jamais). Le moteur des toits l'applique comme tout fait
 * (corpsSousContrainte, apres les pignons et les bouts). Pur.
 */
export function avecElementsDesMurs(elements: readonly ElementDeMurFait[] | undefined, corps: CorpsToit[] | null): CorpsToit[] | null {
  if (!elements?.length || !corps?.length) return corps;
  const out = [...corps];
  for (const e of elements) {
    const p = elementPoseSurLeMur(out, e);
    const c = p ? out[p.corps] : undefined;
    if (!p || !c) continue;
    out[p.corps] = p.cheminee ? { ...c, cheminees: [...(c.cheminees ?? []), p.cheminee] } : p.lucarne ? { ...c, lucarnes: [...(c.lucarnes ?? []), p.lucarne] } : c;
  }
  return out;
}

/** Un mur de corps plus loin que cela d'une facade, ou pas parallele a elle, ne la porte pas : ses lucarnes ne sont pas devant elle. */
const LUCARNE_DEVANT_M = 1.5;
/** Une ouverture dont l'appui est au-dessus de l'egout du pan moins cela est dans le toit, pas dans le mur. */
const SOUS_EGOUT_LUCARNE_M = 0.3;
/** De part et d'autre d'une lucarne, une ouverture qui y a son milieu est encore la sienne (la largeur posee est une estimation). */
const MARGE_LUCARNE_M = 0.3;

/**
 * Les lucarnes des corps qui se voient sur une facade (de `gauche` a `droite`, vue de dehors) : celles d'un pan dont le mur longe la
 * facade, ramenees le long d'elle (`de` a `a` metres depuis sa gauche) avec la hauteur au-dessus de laquelle une ouverture est la
 * fenetre de la lucarne, pas une baie du mur (`dessusM`). C'est ce qui tient « un element n'est jamais a la fois dans la facade objet et
 * dans le toit » (§5 quater) : la validation de la facade et la pose d'une lucarne retirent de la facade objet l'ouverture qui est la
 * sienne (model/facadeObjet.ts::ouverturesHorsDesLucarnes). Pur.
 */
export function lucarnesDevantLeMur(corps: readonly CorpsToit[], gauche: PtBrut, droite: PtBrut): { de: number; a: number; dessusM: number }[] {
  const lf = Math.hypot(droite.x - gauche.x, droite.y - gauche.y);
  if (!(lf > 0)) return [];
  const u = { x: (droite.x - gauche.x) / lf, y: (droite.y - gauche.y) / lf };
  const out: { de: number; a: number; dessusM: number }[] = [];
  for (const c of corps) {
    const r = cadreCorps(c);
    if (!r || !c.lucarnes?.length) continue;
    // Les murs des pans : pts[0]-pts[1] (pan 0, t = 0) et pts[2]-pts[3] (pan 1, t = W). Paralleles a la facade et pres d'elle.
    if (Math.abs(r.u.x * u.x + r.u.y * u.y) < 0.95) continue;
    for (const l of c.lucarnes) {
      const pied = depuisCadre(r, (l.debutM + l.finM) / 2, l.pan === 0 ? 0 : r.W);
      const d = Math.abs((pied.x - gauche.x) * u.y - (pied.y - gauche.y) * u.x);
      if (d > LUCARNE_DEVANT_M) continue;
      const le = (s: number) => { const q = depuisCadre(r, s, l.pan === 0 ? 0 : r.W); return (q.x - gauche.x) * u.x + (q.y - gauche.y) * u.y; };
      const x0 = le(l.debutM), x1 = le(l.finM);
      out.push({ de: cm(Math.min(x0, x1) - MARGE_LUCARNE_M), a: cm(Math.max(x0, x1) + MARGE_LUCARNE_M), dessusM: cm(c.egouts[l.pan] - SOUS_EGOUT_LUCARNE_M) });
    }
  }
  return out;
}
