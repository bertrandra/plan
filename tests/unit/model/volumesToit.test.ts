import { describe, it, expect } from 'vitest';
import { decomposerEnRectangles, rectanglesDuContour, equerrer, volumesParDefaut, volumesActifs, penteDuToit, toitDuRectangle, decrireVolumes, LARGEUR_MIN_M } from '../../../src/model/volumesToit.js';
import { signedArea, pointInPolygon } from '../../../src/geometry/basic.js';
import type { PtBrut, Toit } from '../../../src/model/types.js';

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
const L = [p(0, 0), p(12, 0), p(12, 8), p(5, 8), p(5, 14), p(0, 14)];
const T = [p(0, 0), p(14, 0), p(14, 6), p(9, 6), p(9, 12), p(5, 12), p(5, 6), p(0, 6)];
const U = [p(0, 0), p(16, 0), p(16, 10), p(12, 10), p(12, 4), p(4, 4), p(4, 10), p(0, 10)];
const aire = (pts: readonly PtBrut[]) => Math.abs(signedArea(pts));
const dims = (r: readonly PtBrut[]) => [Math.hypot(r[1]!.x - r[0]!.x, r[1]!.y - r[0]!.y), Math.hypot(r[2]!.x - r[1]!.x, r[2]!.y - r[1]!.y)].sort((a, b) => b - a).map((v) => Math.round(v * 10) / 10);
const tourne = (pts: readonly PtBrut[], d: number) => { const c = Math.cos((d * Math.PI) / 180), s = Math.sin((d * Math.PI) / 180); return pts.map((q) => p(q.x * c - q.y * s, q.x * s + q.y * c)); };

describe('equerrer', () => {
  it('ramene a l equerre un contour presque droit, fusionne les cotes de meme sens, refuse le biais', () => {
    const presque = [p(0, 0), p(12, 0.1), p(12.05, 8), p(6, 8.05), p(0, 8)];
    const e = equerrer(presque)!;
    expect(e).toHaveLength(4);
    expect(aire(e)).toBeCloseTo(96, 0);
    expect(equerrer([p(0, 0), p(10, 0), p(10, 6), p(4, 9)])).toBeNull();
  });
});

describe('decomposerEnRectangles', () => {
  it('un rectangle ne se decoupe pas ; un L donne un corps et une aile entiere qui le penetre, le corps d abord', () => {
    expect(decomposerEnRectangles(rect)).toBeNull();
    expect(rectanglesDuContour(rect)).toHaveLength(1);
    expect(rectanglesDuContour([p(0, 0), p(10, 0), p(10, 6), p(4, 9)])).toBeNull();
    const r = decomposerEnRectangles(L)!;
    expect(r).toHaveLength(2);
    expect(dims(r[0]!)).toEqual([12, 8]);
    // L'aile court sur toute la hauteur du L : son toit traverse le corps, le plus haut des deux l'emporte.
    expect(dims(r[1]!)).toEqual([14, 5]);
    expect(r.reduce((s, q) => s + aire(q), 0)).toBeGreaterThanOrEqual(aire(L));
    // Tout point du L est sous un rectangle, et aucun rectangle ne sort du L.
    for (let x = 0.5; x < 12; x++) for (let y = 0.5; y < 14; y++) {
      const dansL = pointInPolygon({ x, y }, L);
      expect(r.some((q) => pointInPolygon({ x, y }, q))).toBe(dansL);
    }
  });
  it('un T et un U se decoupent au plus petit nombre de volumes, chacun entier, et couvrent leur aire', () => {
    const t = decomposerEnRectangles(T)!;
    expect(t).toHaveLength(2);
    expect(dims(t[0]!)).toEqual([14, 6]);
    expect(dims(t[1]!)).toEqual([12, 4]);
    const u = decomposerEnRectangles(U)!;
    expect(u).toHaveLength(3);
    expect(dims(u[0]!)).toEqual([16, 4]);
    expect(dims(u[1]!)).toEqual([10, 4]);
    expect(u.reduce((s, q) => s + aire(q), 0)).toBeGreaterThanOrEqual(aire(U));
  });
  it('suit l axe du batiment : un L tourne de 25° se decoupe pareil, dans le repere du plan', () => {
    const r = decomposerEnRectangles(tourne(L, 25))!;
    expect(r).toHaveLength(2);
    expect(dims(r[0]!)).toEqual([12, 8]);
    // Les rectangles rendus sont bien tournes : leur premier cote fait 25° (ou 115°).
    const a = (Math.atan2(r[0]![1]!.y - r[0]![0]!.y, r[0]![1]!.x - r[0]![0]!.x) * 180) / Math.PI;
    expect([25, 115, -65, -155].some((v) => Math.abs(((a - v + 180) % 360) - 180) < 0.5)).toBe(true);
  });
  it('refuse un contour de biais, et un decoupage qui laisserait un volume trop etroit', () => {
    expect(decomposerEnRectangles([p(0, 0), p(10, 0), p(14, 6), p(4, 6)])).toBeNull();
    // Une aile de 1 m de large : pas un volume, et trop grande (10 m²) pour etre oubliee.
    expect(LARGEUR_MIN_M).toBe(1.5);
    expect(decomposerEnRectangles([p(0, 0), p(12, 0), p(12, 8), p(1, 8), p(1, 18), p(0, 18)])).toBeNull();
    // Une saillie de 1 m² est oubliee : le contour reste un seul rectangle.
    expect(decomposerEnRectangles([p(0, 0), p(12, 0), p(12, 8), p(1, 8), p(1, 9), p(0, 9)])).toBeNull();
  });
});

