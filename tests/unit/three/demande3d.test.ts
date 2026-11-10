import { describe, it, expect } from 'vitest';
import { avecMoteur3d, chargerMoteur3d, moteur3d } from '../../../src/three/demande3d.js';

// Le moteur de la 3D, charge a la demande (AD-10) : rien avant le premier besoin, puis le meme module pour tous.
describe('le moteur de la 3D a la demande', () => {
  it('n’est pas la avant le premier besoin, puis sert tout de suite', async () => {
    expect(moteur3d()).toBeNull();
    const m = await chargerMoteur3d();
    expect(typeof m.buildThreeScene).toBe('function');
    expect(moteur3d()).toBe(m);
    // Charge : le geste se fait dans le meme tour, sans attendre.
    let vu: unknown = null;
    avecMoteur3d((x) => { vu = x; });
    expect(vu).toBe(m);
    expect(await chargerMoteur3d()).toBe(m);
  }, 30000);
});
