// Le toit d'un batiment : formes, mesure LiDAR, corps, pignons, elements, lucarnes, cheminees, terrasse, volumes
// (MD/spec-toit-ign.md, MD/spec-regles-toits.md). A part de model/types.ts, qui les re-exporte (audit d'architecture, 25 octobre 2026).

import type { PtBrut } from './points.js';

/** Forme d'un toit simple : voir `facade/toits/toit.ts`, qui le construit. Ce sont les seules que le calcul produit et que la 3D dessine. */
export type FormeToitSimple = 'plat' | 'appentis' | 'deux-pans' | 'quatre-pans' | 'croupes';

/**
 * Les autres formes du catalogue (MD/spec-regles-toits.md §3.1, §4). Elles se deduisent des corps
 * (model/formeToit.ts) ou s'ecrivent depuis une observation ; aucun calcul ne les produit encore, et
 * la 3D dessine a leur place la forme simple la plus proche (`formeDessinee`).
 */
export type FormeToitCatalogue =
  | 'demi-croupes' | 'pavillon' | 'mansart' | 'gambrel' | 'asymetrique' | 'deux-pans-decales' | 'toit-en-m'
  | 'papillon' | 'coyau' | 'shed' | 'berceau' | 'carene' | 'conique' | 'polygonal' | 'fleche' | 'dome' | 'imperiale';

/** La forme d'ensemble d'un toit : une forme simple, ou une forme du catalogue. */
export type FormeToit = FormeToitSimple | FormeToitCatalogue;

/**
 * Un toit mesure : la grille des hauteurs du sursol (metres au-dessus du sol) sous le contour d'un
 * batiment, lignes du nord au sud, `null` hors du toit ; et l'egout qu'on en lit.
 */
export interface ToitMesure {
  pas: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  z: (number | null)[];
  /** Hauteur du sol a l'egout, en metres : le dixieme centile des hauteurs du toit. */
  egout: number;
  /** Le point le plus haut du toit, en metres au-dessus du sol. */
  faite: number;
  source: 'lidar';
}

/**
 * Un pignon qui part du faitage d'un corps (MD/spec-toit-ign.md §13) : un petit toit a deux pans,
 * perpendiculaire au faitage, qui avance jusqu'au mur d'un pan et y dresse son triangle.
 */
export interface PignonToit {
  /** Le pan qui le porte : 0 du cote `pts[0]-pts[1]` du corps, 1 du cote oppose. */
  pan: 0 | 1;
  /** Ses bords le long du faitage du corps, en metres depuis `pts[0]`. */
  debut: number;
  fin: number;
  /** La hauteur de son faitage au-dessus du sol, en metres. */
  faitage: number;
  /** Sa longueur depuis le mur vers l'interieur, en metres : jusqu'au faitage du corps quand il en part. */
  profondeur: number;
  /**
   * L'avancee du pignon au-dela du mur, en metres (0 a 2,5) : son triangle et ses murs de cote sortent d'autant du nu
   * de la facade, le toit du pignon avance avec eux. Absente ou nulle, le pignon est au nu du mur.
   */
  saillieM?: number;
}

/** Le doute sur la toiture d'un batiment a cheval sur deux parcelles, et sa reponse (model/aCheval.ts). */
export interface ToitACheval {
  /** Les cles des parcelles du plan sur lesquelles il est pose. */
  parcelles: string[];
  reponse?: 'un' | 'parParcelle';
}

/**
 * Un corps de batiment reconstruit sur le LiDAR (MD/spec-toit-ign.md §13) : un rectangle, un faitage
 * place la ou la mesure le met, deux pans qui ont chacun leur egout, et ses pignons.
 */
