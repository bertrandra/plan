import { describe, it, expect } from 'vitest';
import { profilsDuPlan } from '../../../src/core/profilsRues.js';
import { parcellesConnues } from '../../../src/model/trottoirs.js';
import { tracerRues } from '../../../src/model/rues.js';
import type { ChausseeRue, ObjetPlan, PtBrut } from '../../../src/model/types.js';
import type { StationRue } from '../../../src/model/trottoirs.js';

// Les profils des rues dessinees du plan, gardes d'un dessin a l'autre (MD/spec-rues.md §8).

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const rue: ChausseeRue = { nature: 'Route à 1 chaussée', largeurM: 7, nom: 'Allée des Limites', pts: [{ x: -30, y: 0 }, { x: 30, y: 0 }] };
const milieu = (stations: StationRue[]) => stations.find((s) => Math.abs(s.x) < 1e-9)!;

describe('les profils du plan', () => {
  const plan = (part?: number) => {
    const p = {
      key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(-40, 5, 40, 30),
      voisinage3d: { rues: { afficher: false, tracer: true, ...(part ? { partTrottoirs: part } : {}) } },
      ruesVoisinage: { recupereLe: '', rayonM: 250, rues: [], chaussees: [rue] },
    } as unknown as ObjetPlan;
    const voisine = { key: 'v1', fonction: 'terrain', type: 'polygon', voisinage: true, pts: rect(-40, -30, 40, -5) } as unknown as ObjetPlan;
    return [p, voisine];
  };
  it('lisent la parcelle du projet et les voisines du cadastre', () => {
    const objets = plan();
    expect(parcellesConnues(objets).map((p) => p.projet)).toEqual([true, false]);
    const s = milieu(profilsDuPlan(objets)[0]!.stations);
    expect(s.trottoirG).toBeCloseTo(5, 9);
    expect(s.trottoirD).toBeCloseTo(-5, 9);
  });
  it('se gardent tant que rien ne change, et suivent la part', () => {
    const objets = plan();
    expect(profilsDuPlan(objets)).toBe(profilsDuPlan(objets));
    const s = milieu(profilsDuPlan(plan(30))[0]!.stations);
    expect(s.chausseeG - s.chausseeD).toBeCloseTo(4, 9);
  });
  it('ne donnent rien sans l option', () => {
    const [p, v] = plan();
    tracerRues(p!, false);
    expect(profilsDuPlan([p!, v!])).toEqual([]);
  });
});

