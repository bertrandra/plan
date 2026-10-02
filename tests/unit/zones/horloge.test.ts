import { describe, expect, it } from 'vitest';
import { anglesAiguilles } from '../../../src/zones/vue3d/Horloge.js';

describe('horloge du soleil', () => {
  it('pose les aiguilles sur l heure du soleil', () => {
    expect(anglesAiguilles(0)).toEqual({ heures: 0, minutes: 0 });
    expect(anglesAiguilles(15 * 60)).toEqual({ heures: 90, minutes: 0 });
    expect(anglesAiguilles(9 * 60 + 30)).toEqual({ heures: 285, minutes: 180 });
  });
  it('fait le tour du cadran a midi et a minuit', () => {
    expect(anglesAiguilles(12 * 60)).toEqual({ heures: 0, minutes: 0 });
    expect(anglesAiguilles(1440)).toEqual({ heures: 0, minutes: 0 });
  });
});
