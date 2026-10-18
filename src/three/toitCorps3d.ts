// Les corps et pignons d'un batiment, dessines (MD/spec-toit-ign.md §13).
//
// Chaque corps (facade/toitCorps.ts) : ses pans, prolonges d'un debord a l'egout et d'une rive aux
// pignons ; au-dessus du prisme (pose a son egout le plus bas), les murs qui montent - le mur d'un
// pan plus haut que l'autre, les pignons de bout jusqu'au faitage - en couleur de mur. Chaque
// pignon qui part du faitage : ses deux pans, perpendiculaires, qui avancent du mur jusqu'a
// rencontrer le pan du corps (la noue nait de leur rencontre), et son triangle sur la facade. Un
// corps a croupes : ses pans en trapeze, et une croupe en triangle a chaque bout.

import type * as THREE_NS from 'three';
import { COULEUR_TOIT_DEFAUT, uvDuPan, trianguler, couperDemiPlan } from '../facade/toit.js';
import { repere, point, planCroupe, hauteurCorpsEn, penteDominante } from '../facade/toitCorps.js';
import { facettesEtendues, facettesLucarnes } from '../facade/toitFormes.js';
import { estSpecial } from '../facade/toitSpeciaux.js';
// Pures, elles vivent avec les corps ; reexportees pour qui les cherchait ici.
export { penteDuCorps, penteDominante } from '../facade/toitCorps.js';
import { pointInPolygon, signedArea } from '../geometry/basic.js';
import { materiauCouverture, couleurToitPlat, type ContexteCouverture } from '../model/couleurToit.js';
import { textureCouverture, matiereCouverture } from './couverture.js';
import type { VersLocal } from './primitives.js';
import { segmentEnFacade } from '../geometry/facadeExterieure.js';
import { distancePointSegment } from '../geometry/segments.js';
import type { CorpsToit, PtBrut, Toit } from '../model/types.js';

export const NOM_TOIT_CORPS = 'toit-corps';
/** Les facettes plates d'un batiment en corps : un toit-terrasse, en gravillons. */
export const NOM_TOIT_CORPS_PLAT = 'toit-corps-plat';
export const NOM_MUR_CORPS = 'toit-corps-mur';
/** Le debord du toit au-dela du mur, a l'egout, en metres (mesure a plat). */
export const DEBORD_EGOUT_M = 0.35;
/** Le debord a la rive, au-dela d'un pignon. */
export const DEBORD_RIVE_M = 0.2;
/** L'epaisseur d'un acrotere, en metres. */
const ACROTERE_EPAISSEUR_M = 0.2;
/** En deca, un mur au-dessus du prisme ne se dessine pas. */
const MUR_MIN_M = 0.02;

/** Un sommet : le plan (x, y) et la hauteur au-dessus du sol (z). */
export interface S3 { x: number; y: number; z: number }

/** Le cote d'un corps est-il une facade (geometry/facadeExterieure.ts) ? Sans contour, tous le sont. */
export function enFacade(r: ReturnType<typeof repere>, contour: readonly PtBrut[] | null, cote: 's0' | 'sL' | 't0' | 'tW'): boolean {
  if (!contour) return true;
  const milieu = point(r, r.L / 2, r.W / 2);
  const [a, b] = cote === 't0' ? [point(r, 0, 0), point(r, r.L, 0)] : cote === 'tW' ? [point(r, 0, r.W), point(r, r.L, r.W)]
    : cote === 's0' ? [point(r, 0, 0), point(r, 0, r.W)] : [point(r, r.L, 0), point(r, r.L, r.W)];
  return segmentEnFacade(a, b, milieu, contour);
}

/**
 * Un appentis ouvert (galerie, porche) : un seul pan, des poteaux dessous, pas de mur. Son corps n'a donc pas de prisme : ce qui se
 * voit sous lui est le mur du corps qui le porte (scene.ts).
 */
export function estAppentisOuvert(c: CorpsToit): boolean {
  if (c.ouvert !== true) return false;
  const { W } = repere(c.pts);
  return !estSpecial(c, W) && (c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01) && c.faitage - Math.min(...c.egouts) >= 0.05;
}

