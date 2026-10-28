// La terrasse : un polygone qui se calcule (structure, lames, appuis) et se chiffre (MD/spec-ouvrages.md ; ses regles :
// engine/structure.ts, layers.ts, bom.ts).

import type { Ouvrage } from './ouvrage.js';

export const TERRASSE: Ouvrage = { fonction: 'terrasse', libelle: 'Terrasse', famille: 'construit', formes: ['polygon'], particularites: ['construction'], elevation: 0, auMenu: true, horsEquipement: true,
  dossierPiscine: { masse: true } };
