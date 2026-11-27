// Les reglages des rues dessinees : sous « Rues », dans le menu Affichage (MD/spec-rues.md §8, ui/).
//
// Deux champs de la parcelle du projet, rendus dans le menu par le meme composant que l'inspecteur (zones/composants/Champs.tsx) :
// la part de l'espace entre les parcelles que prend chaque trottoir, et les couleurs des rues (« Plan » ou « Réelles »). Ils suivent
// la regle de l'option « Rues » elle-meme : des preferences d'affichage, ni Ctrl+Z ni permis refuse en lecture seule (`sale: false`),
// mais le projet est a enregistrer pour les retrouver a la reouverture (`enregistre`). Ils ne se montrent que « Rues » cochee.

import { ruesTracees } from '../../model/rues.js';
import {
  partTrottoirs, reglerPartTrottoirs, couleursRues, reglerCouleursRues, PART_TROTTOIRS_MIN, PART_TROTTOIRS_MAX, PART_TROTTOIRS_PAS,
} from '../../model/trottoirs.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

/** Le plan et la Vue 3D se redessinent ; le menu se relit (il suit le magasin). */
const effets: Effet[] = ['rendu', 'scene3d'];
const traces = (c: ContexteChamps) => ruesTracees(c.obj);

/** « Trottoirs 20 % · Chaussée 60 % » : la part de chaque trottoir, et celle qui reste a la chaussee quand rien ne la borne. */
export function libellePart(pourCent: number): string {
  return 'Trottoirs ' + pourCent + ' % · Chaussée ' + (100 - 2 * pourCent) + ' %';
}

/** Les reglages des rues dessinees, sur la parcelle du projet ; `null` pour tout autre objet. */
export function sectionRues(c: ContexteChamps): Section | null {
  if (!c.parcelle || c.parcelle.key !== c.obj.key) return null;
  const champs: Champ[] = [
    {
      type: 'curseur', cle: 'partTrottoirs', libelle: 'Trottoirs / rue', min: PART_TROTTOIRS_MIN, max: PART_TROTTOIRS_MAX, pas: PART_TROTTOIRS_PAS,
      format: libellePart, visible: traces, sale: false, enregistre: true, effets,
      aide: 'La part de l’espace entre les parcelles que prend chaque trottoir : 1,40 m au moins, et la chaussée garde au moins 3 m. Sous 5,80 m, la rue reste sans trottoir',
      lire: (cc) => partTrottoirs(cc.obj),
      ecrire: (cc, v) => reglerPartTrottoirs(cc.obj, v),
    },
    {
      type: 'choix', cle: 'couleursRues', libelle: 'Couleurs des rues', visible: traces, sale: false, enregistre: true, effets,
      aide: 'Plan : l’ambre d’une carte routière. Réelles : l’enrobé, le béton et le granit. Sur le plan et en Vue 3D',
      options: () => [{ valeur: 'plan', libelle: 'Plan' }, { valeur: 'reelles', libelle: 'Réelles' }],
      lire: (cc) => couleursRues(cc.obj),
      ecrire: (cc, v) => reglerCouleursRues(cc.obj, v === 'reelles' ? 'reelles' : 'plan'),
    },
  ];
  return { id: 'rues', titre: 'Rues', champs };
}