/** Un appentis est adosse quand les deux bouts de son mur haut sont a moins de cela d'un mur d'un autre corps. */
const ADOSSE_M = 0.05;

/**
 * Un appentis adosse a un autre corps du batiment (une galerie, un porche contre la maison) : son mur haut est un mur de ce corps.
 * Son toit s'arrete au nu des murs de la maison, sans rive aux bouts ni debord au-dela du mur haut : la rive passait le coin de la
 * maison (AE 101, galerie sud).
 */
export function appentisAdosse(c: CorpsToit, corps: readonly CorpsToit[]): boolean {
  const { W } = repere(c.pts);
  if (estSpecial(c, W) || !(c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01) || c.faitage - Math.min(...c.egouts) < 0.05) return false;
  // Le mur haut : pts[0] -> pts[1] (faitage a t = 0), sinon pts[2] -> pts[3].
  const [a, b] = (c.posFaitage <= 0.01 ? [c.pts[0], c.pts[1]] : [c.pts[2], c.pts[3]]) as [PtBrut, PtBrut];
  const surUnMur = (p: PtBrut, o: CorpsToit) => o.pts.some((q, i) => distancePointSegment(p, q, o.pts[(i + 1) % o.pts.length] as PtBrut) <= ADOSSE_M);
  return corps.some((o) => o !== c && surUnMur(a, o) && surUnMur(b, o));
}

/** La section d'un poteau d'appentis ouvert, son retrait du bord de l'egout et l'entraxe voulu entre deux poteaux. */
const POTEAU_COTE_M = 0.14;
const POTEAU_RETRAIT_M = 0.12;
const ENTRAXE_POTEAUX_M = 2.5;

/** Les poteaux d'un appentis ouvert, le long de son egout (`t` fixe) : quatre faces chacun, du sol a l'egout. */
function poteauxDAppentis(L: number, t: number, egout: number): { s: number; t: number; z: number }[][] {
  const n = Math.max(2, Math.ceil(L / ENTRAXE_POTEAUX_M) + 1), h = POTEAU_COTE_M / 2;
  const faces: { s: number; t: number; z: number }[][] = [];
  for (let i = 0; i < n; i++) {
    const s = POTEAU_RETRAIT_M + (i * (L - 2 * POTEAU_RETRAIT_M)) / (n - 1);
    const c = [[s - h, t - h], [s + h, t - h], [s + h, t + h], [s - h, t + h]] as const;
    for (let k = 0; k < 4; k++) {
      const [a, b] = [c[k] as readonly [number, number], c[(k + 1) % 4] as readonly [number, number]];
      faces.push([{ s: a[0], t: a[1], z: 0 }, { s: b[0], t: b[1], z: 0 }, { s: b[0], t: b[1], z: egout }, { s: a[0], t: a[1], z: egout }]);
    }
  }
  return faces;
}

/**
 * Les facettes d'un corps dans le plan : les pans du toit (corps et pignons) et les murs qui montent
 * au-dessus de son prisme. Le debord (a l'egout, a la rive) n'existe que sur une facade du `contour`.
 */
