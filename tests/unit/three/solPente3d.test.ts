// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import * as THREE_NS from 'three';

vi.mock('../../../src/shell/dialogs.js', () => ({ showErrBanner: () => {}, showToast: () => {} }));

import { buildThreeScene, type ContexteScene3d } from '../../../src/three/scene.js';
import { vue3d, hotes3d } from '../../../src/three/etat3d.js';
import { hauteurAppuiMm, hauteurFinieMm, dessusTerrasseM, elevationOf } from '../../../src/engine/hauteurs.js';
import { solDuRelief, zReferenceOuvrage } from '../../../src/engine/sol.js';
import { calculerPergola } from '../../../src/engine/pergola.js';
import { calculerPiscine } from '../../../src/engine/piscine.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// La structure suit le sol en pente dans la Vue 3D (MD/spec-relief.md §6, phase 2) : la terrasse
// est de niveau au point le plus haut du sol sous elle, chaque plot ou vis descend jusqu'a son sol ;
// les poteaux d'une pergola et d'une plage de piscine aussi ; le bord d'un bassin est de niveau sur
// le point haut. Sans relief, la scene est celle d'avant. Le vrai three.js r128 est a l'oeuvre ;
// seuls le rendu WebGL et les controles d'orbite sont des doublures.

class FauxRendu {
  domElement = document.createElement('canvas');
  shadowMap = { enabled: false, type: 0 };
  render = vi.fn();
  getContext() { return { isContextLost: () => false }; }
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
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

/** Une grille plane z = 100 + PENTE·x (NGF), zRef = 100 : le sol monte de 10 cm par metre vers l'est. */
const PENTE = 0.1;
function plane(): Relief {
  const nx = 60, ny = 48, x0 = -37.5, y0 = 9.5;
  const z: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((100 + PENTE * (x0 + i)) * 100) / 100);
  return { source: 'lidar-hd', couche: 'test', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: 'test', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0, y0, nx, ny, z, zRef: 100 };
}
const solEn = (x: number) => PENTE * x;

