import { describe, it, expect, beforeAll } from 'vitest';
import { planCroupe } from '../../../src/facade/toitCorps.js';
import { readFileSync } from 'node:fs';
import { reconstruireCorps, decalageSurMesure } from '../../../src/facade/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import { pointInPolygon, signedArea } from '../../../src/geometry/basic.js';
import { trianguler } from '../../../src/facade/toit.js';
import { distancePointContour } from '../../../src/geometry/proximite.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import { facettesSurContour, facettesCorps, hauteurDesCorps, ajouterToitCorps3d, ajouterToitCorpsSurContour3d, penteDuCorps, penteDominante, NOM_TOIT_CORPS, NOM_TOIT_CORPS_PLAT, NOM_MUR_CORPS, DEBORD_EGOUT_M } from '../../../src/three/toitCorps3d.js';
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
    // Les murs montent du prisme, sur le contour lui-meme (le cote de biais compris), ou, dedans,
    // sur le cote d'un corps plus haut que ce qui le borde.
    const surUnCote = (q: PtBrut) => distancePointContour(q, contour) < 1e-6 || corps.some((c) => distancePointContour(q, c.pts) < 1e-6);
    for (const m of f.murs) for (const q of m) expect(surUnCote(q)).toBe(true);
    // Les deux quatre-pans montent a leurs faitages.
    expect(Math.max(...f.pans.flat().map((q) => q.z))).toBeGreaterThan(7.3);
  });

  it('les facettes plates d un corps forment un toit-terrasse a part, dans le gris d un toit plat', () => {
    const enfants: Mesh[] = [];
    const ctx = { scene: { add: (m: Mesh) => { enfants.push(m); } } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#ffffff', textures: false };
    // Sur le contour, un corps plat plus haut que l'egout le plus bas a sa facette (un toit-terrasse sur le prisme).
    const plat = { ...corps([]), pts: [p(12, 0), p(16, 0), p(16, 8), p(12, 8)], posFaitage: 4, faitage: 6, egouts: [6, 6] as [number, number] };
    ajouterToitCorpsSurContour3d(ctx, [corps([]), plat], { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couleur: '#B0432F', origineCouleur: 'rouge' }, [p(0, 0), p(16, 0), p(16, 8), p(0, 8)]);
    expect(enfants.map((m) => m.name)).toEqual([NOM_TOIT_CORPS, NOM_TOIT_CORPS_PLAT, NOM_MUR_CORPS]);
    expect((enfants[1]!.material as { p: { color: string } }).p.color).toBe('#6F7275');
  });
});

describe('la pente qui choisit la tuile', () => {
  it('le pan le plus raide d un corps ; le plus grand corps en pente d un batiment', () => {
    const c = corps([]);
    expect(penteDuCorps(c)).toBeGreaterThan(0);
    const plat = { ...c, faitage: 5, egouts: [5, 5] as [number, number] };
    expect(penteDuCorps(plat)).toBe(0);
    const appentis = { ...c, pts: [p(0, 0), p(3, 0), p(3, 2), p(0, 2)], posFaitage: 0, faitage: 4, egouts: [4, 2.5] as [number, number] };
    expect(penteDominante([appentis, c])).toBeCloseTo(penteDuCorps(c), 6);
    expect(penteDominante([plat])).toBeNull();
  });
});

describe('AE 103 : deux quatre-pans et une terrasse sur un contour de biais', () => {
  // Le voisin d'AE 101 tel que la demonstration le porte : un grand quatre-pans (egouts 4,9 m), une
  // terrasse a 3,7 m (le dessus du prisme) et un petit quatre-pans (egouts 4,5 m).
  const P = (x: number, y: number): PtBrut => ({ x, y });
  const contour = [P(14.71, -39.68), P(2.21, -40.32), P(1.98, -37.22), P(-3.12, -37.68), P(-2.88, -40.78), P(-7.58, -41.03), P(-7.84, -35.83), P(1.52, -31.33), P(14.01, -30.59)];
  const corps: CorpsToit[] = [
    { pts: [P(2.17, -40.32), P(14.59, -39.69), P(14.13, -30.63), P(1.71, -31.27)], posFaitage: 4.53, faitage: 7.9, egouts: [4.9, 4.9], croupes: [4.53, 4.53], pignons: [], ecart: 0.2 },
    { pts: [P(-3.05, -37.58), P(2.02, -37.32), P(1.71, -31.27), P(-3.36, -31.53)], posFaitage: 3.03, faitage: 3.7, egouts: [3.7, 3.7], pignons: [], ecart: 0.2 },
    { pts: [P(-2.88, -40.78), P(-3.24, -33.84), P(-7.94, -34.09), P(-7.58, -41.03)], posFaitage: 2.35, faitage: 6.3, egouts: [4.5, 4.5], croupes: [2.35, 2.35], pignons: [], ecart: 0.2 }
  ];
  const { pans, murs, bas } = facettesSurContour(corps, contour);

  it('dessine chaque pan en entier : pas de trou dans les croupes', () => {
    const aireTri = (q: PtBrut[], t: number[][]) => t.reduce((s, [a, b, c]) => s + Math.abs(signedArea([q[a as number]!, q[b as number]!, q[c as number]!])), 0);
    for (const pan of pans) {
      const t = pan.length > 4 ? trianguler(pan) : Array.from({ length: pan.length - 2 }, (_, k) => [0, k + 1, k + 2]);
      expect(aireTri(pan, t)).toBeCloseTo(Math.abs(signedArea(pan)), 3);
    }
  });

  it('ferme par un mur la marche entre un quatre-pans et la terrasse', () => {
    expect(bas).toBeCloseTo(3.7, 6);
    // Le mur ouest du grand quatre-pans, au-dessus de la terrasse : de 3,7 m a son egout.
    const ouest = murs.filter((m) => m.every((q) => Math.abs(q.x - (1.71 + (q.y + 31.27) * (2.17 - 1.71) / (-40.32 + 31.27))) < 0.02) && m.every((q) => q.y > -37.2 && q.y < -31.3));
    expect(ouest.length).toBeGreaterThan(5);
    for (const m of ouest) {
      expect(Math.min(...m.map((q) => q.z))).toBeCloseTo(3.7, 2);
      expect(Math.max(...m.map((q) => q.z))).toBeGreaterThan(4.8);
    }
    // Sur la terrasse, rien ne monte au-dessus d'elle ailleurs qu'au droit des corps plus hauts.
    expect(murs.every((m) => m.every((q) => q.z >= 3.7 - 1e-6))).toBe(true);
  });
});

