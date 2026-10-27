// Les ouvrages qu'un objet du plan peut porter, chacun dans son champ : la cloture de la parcelle (MD/spec-cloture.md), la pergola
// (engine/pergola.ts) et la piscine (engine/piscine.ts). Re-exportes par model/types.ts : un import de `model/types.js` reste valable
// (MD/roadmap-architecture.md, etape 4.3).

import type { TextureAppliquee } from './typesFonctions.js';
import type { HypothesesCalcul } from './typesCalcul.js';

/** Nature d'un troncon de cloture (MD/spec-cloture.md §2). */
export type TypeCloture = 'aucune' | 'palissade' | 'grillage' | 'haie' | 'mur';

export type ParementMur = 'enduit' | 'pierre' | 'brique' | 'parpaing' | 'bardage';
export type EssenceHaie = 'laurier' | 'thuya' | 'charme' | 'photinia' | 'troene' | 'champetre';
/** Ce que le cote borde : la rue, ou un voisin. Le PLU ne fixe pas la meme hauteur aux deux. */
export type LimiteCloture = 'rue' | 'separative';

/** Le muret sous un grillage, une palissade ou une haie. */
export interface SoubassementCloture {
  hauteur: number;
  parement: ParementMur;
  couleur?: string;
  texture?: TextureAppliquee | null;
}

/**
 * Le reglage d'une cloture : celui de tous les cotes par defaut, ou celui d'un cote. Les champs
 * propres a un type restent quand le type change, pour retrouver sa haie en revenant dessus.
 */
export interface ReglageCloture {
  type: TypeCloture;
  /** Hauteur en metres, hors soubassement. */
  hauteur: number;
  couleur?: string;
  texture?: TextureAppliquee | null;
  lames?: 'horizontales' | 'verticales';
  /** Palissade ou grillage qui ne laisse pas voir au travers (brise-vue). */
  occultante?: boolean;
  grillage?: 'souple' | 'rigide';
  essence?: EssenceHaie;
  /** Epaisseur d'une haie ou d'un mur, en metres. */
  epaisseur?: number;
  taillee?: boolean;
  parement?: ParementMur;
  couvertine?: boolean;
  soubassement?: SoubassementCloture | null;
}

/** Un cote regle a part du defaut : de `pts[cote]` a `pts[cote + 1]`, comme un releve de facade. */
export interface CoteCloture extends ReglageCloture {
  cote: number;
  limite?: LimiteCloture;
  mitoyenne?: boolean;
}

export type OuverturePortail = 'battant-1' | 'battant-2' | 'coulissant';
export type FormePortail = 'droit' | 'chapeau-de-gendarme' | 'chapeau-inverse' | 'bombe' | 'concave';
export type RemplissagePortail = 'plein' | 'ajoure' | 'semi';
export type MateriauPortail = 'aluminium' | 'pvc' | 'bois' | 'fer';

/** Les deux piliers d'un acces, de part et d'autre du passage. */
export interface PiliersPortail {
  largeur: number;
  hauteur: number;
  parement: ParementMur;
  couleur?: string;
  chapeau: boolean;
}

/**
 * Un portail ou un portillon, accroche a un cote de la parcelle a `x` metres du bord gauche du cote
 * vu de dehors — la convention d'`OuvertureFacade`, pour que la 3D et le plan partagent le repere.
 */
export interface Portail {
  nature: 'portail' | 'portillon';
  cote: number;
  x: number;
  largeur: number;
  hauteur: number;
  ouverture: OuverturePortail;
  /** Battants : de quel cote de la limite ils se deploient. */
  sens: 'interieur' | 'exterieur';
  /** Coulissant : de quel cote le vantail se range. */
  refoulement: 'gauche' | 'droite';
  /** Deux battants inegaux : le petit fait un tiers de la largeur. */
  petitVantail: 'aucun' | 'gauche' | 'droite';
  forme: FormePortail;
  /** Hauteur de la courbe, en metres, pour une forme non droite. */
  fleche: number;
  remplissage: RemplissagePortail;
  materiau: MateriauPortail;
  couleur: string;
  texture?: TextureAppliquee | null;
  piliers: PiliersPortail | null;
  /** Recul depuis l'alignement vers l'interieur, en metres. */
  retrait: number;
  motorise: boolean;
  /** Reglage d'affichage de la 3D : vantaux ouverts. Ni annulation ni « projet modifie ». */
  ouvert?: boolean;
}

export interface Cloture {
  active: boolean;
  defaut: ReglageCloture;
  /** Seulement les cotes regles a part ; les autres suivent `defaut`. */
  cotes: CoteCloture[];
  portails: Portail[];
  /** Hauteurs maximales d'apres le PLU, en metres ; absentes, pas de controle. */
  hauteurMaxRue?: number;
  hauteurMaxSeparative?: number;
}

