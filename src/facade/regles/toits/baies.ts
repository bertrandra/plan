// Les bay windows d'un batiment (MD/spec-regles-toits.md §2.3, §3.3, §3.4 n°9).
//
// Une bay window est une avancee de facade que le contour cadastral porte : un U sur le mur, de 0,3 a
// 1,2 m de saillie et de 1 a 4 m de large (AE 101 : 2,3 x 0,6 m cote est). Les rectangles du contour
// la lissent (SEUIL_DECROCHE_M) et aucun corps ne la couvre. Deux choses distinctes :
// - **la reperer** (`saillies`) : un calcul sur le seul contour, qui dit ou elles sont et leur plan.
//   Il ne decide d'aucun toit : le LiDAR seul ne tranche pas (la saillie tient sur trois cellules,
//   sous l'ombre du mur) ; c'est une observation ou une photo (§3.4). Le banc les compte (`banc.ts`).
// - **la poser** (`avecBaies`) : un fait (observation.baies) dit quelle saillie et quel toit elle a ;
//   la mesure donne les hauteurs que le fait ne donne pas. Une bay window a son propre toit devient un
//   petit corps (plat ou appentis) sur la saillie, que la 3D dessine comme les autres ; une bay window
//   couverte par le toit d'un appentis voisin n'a pas de toit a elle, et n'ajoute aucun corps.
//
// L'arc et le rectangle a angles arrondis sont gardes dans `baie.forme` ; le corps pose l'enveloppe
// rectangulaire de la saillie.

