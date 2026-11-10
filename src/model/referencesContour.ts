// Les references d'un ouvrage a son propre contour, par rang de cote, par rang de sommet ou par abscisse le long d'un cote
// (MD/spec-ouvrages.md, « Les références par numéro de côté ou de sommet… », etape 6.3).
//
// Une deformation du contour (un sommet ajoute ou retire, un cote tire ou raccourci, l'actualisation IGN) change les rangs ou la
// longueur des cotes. Chaque ouvrage declare dans model/ouvrages/ ce qu'il range ainsi (`Ouvrage.suivreDeformation`) ; ce module
// lui donne, une fois pour tous, la correspondance des rangs et la regle des abscisses. Ce qui le declenche (le geste, l'actualisation)
// passe par model/contourDeforme.ts::suivreDeformation.
//
// Deux regles pour une abscisse le long d'un cote, parce que deux sortes de choses y sont posees :
// - ce qui est pose a sa place sur le terrain (un portail, une fenetre reglee en 3D) y reste : son milieu se reporte sur le cote
//   d'aujourd'hui, borne au cote ;
// - ce qui est lu sur l'image du mur (un releve de facade : ses ouvertures, sa partie basse, sa grille) suit le mur en proportion :
//   la Vue 3D etire la photo sur le mur entier (three/releve3d.ts), et l'echelle du releve venait de la longueur du mur.
//
// Pur : rien d'ecrit hors des objets passes.

import { correspondanceDesCotes } from '../geometry/correspondanceCotes.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../geometry/cotesVusDeDehors.js';
import type { PtBrut } from './types.js';

/** Comment recompter les rangs : `geste`, un sommet ajoute ou retire seul les change ; `geometrie`, chaque cote suit son mur. */
export type Recompte = 'geste' | 'geometrie';

/** Un sommet d'aujourd'hui a moins de cela d'un ancien est le meme : au centimetre apres un geste, a un demi-metre apres une
 * actualisation, qui deplace un peu les sommets. */
const MEME_SOMMET_M: Record<Recompte, number> = { geste: 0.01, geometrie: 0.5 };

/** Un cote dont les deux bouts n'ont pas bouge de plus d'un millimetre n'a pas change : ce qui y est pose ne se recalcule pas. */
const MEME_BOUT_M = 0.001;

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

/** Une deformation, telle qu'un ouvrage la lit pour faire suivre ce qu'il range sur son contour. */
export interface Deformation {
  avant: readonly PtBrut[];
  apres: readonly PtBrut[];
  recompte: Recompte;
  /** Le rang d'aujourd'hui de chaque ancien cote (-1 : aucun ne le porte). */
  cotes: readonly number[];
  /** Pour chaque cote d'aujourd'hui, l'ancien qui le portait (un cote coupe en deux par un sommet ajoute : les deux parts). */
  origines: readonly number[];
  /** Le nombre de sommets a change : un cote peut s'etre coupe en deux, ou deux cotes fondus en un. */
  nombreChange: boolean;
}

/** La deformation de `avant` a `apres`. */
export function deformation(avant: readonly PtBrut[], apres: readonly PtBrut[], recompte: Recompte): Deformation {
  const nombreChange = avant.length !== apres.length;
  const cotes = rangsDesCotes(avant, apres, recompte);
  const origines = recompte === 'geste' && !nombreChange ? apres.map((_, i) => i) : correspondanceDesCotes(apres, avant);
  return { avant, apres, recompte, cotes, origines, nombreChange };
}

/**
 * Le rang d'aujourd'hui d'une reference a un seul cote. Un rang qui ne designait aucun cote (un ancien fichier) reste tel quel, comme
 * un cote dont le mur n'est plus la : la lecture le tient deja pour absent (`coteValide`) plutot que de l'effacer.
 */
export function coteSuivi(d: Deformation, cote: number): number {
  const j = Number.isInteger(cote) ? d.cotes[cote] : undefined;
  return j === undefined || j < 0 ? cote : j;
}

/**
 * Les rangs d'aujourd'hui d'une reference a un ensemble de cotes (les cotes sans rive, les cotes regles de la cloture) : chaque cote
 * d'aujourd'hui porte par un ancien de l'ensemble y entre, les deux parts d'un cote coupe comprises. Trie, sans doublon.
 */