export function facettesCorps(c: CorpsToit, contour: readonly PtBrut[] | null = null, debord = true, adosse = false): { pans: S3[][]; murs: S3[][] } {
  const r = repere(c.pts);
  const { L, W } = r;
  const p = c.posFaitage, F = c.faitage, [e0, e1] = c.egouts;
  // Un papillon descend sous ses egouts, vers sa noue : le prisme s'arrete a la noue, les murs montent de la jusqu'aux egouts.
  const special = estSpecial(c, W);
  const bas = special ? Math.min(e0, e1, F) : Math.min(e0, e1);
  const P = (s: number, t: number, z: number): S3 => ({ ...point(r, s, t), z });
  const facade = (cote: 's0' | 'sL' | 't0' | 'tW') => debord && enFacade(r, contour, cote);
  // Un appentis adosse (appentisAdosse) n'a ni rive aux bouts ni debord au-dela de son mur haut, qui est celui de la maison.
  const hautEnT0 = c.posFaitage <= 0.01;
  const dE0 = facade('t0') && !(adosse && hautEnT0) ? DEBORD_EGOUT_M : 0, dE1 = facade('tW') && !(adosse && !hautEnT0) ? DEBORD_EGOUT_M : 0;
  const dR0 = facade('s0') && !adosse ? DEBORD_RIVE_M : 0, dRL = facade('sL') && !adosse ? DEBORD_RIVE_M : 0;
  const pans: S3[][] = [], murs: S3[][] = [];
  const plat = !special && F - Math.min(e0, e1) < 0.05;
  // Un appentis : un seul pan, le faitage sur un mur (celui de la maison qui le porte).
  const appentis = !special && (p <= 0.01 || p >= W - 0.01);
  // Les croupes : le faitage s'arrete a h0 et h1 des murs de bout, les pans deviennent des trapezes.
  const [h0, h1] = !plat && p > 0.01 && p < W - 0.01 ? c.croupes ?? [0, 0] : [0, 0];
  // Un pan, dans son repere : `s` le long du faitage, `d` la distance a son mur d'egout (negative
  // sous le debord). Ses pignons l'entaillent le long de leurs noues : du pied du pignon sur le mur
  // jusqu'au bout de son faitage, la ou les deux pans se rencontrent. Sans cela, le grand pan et son
  // debord passaient sous le pignon et ressortaient devant son triangle.
  const pan = (n: 0 | 1) => {
    const largeur = n === 0 ? p : W - p;
    if (largeur < 0.01) return;
    const e = n === 0 ? e0 : e1, dE = n === 0 ? dE0 : dE1, k = (F - e) / largeur;
    const Q = (s: number, d: number) => P(s, n === 0 ? d : W - d, e + k * d);
    // Un appentis (l'autre pan n'existe pas) deborde aussi au-dela de son mur haut, en continuant de monter.
    const haut = largeur + ((n === 0 ? W - p : p) < 0.01 ? (n === 0 ? dE1 : dE0) : 0);
    // Sous une croupe, le coin du pan suit l'aretier prolonge jusqu'au debord : il reste dans les deux plans.
    const contour: { s: number; d: number }[] = [{ s: h0 > 0 ? h0 : -dR0, d: haut }];
    const pignons = c.pignons.filter((g) => g.pan === n).sort((a, b) => a.debut - b.debut);
    let ouvert = false;
    if ((pignons[0]?.debut ?? Infinity) > 0.3) { contour.push({ s: h0 > 0 ? (-dE * h0) / largeur : -dR0, d: -dE }); ouvert = true; }
    for (const g of pignons) {
      const sc = (g.debut + g.fin) / 2, D = Math.max(0.1, Math.min(largeur, g.profondeur));
      // La noue prolongee jusqu'au bord du debord, pour que l'entaille coupe aussi le debord.
      const ext = dE > 0 ? ((sc - g.debut) * dE) / D : 0;
      if (g.debut <= 0.3) contour.push({ s: -dR0, d: 0 });
      else contour.push({ s: g.debut - ext, d: -dE });
      contour.push({ s: sc, d: D });
      if (g.fin >= L - 0.3) { contour.push({ s: L + dRL, d: 0 }); ouvert = false; }
      else { contour.push({ s: g.fin + ext, d: -dE }); ouvert = true; }
    }
    if (ouvert) contour.push({ s: h1 > 0 ? L + (dE * h1) / largeur : L + dRL, d: -dE });
    contour.push({ s: h1 > 0 ? L - h1 : L + dRL, d: haut });
    pans.push(contour.map((q) => Q(q.s, q.d)));
  };
  // Un profil brise, une demi-croupe ou un brisis : le toit est la plus basse de ses facettes (facade/toitFormes.ts).
  const etendue = plat ? null : facettesEtendues(c, L, W, { egout0: dE0, egout1: dE1, rive0: dR0, rive1: dRL }, bas);
  if (etendue) {
    pans.push(...etendue.pans.map((f) => f.map((q) => P(q.s, q.t, q.z))));
    murs.push(...etendue.murs.map((f) => f.map((q) => P(q.s, q.t, q.z))));
  } else if (!plat) {
    // Le pan 0, de t = 0 au faitage ; le pan 1, du faitage a t = W. Un appentis n'en a qu'un.
    pan(0);
    pan(1);
    // Les murs de bout, du prisme au toit : le pignon (ou le mur haut d'un appentis) ; sous une
    // croupe, le mur s'arrete aux egouts, et la croupe, un triangle, couvre le bout.
    for (const [s, h] of [[0, h0], [L, h1]] as const) {
      if (h > 0) {
        if (Math.max(e0, e1) - bas > MUR_MIN_M) murs.push([P(s, 0, bas), P(s, 0, e0), P(s, W, e1), P(s, W, bas)]);
        const dehors = s === 0 ? -1 : 1, z = (sc: number, t: number) => planCroupe(c, W, h, s === 0 ? sc : L - sc, t);
        const a = s + (dehors * dE0 * h) / p, b = s + (dehors * dE1 * h) / (W - p), sommet = s === 0 ? h : L - h;
        pans.push([P(a, -dE0, z(a, -dE0)), P(b, W + dE1, z(b, W + dE1)), P(sommet, p, F)]);
        continue;
      }
      // Un appentis ouvert (galerie, porche) n'a pas de mur de bout : ses poteaux le portent ; ferme, ses murs descendent jusqu'au sol.
      if (appentis && c.ouvert === true) continue;
      const sol = appentis && c.ouvert === false ? 0 : bas;
      const profil = [P(s, 0, sol), P(s, 0, e0), ...(p > 0.01 && p < W - 0.01 ? [P(s, p, F)] : []), P(s, W, e1), P(s, W, sol)];
      murs.push(profil);
    }
  }
  // Sous l'egout d'un appentis : un mur plein jusqu'au sol (ferme), ou des poteaux (ouvert, sans mur exterieur).
  if (appentis && c.ouvert !== undefined && !plat) {
    const tBas = p <= 0.01 ? W : 0, eBas = p <= 0.01 ? e1 : e0;
    if (eBas > MUR_MIN_M) {
      if (c.ouvert === false) murs.push([P(0, tBas, 0), P(L, tBas, 0), P(L, tBas, eBas), P(0, tBas, eBas)]);
      else murs.push(...poteauxDAppentis(L, tBas === 0 ? POTEAU_RETRAIT_M : W - POTEAU_RETRAIT_M, eBas).map((f) => f.map((q) => P(q.s, q.t, q.z))));
    }
  }
  // Le mur d'un pan plus haut que le prisme.
  if (e0 - bas > MUR_MIN_M) murs.push([P(0, 0, bas), P(L, 0, bas), P(L, 0, e0), P(0, 0, e0)]);
  if (e1 - bas > MUR_MIN_M) murs.push([P(0, W, bas), P(L, W, bas), P(L, W, e1), P(0, W, e1)]);
  // Les pignons : deux pans perpendiculaires au faitage, du mur jusqu'a leurs noues, et leur triangle.
  for (const pg of c.pignons) {
    const e = c.egouts[pg.pan];
    const largeur = pg.pan === 0 ? p : W - p;
    const dE = pg.pan === 0 ? dE0 : dE1;
    const T = (d: number) => (pg.pan === 0 ? d : W - d);
    const D = Math.max(0.1, Math.min(largeur, pg.profondeur));
    const sc = (pg.debut + pg.fin) / 2, demi = (pg.fin - pg.debut) / 2;
    const k = demi > 0 ? (pg.faitage - e) / demi : 0;
    // Le debord du pignon le long du mur, de chaque cote ; un pignon qui touche le bout du corps
    // s'y arrete, au nu du mur de bout (et de son debord quand ce bout est une facade).
    const gauche = pg.debut <= 0.3 ? -dR0 : pg.debut - DEBORD_RIVE_M, droite = pg.fin >= L - 0.3 ? L + dRL : pg.fin + DEBORD_RIVE_M;
    const zG = e - k * (pg.debut - gauche), zD = e - k * (droite - pg.fin);
    // Chaque pan du pignon s'arrete a sa noue : du pied du pignon au bout de son faitage.
    const piedG = pg.debut <= 0.3 ? gauche : pg.debut, piedD = pg.fin >= L - 0.3 ? droite : pg.fin;
    pans.push([P(gauche, T(-dE), zG), P(sc, T(-dE), pg.faitage), P(sc, T(D), pg.faitage), P(piedG, T(0), pg.debut <= 0.3 ? zG : e)]);
    pans.push([P(sc, T(-dE), pg.faitage), P(droite, T(-dE), zD), P(piedD, T(0), pg.fin >= L - 0.3 ? zD : e), P(sc, T(D), pg.faitage)]);
    murs.push([P(pg.debut, T(0), e), P(pg.fin, T(0), e), P(sc, T(0), pg.faitage)]);
  }
  // L'acrotere d'un toit-terrasse : le muret qui borde le toit, de l'epaisseur d'un parpaing, dessine par ses faces et son dessus.
  const acro = plat ? c.terrasse?.acrotereM ?? 0 : 0;
  if (acro > 0.05) {
    const ep = Math.min(ACROTERE_EPAISSEUR_M, L / 4, W / 4), z0 = F, z1 = F + acro;
    const coins: [number, number][] = [[0, 0], [L, 0], [L, W], [0, W]], interieur: [number, number][] = [[ep, ep], [L - ep, ep], [L - ep, W - ep], [ep, W - ep]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, [a, b] = [coins[i] as [number, number], coins[j] as [number, number]], [ai, bi] = [interieur[i] as [number, number], interieur[j] as [number, number]];
      murs.push([P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z1), P(a[0], a[1], z1)]);
      murs.push([P(ai[0], ai[1], z0), P(bi[0], bi[1], z0), P(bi[0], bi[1], z1), P(ai[0], ai[1], z1)]);
      pans.push([P(a[0], a[1], z1), P(b[0], b[1], z1), P(bi[0], bi[1], z1), P(ai[0], ai[1], z1)]);
    }
  }
  // Les lucarnes se posent sur le pan, au-dessus de lui.
  if (c.lucarnes?.length) {
    const lu = facettesLucarnes(c, L, W);
    pans.push(...lu.pans.map((f) => f.map((q) => P(q.s, q.t, q.z))));
    murs.push(...lu.murs.map((f) => f.map((q) => P(q.s, q.t, q.z))));
  }
  return { pans, murs };
}

