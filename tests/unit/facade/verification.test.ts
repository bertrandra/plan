import { describe, it, expect } from 'vitest';
import { avecGrille, estIncertaine, retouchee, tracerCorrections, versOuvertureFacade } from '../../../src/facade/verification.js';
import type { OuvertureFacade } from '../../../src/model/types.js';

// La verification d'un releve (spec-facades §12, §13, lot L15) : ce que la detection propose devient
// des ouvertures du releve, et chaque correction de l'utilisateur est tracee.

const f = (x: number, y: number, autre: Partial<OuvertureFacade> = {}): OuvertureFacade => ({ type: 'fenetre', x, y, l: 1.2, h: 1.35, confiance: 0.9, source: 'detectee', ...autre });

describe('versOuvertureFacade', () => {
  it('garde la boite, la confiance, la source, la rangee, la travee et les details', () => {
    const o = versOuvertureFacade({ type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.35, confiance: 0.82, source: 'detectee', niveau: 0, travee: 2, details: { volets: 'battants' } });
    expect(o).toEqual({ type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.35, confiance: 0.82, source: 'detectee', niveau: 0, travee: 2, details: { volets: 'battants' } });
  });

  it('n ecrit pas de details vides', () => {
    expect(versOuvertureFacade({ type: 'porte', x: 4, y: 0, l: 1, h: 2.1, confiance: 1, details: {} })).not.toHaveProperty('details');
  });
});

describe('pointille et retouche', () => {
  it('pointille une devinee ou une ouverture de faible confiance ; pleine sinon, ou posee a la main', () => {
    expect(estIncertaine({ source: 'devinee', confiance: 0.9 })).toBe(true);
    expect(estIncertaine({ source: 'detectee', confiance: 0.5 })).toBe(true);
    expect(estIncertaine({ source: 'detectee', confiance: 0.7 })).toBe(false);
    expect(estIncertaine({})).toBe(false);
  });

  it('une ouverture retouchee au doigt est verifiee : corrigee, sans confiance', () => {
    expect(retouchee(f(1, 0.9, { confiance: 0.4 }))).toEqual({ type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.35, source: 'corrigee' });
    expect(retouchee({ type: 'porte', x: 1, y: 0, l: 1, h: 2, source: 'ajoutee' }).source).toBe('ajoutee');
  });
});

describe('avecGrille', () => {
  it('recalcule la grille sur les ouvertures retenues, et la rangee et la travee de chacune', () => {
    const r = avecGrille([f(1, 0.9), f(1, 3.8), f(5, 3.8)], 8);
    expect(r.grille?.niveaux).toHaveLength(2);
    expect(r.grille?.travees).toHaveLength(2);
    expect(r.ouvertures.map((o) => [o.niveau, o.travee])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(avecGrille([], 8)).toEqual({ ouvertures: [], grille: null });
  });
});

describe('tracerCorrections', () => {
  const proposees = [f(1, 0.9), f(5, 0.9), f(1, 3.8), f(5, 3.8, { source: 'devinee', confiance: 0.75 })];
  const decochees = [f(9, 0.9, { source: 'devinee', confiance: 0.4 })];

  it('rien touche : aucune correction, les sources gardees', () => {
    const t = tracerCorrections(proposees, decochees, proposees);
    expect(t.corrections).toEqual([]);
    expect(t.ouvertures.map((o) => o.source)).toEqual(['detectee', 'detectee', 'detectee', 'devinee']);
  });

  it('trace un deplacement avec son ecart, un changement de type, un retrait et un ajout', () => {
    const retenues: OuvertureFacade[] = [
      { ...f(1, 0.9), x: 1.04, l: 1.16 },
      { ...f(5, 0.9), type: 'porte-fenetre' },
      f(1, 3.8),
      { type: 'porte', x: 3, y: 0, l: 0.9, h: 2.1 },
    ];
    const t = tracerCorrections(proposees, decochees, retenues);
    expect(t.corrections).toEqual([
      { geste: 'deplacement', type: 'fenetre', x: 1.04, y: 0.9, l: 1.16, h: 1.35, ecart: { x: 0.04, y: 0, l: -0.04, h: 0 } },
      { geste: 'type', type: 'porte-fenetre', x: 5, y: 0.9, l: 1.2, h: 1.35, avant: 'fenetre' },
      { geste: 'ajout', type: 'porte', x: 3, y: 0, l: 0.9, h: 2.1 },
      { geste: 'retrait', type: 'fenetre', x: 5, y: 3.8, l: 1.2, h: 1.35, source: 'devinee' },
    ]);
    expect(t.ouvertures.map((o) => o.source)).toEqual(['corrigee', 'corrigee', 'detectee', 'ajoutee']);
  });

  it('une devinee decochee que l utilisateur garde est un ajout de source devinee', () => {
    const t = tracerCorrections(proposees, decochees, [...proposees, decochees[0] as OuvertureFacade]);
    expect(t.corrections).toEqual([{ geste: 'ajout', type: 'fenetre', x: 9, y: 0.9, l: 1.2, h: 1.35, source: 'devinee' }]);
    expect(t.ouvertures[4]?.source).toBe('devinee');
  });
});
