import { describe, it, expect } from 'vitest';
import { dansLeLibre, ramenerDansLeLibre } from '../../../../src/facade/modeToit/poigneesLibres.js';

// Une poignee sous le panneau du mode Toit se ramene au bord de la partie libre (audit de la camera, 6 novembre 2026).

describe('une poignee ramenee dans la partie libre', () => {
  const b = { x0: 44, y0: 44, x1: 900, y1: 600 };
  it('dans la partie libre, elle ne bouge pas', () => {
    expect(ramenerDansLeLibre({ x: 300, y: 200 }, b)).toEqual({ x: 300, y: 200, ramene: false });
  });
  it('sous le panneau (a droite) ou hors de l image, elle vient au bord le plus proche', () => {
    expect(ramenerDansLeLibre({ x: 1085, y: 367 }, b)).toEqual({ x: 900, y: 367, ramene: true });
    expect(ramenerDansLeLibre({ x: -20, y: 700 }, b)).toEqual({ x: 44, y: 600, ramene: true });
  });
});

// Le plan des facades deplie, en haut a gauche de la scene, est un obstacle : une poignee ramenee au bord gauche tombait dessous et ne se
// prenait pas (point 143 de la fumee en moyen, 9 novembre 2026).
describe('une poignee sous le plan des facades', () => {
  const b = { x0: 44, y0: 44, x1: 900, y1: 600, obstacles: [{ x0: -14, y0: 42, x1: 180, y1: 206 }] };
  it('ramenee au bord gauche sous le plan, elle en sort par le bord le plus proche', () => {
    // (-20, 110) vient a x 44 (sous le plan) ; le bord bas est a 96 px, le bord droit a 136 : par le haut (68 px), hors du rectangle ;
    // reste le bas.
    expect(ramenerDansLeLibre({ x: -20, y: 110 }, b)).toEqual({ x: 44, y: 206, ramene: true });
    // Plus pres du bord droit que du bas.
    expect(ramenerDansLeLibre({ x: 170, y: 120 }, b)).toEqual({ x: 180, y: 120, ramene: true });
  });
  it('hors du plan, rien ne change', () => {
    expect(ramenerDansLeLibre({ x: 300, y: 120 }, b)).toEqual({ x: 300, y: 120, ramene: false });
    expect(ramenerDansLeLibre({ x: 60, y: 400 }, b)).toEqual({ x: 60, y: 400, ramene: false });
  });
  it('la partie libre exclut le plan, pas ses bords', () => {
    expect(dansLeLibre({ x: 100, y: 100 }, b)).toBe(false);
    expect(dansLeLibre({ x: 180, y: 100 }, b)).toBe(true);
    expect(dansLeLibre({ x: 100, y: 300 }, b)).toBe(true);
    expect(dansLeLibre({ x: 30, y: 300 }, b)).toBe(false);
  });
});