/** La hauteur du toit des corps en un point du plan : le plus haut des corps qui le couvrent, null hors de tous. */
export function hauteurDesCorps(corps: readonly CorpsToit[], q: PtBrut): number | null {
  let z: number | null = null;
  for (const c of corps) {
    if (!pointInPolygon(q, c.pts)) continue;
    const r = repere(c.pts), dx = q.x - r.p0.x, dy = q.y - r.p0.y;
    const h = hauteurCorpsEn(c, r.L, r.W, dx * r.u.x + dy * r.u.y, dx * r.v.x + dy * r.v.y);
    z = z === null ? h : Math.max(z, h);
  }
  return z;
}

/** Le plan z = a x + b y + c d'une facette, par trois de ses sommets non alignes ; null si elle est verticale. */
function planDe(poly: readonly S3[]): ((q: PtBrut) => number) | null {
  const A = poly[0], B = poly[1];
  for (let k = 2; k < poly.length && A && B; k++) {
    const P = poly[k] as S3;
    const ux = B.x - A.x, uy = B.y - A.y, vx = P.x - A.x, vy = P.y - A.y;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-9) continue;
    const uz = B.z - A.z, vz = P.z - A.z;
    const a = (uz * vy - uy * vz) / det, b = (ux * vz - uz * vx) / det;
    return (q) => A.z + a * (q.x - A.x) + b * (q.y - A.y);
  }
  return null;
}

