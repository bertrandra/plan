// Admin › Calibrer la detection, la derniere etape : la facade en 3D, vue de face, la photo posee sur le mur. Le mur est un volume
// a la forme de sa silhouette (le gabarit du plan et du LiDAR) ; sa face porte la texture telle que la 3D du projet la pose (la photo
// redressee et fusionnee, du sol au haut de la bande au-dessus de l'egout). La camera est en elevation devant le mur, perpendiculaire,
// a mi-hauteur, comme la vue de prise de l'audit. three.js se charge a la demande (three/bibliotheque.ts).

import { useEffect, useRef, useState } from 'react';
import type * as THREE_NS from 'three';
import { chargerThree, ECHELLE_LUMIERE } from '../three/bibliotheque.js';
import type { GabaritMur } from '../facade/gabaritMur.js';

/** Le volume derriere la facade, en part de sa largeur : de quoi voir un mur, pas une feuille. */
const PROFONDEUR = 0.35;
/** Le champ vertical de la camera (degres), et la marge autour de la facade. */
const CHAMP_DEG = 40, MARGE = 1.15;
/** Les teintes du sol, des cotes du volume et du ciel (la scene, pas l'interface : pas de jeton). */
const COULEUR_SOL = 0x7a9a5a, COULEUR_COTES = 0xd9cfbf, COULEUR_CIEL = 0xcfdeea;

interface Mur { texture: string; largeurM: number; hauteurM: number; hauteurTextureM: number; gabarit: GabaritMur }

/** Dessine la facade dans le canevas, une fois la texture chargee ; rend de quoi tout liberer. */
function dessiner(canevas: HTMLCanvasElement, m: Mur, pret: () => void): () => void {
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
  const tex: THREE_NS.Texture = new THREE.TextureLoader().load(m.texture, () => { rendre(); pret(); });
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
    geo.dispose(); tex.dispose(); face.dispose(); cotes.dispose();
    sol.geometry.dispose(); (sol.material as THREE_NS.Material).dispose();
    rendu.dispose();
  };
}

export function VueFacade3d(m: Mur) {
  const canevas = useRef<HTMLCanvasElement>(null);
  const [etat, setEtat] = useState<'charge' | 'pret' | 'indisponible'>('charge');
  const { texture, largeurM, hauteurM, hauteurTextureM, gabarit } = m;
  useEffect(() => {
    // Sans WebGL (un vieux navigateur, les tests), pas de 3D : l'etape le dit.
    if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) { setEtat('indisponible'); return; }
    let fini = false, liberer = () => {};
    setEtat('charge');
    chargerThree().then(() => {
      if (fini || !canevas.current) return;
      liberer = dessiner(canevas.current, { texture, largeurM, hauteurM, hauteurTextureM, gabarit }, () => { if (!fini) setEtat('pret'); });
    }).catch(() => { if (!fini) setEtat('indisponible'); });
    return () => { fini = true; liberer(); };
  }, [texture, largeurM, hauteurM, hauteurTextureM, gabarit]);
  return <>
    <canvas ref={canevas} className="calEtape large calVue3d" role="img" aria-label="La façade en 3D, vue de face, la photo posée sur le mur" />
    {etat !== 'pret' && <p className="calNote">{etat === 'charge' ? 'Chargement de la vue 3D…' : 'La vue 3D n’est pas disponible dans ce navigateur.'}</p>}
  </>;
}
