// Etat de la Vue 3D (spec §3.2, three/).
//
// La 3D a son propre etat, distinct de celui du plan : le plan decrit ce qu'on construit, la 3D
// decrit comment on le regarde. Un seul de ces champs merite d'etre enregistre avec le projet - et
// justement, aucun ne l'est : ce sont des preferences d'affichage, qui se perdent volontairement a
// la fermeture. Ce qui appartient au chantier (la cloture, les textures des objets) vit sur les
// objets du plan, pas ici.
//
// Un objet mutable partage plutot que des accesseurs : c'est la meme forme que `etat` pour le plan,
// et elle evite d'ecrire cinquante-cinq `getScene()` pour rien.

import type * as THREE_NS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { ObjetPlan, ObjetAPoints, PtBrut } from '../model/types.js';

/**
 * Ce que la Vue 3D et la visionneuse gardent en main entre deux images.
 *
 * Les huit champs communs sont exactement ceux qu'il faut pour redessiner, piloter la camera,
 * regler le soleil et tout demonter proprement a la fermeture — c'est la partie que le code partage
 * reellement entre les deux vues (`disposeThreeScene`, la boucle d'animation, le
 * redimensionnement). Les deux dernieres proprietes different, et c'est normal : la Vue 3D cadre un
 * plan (une etendue et un centroide en metres du plan), la visionneuse cadre un modele deja produit
 * (un centre et un rayon en coordonnees 3D). D'ou deux types, pas un seul avec quatre champs
 * facultatifs qui ne seraient jamais tous poses.
 *
 * Ces types sont ecrits depuis `@types/three@0.128.0`, une dependance de type sans dependance de
 * code : la bibliotheque elle-meme arrive du CDN au moment ou l'on ouvre la 3D (voir
 * `three/global.d.ts`).
 */
export interface SceneTroisBase {
  renderer: THREE_NS.WebGLRenderer;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  controls: OrbitControls;
  /** Le jeton de `requestAnimationFrame`, garde pour pouvoir arreter la boucle au demontage. */
  raf: number | null;
  dirLight: THREE_NS.DirectionalLight;
  dirFill: THREE_NS.DirectionalLight;
  hemiLight: THREE_NS.HemisphereLight;
}

/** La scene de la Vue 3D : elle cadre le plan, donc son etendue et son centroide, en metres. */
export interface SceneVue3d extends SceneTroisBase {
  extent: number;
  cen: { x: number; y: number };
}

/** La scene de la visionneuse : elle cadre un .glb deja produit, donc en coordonnees 3D. */
export interface SceneGlb extends SceneTroisBase {
  centre: THREE_NS.Vector3;
  rayon: number;
}

export type SceneTrois = SceneVue3d | SceneGlb;

/**
 * La visionneuse GLB est une **seconde** scene Three, independante de la Vue 3D : elle affiche un
 * fichier .glb deja produit, pas le plan. Les deux ne sont jamais ouvertes en meme temps, mais
 * elles ont chacune leur scene, leur camera et leurs preferences - les melanger reviendrait a
 * detruire la vue de l'une en fermant l'autre.
 */
export const glb: {
  scene: SceneGlb | null;
  ouvert: boolean;
  filaire: boolean;
  ombres: boolean;
  /** Fond de la visionneuse : « clair » ou « sombre ». */
  fond: string;
  /**
   * Le dernier modele exporte, garde pour pouvoir le reafficher sans le recalculer.
   *
   * `centre` est le centroide du plan sur lequel la scene exportee etait cadree, donc l'origine du
   * .glb : l'exporteur recopie la scene telle quelle, sans la recentrer. Sans ce champ, revenir a
   * un point de vue dans la visionneuse devait retrouver ce centre en cherchant une terrasse — la
   * terrasse *courante*, qui n'est pas forcement celle qu'on avait exportee.
   */
  dernierExporte: { buffer: ArrayBuffer; nomTerrasse: string; date: Date; centre: { x: number; y: number } } | null;

  /** Date et heure de la course du soleil dans la visionneuse, independantes de celles du plan. */
  dateStr: string;
  /** Minutes depuis minuit ; 720 = midi. */
  minutes: number;
  /** Seconde lumiere, du cote a l'ombre du soleil : decochable. */
  lumiereAppoint: boolean;
  /** Multiplicateur du soleil ; 1 = l'eclairage physique de l'heure. */
  intensiteSoleil: number;
  /** Derniere position du curseur « semaine », pour calculer de combien de crans il vient de bouger. */
  semaineAffichee: number;
} = {
  scene: null,
  ouvert: false,
  filaire: false,
  ombres: false,
  fond: 'clair',
  dernierExporte: null,
  dateStr: new Date().toISOString().slice(0, 10),
  minutes: 720,
  lumiereAppoint: true,
  intensiteSoleil: 1,
  semaineAffichee: 0
};

