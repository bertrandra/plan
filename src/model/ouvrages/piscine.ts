// La piscine : un bassin sur un polygone ou un cercle — son volume, ses abords, sa filtration (MD/spec-ouvrages.md ; ses regles :
// engine/piscine/).

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan } from '../types.js';
import { coteSuivi, type Deformation } from '../referencesContour.js';

/** Le cote du petit bain suit son mur : sans cela, le petit bain changeait de bout, et avec lui le volume d'eau et le prix. */
function suivreDeformationPiscine(o: ObjetPlan, d: Deformation): void {
  const p = o.piscine;
  if (p && typeof p.cotePetitBain === 'number') p.cotePetitBain = coteSuivi(d, p.cotePetitBain);
}

/** La terrasse qui servait de plage est supprimee : le bassin ne la tient plus (comme une piscine dupliquee, model/creation.ts). */
function oublierPiscine(o: ObjetPlan, cle: string): boolean {
  if (o.piscine?.terrasseKey !== cle) return false;
  delete o.piscine.terrasseKey;
  return true;
}

export const PISCINE: Ouvrage = { fonction: 'piscine', libelle: 'Piscine', famille: 'construit', formes: ['polygon', 'circle'], particularites: ['bassin'], elevation: 0, auMenu: true, horsEquipement: true,
  suivreDeformation: suivreDeformationPiscine, oublier: oublierPiscine };
