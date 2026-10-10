import { describe, it, expect, beforeAll } from 'vitest';
import { LEVEE_FEUILLE, gabaritFeuille, matriceFeuille, couleurFeuille, cuire, ajouterFeuilles, actualiserFeuillesProches, cuireFeuillesPourExport, NOM_FEUILLES, NOM_FEUILLES_CUITES, DISTANCE_FEUILLES_M, HYSTERESE_FEUILLES_M, RAYON_FEUILLES_EXPORT_M } from '../../../src/three/feuilles.js';
import { SANS_OMBRE } from '../../../src/three/primitives.js';
import { tonDuSommet, type Feuille, type Feuillage } from '../../../src/model/arbre.js';

// Les feuilles d'un arbre (MD/spec-arbres-3d.md §3.1) : le calcul pur (gabarit, matrices, cuisson)
// et, avec un THREE minimal, la maille instanciee, l'affichage de pres et la cuisson a l'export.

const feuille = (extra: Partial<Feuille> = {}): Feuille => ({ x: 1, y: 2, z: 3, nx: 0, ny: 0, nz: 1, spin: 0, inclinaison: 0, echelle: 1, teinte: 1, ...extra });
const appliquer = (m: number[], p: [number, number, number]) => [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!);
const colonne = (m: number[], c: number) => [m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

describe('le calcul des feuilles', () => {
  it('gabaritFeuille : quatre sommets, la pointe a la taille et levee vers l exterieur, la normale celle de la surface', () => {
    const g = gabaritFeuille('feuille', 0.2);
    expect(g.positions).toHaveLength(12);
    expect(g.index).toEqual([0, 1, 2, 0, 2, 3]);
    expect(Math.hypot(g.positions[6]!, g.positions[7]!, g.positions[8]!)).toBeCloseTo(0.2, 9);
    expect(g.positions[8]).toBeCloseTo(0.2 * Math.sin(LEVEE_FEUILLE), 9);
    expect(g.normales).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(gabaritFeuille('aiguille', 0.2).positions[3]!).toBeLessThan(g.positions[3]!);
  });
  it('matriceFeuille : la face vers la normale, une base orthonormee a l echelle, la feuille a sa place', () => {
    const m = matriceFeuille(feuille({ nx: 1, ny: 1, nz: 0, spin: 0.7, echelle: 2 }));
    const [x, y, z] = [colonne(m, 0), colonne(m, 1), colonne(m, 2)];
    for (const c of [x, y, z]) expect(Math.hypot(...c)).toBeCloseTo(2, 9);
    expect(dot(x, y)).toBeCloseTo(0, 9);
    expect(dot(y, z)).toBeCloseTo(0, 9);
    expect(dot(x, z)).toBeCloseTo(0, 9);
    expect(dot(z, [Math.SQRT1_2, Math.SQRT1_2, 0]) / 2).toBeCloseTo(1, 9);
    expect(appliquer(m, [0, 0, 0])).toEqual([1, 2, 3]);
  });
  it('matriceFeuille : l inclinaison leve la pointe hors de la surface, une normale verticale n est pas degeneree', () => {
    const plat = matriceFeuille(feuille());
    const leve = matriceFeuille(feuille({ inclinaison: 0.2 }));
    // Un point (0, 1, 0) du repere de la feuille : sans inclinaison il reste dans le plan z = 3, incline il sort vers +z.
    expect(appliquer(plat, [0, 1, 0])[2]).toBeCloseTo(3, 9);
    expect(appliquer(leve, [0, 1, 0])[2]!).toBeGreaterThan(3.15);
    expect(matriceFeuille(feuille({ nx: 0, ny: 1, nz: 0 })).every(Number.isFinite)).toBe(true);
  });
  it('couleurFeuille : la moitie du ton de sa place, nuancee, jamais au-dela de 1', () => {
    const t = tonDuSommet([0.4, 0.5, 0.3], 1);
    couleurFeuille([0.4, 0.5, 0.3], feuille({ ny: 1, teinte: 1 })).forEach((v, i) => expect(v).toBeCloseTo(([0.4, 0.5, 0.3][i]! + t[i]!) / 2, 9));
    expect(couleurFeuille([0.9, 0.9, 0.9], feuille({ ny: 1, teinte: 1.1 }))[0]).toBe(1);
  });
  it('cuire : un gabarit par matrice, transforme, colore, indices decales', () => {
    const g = gabaritFeuille('feuille', 1);
    const m1 = matriceFeuille(feuille({ x: 0, y: 0, z: 0 }));
    const m2 = matriceFeuille(feuille({ x: 10, y: 0, z: 0 }));
    const c = cuire(g, [m1, m2], [[1, 0, 0], [0, 1, 0]]);
    expect(c.positions).toHaveLength(24);
    expect(Array.from(c.index)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(Array.from(c.positions.slice(12, 15))).toEqual([10, 0, 0]);
    expect(Array.from(c.couleurs.slice(0, 3))).toEqual([1, 0, 0]);
    expect(Array.from(c.couleurs.slice(21, 24))).toEqual([0, 1, 0]);
    expect(Array.from(c.normales.slice(0, 3))).toEqual([0, 0, 1]);
  });
});

/* ---- Un THREE minimal ---------------------------------------------------------------------- */
class Attr { needsUpdate = false; constructor(public array: ArrayLike<number>, public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {}; index: unknown = null; jete = false;
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: unknown) { this.index = i; }
  dispose() { this.jete = true; }
}
class V3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: V3) { return this.set(v.x, v.y, v.z); }
}
class Obj {
  name = ''; visible = true; parent: Obj | null = null; children: Obj[] = []; userData: Record<string, unknown> = {};
  position = new V3(); frustumCulled = true;
  add(o: Obj) { o.parent = this; this.children.push(o); }
  remove(o: Obj) { this.children = this.children.filter((c) => c !== o); o.parent = null; }
  traverse(f: (o: Obj) => void) { f(this); this.children.forEach((c) => c.traverse(f)); }
  getWorldPosition(v: V3): V3 {
    const p = this.parent ? this.parent.getWorldPosition(new V3()) : new V3();
    return v.set(p.x + this.position.x, p.y + this.position.y, p.z + this.position.z);
  }
}
class Mat { jete = false; constructor(public p: Record<string, unknown>) {} dispose() { this.jete = true; } }
class Mesh extends Obj { constructor(public geometry: Geo, public material: Mat) { super(); } }
class Inst extends Mesh {
  instanceMatrix = new Attr([], 16); instanceColor: Attr | null = new Attr([], 3);
  matrices: number[][] = []; couleurs: number[][] = [];
  constructor(g: Geo, m: Mat, public count: number) { super(g, m); }
  setMatrixAt(i: number, m: { e: number[] }) { this.matrices[i] = [...m.e]; }
  setColorAt(i: number, c: { r: number; g: number; b: number }) { this.couleurs[i] = [c.r, c.g, c.b]; }
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo, Float32BufferAttribute: Attr, BufferAttribute: Attr, Mesh, InstancedMesh: Inst, Vector3: V3,
    MeshStandardMaterial: Mat, DoubleSide: 2,
    Matrix4: class { e: number[] = []; fromArray(a: number[]) { this.e = a; return this; } },
    Color: class { r = 0; g = 0; b = 0; setRGB(r: number, g: number, b: number) { this.r = r; this.g = g; this.b = b; return this; } },
  };
});

