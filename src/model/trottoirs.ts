// Les trottoirs entre les parcelles et la chaussee : l'option « Rues » (MD/spec-rues.md §8, model/).
//
// La BD TOPO donne l'axe d'une rue et la largeur de sa chaussee, pas ses trottoirs ; le cadastre donne les limites des parcelles.
// Entre les deux, l'espace de la rue : on le mesure en travers de chaque troncon, tous les `PAS_PROFIL_M`, de la limite d'un cote a
// celle d'en face, et on le partage entre deux trottoirs et une chaussee (`partagerRue`). La chaussee se pose au milieu de cet espace
// et ne deborde plus sur les parcelles ; les trottoirs vont de son bord a la limite.
//
// Ce qu'on ne sait pas, on ne l'invente pas : sans la parcelle d'en face, la rue est supposee symetrique autour de son axe, et le
// trottoir ne se dessine que le long de la parcelle du projet ; sans aucune limite a portee, la chaussee reste celle d'avant (la
// largeur de la BD TOPO, sur l'axe), sans trottoir. Rien ici ne dessine : le plan (render/chaussees.ts) et la Vue 3D
// (three/chaussees3d.ts) lisent les memes profils, chacun dans son repere.

import { pointInPolygon } from '../geometry/basic.js';
import { estTerrain, parcelleDuProjet } from './fonctions.js';
import type { ChausseeRue, ObjetPlan, PtBrut } from './types.js';
import type { EtiquetteRue } from './rues.js';

/** Un trottoir fait au moins cela : le passage accessible (1,40 m libre d'obstacle, arrete du 15 janvier 2007). */
export const TROTTOIR_MIN_M = 1.4;
/** Une chaussee garde au moins cela : une voie de circulation. En dessous, la rue reste partagee, sans trottoir. */
export const CHAUSSEE_MIN_M = 3;
/** Les bornes et le pas du reglage « Trottoirs » (menu Affichage), en pour cent de l'espace entre les parcelles, par trottoir. */
export const PART_TROTTOIRS_MIN = 10;
export const PART_TROTTOIRS_MAX = 30;
export const PART_TROTTOIRS_PAS = 5;
/** La part par defaut de chaque trottoir : un cinquieme de l'espace, la chaussee en garde trois cinquiemes. */
export const PART_TROTTOIRS_DEFAUT = 20;
/**
 * Au-dela, une limite de parcelle n'est plus celle de la rue : le rayon traverse un carrefour ou longe une rue qui part. Vingt metres
 * de l'axe : un boulevard de quarante metres entre facades est encore lu.
 */
export const PORTEE_LIMITE_M = 20;
/** L'ecart entre deux mesures en travers, le long de l'axe ; celui des mailles du ruban en Vue 3D. */
export const PAS_PROFIL_M = 2;
/** Le nombre de mesures voisines dont on prend la mediane : une entree de garage ou un coin de parcelle ne creuse pas la rue. */
const FENETRE_LISSAGE = 5;
/** Un axe croise plus pres que cela part du point mesure lui-meme (un carrefour au bout du troncon) : il ne coupe pas la mesure. */
const DEPART_AXE_M = 0.5;
/** Un coude ne pousse pas le bord du ruban a plus de deux fois sa distance a l'axe (onglet borne). */
const ONGLET_MAX = 2;

/** Les couleurs des rues dessinees : celles d'une carte (`plan`, l'ambre d'avant) ou celles de la rue (`reelles` : enrobe, beton, granit). */
export type CouleursRues = 'plan' | 'reelles';

/** La part de chaque trottoir reglee sur la parcelle du projet (menu Affichage), en pour cent ; par defaut `PART_TROTTOIRS_DEFAUT`. */
export function partTrottoirs(parcelle: ObjetPlan | null | undefined): number {
  const v = parcelle?.voisinage3d?.rues?.partTrottoirs;
  return typeof v === 'number' ? bornerPart(v) : PART_TROTTOIRS_DEFAUT;
}

/** Les couleurs des rues reglees sur la parcelle du projet ; par defaut celles du plan, l'allure d'avant. */
export function couleursRues(parcelle: ObjetPlan | null | undefined): CouleursRues {
  return parcelle?.voisinage3d?.rues?.couleurs === 'reelles' ? 'reelles' : 'plan';
}

