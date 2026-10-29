import { describe, it, expect } from 'vitest';
import { signauxDeLaFacade, texteSignaux } from '../../../../src/facade/detection/signaux.js';

// Quand l'algorithme n'est pas sur de lui (MD/spec-facades-calage-detection.md §12 bis) : les signaux qui font proposer l'aide de
// Claude au releve d'une facade.

describe('quand appeler Claude', () => {
  it('ne leve rien quand l algorithme est sur de lui', () => {
    expect(signauxDeLaFacade({ calage: { note: 0.8, trouve: true, sources: ['trouve', 'trouve', 'trouve', 'predit'] }, ouvertures: [{ confiance: 0.9 }, { confiance: 0.95 }], devinees: 0, largeurM: 9 })).toEqual([]);
  });

  it('leve les signaux du tableau de la spec', () => {
    expect(signauxDeLaFacade({ calage: { note: 0.3, trouve: false, sources: ['predit', 'predit', 'predit', 'predit'] } })).toEqual(['coins']);
    expect(signauxDeLaFacade({ calage: { note: 0.7, trouve: true, sources: ['trouve', 'trouve', 'predit', 'predit'] } })).toEqual(['coins']);
    expect(signauxDeLaFacade({ cache: 0.35 })).toEqual(['malVue']);
    // Moins de 70 % au-dessus de 0,7, ou une baie devinee en pointille.
    expect(signauxDeLaFacade({ ouvertures: [{ confiance: 0.9 }, { confiance: 0.6 }, { confiance: 0.65 }] })).toContain('peuSure');
    expect(signauxDeLaFacade({ ouvertures: [{ confiance: 0.9 }], devinees: 1 })).toEqual(['peuSure']);
    // Un mur de plus de 4 m sans ouverture : ton sur ton ; une confiance mediane basse aussi.
    expect(signauxDeLaFacade({ ouvertures: [], largeurM: 9 })).toEqual(['tonSurTon']);
    expect(signauxDeLaFacade({ ouvertures: [{ confiance: 0.5 }, { confiance: 0.52 }] })).toEqual(['peuSure', 'tonSurTon']);
    expect(signauxDeLaFacade({ ouvertures: [{ confiance: 0.9 }], attendues: 3 })).toEqual(['desaccord']);
    expect(signauxDeLaFacade({ ouvertures: [{ confiance: 0.9, details: { volets: 'roulant', ferme: true } }] })).toEqual(['details']);
    // Ce que le doigt a pose ne compte pas dans la confiance.
    expect(signauxDeLaFacade({ ouvertures: [{ source: 'ajoutee' }, { confiance: 0.9 }] })).toEqual([]);
    expect(texteSignaux(['coins', 'peuSure'])).toBe('coins non trouvés sur la photo, détection peu sûre');
  });
});
