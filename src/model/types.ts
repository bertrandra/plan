// Les types du modele : un objet du plan, sa construction, sa nomenclature, ses cotes, et ce qu'il porte (cloture, voisinage,
// fenetres en 3D, PLU, pergola, piscine). Les points, le releve d'une facade, le toit et les hypotheses de calcul vivent dans
// leurs propres fichiers (points.ts, typesReleve.ts, typesToit.ts, typesCalcul.ts), re-exportes ici : un import de
// `model/types.js` reste valable (audit d'architecture, 25 octobre 2026).

import type { CouleurMurs } from './couleurMur.js';
export type { CouleurMurs, PhotoMur } from './couleurMur.js';
import type { PtBrut } from './points.js';
export type { Pt, PtEcran, PtBrut, Segment } from './points.js';
import type { OuvertureFacade, ReleveFacade } from './typesReleve.js';
export type { TypeOuverture, OuvertureFacade, SourceOuverture, DetailsOuverture, GrilleFacade, CorrectionOuverture, ReleveFacade, SourceCoinReleve, CalagePhotoReleve, CalageReleve, PartieBasse } from './typesReleve.js';
import type { ToitMesure, ToitACheval, CorpsToit, VolumeToit, Toit } from './typesToit.js';
export type { FormeToitSimple, FormeToitCatalogue, FormeToit, ToitMesure, PignonToit, ToitACheval, CorpsToit, ElementDeToit, GenreSaillie, FormeSaillie, SaillieFacade, BaieToit, SpecialeToit, ProfilPan, BoutToit, TypeLucarne, Lucarne, BordsToit, PositionCheminee, Cheminee, EdiculeTerrasse, TerrasseToit, VolumeToit, CouvertureChoisie, Toit } from './typesToit.js';
import type { HypothesesCalcul, DeclarationPrealable } from './typesCalcul.js';
export type { ZoneNeige, CategorieTerrain, HypothesesCalcul, DeclarationPrealable } from './typesCalcul.js';

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
   * platelage vu de dessus, ses tranches vues de cote). `textureArbre` n'est plus lue depuis les arbres d'EZ-tree ; le champ reste ecrit
   * (a null) pour que le format du fichier, et ses empreintes, ne bougent pas.
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
   * Le toit d'un batiment de la parcelle du projet en plusieurs volumes (model/volumesToit.ts) : le
   * contour decoupe en rectangles, chacun son toit et, mesure sur le LiDAR, son egout. `modeToit`
   * dit lequel la 3D montre : les volumes (defaut quand ils existent) ou le seul `toit`.
   */
  volumesToit?: VolumeToit[] | null;
  /**
   * Le toit tel que le LiDAR HD le mesure (model/toitMesure.ts) : une grille de hauteurs au-dessus
   * du sol sous le contour, nettoyee. La 3D le dessine en surface. Batiments de la parcelle du projet.
   */
  toitMesure?: ToitMesure | null;
  /**
   * Les corps du batiment reconstruits sur la surface mesuree (facade/toits/toitCorps.ts) : chacun son
   * faitage, ses egouts, ses pignons. Batiments de la parcelle du projet.
   */
  corpsToit?: CorpsToit[] | null;
  /**
   * La version de la lecture LiDAR qui a traite ce batiment (app/toits/toitsLidar.ts) ; absente, il reste
   * a lire, et la tache de fond (app/toits/toitsFond.ts) le prendra a son tour.
   */
  toitLidarLu?: number | null;
  /**
   * La couleur des murs lue sur une photo de rue, et la source choisie pour la 3D (model/couleurMur.ts) :
   * la photo, le materiau des fichiers fonciers (`bdtopo.materiauxMurs`) ou la couleur du plan.
   */
  couleurMurs?: CouleurMurs | null;
  /**
   * Un batiment dont le toit et les facades ont ete vus et valides lors d'un audit de la parcelle
   * (MD/spec-audit.md §14, « le 100 % ») : la date de la validation. Absent pour tous les autres, et
   * le fichier d'un projet sans audit garde exactement sa forme d'avant.
   */
  verifieSurPlace?: VerifieSurPlace | null;
  /**
   * « Règles » coupées pour ce bâtiment (palette, groupe Toit) : la lecture automatique du toit (LiDAR,
   * faits, profils de regles/) ne le touche plus, ni à l'import, ni en tâche de fond, ni à l'actualisation
   * IGN ; le toit se règle à la main. Absent (ou faux) : la lecture automatique suit, comme avant.
   */
  toitFige?: boolean;
  /**
   * Un batiment a cheval sur deux parcelles dont un corps franchit la limite (model/aCheval.ts) :
   * les parcelles en jeu et, une fois la question posee, la reponse - un seul toit, ou un toit par
   * parcelle (les corps relus sur chaque part). Sans reponse, la question revient a l'ouverture.
   */
  toitACheval?: ToitACheval | null;
  /** Ce que la 3D montre : les corps et pignons (defaut quand ils existent), la surface mesuree, un toit par corps, ou le seul `toit`. */
  modeToit?: 'simple' | 'volumes' | 'mesure' | 'corps';
  /** Les rues autour de la parcelle du projet, lues a la BD TOPO (model/rues.ts) ; absentes tant qu'on ne les a pas demandees. */
  ruesVoisinage?: RuesVoisinage | null;
  /** L'essence d'un arbre en 3D : l'identifiant d'une essence de la bibliotheque du serveur (model/especesArbre.ts). Absent : la premiere. */
  especeArbre?: string;
  /**
   * Releves de facade d'un batiment : un par mur photographie, rattache au cote du contour qui le
   * porte (`MD/spec-releve-facade.md`). Absent tant que rien n'a ete releve - le fichier de projet
   * d'un plan sans releve garde alors exactement sa forme d'avant.
   */
  facades?: ReleveFacade[] | null;
  /** Forme du toit d'un batiment ; absente, le batiment reste le bloc plat d'avant. */
  toit?: Toit | null;
  /**
   * Les fenetres dessinees en 3D sur un batiment du projet (model/fenetres3d.ts) : une dimension
   * pour toutes, ou une liste reglee une par une. Absent, la disposition automatique vaut.
   */
  fenetres3d?: Fenetres3d | null;
  /**
   * Le profil de facades retenu pour le batiment (regles/facades/reglages.json,
   * facade/regles/facades/profils.ts), et la version de la lecture qui l'a choisi
   * (regles/facades/reglages.ts, VERSION_LECTURE_FACADES). Absent, le profil par defaut.
   */
  profilFacades?: ProfilFacadesRetenu | null;
  /** Les reglages d'une pergola (`engine/pergola.ts`), sur un polygone de fonction `pergola`. */
  pergola?: Pergola | null;
  /** Les reglages d'une piscine (`engine/piscine.ts`), sur un polygone ou un cercle de fonction `piscine`. */
  piscine?: Piscine | null;
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

