import { describe, it, expect } from 'vitest';
import { COUCHES_SOL, poserEnCouche } from '../../../src/three/primitives.js';

describe('couches au sol', () => {
  it('range terrain, orthophoto et chemins dans cet ordre, au-dessus du sol', () => {
    expect(0).toBeLessThan(COUCHES_SOL.terrain);
    expect(COUCHES_SOL.terrain).toBeLessThan(COUCHES_SOL.ortho);
    expect(COUCHES_SOL.ortho).toBeLessThan(COUCHES_SOL.chemin);
  });

  it('pose un decalage de polygone d autant plus fort que la couche est haute', () => {
    const terrain = {} as Parameters<typeof poserEnCouche>[0];
    const ortho = {} as Parameters<typeof poserEnCouche>[0];
    poserEnCouche(terrain, COUCHES_SOL.terrain);
    poserEnCouche(ortho, COUCHES_SOL.ortho);
    expect(ortho.polygonOffset).toBe(true);
    // Plus negatif = plus proche de la camera au test de profondeur : l'orthophoto passe devant le terrain.
    expect(ortho.polygonOffsetUnits).toBeLessThan(terrain.polygonOffsetUnits);
    expect(ortho.polygonOffsetFactor).toBeLessThan(terrain.polygonOffsetFactor);
  });
});
