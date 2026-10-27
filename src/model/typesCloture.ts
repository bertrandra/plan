// La cloture de la parcelle, cote par cote, et ses acces (MD/spec-cloture.md). Re-exporte par model/types.ts.

import type { TextureAppliquee } from './typesFonctions.js';

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
