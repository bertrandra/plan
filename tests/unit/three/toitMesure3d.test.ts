import { describe, it, expect, beforeAll } from 'vitest';
import { ajouterToitMesure3d, subdiviser, maillesDuToit, hauteurEn, NOM_TOIT_MESURE, NOM_REHAUSSE, PAS_MAILLE_M, LEVEE_M } from '../../../src/three/toitMesure3d.js';
import type { PtBrut, ToitMesure } from '../../../src/model/types.js';

// Le toit mesure dessine en surface (MD/spec-toit-ign.md §12), verifie en structure avec un THREE
// minimal : la maille, ses hauteurs, les rehausses le long des murs.

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
const maison = [p(0, 0), p(10, 0), p(10, 6), p(0, 6)];
/** Une grille plate a `h` sur toute l'emprise et sa marge. */
function plat(h: number): ToitMesure {
  const nx = 23, ny = 15;
  return { pas: 0.5, x0: -0.5, y0: 6.5, nx, ny, z: Array.from({ length: nx * ny }, () => h), egout: h, faite: h, source: 'lidar' };
}
function scene() {
  const enfants: Mesh[] = [];
  return { enfants, ctx: { scene: { add: (m: Mesh) => { enfants.push(m); } } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#ffffff', textures: false } };
}
const ys = (m: Mesh) => { const a = m.geometry.attributes.position!.array; return a.filter((_, k) => k % 3 === 1); };

describe('la maille', () => {
  it('subdivise jusqu au pas, et couvre le contour', () => {
    const tris = subdiviser([p(0, 0), p(4, 0), p(0, 4)], 1);
    expect(tris.length).toBe(64);
    tris.forEach((t) => expect(Math.max(...[0, 1, 2].map((k) => Math.hypot(t[(k + 1) % 3]!.x - t[k]!.x, t[(k + 1) % 3]!.y - t[k]!.y)))).toBeLessThanOrEqual(1 + 1e-9));
    const aire = maillesDuToit(maison).reduce((s, t) => s + Math.abs((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y)) / 2, 0);
    expect(aire).toBeCloseTo(60, 6);
    expect(PAS_MAILLE_M).toBe(0.5);
  });

  it('ne descend jamais sous l egout du corps qui porte le point, plus la levee', () => {
    const t = plat(4);
    expect(LEVEE_M).toBe(0.05);
    expect(hauteurEn(t, [], 5, p(5, 3))).toBeCloseTo(5.05, 9);
    expect(hauteurEn(t, [{ pts: maison, egout: 3 }], 5, p(5, 3))).toBe(4);
    expect(hauteurEn(t, [], 5, p(50, 50))).toBeCloseTo(5.05, 9);
  });
});

describe('ajouterToitMesure3d', () => {
  it('pose la surface a la hauteur mesuree et une rehausse la ou elle depasse l egout', () => {
    const { enfants, ctx } = scene();
    const r = ajouterToitMesure3d(ctx, maison, plat(7), { forme: 'plat', hauteur: 0, angleFaitage: 0, couleur: '#445566' }, [], 5);
    const surface = enfants.find((m) => m.name === NOM_TOIT_MESURE)!;
    expect(surface).toBeDefined();
    expect(r.triangles).toBe(surface.geometry.index.length / 3);
    ys(surface).forEach((y) => expect(y).toBeCloseTo(7, 6));
    expect((surface.material as { p: { color: string } }).p.color).toBe('#445566');
    // 2 m de mur a monter sur les quatre cotes : une bande tous les 50 cm, soit (20 + 12) x 2.
    const rehausse = enfants.find((m) => m.name === NOM_REHAUSSE)!;
    expect(r.rehausses).toBe(64);
    expect(rehausse.geometry.index.length).toBe(64 * 6);
    const yr = ys(rehausse);
    expect(Math.min(...yr)).toBe(5);
    expect(Math.max(...yr)).toBe(7);
  });

  it('a l egout, la surface se tient 5 cm au-dessus du prisme ; chaque corps la porte a son egout', () => {
    const { enfants, ctx } = scene();
    const r = ajouterToitMesure3d(ctx, maison, plat(5), null, [{ pts: maison, egout: 5 }], 3);
    expect(r.rehausses).toBe(64);
    expect(enfants.map((m) => m.name)).toEqual([NOM_TOIT_MESURE, NOM_REHAUSSE]);
    ys(enfants[0]!).forEach((y) => expect(y).toBeCloseTo(5.05, 9));
    const yr = ys(enfants[1]!);
    expect(Math.min(...yr)).toBe(5);
    expect(Math.max(...yr)).toBeCloseTo(5.05, 9);
    const bas = scene();
    // Le corps est a 6 m d'egout, la mesure a 5 : la surface est tenue a 6 (et la levee).
    ajouterToitMesure3d(bas.ctx, maison, plat(5), null, [{ pts: maison, egout: 6 }], 3);
    ys(bas.enfants[0]!).forEach((y) => expect(y).toBeCloseTo(6.05, 9));
  });
});