/** Le contour coupe par une facette convexe (Sutherland-Hodgman : le contour peut etre concave). */
function contourSousFacette(contour: readonly PtBrut[], facette: readonly PtBrut[]): PtBrut[] {
  const sens = Math.sign(signedArea(facette as PtBrut[])) || 1;
  let poly = contour.map((q) => ({ x: q.x, y: q.y }));
  facette.forEach((a, i) => {
    const b = facette[(i + 1) % facette.length] as PtBrut;
    poly = couperDemiPlan(poly, (q) => -sens * ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)));
  });
  return poly;
}

/**
 * Le polygone sans ses sommets doubles : un sommet de la facette pose sur le contour sort deux fois
 * de la coupe, et la triangulation par oreilles ne trouve plus d'oreille a cote d'un sommet double.
 */
function sansDoublons(poly: PtBrut[]): PtBrut[] {
  const proche = (a: PtBrut, b: PtBrut) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  const out = poly.filter((q, i) => i === 0 || !proche(q, poly[i - 1] as PtBrut));
  while (out.length > 1 && proche(out[0] as PtBrut, out[out.length - 1] as PtBrut)) out.pop();
  return out;
}

/** Le pas des murs qui montent du prisme au toit, le long du contour. */
const PAS_MUR_M = 0.25;

