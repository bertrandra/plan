// La cloture de la parcelle : ou elle est rangee (spec §3.2, ui/). Ses reglages sont la section
// Parcelle de l'inspecteur (ui/champs/objet.ts) depuis l'etape 4 de la reconstruction.
//
// La cloture est rattachee a **la parcelle**, pas a un etat global de la Vue 3D : elle se
// sauvegarde ainsi avec le projet, comme les champs Texture d'un objet, et non comme une simple
// preference d'affichage qu'on reperdrait a chaque ouverture.

import { parcelleDuProjet } from '../model/fonctions.js';

/** La parcelle qui porte la cloture — et aussi le lieu, l'orthophoto et le PLU (model/fonctions.ts). */
export const trouverParcelleCloture = parcelleDuProjet;