/**
 * Ecrit un reglage des rues dessinees sur la parcelle, comme l'option « Rues » (`tracerRues`) : seule une valeur autre que celle par
 * defaut s'ecrit, et une parcelle revenue aux defauts retrouve exactement la forme d'avant.
 */
function ecrireReglageRues(parcelle: ObjetPlan, cle: 'partTrottoirs' | 'couleurs', valeur: number | 'reelles' | null): void {
  const v = parcelle.voisinage3d ?? {};
  const rues: NonNullable<NonNullable<ObjetPlan['voisinage3d']>['rues']> = { ...(v.rues ?? {}), afficher: v.rues?.afficher ?? false };
  if (valeur === null) delete rues[cle];
  else (rues as Record<string, unknown>)[cle] = valeur;
  const seulDefaut = !rues.afficher && Object.keys(rues).every((k) => k === 'afficher');
  if (seulDefaut && Object.keys(v).every((k) => k === 'rues')) delete parcelle.voisinage3d;
  else parcelle.voisinage3d = { ...v, rues };
}

/** Regle la part de chaque trottoir, bornee au pas du reglage. */
export function reglerPartTrottoirs(parcelle: ObjetPlan, pourCent: number): void {
  const p = bornerPart(pourCent);
  ecrireReglageRues(parcelle, 'partTrottoirs', p === PART_TROTTOIRS_DEFAUT ? null : p);
}

/** Regle les couleurs des rues dessinees. */
export function reglerCouleursRues(parcelle: ObjetPlan, couleurs: CouleursRues): void {
  ecrireReglageRues(parcelle, 'couleurs', couleurs === 'reelles' ? 'reelles' : null);
}

/** Le partage d'un espace entre deux limites : la largeur de chaque trottoir et celle de la chaussee, en metres. */
export interface PartageRue { trottoir: number; chaussee: number; sansTrottoir: boolean }

/** La part d'un trottoir ramenee dans les bornes du reglage, au pas pres. */
export function bornerPart(pourCent: number): number {
  if (!Number.isFinite(pourCent)) return PART_TROTTOIRS_DEFAUT;
  const p = Math.round(pourCent / PART_TROTTOIRS_PAS) * PART_TROTTOIRS_PAS;
  return Math.min(PART_TROTTOIRS_MAX, Math.max(PART_TROTTOIRS_MIN, p));
}

/**
 * Le partage d'un espace de `espaceM` entre les deux limites, pour une chaussee lue de `largeurM` a la BD TOPO. Chaque trottoir prend
 * au moins `TROTTOIR_MIN_M` et sa part de l'espace ; la chaussee prend le reste, sans depasser sa largeur lue, et jamais moins de
 * `CHAUSSEE_MIN_M` (sauf une voie que la BD TOPO dit plus etroite : un chemin garde ses 2,50 m) ; si elle est plus etroite que le
 * reste, les trottoirs s'elargissent d'autant. Quand deux trottoirs et une chaussee ne tiennent pas, la rue reste partagee : pas de
 * trottoir, la chaussee a sa largeur lue, dans l'espace.
 */
export function partagerRue(espaceM: number, largeurM: number, partPourCent = PART_TROTTOIRS_DEFAUT): PartageRue {
  if (espaceM - 2 * TROTTOIR_MIN_M < CHAUSSEE_MIN_M) return { trottoir: 0, chaussee: Math.max(0, Math.min(largeurM, espaceM)), sansTrottoir: true };
  const voulu = Math.max(TROTTOIR_MIN_M, (bornerPart(partPourCent) / 100) * espaceM);
  const chaussee = Math.min(largeurM, Math.max(CHAUSSEE_MIN_M, espaceM - 2 * voulu));
  return { trottoir: (espaceM - chaussee) / 2, chaussee, sansTrottoir: false };
}

/**
 * Une mesure en travers de l'axe. Les decalages sont des distances a l'axe, comptees vers sa gauche ; la normale (`nx`, `ny`) est
 * unitaire, sauf a un coude ou elle s'allonge pour que le bord reste parallele aux deux segments : le point du bord est
 * `x + nx * decalage` : la chaussee va de `chausseeD` a `chausseeG`, le trottoir de gauche de `chausseeG` a `trottoirG`
 * (la limite de la parcelle), celui de droite de `trottoirD` a `chausseeD`. `null` : pas de trottoir de ce cote.
 */
