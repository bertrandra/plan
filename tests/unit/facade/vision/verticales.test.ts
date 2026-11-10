import { describe, expect, it } from 'vitest';
import { coinsSurLaVerticale, fuiteVerticaleDesSegments } from '../../../../src/facade/vision/verticales.js';
import type { Segment } from '../../../../src/facade/vision/segments.js';

// Des segments presque verticaux qui concourent en (480, -4000) : une photo prise vers le haut, dont les verticales se resserrent.
const V = { x: 480, y: -4000 };
function versLePoint(x: number, y1: number, y2: number): Segment {
  // Le segment de pied (x, y2) vers le point de fuite, coupe entre y1 et y2.
  const t = (y2 - y1) / (y2 - V.y);
  const x1 = x + (V.x - x) * t;
  return { x1, y1, x2: x, y2, longueur: Math.hypot(x1 - x, y2 - y1), force: 50 };
}

describe('le point de fuite des verticales lu sur la photo', () => {
  const segs = [100, 250, 400, 600, 750, 880].map((x) => versLePoint(x, 300, 1100));

  it('retrouve le point ou concourent les verticales, malgre un segment parasite', () => {
    const parasite: Segment = { x1: 500, y1: 400, x2: 560, y2: 900, longueur: Math.hypot(60, 500), force: 50 };
    const f = fuiteVerticaleDesSegments([...segs, parasite], 960, 1280);
    expect(f).not.toBeNull();
    const p = f?.point ?? [0, 0, 1];
    expect(p[0] / p[2]).toBeCloseTo(V.x, -1);
    expect(p[1] / p[2] / V.y).toBeCloseTo(1, 2);
    expect(f?.segments).toBe(6);
  });

  it('ne conclut pas sans assez de verticales', () => {
    expect(fuiteVerticaleDesSegments(segs.slice(0, 2), 960, 1280)).toBeNull();
  });

  it('ramene les cotes du quadrilatere sur le point, le pied immobile', () => {
    const coins = [{ x: 115, y: 150 }, { x: 845, y: 150 }, { x: 845, y: 1130 }, { x: 115, y: 1130 }];
    const c = coinsSurLaVerticale(coins, [V.x, V.y, 1]);
    expect(c).not.toBeNull();
    const [hg, hd, bd, bg] = c as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    expect(bd).toEqual(coins[2]);
    expect(bg).toEqual(coins[3]);
    expect(hg.y).toBeCloseTo(150, 6);
    expect(hd.y).toBeCloseTo(150, 6);
    // Les cotes visent le point : les haut se resserrent vers le milieu.
    expect(hg.x).toBeGreaterThan(115);
    expect(hd.x).toBeLessThan(845);
    expect((hg.x - bg.x) / (hg.y - bg.y)).toBeCloseTo((V.x - bg.x) / (V.y - bg.y), 6);
  });

  it('refuse un point sous le pied ou qui deforme trop le mur', () => {
    const coins = [{ x: 115, y: 150 }, { x: 845, y: 150 }, { x: 845, y: 1130 }, { x: 115, y: 1130 }];
    expect(coinsSurLaVerticale(coins, [480, 1200, 1])).toBeNull();
    expect(coinsSurLaVerticale(coins, [480, -300, 1])).toBeNull();
  });
});
