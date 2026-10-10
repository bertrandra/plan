// Le toit d'un batiment en plusieurs volumes (MD/spec-toit-ign.md §11).
//
// Un toit unique sur un contour en L, en T ou en U ne ressemble a rien : les croupes du squelette
// font une seule nappe la ou la maison a un corps et une aile, chacun son faitage, souvent son
// egout. Ici, le contour est **decoupe en rectangles** - le corps principal et ses ailes - et
// chaque rectangle recoit son toit : deux pans dans son axe (quatre pans s'il est carre), a la
// pente du toit du batiment ; le LiDAR (app/toitsLidar.ts) le remplace ensuite volume par volume
// par ce qu'il mesure, egout compris.
//
// Le decoupage ne vaut que pour un contour **rectiligne** : chaque cote a moins de `TOLERANCE_DEG`
// d'un des deux axes du batiment. Un contour de biais, un demi-cercle, gardent leur toit unique.
// Les decroches de facade (moins de 1,2 m) sont lisses d'abord, puis le contour est couvert par ses
// rectangles maximaux, qui peuvent se chevaucher : un corps et une aile qui le penetre.

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import { signedArea, pointInPolygon } from '../geometry/basic.js';
import { angleDuPlusLongCote, repereFaitage, ELONGATION_MIN } from '../geometry/faitage.js';
import { squeletteDroit, demiLargeurApprochee } from '../geometry/squelette.js';
import { PENTE_DEFAUT_DEG } from './toitBdTopo.js';
import type { ObjetPlan, PtBrut, Toit, VolumeToit } from './types.js';

/** Un cote a plus de cela d'un axe du batiment : le contour n'est pas rectiligne, pas de decoupage. */
export const TOLERANCE_DEG = 15;
/** Un rectangle plus etroit que cela n'est pas un volume : une saillie, un decroche de facade. */
export const LARGEUR_MIN_M = 1.5;
/** Et en dessous de cette aire il est simplement oublie (un auvent, une marche) ; au-dela, le decoupage est refuse. */
const AIRE_NEGLIGEABLE_M2 = 2;
/** Deux abscisses a moins de cela sont la meme (le contour simplifie n'est droit qu'au centimetre). */
const EPSILON_M = 0.05;
/** Un cote plus court que cela est un decroche de facade (un ressaut, un conduit), pas un volume : il est lisse. */
export const SEUIL_DECROCHE_M = 1.2;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const cm = (v: number) => Math.round(v * 100) / 100;

/** Un rectangle aligne sur les axes du repere local. */
interface Rect { x0: number; x1: number; y0: number; y1: number }

function tourner(pts: readonly PtBrut[], angleDeg: number): PtBrut[] {
  const c = Math.cos(rad(angleDeg)), s = Math.sin(rad(angleDeg));
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/**
 * Le contour ramene a l'equerre dans son repere : chaque cote horizontal ou vertical, ou null s'il
 * ne l'est pas a `TOLERANCE_DEG` pres. Deux cotes consecutifs de meme sens fusionnent ; un sommet est
 * l'intersection de ses deux cotes, poses a la moyenne de leurs bouts.
 */
export function equerrer(local: readonly PtBrut[]): PtBrut[] | null {
  const n = local.length;
  if (n < 4) return null;
  // Le sens de chaque cote : vrai pour horizontal.
  const sens: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = au(local, i), b = sommetDe(local, i + 1);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) < EPSILON_M) { sens.push(sens.length ? (sens[sens.length - 1] as boolean) : true); continue; }
    const angle = Math.abs(deg(Math.atan2(dy, dx))) % 180;
    const ecartH = Math.min(angle, 180 - angle), ecartV = Math.abs(angle - 90);
    if (ecartH > TOLERANCE_DEG && ecartV > TOLERANCE_DEG) return null;
    sens.push(ecartH <= ecartV);
  }
  // Fusion des cotes consecutifs de meme sens : on garde les sommets ou le sens change.
  const garde: number[] = [];
  for (let i = 0; i < n; i++) if (sens[(i - 1 + n) % n] !== sens[i]) garde.push(i);
  if (garde.length < 4) return null;
  // La position de chaque cote garde : la moyenne de ses bouts, sur l'axe qu'il suit.
  const cotes = garde.map((i, k) => {
    const j = au(garde, (k + 1) % garde.length);
    const a = au(local, i), b = au(local, j);
    return { horizontal: sens[i] as boolean, pos: sens[i] ? (a.y + b.y) / 2 : (a.x + b.x) / 2 };
  });
  return cotes.map((c, k) => {
    const prec = au(cotes, (k - 1 + cotes.length) % cotes.length);
    // Le sommet k est entre le cote k-1 et le cote k : x du vertical, y de l'horizontal.
    return c.horizontal ? { x: prec.pos, y: c.pos } : { x: c.pos, y: prec.pos };
  });
}

