import { describe, it, expect, beforeAll } from 'vitest';
import { poserDetailsOuvertures, DETAILS_OUVERTURE } from '../../../src/three/detailsOuvertures.js';
import { poserModenature, MODENATURE_3D } from '../../../src/three/modenature3d.js';
import { menuiserieDe } from '../../../src/three/releve3d.js';
import { ajouterEquipementJardin } from '../../../src/three/jardin3d.js';
import { facadesDuContour } from '../../../src/geometry/cotesVusDeDehors.js';
import type { DetailsOuverture, OuvertureFacade, PtBrut } from '../../../src/model/types.js';

// Le dessin de la facade enrichie (lot L1, decision 14) : garde-corps par type et par couleur, menuiseries colorees, modenature lue,
// store, equipements de la facade. Un fichier sans champ nouveau se dessine exactement comme avant (les groupes d'avant, rien de plus).

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  groups: { start: number; count: number; materialIndex: number }[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  addGroup(start: number, count: number, materialIndex: number) { this.groups.push({ start, count, materialIndex }); }
  computeVertexNormals() {}
  rotateX() { return this; }
}
class Mesh {
  name = '';
  position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  rotation = { y: 0, z: 0 };
  constructor(public geometry: Geo, public material: unknown) {}
}
class Couleur { constructor(public c: unknown) {} }
class Forme { moveTo() {} lineTo() {} }

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh, Color: Couleur, Shape: Forme, ExtrudeGeometry: Geo, CylinderGeometry: Geo,
    MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} },
    DoubleSide: 2,
  };
});

const p = (x: number, y: number): PtBrut => ({ x, y });
const contour = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
const mur = () => facadesDuContour(contour, 6).find((f) => f.cote === 0)!;
function scene() {
  const ajoutes: Mesh[] = [];
  return { ajoutes, ctx: { scene: { add: (m: Mesh) => ajoutes.push(m) } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }) } };
}
const baie = (details: DetailsOuverture): OuvertureFacade => ({ type: 'fenetre', x: 4, y: 3.5, l: 1.2, h: 1.35, details });
const poser = (o: OuvertureFacade) => { const { ajoutes, ctx } = scene(); poserDetailsOuvertures(ctx, [{ f: mur(), o, hMur: 6, cadre: 0.06 }]); return ajoutes; };
const materiaux = (m: Mesh) => m.material as { p: Record<string, unknown> }[];

describe('les garde-corps lus', () => {
  it('sans lecture, les barreaux d avant dans leur groupe (3) ; lus en barreaux sans couleur, les memes', () => {
    const avant = poser(baie({ allege: 'garde-corps' }))[0]!;
    expect(avant.geometry.groups.map((g) => g.materialIndex)).toEqual([3]);
    const barreaux = poser(baie({ allege: 'garde-corps', gardeCorps: { type: 'barreaux', source: 'ia' } }))[0]!;
    expect(barreaux.geometry.groups).toEqual(avant.geometry.groups);
    expect(barreaux.geometry.attributes.position!.array).toEqual(avant.geometry.attributes.position!.array);
  });

  it('un fer forge noir : son materiau apres les groupes d avant, plus de pieces que des barreaux, a sa hauteur calee', () => {
    const [m] = poser(baie({ allege: 'garde-corps', gardeCorps: { type: 'fer-forge', hauteurM: 1.1, couleur: '#2e3033', source: 'ia' } }));
    expect(m!.geometry.groups.map((g) => g.materialIndex)).toEqual([4]);
    expect((materiaux(m!)[4]!.p.color as Couleur).c).toBe('#2e3033');
    const ys = m!.geometry.attributes.position!.array.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(3.5 + 1.1, 6);
    const barreaux = poser(baie({ allege: 'garde-corps' }))[0]!;
    expect(m!.geometry.index.length).toBeGreaterThan(barreaux.geometry.index.length);
  });

  it('un garde-corps en verre : sa lisse, et un vitrage transparent dans un groupe a lui ; un plein : un muret mince', () => {
    const [v] = poser(baie({ allege: 'garde-corps', gardeCorps: { type: 'verre', source: 'ia' } }));
    expect(v!.geometry.groups.map((g) => g.materialIndex)).toEqual([4, 5]);
    expect(materiaux(v!)[5]!.p).toMatchObject({ transparent: true });
    const [pl] = poser(baie({ allege: 'garde-corps', gardeCorps: { type: 'plein', source: 'ia' } }));
    expect(pl!.geometry.groups.map((g) => g.materialIndex)).toEqual([4]);
    expect(DETAILS_OUVERTURE.gardeCorps.hauteur).toBe(1);
  });
});

