import { describe, it, expect, beforeAll } from 'vitest';
import { facettesTerrasse, ajouterTerrasses3d, corpsPlat, NOM_ACROTERE, NOM_EDICULE_MUR, NOM_EDICULE_TOIT, EPAISSEUR_ACROTERE_M } from '../../../src/three/terrasse3d.js';
import type { CorpsToit, PtBrut, TerrasseToit } from '../../../src/model/types.js';

// La toiture-terrasse (MD/spec-regles-toits.md §2.7) : l'acrotere sur les facades seulement, les
// edicules a toit plat, et rien pour un corps sans terrasse ou en pente.

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  computeVertexNormals() {}
}
class Mesh { name = ''; constructor(public geometry: Geo, public material: { p: Record<string, unknown> }) {} }
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = { BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh, MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} }, DoubleSide: 2 };
});

const p = (x: number, y: number): PtBrut => ({ x, y });
/** Un corps plat de 10 x 6 a 3 m. */
const plat = (terrasse?: TerrasseToit): CorpsToit => ({ pts: [p(0, 0), p(10, 0), p(10, 6), p(0, 6)], posFaitage: 3, faitage: 3, egouts: [3, 3], pignons: [], ecart: 0.05, ...(terrasse ? { terrasse } : {}) });
const zs = (polys: { z: number }[][]) => polys.flat().map((q) => q.z);

describe('facettesTerrasse', () => {
  it('rien sans terrasse, rien sur un corps en pente', () => {
    expect(facettesTerrasse(plat())).toEqual({ acrotere: [], murs: [], toits: [] });
    const enPente: CorpsToit = { ...plat({ acrotereM: 0.5, source: 'observation' }), faitage: 5 };
    expect(corpsPlat(enPente)).toBe(false);
    expect(facettesTerrasse(enPente).acrotere).toHaveLength(0);
  });

  it('un acrotere tout autour : trois faces par cote, du dessus du toit a sa hauteur', () => {
    const f = facettesTerrasse(plat({ acrotereM: 0.6, source: 'observation' }));
    expect(f.acrotere).toHaveLength(12);
    expect(Math.min(...zs(f.acrotere))).toBe(3);
    expect(Math.max(...zs(f.acrotere))).toBeCloseTo(3.6, 9);
    // Le dessus, coupe d'onglet : chaque bande va du nu exterieur a l'epaisseur, sans recouvrement.
    const dessus = f.acrotere.filter((poly) => poly.every((q) => Math.abs(q.z - 3.6) < 1e-9));
    expect(dessus).toHaveLength(4);
    const aire = (poly: PtBrut[]) => Math.abs(poly.reduce((a, q, i) => { const r = poly[(i + 1) % poly.length]!; return a + q.x * r.y - r.x * q.y; }, 0)) / 2;
    const e = EPAISSEUR_ACROTERE_M;
    expect(dessus.reduce((a, poly) => a + aire(poly), 0)).toBeCloseTo(10 * 6 - (10 - 2 * e) * (6 - 2 * e), 9);
  });

  it('sur les facades seulement : contre un autre corps, pas de rebord, et le bout libre est ferme', () => {
    // Le contour du batiment s'etend au-dela du cote x = 10 : ce cote est interieur.
    const contour = [p(0, 0), p(20, 0), p(20, 6), p(0, 6)];
    const f = facettesTerrasse(plat({ acrotereM: 0.4, source: 'observation' }), contour);
    // Trois cotes (y = 0, y = 6, x = 0) : 3 x 3 faces, et deux bouts fermes au droit de x = 10.
    expect(f.acrotere).toHaveLength(11);
    expect(Math.max(...f.acrotere.flat().map((q) => q.x))).toBeCloseTo(10, 9);
  });

  it('pas d acrotere a zero ; un edicule a toit plat, de la terrasse a son sommet', () => {
    const ed = { pts: [p(2, 2), p(4.5, 2), p(4.5, 4), p(2, 4)], sommetM: 5.6 };
    const f = facettesTerrasse(plat({ acrotereM: 0, accessible: true, edicules: [ed], source: 'observation' }));
    expect(f.acrotere).toHaveLength(0);
    expect(f.murs).toHaveLength(4);
    expect(f.toits).toHaveLength(1);
    expect(Math.min(...zs(f.murs))).toBe(3);
    expect(Math.max(...zs(f.murs))).toBe(5.6);
    expect(f.toits[0]!.every((q) => q.z === 5.6)).toBe(true);
    // Un edicule sous la terrasse, ou abime, ne se dessine pas.
    const g = facettesTerrasse(plat({ edicules: [{ pts: ed.pts, sommetM: 2 }, { pts: [p(0, 0)], sommetM: 6 }], source: 'observation' }));
    expect(g.murs).toHaveLength(0);
  });
});

describe('ajouterTerrasses3d', () => {
  it('un corps sans terrasse ne pose rien ; avec, l acrotere, les murs et le toit des edicules', () => {
    const enfants: Mesh[] = [];
    const ctx = { scene: { add: (m: Mesh) => enfants.push(m) } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#d8cfc0', textures: false };
    expect(ajouterTerrasses3d(ctx, [plat()], null)).toEqual({ acrotere: 0, edicules: 0 });
    expect(enfants).toHaveLength(0);
    const r = ajouterTerrasses3d(ctx, [plat({ acrotereM: 0.5, edicules: [{ pts: [p(1, 1), p(3, 1), p(3, 3), p(1, 3)], sommetM: 5.5 }], source: 'observation' })], null);
    expect(r).toEqual({ acrotere: 12, edicules: 1 });
    expect(enfants.map((m) => m.name)).toEqual([NOM_ACROTERE, NOM_EDICULE_MUR, NOM_EDICULE_TOIT]);
    expect(enfants[0]!.material.p.color).toBe('#d8cfc0');
  });
});
