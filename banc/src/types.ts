// Les donnees du banc, telles que l'API les range (banc/public/api.php).

export interface P { x: number; y: number }

/**
 * Un rectangle, un polygone, une ligne (l'egout, le sol : une ligne brisee ouverte) ou un point (la pointe d'un pignon). Lignes et points
 * ne s'apprennent pas par YOLO : ils restent dans le format du banc.
 */
export type Forme = 'rectangle' | 'polygone' | 'ligne' | 'point';

/** Les formes que YOLO peut apprendre (une boite, un contour). */
export const estApprenable = (f: Forme): boolean => f === 'rectangle' || f === 'polygone';

/** Un attribut a renseigner sur un objet marque : un choix dans une liste, un nombre, oui/non, ou un texte. */
export interface Attribut {
  cle: string;
  nom: string;
  type: 'choix' | 'nombre' | 'booleen' | 'texte';
  valeurs?: string[];
}

/** Une classe d'objet (etape 0) : son nom, sa place dans l'arbre, sa forme, sa couleur de marquage, ses attributs. */
export interface Classe {
  id: string;
  nom: string;
  /** La classe dans laquelle elle se range (null : a la racine). Un objet de cette classe se pose dans un objet de son parent. */
  parent: string | null;
  forme: Forme;
  couleur: string;
  attributs: Attribut[];
  /** Entre dans le jeu YOLO (sinon : marquee pour memoire, jamais exportee). */
  apprendre: boolean;
  description?: string;
  /**
   * Les types de la classe (la fenetre a un vantail, a deux, a petits carreaux…) : un objet de cette classe se qualifie par l'un d'eux, et
   * c'est ce type que le modele apprend (son nom dans data.yaml). Sans types, la classe elle-meme est le nom appris.
   */
  types?: TypeObjet[];
  /**
   * Un regroupement (ouverture, fermeture, saillie) : un noeud de l'arbre qui classe ses enfants (« une fenetre est une ouverture »), jamais
   * dessine ni appris. Les autres liens de l'arbre sont des liens de contenance : un cadre est dans sa fenetre.
   */
  regroupement?: boolean;
  /** Les autres regroupements dont elle fait aussi partie (une fenetre de toit est sur le toit, et c'est aussi une ouverture). */
  aussi?: string[];
  /** Son indice YOLO fige (une classe sans types) : il ne bouge plus quand l'arbre change. Absent : apres les indices figes. */
  indice?: number;
}

/** Un type d'une classe : son nom YOLO (minuscules, chiffres, _ et -) et son libelle. */
export interface TypeObjet { id: string; nom: string; /** Son indice YOLO fige. */ indice?: number }

export type Statut = 'importee' | 'redressee' | 'validee' | 'rejetee' | 'brouillon' | 'corrigee';
export type Bloc = '' | 'train' | 'val' | 'test' | 'reserve';

export interface MetaImage {
  id: string;
  importeeLe: string;
  statut: Statut;
  source: 'iphone' | 'panoramax' | 'fichier';
  nom?: string;
  date?: string | null;
  lat?: number | null;
  lon?: number | null;
  azimut?: number | null;
  appareil?: string | null;
  focale35?: number | null;
  adresse?: string | null;
  /** L'identifiant de la parcelle cadastrale (IGN) vers laquelle la photo a ete cherchee. */
  parcelle?: string | null;
  panoramax?: { id: string; collection?: string | null; panoramique: boolean; cap?: number | null; vue?: 'gauche' | 'droite' | 'adresse' | 'photo' | 'choisie' } | null;
  licence?: string | null;
  auteur?: string | null;
  largeur?: number;
  hauteur?: number;
  lot?: string | null;
  redressement?: { methode: string; le: string; coins?: P[]; horizontale?: boolean; note?: string };
  redressee?: { largeur: number; hauteur: number };
  bloc: Bloc;
  verifiee: boolean;
  verifieeLe?: string | null;
  echantillon?: boolean;
  objets?: number;
  classes?: string[];
  /** Les noms YOLO presents et leur nombre d'objets (le type d'un objet qualifie, sinon sa classe). */
  etiquettes?: Record<string, number>;
  /** Les objets d'une classe a types pas encore qualifies (ils n'entrent pas dans le jeu). */
  aQualifier?: number;
  note?: string;
}

/** Un objet marque, en pixels de la photo redressee. Un rectangle a deux points (coins opposes), un polygone trois ou plus. */
export interface Objet {
  id: string;
  classe: string;
  forme: Forme;
  points: P[];
  parent: string | null;
  attributs: Record<string, string | number | boolean>;
  /** auto : pose par le brouillon et jamais touche ; main : pose a la main ; corrige : pose par le brouillon puis change. */
  origine: 'auto' | 'main' | 'corrige';
  /** Son type, pour une classe qui en a (le nom que le modele apprend) ; absent : a qualifier. */
  type?: string;
  score?: number;
  modele?: string;
}

export interface Annotation {
  objets: Objet[];
  majLe?: string;
  par?: 'auto' | 'main';
}

/** Un modele YOLO du brouillon : ses classes dans l'ordre de ses indices, et a quelle classe du banc chacune correspond. */
export interface Modele {
  id: string;
  nom: string;
  /** L'architecture, pour memoire : le decodage suit la forme de la sortie (yolo.ts::modeDeSortie). */
  format: 'yolo26' | 'yolo26-seg' | 'yolov10' | 'yolov8' | 'yolov8-seg';
  classes: string[];
  correspondance: Record<string, string>;
  seuil: number;
  installe: boolean;
  catalogue?: boolean;
  actif?: boolean;
}

/** Les blocs d'apprentissage (etape 7) : la graine du tirage, les parts, la taille de l'echantillon a verifier. */
export interface Reglages {
  graine: string;
  parts: { train: number; val: number; test: number };
  echantillonPart: number;
}

export const REGLAGES_DEFAUT: Reglages = { graine: 'banc-2026', parts: { train: 0.7, val: 0.2, test: 0.1 }, echantillonPart: 0.1 };
