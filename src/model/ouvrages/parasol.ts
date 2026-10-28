// Le parasol : l'ombre portee est celle d'une toile ronde, donc un cercle (MD/spec-ouvrages.md ; ses regles : engine/parasol.ts).

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan } from '../types.js';

/** La terrasse rattachee est supprimee : le parasol retombe sur celle qui le contient, puis sur la terrasse courante. */
function oublierParasol(o: ObjetPlan, cle: string): boolean {
  if (o.parasol?.terrasseLieeKey !== cle) return false;
  o.parasol.terrasseLieeKey = null;
  return true;
}

export const PARASOL: Ouvrage = { fonction: 'parasol', libelle: 'Parasol', famille: 'construit', formes: ['circle'], particularites: ['parasol'], elevation: 2.2, auMenu: true, horsEquipement: true, sansEmprise: true, oublier: oublierParasol };
