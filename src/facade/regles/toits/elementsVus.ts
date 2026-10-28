// Les elements de toit que l'on a vus, poses sur un corps du toit (MD/spec-regles-toits.md §2.6 et §2.7) : les souches de
// cheminee, la toiture-terrasse et ses edicules, les lucarnes. L'audit de la parcelle les propose (app/audit/parcelle/propositions.ts,
// arbitrages.ts), les sujets du moteur les ecrivent (app/regles/sujets/cheminees.ts, terrasse.ts). Une photo ne donne ni leur place
// exacte ni leur section : ce sont des valeurs par type, nommees ici. Pur.

import type { CeQueJeVois, SoucheVue } from '../../../model/ceQueJeVois.js';
import type { Cheminee, CorpsToit, EdiculeTerrasse, ElementDeToit, Lucarne, PtBrut, TerrasseToit, TypeLucarne } from '../../../model/types.js';
import { corpsDeSaillie, murDuCorps } from '../../modeToit/saillies.js';
import { formeDuCorps } from './faits.js';

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

/* ------------------------------------------------------------------------------------------------
 * Ce que portait un corps, reporte sur les corps d'une forme relue
 * --------------------------------------------------------------------------------------------- */

/** Deux faitages a moins de cet angle l'un de l'autre vont dans le meme sens : une lucarne garde son pan. */
const PARALLELE_DEG = 15;