/** Une ouverture dessinee en 3D sur un mur d'un batiment du projet : laquelle, et sur quel cote. */
export interface Fenetre3d extends OuvertureFacade {
  /** Indice du cote du contour : de `pts[cote]` a `pts[cote + 1]`. */
  cote: number;
}

/** Le profil de facades d'un batiment : son identifiant (`defaut`, ou un profil du fichier) et la version qui l'a choisi. */
export interface ProfilFacadesRetenu {
  id: string;
  version: number;
}

/** Les fenetres d'un batiment du projet en 3D (model/fenetres3d.ts). */
export interface Fenetres3d {
  /** `toutes` : une dimension commune, disposition automatique ; `uneParUne` : la liste, reglee a la main. */
  mode: 'toutes' | 'uneParUne';
  largeur: number;
  hauteur: number;
  /** La hauteur d'appui, en metres au-dessus du plancher du niveau. */
  appui: number;
  entraxe: number;
  couleur?: string;
  /** Mode `uneParUne` : les ouvertures, initialisees depuis la disposition automatique. */
  liste?: Fenetre3d[];
}
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

/** Ce qu'un audit de la parcelle a verifie sur place (MD/spec-audit.md §14). */
export interface VerifieSurPlace {
  /** Le jour de la validation, AAAA-MM-JJ. */
  date: string;
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

