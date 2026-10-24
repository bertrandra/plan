// Admin › Calibrer la detection, la derniere etape : la scene three.js de la facade vue de face, la photo posee sur le mur
// (zones/VueFacade3d.tsx en garde le canevas). Le mur est un volume a la forme de sa silhouette (le gabarit du plan et du LiDAR).
// THREE doit etre charge (three/bibliotheque.ts::chargerThree).

import type * as THREE_NS from 'three';
import { ECHELLE_LUMIERE } from './bibliotheque.js';
import type { GabaritMur } from '../facade/gabaritMur.js';

/** Le volume derriere la facade, en part de sa largeur : de quoi voir un mur, pas une feuille. */
const PROFONDEUR = 0.35;
/** Le champ vertical de la camera (degres), et la marge autour de la facade. */
const CHAMP_DEG = 40, MARGE = 1.15;
/** Les teintes du sol, des cotes du volume et du ciel (la scene, pas l'interface : pas de jeton). */
const COULEUR_SOL = 0x7a9a5a, COULEUR_COTES = 0xd9cfbf, COULEUR_CIEL = 0xcfdeea;

export interface MurFacade3d { texture: string; largeurM: number; hauteurM: number; hauteurTextureM: number; gabarit: GabaritMur }

/** Dessine la facade dans le canevas, une fois la texture chargee ; rend de quoi tout liberer. */
export function dessinerFacade3d(canevas: HTMLCanvasElement, m: MurFacade3d, pret: () => void): () => void {
  const L = m.largeurM, H = m.hauteurM, D = PROFONDEUR * L;
  const largeurPx = canevas.clientWidth || 640, hauteurPx = Math.round(largeurPx * 0.62);
  const rendu = new THREE.WebGLRenderer({ canvas: canevas, antialias: true, alpha: true });
  rendu.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  rendu.setSize(largeurPx, hauteurPx, false);
  // Sortie lineaire, comme la Vue 3D du projet (three/rendu.ts) : la photo garde ses couleurs.
  rendu.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COULEUR_CIEL);
  // Le contour du mur dans son plan (x le long du mur, y en hauteur) : le sol, puis le haut de la silhouette de droite a gauche.
  const forme = new THREE.Shape();
  forme.moveTo(0, 0);
  forme.lineTo(L, 0);
  for (const p of [...m.gabarit].reverse()) forme.lineTo(p.u * L, p.v * H);
  forme.closePath();
  const geo = new THREE.ExtrudeGeometry(forme, { depth: D, bevelEnabled: false });
  geo.translate(0, 0, -D);
  // Les faces du volume ont pour UV leurs coordonnees en metres : la texture, du sol au haut de la bande, s'y pose par sa taille.
  // La texture arrive apres coup : liberee entre-temps, la scene ne se rend plus.
  let libere = false;
  const tex: THREE_NS.Texture = new THREE.TextureLoader().load(m.texture, () => { if (libere) return; rendre(); pret(); });
  tex.repeat.set(1 / L, 1 / m.hauteurTextureM);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const face = new THREE.MeshBasicMaterial({ map: tex });
  const cotes = new THREE.MeshLambertMaterial({ color: COULEUR_COTES });
  scene.add(new THREE.Mesh(geo, [face, cotes]));
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(L * 60, L * 60), new THREE.MeshLambertMaterial({ color: COULEUR_SOL }));
  sol.rotation.x = -Math.PI / 2;
  sol.position.set(L / 2, -0.01, 0);
  scene.add(sol);
  // Toute intensite de lumiere se pose x ECHELLE_LUMIERE (le rendu de la r128, three/bibliotheque.ts).
  scene.add(new THREE.AmbientLight(0xffffff, 0.55 * ECHELLE_LUMIERE));
  const soleil = new THREE.DirectionalLight(0xffffff, 0.5 * ECHELLE_LUMIERE);
  soleil.position.set(-L, 2 * H, 2 * L);
  scene.add(soleil);
  // De face, a mi-hauteur de la facade, a la distance qui la montre entiere.
  const haut = Math.max(H, ...m.gabarit.map((p) => p.v * H));
  const aspect = largeurPx / hauteurPx, t = Math.tan((CHAMP_DEG * Math.PI) / 360);
  const distance = (MARGE * Math.max(haut / 2, L / 2 / aspect)) / t;
  const camera = new THREE.PerspectiveCamera(CHAMP_DEG, aspect, 0.1, distance * 10);
  camera.position.set(L / 2, haut / 2, distance);
  camera.lookAt(L / 2, haut / 2, 0);
  const rendre = () => rendu.render(scene, camera);
  rendre();
  return () => {
    libere = true;
    geo.dispose(); tex.dispose(); face.dispose(); cotes.dispose();
    sol.geometry.dispose(); (sol.material as THREE_NS.Material).dispose();
    rendu.dispose();
  };
}
