// Les surfaces simples : une geometrie, une matiere, sans structure ni calcul (MD/spec-ouvrages.md) — « proche de la geometrie
// simple pour l'instant ». L'equipement est ce qu'on pose sur une terrasse (un jacuzzi) : la terrasse se renforce sous son emprise
// (engine/structure.ts, `findSpaZones`).

import type { Ouvrage } from './ouvrage.js';
import type { PtBrut } from '../types.js';
import { longueurTrace } from '../../geometry/courbe.js';

export const MASSIF: Ouvrage = { fonction: 'massif', libelle: 'Massif', famille: 'surface', elevation: 0.6, auMenu: true };

export const MOBILIER: Ouvrage = { fonction: 'mobilier', libelle: 'Mobilier', famille: 'surface', elevation: 0.9, auMenu: true };

export const DALLE: Ouvrage = { fonction: 'dalle', libelle: 'Dalle', famille: 'surface', elevation: 0.02, auMenu: true, dossierPiscine: { masse: true } };

export const EQUIPEMENT: Ouvrage = { fonction: 'equipement', libelle: 'Équipement', famille: 'surface', elevation: 0.9, auMenu: true };

/** Un chemin a une largeur ; un trace qui n'est pas un chemin n'en a pas. */
export const CHEMIN: Ouvrage = { fonction: 'chemin', libelle: 'Chemin', famille: 'surface', elevation: 0, auMenu: true, horsEquipement: true, aUneLargeur: true,
  dossierPiscine: { situation: true } };

/**
 * La largeur d'un chemin sans largeur ecrite, en metres. Une seule valeur : le dossier PDF lisait
 * 0,5 m quand l'inspecteur, le resume, le plan PDF et la 3D lisaient 1 m, si bien qu'un meme ancien
 * fichier avait deux surfaces (decision du 27 octobre 2026 : 1 m partout).
 */
export const LARGEUR_CHEMIN_DEFAUT = 1;

/** Ce qu'un chemin donne a lire pour sa largeur et sa longueur : ses points, sa largeur, son lissage. */
export interface TraceChemin { pts?: readonly PtBrut[]; width?: number; curve?: boolean }

/** La largeur d'un trace (un chemin), en metres : la sienne, ou celle par defaut. */
export function largeurChemin(o: { width?: number }): number {
  return o.width || LARGEUR_CHEMIN_DEFAUT;
}

/** La longueur du trace dessine, en metres : la courbe quand il est courbe, la ligne brisee sinon. */
export function longueurChemin(o: TraceChemin): number {
  return longueurTrace(o.pts ?? [], o.curve);
}

/**
 * La surface d'un chemin, en metres carres : longueur du trace dessine x largeur. Ce n'est pas
 * l'aire exacte du ruban (les virages la deforment), c'est l'emprise que les exports annoncent en
 * face du nombre (« longueur x largeur »), la seule comparable d'un document a l'autre.
 */
export function surfaceChemin(o: TraceChemin): number {
  return longueurChemin(o) * largeurChemin(o);
}
