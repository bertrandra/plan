// Les gardes de type de Three.js (spec §3.2, three/).
//
// `scene.traverse(o => ...)` rend des `Object3D` : le tronc commun, qui ne sait ni s'il porte une
// geometrie ni s'il eclaire. La bibliotheque repond a la question par des drapeaux poses sur les
// sous-classes (`isMesh`, `isLight`) plutot que par `instanceof` — c'est volontaire de sa part :
// deux copies de Three.js chargees dans la meme page ont des constructeurs differents mais les
// memes drapeaux.
//
// On garde donc exactement le test que le code faisait deja, ecrit comme un garde de type pour que
// ce qui suit voie la vraie sous-classe. Aucun changement de comportement : `o.isMesh` etait deja
// la condition, ici elle rend en plus son resultat au verificateur.

import type * as THREE_NS from 'three';

export function estMesh(o: THREE_NS.Object3D): o is THREE_NS.Mesh {
  return (o as THREE_NS.Mesh).isMesh === true;
}

export function estLumiere(o: THREE_NS.Object3D): o is THREE_NS.Light {
  return (o as THREE_NS.Light).isLight === true;
}

// Meme mecanique pour les textures, mais la question se pose ailleurs : `scene.background` vaut une
// couleur OU une texture (le damier de la visionneuse en est une), et les proprietes d'un materiau
// sont parcourues a l'aveugle au demontage pour trouver celles qui sont des textures a liberer.
export function estTexture(v: unknown): v is THREE_NS.Texture {
  return !!v && (v as THREE_NS.Texture).isTexture === true;
}
