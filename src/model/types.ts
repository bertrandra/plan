// Les types du modele : un objet du plan, sa construction, sa nomenclature, ses cotes, et ce qu'il porte (voisinage, PLU). Les
// points, le releve d'une facade, le toit, les hypotheses de calcul, les champs propres a une fonction (typesFonctions.ts) et les
// ouvrages (typesCloture.ts, typesPergola.ts, typesPiscine.ts) vivent dans leurs propres fichiers, re-exportes ici : un import de
// `model/types.js` reste valable (audit d'architecture, 25 octobre 2026).

export type { CouleurMurs, PhotoMur } from './couleurMur.js';
import type { PtBrut } from './points.js';
export type { Pt, PtEcran, PtBrut, Segment } from './points.js';
export type { TypeOuverture, OuvertureFacade, SourceOuverture, DetailsOuverture, GrilleFacade, CorrectionOuverture, ReleveFacade, SourceCoinReleve, CalagePhotoReleve, CalageReleve, PartieBasse, CarreauxOuverture, GrilleCarreaux, DimensionsFacade, FormeFacade, PointeLue, CorpsDeFacade, SurfaceFacade, ParementFacade, TextureCalee } from './typesReleve.js';
export type { FormeToitSimple, FormeToitCatalogue, FormeToit, ToitMesure, PignonToit, ToitACheval, CorpsToit, ElementDeToit, GenreSaillie, FormeSaillie, SaillieFacade, BaieToit, SpecialeToit, ProfilPan, BoutToit, TypeLucarne, Lucarne, BordsToit, PositionCheminee, Cheminee, EdiculeTerrasse, TerrasseToit, VolumeToit, CouvertureChoisie, Toit } from './typesToit.js';
import type { DeclarationPrealable } from './typesCalcul.js';
import type { ChampsBatiment, ChampsArbre, ChampsParasol, Plantation, NatureEquipement, TextureAppliquee } from './typesFonctions.js';
export type { ChampsBatiment, ChampsArbre, ChampsParasol, Plantation, FormePlantation, TypePlantation, NatureEquipement, TextureAppliquee, Fenetre3d, ProfilFacadesRetenu, Fenetres3d, VerifieSurPlace } from './typesFonctions.js';
export type { ZoneNeige, CategorieTerrain, HypothesesCalcul, DeclarationPrealable } from './typesCalcul.js';
import type { Cloture, TypeCloture } from './typesCloture.js';
export type { TypeCloture, ParementMur, EssenceHaie, LimiteCloture, SoubassementCloture, ReglageCloture, CoteCloture, OuverturePortail, FormePortail, RemplissagePortail, MateriauPortail, PiliersPortail, Portail, Cloture } from './typesCloture.js';
import type { Pergola } from './typesPergola.js';
export type { ToitPergola, MateriauPergola, Pergola } from './typesPergola.js';
import type { Piscine } from './typesPiscine.js';
import type { SoleilProjet } from './soleilProjet.js';
export type { ImplantationPiscine, StructurePiscine, RevetementPiscine, FondPiscine, PlagePiscine, SecuritePiscine, TraitementPiscine, ChauffagePiscine, LocalTechniquePiscine, Piscine } from './typesPiscine.js';

/**
 * Une forme du plan, telle que la manipulent le rendu, les exports et la 3D.
 *
 * Trois types cohabitent sous une seule forme, et c'est le champ `type` qui dit lequel : un
 * `polygon` et un `path` portent `pts`, un `circle` porte `center` et `r`. Les rendre optionnels
 * plutot que d'ecrire trois types separes est un choix de transition : le programme les traite
 * partout par la meme boucle, et un vrai type discrimine demanderait de reecrire ces boucles.
 * C'est un chantier du durcissement (spec §12), pas de la migration.
 *
 * Les champs `show*` sont ce que l'utilisateur a choisi d'afficher ; ils ne changent jamais la
 * geometrie, seulement ce qui s'ecrit dessus.
 */
/** Le jour ou un objet venu du cadastre ou de l'IGN a ete retouche a la main (`AAAA-MM-JJ`). */
export interface RetoucheMain { date: string }

interface ObjetCommun {
  key: string;
  name: string;

