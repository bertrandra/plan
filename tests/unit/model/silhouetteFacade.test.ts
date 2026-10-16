import { describe, it, expect } from 'vitest';
import { libelleSilhouette, silhouetteLue, SILHOUETTES_FACADE } from '../../../src/model/silhouetteFacade.js';
import { voterAnalyse } from '../../../src/app/regles/sujets/vote.js';
import { reponse } from '../../fixtures/audit/reponseClaude.js';
import type { FacadeAnalyse } from '../../../src/model/analyseClaude.js';

const mur = (silhouette?: string): FacadeAnalyse => ({
  indices: [{ image: 1, vu: 'le haut du mur' }], facade: 'est', ouvertures: { niveaux: 1, parNiveau: [1], manquees: 0, enTrop: 0 },
  details: { volets: 'aucun', coffre: 'non', balcon: 'non', forme: 'rectangulaire' }, materiau: 'enduit', ...(silhouette ? { silhouette } : {}), ecart: '',
});

describe('la silhouette du haut d’une façade', () => {
  it('ne connaît que son vocabulaire : le reste, ou une réponse d’avant le prompt version 6, est indéterminé', () => {
    expect(SILHOUETTES_FACADE.map((s) => s.code)).toEqual(['pignon', 'croupe', 'trapeze', 'rectangle', 'rampe']);
    expect(silhouetteLue('pignon')).toBe('pignon');
    expect(silhouetteLue('mansart')).toBe('indetermine');
    expect(silhouetteLue(undefined)).toBe('indetermine');
    expect(libelleSilhouette('croupe')).toBe('croupe');
    expect(libelleSilhouette('indetermine')).toBe('non lue');
  });

  it('se vote comme les autres attributs d’une façade : la majorité des passes, portée par leur accord', () => {
    const r = (s?: string) => reponse({ facades: [mur(s)] });
    const v = voterAnalyse([r('pignon'), r('pignon'), r('croupe')]);
    expect(v.facades[0]?.silhouette).toMatchObject({ valeur: 'pignon' });
    expect(v.facades[0]?.silhouette.accord).toBeCloseTo(2 / 3, 5);
    // Une passe d'un ancien prompt, sans silhouette, vote « indeterminé » sans casser les autres.
    expect(voterAnalyse([r(), r(), r()]).facades[0]?.silhouette.valeur).toBe('indetermine');
  });
});
