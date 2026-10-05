// Pergola : les pieces d'une pergola bois et leur metrage par section (engine/).
//
// Une pergola est un polygone du plan de fonction `pergola`. Le contour est le nu exterieur des
// poteaux : les poteaux d'angle s'y logent a fleur, les poutres du cadre courent sur leur axe, et le
// toit couvre le contour. Ce module rend les pieces comme des axes en trois dimensions (plan + hauteur)
// avec leur section ; la 3D les habille, le plan 2D en dessine les poteaux et les chevrons, et
// l'inspecteur en tire le metrage par section, debite dans les longueurs achetables comme les lames
// d'une terrasse.
//
// Trois toits :
//   - `toile` : des chevrons poses a plat sur le cadre, une toile tendue dessus ;
//   - `appentis` : un seul pan, bas sur le cote de reference ; tout le cadre suit la pente, les
//     poteaux du cote haut sont donc plus longs ;
//   - `quatre-pans` : faitage, quatre aretiers et chevrons (les empannons s'arretent sur les
//     aretiers), calcules sur le rectangle qui englobe le cadre dans le repere du cote de reference.
//
// C'est un outil d'avant-projet : il ne verifie ni les portees ni les assemblages.

import { au } from '../util/tableaux.js';
import { dist, shoelace, signedArea } from '../geometry/basic.js';
import { clipLineToPolygon, polygonOffset } from '../geometry/polygon.js';
import { optimiserDebitLames, type Debit } from './debit.js';
import { parseLongueurs } from './prix.js';
import type { ObjetPlan, Pergola, PtBrut, ToitPergola } from '../model/types.js';

export const SECTIONS_POTEAU = ['90x90', '120x120', '145x145', '150x150'];
export const SECTIONS_POUTRE = ['70x150', '75x200', '90x225', '120x240'];
export const SECTIONS_CONTREFICHE = ['70x70', '90x90', '120x120'];
export const SECTIONS_CHEVRON = ['45x120', '45x145', '60x160', '75x200'];

export const LIBELLE_TOIT_PERGOLA: Record<ToitPergola, string> = {
  toile: 'Chevrons et toile',
  'quatre-pans': 'Quatre pans',
  appentis: 'Appentis'
};

/** Pente par defaut : faible pour un appentis (ecoulement), franche pour quatre pans. */
const PENTE_DEFAUT: Record<ToitPergola, number> = { toile: 0, appentis: 10, 'quatre-pans': 30 };

const LONGUEURS_PERGOLA_DEFAUT = [6, 5, 4, 3, 2.5];

/** Une chute plus courte ne repart pas au pot (comme les 50 cm de la terrasse, en plus court : bois de charpente). */
const CHUTE_REUTILISABLE_M = 0.3;

export type ReglagesPergola = Required<Omit<Pergola, 'coteReference'>> & { coteReference: number };

/** Le plus long cote : celui que les chevrons croisent le moins souvent, donc le moins de pieces. */
function plusLongCote(pts: PtBrut[]): number {
  let best = 0, L = -1;
  pts.forEach((p, i) => { const d = dist(p, au(pts, (i + 1) % pts.length)); if (d > L + 1e-9) { L = d; best = i; } });
  return best;
}

