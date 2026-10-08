import { describe, it, expect, beforeAll } from 'vitest';
import { ajouterDetailsBatiment, contourDecale, niveaux, abscissesFenetres, DEBORD_TOIT_M, DETAIL_FIN_M, EPAISSEUR_TOIT_M, FENETRE, PORTE } from '../../../src/three/detailsBatiment.js';
import type { ObjetPolygone, PtBrut } from '../../../src/model/types.js';

// Les details d'un batiment en 3D (MD/spec-toit-ign.md §6.3), verifies en structure, comme le releve :
// quelles mailles, combien, a quelle hauteur — avec un THREE minimal qui retient ce qu'on lui donne.

class Attr {
  constructor(public array: number[], public itemSize: number) {}
}
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  groups: { start: number; count: number; materialIndex: number }[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  addGroup(start: number, count: number, materialIndex: number) { this.groups.push({ start, count, materialIndex }); }
  computeVertexNormals() {}
}
class Box extends Geo {
  constructor(public l: number, public h: number, public p: number) { super(); }
}
class Mesh {
  name = '';
  position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  rotation = { y: 0 };
  constructor(public geometry: Geo, public material: unknown) {}
}
class Lignes extends Mesh {}
class Couleur {
  constructor(public c: unknown) {}
  multiplyScalar(k: number) { this.c = String(this.c) + '*' + k; return this; }
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo, Float32BufferAttribute: Attr, BoxGeometry: Box, Mesh, LineSegments: Lignes, Color: Couleur,
    MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} },
    LineBasicMaterial: class { constructor(public p: unknown) {} },
    DoubleSide: 2,
  };
});

const p = (x: number, y: number): PtBrut => ({ x, y });
const maison = (): ObjetPolygone => ({ key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: [p(0, 0), p(12, 0), p(12, 8), p(0, 8)] });