  /** Un nom par sommet et par cote : ces tableaux suivent `pts`, indice par indice. */
  vertexNames?: string[];
  segmentNames?: string[];
  /** Un coin gele ne bouge plus, ni au glisser ni par saisie d'angle. */
  frozenVertices?: boolean[];

  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  /** Largeur d'un chemin, en metres - c'est un objet du plan, pas un trait d'ecran. */
  width?: number;
  curve?: boolean;

  showName?: boolean;
  showSegNames?: boolean;
  showVertNames?: boolean;
  showDims?: boolean;
  showAngles?: boolean;

  hidden?: boolean;
  locked?: boolean;
  /**
   * Arrive par « Actualiser IGN » avec les parcelles adjacentes : masquable d'un coup (bascule
   * « voisinage »), jamais supprime par la bascule. L'import initial depuis une adresse ne le pose pas.
   */
  voisinage?: boolean;
  /** Contraint a rester dans la parcelle. */
  constrained?: boolean;
  /** Ordre d'empilement au dessin. */
  priority?: number;

  fonction?: string;
  matiere?: string;

  /**
   * Le lieu, porte par la parcelle et par elle seule.
   *
   * Il est range sur un objet du plan plutot que dans un reglage d'application pour qu'il se
   * sauvegarde avec le projet, sans cle supplementaire cote serveur (voir `model/lieu.ts`).
   */
  latitude?: number | null;
  longitude?: number | null;
  nomLieu?: string | null;
  /** Hauteur en metres, pour la Vue 3D et les ombres. */
  elevation?: number;

  /** Les parametres de construction, sur une terrasse et sur elle seule. */
  construction?: Construction;


  /** Hauteur d'oeil d'un point de vue, en metres. */
  altitude?: number;

  /**
   * Ce que l'import cadastral a rattache a la parcelle : le repere qui recale le fond orthophoto,
   * et la fiche cadastrale affichee ailleurs dans le panneau.
   *
   * **Partiel, volontairement** : seuls les deux champs lus par `render/ortho.ts` sont decrits ici.
   * La fiche complete (idu, commune, section, contenance, geometrie source, PLU…) appartient au
   * passage sur `geo/` et `io/`, pas a celui sur `render/` — l'ecrire en entier maintenant reviendrait
   * a deviner sa forme depuis un seul lecteur.
   */
  cadastre?: {
    /** Le point de calage, en longitude/latitude WGS84 — l'origine reelle enregistree a l'import. */
    origineLat?: number;
    origineLon?: number;
    [autreChampCadastre: string]: unknown;
  } | null;

  /** Reglages du fond orthophoto, rattaches a la parcelle comme le lieu et la cloture. */
  ortho?: {
    actif?: boolean;
    opacite?: number;
    parcelleOpacite?: number;
  } | null;

  /**
   * Bascules d'affichage rattachees a la parcelle, comme le fond orthophoto : masquage du
   * voisinage importe et de la grille. Elles suivent ainsi le projet enregistre plutot que d'etre
   * reperdues a chaque ouverture.
   */
  affichage?: {
    voisinage?: boolean;
    grille?: boolean;
  } | null;

  /**
   * Ce que la declaration prealable demande en plus du plan : le declarant, l'adresse du terrain
   * quand l'import ne l'a pas donnee, la residence. Range sur la parcelle, comme le lieu.
   */
  declaration?: DeclarationPrealable | null;

  /**
   * L'apparence du voisinage en 3D (model/voisinage3d.ts) : couleur des maisons et des fenetres,
   * dimensions des fenetres, clotures des parcelles voisines. Range sur la parcelle du projet,
   * comme le fond orthophoto ; absent, les defauts valent, et le fichier garde sa forme d'avant.
   */
  voisinage3d?: Partial<ReglagesVoisinage3d> | null;
  /**
   * Le gazon de la parcelle du projet en 3D (three/gazon.ts) : montre par defaut ; `false` le retire
   * et laisse voir la photo aerienne. Preference d'affichage, gardee a la reouverture.
   */
  gazon3d?: boolean | null;
  /**
   * Le soleil du projet (model/soleilProjet.ts) : la date et l'heure que le plan, la Vue 3D et la
   * visionneuse eclairent. Range sur la parcelle comme le lieu, et seulement une fois choisi.
   */
  soleil?: SoleilProjet | null;