/**
 * Le soleil de la Vue 3D, dans les memes champs que celui de la visionneuse — et volontairement
 * **separe** : les deux vues peuvent etre reglees a des moments differents sans se marcher dessus.
 *
 * `semaineAffichee` n'est pas une donnee mais une memoire d'interface : la derniere position du
 * curseur, gardee pour calculer de combien de crans il vient de bouger (le decalage est relatif —
 * voir `util/semaine.ts`).
 */
export const soleilVue3d: {
  dateStr: string;
  minutes: number;
  intensiteSoleil: number;
  lumiereAppoint: boolean;
  semaineAffichee: number;
} = {
  dateStr: new Date().toISOString().slice(0, 10),
  minutes: 720,
  intensiteSoleil: 1,
  lumiereAppoint: true,
  semaineAffichee: 0
};

/**
 * Three.js et son exporteur glTF arrivent d'un CDN, a la demande. Ces deux drapeaux evitent de les
 * recharger : la bibliotheque se pose sur `window`, un second chargement ne casserait rien mais
 * couterait plusieurs mega-octets.
 */
export const chargement = {
  three: false,
  /** L'exporteur (ecrire un .glb) et le lecteur (en relire un) sont deux scripts distincts. */
  exporteurGltf: false,
  lecteurGltf: false
};

/**
 * Ce que `dernierObjKey` vaut quand la scene a ete construite **sans terrasse**.
 *
 * La Vue 3D s'ouvre aussi sur un plan qui n'en a pas : une parcelle avec ses batiments se regarde
 * en 3D telle quelle. Il faut donc une valeur qui ne soit la cle d'aucun objet — et une seule.
 * Tant qu'elle n'etait ecrite qu'a l'endroit qui construit la scene, quiconque voulait savoir « la
 * scene attendue est-elle la ? » devait la redeviner, et personne ne l'a devinee (D-15).
 */
export const CLE_SANS_TERRASSE = '__plan_sans_terrasse__';

/** La cle sous laquelle une scene est construite : celle de sa terrasse, ou celle du plan nu. */
export function cleDeVue(terrasse: { key: string } | null | undefined): string {
  return terrasse ? terrasse.key : CLE_SANS_TERRASSE;
}

export const vue3d: {
  scene: SceneVue3d | null;
  /**
   * Cle de l'objet modelise, pour savoir si on reconstruit la MEME terrasse.
   * Vaut `CLE_SANS_TERRASSE` quand le plan n'en a pas.
   */
  dernierObjKey: string | null;
  /** Le point du plan au centre de la scene (son origine locale) : de quoi y placer un autre cadrage. */
  centre: PtBrut | null;
  /**
   * Appelee juste apres chaque pose du soleil, AVANT le rendu : la vitrine y ajoute son disque et
   * son ciel du couchant (three/soleilVitrine.ts). La retouche apres coup ferait clignoter la scene,
   * rendue entre-temps avec les couleurs d'origine.
   */
  apresSoleil: ((soleil: { elevRad: number; azRad: number }) => void) | null;
  tousLesObjets: boolean;
  /** Sol en coupe sous la terrasse : l'assise et les fondations se voient (three/assise3d.ts). */
  solEnCoupe: boolean;
  objetsOpaques: boolean;
  textures: boolean;
  ombres: boolean;
} = {
  scene: null,
  dernierObjKey: null,
  centre: null,
  apresSoleil: null,
  // Montrer tout le plan par defaut : une terrasse seule au milieu du vide ne se situe pas.
  tousLesObjets: true,
  solEnCoupe: false,
  objetsOpaques: true,
  textures: true,
  // Ombres allumees d'office : elles coutent a calculer, mais c'est ce qu'on vient voir en 3D - la
  // course du soleil sur la terrasse. L'horloge du canevas (zones/vue3d/Horloge.tsx) les suit.
  ombres: true
};