/** Le repere complet d'un corps : son origine, ses deux directions, sa longueur et sa largeur. */
function cadreCorps(c: CorpsToit): { p0: PtBrut; u: PtBrut; v: PtBrut; L: number; W: number } | null {
  const [p0, p1, , p3] = c.pts;
  if (!p0 || !p1 || !p3) return null;
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (!(L > 0) || !(W > 0)) return null;
  return { p0, u: { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v: { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W }, L, W };
}

type Cadre = NonNullable<ReturnType<typeof cadreCorps>>;
const versCadre = (r: Cadre, p: PtBrut) => ({ s: (p.x - r.p0.x) * r.u.x + (p.y - r.p0.y) * r.u.y, t: (p.x - r.p0.x) * r.v.x + (p.y - r.p0.y) * r.v.y });
const depuisCadre = (r: Cadre, s: number, t: number): PtBrut => ({ x: r.p0.x + r.u.x * s + r.v.x * t, y: r.p0.y + r.u.y * s + r.v.y * t });
const dansCadre = (r: Cadre, p: PtBrut, marge = 0) => { const q = versCadre(r, p); return q.s >= -marge && q.s <= r.L + marge && q.t >= -marge && q.t <= r.W + marge; };
const cm = (v: number) => Math.round(v * 100) / 100;

/** Les cheminees d'un corps qui tiennent sur le corps neuf (une souche adossee deborde du mur de sa section) ; leur debouche suit le faitage. */
function chemineesReportees(a: CorpsToit, n: CorpsToit, rn: Cadre): Cheminee[] {
  return (a.cheminees ?? []).filter((ch) => dansCadre(rn, ch, Math.max(ch.largeurM, ch.profondeurM)))
    .map((ch) => ({ ...ch, sommetM: cm(ch.sommetM - a.faitage + n.faitage) }));
}

/**
 * Les lucarnes d'un corps qui tiennent sur le corps neuf : un faitage dans le meme sens (une lucarne suit son pan), un pan en pente
 * assez large, et toute leur largeur entre les bouts. Leur faitage garde sa place entre l'egout et le faitage du pan.
 */
function lucarnesReportees(a: CorpsToit, ra: Cadre, n: CorpsToit, rn: Cadre): Lucarne[] {
  if (estPlat(n) || angleFaitages(ra, rn) > PARALLELE_DEG) return [];
  const out: Lucarne[] = [];
  for (const l of a.lucarnes ?? []) {
    const t = l.pan === 0 ? a.posFaitage / 2 : (a.posFaitage + ra.W) / 2;
    const q = versCadre(rn, depuisCadre(ra, (l.debutM + l.finM) / 2, t));
    const pan: 0 | 1 = q.t < n.posFaitage ? 0 : 1;
    const largeurPan = pan === 0 ? n.posFaitage : rn.W - n.posFaitage;
    const w = l.finM - l.debutM, e = n.egouts[pan], ea = a.egouts[l.pan];
    if (largeurPan < 0.5 || n.faitage - e < MONTEE_PLATE_M || q.s - w / 2 < 0 || q.s + w / 2 > rn.L) continue;
    const part = a.faitage - ea > 0 ? Math.min(1, Math.max(0, (l.faitageM - ea) / (a.faitage - ea))) : MONTEE_LUCARNE;
    out.push({ ...l, pan, debutM: cm(q.s - w / 2), finM: cm(q.s + w / 2), faitageM: cm(e + part * (n.faitage - e)) });
  }
  return out;
}

/** L'angle entre les faitages de deux corps, en degres, de 0 a 90. */
function angleFaitages(ra: Cadre, rn: Cadre): number {
  const a = (Math.abs(Math.atan2(ra.u.x * rn.u.y - ra.u.y * rn.u.x, ra.u.x * rn.u.x + ra.u.y * rn.u.y)) * 180) / Math.PI;
  return Math.min(a, 180 - a);
}

/**
 * Les fenetres de toit et les panneaux d'un corps qui tiennent sur le corps neuf : un faitage dans le meme sens (ils suivent leur
 * pan), un pan en pente, et leur milieu sur le rectangle. Leur place au sol ne bouge pas ; le pan et la distance a l'egout se relisent.
 */
function elementsToitReportes(a: CorpsToit, ra: Cadre, n: CorpsToit, rn: Cadre): ElementDeToit[] {
  if (estPlat(n) || angleFaitages(ra, rn) > PARALLELE_DEG) return [];
  const out: ElementDeToit[] = [];
  for (const e of a.elementsToit ?? []) {
    const q = versCadre(rn, depuisCadre(ra, e.sM, e.pan === 0 ? e.dM : ra.W - e.dM));
    if (q.s < 0 || q.s > rn.L || q.t < 0 || q.t > rn.W) continue;
    const pan: 0 | 1 = q.t < n.posFaitage ? 0 : 1;
    if (n.faitage - n.egouts[pan] < MONTEE_PLATE_M) continue;
    out.push({ ...e, pan, sM: cm(q.s), dM: cm(pan === 0 ? q.t : rn.W - q.t) });
  }
  return out;
}

/** La terrasse d'un corps, sur un corps neuf plat : ses edicules qui y tiennent, a la hauteur de son egout. */
function terrasseReportee(a: CorpsToit, n: CorpsToit, rn: Cadre): TerrasseToit | null {
  if (!a.terrasse || !estPlat(n)) return null;
  const dz = Math.max(n.egouts[0], n.egouts[1]) - Math.max(a.egouts[0], a.egouts[1]);
  const edicules = (a.terrasse.edicules ?? []).filter((e) => e.pts.every((p) => dansCadre(rn, p, 0.01))).map((e) => ({ ...e, sommetM: cm(e.sommetM + dz) }));
  const suite: TerrasseToit = { ...a.terrasse };
  if (edicules.length) suite.edicules = edicules; else delete suite.edicules;
  return suite;
}

/**
 * Ce que portaient les corps d'un toit (cheminees, lucarnes, fenetres de toit et panneaux, toiture-terrasse, appentis ouvert ou
 * ferme), reporte sur les corps
 * d'une forme relue sur la mesure : le moteur (corpsSousContrainte, lireForme) rend un corps neuf, sans rien dessus, et valider la
 * forme effacait ce que la personne avait pose ou vu. Chaque ancien corps donne ce qu'il porte au corps neuf qui contient son
 * centre (un corps neuf d'abord, le plus grand a egalite), la ou cela tient encore (cheminees dans son emprise, lucarnes, fenetres
 * de toit et panneaux sur un pan dans le meme sens, terrasse sur un toit plat, ouvert sur un appentis) ; ce qui ne tient pas est laisse. Un corps neuf qui porte
 * deja un element (une copie de l'ancien) le garde tel quel. Ni la forme ni les hauteurs du corps ne changent : c'est celles du
 * moteur.
 */
export function reporterElements(anciens: readonly CorpsToit[], nouveaux: readonly CorpsToit[]): CorpsToit[] {
  const anciensSet = new Set(anciens);
  const cadres = nouveaux.map(cadreCorps);
  const ajouts = nouveaux.map(() => ({ cheminees: [] as Cheminee[], lucarnes: [] as Lucarne[], elementsToit: [] as ElementDeToit[], terrasse: null as TerrasseToit | null, ouvert: undefined as boolean | undefined, retraitM: undefined as number | undefined }));
  for (const a of anciens) {
    if (nouveaux.includes(a)) continue;
    if (!a.cheminees?.length && !a.lucarnes?.length && !a.elementsToit?.length && !a.terrasse && a.ouvert === undefined) continue;
    const ra = cadreCorps(a);
    if (!ra) continue;
    const centre = depuisCadre(ra, ra.L / 2, ra.W / 2);
    let k = -1;
    nouveaux.forEach((n, i) => {
      const r = cadres[i];
      if (!r || !dansCadre(r, centre)) return;
      const best = k >= 0 ? nouveaux[k] as CorpsToit : null, rb = k >= 0 ? cadres[k] : null;
      const neuf = !anciensSet.has(n), bestNeuf = best ? !anciensSet.has(best) : false;
      if (k < 0 || (neuf && !bestNeuf) || (neuf === bestNeuf && r.L * r.W > (rb ? rb.L * rb.W : 0))) k = i;
    });
    const n = nouveaux[k], rn = cadres[k], ajout = ajouts[k];
    if (!n || !rn || !ajout) continue;
    ajout.cheminees.push(...chemineesReportees(a, n, rn));
    ajout.lucarnes.push(...lucarnesReportees(a, ra, n, rn));
    ajout.elementsToit.push(...elementsToitReportes(a, ra, n, rn));
    ajout.terrasse ??= terrasseReportee(a, n, rn);
    if (a.ouvert !== undefined && formeDuCorps(n) === 'appentis' && ajout.ouvert === undefined) { ajout.ouvert = a.ouvert; ajout.retraitM = a.retraitM; }
  }
  return nouveaux.map((n, i) => {
    const ajout = ajouts[i];
    if (!ajout) return n;
    const suite: CorpsToit = { ...n };
    let change = false;
    if (n.cheminees === undefined && ajout.cheminees.length) { suite.cheminees = ajout.cheminees; change = true; }
    if (n.lucarnes === undefined && ajout.lucarnes.length) { suite.lucarnes = ajout.lucarnes; change = true; }
    if (n.elementsToit === undefined && ajout.elementsToit.length) { suite.elementsToit = ajout.elementsToit; change = true; }
    if (n.terrasse === undefined && ajout.terrasse) { suite.terrasse = ajout.terrasse; change = true; }
    if (n.ouvert === undefined && ajout.ouvert !== undefined) { suite.ouvert = ajout.ouvert; if (ajout.retraitM !== undefined) suite.retraitM = ajout.retraitM; change = true; }
    return change ? suite : n;
  });
}

/** Une saillie reste sur un mur du corps neuf dont le sien est a moins de cela : au-dela, son mur n'est plus la. */
const ECART_MUR_SAILLIE_M = 0.8;

/**
 * Les saillies (bow-window, galerie, appentis poses sur un mur, facade/modeToit/saillies.ts) des anciens corps, reposees sur les
 * corps neufs : chacune va au mur d'un corps neuf (pas une saillie) qui passe a moins de ECART_MUR_SAILLIE_M de son point d'attache,
 * dans le meme sens que son ancien mur, et s'y refait (rectangle, hauteurs) en gardant ses reglages et ce qu'elle porte. Celle dont
 * le mur n'est plus la est laissee. Rend les saillies reposees, rangees apres les corps neufs (leur `hote` est un rang de `nouveaux`).
 */
export function reporterSaillies(anciens: readonly CorpsToit[], nouveaux: readonly CorpsToit[]): CorpsToit[] {
  const out: CorpsToit[] = [];
  for (const a of anciens) {
    const s = a.saillie, hote = s ? anciens[s.hote] : undefined;
    if (!s || !hote || nouveaux.includes(a)) continue;
    const m = murDuCorps(hote, s.mur);
    const attache = { x: m.a.x + m.u.x * s.centreM, y: m.a.y + m.u.y * s.centreM };
    let meilleur: { k: number; mur: number; centreM: number; d: number } | null = null;
    nouveaux.forEach((n, k) => {
      if (n.saillie) return;
      n.pts.forEach((_, i) => {
        const w = murDuCorps(n, i);
        if (Math.abs(w.u.x * m.u.y - w.u.y * m.u.x) > Math.sin((PARALLELE_DEG * Math.PI) / 180)) return;
        const t = Math.min(Math.max((attache.x - w.a.x) * w.u.x + (attache.y - w.a.y) * w.u.y, 0), w.L);
        const d = Math.hypot(w.a.x + w.u.x * t - attache.x, w.a.y + w.u.y * t - attache.y);
        if (d <= ECART_MUR_SAILLIE_M && (!meilleur || d < meilleur.d)) meilleur = { k, mur: i, centreM: t, d };
      });
    });
    const choix = meilleur as { k: number; mur: number; centreM: number } | null;
    const n = choix ? nouveaux[choix.k] : undefined;
    if (!choix || !n) continue;
    const neuf = corpsDeSaillie(n, { ...s, hote: choix.k, mur: choix.mur, centreM: cm(choix.centreM) });
    // Ce que la personne a regle sur la saillie et que le placement ne dit pas reste (facade/modeToit/saillies.ts::replacerSaillie).
    if (a.lucarnes) neuf.lucarnes = a.lucarnes;
    if (a.cheminees) neuf.cheminees = a.cheminees;
    if (a.elementsToit) neuf.elementsToit = a.elementsToit;
    if (a.retraitM !== undefined) neuf.retraitM = a.retraitM;
    if (a.ouvert !== undefined) neuf.ouvert = a.ouvert;
    out.push(neuf);
  }
  return out;
}

/**
 * Les corps neufs d'une relecture du toit (LiDAR, fait du moteur, forme validee par l'audit), avec ce que portaient les anciens : leurs elements reportes la
 * ou ils tiennent (reporterElements), puis leurs saillies reposees sur les murs qui restent (reporterSaillies). Une relecture rend
 * des corps nus ; sans cela, les cheminees, lucarnes, fenetres de toit, terrasse, appentis ouvert et saillies d'un batiment que
 * personne n'avait fige disparaissaient au premier changement de reglage.
 */
export function corpsAvecCeQuIlsPortaient(anciens: readonly CorpsToit[] | null | undefined, nouveaux: CorpsToit[] | null): CorpsToit[] | null {
  if (!nouveaux || !anciens?.length || nouveaux === anciens) return nouveaux;
  // Une lecture qui garde les corps qu'elle ne relit pas (la forme proposee par l'audit, lectureFormes.ts) recopie aussi les saillies,
  // avec un `hote` compte sur les anciens rangs alors qu'elle range le corps relu ailleurs : elles se reposent comme les autres.
  const portes = reporterElements(anciens.filter((c) => !c.saillie), nouveaux.filter((c) => !c.saillie));
  return [...portes, ...reporterSaillies(anciens, portes)];
}

/* ------------------------------------------------------------------------------------------------
 * Un element vu, replace sur les corps d'une forme proposee
 * --------------------------------------------------------------------------------------------- */

/** Les souches de ces cheminees, telles qu'on les a vues : de quoi les reposer sur un autre corps. */
export const souchesDe = (cheminees: readonly Cheminee[]): SoucheVue[] => cheminees.map((ch) => ({
  ...(ch.position ? { position: ch.position } : {}), ...(ch.materiau ? { materiau: ch.materiau } : {}), ...(ch.couronnement ? { couronnement: ch.couronnement } : {}),
}));

/** Le pan que disent ces lucarnes : rue (pan 0), jardin (pan 1), ou les deux. */
export function panDesLucarnes(lucarnes: readonly Lucarne[]): 'rue' | 'jardin' | 'les-deux' {
  const pans = new Set(lucarnes.map((l) => l.pan));
  return pans.size > 1 ? 'les-deux' : pans.has(1) ? 'jardin' : 'rue';
}

/** La terrasse vue, telle qu'on l'a decrite (pour la reposer sur un autre corps plat, ses edicules compris). */
export const terrasseVueDe = (t: TerrasseToit): NonNullable<CeQueJeVois['terrasse']> => ({
  ...(t.accessible !== undefined ? { accessible: t.accessible } : {}), ...(t.revetement ? { revetement: t.revetement } : {}),
  ...(t.acrotereM !== undefined ? { acrotereM: t.acrotereM } : {}), ...(t.gardeCorps !== undefined ? { gardeCorps: t.gardeCorps } : {}),
  ...(t.edicules?.length ? { edicules: t.edicules.length } : {}),
}) as NonNullable<CeQueJeVois['terrasse']>;

/** Les appentis d'une liste de corps (leur rang) : ce que l'appentis vu ouvert ou ferme designe. */
export const appentisDesCorps = (corps: readonly CorpsToit[]): number[] => corps.flatMap((c, i) => (formeDuCorps(c) === 'appentis' ? [i] : []));
