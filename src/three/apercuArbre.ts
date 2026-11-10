// L'apercu d'un arbre dans l'ecran admin « Arbres » (zones/EcranArbres.tsx).
//
// Une petite scene a part (son propre rendu, hors de la Vue 3D de Plan) qui genere l'arbre avec les
// reglages en cours d'edition, le montre sous un ciel et un sol neutres, et en rend les chiffres :
// triangles, sommets, dimensions du modele, duree de generation. Ce sont ces chiffres qui disent a
// l'administrateur ce que couteront cent arbres de cette essence en 3D (chacun en instance,
// three/arbre3d.ts) et dans l'export GLB.
//
// Le rendu reprend les reglages de la Vue 3D (sortie lineaire, lumieres x pi) pour que l'arbre y
// ressemble. Rien ici n'est enregistre : c'est l'ecran qui garde les reglages.

import type * as THREE_NS from 'three';
import { chargerExemple, ECHELLE_LUMIERE } from './bibliotheque.js';
import { chargerEzTreeAdmin, genererArbre } from './ezTree.js';
import type { ReglagesEz } from '../model/especesArbre.js';

export interface ChiffresArbre {
  triangles: number;
  sommets: number;
  /** Largeur (le plus grand des deux cotes de la boite) et hauteur du modele, en unites d'EZ-tree. */
  largeur: number;
  hauteur: number;
  /** Duree de la generation, en millisecondes. */
  dureeMs: number;
}

export interface ApercuArbre {
  /** Genere l'arbre de ces reglages et le montre ; rend ses chiffres, ou `null` si la generation echoue. */
  montrer(reglages: ReglagesEz, graine?: number, nu?: boolean): ChiffresArbre | null;
  detruire(): void;
}

/** Au-dela, un arbre pese trop pour l'export et les telephones : l'ecran le dit. */
export const TRIANGLES_CONSEILLES_MAX = 30000;

export async function monterApercuArbre(hote: HTMLElement): Promise<ApercuArbre> {
  await chargerEzTreeAdmin();
  await chargerExemple('controls/OrbitControls.js', ['OrbitControls']);
  const largeurPx = Math.max(240, hote.clientWidth || 360), hauteurPx = Math.max(240, hote.clientHeight || 420);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(largeurPx, hauteurPx);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  hote.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe0ee);
  const sol = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f8f4e }));
  sol.receiveShadow = true;
  scene.add(sol);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5 * ECHELLE_LUMIERE));
  const soleil = new THREE.DirectionalLight(0xffffff, 0.8 * ECHELLE_LUMIERE);
  soleil.position.set(60, 120, 40);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(1024, 1024);
  Object.assign(soleil.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 400 });
  scene.add(soleil);
  const camera = new THREE.PerspectiveCamera(40, largeurPx / hauteurPx, 0.5, 2000);
  const controles = new THREE.OrbitControls(camera, renderer.domElement);
  controles.enableDamping = false;
  let arbre: THREE_NS.Object3D | null = null;
  let raf = 0;
  let vivant = true;

  const rendre = () => { if (vivant) renderer.render(scene, camera); };
  controles.addEventListener('change', rendre);

  function retirer(): void {
    if (!arbre) return;
    scene.remove(arbre);
    arbre.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) mat.dispose();
    });
    arbre = null;
  }

  return {
    montrer(reglages, graine, nu = false) {
      retirer();
      const debut = performance.now();
      let genere: ReturnType<typeof genererArbre> = null;
      try { genere = genererArbre(reglages, graine); } catch { genere = null; }
      if (!genere) { rendre(); return null; }
      const dureeMs = Math.round(performance.now() - debut);
      genere.traverse((o) => { if ((o as THREE_NS.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // Un caduc nu : seules les branches.
      genere.leavesMesh.visible = !nu;
      scene.add(genere);
      arbre = genere;
      const boite = new THREE.Box3().setFromObject(genere);
      const taille = boite.getSize(new THREE.Vector3());
      const largeur = Math.max(taille.x, taille.z), hauteur = taille.y;
      const rayon = Math.max(largeur, hauteur, 1);
      controles.target.set(0, hauteur / 2, 0);
      camera.position.set(rayon * 1.3, hauteur * 0.65, rayon * 1.3);
      camera.far = rayon * 40;
      camera.updateProjectionMatrix();
      controles.update();
      rendre();
      return { triangles: genere.triangleCount, sommets: genere.vertexCount, largeur: Math.round(largeur * 10) / 10, hauteur: Math.round(hauteur * 10) / 10, dureeMs };
    },
    detruire() {
      vivant = false;
      cancelAnimationFrame(raf);
      controles.dispose();
      retirer();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
