// Un mur a deux hauteurs d'egout (MD/spec-releve-facade.md §6.2).
//
// Une partie a etage prolongee, dans le meme alignement, par une partie basse (garage, extension) :
// vu de face, le mur est un L. Le releve le traite comme un rectangle englobant - du sol a l'egout
// le plus haut - dont on mesure le decrochement.
//
// Sur la photo, on pose les quatre coins visibles du L (le pied aux deux bouts, l'egout haut au bout
// haut, l'egout bas au bout bas) et deux points au decrochement : l'egout haut et l'egout bas la ou
// la hauteur change. Le coin englobant cache - au-dessus de la partie basse, dans le vide - n'a pas a
// etre devine : c'est l'intersection de la ligne d'egout haute prolongee et de l'arete verticale du
// bout bas, et une perspective conserve les droites et leurs intersections. Le rectangle englobant se
// redresse alors comme d'habitude, et les deux points du decrochement, ramenes dans le plan du mur,
// donnent sa position et la hauteur d'egout de la partie basse.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, type P2 } from './vision/homographie.js';
import { facadesDuContour, pointDeFacade } from '../geometry/cotesVusDeDehors.js';
import { sommetDe } from '../geometry/anneau.js';
import type { OuvertureFacade, PartieBasse, PtBrut, ReleveFacade } from '../model/types.js';
import { partiesBassesDu } from '../model/partiesBasses.js';

export type { PartieBasse };

/** Le cote ou se trouve la partie basse, vu de dehors. */
type CoteBas = 'gauche' | 'droite';

/** Ce que l'utilisateur pose sur la photo en plus des quatre coins. */
export interface Decrochement {
  cote: CoteBas;
  /** Sur la photo : l'egout haut a l'aplomb du decrochement. */
  haut: P2;
  /** Sur la photo : l'egout bas a l'aplomb du decrochement. */
  bas: P2;
}

/** Intersection des droites (a1, a2) et (b1, b2) ; \`null\` si elles sont paralleles. */
export function intersection(a1: P2, a2: P2, b1: P2, b2: P2): P2 | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/**
 * Les quatre coins du rectangle englobant sur la photo, depuis les quatre coins du L (haut gauche,
 * haut droit, bas droit, bas gauche - le haut du bout bas etant son egout) et le decrochement.
 */
export function coinsEnglobants(coins: readonly P2[], d: Decrochement): P2[] | null {
  const [hg, hd, bd, bg] = [au(coins, 0), au(coins, 1), au(coins, 2), au(coins, 3)];
  if (d.cote === 'droite') {
    // Egout haut : de hg au decrochement ; arete du bout bas : de bd a hd. Le coin cache est la.
    const cache = intersection(hg, d.haut, bd, hd);
    return cache ? [hg, cache, bd, bg] : null;
  }
  const cache = intersection(hd, d.haut, bg, hg);
  return cache ? [cache, hd, bd, bg] : null;
}

/**
 * La partie basse dans le repere du mur, une fois le rectangle englobant (\`englobants\`, qui couvre
 * \`largeur\` x \`hauteur\` metres) connu sur la photo : ou commence-t-elle, jusqu'ou va-t-elle, et a
 * quelle hauteur est son egout.
 */
export function mesurerPartieBasse(englobants: readonly P2[], d: Decrochement, largeur: number, hauteur: number): PartieBasse | null {
  // Photo -> mur, en metres : x depuis la gauche, y depuis l'egout le plus haut vers le bas.
  const H = homographie(englobants, [
    { x: 0, y: 0 },
    { x: largeur, y: 0 },
    { x: largeur, y: hauteur },
    { x: 0, y: hauteur },
  ]);
  if (!H) return null;
  const h = appliquer(H, d.haut),
    b = appliquer(H, d.bas);
  const x = Math.max(0, Math.min(largeur, (h.x + b.x) / 2));
  const egout = Math.max(0, Math.min(hauteur, hauteur - b.y));
  const cm = (v: number) => Math.round(v * 100) / 100;
  return d.cote === 'droite' ? { debut: cm(x), fin: cm(largeur), hauteur: cm(egout) } : { debut: 0, fin: cm(x), hauteur: cm(egout) };
}