export interface CorpsToit {
  /** Le rectangle : `pts[0] -> pts[1]` suit le faitage (la longueur), `pts[0] -> pts[3]` la largeur. */
  pts: PtBrut[];
  /** La position du faitage dans la largeur, depuis le cote `pts[0]-pts[1]`, en metres : 0 ou la largeur, un appentis. */
  posFaitage: number;
  /** La hauteur du faitage au-dessus du sol, en metres ; egale aux egouts pour un toit plat. */
  faitage: number;
  /** L'egout du pan du cote `pts[0]-pts[1]`, puis celui du pan oppose, en metres au-dessus du sol. */
  egouts: [number, number];
  pignons: PignonToit[];
  /**
   * Les croupes, au bout `s = 0` puis au bout `s = L` : la distance a plat du mur de bout au bout du
   * faitage, en metres. Absentes ou nulles, le bout est un pignon (un deux-pans) ; les deux, un
   * quatre-pans.
   */
  croupes?: [number, number];
  /** L'ecart quadratique moyen a la mesure, en metres. */
  ecart: number;
  /**
   * Les souches de cheminee du corps (MD/spec-regles-toits.md §2.6, §4). Absentes : aucune n'est
   * connue, et le corps garde exactement son sens d'avant (un fichier ancien n'en a pas).
   */
  cheminees?: Cheminee[];
  /** Un corps plat : ce que l'on sait de sa toiture-terrasse (§2.7). Absente : un toit plat sans plus. */
  terrasse?: TerrasseToit;
  /**
   * Le profil en travers de chaque pan, du cote `pts[0]-pts[1]` puis du cote oppose
   * (MD/spec-regles-toits.md §4). Absent : deux pentes droites, le sens d'avant.
   */
  profil?: [ProfilPan, ProfilPan];
  /** Ce qui ferme chaque bout, au bout `s = 0` puis `s = L`. Absents : deduits de `croupes`. */
  bouts?: [BoutToit, BoutToit];
  /** Les lucarnes du corps, detectees ou observees. Absentes : aucune n'est connue. */
  lucarnes?: Lucarne[];
  /** Les bords, quand une observation les precise ; absents : les defauts du dessin (35 cm, 20 cm). */
  bords?: BordsToit;
  /** Un toit de revolution sur le rectangle du corps (tourelle, kiosque, clocher) ; absent : un toit a faitage. */
  speciale?: SpecialeToit;
  /**
   * Un appentis ouvert (galerie, porche : des poteaux, pas de mur exterieur) ou ferme (des murs du sol a l'egout et aux bouts).
   * Absent : le dessin d'avant, qui ne dit rien sous l'egout. Sans effet sur un autre toit qu'un appentis.
   */
  ouvert?: boolean;
  /** Le recul des poteaux d'un appentis ouvert depuis le bord de l'egout, en metres ; absent : le dessin d'avant (12 cm). */
  retraitM?: number;
  /**
   * Cet element est pose sur un mur d'un autre corps (bow-window, galerie, appentis) : ce qui le place et le forme.
   * Absent : un corps du toit comme les autres. Le rectangle `pts` en est calcule (facade/modeToit/saillies.ts).
   */
  saillie?: SaillieFacade;
  /** Les fenetres de toit et les panneaux solaires poses sur ses pans. Absents : aucun. */
  elementsToit?: ElementDeToit[];
  /**
   * Ce corps est une bay window (MD/spec-regles-toits.md §2.3, §4) : une avancee de facade posee sur une saillie du contour, avec son
   * propre toit. Absent : un corps ordinaire. Sans effet sur le dessin, qui la traite comme un corps plat ou un appentis.
   */
  baie?: BaieToit;
}

/** Un element pose sur un pan : une fenetre de toit (velux) ou un panneau solaire. */
export interface ElementDeToit {
  type: 'fenetre-toit' | 'solaire';
  /** Le pan qui le porte : 0 du cote `pts[0]-pts[1]` du corps, 1 du cote oppose. */
  pan: 0 | 1;
  /** Son milieu le long du faitage, en metres depuis `pts[0]`. */
  sM: number;
  /** Son milieu depuis le mur d'egout du pan, a plat, en metres. */
  dM: number;
  /** Sa taille par rapport a l'element type (0,5 a 2,2) ; absente : 1. */
  echelle?: number;
}

/** Ce qu'est un element pose sur une facade. */
/** `auvent` (lot L1) : une marquise sur consoles, sans poteaux, au-dessus d'une porte. */
export type GenreSaillie = 'bow-window' | 'galerie' | 'appentis' | 'auvent';
/** La forme du plan d'un bow-window : des pans coupes (un trapeze), un rectangle, un demi-cercle (arc) ou un rectangle aux angles arrondis (conge). */
export type FormeSaillie = 'pans' | 'rectangle' | 'arc' | 'conge';

/**
 * Un element de facade qui touche au toit, pose sur un mur d'un corps. `hote` : le rang du corps qui le porte
 * dans `corpsToit` ; `mur` : le cote de ce corps (de `pts[mur]` a `pts[mur + 1]`) ; `centreM` : son milieu le long
 * du mur, depuis `pts[mur]`. `niveau` : sous le premier etage (rdc) ou jusqu'au toit.
 */
