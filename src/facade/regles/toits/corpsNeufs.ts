// Les corps du batiment dans le mode Plan (MD/spec-mode-toit-3d.md, etape 5) : poser une aile, un retour ou une aile biaise, deplacer un
// corps, l'etirer, le tourner, le retirer.
//
// Un corps est un rectangle de toit (`CorpsToit`) : ses `pts` en font le contour, son faitage suit `pts[0] -> pts[1]`. Les corps se
// superposent librement (le plus haut l'emporte a l'ecran) ; ce qui est pose sur un corps (bow-window, galerie, appentis) le suit : ses
// rectangles sont recalcules d'apres le corps, jamais deplaces a la main (`replacerSaillie`).
//
// Toutes les operations rendent une NOUVELLE liste de corps. Pur : pas de DOM, pas de scene.

import { point, repere } from '../../toitCorps.js';
import { murDuCorps, replacerSaillie, retirerSaillie } from './saillies.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

export type GenreCorps = 'aile' | 'retour' | 'biaise';

const centi = (v: number) => Math.round(v * 100) / 100;
const vingt = (v: number) => Math.round(v * 20) / 20;
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Un pas de rotation d'un corps, en degres : celui de la maquette. */
export const PAS_ROTATION_DEG = 15;
/** Les dimensions d'un corps, en metres : au moins, et au plus. */
export const LONGUEUR_CORPS_MIN_M = 2.5, LONGUEUR_CORPS_MAX_M = 30;

/** Le corps principal : le plus grand, hors ce qui est pose sur une facade. */
export function rangPrincipal(corps: readonly CorpsToit[]): number {
  let meilleur = -1, aire = -1;
  corps.forEach((c, i) => { if (c.saillie) return; const r = repere(c.pts), a = r.L * r.W; if (a > aire) { aire = a; meilleur = i; } });
  return meilleur;
}

/** Les rangs des corps proprement dits (ni bow-window, ni galerie, ni appentis poses) : ceux que le mode Plan montre. */
export const rangsDeCorps = (corps: readonly CorpsToit[]): number[] => corps.flatMap((c, i) => (c.saillie ? [] : [i]));

const centre = (pts: readonly PtBrut[]): PtBrut => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });

/** Le point est-il dans le polygone ? */
function dedans(p: PtBrut, pts: readonly PtBrut[]): boolean {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as PtBrut, b = pts[j] as PtBrut;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) d = !d;
  }
  return d;
}

/** Le centre et les coins rentres de 10 % : un coin pose exactement contre le mur d'un corps voisin n'est pas « dedans ». */
function sondeDe(pts: readonly PtBrut[]): PtBrut[] {
  const c = centre(pts);
  return [c, ...pts.map((p) => ({ x: p.x + (c.x - p.x) * 0.1, y: p.y + (c.y - p.y) * 0.1 }))];
}

/** Un emplacement est libre quand son centre et ses quatre coins ne tombent pas dans un corps existant : un corps neuf se pose a cote, pas dessus. */
function libre(pts: readonly PtBrut[], existants: readonly CorpsToit[], sonde: readonly PtBrut[] = sondeDe(pts)): boolean {
  return existants.every((c) => !c.saillie && sonde.every((p) => !dedans(p, c.pts)));
}

