import { describe, it, expect } from 'vitest';
import { empriseLame, empriseLameTrouee } from '../../../src/engine/lames.js';
import { shoelace, pointInPolygon } from '../../../src/geometry/basic.js';

// Une lame qui s'arrete sur un trou de la terrasse (bassin, tremie) est coupee a la forme du trou,
// pas d'equerre : ni coin qui deborde dans le trou, ni coin qui s'arrete court.

const terrasse = [{ x: -1, y: -2 }, { x: 6, y: -2 }, { x: 6, y: 2 }, { x: -1, y: 2 }];
// Un trou en losange : son bord est oblique la ou la lame l'atteint.
const losange = [{ x: 2, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 0 }, { x: 3, y: -1 }];

describe('lame coupee a la forme du trou', () => {
  it('suit le bord oblique du trou jusqu a ses coins', () => {
    const a = { x: 0, y: 0 }, b = { x: 2, y: 0 };
    const equerre = empriseLame(a, b, 0.14, terrasse);
    expect(shoelace(equerre)).toBeCloseTo(2 * 0.14, 6);
    const coupee = empriseLameTrouee(a, b, 0.14, terrasse, [losange]);
    // Deux petits triangles de 7 x 7 cm en plus : la lame va jusqu'au bord du losange.
    expect(shoelace(coupee.contour)).toBeCloseTo(2 * 0.14 + 0.07 * 0.07, 6);
    // Aucun coin dans le trou (ses coins sont SUR son bord : on teste le losange retreci d'un millimetre).
    const dedans = losange.map(p => ({ x: 3 + (p.x - 3) * 0.999, y: p.y * 0.999 }));
    expect(coupee.contour.some(p => pointInPolygon(p, dedans))).toBe(false);
    expect(Math.max(...coupee.contour.map(p => p.x))).toBeCloseTo(2.07, 6);
  });

  it('ne change rien a une lame que le trou ne touche pas', () => {
    const a = { x: 0, y: 1.5 }, b = { x: 5, y: 1.5 };
    expect(empriseLameTrouee(a, b, 0.14, terrasse, [losange]).contour).toEqual(empriseLame(a, b, 0.14, terrasse));
    expect(empriseLameTrouee(a, b, 0.14, terrasse, []).contour).toEqual(empriseLame(a, b, 0.14, terrasse));
  });

  it('garde le bon morceau quand le trou est etroit : celui qui porte la lame', () => {
    const fente = [{ x: 2, y: -1 }, { x: 2.1, y: -1 }, { x: 2.1, y: 1 }, { x: 2, y: 1 }];
    const coupee = empriseLameTrouee({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.14, terrasse, [fente]);
    expect(Math.max(...coupee.contour.map(p => p.x))).toBeCloseTo(2, 6);
    expect(Math.min(...coupee.contour.map(p => p.x))).toBeLessThan(0.01);
  });
});
