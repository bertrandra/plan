// La piscine : un bassin sur un polygone ou un cercle — son volume, ses abords, sa filtration (MD/spec-ouvrages.md ; ses regles :
// engine/piscine/).

import type { Ouvrage } from './ouvrage.js';

export const PISCINE: Ouvrage = { fonction: 'piscine', libelle: 'Piscine', famille: 'construit', formes: ['polygon', 'circle'], particularites: ['bassin'], elevation: 0, auMenu: true, horsEquipement: true };
