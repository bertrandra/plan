import { describe, it, expect, beforeAll } from 'vitest';
import { limitesDuVoisinage, ajouterClotureVoisinage, HAUTEUR_CLOTURE_VOISINAGE_M, PAS_RELIEF_M } from '../../../src/three/clotureVoisinage.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Les clotures du voisinage (option d'affichage de la Vue 3D) : quelles limites, chacune une fois,
// et la maille unique qui les porte.

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  computeVertexNormals() {}
}
class Mesh { name = ''; userData: Record<string, unknown> = {}; constructor(public geometry: Geo, public material: { p: Record<string, unknown> }) {} }

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh,
    MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} },
    DoubleSide: 2,
  };
});

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const parcelle = (key: string, pts: PtBrut[], extra: Partial<ObjetPlan> = {}): ObjetPlan => ({ key, type: 'polygon', fonction: 'terrain', pts, ...extra } as ObjetPlan);
const jamais = () => false;

describe('limitesDuVoisinage', () => {
  it('prend chaque limite des voisines une fois, pas celles du projet', () => {
    const objets = [
      parcelle('parcelle', rect(0, 0, 10, 10)),
      parcelle('a', rect(10, 0, 10, 10)),
      parcelle('b', rect(20, 0, 10, 10)),
      { key: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(2, 2, 4, 4) } as ObjetPlan,
    ];
    const l = limitesDuVoisinage(objets, jamais);
    // Deux carres accoles : 4 + 4 cotes, dont un commun, compte une fois. Le projet sans cloture :
    // sa limite commune avec « a » reste.
    expect(l).toHaveLength(7);
    // Le sens est fixe : de l'abscisse la plus petite a la plus grande.
    expect(l.every((s) => s.a.x < s.b.x || (s.a.x === s.b.x && s.a.y <= s.b.y))).toBe(true);
  });

  it('laisse a la parcelle du projet cloturee sa limite commune, et saute les voisines masquees', () => {
    const projet = parcelle('parcelle', rect(0, 0, 10, 10), { clotureActive: true });
    const a = parcelle('a', rect(10, 0, 10, 10));
    const b = parcelle('b', rect(0, 10, 10, 10));
    expect(limitesDuVoisinage([projet, a, b], jamais)).toHaveLength(6);
    expect(limitesDuVoisinage([projet, a, b], (o) => o.key === 'b')).toHaveLength(3);
  });
});

describe('ajouterClotureVoisinage', () => {
  const versLocal = (q: PtBrut) => ({ x: q.x, z: -q.y });
  it('pose une seule maille translucide, sans ombre, haute d un grillage', () => {
    const ajoutes: Mesh[] = [];
    const m = ajouterClotureVoisinage({ add: (x: Mesh) => ajoutes.push(x) } as never, versLocal, [{ a: p(0, 0), b: p(10, 0) }, { a: p(10, 0), b: p(10, 10) }]) as unknown as Mesh;
    expect(ajoutes).toHaveLength(1);
    expect(m.name).toBe('cloture-voisinage');
    expect(m.userData.sansOmbre).toBe(true);
    expect(m.material.p).toMatchObject({ transparent: true, depthWrite: false });
    expect(m.geometry.index).toHaveLength(2 * 6);
    const ys = m.geometry.attributes.position!.array.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(HAUTEUR_CLOTURE_VOISINAGE_M, 9);
    expect(ajouterClotureVoisinage({ add: () => {} } as never, versLocal, [])).toBe(null);
  });

  it('sur un sol en relief, suit la pente par panneaux courts', () => {
    const m = ajouterClotureVoisinage({ add: () => {} } as never, versLocal, [{ a: p(0, 0), b: p(10, 0) }], (q) => q.x / 10) as unknown as Mesh;
    expect(m.geometry.index.length / 6).toBe(Math.ceil(10 / PAS_RELIEF_M));
    const pos = m.geometry.attributes.position!.array;
    // Le pied du dernier sommet est sur le sol a x = 10 : 1 m.
    expect(Math.max(...pos.filter((_, i) => i % 3 === 1))).toBeCloseTo(1 + HAUTEUR_CLOTURE_VOISINAGE_M, 9);
  });
});
