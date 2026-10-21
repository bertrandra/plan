// Le gabarit du mur : la silhouette de toute la facade que donnent le plan et le LiDAR (la largeur du cadastre, les murs et les pignons de
// tous les corps du toit), une forme fixe. Il ne se lit pas sur la photo et ne s'y deforme jamais : il se pose sur l'image redressee, et seuls ses bouts,
// son egout et son sol s'y calent (facade/mosaiqueFuites.ts::affinerEgoutEtSol, zones/releve/AjusterMur.tsx). Les reperes ne disent
// que les directions ; la dimension vient de ce calage (decision de l'utilisateur, 21 octobre 2026). Sans corps, un rectangle.

import { homographie, appliquer, type P2 } from './homographie.js';
import { hauteurDuToitEn } from './toitCorps.js';
import type { Facade } from './geometrie.js';
import type { CorpsToit } from '../model/types.js';

/**
 * Le haut de la facade, de l'angle gauche a l'angle droit (vu de dehors) : `u` de 0 a 1 le long du mur, `v` la hauteur en part de
 * celle du mur (1 a l'egout que pose la chaine, 0 au sol). Un corps plus bas descend sous 1, un pignon monte au-dessus.
 */
export type GabaritMur = readonly { u: number; v: number }[];

/** Le gabarit d'un mur sans corps lu : un rectangle, le haut a l'egout. */
export const GABARIT_RECTANGLE: GabaritMur = Object.freeze([{ u: 0, v: 1 }, { u: 1, v: 1 }]);

/** Un haut qui ne s'ecarte pas de l'egout de plus que cette part de la hauteur du mur est un rectangle. */
const RELIEF_GABARIT = 0.03;

/** Le pas le long du mur, et en profondeur derriere sa face ; la profondeur lue, depuis un peu devant la face (une avancee). */
const PAS_LONG_M = 0.1, PAS_PROFONDEUR_M = 0.05, DEVANT_FACE_M = 1, PROFONDEUR_MAX_M = 30;
/** La ligne du haut garde ses sommets a 2 cm pres (Douglas-Peucker, en metres). */
const TOLERANCE_M = 0.02;

/** Douglas-Peucker : les sommets d'une ligne brisee qui s'ecartent de plus de `tol` de la corde. */
function simplifier(pts: readonly P2[], tol: number): P2[] {
  if (pts.length <= 2) return [...pts];
  const a = pts[0] as P2, b = pts[pts.length - 1] as P2, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let k = -1, dMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as P2, d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > dMax) { dMax = d; k = i; }
  }
  return dMax <= tol ? [a, b] : [...simplifier(pts.slice(0, k + 1), tol).slice(0, -1), ...simplifier(pts.slice(k), tol)];
}

/** Le haut d'un mur se lit a 2 cm en dedans du corps : sur son mur (plus loin, un long pan lirait deja la pente). */
const DANS_LE_CORPS_M = 0.02;

/**
 * Le haut de toute la facade vue de dehors, en `x` metres depuis la gauche : pour chaque corps, le haut de son mur la ou la vue entre
 * dans le corps (en avancee, au nu, ou en retrait), et le plus haut des corps. Un corps en retrait plus haut se voit au-dessus d'un
 * plus bas devant ; un appentis devant le mur, plus bas, n'en cache pas le haut. Null la ou aucun corps n'est derriere la facade.
 */
export function hautDeLaFacade(f: Facade, corps: readonly CorpsToit[]): ({ x: number; y: number | null })[] {
  const L = f.largeur, n = Math.max(1, Math.ceil(L / PAS_LONG_M));
  const out: { x: number; y: number | null }[] = [];
  for (let k = 0; k <= n; k++) {
    const x = (L * k) / n;
    const base = { x: f.gauche.x + ((f.droite.x - f.gauche.x) * x) / L, y: f.gauche.y + ((f.droite.y - f.gauche.y) * x) / L };
    const en = (t: number) => ({ x: base.x - f.normale.x * t, y: base.y - f.normale.y * t });
    let haut: number | null = null;
    for (const c of corps) {
      for (let t = -DEVANT_FACE_M; t <= PROFONDEUR_MAX_M; t += PAS_PROFONDEUR_M) {
        if (hauteurDuToitEn([c], en(t), 0) === null) continue;
        const h = hauteurDuToitEn([c], en(t + DANS_LE_CORPS_M), 0) ?? hauteurDuToitEn([c], en(t), 0);
        if (h !== null && (haut === null || h > haut)) haut = h;
        break;
      }
    }
    out.push({ x, y: haut });
  }
  return out;
}

