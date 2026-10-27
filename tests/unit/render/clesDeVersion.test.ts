// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fond = vi.hoisted(() => ({ ortho: { actif: false, parcelleOpacite: 0.15 } }));
vi.mock('../../../src/render/ortho.js', () => ({ placerOrthophoto: vi.fn(), ortho: fond.ortho }));
const dessin = vi.hoisted(() => ({ positionner: vi.fn(), verifier: vi.fn() }));
vi.mock('../../../src/render/objects.js', () => ({ positionnerObjet: dessin.positionner, positionnerEnVerifiant: dessin.verifier }));

import { rendreObjets, type ContexteRendu } from '../../../src/render/pipeline.js';
import { vue } from '../../../src/render/vues.js';
import { toucher, toucherTout } from '../../../src/core/controleurObjets.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le plan ne redessine que l'objet qui a change (MD/spec-ouvrages.md, etape 6.1) : sa version, sa selection, et l'etat d'ensemble.

const ctx = { objetMasque: () => false, estTerrain: () => false, rebuildHandles: vi.fn() } as unknown as ContexteRendu;
let n = 0;
function plan() {
  const objets = ['a', 'b', 'c'].map((k) => ({ key: k + ++n, type: 'circle', center: { x: 0, y: 0 }, r: 1, fonction: 'autre' }) as unknown as ObjetPlan);
  objets.forEach((o) => { vue(o).el = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); });
  const etat = { objects: objets, scene: { scale: 10, origine: { x: 0, y: 0 }, W: 100, H: 100 }, selectedKey: null, isolement: null } as unknown as EtatApp;
  return { objets, etat };
}
const dessines = () => dessin.positionner.mock.calls.map((c) => (c[0] as ObjetPlan).key);

describe('les cles de version du dessin du plan', () => {
  beforeEach(() => { (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles = true; dessin.positionner.mockClear(); dessin.verifier.mockClear(); });
  afterEach(() => { delete (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles; });

  it('un second rendu sans changement ne redessine rien', () => {
    const { objets, etat } = plan();
    rendreObjets(etat, ctx, objets);
    expect(dessines()).toHaveLength(3);
    dessin.positionner.mockClear();
    rendreObjets(etat, ctx, objets);
    expect(dessines()).toEqual([]);
  });

  it('un objet touche est le seul redessine', () => {
    const { objets, etat } = plan();
    rendreObjets(etat, ctx, objets);
    dessin.positionner.mockClear();
    toucher(objets[1]);
    rendreObjets(etat, ctx, objets);
    expect(dessines()).toEqual([objets[1]!.key]);
  });

  it('la selection redessine l objet qui la prend et celui qui la quitte', () => {
    const { objets, etat } = plan();
    etat.selectedKey = objets[0]!.key;
    rendreObjets(etat, ctx, objets);
    dessin.positionner.mockClear();
    etat.selectedKey = objets[2]!.key;
    rendreObjets(etat, ctx, objets);
    expect(dessines()).toEqual([objets[0]!.key, objets[2]!.key]);
  });

  it('un zoom, ou une ecriture sans objet nomme, redessine tout', () => {
    const { objets, etat } = plan();
    rendreObjets(etat, ctx, objets);
    dessin.positionner.mockClear();
    etat.scene.scale = 20;
    rendreObjets(etat, ctx, objets);
    expect(dessines()).toHaveLength(3);
    dessin.positionner.mockClear();
    toucherTout();
    rendreObjets(etat, ctx, objets);
    expect(dessines()).toHaveLength(3);
  });

  it('en developpement, un objet inchange est verifie plutot que saute', () => {
    const { objets, etat } = plan();
    rendreObjets(etat, ctx, objets);
    delete (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles;
    rendreObjets(etat, ctx, objets);
    expect(dessin.verifier).toHaveBeenCalledTimes(3);
  });
});
