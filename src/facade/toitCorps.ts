// Les corps d'un batiment et leurs pignons, reconstruits sur le toit mesure au LiDAR
// (MD/spec-toit-ign.md §13).
//
// La surface mesuree (model/toitMesure.ts) est fidele mais ne dit pas ce qu'elle montre. Ici, on
// la lit comme un couvreur : des corps de batiment, chacun un rectangle couvert d'un faitage et de
// deux pans qui ont chacun leur egout (un appentis quand le faitage est sur un mur, un toit plat
// quand il n'y a pas de pente), et, sur un long pan, les pignons qui partent du faitage pour
// venir dresser leur triangle sur la facade.
//
//   1. Les corps : les rectangles du contour (model/volumesToit.ts), coupes aux marches de la
//      couverture (model/toitMesure.ts::decouperParHauteurs), puis la ou deux toits simples
//      expliquent la mesure nettement mieux qu'un seul (`meilleureCoupe`).
//   2. Le toit d'un corps : pour chaque sens de faitage et chaque position du faitage dans la
//      largeur, l'egout de chaque pan et la hauteur du faitage par moindres carres ; le plus petit
//      ecart l'emporte (`ajusterCorps`).
//   3. Les pignons : le long du mur d'un pan, la ou la mesure depasse le pan de 80 cm et plus sur
//      1,5 a 6 m, et ou, vers l'interieur, elle reste a la meme hauteur (un faitage horizontal)
//      sur au moins 1,5 m (`detecterPignons`). Le corps est ensuite reajuste sans eux.

import { au } from '../util/tableaux.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointContour } from '../geometry/proximite.js';
import { hauteurToitMesure, decouperParHauteurs, SOL_M } from '../model/toitMesure.js';
import { rectanglesDuContour, rectanglesEnTranches, TOLERANCE_DEG } from '../model/volumesToit.js';
import { ajusterToit, diagnostiquerToit, type EchantillonHauteur, type ToitAjuste } from './toitLidar.js';
import { angleDuPlusLongCote, repereFaitage } from '../geometry/faitage.js';
import type { CorpsToit, PignonToit, PtBrut, ToitMesure } from '../model/types.js';

/** Le pas des positions de faitage essayees dans la largeur d'un corps. */
export const PAS_FAITAGE_M = 0.25;
/** Au-dela, un pan n'est pas une couverture (l'ecretage de la BD TOPO est a 55°). */
export const PENTE_MAX_DEG = 60;
/** Une mesure a plus de cela du toit ajuste est un arbre, une cheminee, un pignon : ecartee, puis l'ajustement refait. */
export const ECART_ABERRANT_M = 1.2;
/**
 * Ce qui depasse le toit ajuste de plus de cela est ecarte, passe apres passe : un pignon, un arbre,
 * une lucarne ajoutent toujours de la hauteur au pan, jamais n'en retirent. Sans cela, deux pignons
 * qui couvrent la moitie d'un pan le relevaient d'un metre et n'etaient plus vus.
 */
export const DEPASSEMENT_GARDE_M = 0.4;
/** Le nombre de passes de l'ajustement. */
const PASSES = 5;
/** En deca de cette hauteur de faitage au-dessus des egouts, le toit est plat. */
export const HAUTEUR_PLAT_M = 0.3;
/** Et en deca de cette pente : l'ecoulement d'une toiture-terrasse, pas un pan. */
export const PENTE_PLAT_DEG = 3;
/** Un pan plus etroit que cela, contre un mur, n'en est pas un : le faitage est sur le mur, un appentis. */
export const PAN_MIN_M = 1;
/** L'appentis l'emporte sur ce faux petit pan tant que son ecart ne depasse pas le sien de plus de 10 % et 5 cm. */
const TOLERANCE_APPENTIS = 1.1, TOLERANCE_APPENTIS_M = 0.05;
/** Un pan seul plutot qu'un toit plat : seulement si son ecart tombe a cette part de celui du plat. */
export const GAIN_PAN_SUR_PLAT = 0.9;
/** Un pignon depasse le pan qui le porte d'au moins cela, le long du mur. */
export const SURPLUS_PIGNON_M = 0.8;
/** La largeur d'un pignon le long du mur. */
export const LARGEUR_PIGNON_MIN_M = 1.5;
export const LARGEUR_PIGNON_MAX_M = 6;
/** Un pignon avance d'au moins cela vers l'interieur, a hauteur constante. */
export const PROFONDEUR_PIGNON_MIN_M = 1.5;
/** Le long de son faitage, la mesure ne descend pas plus bas que cela sous lui. */
export const TOLERANCE_FAITAGE_M = 0.5;
/** Deux toits plutot qu'un : seulement si l'ecart tombe aux deux tiers, s'il valait au moins cela, et si les deux different d'autant. */
export const GAIN_COUPE = 2 / 3;
export const ECART_COUPE_MIN_M = 0.25;
export const DIFFERENCE_COUPE_M = 0.6;
/** Un corps fait au moins cela de large. */
export const LARGEUR_CORPS_MIN_M = 2;
/** Il faut tant de mesures pour ajuster un corps. */
export const MESURES_MIN = 12;

const dixieme = (v: number) => Math.round(v * 10) / 10;
const cm = (v: number) => Math.round(v * 100) / 100;
const TAN_MAX = Math.tan((PENTE_MAX_DEG * Math.PI) / 180);

