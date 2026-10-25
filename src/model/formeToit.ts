// La forme d'ensemble d'un toit, deduite de ses corps (MD/spec-regles-toits.md §3.1, §4).
//
// La forme n'est pas saisie a part : elle decoule des corps (un corps a profil brise avec des brisis
// aux bouts est un Mansart ; avec des pignons, un gambrel). Une observation l'ecrit avec le meme
// vocabulaire (`formeDeLaVue`). Aucun calcul ne produit encore les formes du catalogue (vague 3b,
// une forme par PR) : ce module les nomme, et dit quelle forme simple la 3D dessine a leur place.
//
// Pur, sans reseau ni DOM : il ne lit que le corps et un seuil des reglages.

import { REGLAGES_TOITS as R } from '../regles/toits/reglages.js';
import type { FormeVue } from './ceQueJeVois.js';
import type { BoutToit, CorpsToit, FormeToit, FormeToitCatalogue, FormeToitSimple, PtBrut, Toit } from './types.js';

/** Les formes simples : les seules que le calcul produit et que la 3D dessine. */
export const FORMES_TOIT_SIMPLES: readonly FormeToitSimple[] = ['plat', 'appentis', 'deux-pans', 'quatre-pans', 'croupes'];

/**
 * Les formes du catalogue, et la forme simple que la 3D dessine a leur place tant qu'elle ne les
 * sait pas (spec §4 : « une forme que la 3D ne sait pas dessiner n'est pas produite par le calcul »).
 * Le choix suit la silhouette : ce qui ferme ses bouts par un pan (Mansart, pavillon, demi-croupe,
 * formes axiales) se dessine en croupes ; ce qui garde ses pignons, en deux pans ; le shed, un appentis ;
 * le papillon, plat (un faitage dessine la ou il y a un creux serait pire qu'un dessus plat).
 * Ce repli ne sert plus qu'aux toits simples (`Toit.forme`, sans corps) : un corps, lui, est dessine pour de bon par
 * facade/toits/toitFormes.ts et facade/toits/toitSpeciaux.ts (papillon, coyau, berceau, tourelles...).
 */
export const FORME_DESSINEE: Readonly<Record<FormeToitCatalogue, FormeToitSimple>> = {
  'demi-croupes': 'croupes',
  pavillon: 'croupes',
  mansart: 'croupes',
  gambrel: 'deux-pans',
  asymetrique: 'deux-pans',
  'deux-pans-decales': 'deux-pans',
  'toit-en-m': 'deux-pans',
  papillon: 'plat',
  coyau: 'deux-pans',
  shed: 'appentis',
  berceau: 'deux-pans',
  carene: 'deux-pans',
  conique: 'croupes',
  polygonal: 'croupes',
  fleche: 'croupes',
  dome: 'croupes',
  imperiale: 'croupes',
};

/** Toutes les formes du catalogue, dans l'ordre de la spec (§3.1). */
export const FORMES_TOIT_CATALOGUE = Object.keys(FORME_DESSINEE) as FormeToitCatalogue[];

/** Une forme simple ? */
export const estFormeSimple = (f: string): f is FormeToitSimple => (FORMES_TOIT_SIMPLES as readonly string[]).includes(f);
/** Une forme connue, simple ou du catalogue ? Pour verifier un fichier. */
export const estFormeToit = (f: unknown): f is FormeToit => typeof f === 'string' && (estFormeSimple(f) || f in FORME_DESSINEE);

/** La forme simple que la 3D dessine pour cette forme : elle-meme si elle est simple. */
export function formeDessinee(f: FormeToit): FormeToitSimple {
  return estFormeSimple(f) ? f : FORME_DESSINEE[f] ?? 'deux-pans';
}

/**
 * Le toit tel que la geometrie le dessine : le meme objet quand sa forme est simple (rien ne change,
 * pas meme une copie), sinon une copie a la forme simple la plus proche.
 */
export function toitDessine<T extends Toit>(toit: T): T {
  return estFormeSimple(toit.forme) ? toit : { ...toit, forme: formeDessinee(toit.forme) };
}

