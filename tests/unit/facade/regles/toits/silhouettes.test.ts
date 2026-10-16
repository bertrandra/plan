import { describe, it, expect } from 'vitest';
import { axeDuToit, observationDesSilhouettes, silhouetteDeEstimation, type SilhouetteLue } from '../../../../../src/facade/regles/toits/silhouettes.js';
import type { SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';

// Les bouts du faitage que disent les silhouettes des facades (lot « photos de l'audit -> toit »).
// Un faitage d'azimut 90 (est-ouest) : les murs est et ouest ferment les bouts, les murs nord et sud sont les longs pans.

const mur = (nom: string, azimut: number, silhouette: SilhouetteFacade): SilhouetteLue => ({ nom: 'façade ' + nom, azimut, silhouette });
const est = (s: SilhouetteFacade) => mur('est', 90, s), ouest = (s: SilhouetteFacade) => mur('ouest', 270, s);
const nord = (s: SilhouetteFacade) => mur('nord', 0, s), sud = (s: SilhouetteFacade) => mur('sud', 180, s);

describe('les bouts du faîtage lus sur la silhouette des façades', () => {
  it('deux murs de bout en pignon : des pignons aux deux bouts', () => {
    const r = observationDesSilhouettes(90, [est('pignon'), ouest('pignon'), nord('rectangle'), sud('rectangle')]);
    expect(r?.observation).toEqual({ bouts: ['pignon', 'pignon'] });
    expect(r?.conflits).toEqual([]);
    expect(r?.vus.map((x) => x.nom + ':' + x.dit + ':' + x.role)).toEqual(['façade est:pignon:bout', 'façade ouest:pignon:bout', 'façade nord:pignon:long', 'façade sud:pignon:long']);
  });

  it('un pan de toit incliné d’un côté, un pignon de l’autre : une croupe et un pignon, quel que soit le sens de l’axe', () => {
    expect(observationDesSilhouettes(90, [est('croupe'), ouest('pignon')])?.observation).toEqual({ bouts: ['croupe', 'pignon'] });
    expect(observationDesSilhouettes(270 % 180, [est('croupe'), ouest('pignon')])?.observation).toEqual({ bouts: ['croupe', 'pignon'] });
  });

  it('un trapèze sur le long pan dit des croupes aux deux bouts ; un mur de bout dit mieux que lui', () => {
    expect(observationDesSilhouettes(90, [sud('trapeze')])?.observation).toEqual({ bouts: ['croupe', 'croupe'] });
    const r = observationDesSilhouettes(90, [sud('trapeze'), est('pignon')]);
    expect(r?.observation).toEqual({ bouts: ['pignon', 'croupe'] });
    expect(r?.conflits).toEqual(['un mur de bout dit pignon, un long pan dit croupe']);
  });

  it('un bandeau droit sur le long pan dit des pignons, sauf sous un toit plat', () => {
    expect(observationDesSilhouettes(90, [nord('rectangle')])?.observation).toEqual({ bouts: ['pignon', 'pignon'] });
    expect(observationDesSilhouettes(90, [nord('rectangle')], true)).toBeNull();
  });

  it('une rampe aux bouts dit un appentis, sans bouts', () => {
    expect(observationDesSilhouettes(90, [est('rampe'), ouest('rampe')])?.observation).toEqual({ forme: ['appentis'] });
  });

  it('ne dit rien de ce qu’elle ne voit pas : un seul bout, un mur indéterminé, un mur en biais', () => {
    expect(observationDesSilhouettes(90, [est('pignon')])).toBeNull();
    expect(observationDesSilhouettes(90, [est('indetermine'), ouest('indetermine')])).toBeNull();
    expect(observationDesSilhouettes(90, [mur('nord-est', 45, 'pignon'), mur('sud-ouest', 225, 'pignon')])).toBeNull();
    expect(observationDesSilhouettes(90, [])).toBeNull();
  });

  it('deux murs du même bout qui se contredisent ne disent rien de ce bout et le signalent', () => {
    const r = observationDesSilhouettes(90, [est('pignon'), mur('est (côté 4)', 92, 'croupe'), ouest('pignon'), nord('rectangle')]);
    expect(r?.conflits[0]).toMatch(/^les murs du même bout du toit se contredisent/);
  });

  it('l’axe est celui du faîtage du corps principal, sinon du plus long côté du contour', () => {
    const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }];
    expect(axeDuToit(null, contour)).toBeCloseTo(90, 5);
    expect(axeDuToit(null, [])).toBeNull();
  });
});

describe('la silhouette que la photo donne à Plan', () => {
  const e = (forme: string, faitage: 'parallele' | 'perpendiculaire') => ({ forme, faitage, hauteur: 2, ecart: 0.1 }) as Parameters<typeof silhouetteDeEstimation>[0];
  it('un triangle est un pignon, une bande un bandeau droit, un trapèze un toit à croupes, une rampe un appentis', () => {
    expect(silhouetteDeEstimation(e('deux-pans', 'perpendiculaire'))).toBe('pignon');
    expect(silhouetteDeEstimation(e('deux-pans', 'parallele'))).toBe('rectangle');
    expect(silhouetteDeEstimation(e('quatre-pans', 'parallele'))).toBe('trapeze');
    expect(silhouetteDeEstimation(e('appentis', 'perpendiculaire'))).toBe('rampe');
  });
  it('un toit plat ou hors cadre ne dit rien', () => {
    expect(silhouetteDeEstimation(e('plat', 'parallele'))).toBe('indetermine');
    expect(silhouetteDeEstimation(null)).toBe('indetermine');
  });
});
