// Les reglages d'une pergola (engine/abri/pergola.ts). Re-exporte par model/types.ts.

import type { HypothesesCalcul } from './typesCalcul.js';

/** Toit d'une pergola : chevrons sous une toile tendue, quatre pans, ou appentis a une pente. */
export type ToitPergola = 'toile' | 'quatre-pans' | 'appentis';

/**
 * Les reglages d'une pergola. **Tout est facultatif**, comme `Construction` : `pergolaDe`
 * (engine/abri/pergola.ts) comble les manques a la lecture, sans les ecrire dans l'objet. Un projet
 * enregistre avant qu'un reglage existe garde ainsi sa forme.
 *
 * Les sections s'ecrivent `'largeur x hauteur'` en millimetres, comme celles des solives (`'45x145'`).
 */
/** Matiere de la structure : bois (avec contrefiches) ou aluminium (profiles, sans contrefiches). */
export type MateriauPergola = 'bois' | 'aluminium';

export interface Pergola {
  toit?: ToitPergola;
  materiau?: MateriauPergola;
  /**
   * Adossee a un mur (toile ou appentis) : pas de poteaux le long du mur, une lisse murale a la place
   * de la poutre. `coteMur` est l'indice de ce cote ; absent, celui qui fait face au cote de reference.
   */
  adossee?: boolean;
  coteMur?: number;
  /** Debord du toit au-dela du nu des poteaux, en metres (aucun cote du mur). */
  debord?: number;
  /** Prix au metre lineaire saisis, par `materiau:section` (`'bois:120x120'`). */
  prixMl?: Record<string, number>;
  /** Les hypotheses de la note de calcul (engine/abri/noteCalcul.ts). */
  calcul?: HypothesesCalcul;
  /** Prix au m² de la toile, et de la couverture (appentis, quatre pans). */
  prixToile?: number;
  prixCouverture?: number;
  /** Hauteur des poteaux, du sol au dessous des poutres, en metres (le cote bas d'un appentis). */
  hauteur?: number;
  sectionPoteau?: string;
  /** Distance maximale entre deux poteaux d'un meme cote, en metres. */
  entraxePoteaux?: number;
  sectionPoutre?: string;
  avecContrefiches?: boolean;
  /** Longueur d'une contrefiche, en metres, posee a 45°. */
  longueurContrefiche?: number;
  sectionContrefiche?: string;
  sectionChevron?: string;
  /** Entraxe des chevrons, en metres. */
  entraxeChevrons?: number;
  /** Pente du toit en degres (appentis et quatre pans). */
  pente?: number;
  /**
   * Indice du cote de reference : les chevrons lui sont perpendiculaires, et c'est le cote bas d'un
   * appentis. Absent : le plus long cote.
   */
  coteReference?: number;
  couleurBois?: string;
  couleurToile?: string;
  couleurCouverture?: string;
  /** Longueurs achetables (bois ou profiles), saisies en clair : `'6, 5, 4, 3'`. Le nom date du bois seul. */
  longueursBois?: string;
}

// ---- Piscine ----------------------------------------------------------------------------------
