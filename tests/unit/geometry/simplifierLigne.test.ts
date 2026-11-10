import { describe, it, expect } from 'vitest';
import { simplifierLigne } from '../../../src/geometry/simplifierLigne.js';

describe('simplifierLigne (Douglas-Peucker)', () => {
  it('garde la pointe d un pignon et retire les points alignes', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }, { x: 4, y: 0 }];
    expect(simplifierLigne(pts, 0.01)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 }]);
  });
  it('rend la corde quand rien ne s en ecarte plus que la tolerance', () => {
    expect(simplifierLigne([{ x: 0, y: 0 }, { x: 1, y: 0.005 }, { x: 2, y: 0 }], 0.01)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }]);
  });
});