export interface StationRue {
  x: number; y: number; nx: number; ny: number;
  chausseeG: number; chausseeD: number;
  trottoirG: number | null; trottoirD: number | null;
}

/** Une chaussee lue, mesuree en travers tout du long. */
export interface ProfilRue { chaussee: ChausseeRue; stations: StationRue[] }

/** Une parcelle connue : son contour, et si c'est celle du projet. */
export interface ParcelleConnue { pts: readonly PtBrut[]; projet: boolean }

/** La limite trouvee d'un cote : sa distance a l'axe, et si elle est celle de la parcelle du projet. */
interface Limite { d: number; projet: boolean }

interface Arete { a: PtBrut; b: PtBrut; projet: boolean; xMin: number; xMax: number; yMin: number; yMax: number }

/** Les points de l'axe, tous les `pas` au plus, avec la normale gauche de chacun (allongee aux coudes, bornee). */
function echantillonner(pts: readonly PtBrut[], pas: number): { x: number; y: number; ux: number; uy: number; nx: number; ny: number }[] {
  const res: { x: number; y: number; ux: number; uy: number; nx: number; ny: number }[] = [];
  const segs: { a: PtBrut; b: PtBrut; ux: number; uy: number; l: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as PtBrut, b = pts[i] as PtBrut, l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > 1e-9) segs.push({ a, b, ux: -(b.y - a.y) / l, uy: (b.x - a.x) / l, l });
  }
  segs.forEach((s, k) => {
    // Le sommet de depart : la normale du segment au bout de l'axe, la bissectrice a un coude.
    const prec = segs[k - 1];
    let nx = s.ux, ny = s.uy;
    if (prec) {
      const bx = prec.ux + s.ux, by = prec.uy + s.uy, bl = Math.hypot(bx, by);
      if (bl > 1e-9) {
        const cos = (bx / bl) * s.ux + (by / bl) * s.uy;
        const f = Math.min(ONGLET_MAX, 1 / Math.max(1e-9, cos));
        nx = (bx / bl) * f; ny = (by / bl) * f;
      }
    }
    const n = Math.max(1, Math.ceil(s.l / pas));
    res.push({ x: s.a.x, y: s.a.y, ux: nx / Math.hypot(nx, ny), uy: ny / Math.hypot(nx, ny), nx, ny });
    for (let j = 1; j < n; j++) {
      const t = j / n;
      res.push({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, ux: s.ux, uy: s.uy, nx: s.ux, ny: s.uy });
    }
    if (k === segs.length - 1) res.push({ x: s.b.x, y: s.b.y, ux: s.ux, uy: s.uy, nx: s.ux, ny: s.uy });
  });
  return res;
}

/** La distance le long du rayon parti de `p` dans la direction (ux, uy) jusqu'au segment, ou `null` s'il ne le croise pas. */
function croisement(p: PtBrut, ux: number, uy: number, e: Arete): number | null {
  const ex = e.b.x - e.a.x, ey = e.b.y - e.a.y;
  const den = ux * ey - uy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const wx = e.a.x - p.x, wy = e.a.y - p.y;
  const t = (wx * ey - wy * ex) / den, s = (wx * uy - wy * ux) / den;
  return s >= 0 && s <= 1 ? t : null;
}

/**
 * La premiere limite rencontree par le rayon parti de `p` dans la direction (ux, uy), a moins de `PORTEE_LIMITE_M` ; aucune si le
 * rayon traverse d'abord l'axe d'une autre rue (`axes`) : au-dela, ce n'est plus la rue qu'on mesure (un carrefour, une place entre
 * deux rues qui se rejoignent), et un trottoir pose la recouvrirait.
 */
function premiereLimite(p: PtBrut, ux: number, uy: number, aretes: readonly Arete[], axes: readonly Arete[]): Limite | null {
  let meilleure: Limite | null = null;
  for (const e of aretes) {
    const t = croisement(p, ux, uy, e);
    if (t !== null && t > 1e-6 && t <= PORTEE_LIMITE_M && (!meilleure || t < meilleure.d)) meilleure = { d: t, projet: e.projet };
  }
  if (!meilleure) return null;
  for (const e of axes) {
    const t = croisement(p, ux, uy, e);
    if (t !== null && t > DEPART_AXE_M && t < meilleure.d) return null;
  }
  return meilleure;
}

