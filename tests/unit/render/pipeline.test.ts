// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const fond = vi.hoisted(() => ({ placer: vi.fn(), ortho: { actif: false, parcelleOpacite: 0.15 } }));
vi.mock('../../../src/render/ortho.js', () => ({ placerOrthophoto: fond.placer, ortho: fond.ortho }));

import { rendreScene, type ContexteRendu } from '../../../src/render/pipeline.js';
import type { EtatApp } from '../../../src/core/state.js';

// Le rendu d'une image du plan (render/pipeline.ts) : le fond, la grille, les parasols, chaque objet,
// puis les releves, l'echelle, le Nord, les cotes, et la structure de la terrasse selectionnee.

function monter(plus: Partial<EtatApp> = {}) {
  const ordre: string[] = [];
  const note = (nom: string) => vi.fn(() => { ordre.push(nom); });
  fond.placer.mockImplementation(() => { ordre.push('fond'); });
  const ctx = {
    drawGrid: note('grille'), renderParasolOverlay: note('parasols'), amenerPoigneesDevant: vi.fn(), objetMasque: () => false,
    rebuildHandles: vi.fn(), drawScaleBar: note('echelle'), drawNorthArrow: note('nord'), drawMeasures: note('cotes'),
    renderTerrasseLayerView: vi.fn(), estTerrain: () => false, renderReleves: note('releves')
  } as unknown as ContexteRendu;
  const etat = { objects: [{ key: 'parcelle' }, { key: 't' }], scene: { scale: 1, origine: { x: 0, y: 0 } }, selectedKey: 't',
    terrasseSelectedKey: 't', calquesVisibles: true, isolement: null, ...plus } as unknown as EtatApp;
  rendreScene(etat, ctx);
  return { ctx, ordre };
}

describe('rendreScene', () => {
  it('dessine dans l ordre : fond, grille, parasols, puis releves, echelle, Nord, cotes', () => {
    expect(monter().ordre).toEqual(['fond', 'grille', 'parasols', 'releves', 'echelle', 'nord', 'cotes']);
  });

  it('amene devant les poignees de la selection, jamais celles de la parcelle', () => {
    expect(monter().ctx.amenerPoigneesDevant).toHaveBeenCalledWith({ key: 't' });
    expect(monter({ selectedKey: 'parcelle' }).ctx.amenerPoigneesDevant).not.toHaveBeenCalled();
  });

  it('montre la structure de la terrasse selectionnee quand les calques sont visibles', () => {
    expect(monter().ctx.renderTerrasseLayerView).toHaveBeenCalledWith({ key: 't' });
    expect(monter({ calquesVisibles: false }).ctx.renderTerrasseLayerView).toHaveBeenCalledWith(null);
    // Une terrasse isolee montre sa structure, calques visibles ou non.
    expect(monter({ calquesVisibles: false, isolement: 't' }).ctx.renderTerrasseLayerView).toHaveBeenCalledWith({ key: 't' });
    expect(monter({ selectedKey: 'parcelle' }).ctx.renderTerrasseLayerView).toHaveBeenCalledWith(null);
  });
});
