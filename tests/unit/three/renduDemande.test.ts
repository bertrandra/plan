import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import {
  imageAttendue, imageRendue, demanderRendu, signalerActivite, animation, installerVeille, empreinteDe, pendantLeRendu,
  ACTIVITE_MS, QUEUE_MS, EMPREINTE_MS, DELAI_REPOS_MS
} from '../../../src/three/renduDemande.js';
import { NOM_LOT_BRANCHES, NOM_LOT_FEUILLES } from '../../../src/three/arbre3d.js';
import type { SceneTroisBase } from '../../../src/three/etat3d.js';

const T = THREE_NS as unknown as typeof THREE_NS;

function fausseScene() {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 1000);
  const renderer = { domElement: { clientWidth: 800, clientHeight: 600 }, toneMappingExposure: 1, shadowMap: { enabled: true } };
  const maille = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0x808080 }));
  scene.add(maille);
  return { sc: { scene, camera, renderer, controls: {}, raf: null } as unknown as SceneTroisBase, scene, camera, maille };
}

// Un temps loin de tout changement : ni geste, ni queue, ni empreinte en retard.
let horloge = 1e9;
const plusTard = (ms = QUEUE_MS + ACTIVITE_MS + 1) => (horloge += ms);
/** Rend « une image » a l'heure donnee, comme rendre3d. */
const rendre = (sc: SceneTroisBase, t: number) => pendantLeRendu(() => imageRendue(sc, t));

beforeAll(() => { installerVeille(T, null); });

describe('le rendu a la demande (three/renduDemande.ts)', () => {
  it('une vue immobile ne redessine plus, une camera qui bouge si', () => {
    const { sc, camera } = fausseScene();
    expect(imageAttendue(sc, plusTard())).toBe(true); // jamais rendue
    rendre(sc, horloge);
    expect(imageAttendue(sc, plusTard())).toBe(false);
    expect(imageAttendue(sc, plusTard(EMPREINTE_MS))).toBe(false);
    camera.position.x += 0.5;
    expect(imageAttendue(sc, plusTard(16))).toBe(true);
  });

  it('demanderRendu leve le drapeau, une image le baisse', () => {
    const { sc } = fausseScene();
    rendre(sc, plusTard());
    demanderRendu(sc);
    expect(imageAttendue(sc, horloge + 1)).toBe(true);
    rendre(sc, plusTard());
    expect(imageAttendue(sc, plusTard())).toBe(false);
  });

  it('un objet ajoute ou un materiau marque, ou que ce soit, redessine (la veille de three.js)', () => {
    const { sc, scene, maille } = fausseScene();
    rendre(sc, plusTard());
    expect(imageAttendue(sc, plusTard())).toBe(false);
    scene.add(new T.Object3D());
    expect(imageAttendue(sc, plusTard())).toBe(true);
    rendre(sc, plusTard());
    (maille.material as THREE_NS.Material).needsUpdate = true;
    expect(imageAttendue(sc, plusTard())).toBe(true);
    rendre(sc, plusTard());
    // Ce que three.js marque en rendant ne compte pas.
    pendantLeRendu(() => { (maille.material as THREE_NS.Material).needsUpdate = true; imageRendue(sc, plusTard()); });
    expect(imageAttendue(sc, plusTard())).toBe(false);
  });

  it('le filet de l empreinte voit une couleur changee sans aucun signal', () => {
    const { sc, maille } = fausseScene();
    rendre(sc, plusTard());
    (maille.material as THREE_NS.MeshBasicMaterial).color.setHex(0xff0000);
    expect(imageAttendue(sc, plusTard(EMPREINTE_MS))).toBe(true);
    rendre(sc, plusTard());
    maille.visible = false;
    expect(imageAttendue(sc, plusTard(EMPREINTE_MS))).toBe(true);
  });

  it('un geste fait rendre chaque image pendant ACTIVITE_MS', () => {
    const { sc } = fausseScene();
    rendre(sc, plusTard());
    signalerActivite(plusTard());
    expect(imageAttendue(sc, horloge + ACTIVITE_MS - 1)).toBe(true);
    rendre(sc, horloge + ACTIVITE_MS - 1);
    expect(imageAttendue(sc, plusTard())).toBe(false);
  });

  it('une animation declaree rend chaque image jusqu a sa fin', () => {
    const { sc } = fausseScene();
    rendre(sc, plusTard());
    const fin = animation();
    expect(imageAttendue(sc, plusTard())).toBe(true);
    fin(); fin(); // une seule fois
    rendre(sc, plusTard());
    expect(imageAttendue(sc, plusTard())).toBe(false);
  });

  it('juste apres un changement, une image au moins toutes les DELAI_REPOS_MS (une texture qui arrive)', () => {
    const { sc } = fausseScene();
    const t0 = plusTard();
    demanderRendu(sc, t0);
    rendre(sc, t0);
    expect(imageAttendue(sc, t0 + 16)).toBe(false);
    expect(imageAttendue(sc, t0 + DELAI_REPOS_MS)).toBe(true);
  });

  it('le vent ne redessine que s il y a des arbres visibles', () => {
    const { sc, scene } = fausseScene();
    rendre(sc, plusTard());
    expect(imageAttendue(sc, plusTard(), true)).toBe(false);
    const lot = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial(), 3);
    lot.name = NOM_LOT_FEUILLES;
    scene.add(lot);
    rendre(sc, plusTard());
    expect(empreinteDe(scene).arbres).toBe(true);
    expect(imageAttendue(sc, plusTard(), true)).toBe(true);
    expect(imageAttendue(sc, plusTard(), false)).toBe(false);
  });

  it('reconnait les lots d arbres par leurs noms (three/arbre3d.ts)', () => {
    for (const nom of [NOM_LOT_BRANCHES, NOM_LOT_FEUILLES]) {
      const s = new T.Scene(), lot = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial(), 1);
      lot.name = nom; s.add(lot);
      expect(empreinteDe(s).arbres).toBe(true);
    }
  });
});