export interface SaillieFacade {
  genre: GenreSaillie;
  hote: number;
  mur: number;
  centreM: number;
  largeurM: number;
  profondeurM: number;
  forme: FormeSaillie;
  niveau: 'rdc' | 'toit';
  /** Le toit propre : un pan contre le mur, quatre pans, ou plat. */
  toit: 'pan' | 'pavillon' | 'plat';
  /** Sa hauteur a l'egout, en metres, quand la personne la regle ; absente : celle du `niveau` (un etage, ou l'egout de la maison). */
  hauteurM?: number | undefined;
  /** La couverture d'un auvent (lot L1) ; absente : celle du dessin d'un appentis. */
  couverture?: 'verre' | 'tuile' | 'zinc' | 'autre' | undefined;
}

/** Une bay window : le plan, la hauteur ou elle commence, son toit, et d'ou on le sait. */
export interface BaieToit {
  /** Son plan : rectangle, arc de cercle ou rectangle a angles arrondis (`congeM`). Le dessin 3D n'en trace que l'enveloppe rectangulaire. */
  forme: 'rectangle' | 'arc' | 'conge';
  congeM?: number;
  /** Sous le premier etage (le rez-de-chaussee seul) ou sur toute la hauteur du batiment. */
  pose: 'sous-premier-etage' | 'toute-hauteur';
  source: 'cadastre' | 'observation';
}

/**
 * Un toit de revolution : un solide dont l'axe est vertical, au centre du rectangle du corps, de rayon la moitie du plus petit
 * cote, de l'egout (le plus bas) au faitage (`faitage` du corps). `cotes` : le nombre de faces d'une pyramide.
 */
export type SpecialeToit =
  | { type: 'conique' }
  | { type: 'polygonal'; cotes: number }
  | { type: 'fleche'; cotes: number }
  | { type: 'dome' }
  | { type: 'imperiale' };

/**
 * La coupe en travers d'un pan, de l'egout au faitage (MD/spec-regles-toits.md §4) : droite (le sens
 * d'avant), brisee (Mansart, gambrel : le brisis depuis l'egout, puis le terrasson), retroussee
 * (coyau) ou courbe (berceau, carene).
 */
export type ProfilPan =
  | { type: 'droit' }
  /** La ligne de bris : a `largeurBrisisM` du mur, a `hauteurBrisM` au-dessus du sol. */
  | { type: 'brise'; largeurBrisisM: number; hauteurBrisM: number }
  /** Le bas du pan, adouci sur `largeurM`, a `penteDeg`. */
  | { type: 'coyau'; largeurM: number; penteDeg: number }
  /** L'ecart de l'arc a la corde, en metres. */
  | { type: 'courbe'; flecheM: number };

/** Ce qui ferme un bout du faitage (MD/spec-regles-toits.md §4). */
export type BoutToit =
  | { type: 'pignon' }
  /** La distance a plat du mur de bout au bout du faitage, comme `croupes`. */
  | { type: 'croupe'; profondeurM: number }
  /** Une courte croupe sur un petit pignon, haut de `hauteurPignonM` au-dessus de l'egout. */
  | { type: 'demi-croupe'; profondeurM: number; hauteurPignonM: number }
  /** Le brisis d'un Mansart au bout, large de `largeurM` a plat. */
  | { type: 'brisis'; largeurM: number }
  /** Un pignon a gradins : un mur, sans effet sur le toit. */
  | { type: 'redents' };

/** Les types de lucarne que l'on distingue (MD/spec-regles-toits.md §2.3). */
export type TypeLucarne = 'jacobine' | 'capucine' | 'chien-assis' | 'rampante' | 'meuniere' | 'oeil-de-boeuf' | 'outeau' | 'lanterneau' | 'inconnue';

/** Une lucarne sur un pan du corps (MD/spec-regles-toits.md §2.3, §4). */
export interface Lucarne {
  type: TypeLucarne;
  /** Le pan qui la porte : 0 du cote `pts[0]-pts[1]`, 1 du cote oppose. */
  pan: 0 | 1;
  /** Ses bords le long du faitage, en metres depuis `pts[0]`. */
  debutM: number;
  finM: number;
  /** La hauteur de son faitage au-dessus du sol, en metres. */
  faitageM: number;
  /** Son avancee depuis le mur vers l'interieur, en metres. */
  profondeurM: number;
  source: 'lidar' | 'observation';
}

/** Les bords d'un toit qu'une observation precise (MD/spec-regles-toits.md §2.4). */
export interface BordsToit {
  debordEgoutM?: number;
  saillieRiveM?: number;
  coyau?: boolean;
  queueDeVache?: boolean;
}

/** Ou sort une souche de cheminee (MD/spec-regles-toits.md §2.6). */
export type PositionCheminee = 'faitage' | 'pan' | 'pignon' | 'facade';

