// Les pignons traversants qu'un fait place sur une facade, sur le corps qui la porte (MD/spec-regles-toits.md
// §5.1) : « deux pignons, a gauche et a droite de la facade sud, qui montent au point haut du
// faitage » (le proprietaire d'AE 101, 14 octobre 2026). Depuis le lot F4 (MD/spec-facade-calage-audit.md §5 ter), n'importe
// quel corps : celui dont le mur est designe (une proposition de l'audit, par murDuCorps), sinon celui dont un cote en facade du
// contour regarde vers l'azimut du fait, le plus long (un fait du depot) ; plus de corps principal suppose.
//
// Pourquoi un fait : la detection seule (facade/toits/toitCorps.ts::detecterPignons) depend de la mesure, et
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

import { ajusterCorps, empreintePignon, hauteurCorps, point, repere } from '../../toits/toitCorps.js';
import { facadeDesignee } from './appentis.js';
import { murDuCorps } from './murDuCorps.js';
import { hauteurToitMesure } from '../../../model/toitMesure.js';
import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import { au } from '../../../util/tableaux.js';
import type { BoutDeMurFait, PignonsFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, PignonToit, PtBrut, ToitMesure } from '../../../model/types.js';

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
 * Un pignon traversant sur le pan `pan` du corps, de `s0` a `s1` le long du faitage : le triangle qu'une photo voit sur un mur
 * de long pan, en travers du faitage que disent les autres murs du corps (decision de l'utilisateur, 19 octobre 2026 : « deux
 * murs voisins d'un meme corps montrent chacun un triangle : le plus large dit le faitage, l'autre est un pignon traversant »).
 * Il monte au faitage du corps, comme un pignon que dit un fait (`haut: 'faitage'`) : sa hauteur lue le long du mur est celle de
 * ses rampants, pas de sa pointe (AE 101, cote 13 : 3,6 m lus, quand la photo montre la pointe a la hauteur du faitage). Le pan
 * se reajuste sans ses mesures quand il en reste assez, comme pour un pignon detecte. Un pignon deja la, sur la moitie du
 * morceau au moins, est garde tel quel.
 */
export function pignonTraversant(c: CorpsToit, pan: 0 | 1, s0: number, s1: number, m: ToitMesure, contour: readonly PtBrut[]): CorpsToit {
  const r = repere(c.pts);
  if (c.posFaitage <= 0.01 || c.posFaitage >= r.W - 0.01 || c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M) return c;
  const a = Math.max(0, Math.min(s0, s1)), b = Math.min(r.L, Math.max(s0, s1));
  if (b - a < S.LARGEUR_PIGNON_MIN_M) return c;
  if (c.pignons.some((p) => p.pan === pan && Math.min(p.fin, b) - Math.max(p.debut, a) >= 0.5 * (b - a))) return c;
  const largeurPan = pan === 0 ? c.posFaitage : r.W - c.posFaitage;
  const provisoire: PignonToit = { pan, debut: a, fin: b, faitage: c.faitage, profondeur: largeurPan };
  // Un pignon qui prend plus que PART_LONGUEUR_MAX du pan ne laisse pas assez de mesure pour le relire : le pan reste tel que lu.
  const reajuste = b - a <= PART_LONGUEUR_MAX * r.L ? (ajusterCorps(m, c.pts, contour, [...c.pignons, provisoire].map((p) => empreintePignon(c, p)), true) ?? c) : c;
  const lp = pan === 0 ? reajuste.posFaitage : repere(reajuste.pts).W - reajuste.posFaitage;
  return { ...reajuste, pignons: [...c.pignons, { pan, debut: cm(a), fin: cm(b), faitage: dixieme(reajuste.faitage), profondeur: cm(lp) }] };
}

/** Une place de pignon le long du faitage d'un corps, de `debut` a `fin` (metres depuis `pts[0]`). */
export interface PlacePignon { debut: number; fin: number }

/** Un pignon deja la garde ses bords quand ceux d'une place en sont a moins de cela : la mesure les a lus, la photo les confirme. */
const BORDS_GARDES_M = 0.25;

