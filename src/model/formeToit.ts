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

/**
 * La forme d'un corps (spec §3.1, §4). Dans l'ordre :
 * - un faitage plus bas que les deux egouts : un papillon (spec §4) ;
 * - sous HAUTEUR_PLAT_M de montee : plat (la regle de `formeDuCorps`, facade/regles/toits/faits.ts) ;
 * - un pan brise : Mansart si chaque bout est ferme par un pan (brisis ou croupe), gambrel sinon ;
 * - un pan courbe : carene si un bout est ferme par un pan, berceau sinon (un berceau a ses pignons) ;
 * - un pan retrousse ou un bord en coyau : coyau ;
 * - puis les pentes droites : appentis, demi-croupes, pavillon, croupes, deux pans.
 * Un corps sans les champs de T§4 a donc la forme d'avant : plat, appentis, croupes ou deux pans.
 * L'asymetrique (faitage decentre, egouts inegaux) se reconnaitra au lot G9 : il reste un deux-pans.
 */
export function formeDuCorpsToit(c: CorpsToit): FormeToit {
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
  const principal = corps.reduce((a, b) => (aireDuCorps(b) > aireDuCorps(a) ? b : a));
  return formeDuCorpsToit(principal);
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

