import { describe, it, expect } from 'vitest';
import { cleFacade, facadeRetenue, facadesProposees } from '../../../../../src/app/audit/parcelle/reconnaissance.js';
import { facadesDuContour } from '../../../../../src/facade/geometrie.js';
import { obstacle } from '../../../../../src/geometry/ligneDeVue.js';
import type { PtBrut } from '../../../../../src/model/types.js';

// L'ordre des facades proposees (MD/spec-audit.md §6.1, §12.2) : celle que la boussole designe
// d'abord, puis les autres que l'on voit ; « Ce n'est pas cette façade » passe a la suivante.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const maison = rect(0, 10, 10, 20);
const garage = rect(14, 6, 20, 10);
const batiments = [{ cle: 'maison', facades: facadesDuContour(maison, 6) }, { cle: 'garage', facades: facadesDuContour(garage, 3) }];
const obstacles = [obstacle(maison), obstacle(garage)];

describe('les facades proposees', () => {
  it('met en tete celle que la boussole designe, puis les autres vues', () => {
    const pos = { x: 8, y: 2 };
    const versMaison = facadesProposees(pos, 350, batiments, obstacles);
    expect(versMaison[0]).toMatchObject({ cle: 'maison', facade: { orientation: 'Sud' } });
    const versGarage = facadesProposees(pos, 60, batiments, obstacles);
    expect(versGarage[0]?.cle).toBe('garage');
    // Les memes facades, dans un autre ordre.
    expect(versGarage.map((v) => cleFacade(v.cle, v.facade.cote)).sort()).toEqual(versMaison.map((v) => cleFacade(v.cle, v.facade.cote)).sort());
  });

  it('sans boussole, de la plus proche a la plus lointaine', () => {
    const v = facadesProposees({ x: 8, y: 2 }, null, batiments, obstacles);
    expect(v.map((x) => x.distance)).toEqual([...v.map((x) => x.distance)].sort((a, b) => a - b));
  });

  it('passe les facades ecartees', () => {
    const v = facadesProposees({ x: 8, y: 2 }, 350, batiments, obstacles);
    const premiere = v[0];
    expect(premiere).toBeDefined();
    const ecartees = new Set([cleFacade(premiere?.cle ?? '', premiere?.facade.cote ?? -1)]);
    expect(facadeRetenue(v, ecartees)).toBe(v[1] ?? null);
    expect(facadeRetenue(v, new Set(v.map((x) => cleFacade(x.cle, x.facade.cote))))).toBeNull();
  });
});