import { hauteursMursCorps, type Grille } from '../../toits/toitCorps.js';
import { signedArea } from '../../../geometry/basic.js';
import { azimutComplet } from './appentis.js';
import { SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import type { BaieFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

const cm = (v: number) => Math.round(v * 100) / 100;
const dixieme = (v: number) => Math.round(v * 10) / 10;
const ecartAzimuts = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Une saillie du contour qui a la taille et l'equerre d'une bay window. */
export interface Saillie {
  /** Le rang du premier sommet du U dans le contour : le U est `i, i+1, i+2, i+3`. */
  i: number;
  /** Le rectangle de la saillie : `pts[0] -> pts[1]` le long du mur, `pts[0] -> pts[3]` vers l'exterieur. */
  pts: PtBrut[];
  largeurM: number;
  saillieM: number;
  /** L'azimut de sa face (la normale sortante) : 0 = nord, sens horaire, de 0 a 360. */
  azimutDeg: number;
}

const diff = (a: PtBrut, b: PtBrut): PtBrut => ({ x: b.x - a.x, y: b.y - a.y });
const norme = (v: PtBrut) => Math.hypot(v.x, v.y);
const croix = (a: PtBrut, b: PtBrut) => a.x * b.y - a.y * b.x;
const scal = (a: PtBrut, b: PtBrut) => a.x * b.x + a.y * b.y;
/** L'angle entre deux vecteurs, en degres, de 0 a 180. */
const angle = (a: PtBrut, b: PtBrut) => (Math.acos(Math.max(-1, Math.min(1, scal(a, b) / (norme(a) * norme(b))))) * 180) / Math.PI;

/**
 * Les saillies du contour qui peuvent etre des bay windows : trois cotes consecutifs en U, les deux joues
 * perpendiculaires a la face (a EQUERRE_BAIE_DEG pres) et de meme saillie (a ECART_JOUES_BAIE_M pres), la
 * saillie entre SAILLIE_BAIE_MIN_M et SAILLIE_BAIE_MAX_M, la face entre LARGEUR_BAIE_MIN_M et LARGEUR_BAIE_MAX_M, et un
 * U qui avance vers l'exterieur (deux angles saillants). Un simple decroche de mur (deux cotes) n'en est pas un.
 */
export function saillies(contour: readonly PtBrut[]): Saillie[] {
  const n = contour.length;
  if (n < 6) return [];
  const sens = signedArea(contour as PtBrut[]) >= 0 ? 1 : -1;
  const out: Saillie[] = [];
  for (let i = 0; i < n; i++) {
    const v = [0, 1, 2, 3].map((k) => contour[(i + k) % n] as PtBrut);
    const e1 = diff(v[0] as PtBrut, v[1] as PtBrut), e2 = diff(v[1] as PtBrut, v[2] as PtBrut), e3 = diff(v[2] as PtBrut, v[3] as PtBrut);
    const L = norme(e2);
    if (L < S.LARGEUR_BAIE_MIN_M || L > S.LARGEUR_BAIE_MAX_M) continue;
    if (norme(e1) < 1e-6 || norme(e3) < 1e-6) continue;
    // Deux angles saillants : le contour tourne du meme cote en v1 et en v2, du cote de l'interieur.
    if (sens * croix(e1, e2) <= 0 || sens * croix(e2, e3) <= 0) continue;
    if (Math.abs(angle(e1, e2) - 90) > S.EQUERRE_BAIE_DEG || Math.abs(angle(e2, e3) - 90) > S.EQUERRE_BAIE_DEG) continue;
    if (angle(e1, { x: -e3.x, y: -e3.y }) > S.EQUERRE_BAIE_DEG) continue;
    // La normale sortante de la face : a droite du sens de marche pour un contour antihoraire.
    const u = { x: e2.x / L, y: e2.y / L };
    const nor = { x: sens * u.y, y: -sens * u.x };
    const d1 = scal(e1, nor), d3 = -scal(e3, nor);
    if (d1 <= 0 || d3 <= 0) continue;
    const d = (d1 + d3) / 2;
    if (Math.abs(d1 - d3) > S.ECART_JOUES_BAIE_M || d < S.SAILLIE_BAIE_MIN_M || d > S.SAILLIE_BAIE_MAX_M) continue;
    const mur = (p: PtBrut, k: number): PtBrut => ({ x: cm(p.x - nor.x * k), y: cm(p.y - nor.y * k) });
    const w1 = mur(v[1] as PtBrut, d1), w2 = mur(v[2] as PtBrut, d3);
    const pts: PtBrut[] = [w1, w2, { x: cm(w2.x + nor.x * d), y: cm(w2.y + nor.y * d) }, { x: cm(w1.x + nor.x * d), y: cm(w1.y + nor.y * d) }];
    out.push({ i, pts, largeurM: cm(L), saillieM: cm(d), azimutDeg: Math.round(azimutComplet(nor.x, nor.y)) });
  }
  return out;
}

/** La saillie que designe le fait : sa face regarde l'azimut du fait (a sa tolerance), la plus proche de sa largeur donnee, sinon la plus large. */
export function saillieDuFait(f: BaieFait, contour: readonly PtBrut[]): Saillie | null {
  const tol = f.facade.toleranceDeg ?? S.TOLERANCE_FACADE_DEG;
  const candidates = saillies(contour).filter((s) => ecartAzimuts(s.azimutDeg, f.facade.azimutDeg) <= tol);
  if (!candidates.length) return null;
  const cle = (s: Saillie) => (f.largeurM !== undefined ? Math.abs(s.largeurM - f.largeurM) : -s.largeurM);
  return [...candidates].sort((a, b) => cle(a) - cle(b))[0] as Saillie;
}

/** Les cellules de la grille sous un rectangle, retrait de `marge` sur chaque bord. */
function cellulesSous(g: Grille, pts: readonly PtBrut[], marge: number): number[] {
  const [a, b, , d] = pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  const L = norme(diff(a, b)), W = norme(diff(a, d));
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, v = { x: (d.x - a.x) / W, y: (d.y - a.y) / W };
  const out: number[] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const z = g.z[j * g.nx + i];
    if (z === null || z === undefined) continue;
    const p = { x: g.x0 + i * g.pas - a.x, y: g.y0 - j * g.pas - a.y };
    const s = scal(p, u), t = scal(p, v);
    if (s >= marge && s <= L - marge && t >= marge && t <= W - marge) out.push(z);
  }
  return out;
}

/** Le corps hote d'une saillie : celui dont le contour passe le plus pres du milieu de sa face contre le mur. */
function corpsHote(corps: readonly CorpsToit[], s: Saillie): CorpsToit | null {
  const [a, b] = s.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let best: CorpsToit | null = null, dmin = Infinity;
  for (const c of corps) {
    const n = c.pts.length;
    for (let k = 0; k < n; k++) {
      const p = c.pts[k] as PtBrut, q = c.pts[(k + 1) % n] as PtBrut;
      const l2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((m.x - p.x) * (q.x - p.x) + (m.y - p.y) * (q.y - p.y)) / l2));
      const d = Math.hypot(m.x - (p.x + t * (q.x - p.x)), m.y - (p.y + t * (q.y - p.y)));
      if (d < dmin) { dmin = d; best = c; }
    }
  }
  return best;
}

