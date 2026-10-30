// La table des mots de couverture (lot L2 de MD/spec-lecture-ia-elargie.md §4.3) : ce que lisent l'analyse d'une maison
// (deploy/schema-analyse.json, `couverture.valeur`), la lecture d'une facade (son toit, `couverture` et `pose`) et ce que la personne
// note sur place (« Ce que je vois »), ramene a ce que le projet range dans `Toit` : un materiau (`couverture`) et un motif de pose
// (`pose`). Une seule table, qui remplace les traductions que chaque lecteur faisait a sa main (le sujet `couverture`, l'arbitrage,
// le controle du PLU). Pur.
//
// Deux choix, dits ici parce qu'ils ne se voient pas dans les mots :
// - `tuile-mecanique` se range sous `tuile` : c'est deja la tuile mecanique (« Tuiles mécaniques » de « Ce que je vois », la texture
//   romane de la 3D). Un mot neuf aurait fait se contredire l'analyse d'une maison et les fichiers fonciers qui s'accordaient avant.
// - `ardoise-losange` reste un MOT (l'analyse d'une maison le lit, la personne le note), mais n'est plus un materiau : c'est une
//   `ardoise` posee en `losange`. Les fichiers d'avant le schema 11 sont relus ainsi (model/migrations.ts).

import type { CouvertureChoisie, PoseCouverture, Toit } from './typesToit.js';

/** Un mot de couverture lu ou note (le vocabulaire de l'analyse d'une maison, plus celui de « Ce que je vois »). */
export type MotCouverture = CouvertureChoisie | 'tuile-mecanique' | 'ardoise-losange' | 'ardoise-ecaille' | 'tuile-plate-ecaille';

/** Ce qu'un mot ecrit dans le projet : un materiau, et sa pose quand le mot la dit. */
export interface CouvertureEtPose { couverture: CouvertureChoisie; pose?: PoseCouverture }

const TABLE: Readonly<Record<MotCouverture, CouvertureEtPose>> = {
  tuile: { couverture: 'tuile' },
  'tuile-mecanique': { couverture: 'tuile' },
  'tuile-plate': { couverture: 'tuile-plate' },
  'tuile-canal': { couverture: 'tuile-canal' },
  ardoise: { couverture: 'ardoise' },
  'ardoise-losange': { couverture: 'ardoise', pose: 'losange' },
  // L'ecaille n'a pas de mot a elle dans l'analyse d'une maison : seule la facade, vue de pres, la lit (lot L2). Le mot sert a
  // l'arbitrage, pour qu'une ardoise en ecaille ne s'accorde pas avec une ardoise en rangs droits.
  'ardoise-ecaille': { couverture: 'ardoise', pose: 'ecaille' },
  'tuile-plate-ecaille': { couverture: 'tuile-plate', pose: 'ecaille' },
  zinc: { couverture: 'zinc' },
  'bac-acier': { couverture: 'bac-acier' },
  membrane: { couverture: 'membrane' },
  vegetale: { couverture: 'vegetale' },
};

/** Les couvertures que l'on peut imposer, dans l'ordre de l'inspecteur. */
export const COUVERTURES_CHOISIES: readonly CouvertureChoisie[] = ['tuile', 'tuile-plate', 'tuile-canal', 'ardoise', 'zinc', 'bac-acier', 'membrane', 'vegetale'];
export const POSES_COUVERTURE: readonly PoseCouverture[] = ['droite', 'losange', 'ecaille'];

/** Le materiau et la pose d'un mot lu ; null pour un mot que le projet ne range pas (`gravillons` : un toit plat, `indetermine`). */
export function couvertureDuMot(mot: string): CouvertureEtPose | null {
  return Object.prototype.hasOwnProperty.call(TABLE, mot) ? TABLE[mot as MotCouverture] : null;
}

/**
 * Les poses qui se dessinent sur un materiau : le losange sur l'ardoise, l'ecaille sur l'ardoise et la tuile plate (les deux seules
 * couvertures a petits elements plats qui se taillent en ecaille). Une autre pose se range, mais se dessine en rangs droits.
 */
export function poseAdmise(couverture: CouvertureChoisie | 'terrasse', pose: PoseCouverture | undefined): PoseCouverture | undefined {
  if (pose === 'losange') return couverture === 'ardoise' ? pose : undefined;
  if (pose === 'ecaille') return couverture === 'ardoise' || couverture === 'tuile-plate' ? pose : undefined;
  return undefined;
}

/**
 * Le mot d'arbitrage d'une couverture et de sa pose : `ardoise-losange` pour l'ardoise en losange (le mot que lisent les autres
 * sources), `…-ecaille` pour une pose en ecaille, le materiau seul sinon (une pose qui ne s'y dessine pas ne compte pas).
 */
export function motDeLaCouverture(couverture: CouvertureChoisie, pose: PoseCouverture | undefined): MotCouverture {
  const p = poseAdmise(couverture, pose);
  if (p === 'losange') return 'ardoise-losange';
  if (p === 'ecaille') return couverture === 'ardoise' ? 'ardoise-ecaille' : 'tuile-plate-ecaille';
  return couverture;
}

const LIBELLES: Readonly<Record<MotCouverture, string>> = {
  tuile: 'Tuiles mécaniques', 'tuile-mecanique': 'Tuiles mécaniques', 'tuile-plate': 'Tuiles plates', 'tuile-canal': 'Tuiles canal', ardoise: 'Ardoise',
  'ardoise-losange': 'Grande ardoise en losange', 'ardoise-ecaille': 'Ardoise en écaille', 'tuile-plate-ecaille': 'Tuiles plates en écaille',
  zinc: 'Zinc', 'bac-acier': 'Bac acier', membrane: 'Membrane d’étanchéité', vegetale: 'Toiture végétalisée',
};

/** Un mot de couverture en clair ; le mot lui-meme s'il n'est pas de la table. */
export const libelleMotCouverture = (mot: string): string => (Object.prototype.hasOwnProperty.call(LIBELLES, mot) ? LIBELLES[mot as MotCouverture] : mot);

/** Le mot de couverture d'un toit (sa couverture choisie et sa pose), ou null sans couverture choisie. */
export const motDuToit = (t: Pick<Toit, 'couverture' | 'pose'> | null | undefined): MotCouverture | null => (t?.couverture ? motDeLaCouverture(t.couverture, t.pose) : null);