/** Le repere d'un rectangle : son coin, la direction de sa longueur et de sa largeur, leurs longueurs. */
export interface Repere { p0: PtBrut; u: PtBrut; v: PtBrut; L: number; W: number }
export function repere(rect: readonly PtBrut[]): Repere {
  const p0 = au(rect, 0), p1 = au(rect, 1), p3 = au(rect, 3);
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  return { p0, u: { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v: { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W }, L, W };
}
/** Le point (s le long, t dans la largeur) d'un repere. */
export const point = (r: Repere, s: number, t: number): PtBrut => ({ x: r.p0.x + r.u.x * s + r.v.x * t, y: r.p0.y + r.u.y * s + r.v.y * t });

/** La hauteur du toit d'un corps a l'abscisse `t` de sa largeur. */
export function hauteurCorps(c: Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'>, W: number, t: number): number {
  const p = c.posFaitage, [e0, e1] = c.egouts;
  if (t <= p) return p <= 0 ? c.faitage : e0 + ((c.faitage - e0) * t) / p;
  return p >= W ? c.faitage : e1 + ((c.faitage - e1) * (W - t)) / (W - p);
}

/**
 * Le plan d'une croupe, a `s` de son mur de bout : il passe par les deux coins du bout, chacun a
 * l'egout de son pan, et par le bout du faitage, a `h` du mur.
 */
export function planCroupe(c: Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'>, W: number, h: number, s: number, t: number): number {
  const [e0, e1] = c.egouts;
  const auFaitage = e0 + ((e1 - e0) * c.posFaitage) / W;
  return e0 + ((e1 - e0) * t) / W + ((c.faitage - auFaitage) * s) / h;
}

/** La hauteur du toit d'un corps au point (s, t) : ses pans, coupes par ses croupes quand il en a. */
export function hauteurCorpsEn(c: Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts' | 'croupes'>, L: number, W: number, s: number, t: number): number {
  let z = hauteurCorps(c, W, t);
  const [h0, h1] = c.croupes ?? [0, 0];
  if (h0 > 0) z = Math.min(z, planCroupe(c, W, h0, s, t));
  if (h1 > 0) z = Math.min(z, planCroupe(c, W, h1, L - s, t));
  return z;
}

/** Une grille de hauteurs : la surface mesuree, ou la grille lue au LiDAR. */
export type Grille = Pick<ToitMesure, 'pas' | 'x0' | 'y0' | 'nx' | 'ny' | 'z'>;

/** Une mesure dans le repere d'un corps. */
interface Mesure { s: number; t: number; z: number }

/** Les cellules de la surface mesuree dans le rectangle (et dans le contour), dans son repere. */
function mesuresDans(m: ToitMesure, r: Repere, rect: readonly PtBrut[], contour: readonly PtBrut[], exclure: readonly PtBrut[][] = []): Mesure[] {
  const out: Mesure[] = [];
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
    const z = m.z[j * m.nx + i];
    if (z === null || z === undefined || z < SOL_M) continue;
    const p = { x: m.x0 + i * m.pas, y: m.y0 - j * m.pas };
    if (!pointInPolygon(p, rect) || !pointInPolygon(p, contour) || exclure.some((e) => pointInPolygon(p, e))) continue;
    const dx = p.x - r.p0.x, dy = p.y - r.p0.y;
    out.push({ s: dx * r.u.x + dy * r.u.y, t: dx * r.v.x + dy * r.v.y, z });
  }
  return out;
}

/** Les moindres carres sur 2 ou 3 inconnues (equations normales, pivot de Gauss) ; null si singulier. */
function moindresCarres(lignes: readonly number[][], z: readonly number[]): number[] | null {
  const n = au(lignes, 0).length;
  const A = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  lignes.forEach((l, k) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) (A[a] as number[])[b] = (A[a]?.[b] ?? 0) + (l[a] ?? 0) * (l[b] ?? 0);
      (A[a] as number[])[n] = (A[a]?.[n] ?? 0) + (l[a] ?? 0) * (z[k] ?? 0);
    }
  });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]?.[c] ?? 0) > Math.abs(A[piv]?.[c] ?? 0)) piv = r;
    if (Math.abs(A[piv]?.[c] ?? 0) < 1e-9) return null;
    [A[c], A[piv]] = [A[piv] as number[], A[c] as number[]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = (A[r]?.[c] ?? 0) / (A[c]?.[c] ?? 1);
      for (let k = c; k <= n; k++) (A[r] as number[])[k] = (A[r]?.[k] ?? 0) - f * (A[c]?.[k] ?? 0);
    }
  }
  return A.map((l, c) => (l[n] ?? 0) / (l[c] ?? 1));
}

interface Profil { p: number; F: number; e0: number; e1: number; ecart: number }

/** Le toit a un faitage en `p`, ajuste par moindres carres sur les mesures : faitage et deux egouts. */
function profilEn(ms: readonly Mesure[], W: number, p: number): Profil | null {
  const ligne = (t: number): number[] => {
    if (p <= 0) return [(W - t) / W, t / W]; // F, e1 ; le mur t = 0 monte au faitage
    if (p >= W) return [t / W, 1 - t / W]; // F, e0
    return t <= p ? [t / p, 1 - t / p, 0] : [(W - t) / (W - p), 0, (t - p) / (W - p)];
  };
  let garde = ms;
  let sol: number[] | null = null;
  for (let passe = 0; passe < PASSES; passe++) {
    if (garde.length < MESURES_MIN) return null;
    sol = moindresCarres(garde.map((m) => ligne(m.t)), garde.map((m) => m.z));
    if (!sol) return null;
    const s = sol;
    const predit = (t: number) => ligne(t).reduce((a, x, k) => a + x * (s[k] ?? 0), 0);
    // Au-dessus du pan, on ecarte vite ; en dessous, seulement l'aberrant (un trou mal bouche).
    const suivant = ms.filter((m) => { const r = m.z - predit(m.t); return r <= (passe === 0 ? ECART_ABERRANT_M : DEPASSEMENT_GARDE_M) && r >= -ECART_ABERRANT_M; });
    if (suivant.length === garde.length && passe > 0) break;
    garde = suivant;
  }
  if (!sol) return null;
  const F = sol[0] ?? 0;
  const e0 = p <= 0 ? F : (sol[1] ?? 0);
  const e1 = p >= W ? F : p <= 0 ? (sol[1] ?? 0) : (sol[2] ?? 0);
  // Un toit, pas une coupe : le faitage au-dessus des egouts, des pentes de couverture.
  if (F < Math.max(e0, e1) - 0.1 || Math.min(e0, e1) < 1.5) return null;
  if (p > 0 && (F - e0) / p > TAN_MAX) return null;
  if (p < W && (F - e1) / (W - p) > TAN_MAX) return null;
  const c = { posFaitage: p, faitage: F, egouts: [e0, e1] as [number, number] };
  // L'ecart se compare d'une position a l'autre sur toutes les mesures, chacune bornee : ce qui depasse
  // le pan (pignon, arbre) compte peu, ce qui passe sous lui compte pleinement — un pan trop haut se paie.
  const ecart = Math.sqrt(ms.reduce((a, m) => { const r = m.z - hauteurCorps(c, W, m.t); return a + (r > 0 ? Math.min(DEPASSEMENT_GARDE_M, r) : Math.min(ECART_ABERRANT_M, -r)) ** 2; }, 0) / ms.length);
  return { p, F, e0, e1, ecart };
}

/** Un profil plat : son faitage a moins de HAUTEUR_PLAT_M au-dessus des egouts, ou chaque pan sous PENTE_PLAT_DEG. */
function profilPlat(pr: Profil, W: number): boolean {
  if (pr.F - Math.min(pr.e0, pr.e1) < HAUTEUR_PLAT_M) return true;
  const tan = Math.tan((PENTE_PLAT_DEG * Math.PI) / 180);
  const pente0 = pr.p > 0 ? (pr.F - pr.e0) / pr.p : 0, pente1 = pr.p < W ? (pr.F - pr.e1) / (W - pr.p) : 0;
  return Math.max(pente0, pente1) < tan;
}

