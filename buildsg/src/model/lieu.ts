// Ou se trouve la parcelle : ce qui cale la course du soleil, le fond orthophoto et le PLU.
//
// Le lieu est **rattache a la parcelle**, pas au reglage de l'application : il se sauvegarde ainsi
// avec le projet, sans faire transiter une cle de plus par `api.php`. Les champs sont poses au
// premier acces plutot qu'a la creation, pour qu'un projet enregistre avant qu'ils existent en
// herite sans migration.

import { LIEU_DEFAUT } from './defaults.js';
import type { ObjetPlan } from './types.js';

export interface Lieu { nom: string; latitude: number; longitude: number }

/** Ce qu'il faut pour porter un lieu : trois champs, que la parcelle a et que les autres objets ignorent. */
export type PorteurDeLieu = Pick<ObjetPlan, 'latitude' | 'longitude' | 'nomLieu'>;

/**
 * Le lieu de la parcelle donnee, ou le lieu par defaut s'il n'y a pas de parcelle.
 *
 * Effet de bord assume : les champs manquants sont **ecrits sur la parcelle**. Sans cela, un projet
 * ancien afficherait le lieu par defaut sans jamais l'enregistrer, et le perdrait a chaque
 * reouverture.
 */
export function lieuDeParcelle(parcelle: PorteurDeLieu | null | undefined): Lieu {
  if (!parcelle) return LIEU_DEFAUT;
  if (parcelle.latitude === undefined || parcelle.latitude === null) parcelle.latitude = LIEU_DEFAUT.latitude;
  if (parcelle.longitude === undefined || parcelle.longitude === null) parcelle.longitude = LIEU_DEFAUT.longitude;
  if (!parcelle.nomLieu) parcelle.nomLieu = LIEU_DEFAUT.nom;
  return { nom: parcelle.nomLieu, latitude: parcelle.latitude, longitude: parcelle.longitude };
}

/**
 * Libelle du lieu, partage par l'entete du plan, la Vue 3D et la visionneuse GLB : une seule
 * formulation, donc pas de risque d'en voir deux differentes sur la meme page.
 */
export function libelleLieuTexte(lieu: Lieu): string {
  return '📍 ' + lieu.nom + ' — ' + lieu.latitude.toFixed(4).replace('.', ',') + '° N, ' +
         lieu.longitude.toFixed(4).replace('.', ',') + '° E';
}
