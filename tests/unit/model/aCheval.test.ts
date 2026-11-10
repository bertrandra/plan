import { describe, it, expect } from 'vitest';
import { partsACheval, douteACheval, corpsQuiFranchissent, AIRE_A_CHEVAL_MIN_M2 } from '../../../src/model/aCheval.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Un batiment a cheval sur deux parcelles (MD/spec-toit-ign.md §13.8) : ses parts, et le doute qu'un
// corps qui franchit la limite laisse sur sa toiture.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const corps = (pts: PtBrut[]): CorpsToit => ({ pts, posFaitage: 4, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0.1 });
// Deux parcelles cote a cote, la limite en x = 8.
const parcelles = [
  { key: 'parcelle', pts: rect(-5, -5, 13, 20) },
  { key: 'p102', fonction: 'terrain', pts: rect(8, -5, 13, 20) },
];
const longere = { key: 'b1', fonction: 'batiment', pts: rect(0, 0, 16, 8) };

describe('partsACheval', () => {
  it('rend la part du batiment dans chaque parcelle, et son aire', () => {
    const parts = partsACheval(longere, [...parcelles, longere])!;
    expect(parts.map((x) => x.parcelle)).toEqual(['parcelle', 'p102']);
    expect(parts.map((x) => x.aire)).toEqual([64, 64]);
    parts[0]!.pts.forEach((q) => expect(q.x).toBeLessThanOrEqual(8 + 1e-6));
    parts[1]!.pts.forEach((q) => expect(q.x).toBeGreaterThanOrEqual(8 - 1e-6));
  });

  it('un trace qui deborde de quelques decimetres, ou une seule parcelle, n est pas a cheval', () => {
    expect(partsACheval({ ...longere, pts: rect(0, 0, 8.4, 8) }, parcelles)).toBeNull();
    expect(0.4 * 8).toBeLessThan(AIRE_A_CHEVAL_MIN_M2);
    expect(partsACheval({ ...longere, pts: rect(0, 0, 7, 8) }, parcelles)).toBeNull();
    expect(partsACheval(longere, [parcelles[0]!])).toBeNull();
  });
});

describe('douteACheval', () => {
  const parts = partsACheval(longere, parcelles);
  it('doute quand un corps passe par-dessus la limite', () => {
    const continu = [corps(rect(0, 0, 16, 8))];
    expect(douteACheval(continu, parts)).toBe(true);
    expect(corpsQuiFranchissent(continu, parts)).toHaveLength(1);
  });
  it('pas de doute quand les toits s arretent a la limite, ou sans corps', () => {
    expect(douteACheval([corps(rect(0, 0, 8, 8)), corps(rect(8, 0, 8, 8))], parts)).toBe(false);
    // Un corps qui ne mord que d'un metre carre sur la voisine ne franchit pas.
    expect(douteACheval([corps(rect(0, 0, 8.25, 8)), corps(rect(8.25, 0, 7.75, 8))], parts)).toBe(false);
    expect(douteACheval(null, parts)).toBe(false);
    expect(douteACheval([corps(rect(0, 0, 16, 8))], null)).toBe(false);
  });
});