/** Le meilleur toit d'un rectangle dont le faitage suit `pts[0] -> pts[1]`. */
function meilleurProfil(ms: readonly Mesure[], W: number): Profil | null {
  let best: Profil | null = null;
  const n = Math.max(1, Math.round(W / PAS_FAITAGE_M));
  for (let k = 0; k <= n; k++) {
    const pr = profilEn(ms, W, (k * W) / n);
    if (pr && (!best || pr.ecart < best.ecart - 1e-6)) best = pr;
  }
  return best;
}

/** Le rectangle repris depuis son deuxieme sommet : le faitage suit alors l'autre sens. */
const tourne = (rect: readonly PtBrut[]): PtBrut[] => [au(rect, 1), au(rect, 2), au(rect, 3), au(rect, 0)];

/** L'empreinte d'un pignon dans le plan : de son mur jusqu'a sa profondeur, entre ses bords. */
export function empreintePignon(c: Pick<CorpsToit, 'pts'>, pg: PignonToit): PtBrut[] {
  const r = repere(c.pts);
  const t0 = pg.pan === 0 ? 0 : r.W, t1 = pg.pan === 0 ? pg.profondeur : r.W - pg.profondeur;
  return [point(r, pg.debut, t0), point(r, pg.fin, t0), point(r, pg.fin, t1), point(r, pg.debut, t1)];
}

/**
 * Le toit d'un corps sur la mesure, dans le sens de faitage qui l'explique le mieux : le rectangle
 * est rendu dans ce sens (`pts[0] -> pts[1]` le long du faitage). `exclure` : des empreintes dont les
 * mesures ne comptent pas (les pignons). Null sans assez de mesures ou sans toit plausible.
 */
export function ajusterCorps(m: ToitMesure, rect: readonly PtBrut[], contour: readonly PtBrut[], exclure: readonly PtBrut[][] = []): CorpsToit | null {
  let best: { c: CorpsToit; ecart: number } | null = null;
  for (const pts of [[...rect], tourne(rect)]) {
    const r = repere(pts);
    const ms = mesuresDans(m, r, pts, contour, exclure);
    let pr = meilleurProfil(ms, r.W);
    // Un faitage a moins d'un metre d'un mur laisse un pan qui n'en est pas un : sur le mur, un appentis.
    if (pr && ((pr.p > 0 && pr.p < PAN_MIN_M) || (pr.p < r.W && r.W - pr.p < PAN_MIN_M))) {
      const appentis = profilEn(ms, r.W, pr.p < r.W / 2 ? 0 : r.W);
      if (appentis && appentis.ecart <= TOLERANCE_APPENTIS * pr.ecart + TOLERANCE_APPENTIS_M) pr = appentis;
    }
    if (!pr || (best && pr.ecart >= best.ecart)) continue;
    // Plat quand aucun pan ne monte : un appentis a un egout au faitage, c'est l'autre qui compte.
    const plat = profilPlat(pr, r.W);
    const median = plat ? [...ms.map((x) => x.z)].sort((a, b) => a - b)[Math.floor(ms.length / 2)] ?? pr.F : 0;
    best = {
      ecart: pr.ecart,
      c: plat
        ? { pts, posFaitage: cm(r.W / 2), faitage: dixieme(median), egouts: [dixieme(median), dixieme(median)], pignons: [], ecart: cm(pr.ecart) }
        : { pts, posFaitage: cm(pr.p), faitage: dixieme(pr.F), egouts: [dixieme(pr.e0), dixieme(pr.e1)], pignons: [], ecart: cm(pr.ecart) },
    };
  }
  return best?.c ?? null;
}

/** Le 80e centile. */
const haut = (v: readonly number[]): number => { const t = [...v].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(0.8 * t.length))] ?? 0; };

/**
 * Les pignons d'un corps : sur le mur de chaque pan, les tronçons ou la mesure depasse le pan de
 * SURPLUS_PIGNON_M et plus, larges de 1,5 a 6 m ; chacun est retenu si, vers l'interieur, la mesure
 * reste a sa hauteur (un faitage horizontal) sur PROFONDEUR_PIGNON_MIN_M au moins, et si son mur
 * est une facade (dehors juste devant).
 */
export function detecterPignons(m: ToitMesure, c: CorpsToit, contour: readonly PtBrut[]): PignonToit[] {
  const r = repere(c.pts);
  const plat = c.faitage - Math.min(...c.egouts) < HAUTEUR_PLAT_M;
  if (plat) return [];
  const out: PignonToit[] = [];
  for (const pan of [0, 1] as const) {
    const largeurPan = pan === 0 ? c.posFaitage : r.W - c.posFaitage;
    if (largeurPan < PROFONDEUR_PIGNON_MIN_M) continue;
    const e = c.egouts[pan];
    const tDe = (d: number) => (pan === 0 ? d : r.W - d); // d : distance au mur du pan
    const mesure = (s: number, d: number) => hauteurToitMesure(m, point(r, s, tDe(d)).x, point(r, s, tDe(d)).y);
    // Le long du mur, a 50 cm en retrait : ce qui depasse le pan.
    const pas = 0.5;
    const ss: number[] = [];
    for (let s = pas / 2; s < r.L; s += pas) ss.push(s);
    const surplus = ss.map((s) => { const z = mesure(s, 0.5); return z === null ? -Infinity : z - hauteurCorps(c, r.W, tDe(0.5)); });
    // Les troncons, une cellule manquante toleree au milieu.
    const troncons: [number, number][] = [];
    let debut = -1, trou = 0;
    surplus.forEach((v, k) => {
      if (v >= SURPLUS_PIGNON_M) { if (debut < 0) debut = k; trou = 0; return; }
      if (debut >= 0 && trou === 0 && k + 1 < surplus.length && (surplus[k + 1] ?? -Infinity) >= SURPLUS_PIGNON_M) { trou = 1; return; }
      if (debut >= 0) troncons.push([debut, k - 1 - trou]);
      debut = -1; trou = 0;
    });
    if (debut >= 0) troncons.push([debut, surplus.length - 1]);
    for (const [a, b] of troncons) {
      // La largeur est celle ou le pignon depasse franchement le pan : un peu en deca de son pied sur
      // un pignon net, juste sur un pignon que le pas de 50 cm a aplati (le cas du LiDAR).
      const s0 = Math.max(0, (ss[a] ?? 0) - pas / 2), s1 = Math.min(r.L, (ss[b] ?? 0) + pas / 2);
      const w = s1 - s0;
      if (w < LARGEUR_PIGNON_MIN_M || w > Math.min(LARGEUR_PIGNON_MAX_M, 0.75 * r.L)) continue;
      const sc = (s0 + s1) / 2;
      // Un pignon dresse son triangle sur une facade : juste devant le mur, on est dehors. Le long
      // d'un mur interieur (un corps contre un autre), ce qui depasse est le toit du voisin.
      const devant = point(r, sc, tDe(-0.4));
      if (pointInPolygon(devant, contour)) continue;
      const hauteurs = ss.slice(a, b + 1).map((s) => mesure(s, 0.5)).filter((z): z is number => z !== null);
      const P = Math.min(c.faitage, haut(hauteurs));
      if (P - e < SURPLUS_PIGNON_M) continue;
      // Vers l'interieur : le faitage du pignon reste a sa hauteur, jusqu'a rejoindre le pan du corps.
      const rejoint = c.faitage > e ? (largeurPan * (P - e)) / (c.faitage - e) : largeurPan;
      let profondeur = 0;
      for (let d = 0.5; d <= rejoint + 0.01; d += 0.5) {
        const z = mesure(sc, d);
        if (z === null || z < P - TOLERANCE_FAITAGE_M) break;
        // Et au-dessus du pan, nettement, tant que le pan ne l'a pas rattrape : sinon c'est le pan lui-meme qui monte.
        if (d < rejoint - 0.75 && z - hauteurCorps(c, r.W, tDe(d)) < SURPLUS_PIGNON_M / 2) break;
        profondeur = d;
      }
      if (profondeur < PROFONDEUR_PIGNON_MIN_M) continue;
      // Il part du faitage quand il le rejoint (a un demi-metre pres) : sa profondeur est celle ou il rencontre le pan.
      out.push({ pan, debut: cm(s0), fin: cm(s1), faitage: dixieme(P), profondeur: cm(profondeur >= rejoint - 0.75 ? rejoint : profondeur) });
    }
  }
  return out;
}

