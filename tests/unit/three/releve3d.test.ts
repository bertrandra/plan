import { describe, it, expect, beforeAll } from 'vitest';
import { ajouterReleve3d } from '../../../src/three/releve3d.js';
import type { ObjetPolygone } from '../../../src/model/types.js';

// Un THREE minimal : chaque classe retient ce qu'on lui donne, la scene compte ce qu'on lui ajoute.
// Ce qu'on verifie ici n'est pas le rendu mais la structure : combien de mailles, lesquelles, et
// qu'un batiment sans releve n'en ajoute aucune (fumee, point 24 : structure du GLB).
class Attr {
  constructor(public array: number[], public itemSize: number) {}
}
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  setAttribute(n: string, a: Attr) {
    this.attributes[n] = a;
  }
  setIndex(i: number[]) {
    this.index = i;
  }
  computeVertexNormals() {}
}
class Mesh {
  name = '';
  position = { set() {} };
  rotation = { y: 0 };
  constructor(
    public geometry: Geo,
    public material: unknown,
  ) {}
}
class Box extends Geo {}

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo,
    Float32BufferAttribute: Attr,
    BoxGeometry: Box,
    Mesh,
    MeshStandardMaterial: class {
      constructor(public p: unknown) {}
    },
    TextureLoader: class {
      load() {
        return { anisotropy: 1 };
      }
    },
    DoubleSide: 2,
  };
});

const maison = (): ObjetPolygone => ({
  key: 'maison',
  name: 'Maison',
  type: 'polygon',
  fonction: 'batiment',
  pts: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 0, y: 6 },
  ],
});

function scene() {
  const ajoutes: Mesh[] = [];
  return { ajoutes, ctx: { scene: { add: (m: Mesh) => ajoutes.push(m) } as never, toLocal: (p: { x: number; y: number }) => ({ x: p.x, z: -p.y }), couleurMur: '#ccc', textures: true } };
}

describe('ajouterReleve3d', () => {
  it("n'ajoute rien a un batiment sans releve", () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(ctx, maison(), 3);
    expect(ajoutes).toHaveLength(0);
  });

  it('pose un toit a deux pans et ses deux pignons', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(ctx, { ...maison(), toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 } }, 3);
    expect(ajoutes.map((m) => m.name).sort()).toEqual(['releve-pignon', 'releve-pignon', 'releve-toit', 'releve-toit']);
    // Le faitage est a 3 m au-dessus de l'egout (3 m) : aucun sommet de toit au-dela de 6 m.
    const ys = ajoutes.filter((m) => m.name === 'releve-toit').flatMap((m) => m.geometry.attributes.position!.array.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(6, 9);
    expect(Math.min(...ys)).toBeCloseTo(3, 9);
  });

  it('pose la couverture d un toit-terrasse, de sa couleur, en retrait des murs', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(ctx, { ...maison(), toit: { forme: 'plat', hauteur: 0, angleFaitage: 0, couleur: '#8a8580', origineCouleur: 'orthophoto' } }, 3);
    expect(ajoutes.map((m) => m.name)).toEqual(['releve-toit-plat']);
    const plat = ajoutes[0]!;
    expect((plat.material as { p: { color: string } }).p.color).toBe('#8a8580');
    const pos = plat.geometry.attributes.position!.array;
    const xs = pos.filter((_, i) => i % 3 === 0), ys = pos.filter((_, i) => i % 3 === 1);
    // 20 cm en retrait des murs (0 a 10 m), 2 cm au-dessus du dessus du prisme (3 m).
    expect(Math.min(...xs)).toBeCloseTo(0.2, 6);
    expect(Math.max(...xs)).toBeCloseTo(9.8, 6);
    expect(ys.every((y) => Math.abs(y - 3.02) < 1e-9)).toBe(true);
    // Rabattu sur une tuile par une lecture d'avant : gris.
    const r = scene();
    ajouterReleve3d(r.ctx, { ...maison(), toit: { forme: 'plat', hauteur: 0, angleFaitage: 0, couleur: '#B0432F', origineCouleur: 'rouge' } }, 3);
    expect((r.ajoutes[0]!.material as { p: { color: string } }).p.color).toBe('#6F7275');
  });

  it('pose un toit a croupes, sans pignon (spec-toit-ign)', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(ctx, { ...maison(), toit: { forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'bdtopo' } }, 3);
    const toits = ajoutes.filter((m) => m.name === 'releve-toit');
    expect(toits.length).toBeGreaterThanOrEqual(4);
    expect(ajoutes.some((m) => m.name === 'releve-pignon')).toBe(false);
    const ys = toits.flatMap((m) => m.geometry.attributes.position!.array.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeLessThanOrEqual(6 + 1e-9);
    expect(Math.min(...ys)).toBeCloseTo(3, 9);
  });

  it('plaque la photo sur le mur jusqu a l egout et sur son pignon au-dessus', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(
      ctx,
      {
        ...maison(),
        toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 },
        facades: [{ cote: 1, largeur: 6, hauteur: 3, texture: 'data:image/jpeg;base64,AA', hauteurTexture: 6, ouvertures: [], distance: 3, sourceDistance: 'cadrage', releveLe: '' }],
      },
      3,
    );
    const mur = ajoutes.find((m) => m.name === 'releve-facade')!;
    // Le mur prend la moitie basse de la texture (3 m sur 6).
    expect(mur.geometry.attributes.uv!.array).toEqual([0, 0, 1, 0, 1, 0.5, 0, 0.5]);
    // Le pignon est du cote 1 (est) : il porte des coordonnees de texture, l'autre non.
    const pignons = ajoutes.filter((m) => m.name === 'releve-pignon');
    expect(pignons.filter((m) => m.geometry.attributes.uv)).toHaveLength(1);
    const v = pignons.find((m) => m.geometry.attributes.uv)!.geometry.attributes.uv!.array.filter((_, i) => i % 2 === 1);
    expect(Math.max(...v)).toBeCloseTo(1, 9); // le faite, en haut de la texture
    expect(Math.min(...v)).toBeCloseTo(0.5, 9); // l'egout
  });

  it('encadre chaque ouverture, et vitre celles qui n ont pas de photo', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(
      ctx,
      {
        ...maison(),
        facades: [
          {
            cote: 0,
            largeur: 10,
            hauteur: 3,
            texture: null,
            ouvertures: [
              { type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.35 },
              { type: 'porte', x: 4, y: 0, l: 0.9, h: 2.15 },
              { type: 'fenetre', x: 9.5, y: 1, l: 1.2, h: 1 }, // deborde du mur : omise
            ],
            distance: null,
            sourceDistance: null,
            releveLe: '',
          },
        ],
      },
      3,
    );
    // Fenetre : linteau, deux montants, appui, vitre = 5 ; porte : linteau, deux montants, vantail = 4.
    expect(ajoutes).toHaveLength(9);
  });
});

