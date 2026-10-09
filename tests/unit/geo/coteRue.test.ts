import { describe, it, expect } from 'vitest';
import { coteRueDevine, cotesSansMitoyen, pointAdresse, DISTANCE_ADRESSE_MAX_M } from '../../../src/geo/coteRue.js';
import { coteDAcces, clotureDe, reglerCote } from '../../../src/model/cloture.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Le cote sur rue devine (geo/coteRue.ts) : le point d'adresse sur la voirie d'abord, sinon le
// plus long des cotes sans voisine accolee ; rien sans information. Le portail neuf s'y pose.

const rect = (x0: number, y0: number, l: number, h: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + h }, { x: x0, y: y0 + h }];
const lat0 = 48.9, lon0 = 2.15, proj = projecteurLocal(lat0, lon0);
const deg = (p: PtBrut) => proj.versDegres(p.x, p.y);
const parcelle = (pts: PtBrut[], adresse: PtBrut | null, idu = 'P'): ObjetPlan => {
  const a = adresse ? deg(adresse) : null;
  return { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts, cadastre: { idu, origineLat: lat0, origineLon: lon0, ...(a ? { adresseLat: a.lat, adresseLon: a.lon } : {}) } } as unknown as ObjetPlan;
};
const voisine = (key: string, pts: PtBrut[]): ObjetPlan => ({ key, type: 'polygon', fonction: 'terrain', pts, cadastre: { idu: key } } as unknown as ObjetPlan);
// Une parcelle de 20 x 30 m, le cote 0 (y = 0) au sud.
const p = rect(0, 0, 20, 30);

describe('coteRueDevine', () => {
  it('prend le cote le plus pres du point d adresse, pose sur la voirie', () => {
    const pc = parcelle(p, { x: 10, y: -4 });
    expect(pointAdresse(pc)!.x).toBeCloseTo(10, 3);
    expect(coteRueDevine(pc, [pc])).toBe(0);
    expect(coteRueDevine(parcelle(p, { x: 24, y: 15 }), [])).toBe(1);
  });

  it('ignore un point d adresse dans la parcelle, ou trop loin, et se rabat sur les voisines', () => {
    const dedans = parcelle(p, { x: 10, y: 10 });
    // Voisines a l'est, au nord et a l'ouest : seul le sud est libre.
    const voisines = [voisine('E', rect(20, 0, 20, 30)), voisine('N', rect(0, 30, 20, 20)), voisine('O', rect(-20, 0, 20, 30))];
    expect(cotesSansMitoyen(dedans, [dedans, ...voisines])).toEqual([true, false, false, false]);
    expect(coteRueDevine(dedans, [dedans, ...voisines])).toBe(0);
    const loin = parcelle(p, { x: 10, y: -DISTANCE_ADRESSE_MAX_M - 5 });
    expect(coteRueDevine(loin, [loin, ...voisines])).toBe(0);
    // Deux cotes libres : le plus long (l'est, 30 m) plutot que le sud (20 m).
    expect(coteRueDevine(dedans, [dedans, voisines[1]!, voisines[2]!])).toBe(1);
  });

  it('ne devine rien sans point d adresse ni voisine', () => {
    const pc = parcelle(p, null);
    expect(cotesSansMitoyen(pc, [pc])).toBeNull();
    expect(coteRueDevine(pc, [pc])).toBeNull();
    expect(coteRueDevine({ key: 'parcelle', type: 'polygon', pts: [] } as unknown as ObjetPlan, [])).toBeNull();
  });

  it('coteDAcces : le cote dit sur rue, sinon le devine, sinon le plus long', () => {
    const pc = parcelle(p, null);
    const cl = clotureDe(pc, true);
    expect(coteDAcces(cl, p, null)).toBe(1);
    expect(coteDAcces(cl, p, 0)).toBe(0);
    reglerCote(cl, 2).limite = 'rue';
    expect(coteDAcces(cl, p, 0)).toBe(2);
  });
});
