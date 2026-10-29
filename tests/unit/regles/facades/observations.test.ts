import { describe, it, expect } from 'vitest';
import { lireObservationsFacade, lireRunEnregistre, texteRunFacade, type ObservationsFacade, type RunEnregistre } from '../../../../src/regles/facades/observations.js';
import { SORTIE_FACADE } from '../../../fixtures/deploy/fauxAnthropic.js';

// Les observations du run d'une facade (lot F2, MD/spec-facade-calage-audit.md §8), le contrat d'entree du moteur des facades : la
// lecture d'une passe (vocabulaire ferme, rien d'invente), la reponse enregistree, le texte qui accompagne l'image.
// Toutes les reponses ici sont SYNTHETIQUES.

const R = lireObservationsFacade(SORTIE_FACADE) as ObservationsFacade;
const run = (sorties: unknown[], passes: 1 | 3 = 1): RunEnregistre => ({ le: '2026-10-29T08:30:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes, sorties, cout: 0.0012, tokens: { entree: 4200, sortie: 900 }, image: { largeur: 1000, hauteur: 600 }, chaine: 10, synthetique: true });

describe('la lecture de la reponse', () => {
  it('lit le calage, la forme, les elements, les ouvertures et leurs carreaux', () => {
    expect(R.calage.angles.droite).toEqual({ x: 0.86, egout: 0.52, sol: 0.88, confiance: 'forte' });
    expect(R.calage.pointes).toHaveLength(2);
    expect(R.calage.cache).toEqual([{ quoi: 'haie', debut: 0.85, fin: 1 }]);
    expect(R.forme).toEqual({ silhouette: 'plusieurs-sommets', bout: 'pignon' });
    expect(R.elements).toEqual([{ element: 'cheminee', u: 0.45, confiance: 'moyenne' }]);
    expect(R.surface).toEqual({ principale: 'enduit', zones: [{ type: 'colombage', u0: 0.5, u1: 1, v0: 1.5, v1: 3, confiance: 'moyenne' }], confiance: 'forte' });
    expect(R.ouvertures[0]?.details).toEqual({ volets: 'battants', allege: 'pleine', forme: 'rect' });
    expect(R.ouvertures[1]?.carreaux).toEqual({ vantaux: 1, colonnes: null, rangees: null, petitsBois: null, imposte: { hauteur: 0.2, colonnes: 3, rangees: 1 }, vitrage: null });
  });

  it('ecarte ce qui ne se lit pas, sans rien inventer', () => {
    const r = lireObservationsFacade({ calage: { angles: { gauche: { x: 0.1, egout: 0.9, sol: 0.5 }, droite: 'indetermine' }, pointes: [{ u: 'a', v: 2 }] },
      forme: { silhouette: 'ogive', bout: 'pignon' }, ouvertures: [{ type: 'fenetre', u0: 0.3, u1: 0.2, v0: 0, v1: 1 }, { type: 'baie', u0: 0, u1: 1, v0: 0, v1: 1 }], confiance: 'immense' });
    expect(r?.calage.angles).toEqual({ gauche: null, droite: null });
    expect(r?.calage.pointes).toEqual([]);
    expect(r?.forme.silhouette).toBe('indetermine');
    expect(r?.ouvertures).toEqual([]);
    expect(r?.confiance).toBe('faible');
    // Une autre reponse (celle de l'analyse d'une maison) n'est pas un run.
    expect(lireObservationsFacade({ forme: { valeur: 'deux-pans' } })).toBeNull();
  });
});

describe('la reponse enregistree', () => {
  it('se relit, et ignore ce qui n en a pas la forme', () => {
    const r = run([SORTIE_FACADE]);
    expect(lireRunEnregistre(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(lireRunEnregistre({ ...r, passes: 2 })).toBeNull();
    expect(lireRunEnregistre({ ...r, image: null })).toBeNull();
    expect(lireRunEnregistre({ ...r, cout: 'cher' })?.cout).toBeNull();
  });

  it('accompagne l image d un texte sans dimension : l etiquette, l image, ce que le plan attend', () => {
    expect(texteRunFacade({ etiquette: 'sud', image: 'assemblage', pointes: [{ u: 0.112, v: 3.18 }, { u: 0.8, v: 3.2 }] }))
      .toBe('Façade : sud.\nL’image est l’assemblage des photos redressées du mur.\nLe plan attend 2 pointes de pignon : u 0.11, à environ 3.2 fois l’égout ; u 0.8, à environ 3.2 fois l’égout.');
    expect(texteRunFacade({ etiquette: 'nord', image: 'elevation', pointes: [] })).toMatch(/ligne droite à l’égout\.$/);
  });
});