/** Le corps et ses pignons : ajuste, pignons detectes, reajuste sans leurs mesures, pignons relus sur le toit reajuste. */
export function corpsAvecPignons(m: ToitMesure, rect: readonly PtBrut[], contour: readonly PtBrut[]): CorpsToit | null {
  const premier = ajusterCorps(m, rect, contour);
  if (!premier) return null;
  const pignons = detecterPignons(m, premier, contour);
  if (!pignons.length) return premier;
  const reajuste = ajusterCorps(m, premier.pts, contour, pignons.map((p) => empreintePignon(premier, p)));
  // Le sens peut changer au reajustement : les pignons se relisent alors dans le nouveau repere.
  const c = reajuste ?? premier;
  const relus = detecterPignons(m, c, contour);
  return { ...c, pignons: relus.length ? relus : c === premier ? pignons : [] };
}

/** Les deux moities d'un rectangle coupe a `s` le long de sa longueur ou de sa largeur. */
function moities(rect: readonly PtBrut[], axe: 'u' | 'v', s: number): [PtBrut[], PtBrut[]] {
  const r = repere(rect);
  const P = (a: number, b: number) => { const q = point(r, a, b); return { x: cm(q.x), y: cm(q.y) }; };
  return axe === 'u'
    ? [[P(0, 0), P(s, 0), P(s, r.W), P(0, r.W)], [P(s, 0), P(r.L, 0), P(r.L, r.W), P(s, r.W)]]
    : [[P(0, 0), P(r.L, 0), P(r.L, s), P(0, s)], [P(0, s), P(r.L, s), P(r.L, r.W), P(0, r.W)]];
}

/**
 * La coupe d'un rectangle en deux corps quand deux toits simples expliquent la mesure nettement
 * mieux qu'un seul : l'ecart tombe aux deux tiers, il valait au moins ECART_COUPE_MIN_M, et les deux
 * toits different (faitage ou egout) de DIFFERENCE_COUPE_M. Les mesures des pignons du corps entier
 * ne comptent pas : un pignon n'est pas un corps.
 */
export function meilleureCoupe(m: ToitMesure, rect: readonly PtBrut[], contour: readonly PtBrut[]): [PtBrut[], PtBrut[]] | null {
  const seul = corpsAvecPignons(m, rect, contour);
  if (!seul || seul.ecart < ECART_COUPE_MIN_M) return null;
  const exclure = seul.pignons.map((p) => empreintePignon(seul, p));
  const ref = ajusterCorps(m, rect, contour, exclure);
  if (!ref || ref.ecart < ECART_COUPE_MIN_M) return null;
  const r = repere(rect);
  let best: { parts: [PtBrut[], PtBrut[]]; ecart: number } | null = null;
  for (const axe of ['u', 'v'] as const) {
    const longueur = axe === 'u' ? r.L : r.W;
    for (let s = LARGEUR_CORPS_MIN_M; s <= longueur - LARGEUR_CORPS_MIN_M + 1e-6; s += 0.5) {
      const parts = moities(rect, axe, s);
      const [a, b] = parts.map((q) => ajusterCorps(m, q, contour, exclure));
      if (!a || !b) continue;
      const differents = Math.abs(a.faitage - b.faitage) >= DIFFERENCE_COUPE_M || Math.abs(Math.min(...a.egouts) - Math.min(...b.egouts)) >= DIFFERENCE_COUPE_M;
      if (!differents) continue;
      const aire = (q: readonly PtBrut[]) => { const rr = repere(q); return rr.L * rr.W; };
      const ecart = Math.sqrt((a.ecart ** 2 * aire(parts[0]) + b.ecart ** 2 * aire(parts[1])) / (aire(parts[0]) + aire(parts[1])));
      if (!best || ecart < best.ecart) best = { parts, ecart };
    }
  }
  return best && best.ecart <= GAIN_COUPE * ref.ecart ? best.parts : null;
}

/** Une cellule est batie quand la mesure y depasse cela : un rez-de-chaussee, pas une haie. */
export const HAUTEUR_BATIE_M = 2.5;

/**
 * L'axe d'un contour, en degres : celui (a l'equerre pres) qui aligne la plus grande longueur de
 * cotes, a la tolerance des rectangles. Le plus long cote ne suffit pas : ce peut etre le biais.
 */
function axeDesCotes(contour: readonly PtBrut[]): number {
  const cotes = contour.map((q, i) => { const r = au(contour, (i + 1) % contour.length); return { angle: (Math.atan2(r.y - q.y, r.x - q.x) * 180) / Math.PI, l: Math.hypot(r.x - q.x, r.y - q.y) }; });
  const ecart = (a: number, b: number) => { const d = (((a - b) % 90) + 90) % 90; return Math.min(d, 90 - d); };
  let best = { angle: angleDuPlusLongCote(contour), l: -1 };
  for (const c of cotes) {
    const l = cotes.reduce((s, o) => s + (ecart(o.angle, c.angle) <= TOLERANCE_DEG ? o.l : 0), 0);
    if (l > best.l + 1e-6) best = { angle: c.angle, l };
  }
  return best.angle;
}