/** La mediane des mesures voisines, s'il y en a une majorite ; sinon rien : un trou isole se bouche, une ouverture reste ouverte. */
function lisser(mesures: readonly (Limite | null)[]): (Limite | null)[] {
  const demi = Math.floor(FENETRE_LISSAGE / 2);
  return mesures.map((_, i) => {
    const voisines: Limite[] = [];
    let n = 0;
    for (let k = i - demi; k <= i + demi; k++) {
      if (k < 0 || k >= mesures.length) continue;
      n++;
      const m = mesures[k];
      if (m) voisines.push(m);
    }
    if (voisines.length * 2 <= n) return null;
    const ds = voisines.map((v) => v.d).sort((a, b) => a - b);
    const d = ds.length % 2 ? (ds[(ds.length - 1) / 2] as number) : ((ds[ds.length / 2 - 1] as number) + (ds[ds.length / 2] as number)) / 2;
    return { d, projet: voisines.filter((v) => v.projet).length * 2 > voisines.length };
  });
}

/** Ce qu'une mesure en travers donne, d'apres les limites trouvees de chaque cote (MD/spec-rues.md §8). */
function decider(g: Limite | null, d: Limite | null, largeurM: number, part: number): Pick<StationRue, 'chausseeG' | 'chausseeD' | 'trottoirG' | 'trottoirD'> {
  if (g && d) {
    // Les deux limites : la chaussee au milieu de l'espace, les trottoirs jusqu'aux limites.
    const p = partagerRue(g.d + d.d, largeurM, part), milieu = (g.d - d.d) / 2;
    return { chausseeG: milieu + p.chaussee / 2, chausseeD: milieu - p.chaussee / 2, trottoirG: p.sansTrottoir ? null : g.d, trottoirD: p.sansTrottoir ? null : -d.d };
  }
  const une = g ?? d;
  if (une) {
    // Une seule : la rue supposee symetrique autour de son axe. Le trottoir le long de la parcelle du projet seulement ; le long
    // d'une voisine seule, la chaussee tient dans l'espace suppose, sans trottoir.
    const p = partagerRue(2 * une.d, largeurM, part);
    const avecTrottoir = une.projet && !p.sansTrottoir;
    const c = avecTrottoir ? p.chaussee : Math.min(largeurM, 2 * une.d);
    const limite = avecTrottoir ? une.d : null;
    return { chausseeG: c / 2, chausseeD: -c / 2, trottoirG: g ? limite : null, trottoirD: g ? null : (limite === null ? null : -limite) };
  }
  // Aucune limite a portee : la chaussee d'avant, sur l'axe, a sa largeur lue.
  return { chausseeG: largeurM / 2, chausseeD: -largeurM / 2, trottoirG: null, trottoirD: null };
}

/**
 * Les profils des chaussees : chacune mesuree en travers tous les `PAS_PROFIL_M`, entre les limites des `parcelles` connues (celle
 * du projet, et les voisines importees du cadastre), partagee selon `partPourCent`. Une fonction pure : les memes donnees, les memes
 * profils, au plan comme en Vue 3D.
 */