const TERRASSE_PTS = [{ x: -10, y: -10 }, { x: -4, y: -10 }, { x: -4, y: -6 }, { x: -10, y: -6 }];
function objets(avecRelief: boolean, construction: Record<string, unknown>): ObjetPlan[] {
  const parcelle = { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', fill: '#1b5e0d', pts: [{ x: -30, y: -30 }, { x: 15, y: -30 }, { x: 15, y: 5 }, { x: -30, y: 5 }], ...(avecRelief ? { relief: plane() } : {}) };
  const terrasse = { key: 'terrasse', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', fill: '#DDBC7E', pts: TERRASSE_PTS, construction };
  const autre = { key: 'autre', name: 'Autre terrasse', type: 'polygon', fonction: 'terrasse', fill: '#aa8855', pts: [{ x: 2, y: -10 }, { x: 8, y: -10 }, { x: 8, y: -6 }, { x: 2, y: -6 }], construction: { typePose: 'plots', hauteurPlot: 8 } };
  const pergola = { key: 'pergola', name: 'Pergola', type: 'polygon', fonction: 'pergola', fill: '#cccccc', pts: [{ x: -10, y: 0 }, { x: -4, y: 0 }, { x: -4, y: 3 }, { x: -10, y: 3 }], pergola: {} };
  const piscine = { key: 'piscine', name: 'Bassin', type: 'polygon', fonction: 'piscine', fill: '#66ccee', pts: [{ x: 0, y: -2 }, { x: 8, y: -2 }, { x: 8, y: 2 }, { x: 0, y: 2 }], piscine: { plage: 'terrasse-bois', largeurPlage: 2, implantation: 'hors-sol', hauteurHorsSol: 1.2 } };
  return [parcelle, terrasse, autre, pergola, piscine] as unknown as ObjetPlan[];
}

function contexte(objs: ObjetPlan[]): ContexteScene3d {
  return {
    trouverParcelleCloture: () => objs.find((o) => o.key === 'parcelle'), hauteurAppuiMm, elevationOf,
    objetMasque: () => false, positionMat: (p) => (p as unknown as { center: { x: number; y: number } }).center,
    orthoActif: () => false, orthoTuiles: () => [], chargerTexturePolyhaven: () => new THREE_NS.Texture(),
    disposeThreeScene: () => { vue3d.scene = null; }, appliquerLumiereVue3d: vi.fn(), applyMode3D: vi.fn(), syncControlesSoleilVue3d: vi.fn()
  };
}

const attendre = () => new Promise((ok) => setTimeout(ok, 5));
const scene = () => vue3d.scene?.scene as THREE_NS.Scene;
const cen = () => vue3d.centre ?? { x: 0, y: 0 };
/**
 * La boite d'un maillage dans le repere du monde : les groupes eleves comptent, et rien n'a rendu la
 * scene (le rendu est une doublure), donc c'est elle qu'on met a jour, pas le seul maillage.
 */
const boite = (m: THREE_NS.Object3D) => { scene().updateMatrixWorld(true); return new THREE_NS.Box3().setFromObject(m); };
const meshes = (couleur: string, geometrie?: string) => {
  const out: THREE_NS.Mesh[] = [];
  scene().traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && (m.material as THREE_NS.MeshStandardMaterial).color?.getHexString() === couleur && (!geometrie || m.geometry.type === geometrie)) out.push(m);
  });
  return out;
};
/** L'abscisse du plan d'un maillage, lue au centre de sa boite. */
const xPlan = (m: THREE_NS.Mesh) => { const b = boite(m); return cen().x + (b.min.x + b.max.x) / 2; };
/** Les maillages rassembles par position (au centimetre) : un plot ou une vis par position. */
const parPosition = (ms: THREE_NS.Mesh[]) => {
  const groupes = new Map<string, THREE_NS.Mesh[]>();
  ms.forEach((m) => { const b = boite(m); const cle = ((b.min.x + b.max.x) / 2).toFixed(2) + ':' + ((b.min.z + b.max.z) / 2).toFixed(2); groupes.set(cle, [...(groupes.get(cle) ?? []), m]); });
  return [...groupes.values()];
};
/** Les lames de la plage de la piscine ont la couleur des lames de terrasse : on ne garde que l'emprise de la terrasse. */
const dansLaTerrasse = (m: THREE_NS.Mesh) => { const x = xPlan(m); return x > -10 && x < -4; };
const etendue = (ms: THREE_NS.Mesh[]) => ms.reduce((e, m) => { const b = boite(m); return { min: Math.min(e.min, b.min.y), max: Math.max(e.max, b.max.y) }; }, { min: Infinity, max: -Infinity });

async function construire(objs: ObjetPlan[]): Promise<void> {
  vue3d.scene = null; vue3d.dernierObjKey = null;
  buildThreeScene(objs.find((o) => o.key === 'terrasse') ?? null, { objects: objs, terrasseSelectedKey: 'terrasse' }, contexte(objs));
  await attendre();
}

let textures = true;
beforeEach(() => {
  document.body.innerHTML = '<div id="hote"></div>';
  hotes3d.vue3d = document.getElementById('hote');
  vue3d.scene = null; vue3d.dernierObjKey = null; vue3d.tousLesObjets = true;
  textures = vue3d.textures; vue3d.textures = false;
});
afterEach(() => { vue3d.textures = textures; });