/** Une partie basse descend d'au moins cela sous l'egout du mur : en deca, c'est le meme egout (un debord, une gouttiere, le LiDAR). */
const MARCHE_MIN_M = 0.5;
/** Et couvre au moins cela du mur : en deca, un poteau, un trumeau, pas un garage ni une extension. */
const PARTIE_BASSE_MIN_M = 1;
/** Le pas, en part de la largeur, auquel le haut du gabarit se lit. */
const PAS_GABARIT = 0.005;

/**
 * Les parties basses d'un mur lues sur son gabarit (facade/gabaritMur.ts, le haut de la facade sous les corps du LiDAR, en parts du
 * mur : `v` en hauteurs d'egout), de `largeur` x `hauteur` metres, de gauche a droite : chaque suite de colonnes sous l'egout de
 * MARCHE_MIN_M au moins, sur PARTIE_BASSE_MIN_M au moins, quand une autre partie du mur atteint l'egout. Un mur en L en a une, a un bout ;
 * un mur dont la partie haute est au milieu (une maison entre un garage et un appentis) en a une a chaque bout ; une au milieu seulement
 * quand le gabarit y descend (un corps bas entre deux corps hauts). L'egout de chacune est le plus bas de son haut (un garage a pignon se
 * mesure a son egout, pas a sa pointe). Vide sans marche (un rectangle, un pignon, une rampe), ou quand le mur entier est sous l'egout.
 * C'est ce que la photo posait avant au doigt (Decrochement) : le plan et le LiDAR le disent maintenant, la meme chose pour l'audit et la
 * calibration (MD/spec-releve-facade.md §6.2).
 */
export function partiesBassesDuGabarit(g: readonly { u: number; v: number }[] | null | undefined, largeur: number, hauteur: number): PartieBasse[] {
  if (!g || g.length < 2 || !(largeur > 0) || !(hauteur > 0)) return [];
  const pts = [...g].sort((a, b) => a.u - b.u);
  const vEn = (u: number): number => {
    const a = pts[0] as { u: number; v: number }, b = pts[pts.length - 1] as { u: number; v: number };
    if (u <= a.u) return a.v;
    if (u >= b.u) return b.v;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i] as { u: number; v: number }, q = pts[i + 1] as { u: number; v: number };
      if (u >= p.u && u <= q.u) return q.u > p.u ? p.v + ((q.v - p.v) * (u - p.u)) / (q.u - p.u) : Math.min(p.v, q.v);
    }
    return 1;
  };
  const n = Math.round(1 / PAS_GABARIT);
  const colonnes = Array.from({ length: n }, (_, k) => vEn((k + 0.5) / n));
  const basse = colonnes.map((v) => (1 - v) * hauteur >= MARCHE_MIN_M);
  if (!basse.some((b) => !b)) return [];
  // Les suites de colonnes basses : [premiere, apres la derniere[.
  const suites: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    if (!basse[k]) continue;
    const s = k;
    while (k < n && basse[k]) k++;
    suites.push([s, k]);
  }
  const cm = (v: number) => Math.round(v * 100) / 100;
  return suites.filter(([s, t]) => ((t - s) / n) * largeur >= PARTIE_BASSE_MIN_M).map(([s, t]) => {
    // Les sommets du gabarit sur la partie basse comptent aussi : une colonne se lit en son milieu, un sommet au bout du mur lui echappe.
    // Au debut d'une partie qui ne part pas du bout, le sommet haut de la marche (au decrochement meme) n'en est pas ; au bout du mur
    // (u = 0 ou 1), il en est. A sa fin, le sommet bas de la marche en est, le sommet haut qui suit non.
    const dans = (u: number) => (s > 0 ? u > s / n + 1e-6 : u >= -1e-6) && (t < n ? u <= t / n + 1e-6 : u <= 1 + 1e-6);
    const sommets = pts.filter((q) => dans(q.u)).map((q) => q.v);
    const egout = cm(Math.min(...colonnes.slice(s, t), ...sommets) * hauteur);
    return { debut: s > 0 ? cm((s / n) * largeur) : 0, fin: t < n ? cm((t / n) * largeur) : cm(largeur), hauteur: egout };
  });
}

