// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { creerTiroir, ONGLETS } from '../../../src/app/tiroir.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerEtat } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// L'onglet PLU porte le nombre d'ecarts du projet aux regles retenues (app/tiroir.ts, `pastille`).

function tiroir(ecarts?: () => number) {
  const etat = creerEtat({}, (o) => o as ObjetPlan[]);
  return creerTiroir(etat, { refreshTerrasseView: () => {}, terrasseSelectionnee: () => undefined, piscineSelectionnee: () => undefined, abriSelectionne: () => undefined,
    ...(ecarts ? { ecartsPlu: ecarts } : {}) }, creerMagasin(etat));
}
const plu = (t: ReturnType<typeof tiroir>) => t.onglets().find((o) => o.id === 'plu')!;

describe('la pastille de l’onglet PLU', () => {
  it('porte le nombre d’ecarts, dit en mots, et suit ce nombre', () => {
    let n = 2;
    const t = tiroir(() => n);
    expect(plu(t).pastille).toEqual({ nombre: 2, dit: '2 écarts au PLU' });
    n = 1;
    expect(plu(t).pastille).toEqual({ nombre: 1, dit: '1 écart au PLU' });
    // Les autres onglets n'en portent pas.
    expect(t.onglets().filter((o) => o.pastille).map((o) => o.id)).toEqual(['plu']);
  });

  it('disparait sans ecart, et le catalogue des onglets n’en porte jamais', () => {
    expect(plu(tiroir(() => 0)).pastille).toBeUndefined();
    expect(plu(tiroir()).pastille).toBeUndefined();
    expect(ONGLETS.some((o) => o.pastille)).toBe(false);
  });
});
