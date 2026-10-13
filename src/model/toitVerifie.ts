// Le batiment « verifie sur place » (MD/spec-regles-toits.md §1, MD/spec-audit.md §14.5) : le 100 %
// de la parcelle du projet, fige. Un changement de regle de toit (VERSION_LECTURE_TOITS) ne le
// recalcule plus ; une actualisation IGN non plus, sauf si l'utilisateur le demande. La relecture
// peut seulement dire si le nouveau calcul serait d'accord : c'est ce qui mesure la regle sans toucher
// au projet. Ce module dit ce qu'est un batiment protege, et ce que « d'accord » veut dire.

import type { CorpsToit, PtBrut, Toit } from './types.js';

/** Ce que la comparaison lit d'un batiment : son contour, son toit, sa hauteur a l'egout, ses corps. */
export interface BatimentCompare {
  pts?: PtBrut[];
  toit?: Toit | null;
  elevation?: number;
  corpsToit?: CorpsToit[] | null;
  verifieSurPlace?: { date: string } | null;
}

/** Un batiment verifie sur place : protege de toute relecture et de toute actualisation. */
export const estVerifieSurPlace = (o: { verifieSurPlace?: { date: string } | null } | null | undefined): boolean => !!o?.verifieSurPlace;

/**
 * En dessous de cet ecart, deux hauteurs disent la meme chose : c'est la precision du LiDAR HD sur un
 * toit (±1 dm sur le MNH, et la lecture arrondit au decimetre). Un faitage ou un egout qui bouge de
 * plus que cela, c'est une regle qui a change le toit.
 */
export const SEUIL_ACCORD_M = 0.3;
/** Un contour qui bouge de plus que cela a ete recale : le nouveau calcul n'est pas d'accord. */
export const SEUIL_ACCORD_CONTOUR_M = 0.05;

const proches = (a: number | undefined, b: number | undefined, seuil: number): boolean =>
  a === undefined || b === undefined ? a === b : Math.abs(a - b) <= seuil;

/** Deux contours qui se superposent au centimetre, sommet par sommet, dans le meme ordre. */
function memeContour(a: readonly PtBrut[] | undefined, b: readonly PtBrut[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((p, i) => { const q = b[i]; return !!q && Math.hypot(p.x - q.x, p.y - q.y) <= SEUIL_ACCORD_CONTOUR_M; });
}

/** Deux corps qui disent le meme toit : meme emprise, meme faitage et memes egouts au decimetre, meme nombre de pignons et de croupes. */
function memeCorps(a: CorpsToit, b: CorpsToit): boolean {
  return memeContour(a.pts, b.pts)
    && proches(a.posFaitage, b.posFaitage, SEUIL_ACCORD_M)
    && proches(a.faitage, b.faitage, SEUIL_ACCORD_M)
    && proches(a.egouts[0], b.egouts[0], SEUIL_ACCORD_M) && proches(a.egouts[1], b.egouts[1], SEUIL_ACCORD_M)
    && a.pignons.length === b.pignons.length
    && (a.croupes ? 1 : 0) === (b.croupes ? 1 : 0);
}

/** Deux formes simples qui disent le meme toit : meme forme, meme sens de faitage, meme hauteur au decimetre. */
function memeToit(a: Toit | null | undefined, b: Toit | null | undefined): boolean {
  if (!a || !b) return !a === !b;
  return a.forme === b.forme && proches(a.hauteur, b.hauteur, SEUIL_ACCORD_M) && proches(a.angleFaitage, b.angleFaitage, 1);
}

/**
 * Le nouveau calcul (`apres`, lu sur une copie) serait-il d'accord avec le batiment verifie (`avant`) ?
 * Oui quand il garde le contour a sa place, la meme hauteur a l'egout, la meme forme simple, et les
 * memes corps un a un, au decimetre. Ce qu'il faut pour dire qu'une regle nouvelle n'aurait rien change
 * ici ; en desaccord, le toit verifie reste et la regle est a regarder sur ce cas.
 */
export function lectureDAccord(avant: BatimentCompare, apres: BatimentCompare): boolean {
  if (!memeContour(avant.pts, apres.pts)) return false;
  if (!proches(avant.elevation, apres.elevation, SEUIL_ACCORD_M)) return false;
  if (!memeToit(avant.toit, apres.toit)) return false;
  const ca = avant.corpsToit ?? [], cb = apres.corpsToit ?? [];
  return ca.length === cb.length && ca.every((c, i) => { const d = cb[i]; return !!d && memeCorps(c, d); });
}
