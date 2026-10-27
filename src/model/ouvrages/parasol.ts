// Le parasol : l'ombre portee est celle d'une toile ronde, donc un cercle (MD/spec-ouvrages.md ; ses regles : engine/parasol.ts).

import type { Ouvrage } from './ouvrage.js';

export const PARASOL: Ouvrage = { fonction: 'parasol', libelle: 'Parasol', famille: 'construit', formes: ['circle'], particularites: ['parasol'], elevation: 2.2, auMenu: true, horsEquipement: true, sansEmprise: true };
