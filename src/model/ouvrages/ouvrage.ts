// Ce qu'est un ouvrage du plan (MD/spec-ouvrages.md, etape 6.2) : ce que la fonction d'un objet lui donne, dit une fois.
//
// Un objet du plan est une forme (polygone, cercle, chemin) et une fonction (terrasse, pergola, chemin…). La fonction en fait un
// ouvrage : une terrasse n'a pas les regles de construction d'un chemin. Chaque ouvrage se declare dans le module de sa famille
// (`model/ouvrages/*.ts`) ; le registre (`index.ts`) les rassemble, et les tables d'avant (libelles, hauteurs par defaut, menu
// « Fonction », profils de l'inspecteur) en derivent. Les couches au-dessus (moteur, dessin, 3D, inspecteur) ont chacune leur
// registre range sous le meme nom.

import type { ObjetPlan } from '../types.js';
import type { DeplacementRigide } from '../../geometry/deplacement.js';
import type { Deformation } from '../referencesContour.js';

export type Forme = ObjetPlan['type'];

/** Les sections propres a une fonction, au-dela de celles que tout objet porte. */
export type Particularite = 'parasol' | 'pointDeVue' | 'arbre' | 'construction' | 'releve' | 'abri' | 'bassin' | 'ouverture';

/**
 * La famille d'un ouvrage, et donc la nature de ses regles :
 * - `construit` : il se calcule et se chiffre (terrasse, abri, piscine, parasol) ;
 * - `bati` : il se releve (batiment, annexe : toit, facades) ;
 * - `surface` : une geometrie simple, une matiere, sans structure (dalle, chemin, massif, mobilier, equipement) ;
 * - `ouverture` : il perce la terrasse qu'il chevauche (tremie) ;
 * - `contexte` : ce qui situe le projet (terrain, limite, arbre, point de vue, autre).
 */
export type Famille = 'construit' | 'bati' | 'surface' | 'ouverture' | 'contexte';

export interface Ouvrage {
  /** La valeur de `ObjetPlan.fonction`. */
  fonction: string;
  /** Son nom a l'ecran : menu « Fonction », feuille de selection, familles de l'explorateur. */
  libelle: string;
  famille: Famille;
  /** Les formes ou la fonction a un sens. Absent : toutes. Les formes exigees le sont par le moteur. */
  formes?: readonly Forme[];
  /** Ce que la fonction ajoute a l'inspecteur, sur une forme admise. */
  particularites?: readonly Particularite[];
  /** Sa hauteur par defaut dans la Vue 3D, en metres. Absente : celle d'un objet quelconque (0,5 m). */
  elevation?: number;
  /** Propose dans le menu « Fonction » de l'inspecteur : un point de vue ne se choisit pas, il se cree. */
  auMenu: boolean;
  /**
   * L'inspecteur le nomme par son libelle plutot que par sa forme : un point de vue est techniquement un chemin a deux points, mais
   * personne ne le pense comme « un chemin ».
   */
  nommeParSaFonction?: true;
  /** Ne compte pas comme equipement pose sur une terrasse (le dossier PDF les liste). */
  horsEquipement?: boolean;
  /**
   * Ce que le dossier de declaration d'une piscine (export/dossierPiscine.ts) dessine de lui autour du bassin : `situation`, il
   * situe le terrain au plan de situation (les terrains y sont toujours) ; `masse`, c'est une construction de la propriete, au plan
   * de masse.
   */
  dossierPiscine?: { situation?: true; masse?: true };
  /**
   * Ses reglages au format de projet qui gardent une valeur sur un objet de toute fonction (la creation les pose par defaut) :
   * un objet du voisinage d'un autre ouvrage s'enregistre sans eux (io/serialisation.ts).
   */
  reglagesAuFichier?: readonly string[];
  /**
   * Il n'a pas d'emprise pleine : l'herbe de la Vue 3D pousse dessous (un terrain, un point de vue, un arbre dont l'herbe pousse
   * sous le houppier, un parasol dont seul le mat touche le sol, un trou de terrasse qui garde un arbre).
   */
  sansEmprise?: boolean;
  /** Trace en chemin, il a une largeur, donc une emprise ; un autre trace n'en a pas. */
  aUneLargeur?: boolean;
  /**
   * Fait suivre a l'objet ce qu'il porte en coordonnees absolues quand son contour bouge d'un bloc (glisse, aligne, remis a sa
   * place). Absent : l'ouvrage n'a rien de tel ; son contour suffit. Un contour deforme n'appelle rien.
   */
  suivreContour?: (o: ObjetPlan, d: DeplacementRigide) => void;
  /**
   * Fait suivre a l'objet ce qu'il range par rang de cote, par rang de sommet ou par abscisse le long d'un cote quand son contour se
   * deforme (sommet ajoute ou retire, cote tire ou raccourci, actualisation IGN ; model/contourDeforme.ts). Absent : il n'a rien de tel.
   */
  suivreDeformation?: (o: ObjetPlan, d: Deformation) => void;
  /**
   * L'objet de cle `cle` vient d'etre supprime : l'objet oublie ce qu'il en tenait par sa cle (une plage, une terrasse rattachee, une
   * parcelle sous un toit a cheval). Rend vrai s'il a change. Absent : il ne tient aucun autre objet par sa cle.
   */
  oublier?: (o: ObjetPlan, cle: string) => boolean;
}
