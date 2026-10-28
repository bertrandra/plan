// Le registre des ouvrages du modele (MD/spec-ouvrages.md, etape 6.2) : chaque ouvrage, une fois, et les tables qui en derivent.

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan, PtBrut } from '../types.js';
import { deplacementRigide } from '../../geometry/deplacement.js';
import { TERRAIN, ARBRE, LIMITE, POINT_DE_VUE, AUTRE } from './contexte.js';
import { BATIMENT, ANNEXE } from './bati.js';
import { TERRASSE } from './terrasse.js';
import { PERGOLA, CARPORT } from './abri.js';
import { PISCINE } from './piscine.js';
import { PARASOL } from './parasol.js';
import { MASSIF, MOBILIER, DALLE, EQUIPEMENT, CHEMIN } from './surfaces.js';
import { TREMIE } from './ouverture.js';

export type { Ouvrage, Famille, Forme, Particularite } from './ouvrage.js';
export type { NatureAbri } from './abri.js';
export { LARGEUR_CHEMIN_DEFAUT, largeurChemin, longueurChemin, surfaceChemin, type TraceChemin } from './surfaces.js';
export { TERRAIN, ARBRE, LIMITE, POINT_DE_VUE, AUTRE, BATIMENT, ANNEXE, TERRASSE, PERGOLA, CARPORT, PISCINE, PARASOL, MASSIF, MOBILIER, DALLE,
  EQUIPEMENT, CHEMIN, TREMIE };

/** Les ouvrages, dans l'ordre du menu « Fonction ». */
export const OUVRAGES: readonly Ouvrage[] = [TERRAIN, BATIMENT, ANNEXE, ARBRE, TERRASSE, MASSIF, MOBILIER, DALLE, EQUIPEMENT, CHEMIN, PARASOL,
  PERGOLA, CARPORT, PISCINE, TREMIE, LIMITE, AUTRE, POINT_DE_VUE];

const PAR_FONCTION = new Map(OUVRAGES.map((o) => [o.fonction, o]));

/** L'ouvrage d'une fonction ; une fonction absente ou inconnue (un ancien fichier) se comporte comme `autre`. */
export function ouvrage(fonction: string | undefined | null): Ouvrage {
  return PAR_FONCTION.get(fonction || '') ?? AUTRE;
}

/** L'ouvrage declare pour cette fonction, sans repli : `undefined` pour une fonction inconnue. */
export const ouvrageDeclare = (fonction: string | undefined | null): Ouvrage | undefined => PAR_FONCTION.get(fonction || '');

/** L'objet est-il de cet ouvrage ? Sa fonction, telle qu'ecrite, sans regarder sa forme. */
export const estOuvrage = (o: { fonction?: string | null }, ouv: Ouvrage): boolean => o.fonction === ouv.fonction;

/**
 * Le contour de l'objet passe de `avant` a `apres` : s'il a bouge d'un bloc, son ouvrage fait suivre ce qu'il porte en coordonnees
 * absolues (MD/spec-ouvrages.md, etape 6.3). A appeler par tout geste qui deplace ou tourne un objet, avant ou apres avoir pose
 * le nouveau contour : seuls les deux contours comptent.
 */
export function suivreLeContour(o: ObjetPlan, avant: readonly PtBrut[], apres: readonly PtBrut[]): void {
  const suivre = ouvrage(o.fonction).suivreContour;
  if (!suivre) return;
  const d = deplacementRigide(avant, apres);
  if (d) suivre(o, d);
}

/** Les fonctions proposees par le menu « Fonction », dans son ordre. */
export const FONCTIONS_AU_MENU: readonly string[] = OUVRAGES.filter((o) => o.auMenu).map((o) => o.fonction);

/** Libelles francais des fonctions d'objet. */
export const LIBELLES: Readonly<Record<string, string>> = Object.fromEntries(OUVRAGES.map((o) => [o.fonction, o.libelle]));

/** Hauteur par defaut selon la fonction, en metres : ce qui rend la Vue 3D lisible sans reglage. */
export const ELEVATIONS: Readonly<Record<string, number>> = Object.fromEntries(OUVRAGES.filter((o) => o.elevation !== undefined).map((o) => [o.fonction, o.elevation as number]));

/** Fonctions qui ne comptent pas comme equipement pose sur une terrasse (dossier PDF). */
export const HORS_EQUIPEMENT: readonly string[] = OUVRAGES.filter((o) => o.horsEquipement).map((o) => o.fonction);
