import { describe, it, expect } from 'vitest';
import { cotesSurLesCotes } from '../../../src/geometry/facadeExterieure.js';
import type { PtBrut } from '../../../src/model/types.js';

// D'un mur du contour (releve de facade, par son cote) aux murs des corps qui le doublent.

const p = (x: number, y: number): PtBrut => ({ x, y });
// Un L : le corps principal 12 x 8, l'aile 5 x 6 au nord-ouest.
const L = [p(0, 0), p(12, 0), p(12, 8), p(5, 8), p(5, 14), p(0, 14)];
const principal = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
const aile = [p(0, 8), p(5, 8), p(5, 14), p(0, 14)];

describe('cotesSurLesCotes', () => {
  it('trouve les murs d un corps qui doublent un cote du contour, et seulement eux', () => {
    expect(cotesSurLesCotes(principal, L, [0])).toEqual([0]);
    expect(cotesSurLesCotes(principal, L, [1])).toEqual([1]);
    // Le cote ouest du contour (de 0,14 a 0,0) longe les deux corps.
    expect(cotesSurLesCotes(principal, L, [5])).toEqual([3]);
    expect(cotesSurLesCotes(aile, L, [5])).toEqual([3]);
    // Le mur nord du principal n'est couvert par le cote 2 du contour que sur 7 m de 12 : plus de la moitie.
    expect(cotesSurLesCotes(principal, L, [2])).toEqual([2]);
    expect(cotesSurLesCotes(aile, L, [0, 1])).toEqual([]);
    expect(cotesSurLesCotes(principal, L, [])).toEqual([]);
  });

  it('admet un corps remis a l equerre a quelques decimetres pres, pas un mur parallele plus loin', () => {
    const decale = principal.map((q) => p(q.x + 0.1, q.y - 0.3));
    expect(cotesSurLesCotes(decale, L, [0])).toEqual([0]);
    const loin = principal.map((q) => p(q.x, q.y + 1.5));
    expect(cotesSurLesCotes(loin, L, [0])).toEqual([]);
    // Un cote qui ne recouvre le mur que sur un bout : pas le meme mur.
    const court = [p(10, 0), p(20, 0), p(20, 5), p(10, 5)];
    expect(cotesSurLesCotes(court, L, [0])).toEqual([]);
  });
});