describe('les toits des volumes', () => {
  const bdtopo: Toit = { forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'bdtopo' };
  it('penteDuToit : des croupes, deux pans, un appentis, un toit plat', () => {
    // Croupes de 3 m sur un L dont le squelette est a 4 m : 36,9°.
    expect(penteDuToit(L, bdtopo)).toBeCloseTo(36.87, 1);
    expect(penteDuToit(rect, { forme: 'deux-pans', hauteur: 4, angleFaitage: 0 })).toBeCloseTo(45, 6);
    expect(penteDuToit(rect, { forme: 'appentis', hauteur: 8, angleFaitage: 0 })).toBeCloseTo(45, 6);
    expect(penteDuToit(rect, { forme: 'plat', hauteur: 0, angleFaitage: 0 })).toBe(0);
  });
  it('toitDuRectangle : deux pans dans l axe d un rectangle allonge, quatre pans sur un carre, a la pente', () => {
    expect(toitDuRectangle(rect, 45, 'bdtopo', false)).toEqual({ forme: 'deux-pans', hauteur: 4, angleFaitage: 0, source: 'bdtopo' });
    expect(toitDuRectangle([p(0, 0), p(6, 0), p(6, 6), p(0, 6)], 30, 'lidar', true)).toMatchObject({ forme: 'quatre-pans', estime: true, source: 'lidar' });
    expect(toitDuRectangle(rect, 0, 'bdtopo', false).forme).toBe('plat');
  });
  it('volumesParDefaut : chaque rectangle du L a son toit, a la pente du toit du batiment', () => {
    const v = volumesParDefaut(L, bdtopo)!;
    expect(v).toHaveLength(2);
    expect(v[0]!.toit).toMatchObject({ forme: 'deux-pans', angleFaitage: 0, source: 'bdtopo' });
    // Le corps fait 8 m de large : a 36,9°, son faitage est a 3 m ; l'aile de 5 m, a 1,88 m.
    expect(v[0]!.toit.hauteur).toBeCloseTo(3, 2);
    expect(v[1]!.toit.hauteur).toBeCloseTo(1.88, 2);
    expect(v[1]!.toit.angleFaitage).toBe(90);
    expect(v.every((x) => x.egout === undefined)).toBe(true);
    expect(volumesParDefaut(rect, bdtopo)).toBeNull();
  });
  it('volumesActifs : au moins deux volumes, sauf en mode « un seul toit »', () => {
    const v = volumesParDefaut(L, bdtopo)!;
    expect(volumesActifs({ volumesToit: v })).toBe(v);
    expect(volumesActifs({ volumesToit: v, modeToit: 'volumes' })).toBe(v);
    expect(volumesActifs({ volumesToit: v, modeToit: 'simple' })).toBeNull();
    expect(volumesActifs({ volumesToit: [v[0]!] })).toBeNull();
    expect(volumesActifs({})).toBeNull();
  });
  it('decrireVolumes : une ligne par volume', () => {
    const v = volumesParDefaut(L, bdtopo)!;
    v[1]!.egout = 2.6;
    const lignes = decrireVolumes(v, { plat: 'Plat', appentis: 'Appentis', 'deux-pans': 'Deux pans', 'quatre-pans': 'Quatre pans', croupes: 'Croupes' });
    // L'aile entiere, 14 m sur 5 : assez allongee pour un faitage.
    expect(lignes).toEqual(['Corps 12,0 × 8,0 m : deux pans', 'Aile 14,0 × 5,0 m : deux pans · égout 2,6 m']);
    // Des murs mesures de hauteurs differentes se disent ; tous pareils, non.
    v[0]!.hauteursMurs = [3.9, 7.2, 7.2, 3.9];
    v[1]!.hauteursMurs = [2.6, 2.6, 2.7, 2.6];
    const avecMurs = decrireVolumes(v, { plat: 'Plat', appentis: 'Appentis', 'deux-pans': 'Deux pans', 'quatre-pans': 'Quatre pans', croupes: 'Croupes' });
    expect(avecMurs[0]).toBe('Corps 12,0 × 8,0 m : deux pans · murs de 3,9 à 7,2 m');
    expect(avecMurs[1]).toBe('Aile 14,0 × 5,0 m : deux pans · égout 2,6 m');
  });
});
