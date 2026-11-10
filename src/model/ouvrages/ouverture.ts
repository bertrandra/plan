// Les ouvertures : un trou de terrasse (un arbre conserve, une trappe) — la terrasse s'arrete a son bord, sur un polygone ou un
// cercle (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';

export const TREMIE: Ouvrage = { fonction: 'tremie', libelle: 'Trou de terrasse', famille: 'ouverture', formes: ['polygon', 'circle'], particularites: ['ouverture'], elevation: 0, auMenu: true, horsEquipement: true, sansEmprise: true };