/**
 * Lisse les decroches d'un contour a l'equerre : tant qu'un cote fait moins de `SEUIL_DECROCHE_M`, ses
 * deux voisins (paralleles) sont ramenes sur la ligne du plus long, et le cote disparait avec ses
 * deux sommets. Une maison aux facades en ressaut redevient un L franc ; un contour qui n'a plus que
 * quatre sommets ne se lisse plus.
 */
export function lisserDecroches(droit: readonly PtBrut[]): PtBrut[] {
  let pts = droit.map((p) => ({ ...p }));
  for (let garde = 0; garde < 40 && pts.length > 4; garde++) {
    const n = pts.length;
    let court = -1, lCourt = SEUIL_DECROCHE_M;
    for (let i = 0; i < n; i++) {
      const a = au(pts, i), b = sommetDe(pts, i + 1);
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < lCourt) { lCourt = l; court = i; }
    }
    if (court < 0) break;
    // Le cote court va du sommet `court` au sommet `court + 1` ; ses voisins vont de court-1 a court et de court+1 a court+2.
    const iPrev = (court - 1 + n) % n, iNext = (court + 2) % n;
    const a = au(pts, iPrev), b = au(pts, court), c = au(pts, (court + 1) % n), d = au(pts, iNext);
    const horizontal = Math.abs(b.y - a.y) < Math.abs(b.x - a.x);
    const lPrev = Math.hypot(b.x - a.x, b.y - a.y), lNext = Math.hypot(d.x - c.x, d.y - c.y);
    // La ligne gardee : celle du plus long des deux voisins ; l'autre y est ramene par son bout libre.
    const vers = lPrev >= lNext ? b : c;
    const suivant: PtBrut[] = pts.map((p) => ({ ...p }));
    if (lPrev >= lNext) { if (horizontal) (suivant[iNext] as PtBrut).y = vers.y; else (suivant[iNext] as PtBrut).x = vers.x; }
    else { if (horizontal) (suivant[iPrev] as PtBrut).y = vers.y; else (suivant[iPrev] as PtBrut).x = vers.x; }
    pts = suivant.filter((_, i) => i !== court && i !== (court + 1) % n);
  }
  return pts;
}

/** Le centre de la cellule (i, k) de la grille des abscisses et ordonnees du contour est-il dedans ? */
function cellulesDedans(poly: readonly PtBrut[], xs: readonly number[], ys: readonly number[]): boolean[][] {
  return xs.slice(0, -1).map((x0, i) => ys.slice(0, -1).map((y0, k) => pointInPolygon({ x: (x0 + (xs[i + 1] as number)) / 2, y: (y0 + (ys[k + 1] as number)) / 2 }, poly)));
}

/**
 * La couverture du contour par ses rectangles maximaux : sur la grille des abscisses et des
 * ordonnees du contour, tout rectangle de cellules entierement dedans et qu'aucun autre ne
 * contient ; puis, du plus grand au plus petit, ceux qu'il faut pour couvrir chaque cellule.
 * Deux rectangles peuvent se chevaucher - c'est voulu : un corps et une aile qui le penetre,
 * chacun son toit entier, le plus haut des deux l'emporte dans la 3D.
 */
