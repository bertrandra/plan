// La Vue 3D en image (three/).
//
// Pour la piece DP6 d'une declaration prealable : la vue telle que l'utilisateur l'a cadree. Le
// rendu garde son tampon (`preserveDrawingBuffer`), donc l'image se lit a tout moment ; on refait
// un rendu juste avant pour qu'elle suive les derniers reglages.

import { vue3d } from './etat3d.js';

/** La vue 3D courante en PNG, ou `null` si elle n'a jamais ete ouverte. */
export function capturerVue3d(): Uint8Array | null {
  const s = vue3d.scene;
  if (!s) return null;
  s.renderer.render(s.scene, s.camera);
  const url = s.renderer.domElement.toDataURL('image/png');
  const b64 = url.split(',')[1] ?? '';
  if (!b64) return null;
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
