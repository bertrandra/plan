import { RAYON_LEGER_M, RAYON_PROGRESSIF_M, MAX_OBJETS_RAYON } from '../../geo/apiIgn.js';

/**
 * Ce que l'on dit quand le curseur du voisinage depasse le rayon « leger » : au-dela, le plan
 * s'alourdit vite, et la plateforme peut refuser de l'enregistrer (PAYLOAD_TOO_LARGE). Le meme
 * texte dans l'import depuis une adresse et dans l'actualisation.
 */
export const AVERTISSEMENT_RAYON = 'Au-delà de ' + RAYON_LEGER_M + ' m, le plan s’alourdit vite (jusqu’à ' + MAX_OBJETS_RAYON
  + ' parcelles et autant de bâtiments) : l’affichage ralentit et l’enregistrement sur la plateforme peut être refusé pour cause de taille.';

/**
 * Au-dela d'un kilometre, le plafond par famille peut jouer dans une ville dense : on le dit, et que
 * le relief du paysage, lui, va jusqu'au rayon choisi. Le compte au-dessus dit s'il a joue.
 */
export function avertissementRayon(rayonM: number): string {
  return rayonM > RAYON_PROGRESSIF_M
    ? AVERTISSEMENT_RAYON + ' Au-delà de ' + (RAYON_PROGRESSIF_M / 1000) + ' km, dans une ville dense, seuls les plus proches entrent dans le plan ; le relief du paysage, lui, va jusqu’au rayon choisi.'
    : AVERTISSEMENT_RAYON;
}
