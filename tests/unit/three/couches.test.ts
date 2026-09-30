import { describe, it, expect } from 'vitest';
import { COUCHES_SOL, poserEnCouche } from '../../../src/three/primitives.js';

// Les couches posees a plat (three/primitives.ts). Depuis la 2.2.1, le sol vert est recule et la
// photo aerienne n'a plus de decalage : tiree vers la camera, elle passait devant les volumes bas vus
// de biais, et les massifs scintillaient en mode orthophoto.

describe('couches au sol', () => {
  it('recule le sol, et range orthophoto, terrain et chemins au-dessus de lui', () => {
    expect(COUCHES_SOL.fond).toBeLessThan(COUCHES_SOL.ortho);
    expect(COUCHES_SOL.fond).toBeLessThan(COUCHES_SOL.terrain);
    expect(COUCHES_SOL.terrain).toBeLessThan(COUCHES_SOL.chemin);
    expect(COUCHES_SOL.ortho).toBeLessThan(COUCHES_SOL.chemin);
  });

  it('ne tire pas la photo vers la camera', () => {
    const ortho = {} as Parameters<typeof poserEnCouche>[0];
    poserEnCouche(ortho, COUCHES_SOL.ortho);
    expect(Math.abs(ortho.polygonOffsetFactor)).toBe(0);
    expect(Math.abs(ortho.polygonOffsetUnits)).toBe(0);
  });

  it('pose un decalage de polygone d autant plus fort que la couche est haute', () => {
    const sol = {} as Parameters<typeof poserEnCouche>[0];
    const terrain = {} as Parameters<typeof poserEnCouche>[0];
    poserEnCouche(sol, COUCHES_SOL.fond);
    poserEnCouche(terrain, COUCHES_SOL.terrain);
    expect(terrain.polygonOffset).toBe(true);
    // Plus negatif = plus proche de la camera au test de profondeur : le terrain passe devant le sol.
    expect(terrain.polygonOffsetUnits).toBeLessThan(sol.polygonOffsetUnits);
    expect(terrain.polygonOffsetFactor).toBeLessThan(sol.polygonOffsetFactor);
    expect(sol.polygonOffsetFactor).toBeGreaterThan(0);
  });
});
