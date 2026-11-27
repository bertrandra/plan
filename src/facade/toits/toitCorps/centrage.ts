// Un toit est symetrique sauf preuve du contraire, et son faitage est le haut du toit (MD/spec-toit-ign.md §13.9).
// Un morceau de facade/toits/toitCorps.ts : la derniere question posee au toit d'un corps, apres le modele et les formes.
//
// Le principe (le proprietaire, 27 novembre 2026 : « la forme du toit est de la meme hauteur a gauche et a droite, et faitage
// centre, je ne comprends pas ce que tu fais avec le lidar ! ») : un toit a son faitage dans l'axe de son corps et le meme egout
// des deux cotes. Le LiDAR sert a ce qu'il mesure bien : les hauteurs (l'egout, le faitage), le sens du faitage et la forme
// (deux pans, croupes, plat, un pan). Le modele des corps (ajustement.ts), lui, liberait la place du faitage et chaque egout :
// il ajustait le bruit, la vegetation, le toit du voisin et surtout un contour de la BD TOPO trace a cote du toit. Et comme il
// ecarte ce qui depasse le pan (c'est ainsi qu'il voit les pignons), il s'ecrasait : sur un quatre-pans ou un pavillon, un toit
// bas au faitage pousse contre un mur collait mieux a SON ecart qu'un toit juste (Le Vesinet : 34 corps sur 105 a plus de 50 cm
// de l'axe, souvent 1 a 3 m).
//
// Un toit asymetrique (faitage hors de l'axe, egouts differents, un seul pan) est donc l'exception, que la mesure PROUVE :
//   - il colle nettement mieux que le toit symetrique, a l'ecart symetrique (GAIN_ASYMETRIQUE) ;
//   - pour deux pans : la crete se lit la ou il met le faitage, tout le long du corps ; la difference de ses egouts se lit le
//     long des deux murs, tout le long du corps ; et le contour est bien pose sur le toit - au-dela du mur de son egout haut, le
//     toit ne continue pas (sinon ce n'est pas un toit asymetrique, c'est un toit symetrique dont on ne voit qu'un morceau).
// Sans cette preuve, le toit symetrique l'emporte. Et un toit dont le faitage reste loin sous le haut mesure, quand un autre
// l'atteint en collant mieux, est un toit ecrase : l'autre l'emporte, pignons compris - un pignon ne porte pas le toit.

import { au } from '../../../util/tableaux.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../model/types.js';
import { SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import { cm, corpsImpose, detecterPignons, dixieme, empreintePignon, mesuresDans, penteMaxRad, point, repere, tourne, type Grille, type Mesure, type Repere } from './ajustement.js';

/** La crete d'un toit lue sur la mesure : ou elle passe dans la largeur, sa dispersion d'un profil a l'autre, le nombre de profils. */
export interface Crete { t: number; dispersion: number; profils: number }

const mediane = (v: readonly number[]): number => { const t = [...v].sort((a, b) => a - b); return t[Math.floor(t.length / 2)] ?? 0; };
/** Les cellules a moins de cela du plus haut d'un profil sont sa crete : le pas de 50 cm arrondit le faitage sur deux cellules. */
const SOMMET_M = 0.15;
/** Un profil en travers a au moins tant de mesures. */
const MESURES_PAR_PROFIL = 4;
/** L'egout d'un profil se lit sur les mesures a moins de cela de son mur. */
const BANDE_EGOUT_M = 1;

/** Les mesures par profil en travers : une tranche d'un pas de la mesure le long du faitage. */
function profils(ms: readonly Mesure[], pas: number): Mesure[][] {
  const tranches = new Map<number, Mesure[]>();
  for (const q of ms) { const k = Math.round(q.s / pas); const t = tranches.get(k); if (t) t.push(q); else tranches.set(k, [q]); }
  return [...tranches.values()].filter((v) => v.length >= MESURES_PAR_PROFIL);
}

/**
 * La crete mesuree d'un corps : par profil en travers, la ou la mesure est la plus haute ; la mediane de ces positions et leur
 * dispersion (l'ecart absolu median). Un profil sans relief (moins de CRETE_RELIEF_MIN_M entre son haut et son bas) ne dit
 * rien : un toit plat, une bande de pan. Null sans profil lisible.
 */
export function creteMesuree(ms: readonly Mesure[], pas: number): Crete | null {
  const positions: number[] = [];
  for (const v of profils(ms, pas)) {
    const zs = v.map((q) => q.z), haut = Math.max(...zs);
    if (haut - Math.min(...zs) < S.CRETE_RELIEF_MIN_M) continue;
    const sommet = v.filter((q) => q.z >= haut - SOMMET_M);
    positions.push(sommet.reduce((a, q) => a + q.t, 0) / sommet.length);
  }
  if (!positions.length) return null;
  const t = mediane(positions);
  return { t, dispersion: mediane(positions.map((x) => Math.abs(x - t))), profils: positions.length };
}

/**
 * La difference des egouts lue le long des deux murs : par profil en travers, la mediane des mesures a moins de BANDE_EGOUT_M du
 * mur t = W moins celle du mur t = 0. Rend la mediane de ces differences, la part des profils qui vont dans son sens d'au moins
 * EGOUTS_EGAUX_M, et leur nombre. Null sans profil lisible des deux cotes.
 */
export function egoutsMesures(ms: readonly Mesure[], W: number, pas: number): { difference: number; accord: number; profils: number } | null {
  const diffs: number[] = [];
  for (const v of profils(ms, pas)) {
    const bas = v.filter((q) => q.t <= BANDE_EGOUT_M).map((q) => q.z), haut = v.filter((q) => q.t >= W - BANDE_EGOUT_M).map((q) => q.z);
    if (bas.length && haut.length) diffs.push(mediane(haut) - mediane(bas));
  }
  if (!diffs.length) return null;
  const d = mediane(diffs);
  return { difference: d, accord: diffs.filter((x) => Math.sign(x) === Math.sign(d) && Math.abs(x) >= S.EGOUTS_EGAUX_M).length / diffs.length, profils: diffs.length };
}

/** Le haut mesure d'un corps : le 95e centile de ses mesures (une cheminee, un reste d'arbre ne font pas le toit). */
export function hautMesure(ms: readonly Mesure[]): number {
  const t = ms.map((q) => q.z).sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor(0.95 * t.length))] ?? 0;
}

