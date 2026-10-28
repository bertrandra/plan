// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { cleVue3d } from '../../../../src/zones/vue3d/Vue3d.js';
import { CLE_GELEE } from '../../../../src/zones/composants/abonnement.js';
import type { EtatMagasin } from '../../../../src/app/magasin.js';

// La cle de la Vue 3D (etape 6.5) : montree, elle ne suit pas chaque rendu du plan, sauf en session du toit, ou le panneau du mode
// pose l'indice et les poignees d'apres la session et la camera (le garde-fou `[cle de version]` l'a trouve au point 98).

const etat = { objects: [], measures: [], selectedKey: null, isolement: null };
const magasin = (version: number, vue = 'vue3d'): EtatMagasin => ({ version, vue, etat } as unknown as EtatMagasin);
const commandes = { etat: () => ({ utilisable: true }) } as unknown as Parameters<typeof cleVue3d>[1];
const vues = { libelleLieu: () => 'Le Vésinet' };

describe('la cle de la Vue 3D', () => {
  it('cachee sur le plan, elle est gelee', () => {
    expect(cleVue3d(magasin(1, 'plan'), commandes, vues, false)).toBe(CLE_GELEE);
  });

  it('montree, hors session du toit, elle ne change pas a chaque rendu du plan', () => {
    expect(cleVue3d(magasin(1), commandes, vues, false)).toBe(cleVue3d(magasin(2), commandes, vues, false));
  });

  it('en session du toit, elle suit chaque rendu du plan, comme le panneau du mode', () => {
    expect(cleVue3d(magasin(1), commandes, vues, true)).not.toBe(cleVue3d(magasin(2), commandes, vues, true));
  });
});
