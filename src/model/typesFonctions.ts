// Ce qu'un objet du plan porte selon sa fonction (MD/roadmap-architecture.md, etape 4.3 ; schema 5) : un batiment son toit et
// ses facades, un arbre son essence et son diametre, un parasol son pied et la terrasse qu'il ombrage. Chaque groupe vit dans un
// sous-objet de l'objet (`batiment`, `arbre`, `parasol`), absent tant que rien n'y est pose ; la piscine, la pergola et la cloture
// avaient deja le leur. Jusqu'au schema 4, ces champs etaient a plat sur l'objet : la migration 4 -> 5 les range
// (model/migrations.ts). Lire `o.batiment?.toit`, ecrire `champsBatiment(o).toit = …` (model/champsFonction.ts).

import type { CouleurMurs } from './couleurMur.js';
import type { ReleveFacade } from './typesReleve.js';
import type { ToitMesure, ToitACheval, CorpsToit, VolumeToit, Toit } from './typesToit.js';
import type { OuvertureFacade } from './typesReleve.js';

/** Le toit et les facades d'un batiment. */
export interface ChampsBatiment {
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
   * La hauteur a l'egout (`elevation`) choisie : saisie dans l'inspecteur, ou validee par l'audit de la parcelle. Ni la relecture
   * du LiDAR, ni un fait du moteur, ni l'actualisation IGN ne la reecrivent plus (model/protections.ts). Absente : la hauteur reste
   * celle des lectures, comme avant.
   */
  egoutChoisi?: 'saisie' | 'audit';
  /**
   * Un batiment a cheval sur deux parcelles dont un corps franchit la limite (model/aCheval.ts) :
   * les parcelles en jeu et, une fois la question posee, la reponse - un seul toit, ou un toit par
   * parcelle (les corps relus sur chaque part). Sans reponse, la question revient a l'ouverture.
   */
  toitACheval?: ToitACheval | null;
  /** Ce que la 3D montre : les corps et pignons (defaut quand ils existent), la surface mesuree, un toit par corps, ou le seul `toit`. */
  modeToit?: 'simple' | 'volumes' | 'mesure' | 'corps';
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
}

/** Un arbre du plan : importe (diametre estime) ou pose a la main, et son essence en 3D. */
export interface ChampsArbre {
  /** Diametre estime d'un arbre importe, en metres. */
  diametre?: number;
  couleur?: string;
  /** L'essence d'un arbre en 3D : l'identifiant d'une essence de la bibliotheque du serveur (model/especesArbre.ts). Absent : la premiere. */
  espece?: string;
  /** Une texture d'arbre de l'ancien dessin, plus lue depuis les arbres d'EZ-tree : gardee pour un fichier qui en porte une. */
  texture?: TextureAppliquee | null;
}

/** Ce qui fait d'un cercle un parasol. */
export interface ChampsParasol {
  /**
   * Hauteur de la toile, en metres.
   *
   * `center` reste **toujours** le centre de la toile, y compris sur un modele deporte : c'est elle
   * qui porte l'ombre, la surface et le cercle dessine. Seul le pied se deplace, a `matAngleDeg` du
   * centre et a une distance d'un rayon. Garder cette convention evite de calculer l'ombre de deux
   * facons selon le modele.
   */
  hauteur?: number;
  matDeporte?: boolean;
  matAngleDeg?: number;
  /** Le pied doit rester sur le pourtour de la terrasse. */
  matSurPerimetre?: boolean;
  /** La terrasse a laquelle un parasol est rattache — celle dont on mesure l'ombrage. */
  terrasseLieeKey?: string | null;
}

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

/** Ce qu'un audit de la parcelle a verifie sur place (MD/spec-audit.md §14). */
export interface VerifieSurPlace {
  /** Le jour de la validation, AAAA-MM-JJ. */
  date: string;
}

/** Ce qu'est un massif (lot L3, jardin) : un massif plante, ou une plate-bande au ras du sol. */
export type NatureMassif = 'massif' | 'plate-bande';
/** Ce qu'il porte : la vegetation basse dessinee en 3D en suit la forme et les couleurs. */
export type ContenuMassif = 'fleurs' | 'arbustes' | 'vivaces' | 'mixte' | 'potager';

/**
 * Un massif ou une plate-bande du jardin (model/jardin.ts) ; absent, le massif reste le bloc d'avant (une haie importee de l'IGN,
 * un ancien fichier) : rien n'y pousse en 3D.
 */
export interface ChampsMassif {
  nature: NatureMassif;
  contenu: ContenuMassif;
  /** Seul son retrait s'ecrit : la vegetation basse se dessine par defaut. */
  vegetation?: false;
  /** Un arbre nain plante au centre : une essence de la bibliotheque (petits arbres), et sa hauteur. */
  miniArbre?: { espece: string; hauteurM: number } | null;
}

/** Ce qu'est un equipement du jardin (lot L3) : il ne charge pas une terrasse, a la difference d'un spa. */
export type NatureEquipement = 'regard' | 'eclairage' | 'robinet';

/** Un equipement du jardin ; absent, l'equipement d'avant (un spa, un jacuzzi : la terrasse se renforce sous lui). */
export interface ChampsEquipement {
  nature: NatureEquipement;
}