/**
 * Le gabarit d'un mur sous les corps du toit (le LiDAR) : le haut de toute la facade, tous corps compris (hautDeLaFacade), en part de
 * `hauteurMur`, la hauteur du mur que pose la chaine (le rectangle egout -> sol). La ou aucun corps n'est derriere, l'egout. Un
 * rectangle sans corps, ou quand le haut ne s'ecarte pas de l'egout.
 */
export function gabaritDesCorps(f: Facade, corps: readonly CorpsToit[] | null | undefined, hauteurMur: number): GabaritMur {
  if (!corps?.length || !(f.largeur > 0) || !(hauteurMur > 0)) return GABARIT_RECTANGLE;
  const haut = simplifier(hautDeLaFacade(f, corps).map((p) => ({ x: p.x, y: p.y ?? hauteurMur })), TOLERANCE_M);
  return gabaritDuHaut(haut.map((p) => ({ x: p.x / f.largeur, y: p.y })), hauteurMur);
}

/**
 * Le gabarit d'un haut de mur donne en parts de la largeur (`x`) et en metres (`y`, au-dessus du sol), ramene a `reference` (la hauteur
 * du mur ; par defaut l'egout, le plus bas des deux angles). Trois points alignes n'en font qu'un.
 */
export function gabaritDuHaut(haut: readonly P2[], reference: number | null = null): GabaritMur {
  const pts = [...haut].sort((a, b) => a.x - b.x);
  const a = pts[0], b = pts[pts.length - 1];
  if (!a || !b || pts.length < 2) return GABARIT_RECTANGLE;
  const ref = reference ?? Math.min(a.y, b.y);
  if (!(ref > 0)) return GABARIT_RECTANGLE;
  const g: { u: number; v: number }[] = [];
  for (const p of pts) {
    const q = { u: Math.min(1, Math.max(0, p.x)), v: p.y / ref };
    const m = g[g.length - 2], l = g[g.length - 1];
    if (m && l && Math.abs((l.u - m.u) * (q.v - m.v) - (l.v - m.v) * (q.u - m.u)) < 1e-6) g[g.length - 1] = q;
    else g.push(q);
  }
  return g.every((p) => Math.abs(p.v - 1) < RELIEF_GABARIT) ? GABARIT_RECTANGLE : g;
}

/** La montee du gabarit au-dessus de l'egout, en part de sa hauteur. */
export function relief(g: GabaritMur): number {
  return Math.max(0, ...g.map((p) => p.v - 1));
}

/** La hauteur du gabarit en `u`, en part de celle de l'egout (interpolee entre ses sommets). */
export function hauteurEn(g: GabaritMur, u: number): number {
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i] as { u: number; v: number }, b = g[i + 1] as { u: number; v: number };
    if (u >= a.u && u <= b.u) return b.u > a.u ? a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u) : Math.max(a.v, b.v);
  }
  return u < (g[0]?.u ?? 0) ? (g[0]?.v ?? 1) : (g[g.length - 1]?.v ?? 1);
}

/** Le gabarit pose sur une vue de face entre ses bouts (`x0`, `x1`), son egout (`y0`) et son sol (`y1`), en pixels de la vue. */
export function gabaritSurLaVue(g: GabaritMur, r: { x0: number; x1: number; y0: number; y1: number }): P2[] {
  return g.map((p) => ({ x: r.x0 + p.u * (r.x1 - r.x0), y: r.y1 - p.v * (r.y1 - r.y0) }));
}

/**
 * Le gabarit pose sur une photo par les coins du mur (haut gauche, haut droit, bas droit, bas gauche : l'egout et le sol) : le rectangle
 * du mur ramene sur la photo par leur homographie. Null quand les coins ne forment pas un quadrilatere.
 */
export function gabaritSurLaPhoto(g: GabaritMur, coins: readonly P2[]): P2[] | null {
  if (coins.length !== 4) return null;
  const versPhoto = homographie([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }], coins);
  return versPhoto ? g.map((p) => { const q = appliquer(versPhoto, { x: p.u, y: p.v }); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }; }) : null;
}

/** Relit un gabarit enregistre (un cas de calibration, une correction) ; null s'il n'en est pas un. */
export function lireGabarit(brut: unknown): GabaritMur | null {
  if (!Array.isArray(brut) || brut.length < 2) return null;
  const g = brut.map((p) => (p && typeof p === 'object' ? { u: Number((p as { u?: unknown }).u), v: Number((p as { v?: unknown }).v) } : null));
  return g.every((p) => p && Number.isFinite(p.u) && Number.isFinite(p.v) && p.u >= 0 && p.u <= 1 && p.v > 0) ? (g as { u: number; v: number }[]) : null;
}
