// Valeurs par defaut du modele (spec §3.2, model/defaults.ts).

import { LIBELLES, HORS_EQUIPEMENT, ELEVATIONS } from './ouvrages/index.js';

/** Libelles francais des fonctions d'objet, utilises par le selecteur et les panneaux (model/ouvrages/). */
export const LIBELLE_FONCTION: Record<string, string> = { ...LIBELLES };

/** Fonctions qui ne comptent pas comme equipement pose sur une terrasse (dossier PDF ; model/ouvrages/). */
export const FONCTIONS_HORS_EQUIPEMENT: string[] = [...HORS_EQUIPEMENT];

/** Lieu de repli quand la parcelle ne porte pas de coordonnees. */
export const LIEU_DEFAUT = { nom: 'Le Vésinet', latitude: 48.8923, longitude: 2.1331 };

// Hauteur par defaut selon la fonction, en metres : ce qui rend la Vue 3D lisible sans reglage (model/ouvrages/).
export const ELEVATION_DEFAUT: Record<string, number> = { ...ELEVATIONS };
export function elevationParDefaut(fonction: string): number {
  return ELEVATION_DEFAUT[fonction] !== undefined ? ELEVATION_DEFAUT[fonction] : 0.5;
}
