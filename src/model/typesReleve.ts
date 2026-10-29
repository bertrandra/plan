// Le releve d'une facade : ouvertures, details, grille, corrections, calage des photos, partie basse d'un mur en L
// (MD/spec-releve-facade.md). A part de model/types.ts, qui les re-exporte (audit d'architecture, 25 octobre 2026).

import type { PtBrut } from './points.js';
import type { BoutVu, SilhouetteFacade } from './silhouetteFacade.js';

/** Nature d'une ouverture relevee sur une facade. */
export type TypeOuverture = 'fenetre' | 'porte-fenetre' | 'porte' | 'garage';

/**
 * Une ouverture dans le repere de sa facade, en metres : `x` depuis le bord gauche du mur vu de
 * dehors, `y` depuis le sol (hauteur d'appui), `l` x `h` le tableau.
 */
export interface OuvertureFacade {
  type: TypeOuverture;
  x: number;
  y: number;
  l: number;
  h: number;
  /**
   * De 0 a 1 : ce que la detection en pense (MD/spec-facades-calage-detection.md §9, §12). Pleine a
   * 0,7 et plus ; en dessous, ou devinee, elle se dessine en pointille. Absente : posee au doigt, ou
   * relevee avant le lot L15.
   */
  confiance?: number;
  /** D'ou elle vient (§12, §12 bis) : `corrigee` des que le doigt l'a retouchee. */
  source?: SourceOuverture;
  /** Sa rangee et sa travee dans la grille du releve (`ReleveFacade.grille`, §10), depuis le bas et la gauche. */
  niveau?: number;
  travee?: number;
  /** Ce que le classement a reconnu en plus du type (§11) ; la 3D le dessine (three/detailsOuvertures.ts). */
  details?: DetailsOuverture;
  /**
   * L'identifiant de l'ouverture dans sa facade (MD/spec-facade-calage-audit.md §3.3, lot F5) : stable, une ouverture retrouvee par
   * un rejeu (recouvrement de plus de moitie) garde le sien. Pose a la validation de la facade (V4) ; absent d'un releve d'avant.
   */
  id?: string;
  /**
   * Le jour (AAAA-MM-JJ) ou la personne a valide l'ouverture (V4) : plus aucun rejeu ne la deplace ni ne la retire
   * (model/protections.ts::ouvertureGardee).
   */
  verifieeLe?: string;
}

/** D'ou vient une ouverture du releve (spec facades §13). */
export type SourceOuverture = 'detectee' | 'devinee' | 'claude' | 'ajoutee' | 'corrigee';

/**
 * Les details d'une ouverture (spec facades §11). Les volets battants sont fusionnes dans la baie (ils
 * n'en font pas deux fausses), le coffre d'un volet roulant est retire de sa hauteur.
 */
export interface DetailsOuverture {
  volets?: 'aucun' | 'battants' | 'roulant' | 'persiennes';
  /** Volets (persiennes, tablier) fermes sur la photo : la baie existe derriere. */
  ferme?: boolean;
  allege?: 'pleine' | 'balcon' | 'garde-corps';
  forme?: 'rect' | 'cintre' | 'rond';
  /** Le vitrage : d'un seul verre, a petits bois, ou d'un seul verre sous une imposte a petits bois. */
  vitrage?: 'plein' | 'petits-bois' | 'imposte-petits-bois';
  /** Comment la fenetre s'ouvre : a la francaise (deux vantaux), coulissante, a guillotine, a soufflet, ou fixe. */
  ouvrant?: 'battants' | 'coulissant' | 'guillotine' | 'soufflet' | 'fixe';
  /** Le vantail d'une porte : plein, vitre sur toute sa hauteur, ou vitre en partie haute. */
  remplissage?: 'pleine' | 'vitree' | 'semi-vitree';
  /** Une porte de garage : sectionnelle (panneaux horizontaux), basculante (un seul panneau), a battants, enroulable (lames fines). */
  garage?: 'sectionnelle' | 'basculante' | 'battants' | 'enroulable';
  /** La couleur des volets ou du tablier, en hexadecimal ; absente : la couleur par defaut du dessin. */
  couleurVolets?: string;
  /** La division du vitrage lue par Claude (decision 15) : enregistree maintenant, dessinee en 3D plus tard (lot F8). */
  carreaux?: CarreauxOuverture;
}

/** Une grille de carreaux : colonnes et rangees, par vantail. */
export interface GrilleCarreaux { colonnes: number; rangees: number }

/**
 * La division du vitrage d'une ouverture (MD/spec-facade-calage-audit.md §3.3) : un vocabulaire ferme, sans effet sur ce que la 3D
 * dessine aujourd'hui. Un mot inconnu relu est retire (model/facadeObjet.ts), jamais une erreur.
 */
