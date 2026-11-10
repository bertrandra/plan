import { describe, it, expect, vi } from 'vitest';
import { creerRegistre, type Droits } from '../../../../src/app/commandes.js';
import { brancherPositionGps, positionDansLePlan, LOIN_DU_PROJET_M } from '../../../../src/app/ecouteurs/positionGps.js';
import { SansPosition, type PositionGps } from '../../../../src/shell/geolocalisation.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import { fauxAtelier } from './faux.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// « Ma position (3D) » : une preference d'affichage, decochee par defaut, qui suit le GPS et ne fait
// que deplacer le marqueur de la Vue 3D (three/positionGps3d.ts).

const tout: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => true, reste: () => null };
const origine = { lat: 48.9, lon: 2.13 };
const cale = [{ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], cadastre: { origineLat: origine.lat, origineLon: origine.lon } }] as unknown as ObjetPlan[];
const gps = (x: number, y: number, precisionM = 5): PositionGps => {
  const d = projecteurLocal(origine.lat, origine.lon).versDegres(x, y);
  return { lat: d.lat, lon: d.lon, precisionM };
};

function monter(objets = cale) {
  const a = fauxAtelier({ objects: objets, positionGps: false } as never);
  let sur: ((p: PositionGps) => void) | null = null, erreur: ((e: SansPosition) => void) | null = null;
  const arreter = vi.fn();
  const d = {
    suivre: vi.fn((s: (p: PositionGps) => void, e: (e: SansPosition) => void) => { sur = s; erreur = e; return arreter; }),
    disponible: () => true, poser: vi.fn(), retirer: vi.fn(), signaler: vi.fn(),
  };
  const cmd = creerRegistre(tout);
  brancherPositionGps(a, cmd, d);
  return { a, cmd, d, arreter, sur: (p: PositionGps) => sur!(p), erreur: (e: SansPosition) => erreur!(e) };
}

describe('ma position dans la Vue 3D', () => {
  it('ramene la position dans le repere du plan, et rien sans calage du cadastre', () => {
    const p = positionDansLePlan(cale, gps(12, -7))!;
    expect(p.x).toBeCloseTo(12, 6); expect(p.y).toBeCloseTo(-7, 6);
    expect(positionDansLePlan([{ key: 'parcelle', fonction: 'terrain' }] as unknown as ObjetPlan[], gps(0, 0))).toBeNull();
  });

  it('decochee par defaut ; cochee, chaque position deplace le marqueur sans rien d autre ; decochee, le suivi s arrete', () => {
    const { a, cmd, d, arreter, sur } = monter();
    expect(a.etat.positionGps).toBe(false);
    cmd.executer('affichage.positionGps');
    expect(a.etat.positionGps).toBe(true);
    expect(d.suivre).toHaveBeenCalledTimes(1);
    sur(gps(3, 4, 8)); sur(gps(3.5, 4.2, 6));
    expect(d.poser).toHaveBeenCalledTimes(2);
    const [p, precision] = d.poser.mock.calls[1]!;
    expect(p.x).toBeCloseTo(3.5, 6); expect(precision).toBe(6);
    // Une preference d'affichage : ni historique, ni projet modifie, ni rendu du plan.
    expect(a.pushHistory).not.toHaveBeenCalled(); expect(a.markDirty).not.toHaveBeenCalled(); expect(a.render).not.toHaveBeenCalled();
    cmd.executer('affichage.positionGps');
    expect(arreter).toHaveBeenCalledTimes(1);
    expect(d.retirer).toHaveBeenCalledTimes(1);
    expect(a.etat.positionGps).toBe(false);
  });

  it('previent une fois quand on est loin du projet, et s arrete sur un plan sans calage', () => {
    const { d, cmd, sur } = monter();
    cmd.executer('affichage.positionGps');
    sur(gps(LOIN_DU_PROJET_M + 500, 0)); sur(gps(LOIN_DU_PROJET_M + 600, 0));
    expect(d.signaler).toHaveBeenCalledTimes(1);
    expect(d.signaler.mock.calls[0]![0]).toMatch(/2,5 km du projet/);
    expect(d.poser).toHaveBeenCalledTimes(2);
    const sans = monter([{ key: 'parcelle', fonction: 'terrain' }] as unknown as ObjetPlan[]);
    sans.cmd.executer('affichage.positionGps');
    sans.sur(gps(0, 0));
    expect(sans.d.poser).not.toHaveBeenCalled();
    expect(sans.d.signaler.mock.calls[0]![0]).toMatch(/pas calé sur le cadastre/);
    expect(sans.a.etat.positionGps).toBe(false);
  });

  it('un refus arrete le suivi en le disant ; un signal perdu ou lent est attendu, et dit une fois', () => {
    const { a, cmd, d, erreur } = monter();
    cmd.executer('affichage.positionGps');
    erreur(new SansPosition('indisponible')); erreur(new SansPosition('indisponible')); erreur(new SansPosition('delai'));
    expect(a.etat.positionGps).toBe(true);
    expect(d.signaler).toHaveBeenCalledTimes(1);
    erreur(new SansPosition('refusee'));
    expect(a.etat.positionGps).toBe(false);
    expect(d.signaler.mock.calls.at(-1)![0]).toMatch(/autorisez la localisation/);
  });
});
