// La cloture de la parcelle : ou elle est rangee (spec §3.2, ui/). Ses reglages sont la section
// Parcelle de l'inspecteur (ui/champs/objet.ts) depuis l'etape 4 de la reconstruction.
//
// La cloture est rattachee a **la parcelle**, pas a un etat global de la Vue 3D : elle se
// sauvegarde ainsi avec le projet, comme les champs Texture d'un objet, et non comme une simple
// preference d'affichage qu'on reperdrait a chaque ouverture.

import type { ObjetPlan } from '../model/types.js';

/**
 * La parcelle qui porte la cloture — et aussi le lieu, l'orthophoto et le PLU.
 *
 * **Deux passes plutot qu'un `find()` a deux criteres**, et c'est le piege : depuis l'import
 * cadastre, les parcelles *voisines* sont elles aussi `fonction === 'terrain'`. Un `find()` unique
 * rendrait la premiere du tableau, donc potentiellement une voisine — et la cloture comme la course
 * du soleil se retrouveraient rattachees au terrain d'a cote.
 */
export function trouverParcelleCloture(objets: ObjetPlan[]): ObjetPlan | undefined {
  return objets.find(o => o.key === 'parcelle') || objets.find(o => o.fonction === 'terrain');
}
