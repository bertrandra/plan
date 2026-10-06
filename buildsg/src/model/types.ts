// Primitives geometriques (spec-migration-typescript.md §5.1).
//
// La distinction Pt / PtEcran est le premier interet du typage sur ce code : `toScreen` et
// `toWorld` prennent et rendent aujourd'hui la meme forme `{x, y}`, donc rien n'empeche de passer
// des pixels la ou on attend des metres. Les deux types les rendent non interchangeables.

import type { Metres } from './units.js';

/** Coordonnees du plan, en metres, Y vers le nord (donc vers le haut a l'ecran). */
export interface Pt {
  x: Metres;
  y: Metres;
}

/** Pixels SVG, Y vers le bas - la convention de l'ecran, inverse de celle du plan. */
export interface PtEcran {
  x: number;
  y: number;
}

/** Un point tel qu'il arrive du code non encore migre : non marque. */
export interface PtBrut {
  x: number;
  y: number;
}

/**
 * Un segment oriente : d'ou il part, ou il va.
 *
 * La forme `{ a, b }` etait ecrite a la main dans une dizaine de signatures — decoupe de ligne,
 * cotes d'un anneau, solives, lambourdes, cadre. Elle porte un nom pour la meme raison que `PtBrut` :
 * la voir passer de fonction en fonction dit ce que le calcul manipule.
 *
 * A ne pas confondre avec `LimiteBrute` (`geometry/rings.ts`), qui est une **paire** `[p0, p1]` :
 * deux formes distinctes, et confondre les deux etait precisement l'erreur que le typage a trouvee.
 */
export interface Segment {
  a: PtBrut;
  b: PtBrut;
}

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

  /**
   * Ce qui fait d'un cercle un parasol.
   *
   * `center` reste **toujours** le centre de la toile, y compris sur un modele deporte : c'est elle
   * qui porte l'ombre, la surface et le cercle dessine. Seul le pied se deplace, a `matAngleDeg` du
   * centre et a une distance d'un rayon. Garder cette convention evite de calculer l'ombre de deux
   * facons selon le modele.
   */
  hauteurParasol?: number;
  matDeporte?: boolean;
  matAngleDeg?: number;
  /** Le pied doit rester sur le pourtour de la terrasse. */
  matSurPerimetre?: boolean;
  /** La terrasse a laquelle un parasol est rattache — celle dont on mesure l'ombrage. */
  terrasseLieeKey?: string | null;

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
   * platelage vu de dessus, ses tranches vues de cote) ; `textureArbre` au feuillage d'un arbre.
   */
  textureVerticale?: TextureAppliquee | null;
  textureHorizontale?: TextureAppliquee | null;
  textureArbre?: TextureAppliquee | null;

  /**
   * Attributs BD TOPO d'un objet importe (batiment, haie, vegetation, arbre estime).
   *
   * Reste `unknown` volontairement : la forme varie selon la couche d'origine (un batiment porte
   * `nombreEtages`, une haie non) — voir `geo/cadastreObjets.ts`, seul ecrivain. La decrire par une
   * union taguee est un chantier du durcissement (spec §12), pas de cette migration.
   */
  bdtopo?: unknown;
  /**
   * Zonage PLU, rattache a la parcelle qu'il qualifie — contrairement a \`bdtopo\`, la forme de la
   * fiche IGN (\`ZonagePlu\`) est stable d'une commune a l'autre, elle a donc pu etre typee (voir
   * \`geo/apiIgn.ts::interrogerPlu\`, seul ecrivain).
   */
  plu?: ZonagePlu | null;
  /** Diametre estime d'un arbre importe, en metres. */
  diametreArbre?: number;
  couleurArbre?: string;
  /**
   * Releves de facade d'un batiment : un par mur photographie, rattache au cote du contour qui le
   * porte (`MD/spec-releve-facade.md`). Absent tant que rien n'a ete releve - le fichier de projet
   * d'un plan sans releve garde alors exactement sa forme d'avant.
   */
  facades?: ReleveFacade[] | null;
  /** Forme du toit d'un batiment ; absente, le batiment reste le bloc plat d'avant. */
  toit?: Toit | null;
  /** Les reglages d'une pergola (`engine/pergola.ts`), sur un polygone de fonction `pergola`. */
  pergola?: Pergola | null;
  /** Les reglages d'une piscine (`engine/piscine.ts`), sur un polygone ou un cercle de fonction `piscine`. */
  piscine?: Piscine | null;
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

/**
 * Une texture Poly Haven telle qu'elle est enregistree sur un objet du plan, apres un choix dans
 * `ui/texturePicker.ts` — le type vit ici et non la-bas pour la meme raison que `Mesure` juste en
 * dessous : c'est une donnee du projet, portee par plusieurs champs d'`ObjetPlan`, pas une donnee
 * du selecteur lui-meme.
 */
