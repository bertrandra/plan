// Le profil de la facade choisie, en metres : le haut de toute la facade vue de dehors (tous les corps du toit, le plus haut l'emportant),
// du sol a ce haut, d'un angle a l'autre. C'est le gabarit du mur (facade/gabaritMur.ts::hautDeLaFacade), mis a l'echelle et pose sur la
// facade du mode Toit pour que la personne lise, a vue, la largeur, l'egout et le faitage de ce qu'elle regle. Pur.

import { hautDeLaFacade } from '../../gabaritMur.js';
import { simplifierLigne } from '../../../geometry/simplifierLigne.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

/** Le mur vu de dehors : ses deux angles (`gauche`, `droite` pour qui lui fait face), sa normale sortante, sa longueur. */
export interface MurVu { gauche: PtBrut; droite: PtBrut; normale: PtBrut; largeur: number }

/** Un point du profil : `x` metres depuis l'angle gauche, `y` metres au-dessus du sol. */
export interface PointProfil { x: number; y: number }

export interface ProfilFacade {
  /** Les troncons ou un corps est derriere la facade, de gauche a droite ; entre eux, rien (un trou, une cour). */
  troncons: PointProfil[][];
  largeur: number;
  /** La plus haute et la plus basse ligne du haut : le faitage vu, et l'egout. */
  hauteurMax: number;
  hauteurMin: number;
}

/** Le haut garde ses sommets a 2 cm pres (la meme tolerance que le gabarit). */
const TOLERANCE_M = 0.02;

/** Le profil de la facade, ou null quand aucun corps n'est derriere elle. */
export function profilDeLaFacade(mur: MurVu, corps: readonly CorpsToit[]): ProfilFacade | null {
  const facade: Facade = { cote: 0, hauteur: 0, azimut: 0, orientation: '', ...mur };
  const troncons: PointProfil[][] = [];
  let cours: PointProfil[] = [];
  for (const p of hautDeLaFacade(facade, corps)) {
    if (p.y === null) { if (cours.length) troncons.push(cours); cours = []; } else cours.push({ x: p.x, y: p.y });
  }
  if (cours.length) troncons.push(cours);
  if (!troncons.length) return null;
  const simples = troncons.map((t) => simplifierLigne(t, TOLERANCE_M));
  const hauteurs = simples.flatMap((t) => t.map((p) => p.y));
  return { troncons: simples, largeur: mur.largeur, hauteurMax: Math.max(...hauteurs), hauteurMin: Math.min(...hauteurs) };
}
