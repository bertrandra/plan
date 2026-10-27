import { describe, it, expect, vi } from 'vitest';
import { alignerObjetParRotation, definirCibleAlignement, type ContexteAlignement } from '../../../src/interaction/outilAlignement.js';
import { alignerSurCote } from '../../../src/geometry/alignement.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// L'outil « Aligner » : une forme dessinee tourne pour devenir parallele au cote designe ; une parcelle du cadastre, posee sur le
// terrain reel, ne tourne pas (decision du 27 octobre 2026).

const carre = () => [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
function contexte() {
  const ctx: ContexteAlignement = {
    measureSegCoords: () => ({ a: { x: 10, y: 0 }, b: { x: 10 + Math.cos(0.3), y: Math.sin(0.3) } }) as never,
    contourDeContrainte: () => null, nearestSegmentIndex: () => 0, alignerSurCote, pointInPolygon: () => true,
    pushHistory: vi.fn(), rebuildHandles: vi.fn(), render: vi.fn(), showToast: vi.fn()
  };
  return ctx;
}

describe('l outil Aligner', () => {
  it('fait tourner une forme dessinee', () => {
    definirCibleAlignement({ objKey: 'm', segIndex: 0 });
    const o = { key: 'd', type: 'polygon', pts: carre() } as unknown as ObjetPlan;
    const ctx = contexte();
    alignerObjetParRotation(o, null, '', ctx);
    expect(ctx.pushHistory).toHaveBeenCalled();
    expect((o as { pts: { x: number; y: number }[] }).pts).not.toEqual(carre());
  });

  it('ne tourne pas une parcelle du cadastre, et le dit', () => {
    definirCibleAlignement({ objKey: 'm', segIndex: 0 });
    const o = { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: carre(), cadastre: { idu: 'X' } } as unknown as ObjetPlan;
    const ctx = contexte();
    alignerObjetParRotation(o, null, '', ctx);
    expect(ctx.pushHistory).not.toHaveBeenCalled();
    expect((o as { pts: unknown }).pts).toEqual(carre());
    expect(String((ctx.showToast as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toMatch(/cadastre/);
  });
});
