// L'analyse d'un mur depuis ses photos calees : la seule entree des trois chaines (une photo, des morceaux cote a cote, des vues
// du mur entier). Le releve de facade (zones/releve/analyse.ts), l'audit de la parcelle (app/audit/parcelle/mesures.ts) et la
// calibration (facade/corpusReel.ts) passent tous par elle : ce que l'un redresse, fusionne et cote, les autres le redressent,
// le fusionnent et le cotent de meme.

import { analyserReleve, silhouetteEnPartsDuMur, type EntreeAnalyse, type ResultatAnalyse } from './analyse.js';
import { analyserMosaique, type ResultatMosaique } from './mosaique.js';
import { analyserVues, type ResultatFusion } from './fusion.js';
import { CHAMP_GRAND_COTE_DEFAUT, focalePx } from './cadrage.js';
import type { Decrochement } from './profil.js';
import type { Image, P2 } from './homographie.js';

/** Comment plusieurs photos d'un mur se combinent : des morceaux cote a cote, ou des vues du mur entier a fondre. */
export type AssemblageMur = 'morceaux' | 'vues';

/** Une photo calee : l'image, les quatre coins du mur (hg, hd, bd, bg) et la focale quand on la connait. */
export interface PhotoDuMur {
  photo: Image;
  coins: P2[];
  focalePx: number | null;
  /** Mur a deux hauteurs d'egout : le decrochement pose sur la photo (une photo seule). */
  decrochement?: Decrochement | null;
  /** La silhouette du haut du mur sur la photo (ajustee a la main, ou lue entre ses coins) : elle dit le toit quand elle a une forme. */
  silhouette?: P2[] | null;
}

/** Ce que le mur donne a toutes les photos : sa largeur (le plan), sa hauteur estimee, le batiment et la distance. */
export type MurAnalyse = Pick<EntreeAnalyse, 'largeur' | 'hauteur' | 'contour' | 'cote' | 'distance'>;

/** L'analyse, et selon l'assemblage, ce que la fusion ou la mosaique en disent. */
export interface AnalyseMur {
  r: ResultatAnalyse;
  fusion?: ResultatFusion;
  mosaique?: ResultatMosaique;
}

/**
 * Analyse un mur : une photo, c'est le mur entier entre ses coins ; plusieurs, des vues a fondre (`vues`) ou des morceaux a
 * assembler (`morceaux`). Null quand rien ne se redresse.
 */
export function analyserLeMur(murSeul: MurAnalyse, photos: readonly PhotoDuMur[], assemblage: AssemblageMur = 'morceaux'): AnalyseMur | null {
  const p0 = photos[0];
  if (!p0) return null;
  // La silhouette du haut du mur, en parts du mur, depuis la premiere photo qui en a une : chaque photo ramene le meme mur au meme
  // rectangle, la silhouette vaut pour la fusion comme pour la photo seule.
  const avec = photos.find((p) => p.silhouette && p.silhouette.length >= 2);
  const mur = { ...murSeul, silhouette: avec ? silhouetteEnPartsDuMur(avec.coins, avec.silhouette) : null };
  if (photos.length > 1 && assemblage === 'vues') {
    const r = analyserVues({ ...mur, vues: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx })) });
    return r ? { r, fusion: r } : null;
  }
  if (photos.length === 1) {
    const r = analyserReleve({ ...mur, photo: p0.photo, coins: p0.coins, focalePx: p0.focalePx, decrochement: p0.decrochement ?? null });
    return r ? { r } : null;
  }
  // Des morceaux se mettent a l'echelle par leur focale : inconnue, celle du champ d'un telephone.
  const r = analyserMosaique({ ...mur, morceaux: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx ?? focalePx(p.photo.largeur, p.photo.hauteur, CHAMP_GRAND_COTE_DEFAUT) })) });
  return r ? { r, mosaique: r } : null;
}