export interface CarreauxOuverture {
  vantaux?: 1 | 2 | 3;
  /** Les carreaux d'un vantail ; 1 x 1 : un vitrage d'un seul tenant. */
  grille?: GrilleCarreaux;
  petitsBois?: 'aucun' | 'fins' | 'epais';
  /** La partie haute vitree a part (l'imposte d'AE 101), sa hauteur en metres. */
  imposte?: { hauteurM: number; grille?: GrilleCarreaux };
  vitrage?: 'clair' | 'depoli' | 'teinte' | 'vitrail';
  source: 'ia' | 'doigt';
}

/**
 * Les dimensions retenues d'une facade, et d'ou elles viennent (decision 1) : le plan et le LiDAR, jamais la photo, qui ne fait que
 * les verifier. Ecrites a la validation de la facade (V4).
 */
export interface DimensionsFacade {
  largeurM: number;
  /** La hauteur a l'egout de reference (le LiDAR, ou celle que la personne a choisie). */
  egoutM: number;
  /** Le point haut de la facade (le gabarit du toit calcule). */
  faitageM?: number;
  source: 'cadastre' | 'lidar' | 'ign' | 'saisie';
  /** L'ecart que la photo constate, en part (0 : elle confirme) : une alerte au-dela de 0,10, jamais une correction. */
  ecartPhoto?: { largeur?: number; egout?: number };
}

/** Une pointe lue sur la photo (un pignon), en part du mur (`u`) et de l'egout (`v`). */
export interface PointeLue { u: number; v: number; source: 'ia' | 'deterministe' | 'doigt' }

/** Un corps que la facade porte : son mur sur la facade (le corps se retrouve par lui, `murDuCorps`), et la part du mur qu'il couvre. */
export interface CorpsDeFacade { mur: { gauche: PtBrut; droite: PtBrut }; u0: number; u1: number }

/** La forme validee d'une facade : le gabarit du plan et du LiDAR, et ce que la photo en lit (§3.2). */
export interface FormeFacade {
  /** u en part de la largeur, v en part de l'egout (facade/gabaritMur.ts). */
  gabarit: { u: number; v: number }[];
  silhouetteLue?: SilhouetteFacade;
  bout?: BoutVu;
  pointes?: PointeLue[];
  /** Les corps que la facade porte, de gauche a droite (§5 ter). */
  corps?: CorpsDeFacade[];
  source: 'plan' | 'photo' | 'ia' | 'doigt';
}

/** Les parements d'un mur (le vocabulaire du run d'une facade, lot F2). */
export type ParementFacade = 'enduit' | 'pierre' | 'brique' | 'colombage' | 'bardage-bois' | 'bardage-metal' | 'beton';

/** Le parement du mur (§3.2, lot F2) : le principal, et les zones d'un autre, en part du mur. */
export interface SurfaceFacade {
  principale: ParementFacade | 'mixte';
  zones?: { type: ParementFacade; u0: number; u1: number; v0: number; v1: number; confiance: number }[];
  source: 'ia' | 'doigt' | 'audit';
}

/**
 * Comment la texture est posee sur le mur (§3.2) : sa precision, et le mur sur l'image calee, en pixels. Elle ne duplique pas
 * l'image : les coins du mur sur chaque photo restent dans `calage` (leur source par point comprise).
 */
export interface TextureCalee {
  pxParM: number;
  cadre: { x0: number; y0: number; x1: number; y1: number };
  sansOmbres?: boolean;
}

/**
 * La structure d'une facade (spec facades §10) : ses rangees (appui et linteau, en metres depuis le
 * sol, de bas en haut) et ses travees (centre depuis la gauche et largeur, de gauche a droite).
 */
export interface GrilleFacade {
  niveaux: { appuiM: number; linteauM: number }[];
  travees: { xM: number; largeurM: number }[];
}

/**
 * Une correction de l'utilisateur sur ce que l'analyse proposait (spec facades §12) : ajout, retrait,
 * deplacement (l'ecart, en metres, de la proposition a la cote retenue), changement de type. Les
 * corrections mesurent le detecteur et designent le reglage a toucher.
 */
export interface CorrectionOuverture {
  geste: 'ajout' | 'retrait' | 'deplacement' | 'type';
  /** L'ouverture retenue (ajout, deplacement, type) ou retiree (retrait). */
  type: TypeOuverture;
  x: number;
  y: number;
  l: number;
  h: number;
  /** Deplacement : la cote retenue moins la cote proposee, par cote. */
  ecart?: { x: number; y: number; l: number; h: number };
  /** Changement de type : le type propose. */
  avant?: TypeOuverture;
  /** Ajout d'une ouverture devinee que l'analyse laissait decochee ; retrait d'une devinee. */
  source?: SourceOuverture;
}

/**
 * Ce qu'un releve photographique a retenu d'un mur. La texture est l'elevation redressee, a
 * l'echelle, en JPEG : elle couvre exactement `largeur` x `hauteur` metres, du sol a l'egout.
 */
