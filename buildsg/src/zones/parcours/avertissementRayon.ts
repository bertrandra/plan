import { RAYON_LEGER_M, MAX_OBJETS_RAYON } from '../../geo/apiIgn.js';

/**
 * Ce que l'on dit quand le curseur du voisinage depasse le rayon « leger » : au-dela, le plan
 * s'alourdit vite, et la plateforme peut refuser de l'enregistrer (PAYLOAD_TOO_LARGE). Le meme
 * texte dans l'import depuis une adresse et dans l'actualisation.
 */
export const AVERTISSEMENT_RAYON = 'Au-delà de ' + RAYON_LEGER_M + ' m, le plan s’alourdit vite (jusqu’à ' + MAX_OBJETS_RAYON
  + ' parcelles et autant de bâtiments) : l’affichage ralentit et l’enregistrement sur la plateforme peut être refusé pour cause de taille.';