/**
 * La part du mur `cote` (t = 0 ou t = W) au-dela duquel le toit continue : a TOIT_DEHORS_M du mur, dehors, la grille voit encore
 * du bati (HAUTEUR_BATIE_M) - le toit qui deborde d'un contour trace a cote, ou celui du batiment mitoyen. Devant un vrai mur de
 * facade, c'est le sol. Null sans grille ou sans mesure dehors : rien ne le dit.
 */
export function toitDehors(g: Grille | null, r: Repere, cote: 0 | 1): number | null {
  if (!g) return null;
  const t = cote === 0 ? -S.TOIT_DEHORS_M : r.W + S.TOIT_DEHORS_M;
  let n = 0, haut = 0;
  for (let s = g.pas / 2; s < r.L; s += g.pas) {
    const q = point(r, s, t), i = Math.round((q.x - g.x0) / g.pas), j = Math.round((g.y0 - q.y) / g.pas);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
    n++;
    if ((g.z[j * g.nx + i] ?? 0) >= S.HAUTEUR_BATIE_M) haut++;
  }
  return n ? haut / n : null;
}

/** Pourquoi un toit a deux pans asymetrique n'est pas prouve ; null : il l'est. Pour le banc, qui le dit corps par corps. */
export function sansPreuveDAsymetrie(c: CorpsToit, ms: readonly Mesure[], pas: number, grille: Grille | null, gain: boolean): string | null {
  const r = repere(c.pts);
  if (!gain) return 'ne colle pas nettement mieux que le toit symetrique';
  if (Math.abs(c.posFaitage - r.W / 2) >= S.DECENTRAGE_MIN_M) {
    const crete = creteMesuree(ms, pas);
    if (!crete || crete.profils < S.CRETE_PROFILS_MIN || crete.dispersion > S.CRETE_DISPERSION_MAX_M) return 'la crete ne se lit pas nettement';
    if (Math.abs(crete.t - c.posFaitage) > S.CRETE_ACCORD_M) return 'la crete se lit ailleurs que le faitage';
  }
  const eg = egoutsMesures(ms, r.W, pas), ecart = c.egouts[1] - c.egouts[0];
  if (Math.abs(ecart) < S.EGOUTS_DIFFERENTS_M) return 'ses egouts ne different pas assez';
  if (!eg || eg.profils < S.CRETE_PROFILS_MIN || Math.sign(eg.difference) !== Math.sign(ecart) || Math.abs(eg.difference) < S.EGOUTS_DIFFERENTS_M || eg.accord < S.PART_PROFILS_ACCORD) return 'la difference de ses egouts ne se lit pas le long des murs';
  const cote: 0 | 1 = ecart > 0 ? 1 : 0;
  if ((toitDehors(grille, r, cote) ?? 0) > S.PART_TOIT_DEHORS_MAX) return 'le toit continue au-dela du mur de son egout haut';
  return null;
}

