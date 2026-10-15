import { describe, it, expect } from 'vitest';
import { cleFacade, facadeRetenue, facadesProposees, entreesReconnaissance } from '../../../../../src/app/audit/parcelle/reconnaissance.js';
import { facadesDuContour } from '../../../../../src/facade/geometrie.js';
import { obstacle } from '../../../../../src/geometry/ligneDeVue.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import type { ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

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

describe('ce que la reconnaissance regarde, et le verrou d un batiment', () => {
  const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
  const objets = [
    obj('parcelle', { fonction: 'terrain', pts: rect(-5, 0, 30, 30), cadastre: { idu: '78650000AE0101' } }),
    obj('voisine', { fonction: 'terrain', pts: rect(30, 0, 50, 30), voisinage: true }),
    obj('maison', { fonction: 'batiment', pts: maison, elevation: 6 }),
    obj('annexe', { fonction: 'batiment', pts: garage, elevation: 3 }),
    obj('chezVoisin', { fonction: 'batiment', pts: rect(32, 8, 42, 18), elevation: 6, voisinage: true, bdtopo: { surParcellePrincipale: false } }),
  ];
  const lignes = listeDeControle(objets, captureVide('78650000AE0101')).batiments;
  const cles = (e: ReturnType<typeof entreesReconnaissance>) => e.batiments.map((b) => b.cle).sort();

  it('ne propose que les batiments de la parcelle, mais garde tous les batiments comme obstacles', () => {
    const e = entreesReconnaissance(objets, lignes, { x: 8, y: 2 });
    expect(cles(e)).toEqual(['annexe', 'maison']);
    // La maison voisine est a 24 m de la prise : elle peut cacher un mur, elle n'en propose aucun.
    expect(e.obstacles).toHaveLength(3);
  });

  it('verrouille : seul le batiment choisi est propose, les autres cachent toujours la vue', () => {
    const e = entreesReconnaissance(objets, lignes, { x: 8, y: 2 }, 'annexe');
    expect(cles(e)).toEqual(['annexe']);
    expect(e.obstacles).toHaveLength(3);
    const v = facadesProposees({ x: 8, y: 2 }, 350, e.batiments, e.obstacles);
    expect(v.every((x) => x.cle === 'annexe')).toBe(true);
    // Cap plein nord, vers la maison : verrouille sur l'annexe, elle n'est jamais proposee.
    expect(facadesProposees({ x: 8, y: 2 }, 0, e.batiments, e.obstacles).some((x) => x.cle === 'maison')).toBe(false);
  });

  it('un verrou sur un batiment sans facade a prendre ne propose rien', () => {
    expect(entreesReconnaissance(objets, lignes, { x: 8, y: 2 }, 'chezVoisin').batiments).toEqual([]);
  });
});