function scene(distance = 0) {
  const ajoutes: Mesh[] = [];
  return { ajoutes, ctx: { scene: { add: (m: Mesh) => ajoutes.push(m) } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#ccc', textures: false, distance } };
}
const noms = (a: Mesh[]) => a.map((m) => m.name).sort();
const ys = (m: Mesh) => m.geometry.attributes.position!.array.filter((_, i) => i % 3 === 1);

describe('contourDecale', () => {
  it('decale un rectangle de la marge, sommet pour sommet, en onglet', () => {
    const d = contourDecale([p(0, 0), p(12, 0), p(12, 8), p(0, 8)], 0.4);
    expect(d).toHaveLength(4);
    expect(d[0]!.x).toBeCloseTo(-0.4, 9);
    expect(d[0]!.y).toBeCloseTo(-0.4, 9);
    expect(d[2]!.x).toBeCloseTo(12.4, 9);
    expect(d[2]!.y).toBeCloseTo(8.4, 9);
    // Dans l'autre sens de parcours, le decalage reste vers l'exterieur.
    const e = contourDecale([p(0, 8), p(12, 8), p(12, 0), p(0, 0)], 0.4);
    expect(e[0]!.y).toBeCloseTo(8.4, 9);
  });
});

describe('niveaux et fenetres', () => {
  it('compte les niveaux d apres la BD TOPO, sinon la hauteur, et aucun sous 2,2 m', () => {
    expect(niveaux(6, 2)).toEqual({ n: 2, hauteur: 3 });
    expect(niveaux(5.6, null)).toEqual({ n: 2, hauteur: 2.8 });
    expect(niveaux(3, null).n).toBe(1);
    expect(niveaux(2, null).n).toBe(0);
    // Trois niveaux annonces sur 5 m : trop bas, on en garde deux.
    expect(niveaux(5, 3).n).toBe(2);
  });
  it('repartit les fenetres a l entraxe, centrees, et n en met pas sur un mur etroit', () => {
    expect(abscissesFenetres(2.5)).toEqual([]);
    expect(abscissesFenetres(12)).toHaveLength(4);
    const xs = abscissesFenetres(12);
    expect(xs[0]! + FENETRE.l / 2).toBeCloseTo(12 - (xs[3]! + FENETRE.l / 2), 9);
  });
});

describe('ajouterDetailsBatiment', () => {
  it('pose debord, gouttiere, aretes, soubassement, ouvertures et cheminee sur une maison a deux pans', () => {
    const { ajoutes, ctx } = scene();
    ajouterDetailsBatiment(ctx, { ...maison(), toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 } }, 6, { etages: 2 });
    expect(noms(ajoutes)).toEqual(['batiment-aretes', 'batiment-cheminee', 'batiment-debord', 'batiment-gouttiere', 'batiment-ouvertures', 'batiment-soubassement']);
    const debord = ajoutes.find((m) => m.name === 'batiment-debord')!;
    // Le dessus du debord descend sous l'egout (6 m) le long des longs murs : 0,4 m a la pente 3/4.
    const y = ys(debord);
    expect(Math.min(...y)).toBeCloseTo(6 - 0.3 - EPAISSEUR_TOIT_M, 6);
    // ... et suit le pignon jusqu'au faitage (9 m).
    expect(Math.max(...y)).toBeCloseTo(9, 6);
    const xs = debord.geometry.attributes.position!.array.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(-DEBORD_TOIT_M, 6);
    expect(Math.max(...xs)).toBeCloseTo(12 + DEBORD_TOIT_M, 6);
    expect(debord.geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    // Deux egouts (les longs murs), pas de gouttiere aux pignons : deux fois trois faces.
    expect(ajoutes.find((m) => m.name === 'batiment-gouttiere')!.geometry.index).toHaveLength(2 * 3 * 6);
    // Les ouvertures : 3 groupes (cadres, vitres, porte) ; une porte au milieu du plus long mur.
    const ouv = ajoutes.find((m) => m.name === 'batiment-ouvertures')!;
    expect(ouv.geometry.groups).toHaveLength(3);
    // Deux niveaux : 4 fenetres sur 12 m, 3 sur 8 m, par mur : 2 x (4 + 4 + 3 + 3) = 28 cadres, dont une porte : 27 vitres + 1 vantail.
    const nQuads = ouv.geometry.index.length / 6;
    expect(nQuads).toBe(28 + 27 + 1);
    expect(Math.max(...ys(ouv))).toBeLessThan(6);
    const cheminee = ajoutes.find((m) => m.name === 'batiment-cheminee')!;
    // Sur le faitage (y = 4 dans le plan, z = -4 en Three), un peu decalee le long de lui.
    expect(cheminee.position.z).toBeCloseTo(-4, 6);
    expect(cheminee.position.x).toBeGreaterThan(6);
    expect(cheminee.position.y).toBeGreaterThan(9);
    expect(ajoutes.find((m) => m.name === 'batiment-soubassement')!.material).toBeDefined();
    expect(Math.max(...ys(ajoutes.find((m) => m.name === 'batiment-aretes')!))).toBeGreaterThan(9);
  });

  it('de loin, ne pose que le debord et les aretes', () => {
    const { ajoutes, ctx } = scene(DETAIL_FIN_M + 1);
    ajouterDetailsBatiment(ctx, { ...maison(), toit: { forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'bdtopo' } }, 6);
    expect(noms(ajoutes)).toEqual(['batiment-aretes', 'batiment-debord']);
  });

  it('un toit plat : pas de debord ni de cheminee, mais les aretes, le soubassement et les fenetres', () => {
    const { ajoutes, ctx } = scene();
    ajouterDetailsBatiment(ctx, { ...maison(), toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } }, 6);
    expect(noms(ajoutes)).toEqual(['batiment-aretes', 'batiment-ouvertures', 'batiment-soubassement']);
  });

  it('ne dessine pas de fenetres sur un mur photographie, ni sur un abri trop bas', () => {
    const { ajoutes, ctx } = scene();
    ajouterDetailsBatiment(ctx, { ...maison(), toit: { forme: 'croupes', hauteur: 2, angleFaitage: 0 } }, 6, { cotesReleves: [0, 1, 2, 3] });
    expect(ajoutes.some((m) => m.name === 'batiment-ouvertures')).toBe(false);
    const abri = scene();
    ajouterDetailsBatiment(abri.ctx, { ...maison(), pts: [p(0, 0), p(3, 0), p(3, 2), p(0, 2)] }, 2);
    expect(noms(abri.ajoutes)).toEqual(['batiment-aretes', 'batiment-soubassement']);
    expect(PORTE.h).toBe(2.1);
  });

  it('ne fait rien sans contour ni hauteur', () => {
    const { ajoutes, ctx } = scene();
    ajouterDetailsBatiment(ctx, { ...maison(), pts: [p(0, 0)] }, 6);
    ajouterDetailsBatiment(ctx, maison(), 0);
    expect(ajoutes).toHaveLength(0);
  });
});