describe('les formes étendues dans le dessin des corps (profil brisé, demi-croupe, brisis, lucarnes)', () => {
  const BRIS = { type: 'brise' as const, largeurBrisisM: 1, hauteurBrisM: 6.5 };
  const mansart = (plus: Partial<CorpsToit> = {}): CorpsToit => ({ ...corps([], [5, 5]), faitage: 8, profil: [BRIS, BRIS], bouts: [{ type: 'brisis', largeurM: 1 }, { type: 'brisis', largeurM: 1 }], ...plus });
  const lucarne = { type: 'jacobine' as const, pan: 0 as const, debutM: 4, finM: 6, faitageM: 6.2, profondeurM: 1, source: 'observation' as const };

  it('un corps sans forme étendue garde le dessin d’avant : même nombre de facettes, mêmes sommets', () => {
    const f = facettesCorps(corps());
    expect(f.pans).toHaveLength(2);
    expect(f.murs).toHaveLength(2);
    expect(facettesCorps({ ...corps(), profil: [{ type: 'droit' }, { type: 'droit' }] })).toEqual(f);
  });

  it('un Mansart se dessine en facettes planes, avec le débord de l’égout sur les façades seulement', () => {
    const f = facettesCorps(mansart(), [p(0, 0), p(12, 0), p(12, 8), p(0, 8)]);
    expect(f.pans.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...zs(f.pans))).toBe(8);
    expect(Math.min(...ys(f.pans))).toBeCloseTo(-DEBORD_EGOUT_M, 6);
    // Sans contour, le débord est partout (le dessin d'avant) ; sans débord, le toit s'arrête au mur.
    expect(Math.min(...ys(facettesCorps(mansart(), null, false).pans))).toBeCloseTo(0, 6);
  });

  it('la hauteur du toit en un point suit le brisis : 6,5 m à la ligne de bris, l’égout au mur', () => {
    const c = mansart();
    expect(hauteurDesCorps([c], p(6, 1))).toBeCloseTo(6.5, 6);
    expect(hauteurDesCorps([c], p(6, 0.01))).toBeCloseTo(5, 1);
    expect(hauteurDesCorps([c], p(6, 4))).toBeCloseTo(8, 6);
  });

  it('posé sur un contour, un Mansart donne ses facettes découpées et ses murs montent jusqu’au brisis', () => {
    const contour = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
    const f = facettesSurContour([mansart()], contour);
    expect(f.pans.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...zs(f.pans))).toBe(8);
    expect(f.bas).toBe(5);
  });

  it('les lucarnes d’un corps s’ajoutent à ses pans et à ses murs, y compris sur un contour', () => {
    const sans = facettesCorps(corps());
    const avec = facettesCorps({ ...corps(), lucarnes: [lucarne] });
    expect(avec.pans).toHaveLength(sans.pans.length + 2);
    expect(avec.murs).toHaveLength(sans.murs.length + 3);
    const contour = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
    const a = facettesSurContour([corps()], contour), b = facettesSurContour([{ ...corps(), lucarnes: [lucarne] }], contour);
    expect(b.pans.length).toBe(a.pans.length + 2);
    expect(b.murs.length).toBe(a.murs.length + 3);
  });

  it('la 3D pose les facettes d’un Mansart à lucarnes dans la scène, en couverture et en murs', () => {
    const scene = { added: [] as { name: string }[], add(m: { name: string }) { this.added.push(m); } };
    const r = ajouterToitCorps3d({ scene: scene as never, toLocal: (q) => ({ x: q.x, z: q.y }) as never, couleurMur: '#ccc', textures: false }, [mansart({ lucarnes: [lucarne] })], null, null);
    expect(r.pans).toBeGreaterThanOrEqual(10);
    expect(scene.added.map((m) => m.name)).toContain(NOM_TOIT_CORPS);
  });
});
