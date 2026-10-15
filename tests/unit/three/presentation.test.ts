import { describe, it, expect } from 'vitest';
import { focaleVoulue, instantPromenade, minutesHeureDoree, adoucir, FOCALE_YEUX_DEG, FOCALE_VUE_DEG, TRAJET_MS, ARRET_MS, HEURE_DOREE_AVANT_COUCHER_MIN } from '../../../src/three/presentation.js';

describe('la camera et la presentation (R6)', () => {
  it('la focale passe de l oeil a la vue d ensemble avec la hauteur, sans saut', () => {
    expect(focaleVoulue(1.65)).toBe(FOCALE_YEUX_DEG);
    expect(focaleVoulue(40)).toBe(FOCALE_VUE_DEG);
    for (let h = 0; h < 10; h += 0.25) expect(Math.abs(focaleVoulue(h + 0.25) - focaleVoulue(h))).toBeLessThanOrEqual(1);
  });

  it('l heure doree tombe cinquante minutes avant le coucher', () => {
    const vesinet = { latitude: 48.905, longitude: 2.133 };
    const juin = minutesHeureDoree('2026-06-21', vesinet), decembre = minutesHeureDoree('2026-12-21', vesinet);
    expect(juin).toBeGreaterThan(20 * 60 + 40);
    expect(juin).toBeLessThan(21 * 60 + 30);
    expect(decembre).toBeGreaterThan(15 * 60);
    expect(decembre).toBeLessThan(16 * 60 + 30);
    expect(HEURE_DOREE_AVANT_COUCHER_MIN).toBe(50);
    expect(minutesHeureDoree('pas une date', vesinet)).toBeNull();
  });

  it('la promenade part du premier point de vue, s arrete sur chacun, finit au dernier', () => {
    const e = (x: number) => ({ position: { x, y: 1.6, z: 0 }, cible: { x: x + 1, y: 1.6, z: 0 } });
    const etapes = [e(0), e(10), e(20)];
    expect(instantPromenade(etapes, 0)?.position.x).toBe(0);
    expect(instantPromenade(etapes, TRAJET_MS / 2)?.position.x).toBeCloseTo(5);
    // A l'arret sur le deuxieme point de vue.
    expect(instantPromenade(etapes, TRAJET_MS + ARRET_MS / 2)?.position.x).toBeCloseTo(10);
    expect(instantPromenade(etapes, 2 * (TRAJET_MS + ARRET_MS) + 1)).toBeNull();
    expect(instantPromenade([e(0)], 0)).toBeNull();
    expect(adoucir(0)).toBe(0);
    expect(adoucir(1)).toBe(1);
  });
});
