// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import * as THREE_NS from 'three';

const bannieres: string[] = [];
vi.mock('../../../src/shell/dialogs.js', () => ({ showErrBanner: (m: string) => { bannieres.push(m); }, showToast: () => {} }));

import { buildThreeScene, type ContexteScene3d } from '../../../src/three/scene.js';
import { vue3d, hotes3d } from '../../../src/three/etat3d.js';
import { normaliserEnObjetsDuPlan } from '../../../src/app/assemblage/formes.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

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

describe('sol en relief', () => {
  // Une grille plane z = 100 + 0,1·x (NGF) sur la parcelle de demonstration et ses abords, zRef = 100 :
  // le sol monte de 10 cm par metre vers l'est. Les cellules sont a demi-metre : le plan tombe au cm.
  const PENTE = 0.1;
  const relief = (affichage?: Relief['affichage']): Relief => {
    const nx = 60, ny = 48, x0 = -37.5, y0 = 9.5;
    const z: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((100 + PENTE * (x0 + i)) * 100) / 100);
    return { source: 'lidar-hd', couche: 'test', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: 'test', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0, y0, nx, ny, z, zRef: 100, affichage: affichage ?? null };
  };
  const solAttendu = (x: number) => PENTE * Math.min(Math.max(x, -37.5), 21.5);
  const avecRelief = (affichage?: Relief['affichage']) => {
    const parcelle = objets.find((o) => o.key === 'parcelle');
    if (parcelle) parcelle.relief = relief(affichage);
    return contexte({ trouverParcelleCloture: () => parcelle });
  };
  const meshes = (couleur: string) => {
    const out: THREE_NS.Mesh[] = [];
    vue3d.scene?.scene.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && (m.material as THREE_NS.MeshStandardMaterial).color?.getHexString() === couleur) out.push(m);
    });
    return out;
  };
  const boite = (m: THREE_NS.Mesh) => { m.updateMatrixWorld(true); return new THREE_NS.Box3().setFromObject(m); };
  // Sans textures : un seul materiau par maillage, qu'on retrouve par sa couleur.
  let textures = true;
  beforeEach(() => { textures = vue3d.textures; vue3d.textures = false; });
  afterEach(() => { vue3d.textures = textures; });

  it('remplace le plan vert par le maillage de la grille, chaque sommet a la hauteur du sol', () => {
    buildThreeScene(terrasse(), etat(), avecRelief());
    const sol = vue3d.scene?.scene.getObjectByName('sol-relief') as THREE_NS.Mesh | undefined;
    expect(sol).toBeDefined();
    expect(sol?.geometry.type).toBe('BufferGeometry');
    const cen = vue3d.centre ?? { x: 0, y: 0 };
    const pos = sol?.geometry.getAttribute('position');
    expect(pos?.count).toBe(62 * 50);
    for (let k = 0; k < (pos?.count ?? 0); k++) {
      expect(Math.abs((pos?.getY(k) ?? NaN) - solAttendu(cen.x + (pos?.getX(k) ?? 0)))).toBeLessThan(1e-3);
    }
    // La camera vise le centre du plan a la hauteur du sol.
    expect(vue3d.scene?.controls.target.y).toBeCloseTo(solAttendu(cen.x), 6);
    // Le plan vert d'origine n'est plus la.
    expect(meshes('9fb98c').filter((m) => m.geometry.type === 'PlaneGeometry')).toHaveLength(0);
  });

  it('pose un prisme du point le plus bas du sol jusqu au sol en son centre plus sa hauteur', async () => {
    const abri = objets.find((o) => o.key === 'abri');
    if (abri) Object.assign(abri, { elevation: 2.5 });
    buildThreeScene(terrasse(), etat(), avecRelief());
    // La couleur de l'abri est celle de la maquette (DEMO_OBJECTS), lue sur l'objet.
    const prismes = meshes(new THREE_NS.Color(abri?.fill ?? '#000').getHexString());
    expect(prismes).toHaveLength(1);
    const b = boite(prismes[0] as THREE_NS.Mesh);
    const pts = abri && abri.type === 'polygon' ? abri.pts : [];
    const { centroid } = await import('../../../src/geometry/basic.js');
    expect(b.min.y).toBeCloseTo(PENTE * Math.min(...pts.map((p) => p.x)), 3);
    expect(b.max.y).toBeCloseTo(PENTE * centroid(pts).x + 2.5, 3);
  });

  it('laisse la terrasse courante a sa hauteur finie au-dessus du zero du plan', async () => {
    const { hauteurAppuiMm, hauteurFinieMm } = await import('../../../src/engine/hauteurs.js');
    buildThreeScene(terrasse(), etat(), { ...avecRelief(), hauteurAppuiMm });
    await attendre();
    // Les chemins de la demonstration ont la couleur des lames : eux sont des rubans a plat (ShapeGeometry), qui suivent le sol.
    const dessus = Math.max(...meshes('c9a15a').filter((m) => m.geometry.type === 'ExtrudeGeometry').map((m) => boite(m).max.y));
    expect(dessus).toBeCloseTo(hauteurFinieMm(terrasse() as ObjetPlan) / 1000, 3);
  });

  it('garde le plan vert quand « Sol en relief » est decoche', () => {
    buildThreeScene(terrasse(), etat(), avecRelief({ sol3d: false }));
    expect(vue3d.scene?.scene.getObjectByName('sol-relief')).toBeUndefined();
    expect(meshes('9fb98c').filter((m) => m.geometry.type === 'PlaneGeometry')).toHaveLength(1);
    expect(vue3d.scene?.controls.target.y).toBe(0);
  });
});

describe('platelage translucide', () => {
  it('garde les lames pleines par defaut ; case cochee, presque transparentes', async () => {
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
    for (const [translucide, attendu] of [[false, [1]], [true, [0.15]]] as const) {
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
