// Un appentis adosse le long d'une facade, ajoute par un fait (MD/spec-regles-toits.md §5.1).
//
// Le vocabulaire des faits decrit d'abord la forme du corps principal. Un porche, une galerie
// couverte, un auvent sur toute une facade ne s'y lisent pas : le contour BD TOPO s'arrete au mur (ou
// au debord du grand toit), et la bande basse devant la facade n'appartient a aucun rectangle du
// contour ; la reconstruction des corps ne la voit donc jamais. Le fait dit qu'il est la, et contre
// quelle facade ; la mesure, quand elle le voit, donne ses cotes (profondeur, egout, hauteur contre le
// mur) ; les cotes que le fait donne l'emportent. Cas d'origine : AE 101 (Le Vesinet), une galerie
// sur toute la facade sud, vue par le proprietaire le 14 octobre 2026.
//
// Un seul pan par facade, sur tout le cote du corps qui la porte : ce cote est deja le mur lisse
// (les decroches de moins de SEUIL_DECROCHE_M disparaissent dans les rectangles du contour), et un
// decroche de l'appentis plus petit que lui ne se lit ni sur le contour ni sur une grille de 50 cm.
// Le corps produit est un appentis ordinaire (faitage sur le mur, `posFaitage` = 0, rive de tete
// contre la facade) : la 3D le dessine comme les autres (three/toitCorps3d.ts).

import { hauteursMursCorps, HAUTEUR_PLAT_M, type Grille } from './toitCorps.js';
import { segmentEnFacade } from '../geometry/facadeExterieure.js';
import { REGLAGES_TOITS as R } from '../model/reglagesToits.js';
import type { AppentisFait } from '../model/faitsToits.js';
import type { CorpsToit, PtBrut } from '../model/types.js';

/** Un cote de corps porte la facade designee si sa normale sortante est a moins de cela de l'azimut du fait. */
export const TOLERANCE_FACADE_DEG = R.TOLERANCE_FACADE_DEG;
/** Un appentis adosse se cherche jusqu'a cette distance du mur. */
export const PROFONDEUR_APPENTIS_MAX_M = R.PROFONDEUR_APPENTIS_MAX_M;
/** La profondeur se lit par bandes paralleles au mur, de cette largeur. */
export const PAS_BANDE_APPENTIS_M = R.PAS_BANDE_APPENTIS_M;
/** Une bande est encore sous l'appentis quand au moins cette part de ses cellules lisibles est a sa hauteur. */
export const PART_APPENTIS_MIN = R.PART_APPENTIS_MIN;
/** En dessous, une cellule devant le mur est le sol, une haie, une voiture. */
export const EGOUT_APPENTIS_MIN_M = R.EGOUT_APPENTIS_MIN_M;
/** Le pan est au moins cela sous l'egout du mur qui le porte : au-dessus, le debord du grand toit, un arbre. */
export const SOUS_EGOUT_APPENTIS_M = R.SOUS_EGOUT_APPENTIS_M;
/** Il faut tant de cellules sur le pan pour en lire la pente. */
export const MESURES_APPENTIS_MIN = R.MESURES_APPENTIS_MIN;

const cm = (v: number) => Math.round(v * 100) / 100;
const dixieme = (v: number) => Math.round(v * 10) / 10;

/** L'azimut d'une direction du plan (Y vers le nord) : 0 = nord, sens horaire, de 0 a 360. */
export function azimutComplet(dx: number, dy: number): number {
  const a = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ((a % 360) + 360) % 360;
}

/** L'ecart entre deux azimuts, de 0 a 180 degres. */
const ecartAzimuts = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Une facade d'un corps : son cote `a -> b`, sa normale sortante `n`, et l'egout du mur (`hauteursMursCorps`). */
export interface FacadeDeCorps {
  corps: number;
  cote: number;
  a: PtBrut;
  b: PtBrut;
  n: PtBrut;
  L: number;
  egout: number;
}

/**
 * Le cote de corps qui porte la facade designee : en facade du contour (rien du batiment devant lui,
 * geometry/facadeExterieure.ts), normale sortante a moins de `toleranceDeg` de l'azimut, le plus long
 * s'il y en a plusieurs (« la facade sud », c'est le grand mur, pas le retour d'une annexe). Null
 * quand aucun cote ne regarde par la.
 */
