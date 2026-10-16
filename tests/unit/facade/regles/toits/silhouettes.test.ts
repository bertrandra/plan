import { describe, it, expect } from 'vitest';
import { axeDuToit, observationDesSilhouettes, silhouetteDeEstimation, type SilhouetteLue } from '../../../../../src/facade/regles/toits/silhouettes.js';
import type { BoutVu, SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';

// Le sens du faitage et les bouts que disent les silhouettes des facades, dans les mots de la reponse de Claude
// (`silhouette` et `bout` de chaque facade). Un faitage est-ouest (azimut 90) : les murs est et ouest ferment ses
// bouts, les murs nord et sud sont ses longs pans.

const mur = (nom: string, azimut: number, silhouette: SilhouetteFacade, bout?: BoutVu, largeurM = 8): SilhouetteLue => ({ nom: 'façade ' + nom, azimut, largeurM, silhouette, ...(bout ? { bout } : {}) });
const est = (s: SilhouetteFacade, b?: BoutVu, l?: number) => mur('est', 90, s, b, l), ouest = (s: SilhouetteFacade, b?: BoutVu, l?: number) => mur('ouest', 270, s, b, l);
const nord = (s: SilhouetteFacade, b?: BoutVu, l?: number) => mur('nord', 0, s, b, l), sud = (s: SilhouetteFacade, b?: BoutVu, l?: number) => mur('sud', 180, s, b, l);

describe('le sens du faîtage et les bouts lus sur la silhouette des façades', () => {
  it('le bout que Claude dit pour une façade fait foi : deux pignons, un faîtage perpendiculaire aux murs de bout', () => {
    const r = observationDesSilhouettes([est('triangle', 'pignon'), ouest('triangle', 'pignon'), nord('ligne-droite', 'sans-objet'), sud('ligne-droite', 'sans-objet')]);
    expect(r?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 90 }, bouts: ['pignon', 'pignon'] });
    expect(r?.conflits).toEqual([]);
    expect(r?.vus.map((x) => x.nom + ':' + x.role + ':' + x.dit)).toEqual(['façade est:bout:pignon', 'façade ouest:bout:pignon', 'façade nord:long:pignon', 'façade sud:long:pignon']);
  });

  it('un triangle couvert comme le toit est une croupe, pas un pignon : le bout de Claude l’emporte sur la forme vue', () => {
    expect(observationDesSilhouettes([est('triangle', 'croupe'), ouest('triangle', 'pignon')])?.observation.bouts).toEqual(['croupe', 'pignon']);
    expect(observationDesSilhouettes([est('trapeze', 'croupe'), ouest('trapeze', 'croupe')])?.observation.bouts).toEqual(['croupe', 'croupe']);
  });

  it('sans `bout` (la photo mesurée seule), la silhouette dit le rôle : triangle ou marches, un bout en pignon ; trapèze, un long pan à croupes ; ligne droite, un long pan à pignons', () => {
    expect(observationDesSilhouettes([est('triangle'), ouest('marches')])?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 90 }, bouts: ['pignon', 'pignon'] });
    expect(observationDesSilhouettes([sud('trapeze')])?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 90 }, bouts: ['croupe', 'croupe'] });
    expect(observationDesSilhouettes([nord('ligne-droite')])?.observation.bouts).toEqual(['pignon', 'pignon']);
  });

  it('le sens du faîtage se dit même quand un seul mur parle : un triangle sur la façade est, un faîtage est-ouest', () => {
    const r = observationDesSilhouettes([est('triangle', 'pignon')]);
    expect(r?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 90 } });
    expect(observationDesSilhouettes([sud('ligne-droite', 'sans-objet')])?.observation.faitage).toEqual({ par: 'azimut', azimutDeg: 90 });
    // Un faitage nord-sud : les murs nord et sud ferment les bouts.
    expect(observationDesSilhouettes([nord('triangle', 'pignon'), sud('triangle', 'pignon')])?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 0 }, bouts: ['pignon', 'pignon'] });
  });

  it('un mur de bout l’emporte sur un long pan qui dit autre chose, et le conflit se dit', () => {
    const r = observationDesSilhouettes([sud('trapeze'), est('triangle', 'pignon')]);
    // Le mur de bout dit pignon de son côté ; l'autre bout n'a que le long pan, qui dit croupe.
    expect(r?.observation.bouts).toEqual(['pignon', 'croupe']);
    expect(r?.conflits).toEqual(['un mur de bout dit pignon, un long pan dit croupe']);
  });

  it('une ligne droite sous un toit plat ne dit rien : il n’y a pas de faîtage', () => {
    expect(observationDesSilhouettes([nord('ligne-droite')], true)).toBeNull();
    expect(observationDesSilhouettes([nord('ligne-droite', 'sans-objet')], true)).toBeNull();
    // Claude qui se contredit (un triangle qui n'est pas un bout) : le mur ne dit rien.
    expect(observationDesSilhouettes([nord('triangle', 'sans-objet')])).toBeNull();
  });

  it('une seule rampe à chaque bout dit un appentis, sans bouts', () => {
    expect(observationDesSilhouettes([est('rampe'), ouest('rampe')])?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 90 }, forme: ['appentis'] });
  });

  it('une demi-croupe ou un brisis donnent le sens du faîtage, jamais les bouts : le moteur ne sait pas les produire', () => {
    const r = observationDesSilhouettes([est('trapeze', 'demi-croupe'), ouest('trapeze', 'demi-croupe')]);
    expect(r?.observation).toEqual({ faitage: { par: 'azimut', azimutDeg: 90 } });
    expect(r?.vus.map((x) => x.dit)).toEqual(['demi-croupe', 'demi-croupe']);
  });

  it('ne dit rien de ce qu’elle ne voit pas : murs indéterminés, plusieurs sommets, aucun mur', () => {
    expect(observationDesSilhouettes([est('indetermine'), ouest('indetermine', 'indetermine')])).toBeNull();
    expect(observationDesSilhouettes([est('plusieurs-sommets')])).toBeNull();
    expect(observationDesSilhouettes([])).toBeNull();
  });

  it('deux murs du même bout qui se contredisent ne disent rien de ce bout et le signalent', () => {
    const r = observationDesSilhouettes([est('triangle', 'pignon'), mur('est (côté 4)', 92, 'triangle', 'croupe'), ouest('triangle', 'pignon')]);
    expect(r?.conflits[0]).toMatch(/^les murs du même bout du toit se contredisent/);
    expect(r?.observation.bouts).toBeUndefined();
  });

  it('plusieurs sens de faîtage : celui que soutiennent les murs les plus larges l’emporte, l’autre est signalé', () => {
    const r = observationDesSilhouettes([est('triangle', 'pignon', 12), ouest('triangle', 'pignon', 12), nord('triangle', 'pignon', 12)]);
    expect(r?.observation.faitage).toEqual({ par: 'azimut', azimutDeg: 90 });
    expect(r?.conflits[0]).toMatch(/deux sens de faîtage \(façade nord : un autre sens que le principal\)/);
    // Un mur isolé, bien plus petit, ne fait pas conflit (une lucarne, une annexe).
    expect(observationDesSilhouettes([est('triangle', 'pignon', 12), ouest('triangle', 'pignon', 12), nord('triangle', 'pignon', 2)])?.conflits).toEqual([]);
  });

  it('l’axe de départ est celui du faîtage du corps principal, sinon du plus long côté du contour', () => {
    const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }];
    expect(axeDuToit(null, contour)).toBeCloseTo(90, 5);
    expect(axeDuToit(null, [])).toBeNull();
  });
});

describe('la silhouette que la photo donne à Plan', () => {
  const e = (forme: string, faitage: 'parallele' | 'perpendiculaire') => ({ forme, faitage, hauteur: 2, ecart: 0.1 }) as Parameters<typeof silhouetteDeEstimation>[0];
  it('un triangle est un triangle, une bande une ligne droite, un trapèze un trapèze, une rampe une rampe', () => {
    expect(silhouetteDeEstimation(e('deux-pans', 'perpendiculaire'))).toBe('triangle');
    expect(silhouetteDeEstimation(e('deux-pans', 'parallele'))).toBe('ligne-droite');
    expect(silhouetteDeEstimation(e('quatre-pans', 'parallele'))).toBe('trapeze');
    expect(silhouetteDeEstimation(e('appentis', 'perpendiculaire'))).toBe('rampe');
  });
  it('un toit plat ou hors cadre ne dit rien', () => {
    expect(silhouetteDeEstimation(e('plat', 'parallele'))).toBe('indetermine');
    expect(silhouetteDeEstimation(null)).toBe('indetermine');
  });
});