/** Toit d'une pergola : chevrons sous une toile tendue, quatre pans, ou appentis a une pente. */
export type ToitPergola = 'toile' | 'quatre-pans' | 'appentis';

/**
 * Les reglages d'une pergola. **Tout est facultatif**, comme `Construction` : `pergolaDe`
 * (engine/pergola.ts) comble les manques a la lecture, sans les ecrire dans l'objet. Un projet
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
  /** Les hypotheses de la note de calcul (engine/noteCalcul.ts). */
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

/** Ou le bassin se trouve par rapport au sol fini. */
export type ImplantationPiscine = 'enterree' | 'semi-enterree' | 'hors-sol';
/** Ce qui tient l'eau : une coque polyester, des parois maconnees (blocs a bancher), un kit de panneaux. */
export type StructurePiscine = 'coque' | 'maconnerie' | 'kit';
/** La peau etanche, selon la structure : une coque a son gelcoat, le reste choisit. */
export type RevetementPiscine = 'liner' | 'membrane-armee' | 'carrelage' | 'enduit' | 'gelcoat';
/** Le fond : plat, en pente reguliere, ou plat puis une fosse a plonger au grand bain. */
export type FondPiscine = 'plat' | 'pente' | 'fosse';
/**
 * Ce qui entoure le bassin au-dela des margelles. `terrasse` : une terrasse du plan, objet a part
 * dessine et chiffre comme toute terrasse, que le bassin perce (`Piscine.terrasseKey`).
 * `terrasse-bois` : la plage en bois que la piscine calculait elle-meme jusqu'a la 2.2.0, gardee
 * telle quelle pour qu'un projet enregistre alors redonne les memes quantites.
 */
export type PlagePiscine = 'aucune' | 'terrasse' | 'terrasse-bois' | 'dallage';
/** Le dispositif de securite obligatoire (loi du 3 janvier 2003, normes NF P90-306 a 309). */
export type SecuritePiscine = 'barriere' | 'alarme' | 'couverture' | 'abri';
export type TraitementPiscine = 'chlore' | 'sel' | 'brome' | 'oxygene-actif';
export type ChauffagePiscine = 'aucun' | 'pac' | 'solaire' | 'echangeur';
/** Ou vit la filtration : un coffre pose a cote, un local enterre prefabrique, un local maconne, un local existant. */
export type LocalTechniquePiscine = 'coffre' | 'enterre' | 'maconne' | 'existant';

/**
 * Les reglages d'une piscine. **Tout est facultatif**, comme `Pergola` : `piscineDe`
 * (engine/piscine.ts) comble les manques a la lecture, sans les ecrire dans l'objet. Les longueurs
 * sont en metres, les profondeurs sont celles de l'eau.
 */
export interface Piscine {
  implantation?: ImplantationPiscine;
  structure?: StructurePiscine;
  revetement?: RevetementPiscine;
  fond?: FondPiscine;
  profondeurPetitBain?: number;
  profondeurGrandBain?: number;
  /** Indice du cote du petit bain : la pente descend en s'en eloignant. Absent : le plus court cote. */
  cotePetitBain?: number;
  /** Fosse : part de la longueur du bassin, cote grand bain, occupee par la descente et la fosse (0,2 a 0,7). */
  partFosse?: number;
  /** Hauteur du haut des parois au-dessus du sol fini (semi-enterree, hors-sol). */
  hauteurHorsSol?: number;
  margelle?: boolean;
  largeurMargelle?: number;
  plage?: PlagePiscine;
  /** La terrasse du plan qui sert de plage (`plage: 'terrasse'`), creee autour du bassin. */
  terrasseKey?: string;
  /** Largeur de la plage autour des margelles, la meme sur tout le tour. */
  largeurPlage?: number;
  /** Essence des lames d'une plage en bois (cles d'`ESSENCE_PRICES`). */
  essencePlage?: string;
  /** Temps de recyclage du volume, en heures (4 h par defaut). */
  tempsRecyclage?: number;
  traitement?: TraitementPiscine;
  chauffage?: ChauffagePiscine;
  eclairage?: boolean;
  securite?: SecuritePiscine;
  local?: LocalTechniquePiscine;
  /** Distance du bassin au local technique, en metres : la longueur des canalisations. */
  distanceLocal?: number;
  couleurEau?: string;
  couleurMargelle?: string;
  couleurPlage?: string;
  /** Prix unitaires saisis, par poste du chiffrage (`'terrassement'`, `'margelles'`…). */
  prix?: Record<string, number>;
}