/**
 * Un toit a un pan est prouve quand il colle nettement mieux que le toit symetrique (GAIN_ASYMETRIQUE), ou quand la mesure monte
 * d'un mur a l'autre tout le long du corps : sa crete se lit, nettement, contre le mur haut (a PAN_MIN_M pres), et il colle au
 * moins aussi bien. Un appentis s'adosse souvent a un toit plus haut, qui continue derriere son mur : on ne regarde pas dehors.
 * Les toits a un pan des maisons de village provencales (Gordes 16860179 : 9 % de mieux seulement, sur une mesure bruitee).
 */
function unPanLu(c: CorpsToit, ms: readonly Mesure[], pas: number, aussiBien: boolean): boolean {
  if (!aussiBien) return false;
  const W = repere(c.pts).W, eg = egoutsMesures(ms, W, pas);
  if (!eg || eg.profils < S.CRETE_PROFILS_MIN || eg.accord < S.PART_PROFILS_ACCORD || Math.abs(eg.difference) < S.EGOUTS_DIFFERENTS_M) return false;
  return (eg.difference > 0) === (c.posFaitage > 0.01);
}

/**
 * Le toit symetrique du rectangle `pts` : le faitage au milieu de sa largeur, le meme egout des deux cotes (la moyenne des deux
 * egouts ajustes), pignons detectes puis toit reajuste sans leurs mesures. Null quand rien ne s'ajuste ou que ce n'est plus un toit.
 */
export function toitSymetrique(m: ToitMesure, pts: readonly PtBrut[], contour: readonly PtBrut[]): CorpsToit | null {
  const milieu = repere(pts).W / 2;
  const egal = (c: CorpsToit | null): CorpsToit | null => {
    if (!c) return null;
    const e = dixieme((c.egouts[0] + c.egouts[1]) / 2);
    if (c.faitage - e < S.HAUTEUR_PLAT_M || (c.faitage - e) / milieu > Math.tan(penteMaxRad())) return null;
    return { ...c, egouts: [e, e] };
  };
  const premier = egal(corpsImpose(m, pts, contour, milieu));
  if (!premier) return null;
  const pignons = detecterPignons(m, premier, contour);
  if (!pignons.length) return premier;
  const c = egal(corpsImpose(m, pts, contour, milieu, pignons.map((p) => empreintePignon(premier, p)))) ?? premier;
  const relus = detecterPignons(m, c, contour);
  return { ...c, pignons: relus.length ? relus : c === premier ? pignons : [] };
}

/** Un toit essaye : son ecart symetrique a la mesure, et s'il vient des formes simples (son `ecart` est alors cet ecart-la). */
interface Essai { x: CorpsToit; e: number; formes?: boolean }
/** Le corps d'un essai retenu. Un modele garde l'ecart de son ajustement, comme tous les corps du modele ; une lecture des formes porte l'ecart symetrique, comme partout ou elle l'emporte (toitCorps.ts). */
const retenu = (k: Essai): CorpsToit => (k.formes ? { ...k.x, ecart: cm(k.e) } : k.x);

/** Le modele symetrique ou la lecture des formes, sur un meme rectangle et dans un meme sens (voir `symetriqueSaufPreuve`). */
function meilleurDesDeux(modele: Essai | null, formes: Essai | null): Essai | null {
  if (!modele || !formes) return modele ?? formes;
  if (formes.e < S.GAIN_CROUPES * modele.e) return formes;
  return formes.x.croupes && !modele.x.pignons.length && formes.e <= S.TOLERANCE_CROUPES_CENTRE * modele.e ? formes : modele;
}

const plat = (c: CorpsToit): boolean => c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M;
const unPan = (c: CorpsToit, W: number): boolean => c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01;
const memeSens = (a: readonly PtBrut[], b: readonly PtBrut[]): boolean => { const ra = repere(a), rb = repere(b); return Math.abs(ra.u.x * rb.u.x + ra.u.y * rb.u.y) >= Math.SQRT1_2; };