  /** La cloture, rangee sur la parcelle comme le fond orthophoto et le lieu. */
  clotureActive?: boolean;
  clotureHauteur?: number;
  clotureCouleur?: string;
  clotureTexture?: TextureAppliquee | null;
  /**
   * La cloture cote par cote et ses acces (MD/spec-cloture.md). Absente, les quatre champs
   * ci-dessus font office de reglage par defaut : `model/cloture.ts::clotureDe` les lit. Presente,
   * ils sont tenus a jour avec `active` et `defaut`, pour les lecteurs qui ne connaissent qu'eux.
   */
  cloture?: Cloture | null;

  /**
   * Textures Poly Haven posees par l'utilisateur, choisies dans `ui/texturePicker.ts`.
   *
   * `textureVerticale`/`textureHorizontale` s'appliquent aux faces d'un objet de terrasse (le
   * platelage vu de dessus, ses tranches vues de cote).
   */
  textureVerticale?: TextureAppliquee | null;
  textureHorizontale?: TextureAppliquee | null;

  /**
   * Attributs BD TOPO d'un objet importe (batiment, haie, vegetation, arbre estime).
   *
   * Reste `unknown` volontairement : la forme varie selon la couche d'origine (un batiment porte
   * `nombreEtages`, une haie non) — voir `geo/cadastreObjets.ts`, seul ecrivain. La decrire par une
   * union taguee est un chantier du durcissement (spec §12), pas de cette migration.
   */
  bdtopo?: unknown;
  /**
   * Retouche a la main alors qu'il vient du cadastre ou de l'IGN (model/retouche.ts) : la personne a accepte, ce jour-la, de le
   * detacher de sa source. L'actualisation IGN le garde alors tel quel, sauf si elle demande de reprendre la version de l'IGN.
   * Absent sur tout objet non retouche : le fichier garde sa forme d'avant.
   */
  retoucheMain?: RetoucheMain | null;
  /**
   * Zonage PLU, rattache a la parcelle qu'il qualifie — contrairement a \`bdtopo\`, la forme de la
   * fiche IGN (\`ZonagePlu\`) est stable d'une commune a l'autre, elle a donc pu etre typee (voir
   * \`geo/apiIgn.ts::interrogerPlu\`, seul ecrivain).
   */
  plu?: ZonagePlu | null;
  /** Les rues autour de la parcelle du projet, lues a la BD TOPO (model/rues.ts) ; absentes tant qu'on ne les a pas demandees. */
  ruesVoisinage?: RuesVoisinage | null;
  /** Le toit et les facades d'un batiment (model/typesFonctions.ts) ; absent sur tout autre objet. */
  batiment?: ChampsBatiment | null;
  /** Le diametre et l'essence d'un arbre (model/typesFonctions.ts). */
  arbre?: ChampsArbre | null;
  /** Le pied d'un parasol et la terrasse qu'il ombrage (model/typesFonctions.ts). */
  parasol?: ChampsParasol | null;
  /** Les reglages d'une pergola (`engine/abri/pergola.ts`), sur un polygone de fonction `pergola`. */
  pergola?: Pergola | null;
  /** Les reglages d'une piscine (`engine/piscine.ts`), sur un polygone ou un cercle de fonction `piscine`. */
  piscine?: Piscine | null;
  /** La plantation d'un massif (model/jardin.ts, lot L3) ; absente : le bloc d'avant. */
  plantation?: Plantation | null;
  /** La vegetation basse d'un massif plante, dessinee par defaut en 3D : seul son retrait s'ecrit (comme `gazon3d`). */
  vegetation3d?: false;
  /** La nature d'un equipement (lot L3 : regard, eclairage, robinet) ; absente : un spa, qui charge la terrasse. */
  nature?: NatureEquipement;
  /**
   * Un ouvrage qui existe deja sur le terrain (une piscine, une terrasse, un chemin lus sur la photo aerienne, lot L3 ; schema 8) :
   * il situe le projet et se dessine, mais il ne se chiffre ni ne se declare (model/fonctions.ts, `estExistant`). Absent : a faire.
   */
  existant?: true;
  /**
   * Le relief du sol lu a l'IGN (MD/spec-relief.md), range sur la parcelle du projet comme le lieu
   * et le fond orthophoto. Absent tant que personne ne l'a lu : le plan est alors plat, et le
   * fichier de projet garde sa forme d'avant.
   */
  relief?: Relief | null;
}