/** Les reglages complets d'une pergola : ce que l'objet porte, et les valeurs par defaut pour le reste. */
export function pergolaDe(o: ObjetPlan): ReglagesPergola {
  const p = o.pergola || {};
  const toit: ToitPergola = p.toit && p.toit in LIBELLE_TOIT_PERGOLA ? p.toit : 'toile';
  const pts = o.type === 'polygon' ? o.pts : [];
  const n = pts.length;
  const ref = p.coteReference;
  return {
    toit,
    hauteur: p.hauteur && p.hauteur > 0 ? p.hauteur : 2.4,
    sectionPoteau: p.sectionPoteau || '120x120',
    entraxePoteaux: p.entraxePoteaux && p.entraxePoteaux > 0.5 ? p.entraxePoteaux : 4,
    sectionPoutre: p.sectionPoutre || '75x200',
    avecContrefiches: p.avecContrefiches !== false,
    longueurContrefiche: p.longueurContrefiche && p.longueurContrefiche > 0 ? p.longueurContrefiche : 0.7,
    sectionContrefiche: p.sectionContrefiche || '90x90',
    sectionChevron: p.sectionChevron || '45x145',
    entraxeChevrons: p.entraxeChevrons && p.entraxeChevrons > 0.1 ? p.entraxeChevrons : 0.6,
    pente: p.pente !== undefined && p.pente >= 0 && p.pente < 60 ? p.pente : PENTE_DEFAUT[toit],
    coteReference: ref !== undefined && ref >= 0 && ref < n ? ref : (n ? plusLongCote(pts) : 0),
    couleurBois: p.couleurBois || '#8a6a48',
    couleurToile: p.couleurToile || '#efe6d2',
    couleurCouverture: p.couleurCouverture || '#9a4b32',
    longueursBois: p.longueursBois || LONGUEURS_PERGOLA_DEFAUT.join(', ')
  };
}

/** Une section `'75x200'` en metres : `b` la largeur, `h` la hauteur. */
export function dimsPergola(sec: string): { b: number; h: number } {
  const m = /^(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)$/i.exec(sec.trim());
  if (!m) return { b: 0.1, h: 0.1 };
  return { b: parseFloat((m[1] ?? '100').replace(',', '.')) / 1000, h: parseFloat((m[2] ?? '100').replace(',', '.')) / 1000 };
}

/** `'75x200'` -> `'75 × 200 mm'`. */
export const libelleSection = (sec: string): string => sec.replace('x', ' × ') + ' mm';

export type RolePiece = 'poteau' | 'poutre' | 'contrefiche' | 'chevron' | 'faitage' | 'aretier';

export const LIBELLE_ROLE: Record<RolePiece, [string, string]> = {
  poteau: ['poteau', 'poteaux'],
  poutre: ['poutre', 'poutres'],
  contrefiche: ['contrefiche', 'contrefiches'],
  chevron: ['chevron', 'chevrons'],
  faitage: ['faîtage', 'faîtages'],
  aretier: ['arêtier', 'arêtiers']
};

/** Un point du plan a une hauteur : `x`, `y` en metres du plan, `z` au-dessus du sol. */
export interface Pt3 { x: number; y: number; z: number }

/** Une piece : son axe, sa section, son role, et la longueur a commander. */
export interface PiecePergola {
  role: RolePiece;
  section: string;
  a: Pt3;
  b: Pt3;
  /** Longueur a debiter, en metres : l'axe, plus ce que l'assemblage demande (poutres). */
  longueur: number;
}

export interface PergolaCalculee {
  reglages: ReglagesPergola;
  pieces: PiecePergola[];
  /** Les pans de la couverture (toile ou couverture), en 3D. */
  pans: Pt3[][];
  /** Surface de la toile ou de la couverture, en m², pente comprise. */
  surfaceCouverture: number;
  avertissements: string[];
}

const long3 = (a: Pt3, b: Pt3): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const piece = (role: RolePiece, section: string, a: Pt3, b: Pt3, surplus = 0): PiecePergola =>
  ({ role, section, a, b, longueur: long3(a, b) + surplus });

/**
 * Calcule les pieces d'une pergola. `null` si l'objet n'est pas un polygone utilisable (moins de
 * trois sommets, surface nulle).
 */
