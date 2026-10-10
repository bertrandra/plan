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
import { hauteurToitMesure, decouperParHauteurs, SOL_M } from '../model/toitMesure.js';
import { rectanglesDuContour } from '../model/volumesToit.js';
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
    const pr = meilleurProfil(ms, r.W);
    if (!pr || (best && pr.ecart >= best.ecart)) continue;
    // Plat quand aucun pan ne monte : un appentis a un egout au faitage, c'est l'autre qui compte.
    const plat = pr.F - Math.min(pr.e0, pr.e1) < HAUTEUR_PLAT_M;
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

/**
 * Les corps d'un batiment reconstruits sur sa surface mesuree : null quand le contour ne se decoupe
 * pas en rectangles (un contour de biais, un arrondi) ou que rien ne s'ajuste — la surface mesuree
 * reste alors le toit montre.
 */
export function reconstruireCorps(m: ToitMesure, contour: readonly PtBrut[], options: { coupes?: boolean } = {}): CorpsToit[] | null {
  const rects = rectanglesDuContour(contour);
  if (!rects) return null;
  const blocs: PtBrut[][] = [];
  // La coupe par le modele essaie chaque position : de loin la part la plus lourde. Le voisinage
  // (des dizaines de maisons, dans le delai de l'import) s'en passe : ses corps viennent des marches.
  const coupes = options.coupes !== false;
  const couper = (rect: PtBrut[], profondeur: number): void => {
    const deux = coupes && profondeur < 2 ? meilleureCoupe(m, rect, contour) : null;
    if (!deux) { blocs.push(rect); return; }
    deux.forEach((q) => couper(q, profondeur + 1));
  };
  decouperParHauteurs(m, rects).forEach((r) => couper(r, 0));
  const corps = blocs.map((r) => corpsAvecPignons(m, r, contour)).filter((c): c is CorpsToit => c !== null);
  return corps.length ? corps : null;
}

/** La hauteur du mur `i` d'un corps (de `pts[i]` a `pts[i + 1]`) : l'egout de son pan, ou le plus bas des egouts sous un pignon de bout. */
export function hauteursMursCorps(c: CorpsToit): number[] {
  const bas = Math.min(...c.egouts);
  return [c.egouts[0], bas, c.egouts[1], bas];
}