/**
 * Une grille d'altitudes du sol nu sur la parcelle et ses abords (MD/spec-relief.md §3, §7).
 *
 * Elle vient d'une requete WMS a la Geoplateforme (LiDAR HD a 50 cm, sinon RGE ALTI a 1 m), posee
 * dans le repere du plan et enregistree avec le projet : un nombre produit hier doit rester
 * reproductible, et l'IGN met ses donnees a jour. Seul « Actualiser le relief » la remplace.
 */
export interface Relief {
  source: 'lidar-hd' | 'rge-alti';
  /** Le calque WMS exact, pour « Actualiser » et pour l'archive. */
  couche: string;
  /** Le jour de la lecture, en ISO (AAAA-MM-JJ). */
  dateLecture: string;
  /** LiDAR HD : la fin d'acquisition de la dalle ; RGE ALTI : absent. */
  dateDonnees?: string;
  /** Le texte du masque de source du RGE ALTI, ou « LiDAR HD ». */
  origine: string;
  /** « Emq < 30 cm », « de l'ordre de 10 cm (IGN) »… : pret a afficher. */
  precision: string;
  /** « NGF-IGN69 », « IGN78 »… */
  systemeAltimetrique: string;
  /** Le pas de la grille, en metres : 0,5, 1, 2, 5, 10, 20 ou 30 (model/relief.ts, PALIERS_RELIEF_M). */
  pas: number;
  /** Le centre de la cellule nord-ouest, dans le repere du plan (metres). */
  x0: number;
  y0: number;
  /** Colonnes (d'ouest en est) et lignes (du nord au sud). */
  nx: number;
  ny: number;
  /** `nx × ny` altitudes NGF au centimetre, ligne par ligne du nord au sud ; `null` : sans donnee. */
  z: (number | null)[];
  /** L'altitude NGF du zero du plan : le sol au point de reference de la terrasse (§3.3). */
  zRef: number;
  /** Preferences d'affichage, comme « Filaire » : ni annulation, ni « projet modifie ». */
  affichage?: AffichageRelief | null;
  /**
   * Le plafond de points des grilles (« Points max » de l'inspecteur), applique a la prochaine
   * lecture : « Actualiser le relief » et l'actualisation IGN. Absent : MAX_CELLULES_RELIEF.
   */
  maxCellules?: number;
  /**
   * La grille du voisinage (« relief sur toutes les parcelles ») : plus large et moins fine, elle ne
   * porte que le sol de la Vue 3D et les courbes du plan hors de la parcelle. La grille ci-dessus
   * reste celle de la parcelle et de ses abords, a son pas fin : les quantites ne lisent qu'elle.
   */
  paysage?: GrillePaysage | null;
}

/** La grille du voisinage d'un relief : la geometrie et les altitudes NGF, comme la grille de la parcelle. */
export interface GrillePaysage {
  source: 'lidar-hd' | 'rge-alti';
  pas: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  z: (number | null)[];
}

export interface AffichageRelief {
  courbes?: boolean;
  /** L'equidistance des courbes en metres ; absente ou 0 : choisie d'apres le denivele. */
  equidistance?: number;
  sol3d?: boolean;
}

/** Un polygone ferme : la parcelle, une terrasse, un batiment, une dalle. */
export interface ObjetPolygone extends ObjetCommun {
  type: 'polygon';
  pts: PtBrut[];
}

/** Un chemin ouvert, trace avec une largeur en metres. */
export interface ObjetChemin extends ObjetCommun {
  type: 'path';
  pts: PtBrut[];
}

/** Un cercle : un arbre, un parasol, un spa. */
export interface ObjetCercle extends ObjetCommun {
  type: 'circle';
  center: PtBrut;
  r: number;
}

/**
 * Une forme du plan. Trois formes, et c'est `type` qui dit laquelle : le compilateur ne laisse lire
 * `pts` qu'apres avoir ecarte le cercle, et `center`/`r` qu'apres l'avoir reconnu. Ce qui les
 * distingue est ici ; tout ce qu'elles partagent est dans `ObjetCommun`.
 */
export type ObjetPlan = ObjetPolygone | ObjetChemin | ObjetCercle;

/** Une forme a sommets : ce que le rendu, l'edition et le moteur manipulent le plus souvent. */
export type ObjetAPoints = ObjetPolygone | ObjetChemin;

