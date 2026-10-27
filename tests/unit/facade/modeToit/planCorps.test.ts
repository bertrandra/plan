import { describe, it, expect } from 'vitest';
import { ligneDeFaitage, marqueursDuCorps, orientationDuCorps } from '../../../../src/facade/modeToit/planCorps.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

// Un corps de 10 x 6 : faitage le long de x, a y = 3 ; egouts 3 m, faitage 5,5 m.
const corps = (extra: Partial<CorpsToit> = {}): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 5.5, egouts: [3, 3], pignons: [], ecart: 0.1, ...extra });
const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 3, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } as unknown as ObjetPlan);

describe('la ligne de faitage du mode Plan', () => {
  it('suit le faitage du bout a bout, raccourcie par les croupes', () => {
    const l = ligneDeFaitage(corps())!;
    expect(l.genre).toBe('plein');
    expect([l.a.x, l.a.y, l.b.x, l.b.y]).toEqual([0, 3, 10, 3]);
    const c = ligneDeFaitage(corps({ croupes: [2, 2] }))!;
    expect([c.a.x, c.b.x]).toEqual([2, 8]);
  });
  it('un appentis a son faitage sur le mur, un pavillon un sommet, un toit plat rien', () => {
    const a = ligneDeFaitage(corps({ posFaitage: 0, egouts: [3, 3] }))!;
    expect(a.a.y).toBe(0);
    expect(ligneDeFaitage(corps({ posFaitage: 3, croupes: [5, 5] }))!.genre).toBe('sommet');
    expect(ligneDeFaitage(corps({ faitage: 3.05 }))).toBeNull();
  });
});

describe('les marqueurs du mode Plan', () => {
  it('un par element pose, a sa place sur le toit', () => {
    const o = maison();
    for (const id of ['forme:deux-pans', 'sur:pignon', 'sur:cheminee', 'sur:fenetre-toit', 'sur:solaire', 'sur:jacobine']) appliquerPiece(o, id);
    const m = marqueursDuCorps(o.batiment?.corpsToit![0]!);
    expect(m.map((x) => x.type).sort()).toEqual(['cheminee', 'fenetre-toit', 'lucarne', 'pignon', 'solaire']);
    for (const x of m) { expect(x.x).toBeGreaterThanOrEqual(-0.01); expect(x.x).toBeLessThanOrEqual(10.01); expect(x.y).toBeGreaterThanOrEqual(-0.01); expect(x.y).toBeLessThanOrEqual(6.01); }
  });
});

describe('l orientation du corps', () => {
  it('est l angle du faitage, de 0 a 180 degres', () => {
    expect(orientationDuCorps(corps())).toBe(0);
    const c = corps({ pts: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: -6, y: 10 }, { x: -6, y: 0 }] });
    expect(orientationDuCorps(c)).toBeCloseTo(90, 5);
  });
});