/**
 * Les corps poses sur le contour du batiment, tel que le plan le dessine : quand ses corps ont ete
 * lus sur un contour remis a l'equerre (un cote de biais), les rectangles ne le suivent plus, et des
 * prismes par corps changeaient la forme du batiment entre le plan et la 3D. Ici le prisme est le
 * contour lui-meme, a l'egout le plus bas des corps (`bas`) ; les toits des corps sont decoupes sur
 * lui, sans debord ; ses murs montent jusqu'au toit, pas a pas, la ou un corps le couvre. Ce que
 * aucun corps ne couvre garde le dessus du prisme, plat. `hauteursMurs` : le bas de chaque mur sous
 * le toit, pour y poser les fenetres.
 */
export function facettesSurContour(corps: readonly CorpsToit[], contour: readonly PtBrut[]): { pans: S3[][]; murs: S3[][]; bas: number; hauteursMurs: number[] } {
  const bas = Math.min(...corps.flatMap((c) => c.egouts));
  const pans: S3[][] = [];
  for (const c of corps) {
    const plat = !estSpecial(c, repere(c.pts).W) && c.faitage - Math.min(...c.egouts) < 0.05;
    // Un toit plat a l'egout le plus bas est le dessus du prisme : le redessiner les ferait scintiller.
    if (plat && c.faitage - bas < 0.05) continue;
    const facettes = plat ? [c.pts.map((q) => ({ ...q, z: c.faitage }))] : facettesCorps(c, null, false).pans;
    for (const f of facettes) {
      const plan = planDe(f);
      const coupe = plan ? sansDoublons(contourSousFacette(contour, f)) : [];
      if (plan && coupe.length >= 3 && Math.abs(signedArea(coupe)) > 0.01) pans.push(coupe.map((q) => ({ ...q, z: plan(q) })));
    }
  }
  // Les murs, juste en dedans du contour : un point d'un cote commun a un corps est bien sous lui.
  const sens = Math.sign(signedArea(contour as PtBrut[])) || 1;
  const murs: S3[][] = [];
  const hauteursMurs = contour.map((a, i) => {
    const b = contour[(i + 1) % contour.length] as PtBrut;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) return bas;
    const n = { x: (-sens * (b.y - a.y)) / l, y: (sens * (b.x - a.x)) / l };
    const k = Math.max(1, Math.ceil(l / PAS_MUR_M));
    const ts = Array.from({ length: k + 1 }, (_, j) => j / k);
    const z = ts.map((t) => Math.max(bas, hauteurDesCorps(corps, { x: a.x + (b.x - a.x) * t + n.x * 0.05, y: a.y + (b.y - a.y) * t + n.y * 0.05 }) ?? bas));
    const P = (t: number, h: number): S3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: h });
    for (let j = 0; j < k; j++) {
      if (Math.max(z[j] as number, z[j + 1] as number) - bas > MUR_MIN_M) murs.push([P(ts[j] as number, bas), P(ts[j + 1] as number, bas), P(ts[j + 1] as number, z[j + 1] as number), P(ts[j] as number, z[j] as number)]);
    }
    return Math.min(...z);
  });
  murs.push(...mursEntreCorps(corps, contour, bas));
  // Les faces et les joues des lucarnes (leurs toits sont deja dans les pans) : elles ne dependent pas du contour.
  for (const c of corps) {
    if (!c.lucarnes?.length) continue;
    const r = repere(c.pts);
    murs.push(...facettesLucarnes(c, r.L, r.W).murs.map((f) => f.map((q) => ({ ...point(r, q.s, q.t), z: q.z }))));
  }
  return { pans, murs, bas, hauteursMurs };
}