/**
 * Un prix saisi a la main, range par longueur de barre (`'2.5'`, `'3'`…).
 *
 * Le type admet aussi un tableau, et ce n'est pas de la complaisance : les projets enregistres
 * portent `[]` la ou `defaultConstruction()` pose `{}`, et `ensureConstruction` les laisse passer
 * puisqu'un tableau *est* un objet. Un tableau vide se comporte comme un dictionnaire vide — aucune
 * clef a lire — et rien n'ecrit jamais par indice, donc les deux formes coexistent sans consequence.
 * Le type le dit plutot que de laisser croire a une seule.
 */
export type PrixParLongueur = Record<string, number> | unknown[];

/** Une ligne du chiffrage, telle qu'elle est enregistree avec la terrasse. */
export interface LigneBom {
  poste: string;
  label: string;
  qte: number;
  unite: string;
  prixBas: number;
  prixHaut: number;
  /** Prix retenu, ou `null` quand la fourchette n'a pas ete tranchee. */
  prixReel?: number | null;
  calcule?: string;
}

/** Une vue 3D enregistree sur la terrasse : d'ou l'on regarde, et ce que l'on vise. */
export interface VueEnregistree {
  nom: string;
  pos: { x: number; y: number; z: number };
  cible: { x: number; y: number; z: number };
}

/**
 * Les parametres de construction d'une terrasse : structure, debit, chiffrage, chantier.
 *
 * **Tout y est facultatif, et c'est la verite du stockage** — un projet enregistre avant qu'un
 * reglage existe ne le porte pas. `ensureConstruction` (engine/construction.ts) comble les manques a
 * l'ouverture, et c'est la seule raison pour laquelle le reste du moteur peut lire ces champs sans
 * precaution.
 *
 * Deux choses a savoir avant de s'y fier :
 *
 * 1. `ensureConstruction` comble **52 de ces champs** ; le seul qu'elle ne pose pas est `bom`, un
 *    resultat que `computeBOM` recalcule. Jusqu'au 21 septembre 2026 elle en laissait treize a
 *    `defaultConstruction()` seule (MD/DEFAUTS.md, D-1).
 * 2. La distinction « avant » / « apres `ensureConstruction` » n'est pas dans le type : les lectures
 *    du moteur posent un `!` la ou `ensureConstruction` est passee avant. Un type « construction
 *    complete » (`Required<Construction>` rendu par `ensureConstruction`) est le chantier qui les
 *    fera disparaitre.
 */
export interface Construction {
  // ---- Pose et fondation ----------------------------------------------------------------------
  /** `'vis-fondation'` ou `'plots'`. */
  typePose?: string;
  hauteurVis?: number;
  /** Depassement de la tete de vis hors sol, en cm. 0 = tete arasee. */
  depassementVis?: number;
  visModeAuto?: boolean;
  visEntraxe?: number;
  visEntraxeZoneSpa?: number;
  visMargeZoneSpa?: number;
  hauteurPlot?: number;
  plotModele?: string;
  plotEntraxe?: number;
  plotEntraxeAuto?: boolean;
  plotAvecSolives?: boolean;
  /** Surface d'assise d'un plot, en cm². */
  plotSurfaceAssise?: number;
  supportType?: string;
  /** Decaissement du support, en cm. */
  supportDecaissement?: number;
  /**
   * Niveau fini impose : le dessus des lames par rapport au terrain naturel, en cm. Absent, la
   * terrasse est posee sur le terrain et son dessus est la ou la structure le met. Plus bas que ce
   * que la structure donne, elle se pose dans un decaissement (engine/hauteurs.ts). Facultatif et
   * jamais comble par `ensureConstruction` : un projet qui ne l'a pas se relit au bit pres.
   */
  niveauFini?: number;
  /**
   * Plots dans l'emprise : le cadre recule du bord d'un rayon d'embase, pour que l'embase d'un plot
   * de rive ne depasse pas de la terrasse ; les lames debordent d'autant. Pose par
   * `constructionTerrasseNeuve` ; absent d'un projet anterieur, qui garde son cadre au bord.
   */
  plotsDansEmprise?: boolean;

  // ---- Charges et calibration -----------------------------------------------------------------
  chargeNormale?: number;
  chargeSpa?: number;
  kPortee?: number;
  kEntraxeLame?: number;
  coefRaideurLame?: number;

  // ---- Ossature -------------------------------------------------------------------------------
  soliveEntraxe?: number;
  soliveSection?: string;
  avecLambourde?: boolean;
  lambourdeEntraxe?: number;
  lambourdeSection?: string;