describe('la terrasse courante sur un sol en pente', () => {
  const PLOTS = { typePose: 'plots', hauteurPlot: 6, plotAvecSolives: false };

  it('pose la structure dans un groupe eleve du point haut du sol, les lames au dessus de la terrasse', async () => {
    const objs = objets(true, PLOTS);
    await construire(objs);
    const t = objs[1] as ObjetPlan;
    const sol = solDuRelief(plane());
    const zHaut = zReferenceOuvrage(sol, TERRASSE_PTS);
    expect(zHaut).toBeCloseTo(solEn(-4), 6);
    const groupe = scene().getObjectByName('terrasse-point-haut');
    expect(groupe?.position.y).toBeCloseTo(zHaut, 6);
    expect(groupe?.parent?.type).toBe('Scene');
    const lames = meshes('c9a15a', 'ExtrudeGeometry').filter(dansLaTerrasse);
    expect(lames.length).toBeGreaterThan(0);
    expect(etendue(lames).max).toBeCloseTo(dessusTerrasseM(t, sol), 3);
    expect(dessusTerrasseM(t, sol)).toBeCloseTo(zHaut + hauteurFinieMm(t) / 1000, 9);
    // Le contour de la terrasse monte avec elle.
    const contour = scene().children.find((o) => (o as THREE_NS.Line).isLine) as THREE_NS.Line | undefined;
    expect(contour?.geometry.getAttribute('position').getY(0)).toBeCloseTo(zHaut + 0.01, 6);
  });

  it('descend chaque plot jusqu a son sol, la tete commune a la hauteur reglee', async () => {
    const objs = objets(true, PLOTS);
    await construire(objs);
    const zHaut = solEn(-4);
    const plots = parPosition(meshes('6e7a84'));
    expect(plots.length).toBeGreaterThan(3);
    plots.forEach((plot) => {
      expect(plot).toHaveLength(3);   // base, fut, tete
      const e = etendue(plot);
      expect(e.max).toBeCloseTo(zHaut + 0.06, 3);
      expect(e.min).toBeCloseTo(solEn(xPlan(plot[0] as THREE_NS.Mesh)), 3);
    });
    // Le plot d'aval (a l'ouest) a son pied sous le niveau du groupe de ce que le sol descend.
    const aval = plots.reduce((a, b) => (xPlan(a[0] as THREE_NS.Mesh) < xPlan(b[0] as THREE_NS.Mesh) ? a : b));
    expect(etendue(aval).min).toBeLessThan(zHaut - 0.5);
    expect(zHaut - etendue(aval).min).toBeCloseTo(zHaut - solEn(xPlan(aval[0] as THREE_NS.Mesh)), 3);
  });

  it('sur vis, le fut enterre part du sol de l appui et la tete monte jusqu a la structure', async () => {
    const objs = objets(true, { typePose: 'vis-fondation', hauteurVis: 40, depassementVis: 5 });
    await construire(objs);
    const zHaut = solEn(-4);
    const futs = meshes('8a96a8', 'CylinderGeometry');
    expect(futs.length).toBeGreaterThan(3);
    futs.forEach((f) => {
      const b = boite(f);
      expect(b.max.y).toBeCloseTo(solEn(xPlan(f)), 3);
      expect(b.max.y - b.min.y).toBeCloseTo(0.4, 3);
    });
    const tetes = meshes('b8c2ce', 'CylinderGeometry');
    expect(tetes.length).toBe(futs.length);
    tetes.forEach((t) => {
      const b = boite(t);
      expect(b.min.y).toBeCloseTo(solEn(xPlan(t)), 3);
      expect(b.max.y).toBeCloseTo(zHaut + 0.05, 3);
    });
  });

  it('monte le prisme d une autre terrasse jusqu a son dessus au-dessus du point haut', async () => {
    const objs = objets(true, PLOTS);
    await construire(objs);
    const autre = objs[2] as ObjetPlan;
    const prismes = meshes(new THREE_NS.Color('#aa8855').getHexString());
    expect(prismes).toHaveLength(1);
    const b = boite(prismes[0] as THREE_NS.Mesh);
    expect(b.min.y).toBeCloseTo(solEn(2), 3);
    expect(b.max.y).toBeCloseTo(dessusTerrasseM(autre, solDuRelief(plane())), 3);
  });
});

