// Les descripteurs de champs de l'inspecteur (spec-ihm-zones §4.5, DEFAUTS D-12).
//
// Un champ est une donnee : sa cle, son libelle, son type, ses bornes, la condition qui le montre,
// celle qui l'active, ce qu'il lit et ce qu'il ecrit. Un seul composant (zones/Inspecteur.tsx) les
// rend tous, et un seul service (app/inspecteur.ts) applique une ecriture — l'historique, le
// marquage « modifie » et les effets qui suivent sont declares sur le champ, pas recodes a chaque
// ecouteur. C'est ce que le panneau d'attributs et le configurateur de terrasse faisaient en huit
// cents lignes de DOM imperatif, une par champ.
//
// Rien ici ne touche le DOM : les descripteurs lisent le plan et le mutent, et disent ce qui doit
// suivre. Les fonctions qui le font (`rendu`, `rafraichir la terrasse`, `reconstruire la 3D`) sont
// fournies par le contexte.

import type { CarteToit } from './carteToit.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan, PtBrut, Construction, TextureAppliquee } from '../../model/types.js';
import type { Pointage } from '../../interaction/outilMesure.js';
import type { CoteDesigne } from '../../interaction/outilAlignement.js';
import type { ContexteSoleil } from '../../engine/parasol.js';

/** Ce qui doit suivre une ecriture. */
export type Effet =
  /** Redessiner le plan (ce qui rafraichit aussi l'inspecteur). */
  | 'rendu'
  /** Rafraichir l'inspecteur seul. */
  | 'inspecteur'
  /** Refaire les panneaux de la terrasse courante (chiffrage, coupe…) et le plan. */
  | 'terrasse'
  /** Reconstruire la scene 3D si elle est ouverte. */
  | 'scene3d'
  /** Reappliquer l'ordre d'empilement des objets. */
  | 'empilement'
  /** Reconstruire les poignees de l'objet. */
  | 'poignees';

/** Ce que les descripteurs lisent et ce qu'ils peuvent declencher. */
export interface ContexteChamps {
  etat: EtatApp;
  /** L'objet selectionne. */
  obj: ObjetPlan;
  objets: ObjetPlan[];
  parcelle: ObjetPlan | undefined;
  /** La construction de l'objet, creee si besoin : a n'appeler que pour une terrasse. */
  construction: () => Construction;
  pointage: () => Pointage | null;
  cibleAlignement: () => CoteDesigne | null;
  libelleType: (obj: ObjetPlan) => string;
  elevationOf: (obj: ObjetPlan) => number;
  interiorAngleDeg: (obj: ObjetPlan, i: number) => number;
  refLabel: (ref: CoteDesigne | null) => string;
  measureSegCoords: (cible: CoteDesigne) => { a: PtBrut; b: PtBrut } | null;
  contexteSoleil: () => ContexteSoleil;
  dejaRectangle: (pts: PtBrut[]) => boolean;
  /** Les gestes qui portent deja leur historique et leur rendu. */
  applyAngleEdit: (obj: ObjetPlan, i: number, v: number) => boolean;
  applyLengthEdit: (obj: ObjetPlan, i: number, v: number) => boolean;
  deleteVertex: (obj: ObjetPlan, i: number) => void;
  alignObjectByRotation: (obj: ObjetPlan) => void;
  allerAuPointDeVue: (obj: ObjetPlan) => void;
  startPick: (mode: Pointage['mode'], multi: boolean, purpose?: Pointage['purpose'], indice?: number) => void;
  choisirTexture: (titre: string, onChoisi: (choix: TextureAppliquee, tous?: boolean) => void, options?: { checkboxLabel?: string }) => void;
  executerCommande: (id: string) => void;
  /** La commande est-elle utilisable (droits, quota, contexte) ? Un bouton qui la declenche se grise sinon. */
  commandeUtilisable: (id: string) => boolean;
  pushHistory: () => void;
  render: () => void;
  toast: (message: string) => void;
}

interface ChampBase {
  /** Identifiant stable dans sa section : la cle de la propriete, ou un nom pour ce qui n'en a pas. */
  cle: string;
  libelle: string;
  /**
   * Le nom explicite du champ quand son libelle est vide (bouton, alerte ou tableau sur toute la
   * largeur) : l'arbre des controleurs le montre a la place de la cle. Un test l'exige.
   */
  nom?: string;
  /** L'infobulle. */
  aide?: string;
  /** Un mot sur la valeur : ce que le configurateur ecrivait dans sa colonne du milieu. */
  note?: (c: ContexteChamps) => string;
  visible?: (c: ContexteChamps) => boolean;
  actif?: (c: ContexteChamps) => boolean;
  /** La ligne est mise en evidence : le coin ou le cote survole sur le plan. */
  surbrillance?: (c: ContexteChamps) => boolean;
  /** Empiler un instantane avant d'ecrire. */
  historique?: boolean;
  /** `false` pour un reglage d'affichage qui ne modifie pas le projet. */
  sale?: boolean;
  effets?: Effet[];
}

