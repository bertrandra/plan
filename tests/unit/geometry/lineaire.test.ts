import { describe, it, expect } from 'vitest';
import { resoudreAugmentee } from '../../../src/geometry/lineaire.js';

describe('resoudreAugmentee (Gauss-Jordan, pivot partiel)', () => {
  it('resout un systeme 3 x 3 qui demande un echange de lignes', () => {
    const x = resoudreAugmentee([[0, 2, 1, 7], [1, 1, 1, 6], [2, 1, 3, 13]], 1e-12)!;
    expect(x[0]).toBeCloseTo(1, 12); expect(x[1]).toBeCloseTo(2, 12); expect(x[2]).toBeCloseTo(3, 12);
  });
  it('rend null pour un systeme singulier', () => {
    expect(resoudreAugmentee([[1, 2, 3], [2, 4, 6]], 1e-12)).toBeNull();
  });
});
