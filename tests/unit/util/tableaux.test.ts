import { describe, it, expect } from 'vitest';
import { au } from '../../../src/util/tableaux.js';

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
