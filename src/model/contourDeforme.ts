// Ce qui suit un contour deforme (MD/spec-ouvrages.md, « Le flux de construction d'un batiment », point 8 de « Ce qu'il faut
// ranger »).
//
// Un deplacement d'un bloc fait suivre ce qu'un objet porte en coordonnees absolues (model/ouvrages/, suivreLeContour). Une
// deformation (tirer un sommet ou un cote, en ajouter, en retirer, redimensionner un rectangle, saisir une longueur ou un angle,
// l'actualisation IGN) n'a pas de deplacement a appliquer : rien ne suivait. Deux choses en dependent, et chacune a sa regle :
//
// - ce qui est range par le rang d'un cote ou d'un sommet (les releves de facade, les fenetres reglees une par une, les cotes du
//   plan) glissait au mur voisin quand un sommet s'ajoutait ou s'en allait : les rangs sont recomptes. Pour un geste, seul un
//   sommet ajoute ou retire change les rangs ; pour une actualisation, ou le premier sommet peut changer, chaque ancien cote va au
//   cote d'aujourd'hui qui le porte, par la geometrie (model/cotesAudit.ts::correspondanceDesCotes, comme les facades de l'audit) ;
// - les corps et les volumes du toit, lus au LiDAR sur l'ancien contour, ne sont plus justes : le batiment redevient a lire
//   (`toitLidarLu` efface), et la relecture en tache de fond les refait sur le nouveau contour en reportant ce qui etait pose
//   dessus. Un toit que la lecture n'a pas le droit d'ecrire (model/protections.ts : « Règles » coupees, verifie sur place, saisi)
//   reste tel quel : c'est celui de la personne, et le dire vaut mieux que le remplacer.
//
// Pur : l'appelant dit au controleur des objets que l'objet a change, et relance la lecture.

import { correspondanceDesCotes, memeContour } from './cotesAudit.js';
import { deplacementRigide } from '../geometry/deplacement.js';
import { NIVEAU, niveauActuel, origineActuelle, type Origine } from './protections.js';
import type { Mesure, ObjetPlan, PtBrut } from './types.js';

/** Un sommet d'aujourd'hui a moins de cela d'un ancien est le meme : au centimetre apres un geste, a un demi-metre apres une
 * actualisation, qui deplace un peu les sommets. */
const MEME_SOMMET_M: Record<Recompte, number> = { geste: 0.01, geometrie: 0.5 };

/** Un recalage du LiDAR deplace un contour de tant au plus (DECALAGE_MAX_M, 3 m) : au-dela, ce n'est plus le meme contour deplace. */
const DEPLACEMENT_MAX_M = 3.5;
/** Deux sommets a moins de cela, une fois le deplacement retire, sont le meme : la precision d'un contour de la BD TOPO. */
const MEME_FORME_M = 0.15;

/**
 * Le contour d'aujourd'hui est-il l'ancien, deplace d'un bloc (au plus de DEPLACEMENT_MAX_M), quel que soit son premier sommet ?
 * Dans un sens comme dans l'autre. C'est ce que l'actualisation IGN demande : un contour que le LiDAR a recale garde sa forme a la BD TOPO du jour ; une forme qui a
 * change, c'est l'IGN qui l'a changee.
 */
export function memeFormeDeplacee(avant: readonly PtBrut[], apres: readonly PtBrut[]): boolean {
  const n = avant.length;
  if (n < 3 || apres.length !== n) return false;
  // Dans un sens ou dans l'autre : la BD TOPO rend un contour tourne dans le sens horaire, un contour dessine peut ne pas l'etre.
  const sens = [apres, [...apres].reverse()];
  for (let k = 0; k < 2 * n; k++) {
    const tour = sens[k < n ? 0 : 1] as readonly PtBrut[];
    const q = (i: number) => tour[(i + k) % n] as PtBrut;
    const dx = avant.reduce((s, p, i) => s + q(i).x - p.x, 0) / n, dy = avant.reduce((s, p, i) => s + q(i).y - p.y, 0) / n;
    if (Math.hypot(dx, dy) <= DEPLACEMENT_MAX_M && avant.every((p, i) => Math.hypot(q(i).x - p.x - dx, q(i).y - p.y - dy) <= MEME_FORME_M)) return true;
  }
  return false;
}

/** Comment recompter les rangs : `geste`, un sommet ajoute ou retire seul les change ; `geometrie`, chaque cote suit son mur. */
export type Recompte = 'geste' | 'geometrie';

/** Le rang d'aujourd'hui de chaque ancien cote (-1 : aucun ne le porte). */
export function rangsDesCotes(avant: readonly PtBrut[], apres: readonly PtBrut[], recompte: Recompte): number[] {
  if (recompte === 'geste' && avant.length === apres.length) return avant.map((_, i) => i);
  return correspondanceDesCotes(avant, apres);
}

