import { describe, it, expect } from 'vitest';
import { couchesAssise } from '../../../src/three/assise3d.js';
import { constructionTerrasseNeuve, defaultConstruction } from '../../../src/engine/construction.js';

// Ce que le sol en coupe montre sous une terrasse : les couches, de haut en bas, et la profondeur de
// la fouille, tirees de la construction.

describe('l\'assise sous le sol en coupe', () => {
  const plots = (supportType: string) => ({ ...constructionTerrasseNeuve(), supportType, supportDecaissement: 20 });

  it('pose la dalle a couler sur son herisson', () => {
    const a = couchesAssise(plots('dalle-beton'));
    expect(a.couches.map(k => [k.nom, k.haut, Number(k.bas.toFixed(2))])).toEqual([['dalle', 0, -0.12], ['herisson', -0.12, -0.32]]);
    expect(a.parAppui).toBeNull();
    expect(a.profondeur).toBeCloseTo(0.42);
  });

  it('montre le concasse et ses dalles stabilisatrices, une dalle existante, des massifs', () => {
    const stab = couchesAssise(plots('plots-beton'));
    expect(stab.couches.map(k => k.nom)).toEqual(['concasse']);
    expect(stab.parAppui).toEqual({ cote: 0.4, haut: 0, bas: -0.04 });
    expect(couchesAssise(plots('dalle')).couches.map(k => k.nom)).toEqual(['dalle']);
    const massifs = couchesAssise(plots('massifs'));
    expect(massifs.couches).toEqual([]);
    expect(massifs.parAppui).toEqual({ cote: 0.3, haut: 0, bas: -0.3 });
    expect(massifs.profondeur).toBeCloseTo(0.4);
  });

  it('descend jusqu\'au bout des vis de fondation', () => {
    const vis = couchesAssise({ ...defaultConstruction(), hauteurVis: 80 });
    expect(vis.couches).toEqual([]);
    expect(vis.profondeur).toBeCloseTo(0.9);
  });
});

describe('la dalle en 3D', () => {
  it('est pleine par defaut, translucide quand le platelage l est', async () => {
    const THREE_NS = await import('three');
    Object.assign(globalThis, { THREE: THREE_NS });
    const { ajouterAssise3d, OPACITE_DALLE } = await import('../../../src/three/assise3d.js');
    const { creerPrimitives, versLocalDepuis } = await import('../../../src/three/primitives.js');
    const contour = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const c = { ...constructionTerrasseNeuve(), supportType: 'dalle-beton' };
    const opacites = (translucide: boolean) => {
      const scene = new THREE_NS.Scene(), versLocal = versLocalDepuis({ x: 0, y: 0 });
      const prim = creerPrimitives({ scene, versLocal, chargerTexture: () => new THREE_NS.Texture() });
      ajouterAssise3d({ prim, scene, versLocal }, contour, { vis: [], trous: [] } as never, c, false, 0.1, translucide);
      const o: number[] = [];
      scene.traverse(m => { const mat = (m as InstanceType<typeof THREE_NS.Mesh>).material as InstanceType<typeof THREE_NS.MeshStandardMaterial> | undefined; if ((m as InstanceType<typeof THREE_NS.Mesh>).isMesh && mat?.color?.getHexString() === 'c8c8c4') o.push(mat.transparent ? mat.opacity : 1); });
      return o;
    };
    expect(opacites(false)).toEqual([1]);
    expect(opacites(true)).toEqual([OPACITE_DALLE]);
  });
});