/** Les sommets d'un rectangle dans le repere de l'hote : `s` le long du faitage, `t` en travers, du coin (s0, t0) au coin (s1, t1). */
function rectangle(hote: CorpsToit, s0: number, t0: number, s1: number, t1: number, ordre: 'faitageEnT' | 'faitageEnS'): PtBrut[] {
  const r = repere(hote.pts), P = (s: number, t: number) => { const q = point(r, s, t); return { x: centi(q.x), y: centi(q.y) }; };
  // `faitageEnT` : le faitage du corps neuf suit la direction t de l'hote (un retour, une aile contre un pignon) ; sinon, la direction s.
  return ordre === 'faitageEnT' ? [P(s0, t0), P(s0, t1), P(s1, t1), P(s1, t0)] : [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
}

/** Un rectangle de `w` x `d` metres autour de son centre, tourne de `deg` degres dans le plan. */
function rectangleTourne(c: PtBrut, w: number, d: number, deg: number, base: number): PtBrut[] {
  const a = base + (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => ({ x: centi(c.x + (x as number) * co - (y as number) * si), y: centi(c.y + (x as number) * si + (y as number) * co) }));
}

/**
 * Un corps neuf, pose contre l'hote a la premiere place libre : une aile (un pan, 3 x 5 m) au bout du faitage, un retour (deux pans, 3 x 5 m) en
 * equerre a l'arriere, une aile biaisee (deux pans, 4 x 3,2 m, tournee de 35°) devant. Null : aucune place libre dans les emplacements essayes.
 */
export function corpsNeuf(hote: CorpsToit, genre: GenreCorps, existants: readonly CorpsToit[]): CorpsToit | null {
  const r = repere(hote.pts), egoutHote = Math.min(...hote.egouts);
  const nouveau = (pts: PtBrut[], posFaitage: number, egout: number, hauteur: number): CorpsToit => ({ pts, posFaitage: centi(posFaitage), faitage: centi(egout + hauteur), egouts: [centi(egout), centi(egout)], pignons: [], ecart: 0 });
  if (genre === 'aile') {
    const e = Math.max(2.4, Math.min(2.6, egoutHote));
    for (const s0 of [r.L, -3, r.L + 3, -6]) {
      // Un pan dont le faitage touche le mur de l'hote : le faitage suit la profondeur (t) de l'hote.
      const pts = rectangle(hote, s0, 0, s0 + 3, Math.min(5, r.W + 1), 'faitageEnT');
      if (libre(pts, existants)) return nouveau(pts, s0 >= r.L ? 0 : 3, e, 1.2);
    }
    return null;
  }
  if (genre === 'retour') {
    const e = Math.min(3.4, egoutHote);
    for (const s0 of [r.L - 3, 0, (r.L - 3) / 2]) {
      const pts = rectangle(hote, s0, r.W - 1.5, s0 + 3, r.W + 3.5, 'faitageEnT');
      // Le retour recouvre en partie le corps (il entre dans son toit) : seul son bout, derriere le corps, doit etre libre.
      const bout = [pts[1] as PtBrut, pts[2] as PtBrut, { x: ((pts[1] as PtBrut).x + (pts[2] as PtBrut).x) / 2, y: ((pts[1] as PtBrut).y + (pts[2] as PtBrut).y) / 2 }];
      if (libre(pts, existants, bout)) return nouveau(pts, 1.5, e, 2.2);
    }
    return null;
  }
  const n = existants.filter((c) => !c.saillie).length;
  for (let k = 0; k < 6; k++) {
    const c = point(r, 3 + (n - 1 + k) * 1.4, -2.2 - 0.3 * k);
    const pts = rectangleTourne(c, 4, 3.2, 35, Math.atan2(r.u.y, r.u.x));
    if (libre(pts, existants)) return nouveau(pts, 1.6, 2.6, 1.6);
  }
  return null;
}

/** Recalcule ce qui est pose sur le corps `rang` : ses bow-windows, galeries et appentis suivent le corps qui a bouge. */
function suivre(corps: readonly CorpsToit[], rang: number): CorpsToit[] {
  let l = corps.slice();
  corps.forEach((c, i) => { if (c.saillie && c.saillie.hote === rang) l = replacerSaillie(l, i, {}); });
  return l;
}

/** Tourne le corps de `deg` degres autour de son centre ; positif : vers la gauche vu de dessus (la Vue 3D met le haut du plan en haut de l'ecran). */
export function tournerCorps(corps: readonly CorpsToit[], rang: number, deg: number): CorpsToit[] {
  const c = corps[rang];
  if (!c || c.saillie) return corps.slice();
  const o = centre(c.pts), a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const pts = c.pts.map((p) => ({ x: centi(o.x + (p.x - o.x) * co - (p.y - o.y) * si), y: centi(o.y + (p.x - o.x) * si + (p.y - o.y) * co) }));
  return suivre(corps.map((k, i) => (i === rang ? { ...k, pts } : k)), rang);
}

/** Deplace le corps de `(dx, dy)` metres dans le plan, arrondi a 5 cm. */
export function deplacerCorps(corps: readonly CorpsToit[], rang: number, dx: number, dy: number): CorpsToit[] {
  const c = corps[rang];
  if (!c || c.saillie) return corps.slice();
  const pts = c.pts.map((p) => ({ x: centi(vingt(p.x + dx)), y: centi(vingt(p.y + dy)) }));
  return suivre(corps.map((k, i) => (i === rang ? { ...k, pts } : k)), rang);
}

/**
 * Etire le corps le long de sa longueur (`L`, le sens du faitage) ou de sa largeur (`W`) en deplacant l'extremite loin de `pts[0]` : l'autre
 * extremite reste en place. Largeur et longueur restent entre 2,5 et 30 m ; le faitage garde sa place relative, ce qui est pose le long du
 * faitage reste dans le corps.
 */
export function etirerCorps(corps: readonly CorpsToit[], rang: number, axe: 'L' | 'W', delta: number): CorpsToit[] {
  const c = corps[rang];
  if (!c || c.saillie) return corps.slice();
  const r = repere(c.pts), actuelle = axe === 'L' ? r.L : r.W, nouvelle = borne(vingt(actuelle + delta), LONGUEUR_CORPS_MIN_M, LONGUEUR_CORPS_MAX_M);
  const d = nouvelle - actuelle, v = axe === 'L' ? r.u : r.v;
  // L'extremite de `pts[0]` a `pts[1]` (L) est portee par pts[1] et pts[2] ; celle de `pts[0]` a `pts[3]` (W), par pts[2] et pts[3].
  const bouge = axe === 'L' ? [1, 2] : [2, 3];
  const pts = c.pts.map((p, i) => (bouge.includes(i) ? { x: centi(p.x + v.x * d), y: centi(p.y + v.y * d) } : p));
  let neuf: CorpsToit = { ...c, pts };
  if (axe === 'W') neuf = { ...neuf, posFaitage: centi((c.posFaitage * nouvelle) / actuelle) };
  else neuf = { ...neuf, pignons: c.pignons.map((g) => ({ ...g, debut: Math.min(g.debut, nouvelle - 1.4), fin: Math.min(g.fin, nouvelle) })).filter((g) => g.fin - g.debut >= 1.4),
    ...(c.lucarnes ? { lucarnes: c.lucarnes.map((l) => ({ ...l, debutM: Math.min(l.debutM, nouvelle - 0.7), finM: Math.min(l.finM, nouvelle - 0.1) })) } : {}) };
  return suivre(orienterFaitage(corps.map((k, i) => (i === rang ? neuf : k)), rang), rang);
}

/**
 * Le faitage dans le sens de la longueur, tout seul : un corps a deux pans, quatre pans ou pavillon, sans rien de pose dessus (ni pignon, ni
 * bow-window, ni lucarne), dont le faitage est au milieu, tourne son faitage le long du plus grand cote. Un appentis, un toit plat ou un corps
 * porteur garde le sien.
 */
export function orienterFaitage(corps: readonly CorpsToit[], rang: number): CorpsToit[] {
  const c = corps[rang];
  if (!c || c.saillie || c.pignons.length || c.lucarnes?.length || c.elementsToit?.length || c.speciale || c.profil || c.bouts) return corps.slice();
  if (corps.some((k) => k.saillie && k.saillie.hote === rang)) return corps.slice();
  const r = repere(c.pts);
  if (!(c.posFaitage > 0.01 && c.posFaitage < r.W - 0.01) || Math.abs(c.posFaitage - r.W / 2) > 0.05 || c.faitage - Math.min(...c.egouts) < 0.3) return corps.slice();
  if (!(r.W > r.L * 1.15)) return corps.slice();
  // Le faitage passe sur l'autre cote : les sommets tournent d'un cran, la largeur devient l'ancienne longueur.
  const pts = [c.pts[1], c.pts[2], c.pts[3], c.pts[0]] as PtBrut[];
  const neuf: CorpsToit = { ...c, pts, posFaitage: centi(r.L / 2) };
  if (c.croupes) delete neuf.croupes;
  return corps.map((k, i) => (i === rang ? neuf : k));
}

/** Retire un corps et tout ce qui est pose dessus. Le corps principal reste (un batiment sans corps n'a plus de toit a retoucher). */
export function supprimerCorps(corps: readonly CorpsToit[], rang: number): CorpsToit[] {
  const c = corps[rang];
  if (!c || c.saillie || rang === rangPrincipal(corps)) return corps.slice();
  let l = corps.slice();
  // Les saillies de ce corps partent d'abord (de la fin au debut : leurs rangs ne bougent pas), puis le corps.
  for (let i = l.length - 1; i >= 0; i--) if (l[i]?.saillie?.hote === rang) l = retirerSaillie(l, i);
  const r = l.indexOf(c);
  return r >= 0 ? retirerSaillie(l, r) : l;
}

/** Les murs d'un corps vus du plan, pour dessiner son contour : de `pts[i]` a `pts[i + 1]`. */
export const contourDe = (c: CorpsToit): PtBrut[] => c.pts.map((_, i) => murDuCorps(c, i).a);
