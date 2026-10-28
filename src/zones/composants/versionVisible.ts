// La version du plan que suit une zone, tant qu'elle est a l'ecran (MD/roadmap-architecture.md, etape 2.2).
//
// Une regle pour les trois classes d'ecran : une zone que l'on ne voit pas ne se redessine pas ; elle garde ce qu'elle montrait et
// se redessine des qu'elle redevient visible, avec l'etat du moment. Les fonctions sont les memes partout, seule change la maniere
// dont une zone se cache : au telephone, dans sa feuille fermee (hors de l'ecran, `html[data-feuille]`) ; sur tablette et au
// bureau, repliee (l'inspecteur et l'explorateur reduits a leur bouton).
//
// Le tiroir des resultats n'en est pas tout entier : ses commandes servent feuille fermee (les cotes se prennent sur le plan avec les
// boutons du panneau Cotes, point 11 de la fumee), et le chiffrage s'y relit pendant qu'on regle la terrasse dans l'inspecteur
// (point 17). Seul le tableau des cotes posees, qui calcule, s'y gele (zones/resultats/Cotes.tsx).
//
// Au telephone, ces zones cachees se redessinaient a chaque rendu du plan, et c'etait l'essentiel d'un rendu (banc de rendu,
// octobre 2026 : l'inspecteur seul coutait plus que le plan).

import type { EtatMagasin, Feuille } from '../../app/magasin.js';

/** Les zones qui peuvent se cacher : la feuille qui les porte au telephone, et ce qui les replie ailleurs. */
const ZONES = {
  inspecteur: { feuille: 'proprietes', depliee: (s: EtatMagasin) => s.inspecteurOuvert },
  explorateur: { feuille: 'objets', depliee: (s: EtatMagasin) => s.explorateurOuvert },
  palette: { feuille: 'outils', depliee: () => true },
  resultats: { feuille: 'resultats', depliee: (s: EtatMagasin) => s.tiroir !== 'replie' },
} satisfies Record<string, { feuille: Feuille; depliee: (s: EtatMagasin) => boolean }>;

export type ZoneMasquable = keyof typeof ZONES;

/** La zone est-elle a l'ecran ? Au telephone, si sa feuille est ouverte ; ailleurs, si elle n'est pas repliee. */
export function zoneVisible(s: EtatMagasin, zone: ZoneMasquable): boolean {
  const z = ZONES[zone];
  return s.classe === 'compact' ? s.feuille === z.feuille : z.depliee(s);
}

// Une zone cachee gele sa cle : `useCle(magasin, nom, lire, zone)` (zones/composants/abonnement.ts).
