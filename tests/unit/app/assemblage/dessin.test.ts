// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creerSurface } from '../../../../src/app/assemblage/surface.js';
import { creerDessin } from '../../../../src/app/assemblage/dessin.js';
import { rendreObjets, type ContexteRendu } from '../../../../src/render/pipeline.js';
import { vue } from '../../../../src/render/vues.js';
import { creerEtat } from '../../../../src/core/state.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Le calque des objets porte le repere du dessin (render/objects.ts) : un element en pixels y porte la transformation inverse, et
// rien hors de lui. Un element que l'empilement en sort change donc de transformation : son objet se replace, meme inchange
// (MD/roadmap-architecture.md, etape 2.3 ; fumee, points 97 et 98 en classe compacte).

describe('les poignees sorties du calque des objets', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage"></div><div id="zoneAtelier"></div>';
    (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles = true;
  });
  afterEach(() => { delete (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles; });

  it('des poignees recreees dans le calque, puis remontees devant tout, perdent la transformation inverse', () => {
    const maison = {
      key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', fill: '#ccc', fillOpacity: 0.6, stroke: '#333', showName: true,
      pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }]
    } as unknown as ObjetPlan;
    const etat = creerEtat({ objects: [maison] } as never, (o) => o as ObjetPlan[]);
    etat.selectedKey = 'maison';
    const surface = creerSurface(etat);
    const dessin = creerDessin(etat, surface, { insererSommetAuClic: () => {}, contexteSoleil: () => ({}) as never });
    const ctx = {
      objetMasque: () => false, estTerrain: () => false, rebuildHandles: dessin.rebuildHandles, groupeObjets: surface.objets
    } as unknown as ContexteRendu;
    dessin.createObjectDOM(maison);
    dessin.rebuildHandles(maison);
    dessin.suivreLaVue();
    rendreObjets(etat, ctx, etat.objects);
    const poignee = vue(maison).pointEls[0]!;
    // Dans le calque : la transformation inverse.
    expect(poignee.parentNode).toBe(surface.objets);
    expect(poignee.getAttribute('transform')).toMatch(/^matrix\(/);
    // Le rendu suivant les remonte devant tout, hors du calque, sans que la maison change.
    dessin.amenerPoigneesDevant(maison);
    rendreObjets(etat, ctx, etat.objects);
    expect(poignee.parentNode).toBe(surface.svg);
    expect(poignee.hasAttribute('transform')).toBe(false);
  });
});
