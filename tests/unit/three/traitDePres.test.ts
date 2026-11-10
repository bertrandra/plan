import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { apparenceDuTrait, aretesDe, poserTraitDePres, traitDePresPose, TRAIT_MAX_PX, TRAIT_MIN_PX } from '../../../src/three/traitDePres.js';

// Le trait renforce de la facade vue de pres (three/traitDePres.ts) : les aretes franches du batiment
// vise, plus epaisses et plus opaques de pres ; rien sans scene.

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

describe('le trait renforce de pres', () => {
  it('s epaissit et se fonce avec la force, entre ses bornes', () => {
    const faible = apparenceDuTrait(0.1), moyen = apparenceDuTrait(0.5), plein = apparenceDuTrait(1);
    expect(faible.largeurPx).toBeLessThan(moyen.largeurPx);
    expect(moyen.largeurPx).toBeLessThan(plein.largeurPx);
    expect(faible.opacite).toBeLessThan(plein.opacite);
    expect(plein.largeurPx).toBe(TRAIT_MAX_PX);
    expect(apparenceDuTrait(0).largeurPx).toBe(TRAIT_MIN_PX);
    expect(apparenceDuTrait(3)).toEqual(plein);
  });

  it('ne garde que les aretes franches : douze pour une boite, pas les diagonales de ses faces', () => {
    const boite = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(10, 6, 8));
    boite.position.set(5, 3, 0);
    const p = aretesDe([boite]);
    expect(p.length).toBe(12 * 2 * 3);
    // Placees dans le repere de la scene : la boite posee a x = 5 va de 0 a 10.
    const xs = Array.from(p).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
  });

  it('ne pose rien sans scene, et se retire a force nulle', () => {
    poserTraitDePres('maison', 1);
    expect(traitDePresPose()).toBeNull();
    poserTraitDePres(null, 0);
    expect(traitDePresPose()).toBeNull();
  });
});