/* ------------------------------------------------------------------------------------------------
 * La forme d'un corps
 * --------------------------------------------------------------------------------------------- */

/**
 * Un quatre-pans dont le faitage fait moins de cela est un pavillon (spec §3.4, confusion 5) : un
 * sommet plutot qu'une arete. Ce n'est qu'un nom, le dessin est le meme.
 */
export const FAITAGE_PAVILLON_MAX_M = 1;
/** Et sur un plan presque carre : le long cote au plus 1,25 fois le court (un plan plus allonge garde une arete). */
export const RAPPORT_PAVILLON_MAX = 1.25;
/**
 * Un deux-pans dont le grand pan est au moins cette fois le petit est asymetrique (spec §3.1, n° 8, « saltbox ») : un faitage
 * decentre, un pan qui descend bien plus bas. Un nom, le dessin est le meme.
 */
export const RAPPORT_ASYMETRIQUE_MIN = 1.6;
/** Deux deux-pans accoles dont les faitages different d'au moins cela sont des deux-pans decales ; en deca, un toit en M (spec §3.1, n° 9 et 10). */
export const ECART_FAITAGE_DECALE_M = 0.5;
/** Des corps accoles : leurs cotes se touchent a moins de cela, et se recouvrent sur au moins cette part du plus court. */
const ACCOLE_M = 0.3;
const RECOUVREMENT_ACCOLE_MIN = 0.7;
/** Deux corps de meme sens : leurs faitages font moins de cela entre eux. */
const PARALLELE_DEG = 12;
/** Un faitage a moins de 1 cm d'un mur est sur le mur : un appentis (la tolerance de `formeDuCorps`, facade/regles/toits/faits.ts). */
const SUR_LE_MUR_M = 0.01;

const longueur = (a: PtBrut, b: PtBrut) => Math.hypot(b.x - a.x, b.y - a.y);

/** La longueur (le long du faitage, `pts[0] -> pts[1]`) et la largeur (`pts[0] -> pts[3]`) d'un corps. */
function dimensions(c: Pick<CorpsToit, 'pts'>): { L: number; W: number } {
  const [p0, p1, , p3] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  return { L: longueur(p0, p1), W: longueur(p0, p3) };
}

/** Ce qui ferme les deux bouts d'un corps : `bouts` s'il est dit, sinon deduit de `croupes` (le sens d'avant). */
export function boutsDuCorps(c: Pick<CorpsToit, 'bouts' | 'croupes'>): [BoutToit, BoutToit] {
  if (c.bouts) return c.bouts;
  const bout = (h: number | undefined): BoutToit => ((h ?? 0) > 0 ? { type: 'croupe', profondeurM: h as number } : { type: 'pignon' });
  return [bout(c.croupes?.[0]), bout(c.croupes?.[1])];
}

/** La forme d'un corps a pentes droites, sans profil ni bord particulier. */
function formeDroite(c: CorpsToit, L: number, W: number): FormeToit {
  if (c.posFaitage <= SUR_LE_MUR_M || c.posFaitage >= W - SUR_LE_MUR_M) return 'appentis';
  const bouts = boutsDuCorps(c);
  if (bouts.some((b) => b.type === 'demi-croupe')) return 'demi-croupes';
  if (bouts.some((b) => b.type === 'croupe' && b.profondeurM > 0)) {
    const prof = (b: BoutToit) => (b.type === 'croupe' ? b.profondeurM : 0);
    const faitage = L - prof(bouts[0]) - prof(bouts[1]);
    const carre = Math.max(L, W) <= RAPPORT_PAVILLON_MAX * Math.min(L, W);
    return bouts.every((b) => b.type === 'croupe') && carre && faitage < FAITAGE_PAVILLON_MAX_M ? 'pavillon' : 'croupes';
  }
  return 'deux-pans';
}