const p = (x: number, y: number) => ({ x, y });

describe('ajouterReleve3d, mur en L', () => {
  // Maison 6 x 8 m et garage 4 x 5 m a l'est, moins profond ; facade sud (cote 0) relevee en L.
  const L = { key: 'maison', name: 'Maison', type: 'polygon' as const, fonction: 'batiment', pts: [p(0, 0), p(10, 0), p(10, 5), p(6, 5), p(6, 8), p(0, 8)] };
  const releveL = {
    cote: 0,
    largeur: 10,
    hauteur: 6,
    texture: 'data:image/jpeg;base64,AA',
    hauteurTexture: 9,
    ouvertures: [
      { type: 'fenetre' as const, x: 1, y: 3.8, l: 1.2, h: 1.2 },
      { type: 'garage' as const, x: 7, y: 0, l: 2.4, h: 2.1 },
      { type: 'fenetre' as const, x: 7, y: 3.8, l: 1.2, h: 1.2 }, // au-dessus du garage : dans le vide
    ],
    distance: 12,
    sourceDistance: 'lidar' as const,
    releveLe: '',
    partieBasse: { debut: 6, fin: 10, hauteur: 3 },
  };

  it('pose la photo en L, et omet ce qui depasse de la partie basse', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(ctx, { ...L, facades: [releveL] }, 6);
    const mur = ajoutes.find((m) => m.name === 'releve-facade')!;
    expect(mur.geometry.attributes.position!.array).toHaveLength(6 * 3);
    // Fenetre haute : 4 pieces d'encadrement ; garage : 3 ; la fenetre dans le vide : aucune.
    expect(ajoutes.filter((m) => m.name === '')).toHaveLength(7);
  });

  it('coiffe la partie haute seulement', () => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d(ctx, { ...L, facades: [releveL], toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 90 } }, 6);
    const xs = ajoutes.filter((m) => m.name === 'releve-toit').flatMap((m) => m.geometry.attributes.position!.array.filter((_, i) => i % 3 === 0));
    // Repere local de ce test : x du plan tel quel. Aucun pan au-dela de la maison (x > 6).
    expect(Math.max(...xs)).toBeLessThanOrEqual(6 + 1e-9);
  });
});
