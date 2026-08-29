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

/** Le bundle Three.js de la vue courante, ou `null` quand la Vue 3D est fermee. */
// Three.js n'est pas type ici (voir three/global.d.ts) : cette interface dit seulement « un objet
// de la bibliotheque », sans pretendre en decrire la forme. La decrire vraiment demanderait
// @types/three, une dependance de type sans dependance de code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SceneTrois = Record<string, any>;

/**
 * La visionneuse GLB est une **seconde** scene Three, independante de la Vue 3D : elle affiche un
 * fichier .glb deja produit, pas le plan. Les deux ne sont jamais ouvertes en meme temps, mais
 * elles ont chacune leur scene, leur camera et leurs preferences - les melanger reviendrait a
 * detruire la vue de l'une en fermant l'autre.
 */
export const glb: {
  scene: SceneTrois | null;
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
  intensiteSoleil: 1
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
  scene: SceneTrois | null;
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
