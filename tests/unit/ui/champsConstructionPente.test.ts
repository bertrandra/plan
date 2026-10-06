import { describe, it, expect } from 'vitest';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import { champsVisibles, type ChampAlerte, type ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Les alertes DTU de l'etape Fondation sur un sol en pente (MD/spec-relief.md §6) : c'est le plot
// (ou la tete de vis) d'AVAL qui compte, pas la hauteur reglee au point haut.

function plane(a: number, nx = 100, ny = 100, pas = 0.5): Relief {
  const x0 = -19.75, y0 = 29.75;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + 100) * 100) / 100);
  return { source: 'lidar-hd', couche: 't', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: '10 cm', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: 100 };
}
function contexte(construction: Record<string, unknown>, relief: Relief | null): ContexteChamps {
  const obj = { key: 't', name: 'T', fonction: 'terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], construction } as unknown as ObjetPlan;
  const parcelle = { key: 'parcelle', name: 'P', fonction: 'terrain', type: 'polygon', pts: [{ x: -15, y: -15 }, { x: 25, y: -15 }, { x: 25, y: 25 }, { x: -15, y: 25 }], ...(relief ? { relief } : {}) } as unknown as ObjetPlan;
  const objets = [obj, parcelle];
  return { etat: { objects: objets, highlight: {} }, obj, objets, parcelle, construction: () => obj.construction } as unknown as ContexteChamps;
}
const alertes = (c: ContexteChamps) => sectionsConstruction({ visible: () => false }, c).flatMap(s => champsVisibles(s, c)).filter((ch): ch is ChampAlerte => ch.type === 'alerte');

describe('les alertes de fondation sur un sol en pente', () => {
  it('signale le plot d aval au-dela de 30 cm alors que la hauteur reglee est de 10 cm', () => {
    const plat = contexte({ typePose: 'plots', hauteurPlot: 10 }, null);
    expect(alertes(plat).map(a => a.cle)).not.toContain('alertePlot');
    // 8 % sur 6 m : 48 cm de plus en aval.
    const pente = contexte({ typePose: 'plots', hauteurPlot: 10 }, plane(-0.08));
    const a = alertes(pente).find(x => x.cle === 'alertePlot');
    expect(a).toBeDefined();
    expect(a!.texte(pente)).toMatch(/Sol en pente : le plot d'aval fait 5\d cm \(10 cm au point haut\)/);
    expect(a!.texte(pente)).toMatch(/poteaux sur massifs/);
  });

  it('signale la tete de vis d aval, et rien sur un terrain plat', () => {
    const plat = contexte({ typePose: 'vis-fondation', depassementVis: 2 }, null);
    expect(alertes(plat).map(a => a.cle)).not.toContain('alerteVis');
    const pente = contexte({ typePose: 'vis-fondation', depassementVis: 2 }, plane(-0.08));
    const a = alertes(pente).find(x => x.cle === 'alerteVis');
    expect(a).toBeDefined();
    expect(a!.texte(pente)).toMatch(/d'aval sort de 5\d cm \(2 cm au point haut\)/);
  });
});
