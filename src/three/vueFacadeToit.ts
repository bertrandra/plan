// La camera de l'editeur de facade du mode Toit (MD/spec-mode-toit-3d.md §3, ecran B de la maquette v8) : sur la scene de la Vue 3D,
// une camera oblique alignee sur le mur choisi, qui l'emporte sur celle de l'orbite le temps de travailler la facade.
//
// La Vue 3D sert d'abord la terrasse, et sa camera en perspective se posait au milieu du jardin, derriere la cloture et les arbres. On
// ne batit pas une seconde scene (une seule maintenance) : l'appelant epure la scene (`epurerVue3d`, le batiment seul) et pose ici la
// camera de la maquette ; le fond prend celui de l'interface. Tout se defait a l'identique.

import { cadreOblique, type PointScene, type Reserve } from './poseFacade.js';
import { rendre3d, type SceneVue3d } from './etat3d.js';
import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';

/** Le fond, faute de la variable de la scene de l'interface (`--stage-bg`) : celui du theme clair. */
const FOND_DEFAUT = '#F1EBDC';

/** Le fond de la scene avant la camera de facade, rendu a son retrait. */
const fondsAvant = new WeakMap<SceneVue3d, THREE_NS.Scene['background']>();

function fondDuTheme(): string {
  if (typeof document === 'undefined') return FOND_DEFAUT;
  return getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim() || FOND_DEFAUT;
}

/** Le mur que la camera de facade regarde : ses bouts et sa normale sortante, dans le plan. */
export interface MurVise { a: PtBrut; b: PtBrut; n: PtBrut }

/**
 * Pose (ou recadre) la camera oblique devant `mur` : `points`, le batiment dans la scene, tiennent dans la partie de l'image que le panneau
 * laisse libre. L'orbite est suspendue tant qu'elle est posee : devant une facade, la vue ne tourne pas, on y travaille.
 */
export function poserCameraFacade(sc: SceneVue3d, mur: MurVise, points: readonly PointScene[], reserve?: Reserve): void {
  const el = sc.renderer.domElement;
  const cadre = cadreOblique(mur.a, mur.b, mur.n, points, sc.cen, el.clientWidth || 600, el.clientHeight || 420, reserve);
  const cam = sc.cameraRendu ?? new THREE.Camera();
  cam.matrixAutoUpdate = false;
  cam.matrix.set(...(cadre.monde as Parameters<THREE_NS.Matrix4['set']>));
  cam.projectionMatrix.set(...(cadre.projection as Parameters<THREE_NS.Matrix4['set']>));
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.updateMatrixWorld(true);
  if (!sc.cameraRendu) {
    fondsAvant.set(sc, sc.scene.background);
    // Le ciel est une sphere lointaine que la camera de facade ne voit pas : le fond de l'interface la remplace.
    sc.scene.background = new THREE.Color(fondDuTheme());
  }
  sc.cameraRendu = cam;
  sc.controls.enabled = false;
  rendre3d(sc);
}

/** Rend l'image a la camera de l'orbite, et le fond d'avant. */
export function retirerCameraFacade(sc: SceneVue3d): void {
  if (!sc.cameraRendu) return;
  sc.cameraRendu = undefined;
  sc.scene.background = fondsAvant.get(sc) ?? null;
  fondsAvant.delete(sc);
  sc.controls.enabled = true;
  rendre3d(sc);
}
