// Ce qui arrive du reseau pour la 3D : les textures, et le lecteur glTF (spec §3.2, three/).
//
// Three.js est la seule dependance externe du programme, et elle n'est chargee que si l'on ouvre la
// Vue 3D : tout le reste marche sans connexion.

import { chargement } from './etat3d.js';
import { showErrBanner } from '../shell/dialogs.js';

/**
 * Charge une texture, et la redimensionne si l'image decodee depasse 1024 px.
 *
 * Ce plafond n'est pas un reglage de qualite mais un garde-fou memoire : une image 4096 × 4096 non
 * compressee occupe environ 64 Mo de memoire graphique **pour une seule carte d'un seul objet**.
 * Sur un telephone, c'est une grande part du budget de l'onglet, et le depassement tue la page sans
 * erreur rattrapable — le systeme met fin au processus.
 *
 * Une instance par usage, plutot qu'un cache partage : cloner une texture avant la fin de son
 * chargement la prive **definitivement** de son image (verifie — le clone garde un `.image` vide
 * meme apres coup, `TextureLoader` ne relie pas les deux de facon vivante). Chaque objet a de toute
 * facon son propre `repeat` a regler selon sa taille, et le second telechargement de la meme URL
 * passe par le cache HTTP du navigateur.
 */
export function chargerTexturePolyhaven(url: string) {
  const tex = new THREE.TextureLoader().load(url, () => {
    const MAX_DIM = 1024;
    const img0 = tex.image;
    if (img0 && (img0.width > MAX_DIM || img0.height > MAX_DIM)) {
      const scale = MAX_DIM / Math.max(img0.width, img0.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img0.width * scale); c.height = Math.round(img0.height * scale);
      c.getContext('2d').drawImage(img0, 0, 0, c.width, c.height);
      tex.image = c;
      tex.needsUpdate = true;
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Charge le lecteur glTF, une seule fois, et rappelle quand il est pret.
 *
 * Il arrive separement de Three.js et de ses controles, et seulement au **premier export GLB** : la
 * plupart des sessions ouvrent la Vue 3D sans jamais exporter, inutile d'alourdir ce chemin-la pour
 * tout le monde.
 */
export function ensureGLTFLoaderLoaded(cb: () => void): void {
  if (chargement.lecteurGltf && window.THREE && window.THREE.GLTFLoader) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  s.onload = () => { chargement.lecteurGltf = true; cb(); };
  s.onerror = () => showErrBanner('Impossible de charger le lecteur GLB (connexion internet requise pour cette fonctionnalite).');
  document.head.appendChild(s);
}
