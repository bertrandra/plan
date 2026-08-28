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
export interface SceneTrois {
  renderer: unknown;
  scene: unknown;
  camera: { position: { clone(): unknown } };
  controls: { target: { clone(): unknown } };
  [autre: string]: unknown;
}

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
