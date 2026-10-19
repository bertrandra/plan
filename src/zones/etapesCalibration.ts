// Les images des etapes d'un cas de calibration (admin › Calibrer la detection) : chaque photo redressee seule, et l'elevation
// fusionnee avec la part du mur cachee sur toutes les vues, hachuree. Sans DOM : l'ecran les met en JPEG (outils.elevationEnUrl).

import { redresser, resolutionTexture, type Image, type P2 } from '../facade/homographie.js';

/** Le grand cote d'une vignette d'etape : de quoi juger un redressement, sans le poids d'une elevation entiere. */
const COTE_VIGNETTE_PX = 480;

/** Une photo redressee seule entre ses coins, a la taille d'une vignette ; null quand ses coins ne forment pas un mur. */
export function photoRedressee(image: Image, coins: readonly P2[], largeurM: number, hauteurM: number): Image | null {
  if (coins.length !== 4 || !(largeurM > 0) || !(hauteurM > 0)) return null;
  return redresser(image, coins, largeurM, hauteurM, resolutionTexture(largeurM, hauteurM, COTE_VIGNETTE_PX))?.image ?? null;
}

/** L'elevation, la part cachee sur toutes les vues hachuree (une rayure sur trois assombrie) : ce que la detection n'a pas lu. */
export function elevationAvecMasque(elevation: Image, occlusion: Uint8Array | null): Image {
  const donnees = new Uint8ClampedArray(elevation.donnees);
  if (occlusion && occlusion.length === elevation.largeur * elevation.hauteur) {
    for (let y = 0; y < elevation.hauteur; y++) for (let x = 0; x < elevation.largeur; x++) {
      const i = y * elevation.largeur + x;
      if (!occlusion[i] || (x + y) % 9 > 2) continue;
      donnees[i * 4] = (donnees[i * 4] ?? 0) * 0.3; donnees[i * 4 + 1] = (donnees[i * 4 + 1] ?? 0) * 0.3; donnees[i * 4 + 2] = (donnees[i * 4 + 2] ?? 0) * 0.3;
    }
  }
  return { largeur: elevation.largeur, hauteur: elevation.hauteur, donnees };
}
