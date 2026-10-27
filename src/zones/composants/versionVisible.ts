// La version du plan qu'une zone portee par une feuille du telephone suit (MD/roadmap-architecture.md, etape 2.2).
//
// Au telephone, l'inspecteur, l'explorateur, les resultats et la palette ne se voient que dans leur feuille : feuille fermee, la
// zone est hors de l'ecran (feuille de style, `html[data-feuille]`). Elle se redessinait pourtant a chaque rendu du plan, et c'etait
// l'essentiel d'un rendu au telephone (banc de rendu, octobre 2026 : l'inspecteur seul, plus que le plan). Tant que sa feuille est
// fermee, la zone garde ce qu'elle montrait ; elle se redessine des que sa feuille s'ouvre, avec l'etat du moment. Rien ne change
// sur tablette ni au bureau, ou ces zones restent a l'ecran.

import { useStore } from 'zustand';
import type { Feuille, Magasin } from '../../app/magasin.js';

/** La version que lit une zone cachee : constante, donc sans rendu tant qu'elle le reste. */
const GELEE = -1;

/** A appeler a la place de `useStore(magasin.store, (s) => s.version)` dans une zone portee par la feuille `feuille`. */
export function useVersionVisible(magasin: Magasin, feuille: Feuille): number {
  return useStore(magasin.store, (s) => (s.classe === 'compact' && s.feuille !== feuille ? GELEE : s.version));
}