/**
 * Les murs entre deux corps, a l'interieur du contour : la ou un corps est plus haut que ce qui le
 * borde (un autre corps, ou le dessus du prisme), son mur monte de l'un a l'autre. Sans eux, sous
 * l'egout d'un corps haut pose contre un toit plus bas, on voyait le vide sous le toit (le grand
 * quatre-pans d'AE 103, dont l'egout a 4,9 m domine la terrasse a 3,7 m).
 */
function mursEntreCorps(corps: readonly CorpsToit[], contour: readonly PtBrut[], bas: number): S3[][] {
  const murs: S3[][] = [];
  for (const c of corps) {
    const sens = Math.sign(signedArea(c.pts as PtBrut[])) || 1;
    c.pts.forEach((a, i) => {
      const b = c.pts[(i + 1) % c.pts.length] as PtBrut;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < 1e-6) return;
      // La normale vers l'exterieur du corps.
      const n = { x: (sens * (b.y - a.y)) / l, y: (-sens * (b.x - a.x)) / l };
      const k = Math.max(1, Math.ceil(l / PAS_MUR_M));
      const ts = Array.from({ length: k + 1 }, (_, j) => j / k);
      const q = (t: number, d: number): PtBrut => ({ x: a.x + (b.x - a.x) * t + n.x * d, y: a.y + (b.y - a.y) * t + n.y * d });
      // Seulement a l'interieur du contour : sur le contour, ses propres murs montent deja au toit.
      const dedans = ts.map((t) => pointInPolygon(q(t, 0.05), contour as PtBrut[]) && pointInPolygon(q(t, -0.05), contour as PtBrut[]));
      const haut = ts.map((t) => hauteurDesCorps(corps, q(t, -0.05)) ?? bas);
      const pied = ts.map((t) => Math.max(bas, hauteurDesCorps(corps, q(t, 0.05)) ?? bas));
      const P = (t: number, z: number): S3 => ({ ...q(t, 0), z });
      for (let j = 0; j < k; j++) {
        if (!dedans[j] || !dedans[j + 1]) continue;
        const h0 = haut[j] as number, h1 = haut[j + 1] as number, p0 = pied[j] as number, p1 = pied[j + 1] as number;
        if (Math.max(h0 - p0, h1 - p1) > MUR_MIN_M) murs.push([P(ts[j] as number, Math.min(p0, h0)), P(ts[j + 1] as number, Math.min(p1, h1)), P(ts[j + 1] as number, h1), P(ts[j] as number, h0)]);
      }
    });
  }
  return murs;
}

export interface ContexteToitCorps {
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  couleurMur: string | number;
  textures: boolean;
  /** La texture des murs du prisme (choisie, ou dessinee d'apres le materiau) : les murs hauts la reprennent. */
  textureMur?: unknown;
  /** Le materiau de toiture des fichiers fonciers : avec la pente des corps, il choisit la texture de la couverture. */
  couverture?: ContexteCouverture | undefined;
}

/**
 * Une maille de polygones, avec des coordonnees de texture si on les donne. Un pan entaille par ses
 * pignons n'est plus convexe : il se triangule par oreilles dans le plan ; un mur, vertical, en eventail.
 */
export function maille(polys: readonly S3[][], toLocal: VersLocal, uv: boolean, pans = false, uvMur = false): THREE_NS.BufferGeometry {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (const poly of polys) {
    const base = pos.length / 3;
    poly.forEach((q) => { const l = toLocal(q); pos.push(l.x, q.z, l.z); });
    if (uv) uvs.push(...uvDuPan(poly));
    else if (uvMur) uvs.push(...uvDuMur(poly));
    const tris = pans && poly.length > 4 ? trianguler(poly) : null;
    if (tris && tris.length) tris.forEach(([a, b, c2]) => idx.push(base + a, base + b, base + c2));
    else for (let i = 1; i + 1 < poly.length; i++) idx.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv || uvMur) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Les coordonnees de texture d'un mur vertical, en metres : u le long du mur (sa projection sur son
 * premier cote non vertical), v la hauteur. Les murs hauts raccordent ainsi la texture du prisme.
 */
