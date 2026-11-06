// Une poignee du mode Toit derriere le toit (audit de la camera, 6 novembre 2026) : le calque SVG des poignees ne connait pas la
// profondeur, et une poignee d'un mur cache se dessinait par-dessus le toit qui le cache, prete a etre tiree. Un rayon de l'oeil vers
// elle dit si une surface du batiment passe devant ; la poignee cachee s'estompe et ne se prend plus.

import type * as THREE_NS from 'three';

/** Une surface a moins de cette distance du point vise est la sienne (le mur, le pan ou l'arete ou la poignee est posee). */
export const TOLERANCE_OCCULTATION_M = 0.3;

/** Un objet et ses parents sont visibles (un corps isole masque les autres : ils ne cachent rien). */
function visible(o: THREE_NS.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Vrai si une surface de `racines` passe entre l'oeil de `camera` (une perspective) et `point` (coordonnees de la scene), a plus de
 * `TOLERANCE_OCCULTATION_M` devant lui. `rayon` : un Raycaster a reutiliser (un par calque).
 */
export function estCache(camera: THREE_NS.Camera, racines: readonly THREE_NS.Object3D[], point: { x: number; y: number; z: number }, rayon: THREE_NS.Raycaster): boolean {
  const oeil = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const vers = new THREE.Vector3(point.x, point.y, point.z).sub(oeil);
  const d = vers.length();
  if (d < 1e-6 || !racines.length) return false;
  rayon.set(oeil, vers.divideScalar(d));
  rayon.far = d - TOLERANCE_OCCULTATION_M;
  if (rayon.far <= 0) return false;
  return rayon.intersectObjects(racines as THREE_NS.Object3D[], true).some((i) => (i.object as THREE_NS.Mesh).isMesh && visible(i.object));
}