export function calculerPergola(o: ObjetPlan): PergolaCalculee | null {
  if (o.type !== 'polygon' || o.pts.length < 3 || shoelace(o.pts) < 0.01) return null;
  const r = pergolaDe(o);
  // Sens trigonometrique : les decalages vers l'interieur et la normale du cote de reference en
  // dependent. On garde l'indice des cotes en retournant la liste a la main.
  const ccw = signedArea(o.pts) > 0;
  const contour = o.pts.map(p => ({ x: p.x, y: p.y }));
  const poteau = dimsPergola(r.sectionPoteau), poutre = dimsPergola(r.sectionPoutre), chevron = dimsPergola(r.sectionChevron);
  const avertissements: string[] = [];

  // Le cote de reference et sa normale interieure : la pente d'un appentis monte le long de cette normale.
  const ra = au(contour, r.coteReference), rb = au(contour, (r.coteReference + 1) % contour.length);
  const Lr = dist(ra, rb) || 1;
  const u = { x: (rb.x - ra.x) / Lr, y: (rb.y - ra.y) / Lr };
  const v = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  const tan = Math.tan((r.toit === 'appentis' ? r.pente : 0) * Math.PI / 180);
  /** Le dessous des poutres au droit d'un point : constant, sauf en appentis ou il monte avec la pente. */
  const sousPoutre = (p: PtBrut): number => r.hauteur + Math.max(0, (p.x - ra.x) * v.x + (p.y - ra.y) * v.y) * tan;

  // Poteaux : leur axe est rentre d'une demi-section, pour que leur nu affleure le contour.
  const axes = polygonOffset(contour, poteau.b / 2);
  const poteaux: PtBrut[] = [];
  const pieces: PiecePergola[] = [];
  const n = axes.length;
  for (let i = 0; i < n; i++) {
    const a = au(axes, i), b = au(axes, (i + 1) % n);
    const L = dist(a, b);
    poteaux.push(a);
    const travees = Math.max(1, Math.ceil(L / r.entraxePoteaux - 1e-6));
    for (let k = 1; k < travees; k++) poteaux.push({ x: a.x + (b.x - a.x) * k / travees, y: a.y + (b.y - a.y) * k / travees });
    // La poutre court d'axe a axe, plus une largeur de poteau : elle couvre les deux poteaux d'angle.
    const za = sousPoutre(a) + poutre.h / 2, zb = sousPoutre(b) + poutre.h / 2;
    const pc = piece('poutre', r.sectionPoutre, { ...a, z: za }, { ...b, z: zb }, poteau.b);
    pieces.push(pc);
    if (pc.longueur > Math.max(...longueursPergola(r))) avertissements.push('Une poutre de ' + pc.longueur.toFixed(2).replace('.', ',') + ' m dépasse la plus grande longueur achetable : elle sera aboutée sur un poteau.');
  }
  poteaux.forEach(p => pieces.push(piece('poteau', r.sectionPoteau, { ...p, z: 0 }, { ...p, z: sousPoutre(p) })));

  if (r.avecContrefiches) ajouterContrefiches(r, axes, poteaux, sousPoutre, pieces, avertissements);

  const dessusCadre = (p: PtBrut): number => sousPoutre(p) + poutre.h;
  let pans: Pt3[][];
  let surfaceCouverture: number;
  if (r.toit === 'quatre-pans') {
    ({ pans, surfaceCouverture } = toitQuatrePans(r, axes, contour, u, v, poutre.h, chevron.h, pieces));
    const rectangle = contour.length === 4 && contour.every((_, i) => Math.abs(angleEntre(contour, i) - 90) < 1);
    if (!rectangle) avertissements.push('Le toit à quatre pans est calculé sur le rectangle qui englobe la pergola.');
  } else {
    // Chevrons a plat (toile) ou dans la pente (appentis), perpendiculaires au cote de reference.
    const proj = contour.map(p => (p.x - ra.x) * u.x + (p.y - ra.y) * u.y);
    const s0 = Math.min(...proj) + chevron.b / 2, s1 = Math.max(...proj) - chevron.b / 2;
    const nb = Math.max(1, Math.ceil((s1 - s0) / r.entraxeChevrons - 1e-6));
    for (let k = 0; k <= nb; k++) {
      const s = s0 + (s1 - s0) * k / nb;
      const origine = { x: ra.x + u.x * s, y: ra.y + u.y * s };
      clipLineToPolygon(origine, v, contour).forEach(seg => {
        if (dist(seg.a, seg.b) < 0.05) return;
        const z = (p: PtBrut) => dessusCadre(p) + chevron.h / 2;
        pieces.push(piece('chevron', r.sectionChevron, { ...seg.a, z: z(seg.a) }, { ...seg.b, z: z(seg.b) }));
      });
    }
    pans = [contour.map(p => ({ ...p, z: dessusCadre(p) + chevron.h + 0.005 }))];
    surfaceCouverture = shoelace(contour) / Math.cos(Math.atan(tan));
  }
  return { reglages: r, pieces, pans, surfaceCouverture, avertissements };
}