/** Une partie basse, plusieurs (de gauche a droite), ou aucune : ce que lisent les fonctions du mur. */
export type PartiesDuMur = PartieBasse | readonly PartieBasse[] | null | undefined;

/** Les parties basses en liste, de gauche a droite comme elles sont donnees. */
export const enListe = (p: PartiesDuMur): readonly PartieBasse[] => (!p ? [] : Array.isArray(p) ? p : [p as PartieBasse]);

/**
 * La plus large partie haute du mur (de `largeur` metres), entre deux parties basses ou entre une partie basse et un bout : `[debut, fin]`,
 * ou null sans partie basse. C'est elle qui porte le toit vu au-dessus de l'egout.
 */
export function partieHaute(largeur: number, p: PartiesDuMur): [number, number] | null {
  const parties = enListe(p);
  if (!parties.length) return null;
  let x = 0, meilleure: [number, number] = [0, 0];
  for (const q of [...parties, { debut: largeur, fin: largeur, hauteur: 0 }]) {
    if (q.debut - x > meilleure[1] - meilleure[0]) meilleure = [x, q.debut];
    x = Math.max(x, q.fin);
  }
  return meilleure;
}

/** Hauteur d'egout du mur a l'abscisse \`x\` : celle de la partie basse qui la couvre, sinon celle du mur. */
export function egoutEn(x: number, hauteur: number, p: PartiesDuMur): number {
  const q = enListe(p).find((r) => x >= r.debut && x <= r.fin);
  return q ? q.hauteur : hauteur;
}

/**
 * Les ouvertures qui tiennent dans le mur : sur une partie basse, une tache qui monte au-dessus de son egout est sa toiture ou le ciel
 * vu au-dessus, pas une baie.
 */
export function ouverturesDansLeMur<T extends Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h'>>(ouvertures: readonly T[], hauteur: number, p: PartiesDuMur): T[] {
  if (!enListe(p).length) return [...ouvertures];
  return ouvertures.filter((o) => {
    const milieu = o.x + o.l / 2;
    return o.y + o.h <= egoutEn(milieu, hauteur, p) + 0.1;
  });
}

/**
 * Le contour du mur, dans le repere du mur (x depuis la gauche, y depuis le sol) : le pied, puis le haut de droite a gauche, a l'egout
 * de chaque partie basse sur sa longueur et a celui du mur ailleurs.
 */
export function contourDuMur(largeur: number, hauteur: number, p: PartiesDuMur): P2[] {
  const parties = enListe(p);
  const out: P2[] = [
    { x: 0, y: 0 },
    { x: largeur, y: 0 },
  ];
  // Le haut, de droite a gauche : chaque palier (une partie basse, ou le mur entre deux) par ses deux bouts.
  let x = largeur;
  const palier = (de: number, a: number, y: number) => {
    if (de <= a) return;
    out.push({ x: de, y }, { x: a, y });
  };
  for (let i = parties.length - 1; i >= 0; i--) {
    const q = parties[i] as PartieBasse;
    const fin = Math.min(x, q.fin), debut = Math.max(0, q.debut);
    palier(x, fin, hauteur);
    palier(fin, debut, q.hauteur);
    x = Math.min(x, debut);
  }
  palier(x, 0, hauteur);
  return out;
}

/** Une partie basse qui finit a moins de cela du bout du mur va jusqu'au bout (un arrondi au centimetre, une mise a l'echelle). */
const BOUT_TOLERANCE_M = 0.01;
/**
 * Une partie basse seule (un mur en L d'avant le schema 13) ne se lit au milieu du mur que si elle s'arrete a plus de cela de chacun de
 * ses bouts : une partie basse d'un releve d'avant finit au bout du mur au centimetre pres, et garde ses volumes.
 */
const MILIEU_SEULE_M = 0.5;

/** Un volume du batiment : son emprise et sa hauteur d'egout. */
export interface Volume {
  pts: PtBrut[];
  hauteur: number;
  /** La hauteur de chaque mur (de `pts[i]` a `pts[i + 1]`) quand elle est mesuree ; absente, `hauteur` partout. */
  hauteursMurs?: number[];
}

