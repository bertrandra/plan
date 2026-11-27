import { describe, it, expect, beforeAll } from 'vitest';
import { facettesLucarnes } from '../../../src/facade/toits/toitFormes.js';
import { ajouterFenetresLucarnes3d, fenetreDeLucarne, FENETRE_LUCARNE, NOM_FENETRES_LUCARNES } from '../../../src/three/toitCorps3d.js';
import { APPUI, ENCADREMENT, LINTEAU_M } from '../../../src/three/fenetresRelief.js';
import { HORS_EXPORT } from '../../../src/three/primitives.js';
import type { CorpsToit, Lucarne } from '../../../src/model/types.js';

// La fenetre d'une lucarne (demande du proprietaire, 27 novembre 2026, Hardencourt 6501004 : trois jacobines lues, aux faces de
// pierre nue ; une lucarne existe pour porter une fenetre). Le meme dessin pour une lucarne posee a la main et une lucarne lue.

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  groups: unknown[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  addGroup(...g: unknown[]) { this.groups.push(g); }
  computeVertexNormals() {}
}
class Mesh { name = ''; userData: Record<string, unknown> = {}; constructor(public geometry: Geo, public material: unknown) {} }
class Group { name = ''; userData: Record<string, unknown> = {}; children: Mesh[] = []; add(m: Mesh) { this.children.push(m); } }
class Color { constructor(public c: unknown) {} lerp() { return this; } }
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = { BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh, Group, Color, MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} }, DoubleSide: 2 };
});

const TOIT: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 7, egouts: [3, 3], pignons: [], ecart: 0 };
const lucarne = (plus: Partial<Lucarne> = {}): Lucarne => ({ type: 'jacobine', pan: 0, debutM: 9, finM: 10.5, faitageM: 5.6, profondeurM: 2, source: 'lidar', ...plus });
const scene = () => ({ added: [] as Group[], add(g: Group) { this.added.push(g); } });
const contexte = (s: ReturnType<typeof scene>) => ({ scene: s, toLocal: (q: { x: number; y: number }) => ({ x: q.x, z: -q.y }), couleurMur: '#cccccc', textures: false }) as never;

describe('la fenetre d une lucarne', () => {
  it('centree sur la face, entre l encadrement, l appui et le linteau des fenetres de facade, jamais plus grande que la face', () => {
    const b = fenetreDeLucarne(1.5, 1.2);
    if (!b) throw new Error('pas de fenetre');
    expect(b.x).toBeCloseTo((1.5 - b.l) / 2, 9);
    expect(b.l).toBeCloseTo(1.5 - 2 * (ENCADREMENT.largeur + FENETRE_LUCARNE.marge), 9);
    expect(b.y - APPUI.hauteur).toBeGreaterThanOrEqual(FENETRE_LUCARNE.marge - 1e-9);
    expect(b.y + b.h + LINTEAU_M).toBeLessThanOrEqual(1.2 - FENETRE_LUCARNE.marge + 1e-9);
  });

  it('bornee a sa plus grande taille sur une grande face ; aucune sur une face trop petite', () => {
    const grande = fenetreDeLucarne(3, 3);
    expect([grande?.l, grande?.h]).toEqual([FENETRE_LUCARNE.largeurMax, FENETRE_LUCARNE.hauteurMax]);
    expect(grande?.x).toBeCloseTo(0.9, 9);
    expect(fenetreDeLucarne(0.7, 1.2)).toBeNull();
    expect(fenetreDeLucarne(1.5, 0.6)).toBeNull();
  });
});

describe('les faces des lucarnes et leurs fenetres en 3D', () => {
  it('une face par lucarne a fenetre, sous l egout de son toit, sur son pan ; pas pour un oeil-de-boeuf', () => {
    const f = facettesLucarnes({ ...TOIT, lucarnes: [lucarne(), lucarne({ pan: 1, type: 'chien-assis', debutM: 3, finM: 4.5 }), lucarne({ type: 'oeil-de-boeuf', debutM: 14, finM: 15 })] }, 20, 8).faces;
    expect(f.map((x) => [x.pan, x.s0, x.s1])).toEqual([[0, 9, 10.5], [1, 3, 4.5]]);
    expect(f[0]?.t).toBeLessThan(4);
    expect(f[1]?.t).toBeGreaterThan(4);
    // La jacobine : la face s'arrete a l'egout de ses deux pans, sous son faitage ; le chien-assis monte jusqu'a son toit.
    expect(f[0]?.z1).toBeLessThan(5.6);
    expect(f[1]?.z1).toBeCloseTo(5.6, 9);
    for (const x of f) expect(x.z1 - x.z0).toBeGreaterThan(0.3);
  });

  it('pose encadrement, menuiserie et vitre, hors export, devant la face de chaque lucarne, lue ou posee a la main', () => {
    const s = scene();
    const corps = [{ ...TOIT, lucarnes: [lucarne(), lucarne({ source: 'observation', debutM: 14, finM: 15.5 })] }];
    expect(ajouterFenetresLucarnes3d(contexte(s), corps)).toBe(2);
    const g = s.added[0];
    expect(g?.name).toBe(NOM_FENETRES_LUCARNES);
    expect(g?.userData[HORS_EXPORT]).toBe(true);
    expect(g?.children.map((m) => m.name)).toEqual(['lucarnes-encadrement', 'lucarnes-menuiserie', 'lucarnes-vitre']);
    // La vitre de la premiere : juste devant la face (vers l'egout du pan 0 : t plus petit), entre ses bords.
    const face = facettesLucarnes(corps[0] as CorpsToit, 20, 8).faces[0];
    const vitre = g?.children[2]?.geometry.attributes.position?.array ?? [];
    if (!face) throw new Error('pas de face');
    expect(vitre.length).toBeGreaterThanOrEqual(24);
    for (let i = 0; i < 12; i += 3) {
      const [x, y, z] = [vitre[i] as number, vitre[i + 1] as number, vitre[i + 2] as number];
      expect(x).toBeGreaterThan(face.s0); expect(x).toBeLessThan(face.s1);
      expect(y).toBeGreaterThan(face.z0); expect(y).toBeLessThan(face.z1);
      expect(-z).toBeLessThan(face.t); expect(-z).toBeGreaterThan(face.t - 0.05);
    }
  });

  it('rien sans lucarne, ni sur une lucarne a la face trop petite', () => {
    const s = scene();
    expect(ajouterFenetresLucarnes3d(contexte(s), [TOIT, { ...TOIT, lucarnes: [lucarne({ debutM: 9, finM: 9.6 })] }])).toBe(0);
    expect(s.added).toEqual([]);
  });
});
