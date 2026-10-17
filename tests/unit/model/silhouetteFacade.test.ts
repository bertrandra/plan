import { describe, it, expect } from 'vitest';
import { boutLu, libelleSilhouette, silhouetteLue, SILHOUETTES_FACADE } from '../../../src/model/silhouetteFacade.js';
import { voterAnalyse } from '../../../src/app/regles/sujets/vote.js';
import { reponse } from '../../fixtures/audit/reponseClaude.js';
import type { FacadeAnalyse } from '../../../src/model/analyseClaude.js';

const mur = (silhouette?: string, bout?: string): FacadeAnalyse => ({
  indices: [{ image: 1, vu: 'le haut du mur' }], facade: 'est', ouvertures: { niveaux: 1, parNiveau: [1], manquees: 0, enTrop: 0 },
  details: { volets: 'aucun', coffre: 'non', balcon: 'non', forme: 'rectangulaire' }, materiau: 'enduit', ...(silhouette ? { silhouette } : {}), ...(bout ? { bout } : {}), ecart: '',
});

describe('la silhouette du haut d’une façade', () => {
  it('ne connaît que son vocabulaire : le reste, ou une réponse d’avant le prompt version 7, est indéterminé', () => {
    expect(SILHOUETTES_FACADE.map((s) => s.code)).toEqual(['triangle', 'trapeze', 'rampe', 'ligne-droite', 'marches', 'plusieurs-sommets']);
    expect(silhouetteLue('triangle')).toBe('triangle');
    expect(silhouetteLue('mansart')).toBe('indetermine');
    expect(silhouetteLue(undefined)).toBe('indetermine');
    // Les mots de la premiere ecriture du champ (fichiers d'audit d'octobre 2026) se relisent.
    expect([silhouetteLue('pignon'), silhouetteLue('croupe'), silhouetteLue('rectangle')]).toEqual(['triangle', 'trapeze', 'ligne-droite']);
    expect([boutLu('demi-croupe'), boutLu('sans-objet'), boutLu('triangle'), boutLu(undefined)]).toEqual(['demi-croupe', 'sans-objet', 'indetermine', 'indetermine']);
    expect(libelleSilhouette('ligne-droite')).toBe('ligne droite');
    expect(libelleSilhouette('indetermine')).toBe('non lue');
  });

  it('se vote comme les autres attributs d’une façade : la majorité des passes, portée par leur accord', () => {
    const r = (s?: string, b?: string) => reponse({ facades: [mur(s, b)] });
    const v = voterAnalyse([r('triangle', 'pignon'), r('triangle', 'pignon'), r('trapeze', 'croupe')]);
    expect(v.facades[0]?.silhouette).toMatchObject({ valeur: 'triangle' });
    expect(v.facades[0]?.bout.valeur).toBe('pignon');
    expect(v.facades[0]?.silhouette.accord).toBeCloseTo(2 / 3, 5);
    // Une passe d'un ancien prompt, sans silhouette, vote « indeterminé » sans casser les autres.
    expect(voterAnalyse([r(), r(), r()]).facades[0]?.silhouette.valeur).toBe('indetermine');
  });
});