/**
 * Les volumes d'un batiment dont un mur a ete releve avec des parties basses (un L, une a chaque bout, ou au milieu), et combien sont
 * des parties hautes : les parties hautes d'abord, puis chaque partie basse.
 *
 * Une partie basse a un bout du mur va du decrochement au bout bas du mur, et sa profondeur est celle du pignon adjacent : le mur du
 * contour qui part du coin C du bout bas vers le sommet suivant E. Avec S le decrochement sur la facade, la partie basse est le
 * parallelogramme S, C, E, S' ou S' = E + (S - C) ; la partie haute est le contour ou C est remplace par S puis S' - l'encoche. Un
 * contour qui porte deja l'encoche (garage moins profond que la maison) retombe sur ses propres murs : son pignon adjacent est le mur
 * lateral du garage.
 *
 * Une partie basse au milieu du mur (un corps bas entre deux corps hauts) est un volume a part, sur toute la profondeur du batiment :
 * la tranche du contour entre les deux perpendiculaires a la facade a son debut et a sa fin (decision du proprietaire, 3 novembre 2026).
 * Elle n'a pas de pignon adjacent dont prendre la direction : la tranche est d'equerre a la facade. La partie haute se coupe alors en
 * deux, de part et d'autre, chacune avec son toit.
 */
export function volumesEtHautesDuBatiment(pts: readonly PtBrut[], hauteur: number, releves: readonly ReleveFacade[] | null | undefined): { volumes: Volume[]; hautes: number } {
  const entier = { volumes: [{ pts: pts.map((q) => ({ ...q })), hauteur }], hautes: 1 };
  const r = (releves || []).find((x) => partiesBassesDu(x).length);
  if (!r) return entier;
  const n = pts.length;
  const f = facadesDuContour(pts, hauteur).find((x) => x.cote === r.cote);
  if (!f || n < 3) return entier;
  // Abscisses du decrochement, mises a l'echelle si le mur a change de longueur depuis le releve.
  const k = r.largeur > 0 ? f.largeur / r.largeur : 1;
  const proche = (a: PtBrut, b: PtBrut) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  // Les parties basses a un bout du mur, et celles du milieu. Une seule : celle d'un mur en L, a droite des que son debut n'est pas nul
  // (comme avant le schema 13, memes volumes), sauf quand elle s'arrete franchement avant les deux bouts : elle est alors au milieu.
  // Plusieurs : celle qui finit au bout droit, puis celle qui part du bout gauche ; les autres sont au milieu.
  const parties = partiesBassesDu(r);
  const auMilieu = (pb: PartieBasse) => parties.length === 1
    ? pb.debut > MILIEU_SEULE_M && pb.fin < r.largeur - MILIEU_SEULE_M
    : pb.debut > BOUT_TOLERANCE_M && pb.fin < r.largeur - BOUT_TOLERANCE_M;
  const milieux = parties.filter(auMilieu);
  const bouts = parties.length === 1 ? parties.filter((pb) => !auMilieu(pb)) : [
    ...parties.filter((pb) => pb.debut > 0 && pb.fin >= r.largeur - BOUT_TOLERANCE_M),
    ...parties.filter((pb) => pb.debut <= BOUT_TOLERANCE_M && pb.fin < r.largeur - BOUT_TOLERANCE_M),
  ];
  if (!bouts.length && !milieux.length) return entier;
  let haute: PtBrut[] = pts.map((q) => ({ ...q }));
  const basses: Volume[] = [];
  const decrochements: PtBrut[] = [];
  for (const pb of bouts) {
    const basseADroite = pb.debut > 0;
    const S = pointDeFacade(f, (basseADroite ? pb.debut : pb.fin) * k);
    const C = basseADroite ? f.droite : f.gauche;
    const m = haute.length;
    const iC = haute.findIndex((q) => proche(q, C));
    if (iC < 0 || m < 3) return entier;
    // Le sommet E du pignon adjacent : le voisin de C qui ne suit pas la facade. Celui qui la suit est son autre bout, ou le
    // decrochement d'une partie basse deja decoupee a l'autre bout.
    const autreBout = basseADroite ? f.gauche : f.droite;
    const precedent = sommetDe(haute, (iC - 1 + m) % m);
    const versLePignon = proche(precedent, autreBout) || decrochements.some((d) => proche(precedent, d));
    const iE = versLePignon ? (iC + 1) % m : (iC - 1 + m) % m;
    const E = sommetDe(haute, iE);
    const S2 = { x: E.x + S.x - C.x, y: E.y + S.y - C.y };
    const suivante: PtBrut[] = [];
    // C et E quittent la partie haute : ce sont les coins de la partie basse, remplaces par S et S'. Dans le sens du contour : de la
    // facade vers le pignon, S puis S' ; en sens inverse, S' puis S.
    haute.forEach((q, i) => {
      if (i === iE) return;
      if (i !== iC) suivante.push({ ...q });
      else if (versLePignon) suivante.push({ ...S }, S2);
      else suivante.push(S2, { ...S });
    });
    haute = suivante.filter((q, i) => !proche(q, sommetDe(suivante, i + 1)));
    if (haute.length < 3) return entier;
    decrochements.push(S);
    basses.push({ pts: [{ ...S }, { ...C }, { ...E }, S2], hauteur: Math.min(hauteur, pb.hauteur) });
  }
  // Les parties basses du milieu : la partie haute se coupe en tranches d'equerre a la facade, a l'abscisse le long d'elle.
  let hautes: PtBrut[][] = [haute];
  const ux = (f.droite.x - f.gauche.x) / f.largeur, uy = (f.droite.y - f.gauche.y) / f.largeur;
  const abscisse = (q: PtBrut) => (q.x - f.gauche.x) * ux + (q.y - f.gauche.y) * uy;
  for (const pb of milieux) {
    const a = pb.debut * k, b = pb.fin * k;
    const suivantes: PtBrut[][] = [];
    for (const morceau of hautes) {
      suivantes.push(...[couperAbscisse(morceau, abscisse, -Infinity, a), couperAbscisse(morceau, abscisse, b, Infinity)].filter(utile));
      const tranche = couperAbscisse(morceau, abscisse, a, b);
      if (utile(tranche)) basses.push({ pts: tranche, hauteur: Math.min(hauteur, pb.hauteur) });
    }
    if (!suivantes.length) return entier;
    hautes = suivantes;
  }
  return { volumes: [...hautes.map((q) => ({ pts: q, hauteur })), ...basses], hautes: hautes.length };
}