export function facadeDesignee(corps: readonly CorpsToit[], contour: readonly PtBrut[], azimutDeg: number, toleranceDeg = TOLERANCE_FACADE_DEG): FacadeDeCorps | null {
  let best: FacadeDeCorps | null = null;
  corps.forEach((c, k) => {
    const n4 = c.pts.length;
    const centre = { x: c.pts.reduce((s, p) => s + p.x, 0) / n4, y: c.pts.reduce((s, p) => s + p.y, 0) / n4 };
    const murs = hauteursMursCorps(c);
    for (let i = 0; i < n4; i++) {
      const a = c.pts[i] as PtBrut, b = c.pts[(i + 1) % n4] as PtBrut;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1e-6) continue;
      let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
      if ((centre.x - a.x) * n.x + (centre.y - a.y) * n.y > 0) n = { x: -n.x, y: -n.y };
      if (ecartAzimuts(azimutComplet(n.x, n.y), azimutDeg) > toleranceDeg) continue;
      if (!segmentEnFacade(a, b, centre, contour)) continue;
      if (!best || L > best.L + 1e-6) best = { corps: k, cote: i, a, b, n, L, egout: murs[i] ?? Math.min(...c.egouts) };
    }
  });
  return best;
}

/** Les cotes d'un appentis adosse, en metres ; `ecart` : l'ecart quadratique de son pan a la mesure (0 : cotes du fait). */
export interface CotesAppentis { profondeurM: number; egoutM: number; hautM: number; ecart: number }

/**
 * Les cotes de l'appentis devant la facade `f`, lues sur la grille brute du MNH (elle deborde du
 * contour, la ou le porche se trouve) ; celles du fait l'emportent. La profondeur : bande apres bande
 * depuis le mur, tant qu'au moins PART_APPENTIS_MIN des cellules lisibles sont a hauteur d'appentis
 * plutot qu'au sol (une bande toute sous un arbre, ou hors de la grille, ne dit rien et ne l'arrete
 * pas). Les hauteurs : le plan du pan par moindres carres sur ces cellules, contre le mur et au bord.
 * Null quand la mesure ne voit pas d'appentis qui descende du mur : un fait ne fabrique pas un toit
 * que la mesure ne lit pas, sauf s'il en donne toutes les cotes.
 */
export function cotesAppentis(f: FacadeDeCorps, grille: Grille | null, fait: AppentisFait): CotesAppentis | null {
  const { profondeurM, egoutM, hautM } = fait;
  if (profondeurM !== undefined && egoutM !== undefined && hautM !== undefined) return { profondeurM, egoutM, hautM, ecart: 0 };
  if (!grille) return null;
  const u = { x: (f.b.x - f.a.x) / f.L, y: (f.b.y - f.a.y) / f.L };
  const plafond = f.egout - SOUS_EGOUT_APPENTIS_M;
  const auPan = (z: number) => z >= EGOUT_APPENTIS_MIN_M && z <= plafond;
  const devant: { t: number; z: number }[] = [];
  for (let j = 0; j < grille.ny; j++) for (let i = 0; i < grille.nx; i++) {
    const z = grille.z[j * grille.nx + i];
    if (z === null || z === undefined) continue;
    const dx = grille.x0 + i * grille.pas - f.a.x, dy = grille.y0 - j * grille.pas - f.a.y;
    const s = dx * u.x + dy * u.y, t = dx * f.n.x + dy * f.n.y;
    if (s >= 0 && s <= f.L && t >= 0 && t <= PROFONDEUR_APPENTIS_MAX_M) devant.push({ t, z });
  }
  let D = profondeurM ?? 0;
  if (profondeurM === undefined) {
    for (let t0 = 0; t0 < PROFONDEUR_APPENTIS_MAX_M - 1e-9; t0 += PAS_BANDE_APPENTIS_M) {
      const bande = devant.filter((c) => c.t >= t0 && c.t < t0 + PAS_BANDE_APPENTIS_M);
      const pan = bande.filter((c) => auPan(c.z)).length, sol = bande.filter((c) => c.z < EGOUT_APPENTIS_MIN_M).length;
      if (!pan && !sol) continue;
      if (pan < PART_APPENTIS_MIN * (pan + sol)) break;
      D = t0 + PAS_BANDE_APPENTIS_M;
    }
  }
  if (D <= 0) return null;
  const pan = devant.filter((c) => c.t <= D && auPan(c.z));
  if (pan.length < MESURES_APPENTIS_MIN) return null;
  const mt = pan.reduce((s, c) => s + c.t, 0) / pan.length, mz = pan.reduce((s, c) => s + c.z, 0) / pan.length;
  const stt = pan.reduce((s, c) => s + (c.t - mt) ** 2, 0);
  if (stt < 1e-9) return null;
  const k = pan.reduce((s, c) => s + (c.t - mt) * (c.z - mz), 0) / stt, h = mz - k * mt;
  const haut = hautM ?? dixieme(h), egout = egoutM ?? dixieme(h + k * D);
  // Un pan qui ne descend pas du mur n'est pas un appentis adosse : un toit plat, une terrasse, un arbre bas.
  if (!(k < 0) || haut - egout < HAUTEUR_PLAT_M) return null;
  const ecart = Math.sqrt(pan.reduce((s, c) => s + (c.z - (h + k * c.t)) ** 2, 0) / pan.length);
  return { profondeurM: D, egoutM: egout, hautM: haut, ecart: cm(ecart) };
}

