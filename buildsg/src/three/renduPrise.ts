// Le rendu du modele depuis la prise de vue d'une photo (MD/spec-regles-toits.md §14.1, lot L17) :
// la Vue 3D ouverte, vue par une camera posee la ou le telephone etait, dans son axe, avec son
// champ ; dessinee hors ecran a 1 024 px et rendue en JPEG. C'est l'image que Claude compare a la
// photo : « le modele, pas la realite ».
//
// La scene et son rendu sont ceux de la Vue 3D (le tampon est garde, `preserveDrawingBuffer`) : on
// change la taille du rendu et la camera le temps d'une image, puis on remet tout en place et on
// redessine la vue, pour que l'ecran ne garde pas le cliche.

import { vue3d } from './etat3d.js';
import { versLocalDepuis } from './primitives.js';

/** Le telephone tenu a hauteur des yeux (render/couleurPhotoAudit.ts fait de meme). */
export const HAUTEUR_PRISE_M = 1.5;
/** Le champ horizontal d'un telephone en grand-angle normal, quand l'EXIF ne le donne pas (facade/cadrage.ts). */
export const CHAMP_DEFAUT_DEG = 66;
export const LARGEUR_RENDU_PX = 1024;
export const HAUTEUR_RENDU_PX = 768;

export interface PriseRendu {
  x: number;
  y: number;
  azimutDeg: number;
  inclinaisonDeg?: number | null;
  champDeg?: number | null;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Le champ vertical de la camera three.js, d'apres le champ horizontal et les proportions de l'image. */
export function champVertical(champHorizontalDeg: number, largeur: number, hauteur: number): number {
  return (2 * Math.atan(Math.tan(rad(champHorizontalDeg) / 2) * hauteur / largeur) * 180) / Math.PI;
}

/** Le point vise a 10 m devant la prise : azimut depuis le nord (x = est, z = sud), inclinaison au-dessus de l'horizon. */
export function ciblePrise(p: PriseRendu, local: { x: number; z: number }): { x: number; y: number; z: number } {
  const az = rad(p.azimutDeg), inc = rad(p.inclinaisonDeg ?? 0);
  const d = 10;
  return { x: local.x + Math.sin(az) * Math.cos(inc) * d, y: HAUTEUR_PRISE_M + Math.sin(inc) * d, z: local.z - Math.cos(az) * Math.cos(inc) * d };
}

export interface ImageRendu { base64: string; mediaType: 'image/jpeg'; largeur: number; hauteur: number }

/**
 * Le rendu du modele depuis cette prise, ou null si la Vue 3D n'est pas ouverte : c'est elle qui
 * porte la scene, et l'audit l'ouvre toujours avant les propositions.
 */
export function rendreDepuisPrise(p: PriseRendu, largeur = LARGEUR_RENDU_PX, hauteur = HAUTEUR_RENDU_PX): ImageRendu | null {
  const s = vue3d.scene;
  if (!s) return null;
  const { renderer, scene, camera } = s;
  const taille = { l: renderer.domElement.width, h: renderer.domElement.height };
  const pixelRatio = renderer.getPixelRatio();
  const local = versLocalDepuis(s.cen)({ x: p.x, y: p.y });
  const cam = new THREE.PerspectiveCamera(champVertical(p.champDeg ?? CHAMP_DEFAUT_DEG, largeur, hauteur), largeur / hauteur, camera.near, camera.far);
  cam.position.set(local.x, HAUTEUR_PRISE_M, local.z);
  const c = ciblePrise(p, local);
  cam.lookAt(c.x, c.y, c.z);
  cam.updateProjectionMatrix();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(largeur, hauteur, false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
    return { base64: url.slice(url.indexOf(',') + 1), mediaType: 'image/jpeg', largeur, hauteur };
  } catch {
    return null;
  } finally {
    // L'ecran reprend sa taille et sa camera : le cliche ne doit pas rester visible.
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(taille.l / pixelRatio, taille.h / pixelRatio, false);
    renderer.render(scene, camera);
  }
}
