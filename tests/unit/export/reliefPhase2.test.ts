import { describe, it, expect } from 'vitest';
import { ouvragesDeclares } from '../../../src/export/cerfa13703.js';
import { pageFacades, pagePlanDeMasse, pageProfil } from '../../../src/export/piecesDP.js';
import { computeImplantation } from '../../../src/engine/implantation.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { solDuProjet } from '../../../src/engine/sol.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Phase 2 du relief (MD/spec-relief.md §6) dans les pieces et le cerfa : la hauteur declaree se
// mesure depuis le terrain naturel au point bas, l'implantation dit la hauteur de chaque appui.

function plane(a: number, b: number, nx = 100, ny = 100, pas = 0.5): Relief {
  const x0 = -19.75, y0 = 29.75;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + b * (y0 - j * pas) + 100) * 100) / 100);
  return { source: 'lidar-hd', couche: 't', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: '10 cm', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: 100 };
}
const parcelle = (r: Relief | null): ObjetPlan => ({ key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: -15, y: -15 }, { x: 25, y: -15 }, { x: 25, y: 25 }, { x: -15, y: 25 }], ...(r ? { relief: r } : {}) } as ObjetPlan);
const pergola: ObjetPlan = { key: 'p', name: 'Pergola', type: 'polygon', fonction: 'pergola', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], pergola: {} } as ObjetPlan;
const terrasse: ObjetPlan = { key: 't', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', pts: [{ x: 6, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 4 }, { x: 6, y: 4 }], construction: { typePose: 'plots', hauteurPlot: 6 } } as ObjetPlan;
const meta = { appVersion: '0', date: '2026-10-06', references: 'AE 101' };
const plat = [parcelle(null), pergola, terrasse], pente = [parcelle(plane(-0.08, 0)), pergola, terrasse];

describe('la hauteur declaree sur un sol en pente', () => {
  it('se mesure depuis le point bas du terrain naturel dans le cerfa et sur le plan de masse', () => {
    const hPlat = ouvragesDeclares(plat).find(o => o.nature !== 'terrasse')!.hauteur;
    const hPente = ouvragesDeclares(pente).find(o => o.nature !== 'terrasse')!.hauteur;
    expect(hPente).toBeCloseTo(hPlat + 0.32, 2);
    const masse = pagePlanDeMasse(pente, meta)!.contenu, massePlat = pagePlanDeMasse(plat, meta)!.contenu;
    const hMax = (s: string) => /H max ([\d,]+) m/.exec(s)?.[1];
    expect(hMax(massePlat)).toBeDefined();
    expect(hMax(masse)).not.toBe(hMax(massePlat));
  });

  it('dessine les facades depuis la ligne de sol au point bas et le dit', () => {
    const avec = pageFacades(pergola, meta, solDuProjet(pente))!.contenu, sans = pageFacades(pergola, meta, null)!.contenu;
    expect(avec).toMatch(/Sol en pente/);
    expect(sans).not.toMatch(/Sol en pente/);
    expect(pageFacades(pergola, meta)!.contenu).toBe(sans);
  });

  it('coupe la terrasse a son dessus au-dessus du zero du plan dans le profil DP3', () => {
    expect(pageProfil(pente, meta)).not.toBeNull();
    expect(pageProfil(plat, meta)).toBeNull();
  });
});

describe('l implantation sur un sol en pente', () => {
  it('donne la hauteur de chaque appui, et rien sans relief', () => {
    const layers = computeTerrasseLayers(terrasse, pente);
    const avec = computeImplantation(terrasse, layers, solDuProjet(pente)), sans = computeImplantation(terrasse, layers);
    expect(sans.appuis.every(a => a.hauteurMm === undefined)).toBe(true);
    expect(avec.appuis.every(a => a.hauteurMm !== undefined && a.hauteurMm >= 60)).toBe(true);
    expect(Math.max(...avec.appuis.map(a => a.hauteurMm ?? 0))).toBeGreaterThan(400);
    expect(avec.lignes.some(l => l.appuis.some(a => a.hauteurMm !== undefined))).toBe(true);
    // `R.vers` est une fermeture : on compare les donnees, pas les fonctions.
    expect(JSON.parse(JSON.stringify(computeImplantation(terrasse, layers, null)))).toEqual(JSON.parse(JSON.stringify(sans)));
  });
});
