import { describe, it, expect, beforeAll } from 'vitest';
import { ajouterArbre3d, actualiserSaison, tonDuSommet, NOM_ARBRE, NOM_BRANCHE, NOM_FEUILLAGE, NOM_LOBE, NOM_TRONC, TON_CLAIR, TON_SOMBRE, COULEUR_TRONC_MAQUETTE } from '../../../src/three/arbre3d.js';
import { couleurMaquette } from '../../../src/three/houppiers3d.js';
import type { StyleArbre } from '../../../src/model/arbre.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Un arbre en 3D (MD/spec-arbres-3d.md), verifie en structure avec un THREE minimal : quelles
// mailles, ou, visibles ou non selon la date.

class Attr {
  needsUpdate = false;
  constructor(public array: Float32Array | number[], public itemSize: number) {}
}
class Geo {
  attributes: Record<string, Attr> = {};
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex() {}
}
/** Une « sphere » de trois sommets : un en haut, un en bas, un a l'equateur. */
class Sphere extends Geo {
  constructor(public r: number, public w: number, public h: number) {
    super();
    this.attributes.position = new Attr(new Float32Array([0, 1, 0, 0, -1, 0, 1, 0, 0]), 3);
    this.attributes.normal = new Attr(new Float32Array([0, 1, 0, 0, -1, 0, 1, 0, 0]), 3);
  }
}
class Cone extends Sphere {
  constructor(public rc: number, public hauteur: number) { super(rc, 16, 1); }
}
class Ico extends Sphere {
  constructor(rIco: number, public detail: number) { super(rIco, 0, 0); }
  toNonIndexed() { return this; }
}
class Cyl extends Geo {
  constructor(public rHaut: number, public rBas: number, public hauteur: number) { super(); }
}
class Obj {
  name = '';
  visible = true;
  parent: Obj | null = null;
  children: Obj[] = [];
  userData: Record<string, unknown> = {};
  position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  scale = { x: 1, y: 1, z: 1, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  rotation = { x: 0, y: 0, z: 0 };
  quaternion = { x: 0, y: 0, z: 0, w: 1, set(x: number, y: number, z: number, w: number) { this.x = x; this.y = y; this.z = z; this.w = w; } };
  add(o: Obj) { o.parent = this; this.children.push(o); }
  traverse(f: (o: Obj) => void) { f(this); this.children.forEach((c) => c.traverse(f)); }
}
class Mesh extends Obj {
  constructor(public geometry: Geo, public material: { p: Record<string, unknown> }) { super(); }
}
class Mat { map: unknown; constructor(public p: Record<string, unknown>) {} }
class Inst extends Mesh {
  instanceMatrix = { needsUpdate: false }; instanceColor = { needsUpdate: false }; frustumCulled = true;
  constructor(g: Geo, m: Mat, public count: number) { super(g, m as never); }
  setMatrixAt() {}
  setColorAt() {}
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    Group: Obj, Mesh, SphereGeometry: Sphere, ConeGeometry: Cone, IcosahedronGeometry: Ico, CylinderGeometry: Cyl, Float32BufferAttribute: Attr, MeshStandardMaterial: Mat,
    BufferGeometry: Geo, InstancedMesh: Inst, DoubleSide: 2,
    Matrix4: class { fromArray() { return this; } },
    Color: class { setRGB() { return this; } },
  };
});

const arbre = (extra: Partial<ObjetPlan> = {}): ObjetPlan => ({ key: 'arbre-1', name: 'Arbre', type: 'circle', fonction: 'arbre', center: { x: 10, y: -5 }, r: 0.4, diametreArbre: 4, ...extra } as ObjetPlan);
// Les tests de ajouterArbre3d decrivent le dessin en lobes (A) ; les autres dessins ont les leurs plus bas.
function scene(dateStr: string | null = '2026-07-01', textures = false, style: StyleArbre | null = 'actuel') {
  const racine = new Obj();
  return { racine, ctx: { scene: racine as never, toLocal: (q: { x: number; y: number }) => ({ x: q.x, z: -q.y }), textures, dateStr, ...(style ? { style } : {}) } };
}
const parNom = (o: Obj, nom: string): Obj[] => { const r: Obj[] = []; o.traverse((c) => { if (c.name === nom) r.push(c); }); return r; };

