import { describe, it, expect } from 'vitest';
import { faitsDeLaSortie } from '../../../../src/regles/plu/observations.js';
import { faitPluLu, faitsValides, reglementPluEnregistre, valeurLisible, type ReglementPlu } from '../../../../src/regles/plu/faits.js';
import { REGLEMENT } from '../../../fixtures/plu/reglement.js';

// Ce que la reponse de Claude devient : des faits proposes, sans rien inventer (regles/plu/observations.ts) ; et ce qu'un fichier de
// projet en garde (regles/plu/faits.ts).

const regle = (plus: Record<string, unknown>) => ({ grandeur: 'hauteur-egout-max', valeur: 7, unite: 'm', termes: [], condition: '', article: 'UL 10',
  citation: 'La hauteur des constructions est limitée à 7 mètres à l’égout du toit.', page: 48, confiance: 'forte', ...plus });

describe('faitsDeLaSortie', () => {
  it('fait de chaque ligne citee un fait propose, numerote, avec sa page dans l’extrait', () => {
    const l = faitsDeLaSortie({ zone: { libelle: 'UL', trouvee: 'oui' }, regles: [regle({}), regle({ grandeur: 'emprise-max', valeur: 40, unite: 'pourcent', article: 'UL 9', page: 47 })], remarques: 'Voir le lexique.' }, [38, 62]);
    expect(l.zone).toBe('UL');
    expect(l.remarques).toBe('Voir le lexique.');
    expect(l.faits.map((f) => [f.id, f.grandeur, f.valeur, f.page, f.statut])).toEqual([['f1', 'hauteur-egout-max', 7, 48, 'propose'], ['f2', 'emprise-max', 40, 47, 'propose']]);
  });

  it('n’invente rien : sans article ou sans citation, pas de fait ; une valeur hors bornes ou d’une autre unite est retiree', () => {
    const l = faitsDeLaSortie({ zone: { libelle: 'UL', trouvee: 'oui' }, regles: [
      regle({ article: '' }), regle({ citation: 'trop court' }), regle({ grandeur: 'inconnue' }),
      regle({ valeur: 300 }), regle({ valeur: 7, unite: 'pourcent', article: 'UL 10.2' }),
      regle({ grandeur: 'materiaux-toit', valeur: 'indetermine', unite: 'aucune', termes: [] }),
      regle({ grandeur: 'materiaux-toit', valeur: 'indetermine', unite: 'aucune', termes: ['ardoise', 'zinc', 'ardoise', 'paille'], article: 'UL 11' }),
      regle({ page: 12, article: 'UL 10.3' }),
    ] }, [38, 62]);
    expect(l.ecartees.map((e) => e.motif)).toEqual(['sans article', 'sans citation du texte', 'grandeur inconnue', 'aucune couverture nommée']);
    expect(l.faits.map((f) => [f.grandeur, f.valeur, f.termes, f.page])).toEqual([
      ['hauteur-egout-max', null, [], 48], ['hauteur-egout-max', null, [], 48], ['materiaux-toit', null, ['ardoise', 'zinc'], 48], ['hauteur-egout-max', 7, [], null],
    ]);
  });

  it('ne garde qu’une fois la meme regle, et rien quand la zone n’est pas dans l’extrait', () => {
    expect(faitsDeLaSortie({ zone: { trouvee: 'oui' }, regles: [regle({}), regle({})] }, [1, 25]).faits).toHaveLength(1);
    expect(faitsDeLaSortie({ zone: { libelle: 'UA', trouvee: 'non' }, regles: [regle({})] }, [1, 25]).faits).toEqual([]);
    expect(faitsDeLaSortie(null, [1, 25]).faits).toEqual([]);
  });
});

describe('le reglement enregistre dans un projet', () => {
  it('se relit a l’identique, sans rien partager avec le fichier', () => {
    const copie = JSON.parse(JSON.stringify(REGLEMENT)) as ReglementPlu;
    const lu = reglementPluEnregistre(copie);
    expect(lu).toEqual(REGLEMENT);
    (copie.lecture.sortie as { regles: unknown[] }).regles.push(1);
    expect(lu?.lecture.sortie).toEqual({ regles: [] });
  });

  it('refuse un format inconnu, et ecarte un fait sans citation', () => {
    expect(reglementPluEnregistre({ ...REGLEMENT, format: 'autre' })).toBeNull();
    expect(reglementPluEnregistre({ ...REGLEMENT, source: { ...REGLEMENT.source, pages: [38] } })).toBeNull();
    expect(faitPluLu({ ...REGLEMENT.faits[0], citation: ' ' })).toBeNull();
    expect(faitPluLu({ ...REGLEMENT.faits[1], statut: 'valide', valideLe: 3 })).not.toHaveProperty('valideLe');
  });

  it('ne donne aux regles que les faits valides', () => {
    expect(faitsValides(REGLEMENT).map((f) => f.id)).toEqual(['f1']);
    expect(faitsValides(null)).toEqual([]);
  });

  it('dit une valeur dans son unite', () => {
    expect(valeurLisible(REGLEMENT.faits[0]!)).toBe('7 m');
    expect(valeurLisible({ grandeur: 'emprise-max', valeur: 40.5, termes: [] })).toBe('40,5 %');
    expect(valeurLisible({ grandeur: 'pente-toit-min', valeur: 35, termes: [] })).toBe('35°');
    expect(valeurLisible({ grandeur: 'materiaux-toit', valeur: null, termes: ['ardoise', 'zinc'] })).toBe('ardoise, zinc');
    expect(valeurLisible({ grandeur: 'couleurs', valeur: null, termes: [] })).toBe('—');
  });
});

