import { describe, it, expect, afterEach, vi } from 'vitest';
import { abonnerIntentionToit, estIntentionToit, intentionToit, MOTS_INTENTION, poserIntentionToit } from '../../../../src/app/toits/intention.js';

// L'intention du mode Toit (retour du proprietaire, 24 novembre 2026) : modifier ce qui existe ou ajouter un element, jamais les deux.

afterEach(() => { poserIntentionToit('modifier'); });

describe('l intention du mode Toit', () => {
  it('part de « modifier », change, et previent ses abonnes une fois par changement', () => {
    const vu = vi.fn();
    const fin = abonnerIntentionToit(vu);
    expect(intentionToit()).toBe('modifier');
    poserIntentionToit('modifier');
    expect(vu).not.toHaveBeenCalled();
    poserIntentionToit('ajouter');
    expect(intentionToit()).toBe('ajouter');
    expect(vu).toHaveBeenCalledTimes(1);
    fin();
    poserIntentionToit('modifier');
    expect(vu).toHaveBeenCalledTimes(1);
  });

  it('ne reconnait que ses deux valeurs', () => {
    expect(estIntentionToit('modifier')).toBe(true);
    expect(estIntentionToit('ajouter')).toBe(true);
    expect(estIntentionToit('supprimer')).toBe(false);
    expect(estIntentionToit(undefined)).toBe(false);
  });

  it('chaque intention dit ce qu elle ne fera pas : c est la question que la personne se pose', () => {
    expect(MOTS_INTENTION.modifier.promesse).toMatch(/rien n’est créé/);
    expect(MOTS_INTENTION.ajouter.promesse).toMatch(/rien d’existant n’est touché/);
  });
});
