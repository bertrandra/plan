import { describe, it, expect } from 'vitest';
import { ramenerDansLeLibre } from '../../../../src/facade/modeToit/poigneesLibres.js';

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