export function profilerRues(chaussees: readonly ChausseeRue[], parcelles: readonly ParcelleConnue[], partPourCent = PART_TROTTOIRS_DEFAUT): ProfilRue[] {
  const part = bornerPart(partPourCent);
  const aretes: Arete[] = [];
  const contours = parcelles.filter((p) => p.pts.length >= 3).map((p) => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    p.pts.forEach((q, i) => {
      const r = p.pts[(i + 1) % p.pts.length] as PtBrut;
      aretes.push({ a: q, b: r, projet: p.projet, xMin: Math.min(q.x, r.x), xMax: Math.max(q.x, r.x), yMin: Math.min(q.y, r.y), yMax: Math.max(q.y, r.y) });
      xMin = Math.min(xMin, q.x); xMax = Math.max(xMax, q.x); yMin = Math.min(yMin, q.y); yMax = Math.max(yMax, q.y);
    });
    return { pts: p.pts, xMin, xMax, yMin, yMax };
  });
  // Les axes de toutes les rues : un rayon qui en traverse un autre que le sien sort de sa rue.
  const axes: (Arete & { rue: ChausseeRue })[] = [];
  for (const c of chaussees) {
    for (let i = 1; i < c.pts.length; i++) {
      const a = c.pts[i - 1] as PtBrut, b = c.pts[i] as PtBrut;
      axes.push({ a, b, projet: false, rue: c, xMin: Math.min(a.x, b.x), xMax: Math.max(a.x, b.x), yMin: Math.min(a.y, b.y), yMax: Math.max(a.y, b.y) });
    }
  }
  return chaussees.filter((c) => c.pts.length >= 2 && c.largeurM > 0).map((c) => {
    const ech = echantillonner(c.pts, PAS_PROFIL_M);
    // Seules les aretes a portee de ce troncon comptent : un quartier a des centaines de parcelles.
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of c.pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    const r = PORTEE_LIMITE_M;
    const proches = aretes.filter((e) => e.xMax >= xMin - r && e.xMin <= xMax + r && e.yMax >= yMin - r && e.yMin <= yMax + r);
    const autresAxes = axes.filter((e) => e.rue !== c && e.xMax >= xMin - r && e.xMin <= xMax + r && e.yMax >= yMin - r && e.yMin <= yMax + r);
    const dedans = contours.filter((k) => k.xMax >= xMin && k.xMin <= xMax && k.yMax >= yMin && k.yMin <= yMax);
    const mesures = ech.map((s) => {
      // Un axe pose dans une parcelle (un calage approche) ne dit rien de la rue a cet endroit.
      if (!proches.length || dedans.some((k) => pointInPolygon(s, k.pts))) return { g: null, d: null };
      // A un coude, le rayon suit la bissectrice : la distance lue se ramene a celle d'un bord parallele aux deux segments.
      const f = Math.hypot(s.nx, s.ny) || 1;
      const ramener = (l: Limite | null): Limite | null => (l ? { d: l.d / f, projet: l.projet } : null);
      return { g: ramener(premiereLimite(s, s.ux, s.uy, proches, autresAxes)), d: ramener(premiereLimite(s, -s.ux, -s.uy, proches, autresAxes)) };
    });
    const gs = lisser(mesures.map((m) => m.g)), ds = lisser(mesures.map((m) => m.d));
    const stations = ech.map((s, i) => ({ x: s.x, y: s.y, nx: s.nx, ny: s.ny, ...decider(gs[i] ?? null, ds[i] ?? null, c.largeurM, part) }));
    return { chaussee: c, stations };
  });
}

/** Les parcelles connues du plan : celle du projet, et les voisines importees du cadastre. */
export function parcellesConnues(objets: readonly ObjetPlan[]): ParcelleConnue[] {
  const projet = parcelleDuProjet(objets as ObjetPlan[]);
  return objets.filter((o) => estTerrain(o) && o.type === 'polygon' && Array.isArray(o.pts) && o.pts.length >= 3)
    .map((o) => ({ pts: (o as { pts: PtBrut[] }).pts, projet: o === projet }));
}

/** Une etiquette de rue posee sur la chaussee dessinee : la largeur de la chaussee sous elle, en metres. */
export interface EtiquetteSurChaussee extends EtiquetteRue { largeurM?: number }

/** Les etiquettes trop loin de tout axe (plus que cela) restent ou elles sont : ce n'est pas une rue dessinee. */
const PROCHE_AXE_M = 3;

/**
 * Pose chaque etiquette au milieu de la chaussee dessinee sous elle : quand la chaussee s'est decalee vers le milieu de l'espace entre
 * les parcelles, le nom la suit, et dit la largeur de la chaussee (la plaque de la Vue 3D s'y ajuste). Une etiquette loin de toute
 * chaussee reste ou elle est.
 */
export function etiquettesSurChaussees(etiquettes: readonly EtiquetteRue[], profils: readonly ProfilRue[]): EtiquetteSurChaussee[] {
  return etiquettes.map((e) => {
    let meilleure: StationRue | null = null, dMin = PROCHE_AXE_M;
    for (const p of profils) {
      if (p.chaussee.nom && p.chaussee.nom !== e.nom) continue;
      for (const s of p.stations) {
        const d = Math.hypot(s.x - e.x, s.y - e.y);
        if (d < dMin) { dMin = d; meilleure = s; }
      }
    }
    if (!meilleure) return { ...e };
    const milieu = (meilleure.chausseeG + meilleure.chausseeD) / 2;
    return { ...e, x: e.x + meilleure.nx * milieu, y: e.y + meilleure.ny * milieu, largeurM: meilleure.chausseeG - meilleure.chausseeD };
  });
}