  // ---- Lames ----------------------------------------------------------------------------------
  essenceBois?: string;
  largeurLame?: number;
  epaisseurLame?: number;
  /** Jeu entre lames, en mm. */
  jeuLames?: number;
  avecLameRive?: boolean;
  /** Les cotes (indices du contour) qui n'ont pas de lame de rive : contre un mur, une marche. */
  cotesSansRive?: number[];
  /** Une lame de rive aussi autour des trous de la terrasse (pas autour d'un bassin, qu'elle borde par ses margelles). */
  riveOuvertures?: boolean;
  hauteurLameRive?: number;
  epaisseurLameRive?: number;
  avecLamePlat?: boolean;
  /** Angle de pose, en degres. */
  sensPose?: number;
  /** Indice du cote qui donne la direction de pose. */
  segmentReference?: number;

  // ---- Debit ----------------------------------------------------------------------------------
  /** Longueurs achetables, saisies en clair : `'3, 2.5, 2'`. */
  longueursLames?: string;
  longueursBois?: string;
  longueursLambourde?: string;
  /** Chute la plus courte qu'on accepte de reutiliser, en cm. */
  chuteMinReutilisable?: number;
  jointsSurAppui?: boolean;
  jointsBoisSurAppui?: boolean;

  // ---- Prix -----------------------------------------------------------------------------------
  prixLongueurs?: PrixParLongueur;
  prixLongueursBois?: PrixParLongueur;
  prixLongueursLambourde?: PrixParLongueur;
  prixPlots?: PrixParLongueur;
  /** `undefined` explicite quand l'utilisateur efface le prix saisi (zones/resultats/Nomenclature.tsx). */
  prixVisUnite?: number | undefined;
  visParBoite?: number;

  // ---- Chantier -------------------------------------------------------------------------------
  /** Cadences par poste, en heures par unite. */
  cadences?: Record<string, number> | unknown[];
  equipe?: number;
  heuresJour?: number;

  // ---- Sorties et affichage -------------------------------------------------------------------
  /** Denominateur de l'echelle du plan d'implantation : 200 pour du 1/200. */
  echelleImplant?: number;
  lames3dFilaire?: boolean;
  bom?: LigneBom[];
  vues3d?: VueEnregistree[];

}

/**
 * Un objet **avant** normalisation : la meme forme, mais rien de garanti.
 *
 * C'est le type de ce qui sort d'un fichier, d'`api.php` ou d'un instantane d'annulation. Il se
 * distingue d'`ObjetPlan` par ce qu'il ne promet pas : ni `key`, ni `name`, ni les tableaux
 * paralleles a `pts`. Les poser est precisement le travail de `normalizeObjects`, et le seul endroit
 * du programme ou l'on a le droit de rencontrer un objet incomplet est en amont de cet appel.
 */
export type ObjetBrut = Partial<ObjetPlan>;

/** Un objet sans ses sous-objets de fonction, type par type (une union se distribue). */
type SansSousObjets<T> = T extends unknown ? Omit<T, 'batiment' | 'arbre' | 'parasol'> : never;

/**
 * Un objet tel que le fichier de projet l'ecrit (io/serialisation.ts), et tel que l'historique et l'actualisation IGN le
 * manipulent : les champs propres a une fonction a plat, comme avant leurs sous-objets (model/champsFonction.ts).
 */
export type ObjetAPlat = SansSousObjets<ObjetBrut> & ChampsBatiment & {
  diametreArbre?: number; couleurArbre?: string; especeArbre?: string; textureArbre?: TextureAppliquee | null;
  hauteurParasol?: number; matDeporte?: boolean; matAngleDeg?: number; matSurPerimetre?: boolean; terrasseLieeKey?: string | null;
};



/** L'apparence du voisinage en 3D, rangee sur la parcelle du projet (MD/spec-toit-ign.md §6.4). */
/** Une rue : son nom (celui de la BAN) et ses troncons, dans le repere du plan. */
export interface RueVoisine { nom: string; troncons: PtBrut[][] }
/** Les rues lues autour de la parcelle du projet, et quand. */
export interface RuesVoisinage { recupereLe: string; rayonM: number; rues: RueVoisine[] }

