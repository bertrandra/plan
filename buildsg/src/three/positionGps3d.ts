// La position GPS de l'appareil dans la Vue 3D (menu Affichage, « Ma position (3D) »).
//
// Un point bleu de taille fixe a l'ecran, toujours visible (il passe devant les toits), et au sol un
// disque translucide de la precision annoncee. Chaque nouvelle position ne fait que deplacer ces deux
// objets : la boucle de rendu de la scene (three/scene.ts) les dessine a l'image suivante, sans rien
// reconstruire ni recalculer. Une scene reconstruite (un reglage, un autre objet) reprend la derniere
// position connue (`reposerPositionGps`, appele en fin de construction).

import { vue3d } from './etat3d.js';
import { versLocalDepuis, HORS_EXPORT } from './primitives.js';
import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';

/** Le nom du groupe dans la scene : il n'y en a jamais qu'un. */
export const NOM_POSITION_GPS = 'positionGps';
/** Au-dela, le disque de precision ne dit plus rien d'utile et couvrirait le quartier. */
export const PRECISION_DESSINEE_MAX_M = 50;
/** La taille du point a l'ecran, en part de la hauteur de la vue (une sprite sans perspective). */
const TAILLE_POINT = 0.035;
/** Le point flotte un peu au-dessus du sol : hauteur des yeux d'une personne debout. */
const HAUTEUR_POINT_M = 1.6;
const BLEU = 0x1a73e8;

/** La derniere position connue, dans le repere du plan, et le sol sous elle. */
let derniere: { p: PtBrut; precisionM: number } | null = null;
let hauteurSol: ((p: PtBrut) => number) | undefined;

/** L'image du point : un disque bleu cerne de blanc, dessine une fois. */
function texturePoint(): THREE_NS.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2); g.fillStyle = '#1a73e8'; g.fill();
  return new THREE.CanvasTexture(c);
}

/** Le groupe du marqueur : le point (sprite) et le disque de precision (rayon 1, mis a l'echelle). */
function creerMarqueur(): THREE_NS.Group {
  const groupe = new THREE.Group();
  groupe.name = NOM_POSITION_GPS;
  groupe.userData[HORS_EXPORT] = true;
  const point = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturePoint(), color: 0xffffff, sizeAttenuation: false, depthTest: false, transparent: true }));
  point.name = 'point';
  point.scale.set(TAILLE_POINT, TAILLE_POINT, 1);
  point.position.y = HAUTEUR_POINT_M;
  point.renderOrder = 999;
  const disque = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: BLEU, transparent: true, opacity: 0.18, depthWrite: false }));
  disque.name = 'precision';
  disque.rotation.x = -Math.PI / 2;
  disque.position.y = 0.05;
  disque.renderOrder = 998;
  groupe.add(point, disque);
  return groupe;
}

/** Place le marqueur de la scene ouverte sur la derniere position connue, en le creant au besoin. */
function placer(): void {
  const sc = vue3d.scene;
  if (!sc || !derniere) return;
  let groupe = sc.scene.getObjectByName(NOM_POSITION_GPS) as THREE_NS.Group | undefined;
  if (!groupe) { groupe = creerMarqueur(); sc.scene.add(groupe); }
  const l = versLocalDepuis(sc.cen)(derniere.p);
  groupe.position.set(l.x, hauteurSol ? hauteurSol(derniere.p) : 0, l.z);
  const r = Math.max(1, Math.min(PRECISION_DESSINEE_MAX_M, derniere.precisionM || 1));
  groupe.getObjectByName('precision')?.scale.set(r, r, 1);
}

/** Une nouvelle position de l'appareil, dans le repere du plan : le marqueur s'y deplace. */
export function poserPositionGps(p: PtBrut, precisionM: number): void {
  derniere = { p: { x: p.x, y: p.y }, precisionM };
  placer();
}

/** Plus de position : le marqueur quitte la scene, et une scene reconstruite ne le remet pas. */
export function retirerPositionGps(): void {
  derniere = null;
  const sc = vue3d.scene;
  const groupe = sc?.scene.getObjectByName(NOM_POSITION_GPS);
  if (sc && groupe) sc.scene.remove(groupe);
}

/** Fin de construction d'une scene : le sol de cette scene, et la derniere position connue reposee. */
export function reposerPositionGps(sol?: (p: PtBrut) => number): void {
  hauteurSol = sol;
  placer();
}

/** La derniere position connue, pour les tests et la barre d'etat. */
export function positionGpsCourante(): { p: PtBrut; precisionM: number } | null {
  return derniere;
}
