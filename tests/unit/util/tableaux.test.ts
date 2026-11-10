import { describe, it, expect } from 'vitest';
import { au, maximum, minimum } from '../../../src/util/tableaux.js';

describe('au : lire un element dont l indice est suppose valide', () => {
  it('rend l element', () => {
    expect(au([10, 20, 30], 1)).toBe(20);
    expect(au('abc', 2)).toBe('c');
  });

  it('leve une RangeError nommee au lieu de laisser passer undefined', () => {
    expect(() => au([1, 2], 2)).toThrow(RangeError);
    expect(() => au([1, 2], -1)).toThrow(/Indice -1 hors du tableau \(2 element/);
    expect(() => au([], 0)).toThrow(RangeError);
  });

  it('rend 0, une chaine vide et null tels quels : seul undefined signale un indice hors du tableau', () => {
    expect(au([0], 0)).toBe(0);
    expect(au([''], 0)).toBe('');
    expect(au([null], 0)).toBeNull();
  });
});

describe('minimum et maximum', () => {
  it('tiennent un million de valeurs, la ou Math.min(...valeurs) deborde la pile', () => {
    const v = Array.from({ length: 1000000 }, (_, k) => (k * 7919) % 1000003);
    expect(() => Math.min(...v)).toThrow(RangeError);
    expect(minimum(v)).toBe(0);
    expect(maximum(v)).toBe(1000002);
  });

  it('se comportent comme Math.min et Math.max : vide, NaN', () => {
    expect(minimum([])).toBe(Infinity);
    expect(maximum([])).toBe(-Infinity);
    expect(minimum([3, NaN, 1])).toBeNaN();
    expect(maximum([3, -1, 2])).toBe(3);
  });
});
