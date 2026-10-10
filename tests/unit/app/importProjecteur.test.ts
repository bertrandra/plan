import { describe, it, expect } from 'vitest';
import { projecteurDuPlan } from '../../../src/app/importCadastre.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les lectures sous les toits (orthophoto, LiDAR) se font dans le repere du plan construit, dont
// l'origine est le calage cadastral de la parcelle - pas le point de l'adresse (MD/spec-toit-ign.md §10.3).

describe('projecteurDuPlan', () => {
  const repli = projecteurLocal(48.9, 2.13);
  it('prend l origine du calage cadastral de la parcelle du projet', () => {
    const parcelle = { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [], cadastre: { origineLat: 48.8942, origineLon: 2.1317 } } as unknown as ObjetPlan;
    const p = projecteurDuPlan([parcelle], repli);
    expect(p).not.toBe(repli);
    const o = p.versDegres(0, 0);
    expect(o.lat).toBeCloseTo(48.8942, 9);
    expect(o.lon).toBeCloseTo(2.1317, 9);
  });
  it('sans parcelle calee, celui de l import', () => {
    expect(projecteurDuPlan([], repli)).toBe(repli);
    const sansCalage = { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [], cadastre: {} } as unknown as ObjetPlan;
    expect(projecteurDuPlan([sansCalage], repli)).toBe(repli);
  });
});
