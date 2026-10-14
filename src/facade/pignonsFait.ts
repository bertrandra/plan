// Les pignons traversants qu'un fait place sur une facade du corps principal (MD/spec-regles-toits.md
// §5.1) : « deux pignons, a gauche et a droite de la facade sud, qui montent au point haut du
// faitage » (le proprietaire d'AE 101, 14 octobre 2026).
//
// Pourquoi un fait : la detection seule (facade/toitCorps.ts::detecterPignons) depend de la mesure, et
// la mesure change. Le MNH LiDAR que sert l'IGN pour AE 101 a change dans l'apres-midi du 14 octobre
// (0,4 m d'ecart moyen par cellule, sans decalage) : le pignon est, qui depassait le pan de 0,8 a
// 1,8 m, n'y depasse plus le seuil, et le toit perdait un pignon. Ce que le proprietaire a vu ne doit
// pas dependre d'une relecture.
//
// Pour chaque bout de la facade : la largeur donnee par le fait l'emporte (le proprietaire l'a
// estimee : 3,7 m a AE 101, quand la mesure en lisait 2,4 a 3 m) ; sans elle, un pignon detecte qui y
// commence est garde (ses bords) ; sinon sa largeur se lit sur la mesure, depuis le bout, la ou elle
// depasse le pan de SURPLUS_PIGNON_FAIT_M (la moitie du seuil de la detection : le doute sur
// l'existence est leve) ; a defaut, la largeur de l'autre pignon de la facade. `haut: 'faitage'` les
// monte au point haut du faitage du corps, jusqu'a lui. Un pignon que le fait pose ou elargit fait
// reajuster le pan sans ses mesures, comme la detection.

import { ajusterCorps, empreintePignon, hauteurCorps, point, repere } from './toitCorps.js';
import { facadeDesignee } from './appentisFait.js';
import { hauteurToitMesure } from '../model/toitMesure.js';
import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../model/reglagesToits.js';
import { au } from '../util/tableaux.js';
import type { PignonsFait } from '../model/faitsToits.js';
import type { CorpsToit, PignonToit, PtBrut, ToitMesure } from '../model/types.js';

/** Un pignon detecte est a un bout de la facade quand son bord commence a moins de cela du bout. */
export const BOUT_PIGNON_FAIT_M = R.BOUT_PIGNON_FAIT_M;
/** Le surplus au-dessus du pan qui delimite la largeur d'un pignon vu par le proprietaire. */
export const SURPLUS_PIGNON_FAIT_M = R.SURPLUS_PIGNON_FAIT_M;

/** Le pas de lecture le long du mur, a 50 cm en retrait, comme la detection. */
const PAS_M = 0.5;
/** Deux pignons aux deux bouts ne se rejoignent pas : chacun au plus cette part de la longueur. */
const PART_LONGUEUR_MAX = 0.45;

