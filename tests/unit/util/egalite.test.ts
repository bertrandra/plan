import { describe, it, expect } from 'vitest';
import { egalProfond } from '../../../src/util/egalite.js';

describe('egalProfond', () => {
  it('compare champ par champ, tableaux et objets imbriques', () => {
    expect(egalProfond({ a: 1, b: [{ x: 2 }, 'z'] }, { b: [{ x: 2 }, 'z'], a: 1 })).toBe(true);
    expect(egalProfond({ a: 1, b: [{ x: 2 }] }, { a: 1, b: [{ x: 3 }] })).toBe(false);
    expect(egalProfond([1, 2], [1, 2, 3])).toBe(false);
    expect(egalProfond([], {})).toBe(false);
    expect(egalProfond(null, {})).toBe(false);
    expect(egalProfond('a', 'a')).toBe(true);
  });

  it('confond une cle absente et une cle a undefined, comme la serialisation', () => {
    expect(egalProfond({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(egalProfond({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(egalProfond({ a: 1 }, { a: 1, b: null })).toBe(false);
  });

  it('tient NaN pour egal a NaN', () => {
    expect(egalProfond({ x: NaN }, { x: NaN })).toBe(true);
  });
});
