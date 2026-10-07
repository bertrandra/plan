// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showErrBanner: () => {}, showToast: () => {} }));

import { bornesDuSol, MARGE_SOL_M, type ContexteScene3d } from '../../../src/three/scene.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Le sol de la Vue 3D couvre toutes les parcelles affichees, voisinage visible compris, plus
// 10 m de chaque cote : ni plus (il etait deux fois trop grand), ni moins.

const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const objets = [
  { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: carre(-10, -10, 20) },
  { key: 'v', type: 'polygon', fonction: 'terrain', voisinage: true, pts: carre(150, 0, 20) },
  { key: 't', type: 'polygon', fonction: 'terrasse', pts: carre(-2, -2, 4) }
] as unknown as ObjetPlan[];
const ctx = (masque: (o: ObjetPlan) => boolean = () => false) => ({ objetMasque: masque }) as unknown as ContexteScene3d;
const cen = { x: 0, y: 0 };

describe('le sol de la Vue 3D', () => {
  it('couvre les parcelles affichees plus 10 m de chaque cote', () => {
    expect(MARGE_SOL_M).toBe(10);
    expect(bornesDuSol({ objects: objets, terrasseSelectedKey: 't' }, ctx(), cen, 6)).toEqual({ xMin: -20, xMax: 180, yMin: -20, yMax: 30 });
  });

  it('suit le voisinage masque ; reprend le carre de la camera sans parcelle ou pour un objet isole', () => {
    expect(bornesDuSol({ objects: objets, terrasseSelectedKey: 't' }, ctx(o => !!o.voisinage), cen, 6)).toEqual({ xMin: -20, xMax: 20, yMin: -20, yMax: 20 });
    expect(bornesDuSol({ objects: objets, terrasseSelectedKey: 't', isolement: 't' }, ctx(), cen, 6)).toEqual({ xMin: -12, xMax: 12, yMin: -12, yMax: 12 });
    expect(bornesDuSol({ objects: [objets[2]!], terrasseSelectedKey: 't' }, ctx(), cen, 6)).toEqual({ xMin: -12, xMax: 12, yMin: -12, yMax: 12 });
  });
});
