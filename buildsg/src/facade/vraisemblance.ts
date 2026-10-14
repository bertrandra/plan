// Les garde-fous de vraisemblance de la lecture des toits (MD/spec-toit-ign.md §10, §13 ;
// MD/spec-regles-toits.md §9.1, point 4) : ce que le LiDAR voit au-dessus d'un batiment n'est pas
// toujours son toit, et un egout mesure n'est pas toujours un egout.
//
// Ils vivaient dans app/toitsLidar.ts, qui les applique a l'import. Le rejeu d'un cas d'audit
// (facade/audit.ts) doit appliquer exactement les memes, sans reseau ni plan : ils sont donc ici, purs,
// et app/toitsLidar.ts les reexporte sous les memes noms.

import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../model/reglagesToits.js';
import type { CorpsToit, ToitMesure } from '../model/types.js';

/** Au-dela de la hauteur de la BD TOPO plus cela, ce que le LiDAR voit sur un batiment est un arbre. */
export const DEPASSEMENT_VEGETATION_M = R.DEPASSEMENT_VEGETATION_M;
// En deca de S.ECART_EGOUT_MIN_M, l'egout mesure ne vaut pas de changer la hauteur BD TOPO ; hors de
// S.EGOUT_ECRIT_MIN_M et S.EGOUT_ECRIT_MAX_M, la mesure n'est pas un egout.

/**
 * Ce que les garde-fous lisent d'un batiment : ses attributs BD TOPO (`bdtopo`), et rien d'autre.
 * Un objet quelconque : un objet du plan, un batiment de village ou les entrees d'un cas d'audit.
 */
export type AvecBdTopo = object;

/** La hauteur du batiment selon la BD TOPO (du sol a l'egout), null sans elle. */
export function hauteurBdTopo(o: AvecBdTopo): number | null {
  const b = (o as { bdtopo?: unknown }).bdtopo as { hauteurRetenueM?: unknown; hauteurM?: unknown } | null | undefined;
  const h = typeof b?.hauteurRetenueM === 'number' ? b.hauteurRetenueM : typeof b?.hauteurM === 'number' ? b.hauteurM : null;
  return h !== null && h > 0 ? h : null;
}

/**
 * Les corps que le LiDAR a pu voir sur ce batiment, et non sur l'arbre qui le couvre : un corps dont
 * l'egout depasse de plus de DEPASSEMENT_VEGETATION_M la hauteur de la BD TOPO est un houppier. Un
 * abri de jardin de 2,70 m sous un chene devenait une tour de 15 m. Null quand il n'en reste aucun :
 * le batiment garde sa forme simple.
 */
export function corpsVraisemblables(o: AvecBdTopo, corps: CorpsToit[] | null): CorpsToit[] | null {
  const h = hauteurBdTopo(o);
  if (!corps || h === null) return corps;
  const gardes = corps.filter((c) => Math.min(...c.egouts) <= h + S.DEPASSEMENT_VEGETATION_M);
  return gardes.length ? gardes : null;
}

/**
 * La surface mesuree, si c'est bien un toit : quand meme son egout depasse de plus de
 * DEPASSEMENT_VEGETATION_M la hauteur de la BD TOPO, le LiDAR n'a vu que l'arbre qui couvre le
 * batiment. Null alors : ni surface brute dessinee, ni hauteur d'egout tiree d'un houppier.
 */
export function mesureVraisemblable(o: AvecBdTopo, mesure: ToitMesure | null): ToitMesure | null {
  const h = hauteurBdTopo(o);
  return mesure && h !== null && mesure.egout > h + S.DEPASSEMENT_VEGETATION_M ? null : mesure;
}

/** Une forme ajustee sur la cime d'un arbre n'est pas le toit du batiment qu'il couvre : null alors. */
export function ajusteVraisemblable<T extends { egout: number }>(o: AvecBdTopo, ajuste: T | null): T | null {
  const h = hauteurBdTopo(o);
  return ajuste && h !== null && ajuste.egout > h + S.DEPASSEMENT_VEGETATION_M ? null : ajuste;
}

/** L'egout mesure vaut d'etre ecrit : entre les bornes d'un egout. */
export const egoutValide = (e: number): boolean => e >= S.EGOUT_ECRIT_MIN_M && e <= S.EGOUT_ECRIT_MAX_M;

/**
 * La hauteur a l'egout du batiment apres la lecture : l'egout mesure, au decimetre, quand il est
 * valide et s'ecarte franchement de la hauteur en place ; sinon celle-ci, inchangee.
 */
export function elevationApresLecture(elevation: number | undefined, egout: number | null): number | undefined {
  const h = elevation ?? 0;
  return egout !== null && egoutValide(egout) && Math.abs(egout - h) >= S.ECART_EGOUT_MIN_M ? Math.round(egout * 10) / 10 : elevation;
}
