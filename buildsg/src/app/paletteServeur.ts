// Applique a la page la palette enregistree sur le serveur (`admin/palette`).
//
// Au demarrage de chaque page, sans attendre : la page s'affiche avec les couleurs d'origine de la
// feuille, puis la palette du serveur se pose par-dessus des qu'elle arrive. Sans palette, sans
// admin configure (404) ou sans reseau, rien ne change : ce sont les couleurs d'origine.
//
// Le plan dessine en SVG suit aussi : ses encres (render/theme.ts) se reprennent dans la palette, au
// theme affiche, et l'evenement `plan:encres` demande a l'atelier de le redessiner. Les exports
// gardent leurs propres encres : la palette regle l'ecran, pas les nombres ni les fichiers produits.

import { lirePalette } from '../io/depotDemos.js';
import { EVENEMENT_ENCRES, poserEncres, themeSombre } from '../render/theme.js';
import { cssPalette, lireDocumentPalette, type Couleurs } from '../styles/paletteServeur.js';

const ID_FEUILLE = 'paletteServeur';

/** Pose (ou remplace) la feuille de la palette, apres celle de l'application. */
export function appliquerPalette(couleurs: Couleurs): void {
  let feuille = document.getElementById(ID_FEUILLE) as HTMLStyleElement | null;
  if (!feuille) {
    feuille = document.createElement('style');
    feuille.id = ID_FEUILLE;
    document.head.appendChild(feuille);
  }
  feuille.textContent = cssPalette(couleurs);
  poserEncres(couleurs[themeSombre ? 'sombre' : 'clair']);
  window.dispatchEvent(new Event(EVENEMENT_ENCRES));
}

/** Lit la palette du serveur et l'applique ; rend ses couleurs, ou `null` sans palette. Ne leve jamais. */
export async function chargerPaletteServeur(f: (entree: string, init?: RequestInit) => Promise<Response> = (e, i) => fetch(e, i)): Promise<{ couleurs: Couleurs; modifieLe: string | null } | null> {
  try {
    const lue = lireDocumentPalette(await lirePalette(f));
    if (lue) appliquerPalette(lue.couleurs);
    return lue;
  } catch {
    return null;
  }
}