export function couvertureRectangles(poly: readonly PtBrut[]): Rect[] {
  const xs = [...new Set(poly.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => p.y))].sort((a, b) => a - b);
  const dedans = cellulesDedans(poly, xs, ys);
  const nx = xs.length - 1, ny = ys.length - 1;
  const plein = (i0: number, i1: number, k0: number, k1: number) => {
    for (let i = i0; i < i1; i++) for (let k = k0; k < k1; k++) if (!(dedans[i] as boolean[])[k]) return false;
    return true;
  };
  type Cand = Rect & { i0: number; i1: number; k0: number; k1: number };
  const valides: Cand[] = [];
  for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0 + 1; i1 <= nx; i1++) for (let k0 = 0; k0 < ny; k0++) for (let k1 = k0 + 1; k1 <= ny; k1++) {
    if (plein(i0, i1, k0, k1)) valides.push({ i0, i1, k0, k1, x0: xs[i0] as number, x1: xs[i1] as number, y0: ys[k0] as number, y1: ys[k1] as number });
  }
  const maximaux = valides.filter((r) => !valides.some((s) => s !== r && s.i0 <= r.i0 && s.i1 >= r.i1 && s.k0 <= r.k0 && s.k1 >= r.k1));
  const reste = new Set<string>();
  for (let i = 0; i < nx; i++) for (let k = 0; k < ny; k++) if ((dedans[i] as boolean[])[k]) reste.add(i + ':' + k);
  const choisis: Rect[] = [];
  while (reste.size && maximaux.length) {
    let meilleur: Cand | null = null, gain = 0, aireM = 0;
    for (const r of maximaux) {
      let g = 0;
      for (let i = r.i0; i < r.i1; i++) for (let k = r.k0; k < r.k1; k++) if (reste.has(i + ':' + k)) g++;
      const a = (r.x1 - r.x0) * (r.y1 - r.y0);
      if (g > gain || (g === gain && g > 0 && a > aireM)) { meilleur = r; gain = g; aireM = a; }
    }
    if (!meilleur) break;
    for (let i = meilleur.i0; i < meilleur.i1; i++) for (let k = meilleur.k0; k < meilleur.k1; k++) reste.delete(i + ':' + k);
    choisis.push({ x0: meilleur.x0, x1: meilleur.x1, y0: meilleur.y0, y1: meilleur.y1 });
  }
  return choisis;
}

const aire = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
const largeurMin = (r: Rect) => Math.min(r.x1 - r.x0, r.y1 - r.y0);

/**
 * Le contour decoupe en rectangles, le plus grand d'abord, chacun dans le repere du plan ; null
 * quand le contour n'est pas rectiligne, quand il tient en un seul rectangle, ou quand le decoupage
 * laisse un volume trop etroit pour en etre un.
 */
export function decomposerEnRectangles(pts: readonly PtBrut[]): PtBrut[][] | null {
  if (pts.length < 4) return null;
  const angle = angleDuPlusLongCote(pts);
  const equerre = equerrer(tourner(pts, -angle));
  if (!equerre) return null;
  const droit = lisserDecroches(equerre);
  // Un contour equerre et lisse qui a perdu plus de 15 % de son aire n'etait pas rectiligne.
  const a0 = Math.abs(signedArea(pts)), a1 = Math.abs(signedArea(droit));
  if (a0 <= 0 || Math.abs(a1 - a0) / a0 > 0.15) return null;
  const rects = couvertureRectangles(droit).filter((r) => aire(r) >= AIRE_NEGLIGEABLE_M2).sort((p, q) => aire(q) - aire(p));
  if (rects.length < 2 || rects.some((r) => largeurMin(r) < LARGEUR_MIN_M)) return null;
  return rects.map((r) => tourner([{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }], angle).map((p) => ({ x: cm(p.x), y: cm(p.y) })));
}

