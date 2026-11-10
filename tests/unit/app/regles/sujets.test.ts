import { describe, it, expect } from 'vitest';
import { SUJETS } from '../../../../src/app/regles/sujets/index.js';
import { ATTRIBUTS_CLAUDE } from '../../../../src/regles/conformite.js';
import { DESCRIPTIONS_SUJETS } from '../../../../src/regles/sujets/liste.js';

// Le registre des sujets de l'audit (app/regles/sujets/) : un module par description, apparie par le meme
// `id` ; ajouter un sujet qui propose est un module et une ligne, ce test refuse l'oubli de l'autre moitie
// (l'attribut dont le taux d'accord se mesure).

describe('le registre des sujets de l’audit', () => {
  it('apparie chaque description a un module par le même identifiant, et inversement', () => {
    const modules = SUJETS.map((s) => s.id);
    expect(new Set(modules).size).toBe(modules.length);
    expect([...modules].sort()).toEqual(DESCRIPTIONS_SUJETS.map((d) => d.id).sort());
  });

  it('un sujet qui propose a un attribut, un effet et une proposition ; les autres n’ont rien de cela', () => {
    for (const s of SUJETS) {
      const propose = !!s.proposer;
      expect(!!s.attribut, s.id + ' : attribut').toBe(propose);
      expect(!!s.effet, s.id + ' : effet').toBe(propose);
      if (!propose) expect(s.observer, s.id + ' : un sujet sans proposition se dit en observation').toBeTypeOf('function');
    }
  });

  it('chaque attribut dont l’accord se mesure a son sujet, une seule fois', () => {
    const attributs = SUJETS.flatMap((s) => (s.attribut ? [s.attribut] : []));
    expect(new Set(attributs).size).toBe(attributs.length);
    expect([...attributs].sort()).toEqual(ATTRIBUTS_CLAUDE.map((a) => a.code).sort());
  });

  it('garde l’ordre des lignes de l’écran des propositions (celles qui proposent, dans l’ordre du registre)', () => {
    expect(SUJETS.filter((s) => s.proposer).map((s) => s.id)).toEqual(['couverture', 'cheminees', 'terrasse', 'facades', 'murs', 'formeToit']);
  });
});