describe('ajouterArbre3d', () => {
  it('pose un tronc, des branches et un houppier en lobes a la place de l arbre, au sommet du tronc', () => {
    const { racine, ctx } = scene();
    const g = ajouterArbre3d(ctx, arbre(), 2.5, 0.4) as unknown as Obj;
    expect(racine.children).toEqual([g]);
    expect(g.name).toBe(NOM_ARBRE);
    expect(g.position).toMatchObject({ x: 10, y: 0, z: 5 });
    expect(g.userData.essence).toBe('caduc');
    const tronc = parNom(g, NOM_TRONC)[0] as Mesh;
    expect((tronc.geometry as Cyl).hauteur).toBe(2.5);
    expect((tronc.geometry as Cyl).rBas).toBe(0.4);
    expect(tronc.position.y).toBe(1.25);
    expect(parNom(g, NOM_BRANCHE)).toHaveLength(6);
    const feuillage = parNom(g, NOM_FEUILLAGE)[0]!;
    expect(feuillage.position.y).toBe(2.5);
    expect(feuillage.visible).toBe(true);
    const lobes = parNom(g, NOM_LOBE) as Mesh[];
    expect(lobes).toHaveLength(7);
    // De pres, des feuilles instanciees sur les lobes, dans le feuillage (cachees jusqu'a ce que la camera approche).
    const feuilles = parNom(g, 'arbre-feuilles') as Inst[];
    expect(feuilles).toHaveLength(1);
    expect(feuilles[0]!.parent).toBe(feuillage);
    expect(feuilles[0]!.count).toBeGreaterThan(100);
    // Chaque lobe est une sphere unite mise a l'echelle de l'ellipsoide, et coloree en deux tons.
    expect(lobes[0]!.scale.y).toBeCloseTo(2, 9);
    expect(lobes[0]!.geometry.attributes.color!.array).toHaveLength(9);
    expect(lobes[0]!.geometry.attributes.position!.needsUpdate).toBe(true);
    expect((lobes[0]!.material as unknown as Mat).p.vertexColors).toBe(true);
  });
  it('un conifere est un cone, sans branche ; un caduc est nu en janvier, un persistant non', () => {
    const { ctx } = scene('2027-01-10');
    const g = ajouterArbre3d(ctx, arbre({ portArbre: 'conique', essenceArbre: 'persistant' }), 1, 0.3) as unknown as Obj;
    const lobes = parNom(g, NOM_LOBE) as Mesh[];
    expect(lobes).toHaveLength(1);
    expect(lobes[0]!.geometry).toBeInstanceOf(Cone);
    expect(parNom(g, NOM_BRANCHE)).toHaveLength(0);
    expect(parNom(g, NOM_FEUILLAGE)[0]!.visible).toBe(true);
    const nu = ajouterArbre3d(ctx, arbre({ key: 'arbre-2' }), 1, 0.3) as unknown as Obj;
    expect(parNom(nu, NOM_FEUILLAGE)[0]!.visible).toBe(false);
    expect(parNom(nu, NOM_BRANCHE).length).toBeGreaterThan(0);
  });
  it('le meme arbre donne les memes lobes a chaque construction', () => {
    const a = ajouterArbre3d(scene().ctx, arbre(), 2, 0.4) as unknown as Obj;
    const b = ajouterArbre3d(scene().ctx, arbre(), 2, 0.4) as unknown as Obj;
    const positions = (g: Obj) => (parNom(g, NOM_LOBE) as Mesh[]).map((m) => [m.position.x, m.position.y, m.position.z, ...Array.from(m.geometry.attributes.position!.array)]);
    expect(positions(a)).toEqual(positions(b));
  });
  it('la texture du feuillage n est chargee qu avec les textures', () => {
    const charges: string[] = [];
    const o = arbre({ textureArbre: { id: 't', nom: 't', vignette: '', url: 'https://dl.polyhaven.org/t.jpg' } as never });
    ajouterArbre3d({ ...scene('2026-07-01', true).ctx, chargerTexture: (u: string) => { charges.push(u); return {} as never; } }, o, 2, 0.4);
    ajouterArbre3d({ ...scene('2026-07-01', false).ctx, chargerTexture: (u: string) => { charges.push(u); return {} as never; } }, o, 2, 0.4);
    expect(charges).toEqual(['https://dl.polyhaven.org/t.jpg']);
  });
});

describe('actualiserSaison et tons', () => {
  it('masque le feuillage des caducs en hiver et le rend au printemps', () => {
    const { racine, ctx } = scene('2026-07-01');
    ajouterArbre3d(ctx, arbre(), 2, 0.4);
    ajouterArbre3d(ctx, arbre({ key: 'p', essenceArbre: 'persistant' }), 2, 0.4);
    expect(actualiserSaison(racine as never, '2026-12-01')).toBe(1);
    expect(parNom(racine, NOM_FEUILLAGE).map((f) => f.visible)).toEqual([false, true]);
    expect(actualiserSaison(racine as never, '2026-12-15')).toBe(0);
    expect(actualiserSaison(racine as never, '2027-04-01')).toBe(1);
    expect(parNom(racine, NOM_FEUILLAGE).every((f) => f.visible)).toBe(true);
  });
  it('tonDuSommet : clair dessus, sombre dessous, jamais au-dela de 1', () => {
    expect(tonDuSommet([0.5, 0.5, 0.5], 1)).toEqual([0.5 * TON_CLAIR, 0.5 * TON_CLAIR, 0.5 * TON_CLAIR]);
    expect(tonDuSommet([0.5, 0.5, 0.5], -1)).toEqual([0.5 * TON_SOMBRE, 0.5 * TON_SOMBRE, 0.5 * TON_SOMBRE]);
    expect(tonDuSommet([0.9, 0.9, 0.9], 1)[0]).toBe(1);
  });
});