/** La pente du toit d'un batiment, en degres, d'apres son toit et son contour ; celle d'une tuile a defaut. */
export function penteDuToit(pts: readonly PtBrut[], toit: Toit): number {
  if (toit.forme === 'plat' || !(toit.hauteur > 0)) return 0;
  if (toit.forme === 'croupes') {
    if (toit.pente !== undefined) return toit.pente;
    const d = squeletteDroit(pts)?.dmax ?? demiLargeurApprochee(pts);
    return d > 0 ? deg(Math.atan(toit.hauteur / d)) : PENTE_DEFAUT_DEG;
  }
  const r = repereFaitage(pts, toit.angleFaitage);
  const course = toit.forme === 'appentis' ? 2 * r.hw : r.hw;
  return course > 0 ? deg(Math.atan(toit.hauteur / course)) : PENTE_DEFAUT_DEG;
}

/** Le toit par defaut d'un rectangle : deux pans dans son axe, quatre pans s'il est carre, a la pente donnee. */
export function toitDuRectangle(rect: readonly PtBrut[], penteDegres: number, source: Toit['source'], estime: boolean): Toit {
  if (penteDegres <= 0) return { forme: 'plat', hauteur: 0, angleFaitage: 0, ...(source ? { source } : {}) };
  const angle = angleDuPlusLongCote(rect);
  const r = repereFaitage(rect, angle);
  const forme: Toit['forme'] = r.hw > 0 && r.hl / r.hw >= ELONGATION_MIN ? 'deux-pans' : 'quatre-pans';
  return { forme, hauteur: cm(r.hw * Math.tan(rad(penteDegres))), angleFaitage: angle, ...(source ? { source } : {}), ...(estime ? { estime: true } : {}) };
}

/**
 * Les volumes par defaut d'un batiment, d'apres son contour et son toit unique : null quand le
 * contour ne se decoupe pas. Chaque rectangle prend la pente du toit du batiment.
 */
export function volumesParDefaut(pts: readonly PtBrut[], toit: Toit): VolumeToit[] | null {
  const rects = decomposerEnRectangles(pts);
  if (!rects) return null;
  const pente = penteDuToit(pts, toit);
  return rects.map((r) => ({ pts: r, toit: toitDuRectangle(r, pente, toit.source, !!toit.estime) }));
}

/** Les volumes que la 3D montre : ceux du batiment quand il en a au moins deux et que le mode ne dit pas « un seul toit ». */
export function volumesActifs(o: Pick<ObjetPlan, 'volumesToit' | 'modeToit'>): VolumeToit[] | null {
  const v = o.volumesToit;
  if (!v || v.length < 2 || o.modeToit === 'simple') return null;
  return v;
}

/** Le toit d'un volume tel que la 3D le dessine : la couverture (couleur) est celle du toit du batiment, reglee une fois. */
export function toitDuVolume(v: VolumeToit, reference: Toit | null | undefined): Toit {
  if (!reference?.couleur) return v.toit;
  return { ...v.toit, couleur: reference.couleur, ...(reference.origineCouleur ? { origineCouleur: reference.origineCouleur } : {}) };
}

/** « Corps 12,0 × 8,0 m : deux pans » : une ligne par volume, le plus grand d'abord. */
export function decrireVolumes(volumes: readonly VolumeToit[], libelles: Record<Toit['forme'], string>): string[] {
  return volumes.map((v, i) => {
    const r = repereFaitage(v.pts, angleDuPlusLongCote(v.pts));
    const dims = (2 * r.hl).toFixed(1).replace('.', ',') + ' × ' + (2 * r.hw).toFixed(1).replace('.', ',') + ' m';
    const egout = v.egout !== undefined ? ' · égout ' + v.egout.toFixed(1).replace('.', ',') + ' m' : '';
    return (i === 0 ? 'Corps ' : 'Aile ') + dims + ' : ' + libelles[v.toit.forme].toLowerCase() + egout;
  });
}
