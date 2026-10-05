import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { clotureDe, nouveauPortail, reglerCote, synchroniserAnciensChamps } from '../../../src/model/cloture.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La cloture dans le fichier de projet (MD/spec-cloture.md §2) : ecrite seulement presente, copiee en
// profondeur, relue a l'identique ; les quatre anciens champs restent et suivent le defaut.

const parcelle = (): ObjetPlan => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
  clotureActive: true, clotureHauteur: 2, clotureCouleur: '#e19951', clotureTexture: null,
} as ObjetPlan);

describe('serialisation de la cloture', () => {
  it('un projet sans structure cloture garde la forme d avant', () => {
    const [s] = serializeObjects([parcelle()]);
    expect(s).not.toHaveProperty('cloture');
    expect(s).toMatchObject({ clotureActive: true, clotureHauteur: 2, clotureCouleur: '#e19951', clotureTexture: null });
  });

  it('ecrit la structure en copie profonde et la relit a l identique, anciens champs synchronises', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.defaut.hauteur = 1.6;
    Object.assign(reglerCote(cl, 0), { type: 'mur', limite: 'rue', mitoyenne: true });
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5, texture: { id: 't', nom: 'T', url: 'u' } });
    cl.hauteurMaxRue = 2;
    synchroniserAnciensChamps(p);
    const [s] = serializeObjects([p]);
    expect(s?.cloture).toEqual(cl);
    expect(s?.cloture).not.toBe(cl);
    expect((s?.cloture as { portails: unknown[] }).portails[0]).not.toBe(cl.portails[0]);
    expect(s).toMatchObject({ clotureActive: true, clotureHauteur: 1.6, clotureCouleur: '#e19951' });
    const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]);
    expect(relu?.cloture).toEqual(cl);
    expect(clotureDe(relu as ObjetPlan).portails).toHaveLength(1);
  });
});
