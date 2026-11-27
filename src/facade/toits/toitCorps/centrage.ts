// Le faitage est le haut du toit, et il est au milieu sauf preuve du contraire (MD/spec-toit-ign.md §13.9).
// Un morceau de facade/toits/toitCorps.ts : la derniere question posee au toit d'un corps, apres le modele et les formes.
//
// Le modele des corps (ajustement.ts) ecarte ce qui depasse le pan : c'est ainsi qu'il voit les pignons, et c'est ainsi qu'il
// s'ecrase. Sur un quatre-pans, un pavillon ou un deux-pans a lucarnes, un toit bas au faitage pousse contre un mur colle mieux a
// SON ecart qu'un toit juste, parce que le vrai toit, qui depasse, n'y compte presque pas (Le Vesinet, 27 novembre 2026 : 34 corps
// sur 105 a plus de 50 cm de l'axe, souvent 1 a 3 m ; « je vois beaucoup de toits ou le faitage n'est pas centre », le proprietaire).
//
// La regle du couvreur : deux pans ont la meme pente et se rejoignent au milieu. Un faitage hors de l'axe se prouve, par trois
// choses a la fois : la crete se lit sur la mesure la ou le modele la met ; les deux pans ont la meme pente (le grand pan descend
// alors plus bas : un vrai toit asymetrique) ; et aucun toit centre ne colle mieux, a l'ecart symetrique. Sans cette preuve, le toit
// centre l'emporte des qu'il tient la mesure. Et un toit dont le faitage reste loin sous le haut mesure, quand un autre l'atteint
// en collant mieux, est un toit ecrase : l'autre l'emporte, pignons compris - un pignon ne porte pas le toit.

import { au } from '../../../util/tableaux.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../model/types.js';
import { SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import { cm, corpsImpose, detecterPignons, empreintePignon, mesuresDans, repere, tourne, type Mesure } from './ajustement.js';

/** La crete d'un toit lue sur la mesure : ou elle passe dans la largeur, sa dispersion d'un profil a l'autre, le nombre de profils. */
export interface Crete { t: number; dispersion: number; profils: number }

const mediane = (v: readonly number[]): number => { const t = [...v].sort((a, b) => a - b); return t[Math.floor(t.length / 2)] ?? 0; };
/** Les cellules a moins de cela du plus haut d'un profil sont sa crete : le pas de 50 cm arrondit le faitage sur deux cellules. */
const SOMMET_M = 0.15;
/** Un profil en travers a au moins tant de mesures. */
const MESURES_PAR_PROFIL = 4;

/**
 * La crete mesuree d'un corps : par profil en travers (une tranche d'un pas de la mesure le long du faitage), la ou la mesure est
 * la plus haute ; la mediane de ces positions et leur dispersion (l'ecart absolu median). Un profil sans relief (moins de
 * CRETE_RELIEF_MIN_M entre son haut et son bas) ne dit rien : un toit plat, une bande de pan. Null sans profil lisible.
 */
export function creteMesuree(ms: readonly Mesure[], pas: number): Crete | null {
  const tranches = new Map<number, Mesure[]>();
  for (const q of ms) { const k = Math.round(q.s / pas); const t = tranches.get(k); if (t) t.push(q); else tranches.set(k, [q]); }
  const positions: number[] = [];
  for (const v of tranches.values()) {
    if (v.length < MESURES_PAR_PROFIL) continue;
    const zs = v.map((q) => q.z), haut = Math.max(...zs);
    if (haut - Math.min(...zs) < S.CRETE_RELIEF_MIN_M) continue;
    const sommet = v.filter((q) => q.z >= haut - SOMMET_M);
    positions.push(sommet.reduce((a, q) => a + q.t, 0) / sommet.length);
  }
  if (!positions.length) return null;
  const t = mediane(positions);
  return { t, dispersion: mediane(positions.map((x) => Math.abs(x - t))), profils: positions.length };
}

/** Le haut mesure d'un corps : le 95e centile de ses mesures (une cheminee, un reste d'arbre ne font pas le toit). */
export function hautMesure(ms: readonly Mesure[]): number {
  const t = ms.map((q) => q.z).sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor(0.95 * t.length))] ?? 0;
}

/** Les deux pans d'un corps ont la meme pente, a RAPPORT_PENTES_EGALES pres : la marque d'un vrai toit asymetrique, dont le grand pan descend plus bas. */
export function pentesEgales(c: Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'>, W: number): boolean {
  const p = c.posFaitage;
  if (p <= 0.01 || p >= W - 0.01) return false;
  const a = (c.faitage - c.egouts[0]) / p, b = (c.faitage - c.egouts[1]) / (W - p);
  if (a <= 0 || b <= 0) return false;
  return Math.max(a, b) / Math.min(a, b) <= S.RAPPORT_PENTES_EGALES;
}

/** Le toit du rectangle `pts` au faitage impose au milieu de sa largeur, pignons detectes puis toit reajuste sans eux. */
function centreAvecPignons(m: ToitMesure, pts: readonly PtBrut[], contour: readonly PtBrut[]): CorpsToit | null {
  const milieu = repere(pts).W / 2;
  const premier = corpsImpose(m, pts, contour, milieu);
  if (!premier) return null;
  const pignons = detecterPignons(m, premier, contour);
  if (!pignons.length) return premier;
  const c = corpsImpose(m, pts, contour, milieu, pignons.map((p) => empreintePignon(premier, p))) ?? premier;
  const relus = detecterPignons(m, c, contour);
  return { ...c, pignons: relus.length ? relus : c === premier ? pignons : [] };
}

