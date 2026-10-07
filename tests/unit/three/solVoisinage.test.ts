// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showErrBanner: () => {}, showToast: () => {} }));

import { demiCoteDuSol, type ContexteScene3d } from '../../../src/three/scene.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Le sol de la Vue 3D doit contenir toutes les parcelles affichees, voisinage visible compris, avec
// autant d'espace autour : un voisinage de 200 m depassait le sol taille sur la terrasse.

const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const objets = [
  { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: carre(-10, -10, 20) },
  { key: 'v', type: 'polygon', fonction: 'terrain', voisinage: true, pts: carre(150, 0, 20) },
  { key: 't', type: 'polygon', fonction: 'terrasse', pts: carre(-2, -2, 4) }
] as unknown as ObjetPlan[];
const ctx = (masque: (o: ObjetPlan) => boolean = () => false) => ({ objetMasque: masque }) as unknown as ContexteScene3d;
const cen = { x: 0, y: 0 };

describe('le sol de la Vue 3D', () => {
  it('couvre toutes les parcelles affichees, avec autant d espace autour', () => {
    const r = Math.hypot(170, 20);
    expect(demiCoteDuSol({ objects: objets, terrasseSelectedKey: 't' }, ctx(), cen, 6)).toBeCloseTo(2 * r, 6);
  });

  it('garde le sol de la camera quand le voisinage est masque, ou quand un objet est isole', () => {
    const sansVoisinage = demiCoteDuSol({ objects: objets, terrasseSelectedKey: 't' }, ctx(o => !!o.voisinage), cen, 6);
    expect(sansVoisinage).toBeCloseTo(Math.max(12, 2 * Math.hypot(10, 10)), 6);
    expect(demiCoteDuSol({ objects: objets, terrasseSelectedKey: 't', isolement: 't' }, ctx(), cen, 6)).toBe(12);
  });
});