/** Angle interieur au sommet `i`, en degres, sans orientation (0 a 180). */
function angleEntre(pts: PtBrut[], i: number): number {
  const n = pts.length, p = au(pts, i), a = au(pts, (i - 1 + n) % n), b = au(pts, (i + 1) % n);
  const ux = a.x - p.x, uy = a.y - p.y, wx = b.x - p.x, wy = b.y - p.y;
  const c = (ux * wx + uy * wy) / ((Math.hypot(ux, uy) * Math.hypot(wx, wy)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

/**
 * Les contrefiches, a 45°, de chaque poteau vers chaque poutre qu'il porte : deux par poteau (un
 * poteau d'angle porte deux poutres, un poteau intermediaire la meme poutre des deux cotes).
 */
function ajouterContrefiches(r: ReglagesPergola, axes: PtBrut[], poteaux: PtBrut[], sousPoutre: (p: PtBrut) => number,
  pieces: PiecePergola[], avertissements: string[]): void {
  const d = r.longueurContrefiche * Math.SQRT1_2;
  if (r.hauteur - d < 0.8) { avertissements.push('Contrefiches trop longues pour la hauteur des poteaux : elles ne sont pas posées.'); return; }
  const n = axes.length;
  poteaux.forEach(p => {
    for (let i = 0; i < n; i++) {
      const a = au(axes, i), b = au(axes, (i + 1) % n);
      const L = dist(a, b);
      if (L < 2 * d + 0.05) continue;
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      // Le poteau est-il sur ce cote, et ou ? t = 0 au debut, L a la fin.
      const t = (p.x - a.x) * ux + (p.y - a.y) * uy;
      const ecart = Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
      if (ecart > 1e-6 || t < -1e-6 || t > L + 1e-6) continue;
      const sens: number[] = [];
      if (t + d <= L + 1e-6) sens.push(1);
      if (t - d >= -1e-6) sens.push(-1);
      sens.forEach(s => {
        const haut = { x: p.x + ux * d * s, y: p.y + uy * d * s };
        pieces.push(piece('contrefiche', r.sectionContrefiche, { ...p, z: sousPoutre(p) - d }, { ...haut, z: sousPoutre(haut) }));
      });
    }
  });
}

/**
 * Le toit a quatre pans sur le rectangle qui englobe le cadre, dans le repere du cote de reference :
 * faitage dans la grande longueur, quatre aretiers, chevrons et empannons a l'entraxe.
 */
function toitQuatrePans(r: ReglagesPergola, axes: PtBrut[], contour: PtBrut[], u: PtBrut, v: PtBrut, hPoutre: number, hChevron: number,
  pieces: PiecePergola[]): { pans: Pt3[][]; surfaceCouverture: number } {
  // Rectangle englobant le contour (le toit couvre les poteaux), dans le repere (u, v).
  const o = au(axes, 0);
  const us = contour.map(p => (p.x - o.x) * u.x + (p.y - o.y) * u.y), vs = contour.map(p => (p.x - o.x) * v.x + (p.y - o.y) * v.y);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  // Repere local : x dans la grande longueur, y en travers.
  const selonU = u1 - u0 >= v1 - v0;
  const Lg = selonU ? u1 - u0 : v1 - v0, W = selonU ? v1 - v0 : u1 - u0;
  const base = r.hauteur + hPoutre;
  const tan = Math.tan(r.pente * Math.PI / 180);
  const vers = (x: number, y: number, z: number): Pt3 => {
    const pu = selonU ? u0 + x : u0 + y, pv = selonU ? v0 + y : v0 + x;
    return { x: o.x + u.x * pu + v.x * pv, y: o.y + u.y * pu + v.y * pv, z };
  };
  const demi = W / 2, H = demi * tan;
  const zChev = (run: number) => base + run * tan + hChevron / 2;
  const f0 = vers(demi, demi, base + H), f1 = vers(Lg - demi, demi, base + H);
  if (Lg - W > 0.01) pieces.push(piece('faitage', r.sectionPoutre, f0, f1));
  const coins: [number, number][] = [[0, 0], [Lg, 0], [Lg, W], [0, W]];
  coins.forEach(([x, y]) => pieces.push(piece('aretier', r.sectionPoutre, vers(x, y, base), x < Lg / 2 ? f0 : f1)));
  const e = r.entraxeChevrons;
  // Long pans : chevrons pleins sous le faitage, empannons vers les aretiers.
  for (let x = e; x < Lg - 0.05; x += e) {
    const run = Math.min(x, Lg - x, demi);
    if (run < 0.05) continue;
    pieces.push(piece('chevron', r.sectionChevron, vers(x, 0, zChev(0)), vers(x, run, zChev(run))));
    pieces.push(piece('chevron', r.sectionChevron, vers(x, W, zChev(0)), vers(x, W - run, zChev(run))));
  }
  // Croupes : les empannons des petits cotes.
  for (let y = e; y < W - 0.05; y += e) {
    const run = Math.min(y, W - y);
    if (run < 0.05) continue;
    pieces.push(piece('chevron', r.sectionChevron, vers(0, y, zChev(0)), vers(run, y, zChev(run))));
    pieces.push(piece('chevron', r.sectionChevron, vers(Lg, y, zChev(0)), vers(Lg - run, y, zChev(run))));
  }
  const z0 = base + hChevron + 0.005, zf = z0 + H;
  const a = vers(0, 0, z0), b = vers(Lg, 0, z0), c = vers(Lg, W, z0), d = vers(0, W, z0);
  const g0 = { ...f0, z: zf }, g1 = { ...f1, z: zf };
  const pans = [[a, b, g1, g0], [b, c, g1], [c, d, g0, g1], [d, a, g0]];
  return { pans, surfaceCouverture: Lg * W / Math.cos(Math.atan(tan)) };
}

export function longueursPergola(r: ReglagesPergola): number[] {
  return parseLongueurs(r.longueursBois, LONGUEURS_PERGOLA_DEFAUT);
}

/** Une ligne du metrage : un produit (une section), les pieces qu'on y taille, et ce qu'il faut acheter. */
export interface MetrageSection {
  section: string;
  /** Nombre de pieces par role, dans l'ordre de la structure. */
  roles: Partial<Record<RolePiece, number>>;
  pieces: number;
  /** Metres lineaires poses. */
  ml: number;
  debit: Debit;
}

const ORDRE_ROLES: RolePiece[] = ['poteau', 'poutre', 'contrefiche', 'faitage', 'aretier', 'chevron'];

/**
 * Le metrage par section : les pieces regroupees par section (un poteau et une contrefiche de meme
 * section sont le meme produit), debitees dans les longueurs achetables comme les lames d'une
 * terrasse. Sans joint : une piece de charpente ne s'aboute pas n'importe ou.
 */
export function metrageParSection(calc: PergolaCalculee): MetrageSection[] {
  const dispo = longueursPergola(calc.reglages);
  const groupes = new Map<string, PiecePergola[]>();
  [...calc.pieces].sort((p, q) => ORDRE_ROLES.indexOf(p.role) - ORDRE_ROLES.indexOf(q.role)).forEach(p => {
    const g = groupes.get(p.section) || [];
    g.push(p);
    groupes.set(p.section, g);
  });
  return [...groupes.entries()].map(([section, ps]) => {
    const roles: Partial<Record<RolePiece, number>> = {};
    ps.forEach(p => { roles[p.role] = (roles[p.role] || 0) + 1; });
    const longueurs = ps.map(p => Math.round(p.longueur * 1000) / 1000);
    return {
      section, roles, pieces: ps.length,
      ml: longueurs.reduce((s, l) => s + l, 0),
      debit: optimiserDebitLames(longueurs.filter(l => l > 0.05), dispo, CHUTE_REUTILISABLE_M, 0, false)
    };
  });
}
