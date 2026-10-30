import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ajouterCloture3d, type ContexteCloture3d } from '../../../src/three/cloture3d.js';
import { ajouterClotureVoisinage, type ReglageClotureVoisinage } from '../../../src/three/clotureVoisinage.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { poserAvertissementMotsInconnus } from '../../../src/shell/motsInconnus.js';
import type { ObjetPlan, PtBrut, ReglageCloture, TypeCloture } from '../../../src/model/types.js';

// Une cloture hors catalogue en 3D (three/cloture3d.ts, three/clotureVoisinage.ts) : la couleur et la hauteur se lisaient dans
// `DEFAUTS_PAR_TYPE[type]`, qui ne rendait rien. Elle se dessine maintenant comme une palissade, le fichier reste tel quel.

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo { attributes: Record<string, Attr> = {}; index: number[] = []; setAttribute(n: string, a: Attr) { this.attributes[n] = a; } setIndex(i: number[]) { this.index = i; } computeVertexNormals() {} }
class Mesh { name = ''; userData: Record<string, unknown> = {}; constructor(public geometry: Geo, public material: unknown) {} }
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = { BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh, MeshStandardMaterial: class { constructor(public p: unknown) {} }, DoubleSide: 2 };
});

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); });
afterAll(() => poserAvertissementMotsInconnus(null));

interface Prisme { h: number; couleur: string | number }
function dessiner(type: TypeCloture): Prisme[] {
  const prismes: Prisme[] = [];
  const ctx: ContexteCloture3d = {
    scene: { add: () => {} } as unknown as ContexteCloture3d['scene'], toLocal: (p) => ({ x: p.x, z: -p.y }),
    prim: { addPrism: (pts, _base, h, couleur) => { if (pts) prismes.push({ h, couleur }); } }, textures: false, chargerTexture: () => ({}) as never,
  };
  ajouterCloture3d(ctx, parcelle(type));
  return prismes;
}
const parcelle = (type: TypeCloture): ObjetPlan => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
  cloture: { active: true, defaut: { type, hauteur: 1.8, couleur: '', texture: null } as ReglageCloture, cotes: [], portails: [] },
} as unknown as ObjetPlan);

describe('cloture hors catalogue en 3D', () => {
  it('ne leve pas et se dessine comme une palissade, signalee une fois', () => {
    const GABION = 'gabion' as TypeCloture;
    expect(() => dessiner(GABION)).not.toThrow();
    expect(dessiner(GABION)).toEqual(dessiner('palissade'));
    expect(signaux).toEqual(['Clôture inconnue (« gabion »), dessinée en palissade bois.']);
  });

  it('ne touche pas a la donnee', () => {
    const o = parcelle('gabion' as TypeCloture);
    const avant = JSON.stringify(serializeObjects([o]));
    ajouterCloture3d({ scene: { add: () => {} } as never, toLocal: (p) => ({ x: p.x, z: -p.y }) as never, prim: { addPrism: () => {} }, textures: false, chargerTexture: () => ({}) as never }, o);
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    expect(avant).toContain('"type":"gabion"');
  });

  it('la cloture du voisinage d un type inconnu prend la hauteur de la palissade', () => {
    const limites = [{ a: { x: 0, y: 0 } as PtBrut, b: { x: 10, y: 0 } as PtBrut }];
    const hauteurMax = (m: Mesh | null) => Math.max(...((m?.geometry.attributes.position?.array ?? []).filter((_, i) => i % 3 === 1)));
    const inconnue = ajouterClotureVoisinage({ add: () => {} } as never, (p) => ({ x: p.x, z: -p.y }) as never, limites, undefined, { type: 'gabion', couleur: '#888888' } as unknown as ReglageClotureVoisinage) as unknown as Mesh;
    const palissade = ajouterClotureVoisinage({ add: () => {} } as never, (p) => ({ x: p.x, z: -p.y }) as never, limites, undefined, { type: 'palissade', couleur: '#888888' } as ReglageClotureVoisinage) as unknown as Mesh;
    expect(hauteurMax(inconnue)).toBe(hauteurMax(palissade));
    expect(Number.isFinite(hauteurMax(inconnue))).toBe(true);
  });
});
