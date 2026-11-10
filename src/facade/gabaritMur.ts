// Le gabarit du mur : la silhouette de toute la facade que donnent le plan et le LiDAR, une forme fixe. C'est la silhouette que trace
// le mode Toit en 3D, corps par corps, projetee sur le plan du mur et vue de face (facade/regles/toits/silhouetteDesCorps.ts::
// silhouetteDeFace ; demande du proprietaire, 28 octobre 2026). Il ne se lit pas sur la photo et ne s'y deforme jamais : il se pose
// sur l'image redressee une fois le mur cale (facade/releve/calageAncres.ts, sans lui : il vient du toit, que la photo met en question).
// Les reperes ne disent que les directions ; la dimension vient de ce calage (decision de l'utilisateur, 21 octobre 2026). Sans
// corps, un rectangle.
//
// La pose (decision du proprietaire, 4 novembre 2026) : son bas sur le sol trouve, ses bouts sur les bouts trouves, a une seule
// echelle tiree de la largeur (la largeur du rectangle trouve pour celle du plan), la meme en hauteur. Son egout tombe ou cette echelle
// le met : il ne pose plus rien, il controle l'egout trouve (`ecartDEgout`). Avant, le gabarit se tendait entre l'egout et le sol
// trouves : la hauteur du mur (2,4 m a AE 101, l'egout de l'appentis) servait de levier a tout le haut (les pignons a 7,5 m, plus de
// trois fois plus haut), et un egout lu 30 cm trop haut, une gouttiere en avant du mur, mettait les pointes un metre trop haut.

import { homographie, appliquer, type P2 } from './vision/homographie.js';
import { silhouetteDeFace } from './regles/toits/silhouetteDesCorps.js';
import type { Facade } from '../geometry/cotesVusDeDehors.js';
import type { CorpsToit } from '../model/types.js';
import { simplifierLigne } from '../geometry/simplifierLigne.js';

/**
 * Le haut de la facade, de gauche a droite (vu de dehors) : `u` le long du mur, 0 et 1 a ses angles (le cote du contour), en deca
 * ou au-dela quand le mur d'un corps continue la facade (le pignon d'une maison en L au-dessus de l'aile) ; `v` la hauteur en part
 * de celle du mur du plan (1 a son egout, 0 au sol) ; pose sur le mur trouve, sa hauteur suit l'echelle de la largeur. Un corps plus bas descend sous 1, un pignon monte au-dessus.
 */
export type GabaritMur = readonly { u: number; v: number }[];

/** Le gabarit d'un mur sans corps lu : un rectangle, le haut a l'egout. */
export const GABARIT_RECTANGLE: GabaritMur = Object.freeze([{ u: 0, v: 1 }, { u: 1, v: 1 }]);

/** Un haut qui ne s'ecarte pas de l'egout de plus que cette part de la hauteur du mur est un rectangle. */
const RELIEF_GABARIT = 0.03;
/** La ligne du haut garde ses sommets a 2 cm pres (Douglas-Peucker, en metres). */
const TOLERANCE_M = 0.02;
/** Un gabarit relu ne s'etend pas au-dela de tant de fois la largeur de son mur, de chaque cote. */
const DEBORD_MAX = 4;

/**
 * Le gabarit d'un mur sous les corps du toit (le LiDAR) : la silhouette de la facade vue de face (silhouetteDeFace, celle du mode
 * Toit), en part de `hauteurMur`, la hauteur du mur que pose la chaine (le rectangle egout -> sol). La ou aucun corps n'est derriere,
 * l'egout. Un rectangle sans corps, ou quand le haut ne s'ecarte pas de l'egout.
 */