/**
 * Une souche de cheminee (MD/spec-regles-toits.md §2.6, §4). Sa section est orientee comme le corps
 * qui la porte : `largeurM` le long du faitage (`pts[0] -> pts[1]`), `profondeurM` en travers. Pour
 * une souche adossee (`facade`), `largeurM` court le long du mur et `profondeurM` en sort, et (x, y)
 * est le centre de la souche, contre le mur, du cote exterieur.
 */
export interface Cheminee {
  /** Le centre de la souche, repere du plan, en metres. */
  x: number;
  y: number;
  largeurM: number;
  profondeurM: number;
  /** La hauteur du debouche au-dessus du sol (pas au-dessus du pan : elle se compare au faitage). */
  sommetM: number;
  position: PositionCheminee;
  conduits?: number;
  materiau?: 'brique' | 'enduit' | 'pierre' | 'metal';
  couronnement?: 'dalle' | 'chapeau' | 'mitrons';
  /** D'ou elle vient : une observation (audit, releve). La detection LiDAR n'existe pas encore. */
  source: 'lidar' | 'observation';
}

/** Un edicule pose sur une toiture-terrasse : son emprise et le dessus de son toit plat, au-dessus du sol. */
export interface EdiculeTerrasse {
  pts: PtBrut[];
  sommetM: number;
}

/**
 * Une toiture-terrasse (MD/spec-regles-toits.md §2.7, §4 : `Terrasse`). Nommee `TerrasseToit` pour ne
 * pas la confondre avec la terrasse bois que Plan chiffre (`estTerrasse`, model/fonctions.ts).
 */
export interface TerrasseToit {
  accessible?: boolean;
  revetement?: 'gravillons' | 'membrane' | 'dalles' | 'bois' | 'vegetalise';
  /** La hauteur de l'acrotere au-dessus de la terrasse, en metres ; 0 ou absente : pas d'acrotere. */
  acrotereM?: number;
  gardeCorps?: boolean;
  /** Les edicules : cage d'escalier, local technique, chacun avec un toit plat. */
  edicules?: EdiculeTerrasse[];
  source: 'lidar' | 'observation';
}

/** Un volume d'un batiment en plusieurs corps : son emprise (un rectangle), son toit, son egout quand il est mesure. */
export interface VolumeToit {
  pts: PtBrut[];
  toit: Toit;
  /** Hauteur du sol a l'egout de ce volume, en metres ; absente, celle du batiment. */
  egout?: number;
  /** La hauteur de chaque mur (de `pts[i]` a `pts[i + 1]`), mesuree la ou la couverture le rejoint ; absente, l'egout. */
  hauteursMurs?: number[];
}

/** Les couvertures d'un toit en pente que l'on peut imposer (model/couleurToit.ts, `MateriauCouverture`). */
export type CouvertureChoisie = 'tuile' | 'tuile-plate' | 'tuile-canal' | 'ardoise' | 'ardoise-losange' | 'zinc';

export interface Toit {
  forme: FormeToit;
  /** Hauteur du faitage au-dessus de l'egout, en metres. */
  hauteur: number;
  /** Direction du faitage dans le plan, en degres depuis l'est, sens trigonometrique ; modulo 180. */
  angleFaitage: number;
  /** Couleur de la couverture. */
  couleur?: string;
  /**
   * D'ou vient `couleur` quand Plan l'a posee : lue sur l'orthophoto, ou couverture de repli quand la
   * photo n'est pas concluante (MD/spec-toit-ign.md §6.1). Absente avec une couleur : l'utilisateur
   * l'a choisie, et rien ne la recalcule.
   */
  origineCouleur?: 'orthophoto' | 'rouge' | 'brun' | 'gris';
  /**
   * Le materiau de la couverture choisi dans l'inspecteur : il l'emporte sur celui que Plan deduit
   * des fichiers fonciers, de la couleur et de la pente (model/couleurToit.ts). Absent : deduit.
   */
  couverture?: CouvertureChoisie;
  /**
   * D'ou vient la forme : estimee sur une photo, deduite de la BD TOPO, ajustee sur le MNH LiDAR
   * HD de l'IGN (MD/spec-toit-ign.md §10), ou saisie.
   */
  source?: 'photo' | 'bdtopo' | 'lidar' | 'saisie';
  /**
   * `croupes` seulement : une pente imposee, en degres. Absente, la pente se deduit de `hauteur` et
   * du contour ; presente, le toit est ecrete a `hauteur` (MD/spec-toit-ign.md §3.3).
   */
  pente?: number;
  /** La hauteur n'a pas ete lue mais estimee (MD/spec-toit-ign.md §4, regle 3). */
  estime?: boolean;
}