/**
 * Le contour mis a l'equerre : chaque cote de biais (au-dela de la tolerance des rectangles) devient
 * une marche - un cote, un ressaut, un cote - dont le ressaut tombe au droit d'un autre sommet du
 * contour (celui qui est le plus pres du milieu du biais, a une largeur de volume au moins de ses
 * bouts), a defaut au milieu. La marche rend au contour, d'un cote du biais, ce qu'elle lui prend de
 * l'autre ; posee au droit d'un sommet, elle prolonge une facade, et les tranches suivent le batiment
 * (une aile, une partie basse) plutot que le biais. Null quand le contour n'a pas de cote de biais.
 */
export function contourEquerre(contour: readonly PtBrut[]): PtBrut[] | null {
  const a = (axeDesCotes(contour) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const local = (p: PtBrut): PtBrut => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const plan = (p: PtBrut): PtBrut => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const L = contour.map(local);
  const out: PtBrut[] = [];
  let biais = false;
  L.forEach((p, i) => {
    out.push(p);
    const q = au(L, (i + 1) % L.length);
    const angle = Math.abs((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI) % 180;
    if (Math.min(angle, 180 - angle) <= TOLERANCE_DEG || Math.abs(angle - 90) <= TOLERANCE_DEG) return;
    biais = true;
    // Le ressaut est vertical sur un biais plutot couche, horizontal sur un biais plutot dresse.
    const couche = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
    const [u0, u1] = couche ? [p.x, q.x] : [p.y, q.y];
    const lo = Math.min(u0, u1) + LARGEUR_CORPS_MIN_M, hi = Math.max(u0, u1) - LARGEUR_CORPS_MIN_M, milieu = (u0 + u1) / 2;
    const appuis = L.filter((_, k) => k !== i && k !== (i + 1) % L.length).map((v) => (couche ? v.x : v.y)).filter((u) => u >= lo && u <= hi);
    const u = appuis.reduce((m, v) => (Math.abs(v - milieu) < Math.abs(m - milieu) ? v : m), appuis[0] ?? milieu);
    out.push(...(couche ? [{ x: u, y: p.y }, { x: u, y: q.y }] : [{ x: p.x, y: u }, { x: q.x, y: u }]));
  });
  return biais ? out.map(plan).map((p) => ({ x: cm(p.x), y: cm(p.y) })) : null;
}

/** Au-dela de cette part de cellules non baties sous son contour, un batiment est recale sur la mesure. */
export const PART_VIDE_RECALAGE = 0.12;
/** Le plus grand decalage essaye, dans chaque sens, et son pas. */
export const DECALAGE_MAX_M = 3;
const PAS_DECALAGE_M = 0.25;

/** La bande autour du contour ou le LiDAR ne devrait plus rien voir de bati, au-dela du debord. */
const BANDE_DEHORS_M: [number, number] = [0.5, 1.5];

/**
 * Les cellules de la grille sous le contour decale de (dx, dy) : baties et non baties (sans mesure
 * comprise) ; et, dans la bande juste dehors, baties et non baties.
 */
function sousLeContour(g: Grille, contour: readonly PtBrut[], dx: number, dy: number): { bati: number; vide: number; batiDehors: number; videDehors: number } {
  const P = contour.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const m = BANDE_DEHORS_M[1];
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - m - g.x0) / g.pas)), i1 = Math.min(g.nx - 1, Math.ceil((Math.max(...xs) + m - g.x0) / g.pas));
  const j0 = Math.max(0, Math.floor((g.y0 - Math.max(...ys) - m) / g.pas)), j1 = Math.min(g.ny - 1, Math.ceil((g.y0 - Math.min(...ys) + m) / g.pas));
  const c = { bati: 0, vide: 0, batiDehors: 0, videDehors: 0 };
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const p = { x: g.x0 + i * g.pas, y: g.y0 - j * g.pas };
    const bati = (g.z[j * g.nx + i] ?? 0) >= HAUTEUR_BATIE_M;
    if (pointInPolygon(p, P)) { if (bati) c.bati++; else c.vide++; continue; }
    const d = distancePointContour(p, P);
    if (d <= BANDE_DEHORS_M[0] || d > m) continue;
    if (bati) c.batiDehors++; else c.videDehors++;
  }
  return c;
}

/** La part des cellules non baties sous le contour, tel qu'il est trace. */
export function partVideSous(g: Grille, contour: readonly PtBrut[]): number {
  const { bati, vide } = sousLeContour(g, contour, 0, 0);
  return bati + vide ? vide / (bati + vide) : 0;
}

/**
 * Le decalage qui pose le contour sur ce que le LiDAR montre bati, quand il est trace a cote : la BD
 * TOPO decale parfois une maison de deux metres, et ses corps se lisaient alors sur un quart de toit
 * et un bout de jardin. Seulement si plus de PART_VIDE_RECALAGE du contour tombe sur du non bati, et
 * si le meilleur decalage (bati sous le contour et rien dans une bande juste dehors, au pas de
 * 25 cm, a 3 m au plus) divise ce non bati par deux au moins. Null sinon : le contour tel qu'il est trace.
 */
export function decalageSurMesure(g: Grille, contour: readonly PtBrut[]): PtBrut | null {
  const zero = sousLeContour(g, contour, 0, 0);
  if (!(zero.bati + zero.vide) || zero.vide / (zero.bati + zero.vide) < PART_VIDE_RECALAGE) return null;
  // Bati sous le contour, rien juste dehors : le batiment se pose au milieu de ce que le LiDAR voit,
  // au lieu de glisser contre un bord du bati.
  const score = (c: typeof zero) => c.bati - c.vide + c.videDehors - c.batiDehors;
  let best = { dx: 0, dy: 0, ...zero };
  const n = Math.round(DECALAGE_MAX_M / PAS_DECALAGE_M);
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
    const c = sousLeContour(g, contour, a * PAS_DECALAGE_M, b * PAS_DECALAGE_M);
    if (score(c) > score(best)) best = { dx: a * PAS_DECALAGE_M, dy: b * PAS_DECALAGE_M, ...c };
  }
  return best.vide <= zero.vide / 2 && Math.hypot(best.dx, best.dy) >= 2 * PAS_DECALAGE_M ? { x: best.dx, y: best.dy } : null;
}


/**
 * Un pan seul ou un toit plat, a la meme regle que le modele des corps : l'ajustement des formes
 * simples rend plat tout toit sous 10 degres (la regle de la BD TOPO), et un appentis de garage a 6
 * degres devenait une terrasse. Quand il rend plat ou un appentis, le meilleur appentis essaye
 * l'emporte s'il monte d'au moins HAUTEUR_PLAT_M, a PENTE_PLAT_DEG au moins, et si son ecart tombe a
 * GAIN_PAN_SUR_PLAT de celui du plat ; le plat sinon.
 */