export interface TextureAppliquee {
  id: string;
  nom: string;
  /** Absente quand l'API Poly Haven ne fournit pas de `thumbnail_url`. */
  vignette?: string | undefined;
  url: string;
}

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
   * Hauteur couverte par la texture depuis le sol, en metres : au-dela de `hauteur`, c'est la bande
   * au-dessus de l'egout, que la 3D plaque sur le pignon. Absente, la texture s'arrete a l'egout.
   */
  hauteurTexture?: number;
  ouvertures: OuvertureFacade[];
  /** Distance de prise de vue, en metres, et l'instrument qui l'a donnee. */
  distance: number | null;
  sourceDistance: 'lidar' | 'webxr' | 'cadrage' | null;
  /** Date du releve, ISO 8601. */
  releveLe: string;
  /**
   * Un mur a deux hauteurs d'egout (en L) : la partie basse, de `debut` a `fin` metres depuis la
   * gauche, a son egout a `hauteur` ; la `hauteur` du releve est alors l'egout le plus haut. La
   * partie basse va sur toute la profondeur du batiment (facade/profil.ts, spec §6.2).
   */
  partieBasse?: PartieBasse | null;
}

/** La partie basse d'un mur en L, dans le repere de sa facade (metres). */
export interface PartieBasse {
  debut: number;
  fin: number;
  hauteur: number;
}

/** Forme d'un toit simple : voir `facade/toit.ts`, qui le construit. */
export type FormeToit = 'plat' | 'appentis' | 'deux-pans' | 'quatre-pans' | 'croupes';

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
  /** D'ou vient la forme : estimee sur une photo, deduite de la BD TOPO, ou saisie. */
  source?: 'photo' | 'bdtopo' | 'saisie';
  /**
   * `croupes` seulement : une pente imposee, en degres. Absente, la pente se deduit de `hauteur` et
   * du contour ; presente, le toit est ecrete a `hauteur` (MD/spec-toit-ign.md §3.3).
   */
  pente?: number;
  /** La hauteur n'a pas ete lue mais estimee (MD/spec-toit-ign.md §4, regle 3). */
  estime?: boolean;
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

/** Region de neige de l'annexe nationale francaise de NF EN 1991-1-3. */
export type ZoneNeige = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D' | 'E';
/** Categorie de terrain de l'annexe nationale francaise de NF EN 1991-1-4. */
export type CategorieTerrain = '0' | 'II' | 'IIIa' | 'IIIb' | 'IV';

/**
 * Ce que la note de calcul d'un abri demande en plus de sa geometrie. Les zones n'ont pas de valeur
 * par defaut : une note calculee sur une zone devinee serait fausse sans le dire.
 */
export interface HypothesesCalcul {
  zoneNeige?: ZoneNeige;
  /** Region de vent, 1 a 4. */
  zoneVent?: number;
  /** Altitude du terrain, en metres. */
  altitude?: number;
  terrain?: CategorieTerrain;
  classeBois?: 'C24' | 'GL24h';
  /** Classe de service (NF EN 1995-1-1 §2.3.1.3) : 2 sous abri, 3 a l'exterieur. */
  classeService?: number;
  /** Epaisseur des parois des profiles aluminium, en mm. */
  epaisseurAlu?: number;
  /** Poids de la couverture, en kg/m² de rampant. */
  poidsCouverture?: number;
  /** Obstruction sous le toit (NF EN 1991-1-4 §7.3, φ), de 0 a 1. */
  obstruction?: number;
}

/**
 * Le declarant et son projet, pour le cerfa 13703 (declaration prealable, maison individuelle et
 * ses annexes). Tout est facultatif : ce qui manque reste vide dans le formulaire, a completer a la main.
 */
export interface DeclarationPrealable {
  nom?: string;
  prenom?: string;
  /** Date de naissance, AAAA-MM-JJ. */
  naissance?: string;
  communeNaissance?: string;
  departementNaissance?: string;
  paysNaissance?: string;
  numero?: string;
  voie?: string;
  lieuDit?: string;
  localite?: string;
  codePostal?: string;
  telephone?: string;
  email?: string;
  /** Recevoir les reponses de l'administration a cette adresse electronique. */
  accepteEmail?: boolean;
  /** L'adresse du terrain, quand elle differe de celle lue au cadastre. */
  terrainNumero?: string;
  terrainVoie?: string;
  terrainLocalite?: string;
  terrainCodePostal?: string;
  residence?: 'principale' | 'secondaire';
}