/** Le rang d'aujourd'hui de chaque ancien sommet (-1 : il n'est plus la). */
export function rangsDesSommets(avant: readonly PtBrut[], apres: readonly PtBrut[], recompte: Recompte): number[] {
  if (recompte === 'geste' && avant.length === apres.length) return avant.map((_, i) => i);
  return avant.map((p) => {
    let meilleur = -1, d = MEME_SOMMET_M[recompte];
    apres.forEach((q, j) => { const dj = Math.hypot(q.x - p.x, q.y - p.y); if (dj <= d) { d = dj; meilleur = j; } });
    return meilleur;
  });
}

/** Une liste rangee par cote, sur les rangs d'aujourd'hui ; un element dont le mur n'est plus la garde son rang. */
function surLesCotes<T extends { cote: number }>(liste: readonly T[], vers: readonly number[]): T[] {
  return liste.map((x) => { const j = vers[x.cote]; return j === undefined || j < 0 || j === x.cote ? x : { ...x, cote: j }; });
}

/** Ce qu'une deformation a fait du toit : relu en tache de fond, garde parce que protege (la marque qui le protege), ou rien. */
export interface SuiteDeformation {
  /** Le contour a change de forme (pas un deplacement d'un bloc, pas le meme contour). */
  deforme: boolean;
  /** Le batiment redevient a lire au LiDAR : la tache de fond est a relancer. */
  relire: boolean;
  /** Le toit en corps ou en volumes reste sur l'ancien contour : la marque qui le protege. */
  toitGarde: Origine | null;
}

const RIEN: SuiteDeformation = { deforme: false, relire: false, toitGarde: null };

/**
 * Le contour de `o` est passe de `avant` a `o.pts` : ses releves et ses fenetres reglees suivent leur mur, et son toit lu au LiDAR
 * redevient a lire, sauf s'il est protege. Ecrit sur l'objet (l'appelant le touche).
 */
export function suivreDeformation(o: ObjetPlan, avant: readonly PtBrut[], recompte: Recompte): SuiteDeformation {
  if (o.type === 'circle' || !Array.isArray(o.pts)) return RIEN;
  const apres = o.pts;
  if (memeContour(avant, apres) || deplacementRigide(avant, apres)) return RIEN;
  const b = o.batiment;
  if (!b) return { ...RIEN, deforme: true };
  const vers = rangsDesCotes(avant, apres, recompte);
  if (b.facades?.length) b.facades = surLesCotes(b.facades, vers);
  if (b.fenetres3d?.liste?.length) b.fenetres3d = { ...b.fenetres3d, liste: surLesCotes(b.fenetres3d.liste, vers) };
  const toitLu = !!b.toitLidarLu || !!b.corpsToit?.length || !!b.volumesToit?.length;
  if (!toitLu) return { ...RIEN, deforme: true };
  // Un toit d'un niveau plus fort que la mesure (model/protections.ts) n'est pas relu : c'est celui de la personne, ou celui vu.
  if (niveauActuel(o, 'toit') < NIVEAU.mesure) return { deforme: true, relire: false, toitGarde: b.corpsToit?.length || b.volumesToit?.length ? origineActuelle(o, 'toit') : null };
  b.toitLidarLu = null;
  return { deforme: true, relire: true, toitGarde: null };
}

/**
 * Les cotes du plan apres la deformation de l'objet `cle` : leur cote de reference et leur point vise suivent leur rang
 * d'aujourd'hui. Une cote dont le point vise n'est plus la (un sommet retire) part avec lui ; un cote ou un point sans
 * correspondant, mais encore dans le contour, garde son rang. Rend la meme liste quand rien ne change.
 */
export function mesuresSuivent<M extends Pick<Mesure, 'refObjKey' | 'refSegIndex' | 'targetObjKey' | 'targetPtIndex'>>(mesures: readonly M[], cle: string, avant: readonly PtBrut[], apres: readonly PtBrut[], recompte: Recompte): M[] {
  if (!mesures.some((m) => m.refObjKey === cle || m.targetObjKey === cle)) return [...mesures];
  const cotes = rangsDesCotes(avant, apres, recompte), sommets = rangsDesSommets(avant, apres, recompte);
  const garde = (vers: readonly number[], i: number): number => { const j = vers[i]; return j !== undefined && j >= 0 ? j : i < apres.length ? i : -1; };
  return mesures.flatMap((m) => {
    let suite = m;
    if (m.refObjKey === cle) { const j = garde(cotes, m.refSegIndex); if (j < 0) return []; if (j !== m.refSegIndex) suite = { ...suite, refSegIndex: j }; }
    if (m.targetObjKey === cle) {
      const j = sommets[m.targetPtIndex];
      // Un sommet retire par un geste emporte ses cotes ; sinon, faute de mieux, le meme rang.
      if ((j === undefined || j < 0) && recompte === 'geste' && avant.length > apres.length) return [];
      const k = j !== undefined && j >= 0 ? j : m.targetPtIndex < apres.length ? m.targetPtIndex : -1;
      if (k < 0) return [];
      if (k !== m.targetPtIndex) suite = { ...suite, targetPtIndex: k };
    }
    return [suite];
  });
}