describe('les cinq dessins du houppier', () => {
  const feuilles = (g: Obj) => parNom(g, 'arbre-feuilles');
  it('E, maquette d architecte : un volume lisse et uni, un tronc fin qui entre dans le houppier, ni branche ni feuille', () => {
    const { ctx } = scene('2026-07-01', false, 'architecte');
    const g = ajouterArbre3d(ctx, arbre(), 2.5, 0.4) as unknown as Obj;
    expect(g.userData.style).toBe('architecte');
    const lobes = parNom(g, NOM_LOBE) as Mesh[];
    expect(lobes).toHaveLength(1);
    expect(lobes[0]!.scale.x).toBeCloseTo(4 / 2 * 0.95, 9);
    expect(lobes[0]!.scale.y).toBeCloseTo(2, 9);
    expect(parNom(g, NOM_BRANCHE)).toHaveLength(0);
    expect(feuilles(g)).toHaveLength(0);
    const tronc = parNom(g, NOM_TRONC)[0] as Mesh;
    expect((tronc.geometry as Cyl).rBas).toBeCloseTo(0.1, 9);
    expect((tronc.geometry as Cyl).hauteur).toBeGreaterThan(2.5);
    expect((tronc.material as unknown as Mat).p.color).toBe(COULEUR_TRONC_MAQUETTE);
    // Le vert du feuillage, tire vers le vert doux des maquettes.
    const doux = couleurMaquette([0x4a / 255, 0x7c / 255, 0x3a / 255]);
    expect(doux[0]).toBeGreaterThan(0x4a / 255);
    expect(doux[1]).toBeGreaterThan(0x7c / 255);
  });
  it('par defaut, B, Dome : les lobes et leurs branches, sans satellite au-dessus du houppier', () => {
    const g = ajouterArbre3d(scene('2026-07-01', false, null).ctx, arbre(), 2.5, 0.4) as unknown as Obj;
    expect(g.userData.style).toBe('dome');
    const lobes = parNom(g, NOM_LOBE) as Mesh[];
    expect(lobes).toHaveLength(7);
    expect(parNom(g, NOM_BRANCHE)).toHaveLength(6);
    expect(feuilles(g)).toHaveLength(1);
    const central = lobes[0]!;
    const haut = central.position.y + central.scale.y;
    for (const l of lobes.slice(1)) expect(l.position.y + l.scale.y).toBeLessThanOrEqual(haut * 1.04 + 1e-9);
  });
  it('C, Touffes : un coeur et des touffes fusionnees en une seule maille ; D, Taille : au plus cinq volumes a facettes', () => {
    const c = ajouterArbre3d(scene('2026-07-01', false, 'touffes').ctx, arbre(), 2.5, 0.4) as unknown as Obj;
    const lobes = parNom(c, NOM_LOBE) as Mesh[];
    expect(lobes).toHaveLength(2);
    expect(lobes[1]!.geometry.attributes.position!.array.length).toBeGreaterThan(9 * 10);
    expect(lobes[1]!.geometry.attributes.color!.array.length).toBe(lobes[1]!.geometry.attributes.position!.array.length);
    expect(parNom(c, NOM_BRANCHE)).toHaveLength(0);
    const d = ajouterArbre3d(scene('2026-07-01', false, 'taille').ctx, arbre(), 2.5, 0.4) as unknown as Obj;
    const volumes = parNom(d, NOM_LOBE) as Mesh[];
    expect(volumes.length).toBeGreaterThan(1);
    expect(volumes.length).toBeLessThanOrEqual(5);
    expect((volumes[0]!.material as unknown as Mat).p.flatShading).toBe(true);
    expect(volumes[0]!.geometry).toBeInstanceOf(Ico);
  });
  it('un conifere reste un cone dans tous les dessins, et le caduc perd son feuillage en hiver', () => {
    for (const style of ['actuel', 'dome', 'taille', 'architecte'] as StyleArbre[]) {
      const g = ajouterArbre3d(scene('2027-01-10', false, style).ctx, arbre({ portArbre: 'conique' }), 1, 0.3) as unknown as Obj;
      const lobes = parNom(g, NOM_LOBE) as Mesh[];
      expect(lobes).toHaveLength(1);
      expect(lobes[0]!.geometry).toBeInstanceOf(Cone);
      expect(parNom(g, NOM_FEUILLAGE)[0]!.visible).toBe(false);
    }
  });
});
