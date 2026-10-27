import { describe, it, expect } from 'vitest';
import { deplacementRigide, deplacerPoint } from '../../../src/geometry/deplacement.js';

// Le deplacement rigide d'un contour (MD/spec-ouvrages.md, etape 6.3) : reconnu quand le contour bouge d'un bloc, refuse s'il se
// deforme ou ne bouge pas.

const carre = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
const tourne = (pts: typeof carre, a: number, dx: number, dy: number) =>
  pts.map((p) => ({ x: Math.cos(a) * p.x - Math.sin(a) * p.y + dx, y: Math.sin(a) * p.x + Math.cos(a) * p.y + dy }));

describe('le deplacement rigide', () => {
  it('reconnait une translation', () => {
    const d = deplacementRigide(carre, carre.map((p) => ({ x: p.x + 2, y: p.y - 1 })));
    expect(d).not.toBeNull();
    expect(deplacerPoint(d!, { x: 10, y: 10 })).toEqual({ x: 12, y: 9 });
  });

  it('reconnait une rotation suivie d une translation', () => {
    const d = deplacementRigide(carre, tourne(carre, Math.PI / 6, 5, -2));
    expect(d!.angle).toBeCloseTo(Math.PI / 6, 12);
    const q = deplacerPoint(d!, { x: 1, y: 1 }), attendu = tourne([{ x: 1, y: 1 }], Math.PI / 6, 5, -2)[0]!;
    expect(q.x).toBeCloseTo(attendu.x, 9);
    expect(q.y).toBeCloseTo(attendu.y, 9);
  });

  it('refuse un contour deforme, un autre nombre de sommets, un contour immobile', () => {
    const tire = carre.map((p, i) => (i === 2 ? { x: 5, y: 3 } : p));
    expect(deplacementRigide(carre, tire)).toBeNull();
    expect(deplacementRigide(carre, carre.slice(0, 3))).toBeNull();
    expect(deplacementRigide(carre, carre.map((p) => ({ ...p })))).toBeNull();
  });
});