/** Les volumes du batiment (volumesEtHautesDuBatiment) : les parties hautes, puis les parties basses. */
export function volumesDuBatiment(pts: readonly PtBrut[], hauteur: number, releves: readonly ReleveFacade[] | null | undefined): Volume[] {
  return volumesEtHautesDuBatiment(pts, hauteur, releves).volumes;
}

/** Un morceau de contour qui a une surface (une coupe le long d'un bord n'en laisse pas). */
const utile = (q: readonly PtBrut[]): boolean => q.length >= 3 && Math.abs(aireSignee(q)) > 1e-6;

function aireSignee(q: readonly PtBrut[]): number {
  return q.reduce((s, p, i) => { const r = sommetDe(q, i + 1); return s + p.x * r.y - r.x * p.y; }, 0) / 2;
}

/**
 * Le morceau d'un contour dont l'abscisse (`x`, le long de la facade) est entre `a` et `b` : deux demi-plans d'equerre a la facade,
 * Sutherland-Hodgman (un contour concave en sort entier, au pire avec un pont sans surface le long de la coupe).
 */
function couperAbscisse(pts: readonly PtBrut[], x: (q: PtBrut) => number, a: number, b: number): PtBrut[] {
  const demiPlan = (entree: readonly PtBrut[], dedans: (q: PtBrut) => number): PtBrut[] => {
    const out: PtBrut[] = [];
    entree.forEach((P, i) => {
      const Q = sommetDe(entree, i + 1), dp = dedans(P), dq = dedans(Q);
      if (dp >= 0) out.push({ ...P });
      if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push({ x: P.x + t * (Q.x - P.x), y: P.y + t * (Q.y - P.y) }); }
    });
    return out.filter((q, i) => Math.hypot(q.x - sommetDe(out, i + 1).x, q.y - sommetDe(out, i + 1).y) > 1e-9);
  };
  let out = [...pts];
  if (Number.isFinite(a)) out = demiPlan(out, (q) => x(q) - a);
  if (Number.isFinite(b)) out = demiPlan(out, (q) => b - x(q));
  return out;
}
