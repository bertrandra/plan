import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { poserPositionGps, retirerPositionGps, reposerPositionGps, NOM_POSITION_GPS, PRECISION_DESSINEE_MAX_M } from '../../../src/three/positionGps3d.js';
import { HORS_EXPORT } from '../../../src/three/primitives.js';
import { vue3d } from '../../../src/three/etat3d.js';

// Le marqueur de la position GPS dans la Vue 3D : cree une fois, puis seulement deplace.

class Vec { x = 0; y = 0; z = 0; set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } }
class Obj3 {
  name = ''; userData: Record<string, unknown> = {}; renderOrder = 0; children: Obj3[] = []; parent: Obj3 | null = null;
  position = new Vec(); rotation = new Vec(); scale = new Vec().set(1, 1, 1);
  add(...o: Obj3[]) { for (const c of o) { c.parent = this; this.children.push(c); } }
  remove(o: Obj3) { this.children = this.children.filter((c) => c !== o); }
  getObjectByName(n: string): Obj3 | undefined { for (const c of this.children) { if (c.name === n) return c; const r = c.getObjectByName(n); if (r) return r; } return undefined; }
}
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    Group: Obj3, Sprite: class extends Obj3 { constructor(public material: unknown) { super(); } },
    Mesh: class extends Obj3 { constructor(public geometry: unknown, public material: unknown) { super(); } },
    SpriteMaterial: class { constructor(public p: unknown) {} }, MeshBasicMaterial: class { constructor(public p: unknown) {} },
    CircleGeometry: class { constructor(public r: number) {} }, CanvasTexture: class { constructor(public image: unknown) {} },
  };
});
const scene = new Obj3();
beforeEach(() => {
  retirerPositionGps();
  scene.children = [];
  (vue3d as { scene: unknown }).scene = { scene, cen: { x: 100, y: 50 } };
});

describe('la position GPS dans la Vue 3D', () => {
  it('pose le marqueur au point du plan, sur le sol, avec le disque de sa precision, hors export', () => {
    reposerPositionGps((p) => p.x / 100);
    poserPositionGps({ x: 110, y: 40 }, 8);
    const g = scene.getObjectByName(NOM_POSITION_GPS)!;
    expect([g.position.x, g.position.y, g.position.z]).toEqual([10, 1.1, 10]);
    expect(g.userData[HORS_EXPORT]).toBe(true);
    expect(g.getObjectByName('precision')!.scale.x).toBe(8);
  });

  it('deplace le meme marqueur a chaque position, borne le disque, et le retire', () => {
    reposerPositionGps(undefined);
    poserPositionGps({ x: 100, y: 50 }, 3);
    const g = scene.getObjectByName(NOM_POSITION_GPS);
    poserPositionGps({ x: 101, y: 52 }, 500);
    expect(scene.children.filter((c) => c.name === NOM_POSITION_GPS)).toHaveLength(1);
    expect(scene.getObjectByName(NOM_POSITION_GPS)).toBe(g);
    expect([g!.position.x, g!.position.z]).toEqual([1, -2]);
    expect(g!.getObjectByName('precision')!.scale.x).toBe(PRECISION_DESSINEE_MAX_M);
    retirerPositionGps();
    expect(scene.getObjectByName(NOM_POSITION_GPS)).toBeUndefined();
  });

  it('une scene reconstruite reprend la derniere position connue', () => {
    poserPositionGps({ x: 105, y: 50 }, 4);
    const neuve = new Obj3();
    (vue3d as { scene: unknown }).scene = { scene: neuve, cen: { x: 100, y: 50 } };
    reposerPositionGps(() => 2);
    const g = neuve.getObjectByName(NOM_POSITION_GPS)!;
    expect([g.position.x, g.position.y]).toEqual([5, 2]);
  });
});
