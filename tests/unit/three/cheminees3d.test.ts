import { describe, it, expect, beforeAll } from 'vitest';
import { facettesCheminee, ajouterCheminees3d, chemineeValide, couleurSouche, NOM_CHEMINEE_SOUCHE, NOM_CHEMINEE_COURONNEMENT, NOM_CHEMINEE_MITRONS, EPAISSEUR_DALLE_M, DEBORD_DALLE_M, ENFONCEMENT_SOUCHE_M, MITRON } from '../../../src/three/cheminees3d.js';
import { hauteurCorpsEn } from '../../../src/facade/toitCorps.js';
import type { Cheminee, CorpsToit, PtBrut } from '../../../src/model/types.js';

// Les souches de cheminee (MD/spec-regles-toits.md §2.6) : leur place selon leur position, leur pied
// qui suit le toit, leur couronnement, et rien de plus pour un corps sans cheminee.

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
/** Un deux-pans de 12 x 8 : faitage le long de x a y = 4, a 8 m ; egouts a 5 m. */
const corps = (cheminees?: Cheminee[]): CorpsToit => ({ pts: [p(0, 0), p(12, 0), p(12, 8), p(0, 8)], posFaitage: 4, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0.1, ...(cheminees ? { cheminees } : {}) });
const souche = (plus: Partial<Cheminee>): Cheminee => ({ x: 6, y: 4, largeurM: 0.6, profondeurM: 0.4, sommetM: 8.6, position: 'faitage', source: 'observation', ...plus });
const zs = (polys: { z: number }[][]) => polys.flat().map((q) => q.z);
const xs = (polys: { x: number }[][]) => polys.flat().map((q) => q.x);
const ys = (polys: { y: number }[][]) => polys.flat().map((q) => q.y);

