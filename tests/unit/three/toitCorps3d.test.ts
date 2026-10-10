import { describe, it, expect, beforeAll } from 'vitest';
import { planCroupe } from '../../../src/facade/toitCorps.js';
import { readFileSync } from 'node:fs';
import { reconstruireCorps, decalageSurMesure } from '../../../src/facade/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { distancePointContour } from '../../../src/geometry/proximite.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import { facettesSurContour, facettesCorps, ajouterToitCorps3d, NOM_TOIT_CORPS, NOM_MUR_CORPS, DEBORD_EGOUT_M } from '../../../src/three/toitCorps3d.js';
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

  it('a croupes : deux pans en trapeze, une croupe a chaque bout, pas de pignon de bout', () => {
    const c: CorpsToit = { ...corps(), croupes: [4, 4] };
    const f = facettesCorps(c);
    // Deux pans et deux croupes ; le faitage ne court plus que de x = 4 a x = 8.
    expect(f.pans).toHaveLength(4);
    const auFaitage = f.pans.flat().filter((q) => q.z === 8).map((q) => q.x);
    expect(Math.min(...auFaitage)).toBe(4);
    expect(Math.max(...auFaitage)).toBe(8);
    // Ni pignon de bout ni mur au-dessus du prisme : les egouts sont a 5 m tout autour.
    expect(f.murs).toHaveLength(0);
    // Chaque coin de croupe, debord compris, est dans le plan de sa croupe (et dans celui du pan voisin).
    const croupes = f.pans.filter((q) => q.length === 3);
    expect(croupes).toHaveLength(2);
    for (const tri of croupes) for (const q of tri) {
      const bout = q.x < 6 ? 0 : 12;
      expect(q.z).toBeCloseTo(planCroupe(c, 8, 4, bout === 0 ? q.x : 12 - q.x, q.y), 9);
    }
    expect(Math.min(...f.pans.flat().map((q) => q.z))).toBeCloseTo(5 - 0.75 * DEBORD_EGOUT_M, 9);
  });

  it('un appentis deborde aussi au-dela de son mur haut, en continuant de monter', () => {
    // Un pan de 3 m (y = 0) a 5 m (y = 8) : le faitage est sur le mur y = 8.
    const c: CorpsToit = { pts: [p(0, 0), p(12, 0), p(12, 8), p(0, 8)], posFaitage: 8, faitage: 5, egouts: [3, 5], pignons: [], ecart: 0.1 };
    const f = facettesCorps(c);
    expect(f.pans).toHaveLength(1);
    expect(Math.max(...ys(f.pans))).toBeCloseTo(8 + DEBORD_EGOUT_M, 9);
    expect(Math.min(...ys(f.pans))).toBeCloseTo(-DEBORD_EGOUT_M, 9);
    expect(Math.max(...zs(f.pans))).toBeCloseTo(5 + (2 / 8) * DEBORD_EGOUT_M, 9);
    // Le mur haut monte jusqu'au faitage ; les murs de bout en trapeze.
    expect(f.murs.some((m) => m.every((q) => q.y === 8) && Math.max(...m.map((q) => q.z)) === 5)).toBe(true);
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

describe('facettesSurContour', () => {
  it('AE 103 : le batiment garde la forme du plan, ses toits decoupes sur son contour', () => {
    const r = JSON.parse(readFileSync(new URL('../../fixtures/toits/vesinet-ae103.json', import.meta.url), 'utf8')) as { contour: PtBrut[]; grilleLarge: GrilleRelief };
    const d = decalageSurMesure(r.grilleLarge, r.contour)!;
    const contour = r.contour.map((q) => p(q.x + d.x, q.y + d.y));
    const corps = reconstruireCorps(toitMesureDepuisGrille(r.grilleLarge, contour)!, contour, { grille: r.grilleLarge })!;
    const f = facettesSurContour(corps, contour);
    expect(f.bas).toBe(Math.min(...corps.flatMap((c) => c.egouts)));
    expect(f.hauteursMurs).toHaveLength(contour.length);
    // Tout sommet de toit est dans le contour, ou dessus.
    for (const q of f.pans.flat()) expect(pointInPolygon(q, contour) || distancePointContour(q, contour) < 1e-6).toBe(true);
    // Les murs montent du prisme, sur le contour lui-meme (le cote de biais compris).
    for (const m of f.murs) for (const q of m) expect(distancePointContour(q, contour)).toBeLessThan(1e-6);
    // Les deux quatre-pans montent a leurs faitages.
    expect(Math.max(...f.pans.flat().map((q) => q.z))).toBeGreaterThan(7.3);
  });
});