/** Le corps de l'appentis : `pts[0] -> pts[1]` sur le mur (faitage et rive de tete), `pts[3]` vers l'exterieur. */
export function corpsAppentis(f: FacadeDeCorps, c: CotesAppentis): CorpsToit {
  const D = c.profondeurM;
  const P = (p: PtBrut, d: number): PtBrut => ({ x: cm(p.x + f.n.x * d), y: cm(p.y + f.n.y * d) });
  return { pts: [P(f.a, 0), P(f.b, 0), P(f.b, D), P(f.a, D)], posFaitage: 0, faitage: c.hautM, egouts: [c.hautM, c.egoutM], pignons: [], ecart: c.ecart };
}

/**
 * L'appentis d'un corps descend-il vers cet azimut (a la tolerance du fait) ? C'est ce que le fait
 * demande : un pan seul, qui monte vers la facade et descend vers l'exterieur.
 */
export function appentisVers(c: CorpsToit, ap: AppentisFait): boolean {
  const [p0, , , p3] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  const W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (W < 1e-6 || c.faitage - Math.min(...c.egouts) < HAUTEUR_PLAT_M) return false;
  const versT = c.posFaitage <= 0.01, versZero = c.posFaitage >= W - 0.01;
  if (!versT && !versZero) return false;
  const sens = versT ? 1 : -1;
  return ecartAzimuts(azimutComplet((sens * (p3.x - p0.x)) / W, (sens * (p3.y - p0.y)) / W), ap.facade.azimutDeg) <= (ap.facade.toleranceDeg ?? TOLERANCE_FACADE_DEG);
}

/**
 * Les corps avec les appentis adosses que demande l'observation, chacun contre la facade qu'elle
 * designe, aux cotes lues ou donnees. Un appentis que ni la mesure ni le fait ne cotent n'est pas
 * ajoute (`ecartsAuFait` le dit). Les facades se cherchent sur les corps lus, pas sur les appentis
 * qu'on vient d'ajouter.
 */
export function avecAppentis(appentis: readonly AppentisFait[] | undefined, corps: CorpsToit[] | null, contour: readonly PtBrut[], grille: Grille | null): CorpsToit[] | null {
  if (!appentis?.length || !corps?.length) return corps;
  const out = [...corps];
  for (const ap of appentis) {
    const f = facadeDesignee(corps, contour, ap.facade.azimutDeg, ap.facade.toleranceDeg);
    const cotes = f ? cotesAppentis(f, grille, ap) : null;
    if (f && cotes) out.push(corpsAppentis(f, cotes));
  }
  return out;
}
