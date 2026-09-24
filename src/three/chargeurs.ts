// Ce qui arrive du reseau pour la 3D : les textures, et le lecteur glTF (spec §3.2, three/).
//
// Three.js est la seule dependance externe du programme, et elle n'est chargee que si l'on ouvre la
// Vue 3D : tout le reste marche sans connexion.

import { chargement } from './etat3d.js';
import { showErrBanner } from '../shell/dialogs.js';
import type * as THREE_NS from 'three';

/**
 * Combien de metres reels une image de texture represente.
 *
 * La meme regle pour tout ce dont les coordonnees de texture sont **des metres** — murs, sol,
 * lames, bandes — pour qu'un carreau ait la meme taille visuelle quel que soit l'objet sur lequel
 * il tombe. Un cone de parasol ou une sphere d'arbre ne sont pas dans ce cas : leurs coordonnees
 * sont deja normalisees, et l'image doit en faire le tour une fois. D'ou le second argument de
 * `chargerTexturePolyhaven`, qui distingue ces deux familles.
 */
export const METRES_PAR_CARREAU = 2;

/**
 * Les textures deja chargees, par URL **et repetition**. Elles appartiennent a ce module, pas aux
 * scenes.
 *
 * C'est le coeur de la correction du 24 septembre 2026. Avant, chaque materiau appelait le chargeur
 * et recevait une instance neuve : le plan de demonstration ne reference que **huit** images, et la
 * scene en fabriquait **178** — une par face de lame, de solive, de lambourde. Une image 1024 × 1024
 * occupe 4 Mio en memoire graphique, pres de 5,3 Mio avec ses niveaux de detail : environ 950 Mio
 * au lieu de 43. Un onglet de telephone en a quelques centaines, et le depassement ne leve aucune
 * erreur rattrapable — le systeme met fin au processus, ce qui se voit comme un plantage a
 * l'affichage de la vue 3D.
 *
 * **Partager, et non cloner.** L'ancien commentaire donnait deux raisons de ne pas mutualiser. La
 * premiere tient toujours : cloner une texture avant la fin de son chargement la prive
 * definitivement de son image — le clone garde un `.image` vide meme apres coup, `TextureLoader` ne
 * relie pas les deux de facon vivante. Elle ne s'applique pas ici, puisqu'on rend la **meme**
 * instance. La seconde — « chaque objet a son propre `repeat` a regler selon sa taille » — avait
 * cesse d'etre vraie : la repetition ne depend plus de la taille de l'objet, seulement de la nature
 * de ses coordonnees de texture, et elle ne prend que deux valeurs. C'est pourquoi elle est posee
 * ici, une fois par valeur, et qu'aucun appelant n'a plus a toucher une instance qu'il partage.
 */
const partagees = new Map<string, THREE_NS.Texture>();

/**
 * Lesquelles sont partagees, pour que la demolition de scene sache ce qu'elle n'a fait qu'emprunter.
 *
 * Un ensemble faible plutot qu'une marque posee sur la texture : rien d'exterieur ne peut se
 * declarer partage par erreur, et la reponse vient de celui qui possede reellement les instances.
 */
const marquees = new WeakSet<THREE_NS.Texture>();

/** Cette texture appartient-elle au cache ? Si oui, personne d'autre n'a le droit de la detruire. */
export function estTexturePartagee(tex: THREE_NS.Texture): boolean {
  return marquees.has(tex);
}

/**
 * Charge une texture, ou rend celle qui porte deja cette URL **et cette repetition**.
 *
 * Le plafond de 1024 px n'est pas un reglage de qualite mais un garde-fou memoire : une image
 * 4096 × 4096 non compressee occupe environ 64 Mio de memoire graphique **pour une seule carte**.
 *
 * **La repetition fait partie de la cle, parce que Three la porte sur la texture et non sur le
 * materiau.** Deux objets qui veulent la meme image a deux echelles ne peuvent donc pas partager
 * une instance : ils en recoivent une chacun. C'est le prix exact du partage, et il est petit —
 * deux familles d'echelle au plus, donc au pire le double de huit instances au lieu de 178.
 *
 * Ce detail a failli passer : mutualiser en posant une repetition unique aurait donne au cone d'un
 * parasol et a la sphere d'un arbre l'echelle du carreau, alors que leurs coordonnees sont
 * normalisees et attendent 1. Le plantage aurait ete corrige au prix de deux objets mal textures.
 *
 * **Ne disposez pas ce qu'on vous rend.** La scene ne possede pas ces textures ; elle les emprunte.
 * `estTexturePartagee` le dit a la demolition de scene, qui libere tout le reste. Seul
 * `libererTexturesPartagees` a le droit de les detruire.
 *
 * @param repetition combien de fois l'image se repete sur une unite de coordonnees de texture.
 *                   `1` pour une geometrie dont les coordonnees sont normalisees (cone, sphere) ;
 *                   `1 / METRES_PAR_CARREAU` pour celles dont les coordonnees sont des metres.
 */
export function chargerTexturePolyhaven(url: string, repetition = 1): THREE_NS.Texture {
  const cle = url + ' @' + repetition;
  const dejaLa = partagees.get(cle);
  if (dejaLa) return dejaLa;

  const tex = new THREE.TextureLoader().load(url, () => {
    const MAX_DIM = 1024;
    const img0 = tex.image;
    if (img0 && (img0.width > MAX_DIM || img0.height > MAX_DIM)) {
      const scale = MAX_DIM / Math.max(img0.width, img0.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img0.width * scale); c.height = Math.round(img0.height * scale);
      c.getContext('2d')!.drawImage(img0, 0, 0, c.width, c.height);
      tex.image = c;
      tex.needsUpdate = true;
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repetition, repetition);
  marquees.add(tex);
  partagees.set(cle, tex);
  return tex;
}

/**
 * Rend les textures partagees a la carte graphique. A n'appeler que lorsqu'**aucune** scene 3D
 * n'est vivante.
 *
 * Le moment est le retour au plan, pas la demolition de scene : `buildThreeScene` demolit la scene
 * precedente avant d'en batir une neuve, et liberer la aurait vide le cache a chaque case cochee.
 */
export function libererTexturesPartagees(): void {
  partagees.forEach((t) => t.dispose());
  partagees.clear();
}

/** Combien de textures le cache tient. Lu par les tests, et utile a qui mesure. */
export function nombreDeTexturesPartagees(): number {
  return partagees.size;
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
