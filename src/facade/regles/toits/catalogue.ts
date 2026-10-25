// Les formes du catalogue a la lecture du LiDAR (MD/spec-regles-toits.md §3.2, §9.1) : apres le calcul des corps, qui ne lit que des
// pentes droites (plat, appentis, deux pans, croupes, pavillon), la lecture des formes (facade/toits/lectureFormes.ts) cherche si la mesure
// porte nettement mieux un profil brise (Mansart, gambrel), un coyau, une courbe (berceau, carene), un papillon, une demi-croupe ou un
// toit de revolution. Si oui, ce corps remplace le principal, comme le ferait un couvreur qui reconnait la forme.
//
// Jusqu'au 17 octobre 2026, cette lecture ne servait qu'a l'audit de la parcelle (« le LiDAR seul ne decide pas de la forme ») ; elle
// s'applique desormais a tous les toits lus, a la demande de l'utilisateur, avec les seuils stricts de la lecture (regles/toits/formes.json :
// ecart sous ECART_FORME_MAX_M, et au plus GAIN_PROFIL ou GAIN_REVOLUTION fois celui des formes simples). Une forme qui apparaitrait
// partout serait un faux positif : le banc des formes (.claude/skills/toits, §6.1) dit lesquels changent.
//
// L'ordre est celui de la spec : le calcul (corps, puis formes du catalogue), puis le fait du batiment, puis les garde-fous. Un fait en
// contrainte relit le corps principal parmi ses formes simples admises : il l'emporte sur une forme du catalogue qu'il n'admet pas.

import { reconstruireCorps } from '../../toits/toitCorps.js';
import { lireFormes, type LectureForme } from '../../toits/lectureFormes.js';
import { SEUILS_FORMES } from '../../../regles/toits/formes.js';
import type { CorpsToit, FormeToit, PtBrut, ToitMesure } from '../../../model/types.js';

/**
 * Les formes que la lecture pose sans qu'on les demande. Le coyau n'en est pas : la surface mesuree est lissee (mediane 3 x 3,
 * model/toitMesure.ts), ce qui adoucit le bas de tout pan, exactement ce qui signe un coyau ; au banc du 17 octobre 2026, les trois
 * coyaux lus seuls (Versailles 28283509, Eguisheim 4358791, Hucqueliers 37248478) etaient des toits a plusieurs corps ou suspects.
 * Il reste lu quand Claude ou la personne le disent (l'audit, facade/toits/lectureFormes.ts en mode souple).
 */
export const FORMES_SANS_DEMANDE: ReadonlySet<FormeToit> = new Set<FormeToit>(['mansart', 'gambrel', 'berceau', 'carene', 'papillon', 'demi-croupes', 'conique', 'polygonal', 'fleche', 'dome', 'imperiale']);

/**
 * Une lecture du catalogue vraisemblable sur ce batiment : une forme qui se pose sans demande (pas le coyau), et pas un toit de
 * revolution dont l'egout passe la hauteur BD TOPO de plus de DEPASSEMENT_REVOLUTION_M : c'est la couronne d'un arbre (Le Vesinet,
 * 28267565), pas une tourelle. Sans hauteur BD TOPO, rien a opposer a une revolution.
 */
export function lectureVraisemblable(l: LectureForme, hauteurBdTopo: number | null): boolean {
  if (!FORMES_SANS_DEMANDE.has(l.forme)) return false;
  if (hauteurBdTopo === null) return true;
  return !l.corps.some((c) => c.speciale && Math.min(...c.egouts) > hauteurBdTopo + SEUILS_FORMES.DEPASSEMENT_REVOLUTION_M);
}

/** Les corps lus, avec la forme du catalogue que la mesure porte nettement mieux que les formes simples ; tels quels sinon. */
export function avecFormesDuCatalogue(corps: CorpsToit[] | null, m: ToitMesure, contour: readonly PtBrut[], hauteurBdTopo: number | null = null): CorpsToit[] | null {
  if (!corps?.length) return corps;
  const mieux = lireFormes(m, corps, contour).find((l) => lectureVraisemblable(l, hauteurBdTopo));
  return mieux ? mieux.corps : corps;
}

/** Le calcul des corps d'un batiment sur sa mesure : les pentes droites (toitCorps.ts), puis les formes du catalogue. */
export function corpsCalcules(m: ToitMesure, contour: readonly PtBrut[], options: Parameters<typeof reconstruireCorps>[2] & { hauteurBdTopo?: number | null } = {}): CorpsToit[] | null {
  return avecFormesDuCatalogue(reconstruireCorps(m, contour, options), m, contour, options.hauteurBdTopo ?? null);
}
