import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { poserFacadeDevant, poserFacadesFaites, reposerFacadeDevant, facadeDevantSurlignee, couleurFacadeDevant, NOM_FACADE_DEVANT, NOM_FACADES_FAITES, AMBRE, ROUGE_FACADE, VERT_FACADE } from '../../../src/three/facadeDevant3d.js';
import { HORS_EXPORT } from '../../../src/three/primitives.js';
import { vue3d } from '../../../src/three/etat3d.js';

// Le surlignage de la facade devant vous, en mode audit : un voile du sol a l'egout, decolle du mur,
// qui suit la facade reconnue et revient sur une scene rebatie.

class Obj3 {
  name = ''; userData: Record<string, unknown> = {}; renderOrder = 0; children: Obj3[] = [];
  add(...o: Obj3[]) { this.children.push(...o); }
  remove(o: Obj3) { this.children = this.children.filter((c) => c !== o); }
  traverse(f: (o: Obj3) => void) { f(this); for (const c of this.children) c.traverse(f); }
  getObjectByName(n: string): Obj3 | undefined { for (const c of this.children) { if (c.name === n) return c; const r = c.getObjectByName(n); if (r) return r; } return undefined; }
}
class Geo {
  attrs: Record<string, { array: number[] }> = {}; index: number[] = []; libere = false;
  setAttribute(n: string, a: { array: number[] }) { this.attrs[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  dispose() { this.libere = true; }
}
class Mat { constructor(public p: Record<string, unknown>) {} dispose() {} }
class Maille extends Obj3 { constructor(public geometry: Geo, public material: Mat) { super(); } }
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    Group: Obj3, Mesh: Maille, LineLoop: Maille, BufferGeometry: Geo, MeshBasicMaterial: Mat, LineBasicMaterial: Mat,
    Float32BufferAttribute: class { constructor(public array: number[], public n: number) {} }, DoubleSide: 2,
  };
});
const scene = new Obj3();
beforeEach(() => {
  poserFacadeDevant(null);
  poserFacadesFaites([]);
  scene.children = [];
  (vue3d as { scene: unknown }).scene = { scene, cen: { x: 100, y: 50 } };
});

// Le mur sud d'une maison : de (100, 50) a (110, 50), normale vers le sud, 6 m a l'egout.
const sud = { gauche: { x: 100, y: 50 }, droite: { x: 110, y: 50 }, normale: { x: 0, y: -1 }, hauteur: 6 };

describe('la facade devant vous dans la Vue 3D', () => {
  it('pose un voile du sol a l egout, decolle du mur vers l exterieur, hors export', () => {
    reposerFacadeDevant(() => 1);
    poserFacadeDevant(sud);
    const g = scene.getObjectByName(NOM_FACADE_DEVANT) as Obj3;
    expect(g.userData[HORS_EXPORT]).toBe(true);
    const voile = g.getObjectByName('voile') as Maille;
    const pos = voile.geometry.attrs.position!.array;
    // Repere de la scene : x vers l'est, z vers le sud ; le voile est 0,15 m au sud du mur.
    const proche = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    proche(pos.slice(0, 3), [0, 1, 0.15]);
    proche(pos.slice(6, 9), [10, 7, 0.15]);
    expect(voile.geometry.index).toEqual([0, 1, 2, 0, 2, 3]);
    expect(g.getObjectByName('contour')).toBeDefined();
  });

  it('suit le haut du mur par morceaux : rien sur le ciel au-dessus d une aile basse', () => {
    reposerFacadeDevant(() => 0);
    poserFacadeDevant({ ...sud, hauteur: 6, profil: [{ de: 0, a: 4, h: 3 }, { de: 4, a: 10, h: 6 }] });
    const g = scene.getObjectByName(NOM_FACADE_DEVANT) as Obj3;
    const voile = g.getObjectByName('voile') as Maille;
    const pos = voile.geometry.attrs.position!.array;
    // Deux morceaux, deux quadrilateres : l'aile a 3 m, puis l'etage a 6 m.
    expect(voile.geometry.index).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(pos[7]).toBeCloseTo(3, 9);
    expect(pos[12 + 6]).toBeCloseTo(10, 9);
    expect(pos[12 + 7]).toBeCloseTo(6, 9);
    // Le contour passe par la marche : le bas, puis le haut de droite a gauche.
    const contour = (g.getObjectByName('contour') as Maille).geometry.attrs.position!.array;
    const hauts = [];
    for (let i = 4; i < contour.length; i += 3) hauts.push(contour[i]);
    expect(hauts).toEqual([0, 6, 6, 3, 3]);
  });

  it('un seul surlignage, qui change de mur et s efface', () => {
    reposerFacadeDevant(undefined);
    poserFacadeDevant(sud);
    const avant = (scene.getObjectByName('voile') as Maille).geometry;
    poserFacadeDevant({ ...sud, gauche: { x: 110, y: 50 }, droite: { x: 110, y: 58 }, normale: { x: 1, y: 0 } });
    expect(scene.children.filter((c) => c.name === NOM_FACADE_DEVANT)).toHaveLength(1);
    expect(avant.libere).toBe(true);
    poserFacadeDevant(null);
    expect(scene.getObjectByName(NOM_FACADE_DEVANT)).toBeUndefined();
    expect(facadeDevantSurlignee()).toBeNull();
  });

  it('une scene rebatie reprend la derniere facade', () => {
    poserFacadeDevant(sud);
    const neuve = new Obj3();
    (vue3d as { scene: unknown }).scene = { scene: neuve, cen: { x: 100, y: 50 } };
    reposerFacadeDevant(() => 0);
    expect(neuve.getObjectByName(NOM_FACADE_DEVANT)).toBeDefined();
  });

  it('reste ambre pour la promenade, passe en rouge pour l audit de la parcelle', () => {
    poserFacadeDevant(sud);
    expect(couleurFacadeDevant()).toBe(AMBRE);
    poserFacadeDevant(sud, ROUGE_FACADE);
    expect(((scene.getObjectByName('voile') as Maille).material as Mat).p.color).toBe(ROUGE_FACADE);
  });

  it('pose les facades photographiees en vert, sous la facade visee, et les reprend sur une scene rebatie', () => {
    const est = { ...sud, gauche: { x: 110, y: 50 }, droite: { x: 110, y: 58 }, normale: { x: 1, y: 0 } };
    poserFacadesFaites([sud, est]);
    const g = scene.getObjectByName(NOM_FACADES_FAITES) as Obj3;
    expect(g.userData[HORS_EXPORT]).toBe(true);
    const voiles = g.children.filter((c) => c.name === 'voile') as Maille[];
    expect(voiles).toHaveLength(2);
    expect((voiles[0]!.material as Mat).p.color).toBe(VERT_FACADE);
    poserFacadeDevant(sud, ROUGE_FACADE);
    expect((scene.getObjectByName(NOM_FACADE_DEVANT)!.getObjectByName('voile') as Maille).renderOrder).toBeGreaterThan(voiles[0]!.renderOrder);
    const neuve = new Obj3();
    (vue3d as { scene: unknown }).scene = { scene: neuve, cen: { x: 100, y: 50 } };
    reposerFacadeDevant(() => 0);
    expect(neuve.getObjectByName(NOM_FACADES_FAITES)).toBeDefined();
    poserFacadesFaites([]);
    expect(neuve.getObjectByName(NOM_FACADES_FAITES)).toBeUndefined();
  });
});