function unPanPlutotQuePlat(rect: readonly PtBrut[], ech: readonly EchantillonHauteur[], a: ToitAjuste | null): ToitAjuste | null {
  if (!a || (a.toit.forme !== 'plat' && a.toit.forme !== 'appentis')) return a;
  const essais = diagnostiquerToit(rect, ech);
  const plat = essais.find((x) => x.forme === 'plat');
  const pan = essais.filter((x) => x.forme === 'appentis').sort((x, y) => x.ecart - y.ecart)[0];
  if (!plat || !pan) return a;
  const course = 2 * repereFaitage(rect, pan.angleFaitage).hw;
  const pentu = pan.H >= HAUTEUR_PLAT_M && course > 0 && Math.atan(pan.H / course) >= (PENTE_PLAT_DEG * Math.PI) / 180;
  if (pentu && pan.ecart <= GAIN_PAN_SUR_PLAT * plat.ecart) return { ...a, toit: { ...a.toit, forme: 'appentis', hauteur: pan.H, angleFaitage: pan.angleFaitage }, egout: pan.e, ecart: pan.ecart };
  return { ...a, toit: { ...a.toit, forme: 'plat', hauteur: 0 }, egout: plat.e, ecart: plat.ecart };
}

/**
 * Le corps d'une tranche lu par l'ajustement des formes simples (facade/toitLidar.ts) : deux pans,
 * croupes et quatre pans (un faitage dans la longueur, des croupes a la pente des pans), appentis,
 * plat. Null quand aucune forme ne s'ajuste.
 */
export function corpsDepuisFormes(g: Grille, rect: readonly PtBrut[]): CorpsToit | null {
  const ech: EchantillonHauteur[] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const z = g.z[j * g.nx + i];
    const p = { x: g.x0 + i * g.pas, y: g.y0 - j * g.pas };
    if (z !== null && z !== undefined && z >= SOL_M && pointInPolygon(p, rect)) ech.push({ ...p, z });
  }
  const a = unPanPlutotQuePlat(rect, ech, ajusterToit(rect, ech));
  if (!a) return null;
  const { toit, egout } = a;
  const u = { x: Math.cos((toit.angleFaitage * Math.PI) / 180), y: Math.sin((toit.angleFaitage * Math.PI) / 180) };
  const r0 = repere(rect);
  let pts = Math.abs(u.x * r0.u.x + u.y * r0.u.y) >= Math.abs(u.x * r0.v.x + u.y * r0.v.y) ? [...rect] : tourne(rect);
  const quatre = toit.forme === 'croupes' || toit.forme === 'quatre-pans';
  if (quatre && repere(pts).L < repere(pts).W) pts = tourne(pts);
  const r = repere(pts);
  const H = Math.max(0, toit.hauteur), E = dixieme(egout), F = dixieme(egout + H);
  const base = { pts, pignons: [], ecart: cm(a.ecart) };
  if (toit.forme === 'plat' || H < HAUTEUR_PLAT_M) {
    const z = dixieme(toit.forme === 'appentis' ? egout + H / 2 : egout);
    return { ...base, posFaitage: cm(r.W / 2), faitage: z, egouts: [z, z] };
  }
  if (toit.forme === 'appentis') {
    // L'appentis monte vers la normale gauche de son faitage (facade/toit.ts::plansDuToit).
    const haut = -u.y * r.v.x + u.x * r.v.y > 0;
    return haut ? { ...base, posFaitage: cm(r.W), faitage: F, egouts: [E, F] } : { ...base, posFaitage: 0, faitage: F, egouts: [F, E] };
  }
  const c: CorpsToit = { ...base, posFaitage: cm(r.W / 2), faitage: F, egouts: [E, E] };
  return quatre ? { ...c, croupes: [cm(r.W / 2), cm(r.W / 2)] } : c;
}

/**
 * Les corps d'un contour qui ne se decoupe pas tel quel (un cote de biais) : mis a l'equerre sur la
 * mesure, coupe en tranches (model/volumesToit.ts::rectanglesEnTranches), chaque tranche lue par les
 * formes simples, qui savent les croupes, la ou le modele des corps n'a que des pignons de bout ; a
 * defaut, par le modele des corps. Null quand meme les tranches ne se font pas.
 */
function corpsDeReprise(m: ToitMesure, contour: readonly PtBrut[], grille: Grille | null): CorpsToit[] | null {
  const rects = rectanglesEnTranches(contourEquerre(contour) ?? contour);
  if (!rects) return null;
  const corps = rects.map((r) => corpsDepuisFormes(grille ?? m, r) ?? corpsAvecPignons(m, r, contour)).filter((c): c is CorpsToit => c !== null);
  return corps.length ? completerSurContour(corps, contour) : null;
}

/** Le pas dont un corps s'etend pour couvrir le contour, et son plus long trajet. */
const PAS_COMPLETION_M = 0.25, COMPLETION_MAX_M = 8;

/** Un cote d'un rectangle dans son repere : s = 0, s = L, t = 0, t = W. */
type Cote = 's0' | 'sL' | 't0' | 'tW';

/**
 * Les corps etendus jusqu'a couvrir le contour : la marche qui remplace un cote de biais laisse,
 * d'un cote du biais, un triangle du batiment que nul corps ne couvre - un toit qui manquait sur un
 * bout de maison. Chaque corps avance chacun de ses cotes libres (que les autres corps ne bordent pas
 * pour moitie) tant que la bande juste devant contient du contour que nul autre corps ne couvre ; il
 * garde sa forme et ses pentes (`corpsEtendu`). Le dessin decoupe ensuite les toits sur le contour.
 */
export function completerSurContour(corps: readonly CorpsToit[], contour: readonly PtBrut[]): CorpsToit[] {
  // Les plus hauts d'abord, chacun voyant les corps deja etendus : un bout de maison revient au toit
  // qui le domine, pas a la terrasse plate d'a cote.
  const out = [...corps];
  const ordre = out.map((_, k) => k).sort((a, b) => (out[b] as CorpsToit).faitage - (out[a] as CorpsToit).faitage);
  for (const k of ordre) out[k] = etendreSurContour(out[k] as CorpsToit, out.filter((_, j) => j !== k).map((x) => x.pts), contour);
  return out;
}

