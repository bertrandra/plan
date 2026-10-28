import { describe, it, expect } from 'vitest';
import { traceAuPlan } from '../../../src/render/ouvrages/index.js';
import { OUVRAGES } from '../../../src/model/ouvrages/index.js';

// Le registre du plan (etape 6.4) remplace les comparaisons du dessin (`fonction === 'camera'`, `=== 'limite'`) : il rend les
// memes habits, aux memes fonctions, et rien aux autres.
describe('le registre des ouvrages du plan', () => {
  it('habille le point de vue et la limite comme avant, et rien d autre', () => {
    const habilles = [...OUVRAGES.map((o) => o.fonction), 'inconnue', undefined, null]
      .map((f) => [f, traceAuPlan(f)] as const).filter(([, h]) => Object.keys(h).length);
    expect(habilles).toEqual([['limite', { pointille: '10 7' }], ['camera', { pointDeVue: true }]]);
  });
});
