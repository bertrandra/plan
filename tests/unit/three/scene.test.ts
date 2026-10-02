// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as THREE_NS from 'three';

const bannieres: string[] = [];
vi.mock('../../../src/shell/dialogs.js', () => ({ showErrBanner: (m: string) => { bannieres.push(m); }, showToast: () => {} }));

import { buildThreeScene, type ContexteScene3d } from '../../../src/three/scene.js';
import { vue3d, hotes3d } from '../../../src/three/etat3d.js';
import { normaliserEnObjetsDuPlan } from '../../../src/app/assemblage/formes.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La construction de la Vue 3D (three/scene.ts) sur le plan de demonstration, avec le vrai three.js
// r128. Seuls le rendu WebGL et les controles d'orbite, qu'un environnement sans carte graphique ne
// fournit pas, sont remplaces par des doublures.

let contextePerdu = false;
class FauxRendu {
  domElement = document.createElement('canvas');
  shadowMap = { enabled: false, type: 0 };
  render = vi.fn();
  getContext() { return { isContextLost: () => contextePerdu }; }
  setSize() {}
  setPixelRatio() {}
  dispose() {}
}
class FauxControles {
  target = new THREE_NS.Vector3();
  update() {}
}

beforeAll(() => {
  Object.assign(globalThis, { THREE: { ...THREE_NS, WebGLRenderer: FauxRendu, OrbitControls: FauxControles } });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  // Les textures de toiture se dessinent sur un canevas 2D, que jsdom n'a pas : sans contexte, le
  // code s'en passe (three/couverture.ts). On le dit explicitement, plutot que de laisser jsdom crier.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

function contexte(plus: Partial<ContexteScene3d> = {}): ContexteScene3d {
  return {
    trouverParcelleCloture: () => null, hauteurAppuiMm: () => 400, elevationOf: (o) => (o as { elevation?: number }).elevation ?? 0,
    objetMasque: (o) => !!o.hidden, positionMat: (p) => (p as unknown as { center: { x: number; y: number } }).center,
    orthoActif: () => false, orthoTuiles: () => [], chargerTexturePolyhaven: () => new THREE_NS.Texture(),
    disposeThreeScene: () => { vue3d.scene = null; }, appliquerLumiereVue3d: vi.fn(), applyMode3D: vi.fn(), syncControlesSoleilVue3d: vi.fn(),
    ...plus
  };
}

let objets: ObjetPlan[];
const terrasse = () => objets.find((o) => o.key === 'terrasse') ?? null;
const etat = (isolement: string | null = null) => ({ objects: objets, terrasseSelectedKey: 'terrasse', isolement });
const maillages = () => { let n = 0; vue3d.scene?.scene.traverse((o) => { if ((o as THREE_NS.Mesh).isMesh || (o as THREE_NS.Line).isLine) n++; }); return n; };
const attendre = () => new Promise((ok) => setTimeout(ok, 5));

beforeEach(() => {
  objets = normaliserEnObjetsDuPlan(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
  document.body.innerHTML = '<div id="hote"></div>';
  hotes3d.vue3d = document.getElementById('hote');
  vue3d.scene = null; vue3d.dernierObjKey = null; vue3d.tousLesObjets = true;
  bannieres.length = 0; contextePerdu = false;
});

describe('buildThreeScene', () => {
  it('monte la scene dans son hote, pose les lumieres et rend une premiere image', () => {
    const ctx = contexte();
    buildThreeScene(terrasse(), etat(), ctx);
    expect(vue3d.scene).not.toBeNull();
    expect(hotes3d.vue3d?.querySelector('canvas')).not.toBeNull();
    expect(ctx.applyMode3D).toHaveBeenCalledTimes(1);
    expect(ctx.appliquerLumiereVue3d).toHaveBeenCalledTimes(1);
    expect(vue3d.dernierObjKey).toBeTruthy();
  });

  it('modelise les objets du plan, puis la structure de la terrasse apres la premiere image', async () => {
    buildThreeScene(terrasse(), etat(), contexte());
    const avant = maillages();
    expect(avant).toBeGreaterThan(10);
    await attendre();
    expect(maillages()).toBeGreaterThan(avant);
  });

  it('ne montre que la terrasse quand « tous les objets » est decoche', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    const tous = maillages();
    vue3d.tousLesObjets = false;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(maillages()).toBeLessThan(tous);
  });

  it('garde la camera quand on reconstruit la meme terrasse', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    vue3d.scene!.camera.position.set(1, 2, 3);
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene!.camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it('s ouvre aussi sur un plan sans terrasse', () => {
    buildThreeScene(null, { objects: objets, terrasseSelectedKey: null }, contexte());
    expect(maillages()).toBeGreaterThan(0);
  });

  it('ne fait rien sans hote, et le dit quand le navigateur refuse le contexte 3D', () => {
    hotes3d.vue3d = null;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene).toBeNull();
    hotes3d.vue3d = document.getElementById('hote');
    contextePerdu = true;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene).toBeNull();
    expect(bannieres[0]).toMatch(/contexte 3D/);
  });
});