/** Un corps sans faitage dont partirait un pignon : un appentis, un plat. */
const sansFaitage = (c: CorpsToit): boolean => { const W = repere(c.pts).W; return c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01 || c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M; };

/**
 * Exactement les pignons de `places` sur le pan `pan` du corps (lot F4 : ce que la photo d'un long pan montre, confirme par la
 * personne) : un pignon de plus, un de moins, deplace ou elargi. Chacun monte au faitage du corps, comme un pignon traversant
 * (`haut: 'faitage'`) ; le pan n'est pas relu : les hauteurs du corps restent celles du LiDAR (decision 12 de la spec, « la photo
 * ne change jamais une hauteur »). Un pignon deja la, aux bords d'une place a BORDS_GARDES_M pres, est garde tel quel ; une place
 * plus etroite que LARGEUR_PIGNON_MIN_M n'en fait pas un. Le corps tel quel quand rien ne change, ou sans faitage.
 */
export function pignonsAuxPlaces(c: CorpsToit, pan: 0 | 1, places: readonly PlacePignon[]): CorpsToit {
  if (sansFaitage(c)) return c;
  const r = repere(c.pts);
  const lp = pan === 0 ? c.posFaitage : r.W - c.posFaitage;
  const surCePan = c.pignons.filter((p) => p.pan === pan);
  const poses = places.map((p) => ({ a: Math.max(0, Math.min(p.debut, p.fin)), b: Math.min(r.L, Math.max(p.debut, p.fin)) }))
    .filter(({ a, b }) => b - a >= S.LARGEUR_PIGNON_MIN_M)
    .map(({ a, b }): PignonToit => surCePan.find((p) => Math.abs(p.debut - a) <= BORDS_GARDES_M && Math.abs(p.fin - b) <= BORDS_GARDES_M)
      ?? { pan, debut: cm(a), fin: cm(b), faitage: dixieme(c.faitage), profondeur: cm(lp) });
  if (poses.length === surCePan.length && poses.every((p) => surCePan.includes(p))) return c;
  return { ...c, pignons: [...c.pignons.filter((p) => p.pan !== pan), ...poses.sort((x, y) => x.debut - y.debut)] };
}

/**
 * Le bout d'un corps que montre son mur de bout (lot F4) : `croupe` pose une croupe a la pente des pans (la profondeur de la moitie
 * de la largeur, celle que le moteur essaie, faits.ts::candidatsDuSens), `pignon` la retire. Les hauteurs ne bougent pas. Le cote 3
 * est le bout `s = 0`, le cote 1 le bout `s = L` ; un long pan, un corps sans faitage, ou un corps plus large que long (des croupes
 * sur sa largeur se croiseraient), tel quel.
 */
export function boutAuMur(c: CorpsToit, cote: number, bout: 'pignon' | 'croupe'): CorpsToit {
  if ((cote !== 1 && cote !== 3) || sansFaitage(c)) return c;
  const r = repere(c.pts);
  if (bout === 'croupe' && r.L < r.W - 0.01) return c;
  const k = cote === 3 ? 0 : 1;
  const h = bout === 'croupe' ? cm(r.W / 2) : 0;
  const avant = c.croupes ?? [0, 0];
  if ((avant[k] ?? 0) === h) return c;
  const croupes: [number, number] = k === 0 ? [h, avant[1] ?? 0] : [avant[0] ?? 0, h];
  const sans: CorpsToit = { ...c };
  delete sans.croupes;
  return croupes[0] > 0 || croupes[1] > 0 ? { ...c, croupes } : sans;
}

/**
 * Le corps et le cote qui portent les pignons d'un fait : le mur designe, sinon le cote en facade qui regarde vers l'azimut, parmi les
 * corps qui ont un faitage dont partirait un pignon (l'appentis d'une galerie devant le grand pan, AE 101, a un cote aussi long que lui).
 */
function porteurDesPignons(corps: readonly CorpsToit[], pf: PignonsFait, contour: readonly PtBrut[]): { corps: number; cote: number } | null {
  if (pf.mur) return murDuCorps(corps, pf.mur.gauche, pf.mur.droite);
  const rangs = corps.flatMap((c, k) => (sansFaitage(c) ? [] : [k]));
  const f = facadeDesignee(rangs.map((k) => corps[k] as CorpsToit), contour, pf.facade.azimutDeg, pf.facade.toleranceDeg);
  const k = f ? rangs[f.corps] : undefined;
  return f && k !== undefined ? { corps: k, cote: f.cote } : null;
}