/** Un corps etendu sur le contour que les `autres` ne couvrent pas (`completerSurContour`). */
function etendreSurContour(c: CorpsToit, autres: readonly PtBrut[][], contour: readonly PtBrut[]): CorpsToit {
  const r = repere(c.pts);
  const b: Record<Cote, number> = { s0: 0, sL: r.L, t0: 0, tW: r.W };
  // Les points d'une bande parallele au cote, a la position `v` de son axe, sur toute la longueur de l'autre.
  const bande = (cote: Cote, v: number): PtBrut[] => {
    const out: PtBrut[] = [];
    if (cote === 's0' || cote === 'sL') for (let t = b.t0 + 0.125; t < b.tW; t += PAS_COMPLETION_M) out.push(point(r, v, t));
    else for (let sv = b.s0 + 0.125; sv < b.sL; sv += PAS_COMPLETION_M) out.push(point(r, sv, v));
    return out;
  };
  const ailleurs = (q: PtBrut) => autres.some((a) => pointInPolygon(q, a));
  for (const cote of ['s0', 'sL', 't0', 'tW'] as const) {
    const signe = cote === 's0' || cote === 't0' ? -1 : 1;
    const devant = bande(cote, b[cote] + signe * 0.3);
    if (devant.filter(ailleurs).length > devant.length / 2) continue;
    for (let d = PAS_COMPLETION_M; d <= COMPLETION_MAX_M + 1e-6; d += PAS_COMPLETION_M) {
      const pts = bande(cote, b[cote] + (signe * PAS_COMPLETION_M) / 2);
      if (!pts.some((q) => pointInPolygon(q, contour) && !ailleurs(q))) break;
      b[cote] += signe * PAS_COMPLETION_M;
    }
  }
  return corpsEtendu(c, b);
}

/**
 * Le corps sur un rectangle agrandi (bornes dans son repere, `s0 <= 0 <= L <= sL`, idem en t), sa
 * forme et ses pentes gardees : etendu le long du faitage, le faitage s'allonge, croupes et hauteurs
 * restent ; en travers, les pans s'elargissent a leur pente et le faitage monte.
 */
export function corpsEtendu(c: CorpsToit, b: Record<Cote, number>): CorpsToit {
  const r = repere(c.pts);
  if (b.s0 === 0 && b.sL === r.L && b.t0 === 0 && b.tW === r.W) return c;
  const pts = [point(r, b.s0, b.t0), point(r, b.sL, b.t0), point(r, b.sL, b.tW), point(r, b.s0, b.tW)].map((q) => ({ x: cm(q.x), y: cm(q.y) }));
  const W2 = b.tW - b.t0;
  if (W2 === r.W) return { ...c, pts };
  const [e0, e1] = c.egouts, p = c.posFaitage;
  const plat = c.faitage - Math.min(e0, e1) < HAUTEUR_PLAT_M;
  if (plat) return { ...c, pts };
  // En travers : le faitage reste au meme endroit du batiment, chaque pan descend a sa pente jusqu'au
  // nouveau mur ; un appentis garde son egout bas et monte d'autant.
  const p2 = p - b.t0;
  if (p <= 0.01 || p >= r.W - 0.01) {
    const k = (c.faitage - Math.min(e0, e1)) / r.W, F = dixieme(Math.min(e0, e1) + k * W2);
    return p <= 0.01 ? { ...c, pts, posFaitage: 0, faitage: F, egouts: [F, Math.min(e0, e1)] } : { ...c, pts, posFaitage: cm(W2), faitage: F, egouts: [Math.min(e0, e1), F] };
  }
  const k0 = (c.faitage - e0) / p, k1 = (c.faitage - e1) / (r.W - p);
  const egouts: [number, number] = [dixieme(c.faitage - k0 * p2), dixieme(c.faitage - k1 * (W2 - p2))];
  const croupes = c.croupes ? { croupes: c.croupes.map((h) => (h > 0 ? cm(W2 / 2) : 0)) as [number, number] } : {};
  return { ...c, pts, posFaitage: cm(p2), egouts, ...croupes };
}

/**
 * Les corps d'un batiment reconstruits sur sa surface mesuree : null quand le contour ne se decoupe
 * pas en rectangles, meme mis a l'equerre sur la mesure (un arrondi), ou que rien ne s'ajuste — la
 * surface mesuree reste alors le toit montre.
 */
export function reconstruireCorps(m: ToitMesure, contour: readonly PtBrut[], options: { coupes?: boolean; grille?: Grille | null } = {}): CorpsToit[] | null {
  const rects = rectanglesDuContour(contour);
  // Un contour qui se decoupe tel quel garde le modele des corps ; la reprise ne sert qu'aux autres,
  // et lit la grille brute quand on la lui donne (la surface mesuree est bouchee hors du contour).
  if (!rects) return corpsDeReprise(m, contour, options.grille ?? null);
  const blocs: PtBrut[][] = [];
  // La coupe par le modele essaie chaque position : de loin la part la plus lourde. Le voisinage
  // (des dizaines de maisons, dans le delai de l'import) s'en passe : ses corps viennent des marches.
  const coupes = options.coupes !== false;
  const couper = (rect: PtBrut[], profondeur: number): void => {
    const deux = coupes && profondeur < 2 ? meilleureCoupe(m, rect, contour) : null;
    if (!deux) { blocs.push(rect); return; }
    deux.forEach((q) => couper(q, profondeur + 1));
  };
  // Les blocs qu'une marche a separes a tort sont refondus quand un seul toit les explique mieux ;
  // ceux-la gardent leur toit lu par les formes, sans coupe par le modele.
  const refondus: CorpsToit[] = [];
  for (const b of refondre(m, rects, contour, options.grille ?? null)) {
    if (b.corps) refondus.push(b.corps);
    else couper(b.rect, 0);
  }
  const corps = [...refondus, ...blocs.map((r) => avecCroupesSiMieux(m, r, contour, options.grille ?? null, corpsAvecPignons(m, r, contour)))].filter((c): c is CorpsToit => c !== null);
  return corps.length ? corps : null;
}

/**
 * Deux blocs se refondent quand un seul toit les explique presque aussi bien que leurs deux corps : son
 * ecart ne depasse pas le leur de plus de cette part. Un toit plutot que deux morceaux qui collent a
 * peine mieux a la mesure, mais avec un egout a 8,4 m et un appentis de 2,3 m a pignon (AE 98).
 */
export const TOLERANCE_REFONTE = 1.15;
/**
 * Et quand la coupe aux marches laisse une bande plus etroite que LARGEUR_BANDE_M : un corps de moins
 * de 3 m n'est pas une maison mais une tranche de pente (un pavillon coupe en trois bandes de 1,5 a
 * 2,6 m, la maison mitoyenne d'AE 98). Le toit unique est alors admis jusqu'a TOLERANCE_BANDE.
 */
export const LARGEUR_BANDE_M = 3;
export const TOLERANCE_BANDE = 1.6;