export function uvDuMur(poly: readonly S3[]): number[] {
  const a = poly[0];
  if (!a) return [];
  const b = poly.find((q) => Math.hypot(q.x - a.x, q.y - a.y) > 1e-6) ?? a;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  return poly.flatMap((q) => [(q.x - a.x) * ux + (q.y - a.y) * uy, q.z]);
}

/** Pose les toits des corps decoupes sur le contour, et les murs qui montent jusqu'a eux (`facettesSurContour`). */
export function ajouterToitCorpsSurContour3d(ctx: ContexteToitCorps, corps: readonly CorpsToit[], toitRef: Toit | null | undefined, contour: readonly PtBrut[]): { pans: number; murs: number } {
  const { pans, murs } = facettesSurContour(corps, contour);
  poserFacettes(ctx, pans, murs, toitRef, penteDominante(corps));
  return { pans: pans.length, murs: murs.length };
}

/** Pose les toits et les murs hauts des corps d'un batiment. `toitRef` porte la couleur de la couverture ; `contour` dit ou sont les facades. */
export function ajouterToitCorps3d(ctx: ContexteToitCorps, corps: readonly CorpsToit[], toitRef: Toit | null | undefined, contour: readonly PtBrut[] | null = null): { pans: number; murs: number } {
  const pans: S3[][] = [], murs: S3[][] = [];
  corps.forEach((c) => { const f = facettesCorps(c, contour, true, appentisAdosse(c, corps)); pans.push(...f.pans); murs.push(...f.murs); });
  poserFacettes(ctx, pans, murs, toitRef, penteDominante(corps));
  return { pans: pans.length, murs: murs.length };
}

/**
 * Les facettes en mailles : la couverture en pente (sa couleur, sa texture, choisie par le materiau et
 * la pente), les facettes plates d'un corps en toit-terrasse (gravillons, gris d'un toit plat), et les murs.
 */
function poserFacettes(ctx: ContexteToitCorps, pans: readonly S3[][], murs: readonly S3[][], toitRef: Toit | null | undefined, pente: number | null = null): void {
  const plate = (f: readonly S3[]) => f.every((q) => Math.abs(q.z - (f[0] as S3).z) < 0.01);
  const enPente = pans.filter((f) => !plate(f)), plates = pans.filter(plate);
  if (enPente.length) {
    const materiau = materiauCouverture(toitRef, { ...ctx.couverture, pente });
    const tex = ctx.textures ? textureCouverture(materiau) : null;
    const m = new THREE.Mesh(maille(enPente, ctx.toLocal, !!tex, true), new THREE.MeshStandardMaterial({ color: toitRef?.couleur || COULEUR_TOIT_DEFAUT, ...matiereCouverture(materiau), side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) }));
    m.name = NOM_TOIT_CORPS;
    ctx.scene.add(m);
  }
  if (plates.length) {
    const tex = ctx.textures ? textureCouverture('terrasse') : null;
    const m = new THREE.Mesh(maille(plates, ctx.toLocal, !!tex, true), new THREE.MeshStandardMaterial({ color: couleurToitPlat(toitRef), ...matiereCouverture('terrasse'), side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) }));
    m.name = NOM_TOIT_CORPS_PLAT;
    ctx.scene.add(m);
  }
  if (murs.length) {
    // Une texture dessinee seulement (THREE.Texture, en metres) : une texture choisie se charge sur le prisme.
    const tex = (ctx.textureMur as { isTexture?: boolean } | null | undefined)?.isTexture ? (ctx.textureMur as THREE_NS.Texture) : null;
    const m = new THREE.Mesh(maille(murs, ctx.toLocal, false, false, !!tex), new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) }));
    m.name = NOM_MUR_CORPS;
    ctx.scene.add(m);
  }
}