/** Un deux-pans a pignons dont un pan est bien plus large que l'autre (spec §3.1, n° 8). */
function estAsymetrique(c: CorpsToit, W: number): boolean {
  const [a, b] = [c.posFaitage, W - c.posFaitage];
  return boutsDuCorps(c).every((x) => x.type === 'pignon') && Math.min(a, b) > SUR_LE_MUR_M && Math.max(a, b) >= RAPPORT_ASYMETRIQUE_MIN * Math.min(a, b);
}

/**
 * La forme d'un corps (spec §3.1, §4). Dans l'ordre :
 * - un faitage plus bas que les deux egouts : un papillon (spec §4) ;
 * - sous HAUTEUR_PLAT_M de montee : plat (la regle de `formeDuCorps`, facade/regles/toits/faits.ts) ;
 * - un pan brise : Mansart si chaque bout est ferme par un pan (brisis ou croupe), gambrel sinon ;
 * - un pan courbe : carene si un bout est ferme par un pan, berceau sinon (un berceau a ses pignons) ;
 * - un pan retrousse ou un bord en coyau : coyau ;
 * - puis les pentes droites : appentis, demi-croupes, pavillon, croupes, deux pans.
 * Un corps sans les champs de T§4 a donc la forme d'avant : plat, appentis, croupes ou deux pans.
 * L'asymetrique : un faitage decentre, un grand pan au moins `RAPPORT_ASYMETRIQUE_MIN` fois le petit, des pignons aux bouts.
 * Un toit de revolution (`speciale`) porte le nom de son type.
 */
export function formeDuCorpsToit(c: CorpsToit): FormeToit {
  if (c.speciale) return c.speciale.type;
  const { L, W } = dimensions(c);
  const bas = Math.min(...c.egouts);
  const interieur = c.posFaitage > SUR_LE_MUR_M && c.posFaitage < W - SUR_LE_MUR_M;
  if (interieur && c.faitage <= bas - R.HAUTEUR_PLAT_M) return 'papillon';
  if (c.faitage - bas < R.HAUTEUR_PLAT_M) return 'plat';
  const profils = c.profil ?? [];
  const fermeParUnPan = (b: BoutToit) => b.type === 'brisis' || (b.type === 'croupe' && b.profondeurM > 0) || b.type === 'demi-croupe';
  const bouts = boutsDuCorps(c);
  if (profils.some((p) => p.type === 'brise')) return bouts.every(fermeParUnPan) ? 'mansart' : 'gambrel';
  if (profils.some((p) => p.type === 'courbe')) return bouts.some(fermeParUnPan) ? 'carene' : 'berceau';
  if (profils.some((p) => p.type === 'coyau') || c.bords?.coyau) return 'coyau';
  return formeDroite(c, L, W);
}

/**
 * La forme d'un corps, avec le nom que le calcul ne distingue pas encore : `formeDuCorpsToit` dit « deux-pans » pour un asymetrique,
 * comme `formeDuCorps` des faits (facade/regles/toits/faits.ts), que la lecture des toits compare ; ce nom-ci sert a montrer.
 */
export function formeDuCorpsNommee(c: CorpsToit): FormeToit {
  const f = formeDuCorpsToit(c);
  return f === 'deux-pans' && estAsymetrique(c, dimensions(c).W) ? 'asymetrique' : f;
}

/** L'aire a plat d'un corps (un rectangle). */
function aireDuCorps(c: Pick<CorpsToit, 'pts'>): number {
  const { L, W } = dimensions(c);
  return L * W;
}

/**
 * La forme d'ensemble d'un batiment en corps : celle de son corps principal, le plus grand (comme le
 * fait l'observation, spec §7.1 : « la forme du corps principal »). Null sans corps. Les compositions
 * (shed, toit en M, deux pans decales : plusieurs corps accoles) restent nommees par leur corps
 * principal tant qu'aucune regle ne les reconnait (lot G10).
 */
export function formeDesCorps(corps: readonly CorpsToit[] | null | undefined): FormeToit | null {
  if (!corps?.length) return null;
  const ensemble = formeDeLEnsemble(corps);
  if (ensemble) return ensemble;
  const principal = corps.reduce((a, b) => (aireDuCorps(b) > aireDuCorps(a) ? b : a));
  return formeDuCorpsNommee(principal);
}