/** La reunion de deux rectangles qui partagent un cote entier, dans le repere du premier ; null sinon. */
export function reunion(a: readonly PtBrut[], b: readonly PtBrut[]): PtBrut[] | null {
  const r = repere(a);
  const loc = b.map((q) => { const dx = q.x - r.p0.x, dy = q.y - r.p0.y; return { s: dx * r.u.x + dy * r.u.y, t: dx * r.v.x + dy * r.v.y }; });
  const ss = loc.map((q) => q.s), ts = loc.map((q) => q.t), e = 0.05;
  const s0 = Math.min(...ss), s1 = Math.max(...ss), t0 = Math.min(...ts), t1 = Math.max(...ts);
  // Paralleles : chaque sommet de b sur l'une des bornes de sa boite.
  if (!loc.every((q) => (Math.abs(q.s - s0) < e || Math.abs(q.s - s1) < e) && (Math.abs(q.t - t0) < e || Math.abs(q.t - t1) < e))) return null;
  const memeT = Math.abs(t0) < e && Math.abs(t1 - r.W) < e, memeS = Math.abs(s0) < e && Math.abs(s1 - r.L) < e;
  let bornes: [number, number, number, number] | null = null;
  if (memeT && (Math.abs(s0 - r.L) < e || Math.abs(s1) < e)) bornes = [Math.min(0, s0), Math.max(r.L, s1), 0, r.W];
  else if (memeS && (Math.abs(t0 - r.W) < e || Math.abs(t1) < e)) bornes = [0, r.L, Math.min(0, t0), Math.max(r.W, t1)];
  if (!bornes) return null;
  const [a0, a1, b0, b1] = bornes;
  return [point(r, a0, b0), point(r, a1, b0), point(r, a1, b1), point(r, a0, b1)].map((q) => ({ x: cm(q.x), y: cm(q.y) }));
}

/**
 * Les blocs coupes aux marches, refondus deux a deux quand un seul toit lu par les formes simples
 * (`corpsDepuisFormes`) explique leur reunion presque aussi bien que leurs deux corps
 * (`TOLERANCE_REFONTE`) : la pente forte d'un pan passait pour une marche, et coupait un toit en deux
 * morceaux absurdes (AE 98). Ecart symetrique (`ecartAuCorps`), pondere par l'aire. Deux niveaux
 * vraiment differents ne se refondent pas : les formes n'y lisent qu'un toit de compromis, loin des deux.
 */
function refondre(m: ToitMesure, rects: readonly PtBrut[][], contour: readonly PtBrut[], grille: Grille | null): { rect: PtBrut[]; corps?: CorpsToit }[] {
  const aire = (q: readonly PtBrut[]) => { const r = repere(q); return r.L * r.W; };
  const ecartSeul = (x: { rect: PtBrut[]; corps?: CorpsToit }) => { const c = x.corps ?? corpsAvecPignons(m, x.rect, contour); return c ? ecartAuCorps(m, c, contour) : Infinity; };
  const ecartDe = (parts: readonly { rect: PtBrut[]; corps?: CorpsToit }[]) => Math.sqrt(parts.reduce((a, x) => a + ecartSeul(x) ** 2 * aire(x.rect), 0) / parts.reduce((a, x) => a + aire(x.rect), 0));
  // D'abord chaque rectangle entier : les pentes d'un pavillon le coupaient en trois bandes, dont aucune
  // paire ne fait un toit.
  const liste: { rect: PtBrut[]; corps?: CorpsToit }[] = [];
  for (const r of rects) {
    const parts = decouperParHauteurs(m, [r]).map((rect) => ({ rect }));
    const f = parts.length > 1 ? corpsDepuisFormes(grille ?? m, r) : null;
    const un = f ? ecartAuCorps(m, f, contour) : Infinity;
    // Une bande de moins de 3 m est une tranche coupee dans une pente, pas un corps : plus de tolerance.
    const bande = parts.some((x) => { const q = repere(x.rect); return Math.min(q.L, q.W) < LARGEUR_BANDE_M; });
    if (f && un <= (bande ? TOLERANCE_BANDE : TOLERANCE_REFONTE) * ecartDe(parts)) liste.push({ rect: [...r], corps: { ...f, ecart: cm(un) } });
    else liste.push(...parts);
  }
  if (liste.length < 2) return liste;
  for (let garde = 0; garde < 8; garde++) {
    let fait = false;
    for (let i = 0; i < liste.length && !fait; i++) for (let j = i + 1; j < liste.length && !fait; j++) {
      const a = liste[i] as { rect: PtBrut[]; corps?: CorpsToit }, b = liste[j] as { rect: PtBrut[]; corps?: CorpsToit };
      const u = reunion(a.rect, b.rect);
      const f = u ? corpsDepuisFormes(grille ?? m, u) : null;
      if (!u || !f) continue;
      const deux = ecartDe([a, b]);
      const un = ecartAuCorps(m, f, contour);
      if (un > TOLERANCE_REFONTE * deux) continue;
      liste.splice(j, 1);
      liste[i] = { rect: u, corps: { ...f, ecart: cm(un) } };
      fait = true;
    }
    if (!fait) break;
  }
  return liste;
}

/** Des croupes plutot que des pignons de bout : seulement si l'ecart a la mesure tombe a cette part. */
export const GAIN_CROUPES = 0.8;

/**
 * L'ecart d'un corps a la mesure sous lui, chaque mesure bornee a ECART_ABERRANT_M dans les deux sens.
 * Symetrique, a la difference de `profilEn` : celui-la compte peu ce qui depasse le pan (il cherche
 * les pignons), et preferait donc un toit ecrase a un quatre-pans.
 */
function ecartAuCorps(m: ToitMesure, c: CorpsToit, contour: readonly PtBrut[]): number {
  const r = repere(c.pts);
  const ms = mesuresDans(m, r, c.pts, contour);
  if (!ms.length) return Infinity;
  return Math.sqrt(ms.reduce((a, q) => a + Math.min(ECART_ABERRANT_M, Math.abs(q.z - hauteurCorpsEn(c, r.L, r.W, q.s, q.t))) ** 2, 0) / ms.length);
}

/**
 * Le corps a croupes que lisent les formes simples (`corpsDepuisFormes`), quand il explique la mesure
 * nettement mieux que le modele des corps, qui n'a que des pignons de bout : un toit a quatre pans
 * s'y lisait en appentis presque plat (AE 100). Un corps qui a des pignons garde le modele des corps.
 */
function avecCroupesSiMieux(m: ToitMesure, rect: readonly PtBrut[], contour: readonly PtBrut[], grille: Grille | null, c: CorpsToit | null): CorpsToit | null {
  if (c?.pignons.length) return c;
  const f = corpsDepuisFormes(grille ?? m, rect);
  // Sans corps du modele, la lecture des formes, quelle qu'elle soit (un pan, deux, quatre, plat).
  if (!c) return f;
  if (!f?.croupes) return c;
  const ef = ecartAuCorps(m, f, contour);
  return ef < GAIN_CROUPES * ecartAuCorps(m, c, contour) ? { ...f, ecart: cm(ef) } : c;
}

/** La hauteur du mur `i` d'un corps (de `pts[i]` a `pts[i + 1]`) : l'egout de son pan, ou le plus bas des egouts sous un pignon de bout. */
export function hauteursMursCorps(c: CorpsToit): number[] {
  const bas = Math.min(...c.egouts);
  return [c.egouts[0], bas, c.egouts[1], bas];
}