export interface ReleveFacade {
  /** Indice du cote du contour : de `pts[cote]` a `pts[cote + 1]`. */
  cote: number;
  largeur: number;
  hauteur: number;
  /** Elevation redressee, `data:image/jpeg;base64,...`, ou `null` si le releve est sans photo. */
  texture: string | null;
  /**
   * La cle de la photo gardee sur l'appareil du releve (io/photosLocales.ts) : la plateforme refuse
   * les photos embarquees, le document enregistre n'en porte que la cle. Avec `texture` a `null`,
   * la photo est restee sur un autre appareil.
   */
  photoLocale?: string;
  /**
   * Hauteur couverte par la texture depuis le sol, en metres : au-dela de `hauteur`, c'est la bande
   * au-dessus de l'egout, que la 3D plaque sur le pignon. Absente, la texture s'arrete a l'egout.
   */
  hauteurTexture?: number;
  ouvertures: OuvertureFacade[];
  /** Distance de prise de vue, en metres, et l'instrument qui l'a donnee. */
  distance: number | null;
  sourceDistance: 'lidar' | 'webxr' | 'cadrage' | 'rue' | 'gps' | null;
  /** Date du releve, ISO 8601. */
  releveLe: string;
  /**
   * Pose automatiquement depuis la photo de l'audit de la parcelle, sans que la personne l'ait valide ni retouche
   * (app/audit/parcelle/validation.ts) : une nouvelle mesure de la facade peut le remplacer. Tombe des qu'elle releve la
   * facade a la main (app/releve/releve.ts).
   */
  depuisAudit?: true;
  /**
   * Un mur a deux hauteurs d'egout (en L) : la partie basse, de `debut` a `fin` metres depuis la
   * gauche, a son egout a `hauteur` ; la `hauteur` du releve est alors l'egout le plus haut. La
   * partie basse va sur toute la profondeur du batiment (facade/profil.ts, spec §6.2).
   */
  partieBasse?: PartieBasse | null;
  /**
   * Comment les photos ont ete calees (MD/spec-facades-calage-detection.md §13). Facultatif : un
   * releve d'avant garde exactement son sens. Depuis le lot L7 : la source des coins, l'azimut
   * corrige et la confiance du calage fin.
   */
  calage?: CalageReleve;
  /**
   * Les valeurs de la detection posees par la calibration de l'admin au moment du releve (facade/regles/facades/surcharges.ts) ;
   * vide : les valeurs livrees. Une detection rejouee plus tard part des memes seuils (facade/regles/facades/rejeuReleve.ts).
   * Absente sur un releve d'avant le schema 5 : on ne sait pas quels seuils l'ont produit.
   */
  calibration?: Readonly<Record<string, number>>;
  /** La structure de la facade, recalculee sur les ouvertures retenues (spec facades §10, lot L15). */
  grille?: GrilleFacade;
  /** Les corrections de l'utilisateur sur la proposition de l'analyse (spec facades §12, lot L15). */
  corrections?: CorrectionOuverture[];
  /*
   * La Facade (MD/spec-facade-calage-audit.md §3.2, lot F5) : ecrite a la validation de la facade (V4), en un pas d'historique, et
   * lue par la 3D, l'inspecteur, le plan et le Mode Toit. Facultative : un releve d'avant garde exactement son sens. Les ouvertures
   * de la facade objet sont `ouvertures`, avec leur `id` et leur `verifieeLe`.
   */
  dimensions?: DimensionsFacade;
  forme?: FormeFacade;
  surface?: SurfaceFacade;
  textureCalee?: TextureCalee;
}

/**
 * D'ou vient un coin pose sur une photo : trouve sur les aretes (calage fin), predit par la prise de
 * vue, propose par Claude (a venir), ou pose au doigt.
 */
export type SourceCoinReleve = 'trouve' | 'predit' | 'claude' | 'doigt';

/** Le calage d'une photo du releve : ses coins (pixels de la photo) et sa resolution au mur. */
export interface CalagePhotoReleve {
  /** Haut gauche, haut droit, bas droit, bas gauche, en pixels de la photo analysee. */
  coins: PtBrut[];
  /** Pixels par metre au mur sur la photo source : la precision reelle des cotes ; `null` si inconnue. */
  pxParMSource: number | null;
  /** La source de chacun des quatre coins, dans le meme ordre (absente avant le lot L7). */
  sourceCoins?: SourceCoinReleve[];
}

export interface CalageReleve {
  photos: CalagePhotoReleve[];
  /** L'azimut de la prise lu sur les points de fuite, en degres depuis le nord : la boussole calee. */
  azimutCorrigeDeg?: number;
  /** La note du calage fin de la premiere photo, de 0 a 1 (le seuil des coins trouves est 0,5). */
  confiance?: number;
}

/** La partie basse d'un mur en L, dans le repere de sa facade (metres). */
export interface PartieBasse {
  debut: number;
  fin: number;
  hauteur: number;
}
