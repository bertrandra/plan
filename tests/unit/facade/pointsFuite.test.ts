import { describe, it, expect } from 'vitest';
import { pointDeFuite, ecartAuPoint, attitudeDuPointVertical, pointFuiteVertical, azimutParPointFuite, directionDuMur } from '../../../src/facade/pointsFuite.js';
import { projeterPoint, type PriseDeVue, type MurVu, type Incertitude } from '../../../src/facade/calage.js';
import type { Segment } from '../../../src/facade/segments.js';

// Les points de fuite (calage fin, lot L7) : l'attitude et l'azimut se lisent sur les segments,
// dans les bornes de ce que mesurent les capteurs, jamais au-dela.

const W = 1280,
  H = 960;
/** Le mur du generateur du banc : de (0, 0) a (10, 0), la rue vers -Y. */
const mur: MurVu = { gauche: { x: 0, y: 0 }, droite: { x: 10, y: 0 }, hauteur: 6 };

/** Une prise a 12 m du milieu du mur, de biais (objectif a droite, `biais` en radians), visant le milieu. */
function prise(azimutDeg: number, inclinaisonDeg: number, roulisDeg: number, biais = 0.2): PriseDeVue {
  return { x: 5 + 12 * Math.sin(biais), y: -12 * Math.cos(biais), precisionM: 0, azimutDeg, sourceAzimut: 'boussole', inclinaisonDeg, roulisDeg, focalePx: 1000, largeurPx: W, hauteurPx: H, sourceFocale: 'exif' };
}

/** Le segment image d'un segment du monde. */
function seg(p: PriseDeVue, a: [number, number, number], b: [number, number, number]): Segment {
  const pa = projeterPoint(p, ...a),
    pb = projeterPoint(p, ...b);
  if (!pa || !pb) throw new Error('derriere');
  return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, longueur: Math.hypot(pb.x - pa.x, pb.y - pa.y), force: 50 };
}

/** Les aretes d'une facade : verticales (bords, tableaux) et horizontales (egout, pied, appuis). */
function facade(p: PriseDeVue): { verticaux: Segment[]; horizontaux: Segment[] } {
  const verticaux = [0, 1.2, 2.4, 4.6, 5.6, 7.4, 8.6, 10].map((x) => seg(p, [x, 0, 0.2], [x, 0, 5.8]));
  const horizontaux = [0, 0.9, 2.2, 3.8, 5.2, 6].map((z) => seg(p, [0.2, 0, z], [9.8, 0, z]));
  return { verticaux, horizontaux };
}

const AZ = 360 - (0.2 * 180) / Math.PI; // la visee du milieu depuis l'objectif
const inc: Incertitude = { positionM: 0, azimutDeg: 15, inclinaisonDeg: 3, roulisDeg: 3, focale: 0 };

describe('pointDeFuite et ecartAuPoint', () => {
  it('telephone d aplomb : le point de fuite vertical est a l infini, les verticales y visent', () => {
    const p = prise(AZ, 0, 0);
    const v = pointDeFuite(p, [0, 0, 1]);
    expect(Math.abs(v[2])).toBeLessThan(1e-12);
    const { verticaux, horizontaux } = facade(p);
    for (const s of verticaux) expect(ecartAuPoint(s, v)).toBeLessThan(1e-6);
    // Une horizontale ne vise pas le point vertical.
    expect(ecartAuPoint(horizontaux[0]!, v)).toBeGreaterThan(1.2);
  });

  it('rend l attitude que donne un point de fuite vertical', () => {
    const p = prise(AZ, 7, -3);
    const a = attitudeDuPointVertical(pointDeFuite(p, [0, 0, 1]), p.focalePx, W / 2, H / 2);
    expect(a.inclinaisonDeg).toBeCloseTo(7, 6);
    expect(a.roulisDeg).toBeCloseTo(-3, 6);
  });
});

describe('pointFuiteVertical', () => {
  it('corrige l inclinaison et le roulis mesures, dans leurs bornes', () => {
    const vrai = prise(AZ, 6, 2);
    const { verticaux, horizontaux } = facade(vrai);
    const r = pointFuiteVertical([...verticaux, ...horizontaux], prise(AZ, 4, 3.5), inc);
    expect(r.trouve).toBe(true);
    expect(r.inclinaisonDeg).toBeCloseTo(6, 1);
    expect(r.roulisDeg).toBeCloseTo(2, 1);
    expect(r.segments.length).toBe(verticaux.length);
  });

  it('ne sort jamais des bornes de la mesure', () => {
    const { verticaux } = facade(prise(AZ, 12, 0));
    const r = pointFuiteVertical(verticaux, prise(AZ, 4, 0), inc);
    expect(r.inclinaisonDeg).toBeLessThanOrEqual(4 + 3 + 1e-9);
  });

  it('garde l attitude mesuree sans segments verticaux', () => {
    const r = pointFuiteVertical(facade(prise(AZ, 6, 2)).horizontaux, prise(AZ, 4, 3), inc);
    expect(r.trouve).toBe(false);
    expect([r.inclinaisonDeg, r.roulisDeg]).toEqual([4, 3]);
  });
});

describe('azimutParPointFuite', () => {
  it('corrige la boussole par les horizontales du mur, vu de biais', () => {
    // A 30 degres du mur, les horizontales convergent nettement.
    const az = 360 - 30;
    const vrai = prise(az, 5, 1, Math.PI / 6);
    const { verticaux, horizontaux } = facade(vrai);
    // La boussole se trompe de 8 degres ; l'attitude est juste.
    const r = azimutParPointFuite([...verticaux, ...horizontaux], prise(az + 8, 5, 1, Math.PI / 6), mur, inc, verticaux);
    expect(r.trouve).toBe(true);
    expect(r.azimutDeg).toBeCloseTo(az, 1);
    expect(r.segments.length).toBe(horizontaux.length);
  });

  it('garde la boussole quand les horizontales, presque de face, la disent mal', () => {
    // A 11 degres, 3 degres d'azimut ne penchent l'egout que d'un degre : le pic est trop plat.
    const { verticaux, horizontaux } = facade(prise(AZ, 5, 1));
    const r = azimutParPointFuite([...verticaux, ...horizontaux], prise(AZ + 8, 5, 1), mur, inc, verticaux);
    if (!r.trouve) expect(r.azimutDeg).toBe(AZ + 8);
    else expect(r.azimutDeg).toBeCloseTo(AZ, 0);
  });

  it('dit la direction du mur', () => {
    expect(directionDuMur(mur)).toEqual([1, 0, 0]);
  });
});
