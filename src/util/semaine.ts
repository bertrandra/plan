// Le curseur « semaine » qui accompagne la date, dans la Vue 3D comme dans la visionneuse GLB.
//
// Les deux vues reglent leur soleil separement, mais avec la meme convention. Elle tenait en deux
// morceaux dupliques dans chaque ecouteur ; la voici en un seul endroit.

import { lireDate } from './date.js';


/**
 * Position du curseur pour une date : le rang du bloc de 7 jours depuis le 1er janvier, plafonne
 * a 52.
 *
 * **Ce n'est pas la semaine ISO**, et c'est voulu : le curseur sert a naviguer vite d'une semaine a
 * l'autre, pas a nommer officiellement une semaine. Un pas regulier de 7 jours depuis le 1er
 * janvier donne un deplacement previsible ; la numerotation ISO, avec sa semaine 1 qui commence
 * parfois en decembre, ferait sauter le curseur pour rien.
 */
export function anneeEtSemaineDepuisDate(dateStr: string): { annee: number; semaine: number } {
  // Une date illisible met le curseur en tete de l'annee en cours plutot que sur NaN.
  const { annee, mois, jour } = lireDate(dateStr) ?? { annee: new Date().getUTCFullYear(), mois: 1, jour: 1 };
  const jours = Math.floor((Date.UTC(annee, mois - 1, jour) - Date.UTC(annee, 0, 1)) / 86400000);
  return { annee, semaine: Math.min(52, Math.floor(jours / 7)) };
}

/**
 * La date decalee de `deltaSemaines` crans, en `AAAA-MM-JJ`.
 *
 * Le decalage est **relatif** : chaque cran vaut exactement 7 jours a partir de la date courante.
 * Recalculer une position absolue depuis le 1er janvier ferait sauter d'un nombre de jours
 * irregulier au premier cran, des que la date ne tombe pas pile sur un multiple de 7 jours — le cas
 * general. Consequence assumee : le curseur peut sortir de son annee, et la position affichee n'est
 * plus forcement celle que `anneeEtSemaineDepuisDate` rendrait.
 */
export function dateDecaleeDeSemaines(dateStr: string, deltaSemaines: number): string {
  // Une date illisible ne se decale pas : `toISOString()` leverait sur la date invalide.
  const d = lireDate(dateStr);
  if (!d) return dateStr;
  const { annee, mois, jour } = d;
  return new Date(Date.UTC(annee, mois - 1, jour) + deltaSemaines * 7 * 86400000).toISOString().slice(0, 10);
}
