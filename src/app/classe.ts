// La classe d'ecran : telephone, tablette ou bureau (MD/spec-ihm-mobile.md §4).
//
// Une seule application, trois dispositions. La classe se lit sur la largeur de la fenetre — pas sur
// l'appareil : un telephone en paysage est une tablette pour la mise en page, une fenetre de bureau
// etroite est un telephone. Elle est posee a deux endroits :
//
//   - sur `<html data-classe="…">`, pour la feuille de style, qui porte l'essentiel de la
//     difference entre les trois ;
//   - dans le magasin, pour les zones qui rendent autre chose selon la classe (la barre de
//     navigation n'existe que sur telephone, un nombre devient un pas a pas).
//
// Passer d'une classe a l'autre ne perd rien : selection, onglet, brouillons restent. Seule la
// feuille ouverte se referme en quittant le telephone, sauf celles que la tablette montre aussi.

import type { Classe } from './exposition.js';
import type { Magasin } from './magasin.js';

/** En dessous : telephone. Decision 2 de la spec (§14). */
export const SEUIL_MOYEN = 600;
/** A partir de : bureau. Le seuil de la spec des zones (§7, decision 3). */
export const SEUIL_LARGE = 1024;
/**
 * A partir de : bureau, pour un ecran qu'on ne pilote qu'au doigt (2.1.1). Une tablette en paysage
 * fait 1 180 a 1 366 px : a la largeur seule, elle recevait les colonnes du bureau, petites cibles et
 * menus deroulants compris. La maquette la dessine en tablette — plan plein ecran, panneaux
 * flottants — et c'est ce qu'elle recoit desormais.
 */
export const SEUIL_LARGE_TACTILE = 1400;

export function classePour(largeur: number, toucherSeul = false): Classe {
  if (largeur < SEUIL_MOYEN) return 'compact';
  if (largeur < (toucherSeul ? SEUIL_LARGE_TACTILE : SEUIL_LARGE)) return 'moyen';
  return 'large';
}

/** Vrai quand l'ecran n'a que le doigt : ni souris ni pave tactile (une tablette sans clavier). */
export function toucherSeul(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
}

/**
 * Pose la classe de la largeur courante, et rend `true` quand elle a change. Une feuille ouverte se
 * ferme en quittant le telephone.
 */
export function appliquerClasse(magasin: Magasin, largeur: number = window.innerWidth): boolean {
  const classe = classePour(largeur, toucherSeul());
  const avant = magasin.store.getState().classe;
  document.documentElement.dataset.classe = classe;
  if (classe === avant) return false;
  magasin.definirClasse(classe);
  // Les feuilles du telephone ne survivent pas au changement de classe, sauf les deux que la
  // tablette montre aussi (en panneau deroulant) : Projet et Reglages 3D.
  const f = magasin.store.getState().feuille;
  if (f && (classe === 'large' || (classe === 'moyen' && f !== 'projet' && f !== 'reglages3d'))) magasin.definirFeuille(null);
  return true;
}
