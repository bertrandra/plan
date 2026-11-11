// Copie figee de Plan (src/facade/detection/classement.ts, commit e6b5cec2) : seule la regle de taille
// que le vote des baies appelle. Le banc n'importe rien de Plan.

import type { TypeOuverture } from '../../model/typesReleve.js';

/** Le type d'une baie, d'apres sa taille et sa hauteur d'appui (spec §11, regles d'avant le lot). */
export function classer(y: number, l: number, h: number): TypeOuverture {
  const auSol = y < 0.25;
  if (auSol && l >= 2.1 && h >= 1.8) return 'garage';
  if (auSol && h >= 1.8) return l >= 1.1 ? 'porte-fenetre' : 'porte';
  if (y < 0.45 && h >= 1.9) return 'porte-fenetre';
  return 'fenetre';
}