const cm = (v: number) => Math.round(v * 100) / 100;
const dixieme = (v: number) => Math.round(v * 10) / 10;
const aire = (pts: readonly PtBrut[]) => Math.abs(pts.reduce((s, p, i) => { const q = au(pts, (i + 1) % pts.length); return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

/** La largeur du pignon lue sur la mesure, depuis le bout `0` ou `L`, ou null si elle ne le lit pas. */
function largeurLue(m: ToitMesure, c: CorpsToit, pan: 0 | 1, depuisFin: boolean, max: number): number | null {
  const r = repere(c.pts);
  const t = pan === 0 ? PAS_M : r.W - PAS_M;
  const pan5 = hauteurCorps(c, r.W, t);
  let largeur = 0, trou = false;
  for (let d = PAS_M / 2; d < max; d += PAS_M) {
    const s = depuisFin ? r.L - d : d;
    const q = point(r, s, t);
    const z = hauteurToitMesure(m, q.x, q.y);
    if (z !== null && z - pan5 >= S.SURPLUS_PIGNON_FAIT_M) { largeur = d + PAS_M / 2; trou = false; continue; }
    // Une cellule manquee au milieu est toleree, comme a la detection.
    if (trou || largeur === 0) break;
    trou = true;
  }
  return largeur >= S.LARGEUR_PIGNON_MIN_M ? Math.min(largeur, max) : null;
}

/** La hauteur du pignon lue sur la mesure : le haut de ce qui depasse le long du mur, sous le faitage du corps. */
function hauteurLue(m: ToitMesure, c: CorpsToit, pan: 0 | 1, s0: number, s1: number): number {
  const r = repere(c.pts);
  const t = pan === 0 ? PAS_M : r.W - PAS_M;
  const zs: number[] = [];
  for (let s = s0 + PAS_M / 2; s < s1; s += PAS_M) { const q = point(r, s, t); const z = hauteurToitMesure(m, q.x, q.y); if (z !== null) zs.push(z); }
  zs.sort((a, b) => a - b);
  const haut = zs.length ? au(zs, Math.floor(zs.length * 0.75)) : c.faitage;
  return Math.min(c.faitage, haut);
}

/** Les pignons aux deux bouts du pan `pan` du corps, selon le fait ; le corps reajuste si l'un est ajoute. */
export function pignonsAuxBouts(c: CorpsToit, pan: 0 | 1, pf: PignonsFait, m: ToitMesure, contour: readonly PtBrut[]): CorpsToit {
  const r = repere(c.pts);
  // Un appentis n'a pas de faitage dont partirait un pignon, un plat non plus.
  if (c.posFaitage <= 0.01 || c.posFaitage >= r.W - 0.01 || c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M) return c;
  const largeurPan = pan === 0 ? c.posFaitage : r.W - c.posFaitage;
  const max = Math.min(S.LARGEUR_PIGNON_MAX_M, PART_LONGUEUR_MAX * r.L);
  const surCePan = c.pignons.filter((p) => p.pan === pan);
  const auDebut = surCePan.find((p) => p.debut <= S.BOUT_PIGNON_FAIT_M);
  const aLaFin = surCePan.find((p) => p.fin >= r.L - S.BOUT_PIGNON_FAIT_M && p !== auDebut);
  const bornes: { s0: number; s1: number; detecte: PignonToit | undefined }[] = [];
  for (const depuisFin of [false, true]) {
    const detecte = depuisFin ? aLaFin : auDebut;
    // La largeur du fait l'emporte sur celle de la detection : le pignon est alors celui du fait.
    if (detecte && pf.largeurM === undefined) { bornes.push({ s0: detecte.debut, s1: detecte.fin, detecte }); continue; }
    const autre = depuisFin ? auDebut : aLaFin;
    const w = pf.largeurM !== undefined ? Math.min(max, pf.largeurM) : largeurLue(m, c, pan, depuisFin, max) ?? (autre ? Math.min(max, autre.fin - autre.debut) : null);
    // Sans mesure ni largeur, le fait ne fabrique pas un pignon : il le dira dans ses ecarts.
    if (w === null) continue;
    bornes.push(depuisFin ? { s0: r.L - w, s1: r.L, detecte: undefined } : { s0: 0, s1: w, detecte: undefined });
  }
  const gardes = c.pignons.filter((p) => p !== auDebut && p !== aLaFin);
  const poser = (corps: CorpsToit): PignonToit[] => bornes.map(({ s0, s1, detecte }) => {
    const e = corps.egouts[pan];
    const lp = pan === 0 ? corps.posFaitage : repere(corps.pts).W - corps.posFaitage;
    if (pf.haut === 'faitage') return { pan, debut: cm(s0), fin: cm(s1), faitage: dixieme(corps.faitage), profondeur: cm(lp) };
    if (detecte) return detecte;
    const P = hauteurLue(m, corps, pan, s0, s1);
    const rejoint = corps.faitage > e ? (lp * (P - e)) / (corps.faitage - e) : lp;
    return { pan, debut: cm(s0), fin: cm(s1), faitage: dixieme(P), profondeur: cm(rejoint) };
  });
  const ajoute = bornes.some((b) => !b.detecte);
  if (!ajoute) return { ...c, pignons: [...gardes, ...poser(c)] };
  // Le pan se relit sans les mesures des pignons, comme apres une detection (corpsAvecPignons).
  const provisoires: PignonToit[] = bornes.map(({ s0, s1 }) => ({ pan, debut: s0, fin: s1, faitage: c.faitage, profondeur: largeurPan }));
  const reajuste = ajusterCorps(m, c.pts, contour, [...gardes, ...provisoires].map((p) => empreintePignon(c, p)), true) ?? c;
  return { ...reajuste, pignons: [...gardes, ...poser(reajuste)] };
}

/**
 * Les corps avec les pignons que le fait place sur les facades de leur corps principal (le plus
 * grand). Une facade qui n'est pas un mur de pan (un mur de bout) ne porte pas de pignon traversant.
 */
export function avecPignons(pignons: readonly PignonsFait[] | undefined, corps: CorpsToit[] | null, m: ToitMesure, contour: readonly PtBrut[]): CorpsToit[] | null {
  if (!pignons?.length || !corps?.length) return corps;
  const out = [...corps];
  const k = out.reduce((best, c, i) => (aire(c.pts) > aire(au(out, best).pts) ? i : best), 0);
  for (const pf of pignons) {
    const c = au(out, k);
    const f = facadeDesignee([c], contour, pf.facade.azimutDeg, pf.facade.toleranceDeg);
    if (!f || (f.cote !== 0 && f.cote !== 2)) continue;
    out[k] = pignonsAuxBouts(c, f.cote === 0 ? 0 : 1, pf, m, contour);
  }
  return out;
}

/** Les pignons de la facade que les corps n'ont pas aux deux bouts (vide : le fait est tenu). */
export function pignonsManquants(pf: PignonsFait, principal: CorpsToit, contour: readonly PtBrut[]): number {
  const f = facadeDesignee([principal], contour, pf.facade.azimutDeg, pf.facade.toleranceDeg);
  if (!f || (f.cote !== 0 && f.cote !== 2)) return 2;
  const pan = f.cote === 0 ? 0 : 1, L = repere(principal.pts).L;
  const ici = principal.pignons.filter((p) => p.pan === pan);
  return (ici.some((p) => p.debut <= S.BOUT_PIGNON_FAIT_M) ? 0 : 1) + (ici.some((p) => p.fin >= L - S.BOUT_PIGNON_FAIT_M) ? 0 : 1);
}