describe('les menuiseries lues', () => {
  it('la couleur et le grain lus ; sans lecture, le cadre clair d avant', () => {
    expect(menuiserieDe({})).toEqual({ color: 0xf1eee6, roughness: 0.6 });
    expect(menuiserieDe({ details: { menuiserie: { materiau: 'alu', couleur: '#3b3f42', source: 'ia' } } })).toEqual({ color: '#3b3f42', roughness: 0.35, metalness: 0.4 });
    expect(menuiserieDe({ details: { menuiserie: { materiau: 'bois', source: 'ia' } } })).toEqual({ color: 0xf1eee6, roughness: 0.75 });
  });
});

describe('la modenature lue et le store', () => {
  it('rien sans modenature ni store : aucune maille', () => {
    const { ajoutes, ctx } = scene();
    expect(poserModenature(ctx, mur(), {}, 6, [])).toBe(0);
    expect(ajoutes).toHaveLength(0);
  });

  it('une genoise, un bandeau a sa hauteur, interrompu au droit d une baie, une descente et un store, une maille', () => {
    const { ajoutes, ctx } = scene();
    const b = baie({});
    const n = poserModenature(ctx, mur(), { modenature: { egout: 'genoise', rangsGenoise: 2, bandeauxM: [4], descentesM: [11.9], source: 'ia' }, appendices: [{ nature: 'store', xM: 1, largeurM: 2, hauteurM: 2.6, source: 'ia' }] }, 6, [b]);
    expect(n).toBe(1);
    const [m] = ajoutes;
    expect(m!.name).toBe('releve-modenature');
    // Tuile, pierre, zinc, caisson, toile : un materiau par matiere.
    expect(materiaux(m!).length).toBe(5);
    const a = m!.geometry.attributes.position!.array;
    const pts = Array.from({ length: a.length / 3 }, (_, i) => ({ x: a[3 * i]!, y: a[3 * i + 1]! }));
    // La genoise : deux rangs sous l'egout ; le bandeau a 4 m ne passe pas devant la baie (de 4 a 5,2 m le long du mur).
    expect(Math.min(...pts.filter((q) => q.y > 5.8).map((q) => q.y))).toBeCloseTo(6 - 2 * MODENATURE_3D.rangGenoise.hauteur, 6);
    expect(pts.some((q) => Math.abs(q.y - 4.06) < 1e-6 && q.x > 4 && q.x < 5.2)).toBe(false);
  });
});

describe('les equipements de la facade', () => {
  const emprise = [p(0, 0), p(1, 0), p(1, -0.9), p(0, -0.9)];
  it('un perron de trois marches : trois paves, chacun moins profond que celui du dessous', () => {
    const g = { enfants: [] as Mesh[], add(m: Mesh) { this.enfants.push(m); } };
    expect(ajouterEquipementJardin(g as never, (q) => ({ x: q.x, z: -q.y }), 'perron', emprise, 0.51)).toBe(3);
    expect(g.enfants.map((m) => m.name)).toEqual(['perron-marche', 'perron-marche', 'perron-marche']);
    expect(g.enfants.map((m) => Math.round(m.position.y * 100) / 100)).toEqual([0, 0.17, 0.34]);
  });
  it('une unite exterieure et sa grille ; une boite aux lettres sur son pied', () => {
    const g = { enfants: [] as Mesh[], add(m: Mesh) { this.enfants.push(m); } };
    ajouterEquipementJardin(g as never, (q) => ({ x: q.x, z: -q.y }), 'unite-exterieure', emprise, 0.7);
    ajouterEquipementJardin(g as never, (q) => ({ x: q.x, z: -q.y }), 'boite-aux-lettres', emprise, 1.2);
    expect(g.enfants.map((m) => m.name)).toEqual(['unite-exterieure-caisson', 'unite-exterieure-grille', 'boite-aux-lettres', 'boite-aux-lettres-pied']);
  });
});