export function cotesSuivis(d: Deformation, cotes: readonly number[]): number[] {
  const dans = new Set(cotes);
  const res = new Set<number>();
  d.origines.forEach((i, j) => { if (i >= 0 && dans.has(i)) res.add(j); });
  // Un rang qui ne designait aucun ancien cote reste (il est deja ignore a la lecture).
  for (const c of cotes) if (!(Number.isInteger(c) && c >= 0 && c < d.avant.length)) res.add(c);
  return [...res].sort((a, b) => a - b);
}

/** Pour chaque cote d'aujourd'hui, l'ancien qui le portait et qui etait dans la liste (-1 : aucun). */
export function origineDansLaListe(d: Deformation, j: number, liste: ReadonlySet<number>): number {
  const i = d.origines[j];
  return i !== undefined && i >= 0 && liste.has(i) ? i : -1;
}

const facadeDuCote = (pts: readonly PtBrut[], cote: number): Facade | undefined => facadesDuContour(pts, 0).find((f) => f.cote === cote);

/** Le cote `cote` d'avant et le cote `vers` d'aujourd'hui ont-ils les memes bouts ? Rien de ce qui y est pose ne bouge alors. */
export function memeCote(d: Deformation, cote: number, vers: number): boolean {
  const a = facadeDuCote(d.avant, cote), b = facadeDuCote(d.apres, vers);
  if (!a || !b) return true;
  return Math.hypot(a.gauche.x - b.gauche.x, a.gauche.y - b.gauche.y) <= MEME_BOUT_M && Math.hypot(a.droite.x - b.droite.x, a.droite.y - b.droite.y) <= MEME_BOUT_M;
}

/** L'abscisse, depuis la gauche vue de dehors, du pied de `p` sur un cote. */
function abscisse(f: Facade, p: PtBrut): number {
  const L = f.largeur || 1;
  return ((p.x - f.gauche.x) * (f.droite.x - f.gauche.x) + (p.y - f.gauche.y) * (f.droite.y - f.gauche.y)) / L;
}

/**
 * Une chose posee a sa place sur un cote (son milieu a `milieu` metres de la gauche vue de dehors) : son milieu d'aujourd'hui sur le
 * cote `vers`, et la longueur de ce cote. Null si l'un des deux cotes n'est pas un mur (moins de 10 cm).
 */
export function milieuReporte(d: Deformation, cote: number, vers: number, milieu: number): { milieu: number; longueur: number } | null {
  const a = facadeDuCote(d.avant, cote), b = facadeDuCote(d.apres, vers);
  if (!a || !b) return null;
  return { milieu: abscisse(b, pointDeFacade(a, milieu)), longueur: b.largeur };
}

/** Le cote d'aujourd'hui le plus proche d'un point du cote `cote` d'avant (un cote coupe en deux : la part ou il tombe). */
export function coteOuTombe(d: Deformation, cote: number, milieu: number): number {
  const a = facadeDuCote(d.avant, cote);
  if (!a) return coteSuivi(d, cote);
  const p = pointDeFacade(a, milieu);
  let meilleur = coteSuivi(d, cote), dmin = Infinity;
  for (const f of facadesDuContour(d.apres, 0)) {
    const t = Math.max(0, Math.min(f.largeur, abscisse(f, p)));
    const q = pointDeFacade(f, t);
    const dj = Math.hypot(q.x - p.x, q.y - p.y);
    if (dj < dmin - 1e-9) { dmin = dj; meilleur = f.cote; }
  }
  return meilleur;
}

/** Le rapport des longueurs du cote `vers` d'aujourd'hui et du cote `cote` d'avant (1 si l'un n'est pas un mur). */
export function rapportDeLongueur(d: Deformation, cote: number, vers: number): number {
  const a = facadeDuCote(d.avant, cote), b = facadeDuCote(d.apres, vers);
  return a && b && a.largeur > 0 ? b.largeur / a.largeur : 1;
}

/** Une valeur bornee a [min, max] (max < min : min), arrondie au centimetre comme une saisie. */
export const borne = (v: number, min: number, max: number): number => Math.round(Math.max(min, Math.min(Math.max(min, max), v)) * 100) / 100;