/** Un corps asymetrique : un seul pan, un faitage a DECENTRAGE_MIN_M ou plus de l'axe, des egouts qui different d'EGOUTS_EGAUX_M ou plus. Un toit plat ne l'est pas. */
export function estAsymetrique(c: CorpsToit): boolean {
  const W = repere(c.pts).W;
  return !plat(c) && (unPan(c, W) || Math.abs(c.posFaitage - W / 2) >= S.DECENTRAGE_MIN_M || Math.abs(c.egouts[0] - c.egouts[1]) >= S.EGOUTS_EGAUX_M);
}

/**
 * Le toit d'un corps, symetrique sauf preuve du contraire, et releve s'il est ecrase. `c` : le toit retenu jusque-la (le modele
 * des corps, ou les formes) ; `formes` : la lecture des formes simples sur le meme rectangle, s'il y en a une ; `ecart` : l'ecart
 * symetrique d'un corps a la mesure (toitCorps.ts::ecartAuCorps), le seul qui departage deux lectures ; `grille` : la grille
 * brute, qui voit au-dela du contour.
 *
 * Les toits essayes en face de `c` : le toit symetrique du modele (`toitSymetrique`), ou celui des formes (symetrique par
 * construction) quand il colle nettement mieux ou lit des croupes ; et les memes dans l'autre sens, s'ils collent nettement
 * mieux (GAIN_SENS). Un toit a un pan lu par les formes reste un essai : c'est aux formes de dire « un pan ».
 */
export function symetriqueSaufPreuve(m: ToitMesure, contour: readonly PtBrut[], c: CorpsToit | null, formes: CorpsToit | null, ecart: (x: CorpsToit) => number, grille: Grille | null = null): CorpsToit | null {
  if (!c || plat(c)) return c;
  const r = repere(c.pts);
  const ms = mesuresDans(m, r, c.pts, contour);
  if (ms.length < S.MESURES_MIN) return c;
  const asymetrique = estAsymetrique(c);
  const haut = hautMesure(ms), ecrase = haut - c.faitage >= S.ECRASEMENT_M;
  if (!asymetrique && !ecrase) return c;
  const ec = ecart(c);
  // Face a un toit a un pan, un autre toit a un pan n'est pas un essai : la question posee ici est « un pan ou deux », pas « lequel ».
  const unPanAussi = (x: CorpsToit): boolean => unPan(c, r.W) && unPan(x, repere(x.pts).W);
  // Et un toit ecrase sous le haut mesure n'en remplace pas un qui l'atteint : le faitage est le haut du toit (Gordes 38818671).
  const ecraseLui = (x: CorpsToit): boolean => !ecrase && haut - x.faitage >= S.ECRASEMENT_M;
  const essai = (x: CorpsToit | null, desFormes = false): Essai | null => (x && !plat(x) && !unPanAussi(x) && !ecraseLui(x) ? { x, e: ecart(x), formes: desFormes } : null);
  const dansLeSens = (x: CorpsToit | null): boolean => !!x && memeSens(x.pts, c.pts);
  const modele = essai(toitSymetrique(m, c.pts, contour)), lues = essai(dansLeSens(formes) ? formes : null, true);
  const essais = [meilleurDesDeux(modele, lues)].filter((k): k is Essai => k !== null);
  // L'autre sens ne se prend pas pour quelques centimetres : la meme prudence que pour le sens des formes (GAIN_SENS).
  const modeleT = essai(toitSymetrique(m, tourne(c.pts), contour)), luesT = essai(formes && !dansLeSens(formes) ? formes : null, true);
  const travers = meilleurDesDeux(modeleT, luesT);
  if (travers && travers.e < S.GAIN_SENS * Math.min(ec, ...essais.map((k) => k.e))) essais.push(travers);
  if (!essais.length) return c;
  essais.sort((a, b) => a.e - b.e);
  const mieux = au(essais, 0);
  if (asymetrique) {
    const gain = ec < S.GAIN_ASYMETRIQUE * mieux.e;
    const prouve = unPan(c, r.W) ? gain || unPanLu(c, ms, m.pas, ec <= mieux.e) : sansPreuveDAsymetrie(c, ms, m.pas, grille, gain) === null;
    if (!prouve) return retenu(mieux);
  }
  if (ecrase) {
    // Tous les toits essayes, pas seulement le meilleur de chaque sens : celui qui atteint le haut est souvent celui des formes.
    const releve = [modele, lues, modeleT, luesT].filter((k): k is Essai => k !== null && k.x.faitage >= c.faitage + S.RELEVE_MIN_M).sort((a, b) => a.e - b.e)[0];
    if (releve && releve.e <= S.GAIN_ECRASE * ec) return retenu(releve);
  }
  return c;
}
