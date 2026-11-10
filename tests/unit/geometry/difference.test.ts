import { describe, it, expect } from 'vitest';
import { differencePolygones } from '../../../src/geometry/difference.js';
import { shoelace } from '../../../src/geometry/basic.js';
import type { PtBrut } from '../../../src/model/types.js';

// Un polygone prive de ses trous : la forme vraie d'une terrasse que son bassin perce, meme quand
// il en chevauche le bord.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const aire = (r: { contour: PtBrut[]; trous: PtBrut[][] }[]) => r.reduce((s, m) => s + shoelace(m.contour) - m.trous.reduce((t, h) => t + shoelace(h), 0), 0);

describe('differencePolygones', () => {
  it('garde un trou interieur en anneau, ignore un trou dehors', () => {
    const r = differencePolygones(rect(0, 0, 10, 10), [rect(2, 2, 4, 4), rect(20, 20, 22, 22)]);
    expect(r).toHaveLength(1);
    expect(r[0]!.trous).toEqual([rect(2, 2, 4, 4)]);
    expect(aire(r)).toBeCloseTo(96);
  });

  it('encoche le contour quand le trou chevauche un bord, dans un sens comme dans l\'autre', () => {
    for (const trou of [rect(8, 2.5, 12, 6.5), rect(8, 2.5, 12, 6.5).reverse()]) {
      const r = differencePolygones(rect(0, 0, 10, 10).reverse(), [trou]);
      expect(r).toHaveLength(1);
      expect(r[0]!.trous).toEqual([]);
      expect(r[0]!.contour).toHaveLength(8);
      expect(aire(r)).toBeCloseTo(100 - 2 * 4, 6);
    }
  });

  it('coupe en deux morceaux un trou qui traverse, et ne laisse rien sous un trou qui couvre', () => {
    const r = differencePolygones(rect(0, 0, 10, 4), [rect(4, -1, 6, 5)]);
    expect(r).toHaveLength(2);
    expect(r.map(m => shoelace(m.contour)).sort()).toEqual([16, 16]);
    expect(differencePolygones(rect(0, 0, 2, 2), [rect(-1, -1, 3, 3)])).toEqual([]);
  });

  it('traite un trou pose sur un bord ou un sommet (decale d\'un micron), et une terrasse en L', () => {
    // Le trou partage le bord x = 10 : degenere, decale, puis compte.
    const bord = differencePolygones(rect(0, 0, 10, 10), [rect(8, 2, 10, 6)]);
    expect(aire(bord)).toBeCloseTo(92, 4);
    const coin = differencePolygones(rect(0, 0, 10, 10), [rect(8, 8, 12, 12)]);
    expect(aire(coin)).toBeCloseTo(96, 4);
    const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
    // Un trou dans le coin rentrant : il mord sur les deux branches.
    const r = differencePolygones(L, [rect(3, 3, 6, 6)]);
    expect(aire(r)).toBeCloseTo(shoelace(L) - (9 - 4), 6);
  });

  it('applique plusieurs trous a la suite, ceux du bord comme ceux de l\'interieur', () => {
    const r = differencePolygones(rect(0, 0, 10, 10), [rect(8, 2, 12, 4.5), rect(2, 2, 3, 3), rect(-1, 7, 1, 8)]);
    expect(r).toHaveLength(1);
    expect(r[0]!.trous).toHaveLength(1);
    expect(aire(r)).toBeCloseTo(100 - 5 - 1 - 1, 6);
  });
});
