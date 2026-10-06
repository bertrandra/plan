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

describe('l empilement de la terrasse en 3D', () => {
  // Les lames sur la structure bois, la structure sur les appuis : le dessus des lames tombe a la
  // hauteur finie que donnent engine/hauteurs.ts, la coupe et le chiffrage. Sur plots en structure
  // simple, les lambourdes etaient dessinees sans hauteur et les lames posees sur les plots.
  const dessusDesLames = () => {
    let max = -Infinity;
    vue3d.scene?.scene.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.isMesh && (m.material as THREE_NS.MeshStandardMaterial).color?.getHexString() === 'c9a15a') {
        m.updateMatrixWorld(true);
        max = Math.max(max, new THREE_NS.Box3().setFromObject(m).max.y);
      }
    });
    return max;
  };

  it('pose les lames a la hauteur finie, sur vis comme sur plots en structure simple', async () => {
    const { hauteurAppuiMm, hauteurFinieMm } = await import('../../../src/engine/hauteurs.js');
    const textures = vue3d.textures;
    for (const reglage of [{}, { typePose: 'plots', plotAvecSolives: false, avecLambourde: false, hauteurPlot: 10 }]) {
      objets = normaliserEnObjetsDuPlan(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
      const t = terrasse()!;
      Object.assign(t.construction!, reglage);
      vue3d.scene = null; vue3d.dernierObjKey = null; vue3d.textures = false;
      buildThreeScene(t, etat(), contexte({ hauteurAppuiMm }));
      await attendre();
      expect(dessusDesLames()).toBeCloseTo(hauteurFinieMm(t) / 1000, 3);
    }
    vue3d.textures = textures;
  });
});

describe('platelage translucide', () => {
  it('rend les lames translucides pour voir les plots, et seulement si la case est cochee', async () => {
    const opacites = () => {
      const o = new Set<number>();
      vue3d.scene?.scene.traverse((m) => {
        const mat = (m as THREE_NS.Mesh).material as THREE_NS.MeshStandardMaterial | undefined;
        if ((m as THREE_NS.Mesh).isMesh && mat?.color?.getHexString() === 'c9a15a') o.add(mat.transparent ? mat.opacity : 1);
      });
      return [...o];
    };
    const textures = vue3d.textures;
    vue3d.textures = false;
    for (const [translucide, attendu] of [[false, [1]], [true, [0.35]]] as const) {
      vue3d.platelageTranslucide = translucide;
      vue3d.scene = null; vue3d.dernierObjKey = null;
      buildThreeScene(terrasse(), etat(), contexte());
      await attendre();
      expect(opacites()).toEqual(attendu);
    }
    vue3d.platelageTranslucide = false;
    vue3d.textures = textures;
  });
});