describe('la pergola et la piscine sur un sol en pente', () => {
  it('pose la pergola dans la scene telle que le moteur la compte : le poteau d aval est plus long', async () => {
    const objs = objets(true, { typePose: 'plots', hauteurPlot: 6 });
    await construire(objs);
    const pergola = objs[3] as ObjetPlan;
    const groupe = scene().getObjectByName('abri:pergola');
    expect(groupe?.parent?.type).toBe('Scene');
    expect(groupe?.position.y).toBe(0);
    const calc = calculerPergola(pergola, solDuRelief(plane()));
    const bois = new THREE_NS.Color(calc?.reglages.couleurBois ?? '#000').getHexString();
    // Les poteaux : les boites bien plus hautes que larges.
    const poteaux = meshes(bois).filter((m) => { const b = boite(m); return b.max.y - b.min.y > 3 * Math.max(b.max.x - b.min.x, b.max.z - b.min.z); });
    expect(poteaux.length).toBeGreaterThanOrEqual(4);
    poteaux.forEach((p) => expect(boite(p).min.y).toBeCloseTo(solEn(xPlan(p)), 2));
    const hauteurs = poteaux.map((p) => { const b = boite(p); return { x: xPlan(p), h: b.max.y - b.min.y }; });
    const ouest = hauteurs.reduce((a, b) => (a.x < b.x ? a : b)), est = hauteurs.reduce((a, b) => (a.x > b.x ? a : b));
    expect(ouest.h - est.h).toBeCloseTo(PENTE * (est.x - ouest.x), 2);
  });

  it('pose la piscine a son point haut, et chaque poteau de la plage jusqu a son sol', async () => {
    const objs = objets(true, { typePose: 'plots', hauteurPlot: 6 });
    await construire(objs);
    const calc = calculerPiscine(objs[4] as ObjetPlan, objs);
    expect(calc?.sol).not.toBeNull();
    const groupe = scene().getObjectByName('piscine:piscine');
    expect(groupe?.parent?.type).toBe('Scene');
    expect(groupe?.position.y).toBeCloseTo(calc?.sol?.zHaut ?? NaN, 6);
    const pb = calc?.plageBois;
    expect(pb?.mode).toBe('poteaux');
    const poteaux = meshes(new THREE_NS.Color('#6b4a2a').getHexString()).filter((m) => { const b = boite(m); return b.max.x - b.min.x < 0.13 && b.max.z - b.min.z < 0.13; });
    expect(poteaux).toHaveLength(pb?.poteaux ?? -1);
    // Le pied de chaque poteau est sous le groupe de ce que le moteur ajoute a sa hauteur (au cm).
    poteaux.forEach((p) => {
      const b = boite(p);
      expect(Math.abs(b.min.y - solEn(xPlan(p)))).toBeLessThan(0.011);
      expect(b.max.y).toBeCloseTo((calc?.sol?.zHaut ?? 0) + (pb?.dessus ?? 0) - 0.027 - 0.175 - 0.2, 3);
    });
  });
});

describe('sans relief', () => {
  it('garde la scene d avant : rien d eleve, les appuis au sol, la pergola et la piscine dans la scene', async () => {
    const objs = objets(false, { typePose: 'plots', hauteurPlot: 6, plotAvecSolives: false });
    await construire(objs);
    expect(scene().getObjectByName('terrasse-point-haut')).toBeUndefined();
    expect(scene().getObjectByName('piscine:piscine')).toBeUndefined();
    expect(scene().getObjectByName('abri:pergola')?.parent?.type).toBe('Scene');
    const plots = parPosition(meshes('6e7a84'));
    plots.forEach((plot) => { const e = etendue(plot); expect(e.min).toBeCloseTo(0, 6); expect(e.max).toBeCloseTo(0.06, 6); });
    expect(etendue(meshes('c9a15a', 'ExtrudeGeometry').filter(dansLaTerrasse)).max).toBeCloseTo(hauteurFinieMm(objs[1] as ObjetPlan) / 1000, 6);
    const contour = scene().children.find((o) => (o as THREE_NS.Line).isLine) as THREE_NS.Line | undefined;
    expect(contour?.geometry.getAttribute('position').getY(0)).toBeCloseTo(0.01, 6);
  });
});