const feuillage = (n = 5): Feuillage => ({ feuilles: Array.from({ length: n }, (_, i) => feuille({ x: i })), taille: 0.2, forme: 'feuille' });
/** Une scene : un arbre (groupe a `x`), son groupe de feuillage, ses feuilles. */
function arbre(scene: Obj, x: number, n = 5) {
  const groupe = new Obj(); groupe.position.set(x, 0, 0);
  const f = new Obj(); f.position.set(0, 3, 0); groupe.add(f); scene.add(groupe);
  return { f, mesh: ajouterFeuilles(f as never, feuillage(n), [0.3, 0.5, 0.2]) as unknown as Inst };
}

describe('la maille de feuilles', () => {
  it('une instance par feuille, cachee au depart, sans ombre, jamais ecartee du champ', () => {
    const { f, mesh } = arbre(new Obj(), 0);
    expect(f.children).toEqual([mesh]);
    expect(mesh.name).toBe(NOM_FEUILLES);
    expect(mesh.count).toBe(5);
    expect(mesh.matrices[2]).toEqual(matriceFeuille(feuille({ x: 2 })));
    expect(mesh.couleurs).toHaveLength(5);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(mesh.instanceColor!.needsUpdate).toBe(true);
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.userData[SANS_OMBRE]).toBe(true);
    expect(mesh.material.p.side).toBe(2);
    expect(ajouterFeuilles(new Obj() as never, { feuilles: [], taille: 0.2, forme: 'feuille' }, [0, 0, 0])).toBeNull();
  });
  it('paraissent quand la camera approche, disparaissent un peu plus loin', () => {
    const scene = new Obj();
    const proche = arbre(scene, 0).mesh;
    const loin = arbre(scene, 200).mesh;
    const camera = { position: { x: 0, y: 3, z: DISTANCE_FEUILLES_M - 1 } };
    expect(actualiserFeuillesProches(scene as never, camera)).toBe(1);
    expect([proche.visible, loin.visible]).toEqual([true, false]);
    // Dans la marge : rien ne bouge ; au-dela : elles disparaissent.
    camera.position.z = DISTANCE_FEUILLES_M + HYSTERESE_FEUILLES_M / 2;
    expect(actualiserFeuillesProches(scene as never, camera)).toBe(0);
    camera.position.z = DISTANCE_FEUILLES_M + HYSTERESE_FEUILLES_M + 1;
    expect(actualiserFeuillesProches(scene as never, camera)).toBe(1);
    expect(proche.visible).toBe(false);
  });
});

