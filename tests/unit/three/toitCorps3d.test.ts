import { describe, it, expect, beforeAll } from 'vitest';
import { facettesCorps, ajouterToitCorps3d, NOM_TOIT_CORPS, NOM_MUR_CORPS, DEBORD_EGOUT_M } from '../../../src/three/toitCorps3d.js';
import { segmentEnFacade } from '../../../src/geometry/facadeExterieure.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Le dessin des corps et pignons (MD/spec-toit-ign.md §13.3) : les pans, entailles par les pignons le
// long de leurs noues, les debords seulement sur les facades, les murs qui montent au-dessus du prisme.

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  computeVertexNormals() {}
}
class Mesh { name = ''; constructor(public geometry: Geo, public material: unknown) {} }
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = { BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh, MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} }, DoubleSide: 2 };
});

const p = (x: number, y: number): PtBrut => ({ x, y });
/** Un corps de 12 x 8 : faitage le long de x a y = 4, 8 m, egouts 5 m ; `pignons` sur le pan y = 0. */
const corps = (pignons: CorpsToit['pignons'] = [], egouts: [number, number] = [5, 5]): CorpsToit => ({ pts: [p(0, 0), p(12, 0), p(12, 8), p(0, 8)], posFaitage: 4, faitage: 8, egouts, pignons, ecart: 0.1 });
const zs = (polys: { z: number }[][]) => polys.flat().map((q) => q.z);
const ys = (polys: { y: number }[][]) => polys.flat().map((q) => q.y);

describe('facettesCorps', () => {
  it('deux pans avec leur debord, deux pignons de bout ; rien au-dessus du faitage', () => {
    const f = facettesCorps(corps());
    expect(f.pans).toHaveLength(2);
    expect(Math.max(...zs(f.pans))).toBe(8);
    expect(Math.min(...ys(f.pans))).toBeCloseTo(-DEBORD_EGOUT_M, 9);
    // Les deux murs de bout, en pentagone du prisme (5 m) au faitage.
    expect(f.murs).toHaveLength(2);
    f.murs.forEach((m) => expect(Math.max(...m.map((q) => q.z))).toBe(8));
  });

  it('un pan plus haut que l autre : son mur monte au-dessus du prisme', () => {
    const f = facettesCorps(corps([], [5, 6]));
    expect(f.murs).toHaveLength(3);
    const haut = f.murs.find((m) => m.every((q) => Math.abs(q.y - 8) < 1e-9))!;
    expect(Math.min(...haut.map((q) => q.z))).toBe(5);
    expect(Math.max(...haut.map((q) => q.z))).toBe(6);
  });

  it('un pignon entaille le grand pan le long de ses noues, et dresse son triangle sur le mur', () => {
    const f = facettesCorps(corps([{ pan: 0, debut: 3, fin: 6, faitage: 8, profondeur: 4 }]));
    // Le grand pan du cote y = 0 a perdu sa forme de rectangle : l'entaille monte jusqu'au faitage du pignon.
    const grand = f.pans.find((q) => q.length > 4)!;
    expect(grand).toBeDefined();
    const sommet = grand.find((q) => Math.abs(q.x - 4.5) < 1e-9 && Math.abs(q.y - 4) < 1e-9);
    expect(sommet?.z).toBeCloseTo(8, 9);
    // Entre les pieds du pignon, plus de debord du grand pan devant le mur.
    expect(grand.some((q) => q.x > 3.2 && q.x < 5.8 && q.y < 0)).toBe(false);
    // Les deux pans du pignon, et son triangle de 5 a 8 m sur le mur y = 0.
    expect(f.pans).toHaveLength(4);
    const tri = f.murs.find((m) => m.length === 3)!;
    expect(tri.map((q) => q.z)).toEqual([5, 5, 8]);
    tri.forEach((q) => expect(q.y).toBe(0));
  });

  it('pas de debord contre un mur commun : le toit s y arrete', () => {
    // Le contour du batiment continue au nord (y > 8) : le pan y = 8 est contre un autre corps.
    const contour = [p(0, 0), p(12, 0), p(12, 14), p(0, 14)];
    expect(segmentEnFacade(p(0, 8), p(12, 8), p(6, 4), contour)).toBe(false);
    expect(segmentEnFacade(p(0, 0), p(12, 0), p(6, 4), contour)).toBe(true);
    const f = facettesCorps(corps(), contour);
    expect(Math.max(...ys(f.pans))).toBeCloseTo(8, 9);
    expect(Math.min(...ys(f.pans))).toBeCloseTo(-DEBORD_EGOUT_M, 9);
  });
});

describe('ajouterToitCorps3d', () => {
  it('pose une maille de toit et une maille de murs, triangulees', () => {
    const enfants: Mesh[] = [];
    const ctx = { scene: { add: (m: Mesh) => { enfants.push(m); } } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#ffffff', textures: false };
    const r = ajouterToitCorps3d(ctx, [corps([{ pan: 0, debut: 3, fin: 6, faitage: 8, profondeur: 4 }])], { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couleur: '#445566' });
    expect(enfants.map((m) => m.name)).toEqual([NOM_TOIT_CORPS, NOM_MUR_CORPS]);
    expect(r.pans).toBe(4);
    const toit = enfants[0]!;
    expect(toit.geometry.index.length % 3).toBe(0);
    expect((toit.material as { p: { color: string } }).p.color).toBe('#445566');
  });
});