export interface ChampTexte extends ChampBase {
  type: 'texte';
  placeholder?: string;
  lire: (c: ContexteChamps) => string;
  ecrire: (c: ContexteChamps, v: string) => void;
}

export interface ChampNombre extends ChampBase {
  type: 'nombre';
  min?: number;
  max?: number;
  pas?: number;
  unite?: string;
  decimales?: number;
  lire: (c: ContexteChamps) => number;
  /** `false` refuse la valeur : le champ revient a ce qu'il lit. */
  ecrire: (c: ContexteChamps, v: number) => void | boolean;
}

export interface ChampCase extends ChampBase {
  type: 'case';
  lire: (c: ContexteChamps) => boolean;
  ecrire: (c: ContexteChamps, v: boolean) => void | boolean;
}

export interface ChampChoix extends ChampBase {
  type: 'choix';
  options: (c: ContexteChamps) => { valeur: string; libelle: string }[];
  lire: (c: ContexteChamps) => string;
  ecrire: (c: ContexteChamps, v: string) => void;
}

export interface ChampCouleur extends ChampBase {
  type: 'couleur';
  lire: (c: ContexteChamps) => string;
  ecrire: (c: ContexteChamps, v: string) => void;
}

export interface ChampDate extends ChampBase {
  type: 'date';
  lire: (c: ContexteChamps) => string;
  ecrire: (c: ContexteChamps, v: string) => void;
}

export interface ChampCurseur extends ChampBase {
  type: 'curseur';
  min: number;
  max: number;
  pas: number;
  format: (v: number) => string;
  lire: (c: ContexteChamps) => number;
  ecrire: (c: ContexteChamps, v: number) => void;
}

export interface ChampLecture extends ChampBase {
  type: 'lecture';
  valeur: (c: ContexteChamps) => string;
}

export interface ChampTexture extends ChampBase {
  type: 'texture';
  lire: (c: ContexteChamps) => TextureAppliquee | null | undefined;
  ecrire: (c: ContexteChamps, v: TextureAppliquee | null) => void;
  /** Une case du selecteur qui applique le choix a plusieurs objets a la fois. */
  appliquerATous?: { libelle: string; ecrire: (c: ContexteChamps, v: TextureAppliquee) => void };
}

export interface ChampBouton extends ChampBase {
  type: 'bouton';
  /** Le texte du bouton, quand il differe du libelle. */
  texte?: (c: ContexteChamps) => string;
  explication?: string;
  /**
   * Sur quoi le bouton agit — obligatoire, pour qu'aucun bouton n'echappe aux droits (app/ecritures.ts) :
   *   - `{ commande }` : il declenche cette commande du registre, qui porte droits et annulation ; le
   *     bouton se grise quand elle n'est pas utilisable ;
   *   - `projet` : il ecrit le projet lui-meme et empile son propre instantane ; grise et refuse en
   *     lecture seule ;
   *   - `interface` : il ne touche pas au projet (aller a une vue, designer une cible).
   */
  agit: 'projet' | 'interface' | { commande: string };
  executer: (c: ContexteChamps) => void;
}

export interface ChampAlerte extends ChampBase {
  type: 'alerte';
  texte: (c: ContexteChamps) => string;
}

/** Le tableau d'optimisation de la structure (zones/resultats/Optimisation.tsx), sous son bouton. */
export interface ChampOptimisation extends ChampBase {
  type: 'optimisation';
}

/** Une carte des hauteurs mesurees et du decoupage d'un toit (ui/champs/carteToit.ts), sur toute la largeur. */
export interface ChampCarte extends ChampBase {
  type: 'carte';
  carte: (c: ContexteChamps) => CarteToit | null;
}

/** Plusieurs commandes sur une ligne : un cote, son nom, sa longueur, son bouton. */
export interface ChampLigne extends ChampBase {
  type: 'ligne';
  champs: Champ[];
}

export type Champ =
  | ChampTexte | ChampNombre | ChampCase | ChampChoix | ChampCouleur | ChampDate | ChampCurseur
  | ChampLecture | ChampTexture | ChampBouton | ChampAlerte | ChampOptimisation | ChampCarte | ChampLigne;

export interface Section {
  id: string;
  titre: string;
  /** Repliee a l'ouverture. */
  repliee?: boolean;
  explication?: string;
  champs: Champ[];
}

/** Les champs de la section, ceux qui se montrent. */
export function champsVisibles(section: Section, c: ContexteChamps): Champ[] {
  return section.champs.filter(ch => !ch.visible || ch.visible(c));
}
