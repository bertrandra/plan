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
import type { ObjetPlan } from '../model/types.js';

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
  /** Le dernier modele exporte, garde pour pouvoir le reafficher sans le recalculer. */
  dernierExporte: { buffer: ArrayBuffer; nomTerrasse: string; date: unknown } | null;

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

export const vue3d: {
  scene: SceneVue3d | null;
  /** Cle de l'objet modelise, pour savoir si on reconstruit la MEME terrasse. */
  dernierObjKey: string | null;
  tousLesObjets: boolean;
  objetsOpaques: boolean;
  textures: boolean;
  ombres: boolean;
} = {
  scene: null,
  dernierObjKey: null,
  // Montrer tout le plan par defaut : une terrasse seule au milieu du vide ne se situe pas.
  tousLesObjets: true,
  objetsOpaques: true,
  textures: true,
  // Les ombres coutent cher a calculer et changent a chaque heure : on les allume a la demande.
  ombres: false
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
}

/**
 * Un point de vue, tel que la 3D le lit : un chemin de deux points et une altitude facultative.
 *
 * `pts[0]` est la position, `pts[0] → pts[1]` la direction. C'est bien un objet du plan
 * (`ObjetPlan` de type « pointDeVue »), mais seuls ces deux champs entrent dans le calcul de
 * camera.
 */
export type PointDeVue = Pick<ObjetPlan, 'pts' | 'altitude'>;
