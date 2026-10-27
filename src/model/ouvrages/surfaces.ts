// Les surfaces simples : une geometrie, une matiere, sans structure ni calcul (MD/spec-ouvrages.md) — « proche de la geometrie
// simple pour l'instant ». L'equipement est ce qu'on pose sur une terrasse (un jacuzzi) : la terrasse se renforce sous son emprise
// (engine/structure.ts, `findSpaZones`).

import type { Ouvrage } from './ouvrage.js';

export const MASSIF: Ouvrage = { fonction: 'massif', libelle: 'Massif', famille: 'surface', elevation: 0.6, auMenu: true };

export const MOBILIER: Ouvrage = { fonction: 'mobilier', libelle: 'Mobilier', famille: 'surface', elevation: 0.9, auMenu: true };

export const DALLE: Ouvrage = { fonction: 'dalle', libelle: 'Dalle', famille: 'surface', elevation: 0.02, auMenu: true };

export const EQUIPEMENT: Ouvrage = { fonction: 'equipement', libelle: 'Équipement', famille: 'surface', elevation: 0.9, auMenu: true };

/** Un chemin a une largeur ; un trace qui n'est pas un chemin n'en a pas. */
export const CHEMIN: Ouvrage = { fonction: 'chemin', libelle: 'Chemin', famille: 'surface', elevation: 0, auMenu: true, horsEquipement: true, aUneLargeur: true };