export function gabaritDesCorps(f: Facade, corps: readonly CorpsToit[] | null | undefined, hauteurMur: number): GabaritMur {
  if (!corps?.length || !(f.largeur > 0) || !(hauteurMur > 0)) return GABARIT_RECTANGLE;
  const { haut } = silhouetteDeFace(f, corps);
  const ligne = simplifierLigne(haut.map((p) => ({ x: p.x, y: p.y ?? hauteurMur })), TOLERANCE_M);
  const g: { u: number; v: number }[] = [];
  for (const p of ligne) {
    const q = { u: p.x / f.largeur, v: p.y / hauteurMur };
    const m = g[g.length - 2], l = g[g.length - 1];
    if (m && l && Math.abs((l.u - m.u) * (q.v - m.v) - (l.v - m.v) * (q.u - m.u)) < 1e-6) g[g.length - 1] = q;
    else g.push(q);
  }
  return g.length < 2 || g.every((p) => Math.abs(p.v - 1) < RELIEF_GABARIT) ? GABARIT_RECTANGLE : g;
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

/** Les sommets du gabarit au-dessus de l'egout, plus hauts que leurs voisins : les pointes que la photo devrait montrer. */
export function pointesDuGabarit(g: GabaritMur): { u: number; v: number }[] {
  return g.filter((p, i) => p.v > 1 + 1e-6 && p.v >= (g[i - 1]?.v ?? 0) && p.v >= (g[i + 1]?.v ?? 0)).map((p) => ({ u: p.u, v: p.v }));
}

/** L'ecart du gabarit a l'egout, en part de sa hauteur : un pignon qui monte comme un corps plus bas qui descend. */
export function relief(g: GabaritMur): number {
  return Math.max(0, ...g.map((p) => Math.abs(p.v - 1)));
}

/** Le contour ferme du mur sous son gabarit : le pied sous son premier point, le haut, le pied sous son dernier point. */
export function contourDuGabarit(g: GabaritMur): { u: number; v: number }[] {
  const a = g[0], b = g[g.length - 1];
  return a && b ? [{ u: a.u, v: 0 }, ...g, { u: b.u, v: 0 }] : [];
}

/** Le rectangle trouve d'un mur, en pixels d'une vue de face : ses bouts (`x0`, `x1`), son egout (`y0`) et son sol (`y1`). */
export interface RectMur { x0: number; x1: number; y0: number; y1: number }

/** Le rectangle des coins d'un mur sur une vue de face (haut gauche, haut droit, bas droit, bas gauche) : chaque bord a mi-chemin. */
export function rectDesCoins(coins: readonly P2[]): RectMur {
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  return { x0: (hg.x + bg.x) / 2, x1: (hd.x + bd.x) / 2, y0: (hg.y + hd.y) / 2, y1: (bd.y + bg.y) / 2 };
}

/**
 * L'echelle de la pose du gabarit sur le rectangle trouve, en hauteurs de ce rectangle (decision du proprietaire, 4 novembre 2026) :
 * une seule echelle, celle de la largeur (`x1 - x0` pixels pour la largeur du plan), qui donne a la hauteur du plan (`rapport`, hauteur
 * sur largeur) `rapport * (x1 - x0)` pixels. 1 quand le rectangle trouve a les proportions du plan, ou sans rapport ni rectangle : le
 * gabarit se pose alors entre l'egout et le sol, comme avant.
 */
export function echelleDuGabarit(rapport: number | null | undefined, r: RectMur | null | undefined): number {
  const w = r ? r.x1 - r.x0 : 0, h = r ? r.y1 - r.y0 : 0;
  return rapport && rapport > 0 && w > 0 && h > 0 ? (rapport * w) / h : 1;
}

/** Le gabarit a une echelle (`echelleDuGabarit`) : ses hauteurs en hauteurs du rectangle trouve, le sol a 0. */
export function gabaritALEchelle(g: GabaritMur, echelle: number): GabaritMur {
  return echelle === 1 || !(echelle > 0) ? g : g.map((p) => ({ u: p.u, v: p.v * echelle }));
}

/**
 * Le controle de l'egout trouve par le gabarit pose : l'egout trouve moins celui ou l'echelle de la largeur met le gabarit, en part de
 * la largeur du mur (positif : l'egout trouve est plus haut). Les deux viennent du meme sol, si bien que c'est l'ecart des proportions
 * trouvees a celles du plan. Null sans rapport ni rectangle.
 */
export function ecartDEgout(rapport: number | null | undefined, r: RectMur | null | undefined): number | null {
  const w = r ? r.x1 - r.x0 : 0, h = r ? r.y1 - r.y0 : 0;
  return rapport && rapport > 0 && w > 0 && h > 0 ? h / w - rapport : null;
}

/**
 * Le gabarit pose sur une vue de face par le rectangle trouve, en pixels de la vue : son bas sur le sol (`y1`), ses bouts sur `x0` et
 * `x1`, a l'echelle de la largeur (`rapport`, la hauteur du plan sur sa largeur). Sans rapport, entre l'egout (`y0`) et le sol.
 */
export function gabaritSurLaVue(g: GabaritMur, r: RectMur, rapport: number | null = null): P2[] {
  const k = echelleDuGabarit(rapport, r);
  return g.map((p) => ({ x: r.x0 + p.u * (r.x1 - r.x0), y: r.y1 - p.v * k * (r.y1 - r.y0) }));
}

/**
 * Le gabarit pose sur une photo par les coins du mur (haut gauche, haut droit, bas droit, bas gauche : l'egout et le sol) : le rectangle
 * du mur ramene sur la photo par leur homographie, le gabarit a `echelle` (echelleDuGabarit, lue sur la vue de face ou le mur a ete
 * trouve : une photo de biais ne dit pas ses proportions). Null quand les coins ne forment pas un quadrilatere.
 */
export function gabaritSurLaPhoto(g: GabaritMur, coins: readonly P2[], echelle = 1): P2[] | null {
  if (coins.length !== 4) return null;
  g = gabaritALEchelle(g, echelle);
  const versPhoto = homographie([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }], coins);
  return versPhoto ? g.map((p) => { const q = appliquer(versPhoto, { x: p.u, y: p.v }); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }; }) : null;
}

/** Relit un gabarit enregistre (un cas de calibration, une correction) ; null s'il n'en est pas un. */
export function lireGabarit(brut: unknown): GabaritMur | null {
  if (!Array.isArray(brut) || brut.length < 2) return null;
  const g = brut.map((p) => (p && typeof p === 'object' ? { u: Number((p as { u?: unknown }).u), v: Number((p as { v?: unknown }).v) } : null));
  return g.every((p) => p && Number.isFinite(p.u) && Number.isFinite(p.v) && p.u >= -DEBORD_MAX && p.u <= 1 + DEBORD_MAX && p.v > 0) ? (g as { u: number; v: number }[]) : null;
}