/** Un toit essaye : son ecart symetrique a la mesure, et s'il vient des formes simples (son `ecart` est alors cet ecart-la). */
interface Essai { x: CorpsToit; e: number; formes?: boolean }
/** Le corps d'un essai retenu. Un modele garde l'ecart de son ajustement, comme tous les corps du modele ; une lecture des formes porte l'ecart symetrique, comme partout ou elle l'emporte (toitCorps.ts). */
const retenu = (k: Essai): CorpsToit => (k.formes ? { ...k.x, ecart: cm(k.e) } : k.x);

/** Le modele recentre ou la lecture des formes, sur un meme rectangle et dans un meme sens (voir `centreSaufPreuve`). */
function meilleurDesDeux(modele: Essai | null, formes: Essai | null): Essai | null {
  if (!modele || !formes) return modele ?? formes;
  if (formes.e < S.GAIN_CROUPES * modele.e) return formes;
  return formes.x.croupes && !modele.x.pignons.length && formes.e <= S.TOLERANCE_CROUPES_CENTRE * modele.e ? formes : modele;
}

const plat = (c: CorpsToit): boolean => c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M;
const memeSens = (a: readonly PtBrut[], b: readonly PtBrut[]): boolean => { const ra = repere(a), rb = repere(b); return Math.abs(ra.u.x * rb.u.x + ra.u.y * rb.u.y) >= Math.SQRT1_2; };

/**
 * Le toit d'un corps, centre sauf preuve du contraire, et releve s'il est ecrase. `c` : le toit retenu jusque-la (le modele des
 * corps, ou les formes) ; `formes` : la lecture des formes simples sur le meme rectangle, s'il y en a une ; `ecart` : l'ecart
 * symetrique d'un corps a la mesure (toitCorps.ts::ecartAuCorps), le seul qui departage deux lectures.
 *
 * Les toits essayes en face de `c` : le meme modele au faitage impose au milieu, ou celui des formes (centre par construction,
 * ou a un pan) quand il colle nettement mieux ; et les memes dans l'autre sens, s'ils collent nettement mieux (GAIN_SENS).
 */
export function centreSaufPreuve(m: ToitMesure, contour: readonly PtBrut[], c: CorpsToit | null, formes: CorpsToit | null, ecart: (x: CorpsToit) => number): CorpsToit | null {
  if (!c || plat(c)) return c;
  const r = repere(c.pts);
  const ms = mesuresDans(m, r, c.pts, contour);
  if (ms.length < S.MESURES_MIN) return c;
  const unPan = c.posFaitage <= 0.01 || c.posFaitage >= r.W - 0.01;
  const decentre = !unPan && Math.abs(c.posFaitage - r.W / 2) >= S.DECENTRAGE_MIN_M;
  const ecrase = hautMesure(ms) - c.faitage >= S.ECRASEMENT_M;
  if (!decentre && !ecrase) return c;
  const ec = ecart(c);
  const essai = (x: CorpsToit | null, desFormes = false): Essai | null => (x && !plat(x) ? { x, e: ecart(x), formes: desFormes } : null);
  const dansLeSens = (x: CorpsToit | null): boolean => !!x && memeSens(x.pts, c.pts);
  // Dans le sens du corps : le meme toit, recentre ; les formes ne le remplacent que si elles collent nettement mieux
  // (GAIN_CROUPES, la regle des croupes) - ses pignons sont lus, on ne les perd pas pour quelques centimetres (AE 101) - ou,
  // sans pignon, si elles y lisent des croupes a TOLERANCE_CROUPES_CENTRE pres.
  const modele = essai(centreAvecPignons(m, c.pts, contour)), lues = essai(dansLeSens(formes) ? formes : null, true);
  const essais = [meilleurDesDeux(modele, lues)].filter((k): k is Essai => k !== null);
  // L'autre sens ne se prend pas pour quelques centimetres : la meme prudence que pour le sens des formes (GAIN_SENS).
  const modeleT = essai(centreAvecPignons(m, tourne(c.pts), contour)), luesT = essai(formes && !dansLeSens(formes) ? formes : null, true);
  const travers = meilleurDesDeux(modeleT, luesT);
  if (travers && travers.e < S.GAIN_SENS * Math.min(ec, ...essais.map((k) => k.e))) essais.push(travers);
  if (!essais.length) return c;
  essais.sort((a, b) => a.e - b.e);
  const mieux = au(essais, 0);
  if (decentre) {
    const crete = creteMesuree(ms, m.pas);
    const nette = !!crete && crete.profils >= S.CRETE_PROFILS_MIN && crete.dispersion <= S.CRETE_DISPERSION_MAX_M;
    const prouve = nette && Math.abs((crete?.t ?? 0) - c.posFaitage) <= S.CRETE_ACCORD_M && pentesEgales(c, r.W) && ec <= mieux.e;
    if (prouve) return c;
    if (mieux.e <= S.TOLERANCE_CENTRE * ec + S.TOLERANCE_CENTRE_M) return retenu(mieux);
  }
  if (ecrase) {
    // Tous les toits essayes, pas seulement le meilleur de chaque sens : celui qui atteint le haut est souvent celui des formes.
    const haut = [modele, lues, modeleT, luesT].filter((k): k is Essai => k !== null && k.x.faitage >= c.faitage + S.RELEVE_MIN_M).sort((a, b) => a.e - b.e)[0];
    if (haut && haut.e <= S.GAIN_ECRASE * ec) return retenu(haut);
  }
  return c;
}
