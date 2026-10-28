// La terrasse : un polygone qui se calcule (structure, lames, appuis) et se chiffre (MD/spec-ouvrages.md ; ses regles :
// engine/structure.ts, layers.ts, bom.ts).

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan } from '../types.js';
import { coteSuivi, cotesSuivis, type Deformation } from '../referencesContour.js';

/**
 * Le cote qui donne le sens des lames et les cotes sans lame de rive suivent leur mur : sans cela, un sommet ajoute faisait tourner
 * les lames, donc changer la nomenclature et le prix, sans que rien ne le dise (MD/spec-ouvrages.md, references par numero).
 */
function suivreDeformationTerrasse(o: ObjetPlan, d: Deformation): void {
  const c = o.construction;
  if (!c) return;
  if (typeof c.segmentReference === 'number') c.segmentReference = coteSuivi(d, c.segmentReference);
  if (c.cotesSansRive?.length) c.cotesSansRive = cotesSuivis(d, c.cotesSansRive);
}

export const TERRASSE: Ouvrage = { fonction: 'terrasse', libelle: 'Terrasse', famille: 'construit', formes: ['polygon'], particularites: ['construction'], elevation: 0, auMenu: true, horsEquipement: true,
  suivreDeformation: suivreDeformationTerrasse };