/** Les places d'un fait (en metres le long de son mur) ramenees le long du faitage du corps (metres depuis `pts[0]`). */
function placesSurLeCorps(c: CorpsToit, pf: PignonsFait): PlacePignon[] {
  const mur = pf.mur;
  if (!mur) return [];
  const r = repere(c.pts);
  const l = Math.hypot(mur.droite.x - mur.gauche.x, mur.droite.y - mur.gauche.y);
  if (!(l > 0)) return [];
  const s = (d: number) => { const q = { x: mur.gauche.x + ((mur.droite.x - mur.gauche.x) * d) / l, y: mur.gauche.y + ((mur.droite.y - mur.gauche.y) * d) / l }; return (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y; };
  return (pf.places ?? []).map((p) => { const a = s(p.de), b = s(p.a); return { debut: Math.min(a, b), fin: Math.max(a, b) }; });
}

/**
 * Les corps avec les pignons que le fait place sur une facade, sur le corps qui la porte (porteurDesPignons). Une facade qui n'est
 * pas un mur de pan (un mur de bout) ne porte pas de pignon traversant.
 */
export function avecPignons(pignons: readonly PignonsFait[] | undefined, corps: CorpsToit[] | null, m: ToitMesure, contour: readonly PtBrut[]): CorpsToit[] | null {
  if (!pignons?.length || !corps?.length) return corps;
  const out = [...corps];
  for (const pf of pignons) {
    const f = porteurDesPignons(out, pf, contour);
    const c = f ? out[f.corps] : undefined;
    if (!f || !c || (f.cote !== 0 && f.cote !== 2)) continue;
    const pan = f.cote === 0 ? 0 : 1;
    out[f.corps] = pf.position === 'places' ? pignonsAuxPlaces(c, pan, placesSurLeCorps(c, pf)) : pignonsAuxBouts(c, pan, pf, m, contour);
  }
  return out;
}

/** Les corps avec les bouts que montrent leurs murs de bout (lot F4), chacun sur le corps retrouve par son mur. */
export function avecBoutsDesMurs(bouts: readonly BoutDeMurFait[] | undefined, corps: CorpsToit[] | null): CorpsToit[] | null {
  if (!bouts?.length || !corps?.length) return corps;
  const out = [...corps];
  for (const b of bouts) {
    const m = murDuCorps(out, b.mur.gauche, b.mur.droite);
    const c = m ? out[m.corps] : undefined;
    if (m && c) out[m.corps] = boutAuMur(c, m.cote, b.bout);
  }
  return out;
}

/**
 * Les pignons de la facade que les corps n'ont pas (0 : le fait est tenu) : aux deux bouts (`bouts`), ou chacune des places
 * (`places`, un pignon qui la recouvre a moitie au moins), sur le corps qui porte la facade.
 */
export function pignonsManquants(pf: PignonsFait, corps: readonly CorpsToit[], contour: readonly PtBrut[]): number {
  const voulus = pf.position === 'places' ? (pf.places?.length ?? 0) : 2;
  const f = porteurDesPignons(corps, pf, contour);
  const c = f ? corps[f.corps] : undefined;
  if (!f || !c || (f.cote !== 0 && f.cote !== 2)) return voulus;
  const pan = f.cote === 0 ? 0 : 1, L = repere(c.pts).L;
  const ici = c.pignons.filter((p) => p.pan === pan);
  if (pf.position === 'places') return placesSurLeCorps(c, pf).filter((q) => !ici.some((p) => Math.min(p.fin, q.fin) - Math.max(p.debut, q.debut) >= 0.5 * (q.fin - q.debut))).length;
  return (ici.some((p) => p.debut <= S.BOUT_PIGNON_FAIT_M) ? 0 : 1) + (ici.some((p) => p.fin >= L - S.BOUT_PIGNON_FAIT_M) ? 0 : 1);
}