/**
 * Ce que les modules 3D lisent du plan : de quoi retrouver la terrasse courante, rien de plus.
 *
 * L'etat complet leur est passe, mais seuls ces deux champs sont touches — `navigation.ts` ecrit
 * aussi le second, quand « aller au point de vue » selectionne la terrasse avant de basculer. Un
 * type par besoin plutot qu'une dependance de `three/` vers l'etat entier de l'application.
 */
export interface PlanVuDeLa3d {
  objects: ObjetPlan[];
  terrasseSelectedKey: string | null;
  /** La terrasse isolee : seule dans la scene, cadree sur elle, ses lames en transparence. */
  isolement?: string | null;
}

/**
 * Un point de vue, tel que la 3D le lit : un chemin de deux points et une altitude facultative.
 *
 * `pts[0]` est la position, `pts[0] → pts[1]` la direction. C'est bien un objet du plan
 * (`ObjetPlan` de type « pointDeVue »), mais seuls ces deux champs entrent dans le calcul de
 * camera.
 *
 * Les deux champs acceptent `undefined` explicitement (et pas seulement l'absence) : un point de vue
 * sans altitude se construit aussi bien avec `{ altitude: undefined }` qu'en omettant le champ.
 */
export interface PointDeVue {
  pts?: ObjetAPoints['pts'] | undefined;
  altitude?: ObjetPlan['altitude'] | undefined;
}

/** Ce qui fait avancer le glisser a un seul doigt dans la Vue 3D. */
export type Mode3D = 'orbit' | 'pan' | 'zoom';

/** L'aide de la Vue 3D avant le premier choix de mode : le texte d'origine du panneau. */
export const INDICATION_3D_DEFAUT = 'Glisser = tourner, molette ou boutons +/− = zoom, clic droit + glisser = deplacer. Les boutons orbite / deplacer / zoom changent ce que fait le glisser a un seul doigt — pratique sur tablette. Les points de vue se posent et se renomment sur le plan (outil « Point de vue »), ou avec « Enregistrer la vue comme point de vue ». Necessite une connexion internet (bibliotheque 3D chargee a la demande, pas embarquee dans ce fichier).';

/**
 * Ce que les panneaux des deux vues (zones/vue3d/) montrent de l'etat de la 3D : le chargement, la
 * position du soleil en clair, l'aide du mode de glisser, le plein page.
 *
 * `three/` ne touche plus au balisage : il pose ces champs et le signale (`signaler3d`), les zones
 * relisent. C'est la meme forme que le magasin (app/magasin.ts), sans que `three/` depende de `app/`.
 */
export const affichage3d = {
  /** La Vue 3D : fermee, en attente de la bibliotheque, ou prete (la scene est dans son hote). */
  vue3d: 'ferme' as 'ferme' | 'chargement' | 'pret',
  indication3d: INDICATION_3D_DEFAUT,
  mode: 'orbit' as Mode3D,
  /** « Soleil a 32° au-dessus de l'horizon, plein sud », ou vide avant la premiere scene. */
  soleilInfo: '',
  pleinePage3d: false,
  /** La visionneuse : aucun modele, chargement, ou modele affiche. */
  glb: 'vide' as 'vide' | 'chargement' | 'pret',
  indicationGlb: '',
  pleinePageGlb: false,
  /** Un .glb en cours de production : pour le telecharger (`export`) ou pour la visionneuse. */
  generation: null as null | 'export' | 'generation'
};

/**
 * Les elements qui recoivent le canvas de chaque vue. Les zones les enregistrent en se montant ;
 * `three/` y dessine sans les chercher par identifiant.
 */
export const hotes3d: { vue3d: HTMLElement | null; glb: HTMLElement | null } = { vue3d: null, glb: null };

let version = 0;
const abonnes = new Set<() => void>();
/** Dit aux zones que `affichage3d` (ou un reglage de `vue3d`, `glb`, `soleilVue3d`) a change. */
export function signaler3d(): void { version++; abonnes.forEach(f => f()); }
export function abonner3d(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
export const version3d = (): number => version;