/** Le repere d'un corps, dans le plan : sa direction le long du faitage (u), en travers (v), et ses dimensions. */
function reperDuCorps(c: Pick<CorpsToit, 'pts'>): { p0: PtBrut; u: PtBrut; v: PtBrut; L: number; W: number } {
  const [p0, p1, , p3] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  const { L, W } = dimensions(c);
  return { p0, u: { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v: { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W }, L, W };
}

/** Deux corps accoles par un long cote, de meme sens de faitage : le second a droite ou a gauche du premier. */
export function accoles(a: CorpsToit, b: CorpsToit): boolean {
  const A = reperDuCorps(a), B = reperDuCorps(b);
  if (Math.abs(A.u.x * B.u.x + A.u.y * B.u.y) < Math.cos((PARALLELE_DEG * Math.PI) / 180)) return false;
  // Les quatre coins de b dans le repere de a.
  const dansA = b.pts.map((q) => ({ s: (q.x - A.p0.x) * A.u.x + (q.y - A.p0.y) * A.u.y, t: (q.x - A.p0.x) * A.v.x + (q.y - A.p0.y) * A.v.y }));
  const s0 = Math.min(...dansA.map((q) => q.s)), s1 = Math.max(...dansA.map((q) => q.s)), t0 = Math.min(...dansA.map((q) => q.t)), t1 = Math.max(...dansA.map((q) => q.t));
  const recouvre = Math.min(A.L, s1) - Math.max(0, s0);
  if (recouvre < RECOUVREMENT_ACCOLE_MIN * Math.min(A.L, s1 - s0)) return false;
  return Math.abs(t0 - A.W) < ACCOLE_M || Math.abs(t1) < ACCOLE_M;
}

/** Le cote ou monte un appentis, dans le plan : la direction du mur haut. */
function sensHaut(c: CorpsToit): PtBrut {
  const { v, W } = reperDuCorps(c);
  const sens = c.posFaitage >= W - SUR_LE_MUR_M ? 1 : -1;
  return { x: v.x * sens, y: v.y * sens };
}

/**
 * Les formes d'ensemble, que plusieurs corps accoles composent (spec §3.1) : le shed (au moins deux appentis de meme sens, en
 * dents de scie), le toit en M (deux deux-pans accoles, de meme faitage) et les deux-pans decales (deux deux-pans accoles
 * dont les faitages different). Null pour tout autre assemblage : le corps principal nomme alors le batiment.
 */
export function formeDeLEnsemble(corps: readonly CorpsToit[]): FormeToit | null {
  if (corps.length < 2) return null;
  const formes = corps.map((c) => formeDuCorpsNommee(c));
  const toutes = (f: FormeToit) => formes.every((x) => x === f);
  const enChaine = (): boolean => corps.every((c, i) => corps.some((d, j) => j !== i && accoles(c, d)));
  if (toutes('appentis') && enChaine()) {
    const ref = sensHaut(corps[0] as CorpsToit);
    if (corps.every((c) => { const h = sensHaut(c); return h.x * ref.x + h.y * ref.y > 0.9; })) return 'shed';
  }
  if (corps.length === 2 && formes.every((f) => f === 'deux-pans' || f === 'asymetrique') && accoles(corps[0] as CorpsToit, corps[1] as CorpsToit)) {
    return Math.abs((corps[0] as CorpsToit).faitage - (corps[1] as CorpsToit).faitage) >= ECART_FAITAGE_DECALE_M ? 'deux-pans-decales' : 'toit-en-m';
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Le vocabulaire de l'observation
 * --------------------------------------------------------------------------------------------- */

/**
 * La forme qu'ecrit « Ce que je vois » (model/ceQueJeVois.ts), dans le vocabulaire de `Toit.forme` ;
 * null pour « Autre forme », qui n'affirme rien de precis.
 */
export function formeDeLaVue(v: FormeVue): FormeToit | null {
  if (v === 'autre') return null;
  if (v === 'demi-croupe') return 'demi-croupes';
  return v;
}

