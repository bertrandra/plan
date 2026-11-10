import { describe, it, expect } from 'vitest';
import { lireLectureToit, lireRunEnregistre, type RunEnregistre } from '../../../../../src/regles/facades/observations.js';
import { observationsDuRun, reglagesIa } from '../../../../../src/facade/regles/facades/ia.js';
import { voterLectureToit } from '../../../../../src/facade/regles/facades/voteToit.js';
import { alerteDebord, bordsLus, couvertureLueSurLaFacade, elementsToitProposes } from '../../../../../src/facade/regles/facades/toitLu.js';
import { elementToitPoseSurLeMur } from '../../../../../src/facade/regles/toits/elementsDesMurs.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import type { CorpsToit, PtBrut } from '../../../../../src/model/types.js';

// Les regles du toit lu sur une facade (lot L2 de MD/spec-lecture-ia-elargie.md §5.1) : la lecture d'une passe (vocabulaire ferme), le
// vote de trois passes, la couverture en mot d'arbitrage, l'alerte du debord, les bords, et la pose d'une fenetre de toit sur un pan.

const passe = (couverture: string, pose = 'droite', elements: unknown[] = []) => ({ toit: { couverture, pose, debord: 'faible', faitage: 'tuiles', gouttiere: 'pendante', confiance: 'forte' }, elements });
const p = (x: number, y: number): PtBrut => ({ x, y });
const PTS = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const CORPS: CorpsToit = { pts: PTS, posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 };

describe('le toit lu d une passe', () => {
  it('garde le vocabulaire ferme : un mot inconnu est indetermine, un element sous l egout ou hors du mur est ecarte', () => {
    const l = lireLectureToit({ toit: { couverture: 'chaume', pose: 'ecaille', debord: 'enorme', faitage: 'zinc', gouttiere: 'aucune', confiance: 'moyenne' }, elements: [
      { element: 'fenetre-toit', u0: 0.2, u1: 0.3, v: 1.4, confiance: 'forte' }, { element: 'fenetre-toit', u0: 0.2, u1: 0.3, v: 0.8, confiance: 'forte' },
      { element: 'solaire', u0: 0.5, u1: 1.6, v: 1.3, confiance: 'forte' }, { element: 'velux', u0: 0.2, u1: 0.3, v: 1.4, confiance: 'forte' },
    ] });
    expect(l).toEqual({ toit: { couverture: null, pose: 'ecaille', debord: null, faitage: 'zinc', gouttiere: 'aucune', confiance: 'moyenne' }, elements: [{ element: 'fenetre-toit', u0: 0.2, u1: 0.3, v: 1.4, confiance: 'forte' }] });
    expect(lireLectureToit({ toit: {} })).toBeNull();
    expect(lireLectureToit('texte')).toBeNull();
  });

  it('se vote : le mot de la majorite, un element vu par plus de la moitie des passes', () => {
    const f = { element: 'fenetre-toit', u0: 0.6, u1: 0.68, v: 1.3, confiance: 'forte' };
    const v = voterLectureToit([passe('ardoise', 'ecaille', [f]), passe('ardoise', 'droite', [{ ...f, u0: 0.62 }]), passe('zinc', 'ecaille')].map((x) => lireLectureToit(x)!), reglagesIa());
    expect(v?.toit).toMatchObject({ couverture: 'ardoise', pose: 'ecaille', faitage: 'tuiles' });
    expect(v?.elements).toEqual([{ element: 'fenetre-toit', u0: 0.61, u1: 0.68, v: 1.3, confiance: 'forte' }]);
  });
});

describe('le toit lu dans les observations du run', () => {
  const run = (toit?: unknown[]): RunEnregistre => lireRunEnregistre({
    le: '2026-10-30T10:00:00Z', modele: 'm', prompt: 2, schema: 2, passes: 1, sorties: [{ calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: {}, elements: [], surface: {}, ouvertures: [], confiance: 'forte' }], cout: 0, tokens: {}, image: { largeur: 10, hauteur: 10 }, chaine: 1,
    ...(toit ? { toit: { le: '2026-10-30T10:00:00Z', modele: 'm', prompt: 1, schema: 1, passes: 1, sorties: toit, cout: 0, tokens: {} } } : {}),
  })!;
  it('se pose apres le vote, sans rien changer d autre ; absent, rien', () => {
    const sans = observationsDuRun(run())!, avec = observationsDuRun(run([passe('ardoise', 'losange')]))!;
    expect(sans.toit).toBeNull();
    expect(sans.elementsToit).toEqual([]);
    expect({ ...avec, toit: null, elementsToit: [] }).toEqual(sans);
    expect(couvertureLueSurLaFacade(avec)).toEqual({ mot: 'ardoise-losange', confiance: 0.9 });
  });
  it('la couverture en mot d arbitrage : tuile mecanique est la tuile, une pose qui ne s y dessine pas ne compte pas, les gravillons ne s ecrivent pas', () => {
    expect(couvertureLueSurLaFacade(observationsDuRun(run([passe('tuile-mecanique', 'ecaille')])))?.mot).toBe('tuile');
    expect(couvertureLueSurLaFacade(observationsDuRun(run([passe('tuile-plate', 'ecaille')])))?.mot).toBe('tuile-plate-ecaille');
    expect(couvertureLueSurLaFacade(observationsDuRun(run([passe('gravillons')])))).toBeNull();
  });
  it('le debord lu ne fait qu une alerte, quand sa classe n est pas celle du toit ; les bords lus quand ils different', () => {
    const obs = observationsDuRun(run([{ ...passe('ardoise'), toit: { ...passe('ardoise').toit, debord: 'aucun' } }]));
    expect(alerteDebord(obs, CORPS)).toMatch(/^Claude voit aucun débord .* le toit garde le sien \(0,35 m, celui du dessin\)/);
    expect(alerteDebord(obs, { ...CORPS, bords: { debordEgoutM: 0.05 } })).toBeNull();
    expect(alerteDebord(observationsDuRun(run([passe('ardoise')])), CORPS)).toBeNull();
    expect(bordsLus(obs, CORPS)).toEqual({ faitage: 'tuiles', gouttiere: 'pendante' });
    expect(bordsLus(obs, { ...CORPS, bords: { faitage: 'tuiles', gouttiere: 'pendante' } })).toBeNull();
  });
});

describe('une fenetre de toit lue, posee sur le pan de son mur', () => {
  const [sud, est] = [0, 1].map((k) => facadesDuContour(PTS, 6).find((f) => f.cote === k)!) as [ReturnType<typeof facadesDuContour>[number], ReturnType<typeof facadesDuContour>[number]];
  const vu = (f: typeof sud, v = 1.25, u0 = 0.4, u1 = 0.48) => elementsToitProposes({ elementsToit: [{ element: 'fenetre-toit', u0, u1, v, confiance: 'moyenne' }] } as never, f, 6)[0]!.observation.elementsToitDesMurs[0];
  it('sur le long pan du mur, a la place lue ; dans la pente par la hauteur lue ; jamais sur un mur de bout', () => {
    const pose = elementToitPoseSurLeMur([CORPS], vu(sud));
    expect(pose).toMatchObject({ corps: 0, element: { type: 'fenetre-toit', pan: 0, dM: 2 } });
    expect(elementToitPoseSurLeMur([CORPS], vu(sud, 3))?.element.dM).toBe(3.6);
    expect(elementToitPoseSurLeMur([CORPS], vu(est))).toBeNull();
    // Deja posee : rien de plus.
    expect(elementToitPoseSurLeMur([{ ...CORPS, elementsToit: [pose!.element] }], vu(sud))).toBeNull();
  });
});
