import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Un objet du voisinage s'enregistre allege (nuls, faux, noms par defaut, geometrie source) et se
// relit utilisable ; un objet dessine garde sa forme ecrite d'avant (empreinte de projet.json).

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
const voisine = {
  key: 'parcelle-b', type: 'polygon', name: 'AE 2', fill: '#EFE8D5', fillOpacity: 0.45, stroke: '#8A7B63', pts,
  vertexNames: ['Point 1', 'Point 2', 'Point 3'], segmentNames: ['Cote 1', 'Cote 2', 'Cote 3'], frozenVertices: [false, false, false],
  showName: true, showDims: false, fonction: 'terrain', locked: true, voisinage: true, textureVerticale: null,
  cadastre: { idu: 'B', section: 'AE', numero: '2', origineLat: 48.9, origineLon: 2.15, geometrieSource: { type: 'Polygon', coordinates: [[[2.15, 48.9]]] } },
  bdtopo: { couche: 'x', id: 'b', usage2: null }
} as unknown as ObjetPlan;

describe('l enregistrement du voisinage', () => {
  it('allege un objet du voisinage, qui se relit avec ses noms et ses sommets', () => {
    const [s] = serializeObjects([voisine]) as unknown as Record<string, unknown>[];
    for (const k of ['vertexNames', 'segmentNames', 'frozenVertices', 'showDims', 'textureVerticale']) expect(s, k).not.toHaveProperty(k);
    expect((s!.cadastre as Record<string, unknown>).geometrieSource).toBeUndefined();
    expect((s!.cadastre as Record<string, unknown>).idu).toBe('B');
    expect(s!.bdtopo).toEqual({ couche: 'x', id: 'b' });
    expect([s!.voisinage, s!.locked, s!.showName]).toEqual([true, true, true]);
    const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]) as unknown as Record<string, unknown>[];
    expect(relu!.vertexNames).toEqual(['Point 1', 'Point 2', 'Point 3']);
    expect(relu!.segmentNames).toEqual(['Cote 1', 'Cote 2', 'Cote 3']);
    expect(relu!.frozenVertices).toEqual([false, false, false]);
  });

  it('garde des noms choisis, et ne touche pas un objet dessine', () => {
    const nomme = { ...voisine, vertexNames: ['Nord', 'Est', 'Sud'] } as ObjetPlan;
    expect(serializeObjects([nomme])[0]).toHaveProperty('vertexNames', ['Nord', 'Est', 'Sud']);
    const dessine = { ...voisine, voisinage: false } as ObjetPlan;
    const [s] = serializeObjects([dessine]) as unknown as Record<string, unknown>[];
    expect(s).toHaveProperty('frozenVertices');
    expect(s).toHaveProperty('textureVerticale', null);
    expect((s!.cadastre as Record<string, unknown>).geometrieSource).toBeDefined();
  });
});