function scene() {
  const enfants: Mesh[] = [];
  return { enfants, ctx: { scene: { add: (m: Mesh) => enfants.push(m) } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#d8cfc0', textures: false } };
}

describe('facettesCheminee', () => {
  it('au faitage : centree sur la ligne de faitage, quatre faces, une dalle de six faces, sommet au debouche', () => {
    const f = facettesCheminee(corps(), souche({ y: 3.2 }));
    expect(f.souche).toHaveLength(4);
    expect(f.couronnement).toHaveLength(6);
    expect(f.mitrons).toHaveLength(0);
    // Recentree sur y = 4 (le faitage), sa profondeur de part et d'autre.
    expect(Math.min(...ys(f.souche))).toBeCloseTo(3.8, 9);
    expect(Math.max(...ys(f.souche))).toBeCloseTo(4.2, 9);
    expect(Math.max(...zs(f.couronnement))).toBeCloseTo(8.6, 9);
    expect(Math.max(...zs(f.souche))).toBeCloseTo(8.6 - EPAISSEUR_DALLE_M, 9);
    // La dalle deborde de 5 cm de chaque cote.
    expect(Math.max(...xs(f.couronnement)) - Math.max(...xs(f.souche))).toBeCloseTo(DEBORD_DALLE_M, 9);
    // Le pied : sous la couverture aux quatre coins (8 m moins la pente sur 20 cm, moins l'enfoncement).
    expect(Math.min(...zs(f.souche))).toBeCloseTo(8 - (3 / 4) * 0.2 - ENFONCEMENT_SOUCHE_M, 9);
  });

  it('dans un pan : le pied de chaque face suit la pente, a la hauteur du toit sous chaque coin', () => {
    const c = corps();
    const f = facettesCheminee(c, souche({ position: 'pan', x: 3, y: 1.5, sommetM: 8.4 }));
    expect(f.souche).toHaveLength(4);
    for (const face of f.souche) {
      for (const q of face.slice(0, 2)) expect(q.z).toBeCloseTo(hauteurCorpsEn(c, 12, 8, q.x, q.y) - ENFONCEMENT_SOUCHE_M, 9);
      // Le haut est horizontal.
      expect(face[2]!.z).toBeCloseTo(face[3]!.z, 9);
    }
    // Les faces en travers du pan ont un pied incline : le bas suit la pente.
    expect(f.souche.filter((face) => Math.abs(face[0]!.z - face[1]!.z) > 0.1)).toHaveLength(2);
  });

  it('dans un pignon : au nu du mur de bout', () => {
    const f = facettesCheminee(corps(), souche({ position: 'pignon', x: -0.2, y: 3, sommetM: 9 }));
    expect(Math.min(...xs(f.souche))).toBeCloseTo(0, 9);
    expect(Math.max(...xs(f.souche))).toBeCloseTo(0.6, 9);
  });

  it('adossee en facade : du sol au sommet, contre le mur exterieur, la largeur le long du mur', () => {
    const f = facettesCheminee(corps(), souche({ position: 'facade', x: 3, y: -0.1, largeurM: 1, profondeurM: 0.5, sommetM: 8.8 }));
    expect(f.souche).toHaveLength(4);
    expect(Math.min(...zs(f.souche))).toBe(0);
    expect(Math.max(...zs(f.couronnement))).toBeCloseTo(8.8, 9);
    // Hors du corps, collee au mur y = 0 : de y = -0,5 a 0.
    expect(Math.min(...ys(f.souche))).toBeCloseTo(-0.5, 9);
    expect(Math.max(...ys(f.souche))).toBeCloseTo(0, 9);
    expect(Math.max(...xs(f.souche)) - Math.min(...xs(f.souche))).toBeCloseTo(1, 9);
    // Sur un mur de bout, elle sort de ce mur.
    const bout = facettesCheminee(corps(), souche({ position: 'facade', x: 12.3, y: 6, largeurM: 1, profondeurM: 0.5 }));
    expect(Math.min(...xs(bout.souche))).toBeCloseTo(12, 9);
    expect(Math.max(...xs(bout.souche))).toBeCloseTo(12.5, 9);
    // Sur un terrain en pente, du plus bas des quatre coins.
    const enPente = facettesCheminee(corps(), souche({ position: 'facade', x: 3, y: -0.1 }), (q) => -0.1 * q.x);
    expect(Math.min(...zs(enPente.souche))).toBeCloseTo(-0.33, 9);
  });

  it('des mitrons, un par conduit, alignes dans le sens de la souche', () => {
    const f = facettesCheminee(corps(), souche({ largeurM: 1.2, conduits: 3, couronnement: 'mitrons' }));
    expect(f.mitrons).toHaveLength(12);
    expect(Math.max(...zs(f.mitrons))).toBeCloseTo(8.6 + MITRON.hauteur, 9);
    // Quatre faces par mitron : leurs centres, espaces regulierement le long des 1,2 m.
    const centres = [0, 1, 2].map((i) => { const x = xs(f.mitrons.slice(4 * i, 4 * i + 4)); return (Math.min(...x) + Math.max(...x)) / 2; });
    expect(centres[0]).toBeCloseTo(5.6, 9);
    expect(centres[1]).toBeCloseTo(6, 9);
    expect(centres[2]).toBeCloseTo(6.4, 9);
  });

  it('un tubage metallique : pas de dalle, un dessus a la souche', () => {
    const f = facettesCheminee(corps(), souche({ materiau: 'metal', largeurM: 0.2, profondeurM: 0.2 }));
    expect(f.couronnement).toHaveLength(0);
    expect(f.souche).toHaveLength(5);
    expect(Math.max(...zs(f.souche))).toBeCloseTo(8.6, 9);
  });

  it('rien pour une souche incoherente : sommet sous le toit, section nulle, nombre absent', () => {
    expect(facettesCheminee(corps(), souche({ sommetM: 7.5 })).souche).toHaveLength(0);
    expect(facettesCheminee(corps(), souche({ largeurM: 0 })).souche).toHaveLength(0);
    expect(chemineeValide({ ...souche({}), x: Number.NaN })).toBe(false);
    expect(chemineeValide(null)).toBe(false);
  });

  it('la couleur suit le materiau, sinon celle des murs', () => {
    expect(couleurSouche({ materiau: 'brique' }, '#fff')).toBe(0x8a5a44);
    expect(couleurSouche({}, '#fff')).toBe('#fff');
    expect(couleurSouche({ materiau: 'enduit' }, '#eee')).toBe('#eee');
  });
});

describe('ajouterCheminees3d', () => {
  it('un corps sans cheminee ne pose rien', () => {
    const { enfants, ctx } = scene();
    expect(ajouterCheminees3d(ctx, [corps()])).toEqual({ souches: 0 });
    expect(enfants).toHaveLength(0);
  });

  it('pose la souche, sa dalle et ses mitrons, chacun sa maille', () => {
    const { enfants, ctx } = scene();
    const r = ajouterCheminees3d(ctx, [corps([souche({ couronnement: 'mitrons', conduits: 2 }), souche({ position: 'pan', x: 9, y: 6, materiau: 'brique', sommetM: 8.5 })])]);
    expect(r.souches).toBe(2);
    expect(enfants.map((m) => m.name)).toEqual([NOM_CHEMINEE_SOUCHE, NOM_CHEMINEE_COURONNEMENT, NOM_CHEMINEE_MITRONS, NOM_CHEMINEE_SOUCHE, NOM_CHEMINEE_COURONNEMENT]);
    // Quatre faces de deux triangles pour la souche.
    expect(enfants[0]!.geometry.index).toHaveLength(4 * 2 * 3);
    expect(enfants[3]!.material.p.color).toBe(0x8a5a44);
  });
});