export interface ReglagesVoisinage3d {
  /**
   * Les murs des maisons voisines : la couleur du plan, une couleur unique, ou une nuance tiree au
   * hasard entre deux ou trois couleurs (`deuxTons`, l'ancien nom de `nuance`, se lit encore).
   */
  maisons: { mode: 'plan' | 'unique' | 'nuance' | 'deuxTons'; couleur: string; couleur2: string; couleur3: string; nombre: 2 | 3 };
  /** Leurs fenetres : une couleur, ou une nuance tiree entre deux ; des dimensions tirees entre un minimum et un maximum. */
  fenetres: {
    mode: 'unique' | 'nuance';
    couleur: string;
    couleur2: string;
    largeurMin: number;
    largeurMax: number;
    hauteurMin: number;
    hauteurMax: number;
    /** L'entraxe entre deux fenetres : la densite. */
    entraxeMin: number;
    entraxeMax: number;
  };
  /** Un grillage, une palissade, une haie ou un mur sur les limites des parcelles voisines. */
  cloture: { afficher: boolean; type: Exclude<TypeCloture, 'aucune'>; couleur: string };
  /** Le nom des rues, sur le plan et au sol de la Vue 3D (les rues lues sont dans `ruesVoisinage`). */
  rues: { afficher: boolean };
  /**
   * Les toits des maisons voisines : en corps et pignons reconstruits sur le LiDAR (`corps`, le defaut,
   * lus a l'import et a l'actualisation IGN), ou en formes simples (MD/spec-toit-ign.md §13.6).
   */
  toits: { corps: boolean };
}



/**
 * Le zonage PLU, tel que renvoye par le Geoportail de l'urbanisme et enregistre sur \`ObjetPlan.plu\`.
 * Le type vit ici et non dans \`geo/apiIgn.ts\` pour la meme raison que \`TextureAppliquee\` : c'est une
 * donnee du projet, pas une donnee propre au module qui va la chercher.
 */
export interface ZoneUrba {
  libelle: string; libelong: string; typezone: string;
  partition: string; urlfic: string; nomfic: string; datappro: string;
}
export interface PrescriptionPlu { libelle: string; typepsc: string; urlfic: string }
export interface InformationPlu { libelle: string; typeinf: string; nomfic: string; urlfic: string }
/** Une servitude d'utilite publique (AC1, AC2, AC4/SPR, PT1, I4...) qui touche le point interroge. */
export interface ServitudePlu {
  type: string; nom: string; assiette: string; forme: string;
  generateur: string; nature: string; source: string;
  fichier: string; partition: string; urlreg: string;
}
export interface DocumentPlu { nom: string; type: string; partition: string }
export interface CommunePlu { nom: string; insee: string; rnu: boolean }

/** Le zonage complet au point interroge : c'est la forme reelle de \`ObjetPlan.plu\`. */
export interface ZonagePlu {
  zones: ZoneUrba[];
  prescriptions: PrescriptionPlu[];
  informations: InformationPlu[];
  servitudes: ServitudePlu[];
  /** Sous-ensemble de \`servitudes\` : les Sites Patrimoniaux Remarquables (AC4). */
  spr: ServitudePlu[];
  document: DocumentPlu | null;
  commune: CommunePlu | null;
  interrogeLe: string;
  lon: number;
  lat: number;
}

/**
 * Une cote telle qu'elle est enregistree : **deux references, pas des coordonnees**.
 *
 * Elle designe un cote (objet + indice) et un point (objet + indice), et sa geometrie est
 * recalculee a chaque rendu — c'est ce qui la garde juste quand l'objet mesure bouge.
 *
 * Le type vit ici et non dans `render/`, malgre son unique lecteur : c'est une donnee du projet, elle
 * s'enregistre dans le fichier et `core/state.ts` en tient la liste. Un etat qui doit importer depuis
 * `render/` pour se decrire remonterait la pile a l'envers.
 */
export interface Mesure {
  /** Pose par `idMesure()` a la creation, toujours present sur une cote de l'etat. */
  id: string;
  refObjKey: string;
  refSegIndex: number;
  startEnd: string;
  targetObjKey: string;
  targetPtIndex: number;
  /** Cote masquee : elle reste enregistree, elle ne se dessine plus. */
  show?: boolean;
  /** Ce qui s'ecrit au bout du trait de rappel : distance perpendiculaire, le long du cote, ou les deux. */
  displayMode?: string;
}
