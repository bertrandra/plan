// Les donnees du banc, telles que l'API les range (banc/public/api.php).

export interface P { x: number; y: number }

export type Forme = 'rectangle' | 'polygone';

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
}

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
  panoramax?: { id: string; collection?: string | null; panoramique: boolean; cap?: number | null } | null;
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
  format: 'yolov10' | 'yolov8' | 'yolov8-seg';
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