/** Les corps avec les bay windows a toit propre que demande l'observation. Une saillie introuvable, ou sans cote, n'ajoute rien (`ecartsAuFait` le dit). */
export function avecBaies(baies: readonly BaieFait[] | undefined, corps: CorpsToit[] | null, contour: readonly PtBrut[], grille: Grille | null): CorpsToit[] | null {
  if (!baies?.length || !corps?.length) return corps;
  const out = [...corps];
  for (const f of baies) {
    if (f.toit !== 'propre') continue;
    const s = saillieDuFait(f, contour);
    if (!s) continue;
    const c = corpsDeBaie(f, s, corps, grille);
    if (c) out.push(c);
  }
  return out;
}

/** Le corps d'une bay window a toit propre : plat a `hauteurM`, ou appentis dont le pan monte contre le mur (`hautM`) et descend a `egoutM`. */
export function corpsDeBaie(f: BaieFait, s: Saillie, corps: readonly CorpsToit[], grille: Grille | null): CorpsToit | null {
  const baie = { forme: f.forme, ...(f.congeM !== undefined ? { congeM: f.congeM } : {}), pose: f.pose, source: 'observation' as const };
  const hote = corpsHote(corps, s);
  const plafond = hote ? Math.min(...hauteursMursCorps(hote)) - S.SOUS_EGOUT_BAIE_M : Infinity;
  // Sans cote du fait, la hauteur est la mediane des cellules sous la saillie, entre le sol et l'egout du mur qui la porte.
  const lue = (): number | null => {
    if (!grille) return null;
    const z = cellulesSous(grille, s.pts, S.MARGE_BAIE_M).filter((v) => v >= S.HAUTEUR_BAIE_MIN_M && v <= plafond).sort((a, b) => a - b);
    return z.length >= S.MESURES_BAIE_MIN ? dixieme(z[Math.floor(z.length / 2)] as number) : null;
  };
  if (f.toitForme === 'appentis') {
    const haut = f.hautM ?? lue(), egout = f.egoutM ?? (haut === null ? null : dixieme(haut - S.CHUTE_PAN_BAIE_M));
    if (haut === null || egout === null || haut <= egout) return null;
    return { pts: s.pts, posFaitage: 0, faitage: haut, egouts: [haut, egout], pignons: [], ecart: 0, baie };
  }
  const h = f.hauteurM ?? lue();
  if (h === null) return null;
  return { pts: s.pts, posFaitage: cm(s.saillieM / 2), faitage: h, egouts: [h, h], pignons: [], ecart: 0, baie };
}

/** La bay window du fait est-elle posee : sa saillie existe, et un corps de bay window la couvre quand son toit est propre. */
export function baiePosee(f: BaieFait, corps: readonly CorpsToit[] | null, contour: readonly PtBrut[]): boolean {
  const s = saillieDuFait(f, contour);
  if (!s) return false;
  if (f.toit !== 'propre') return true;
  return !!corps?.some((c) => c.baie && c.pts.every((p) => s.pts.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.05)));
}