describe('cuireFeuillesPourExport', () => {
  it('remplace les feuilles des arbres proches par une maille ordinaire, et remet tout', () => {
    const scene = new Obj();
    const a = arbre(scene, 5, 4);
    const loin = arbre(scene, RAYON_FEUILLES_EXPORT_M + 10, 4);
    a.mesh.visible = true;
    const r = cuireFeuillesPourExport(scene as never);
    expect(r.nombre).toBe(4);
    const cuite = a.f.children.find((c) => c.name === NOM_FEUILLES_CUITES) as Mesh;
    expect(cuite).toBeDefined();
    expect(cuite.geometry.attributes.position!.array).toHaveLength(4 * 4 * 3);
    expect(cuite.geometry.attributes.color!.array).toHaveLength(4 * 4 * 3);
    expect(cuite.material.p.vertexColors).toBe(true);
    expect(a.mesh.visible).toBe(false);
    expect(loin.f.children.some((c) => c.name === NOM_FEUILLES_CUITES)).toBe(false);
    r.remettre();
    r.remettre();
    expect(a.f.children.some((c) => c.name === NOM_FEUILLES_CUITES)).toBe(false);
    expect(a.mesh.visible).toBe(true);
    expect(cuite.geometry.jete).toBe(true);
  });
  it('un caduc nu en hiver ne part pas avec ses feuilles', () => {
    const scene = new Obj();
    const a = arbre(scene, 0, 3);
    a.f.visible = false;
    expect(cuireFeuillesPourExport(scene as never).nombre).toBe(0);
  });
});

describe('ce que l export glTF ecrirait', () => {
  it('rien de volumineux dans userData : l exporteur l ecrit dans le fichier', () => {
    const scene = new Obj();
    const { mesh } = arbre(scene, 0, 50);
    actualiserFeuillesProches(scene as never, { position: { x: 0, y: 0, z: 1 } });
    expect(JSON.stringify(scene.userData)).toBe('{}');
    expect(Object.keys(mesh.userData)).toEqual([SANS_OMBRE]);
  });
});
