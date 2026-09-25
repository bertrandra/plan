import { describe, it, expect } from 'vitest';
import { classePour, SEUIL_MOYEN, SEUIL_LARGE } from '../../../src/app/classe.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import type { EtatApp } from '../../../src/core/state.js';

// Les trois classes d'ecran (MD/spec-ihm-mobile.md §4).

describe('la classe d ecran', () => {
  it('suit la largeur : telephone, tablette, bureau', () => {
    expect(classePour(390)).toBe('compact');
    expect(classePour(SEUIL_MOYEN - 1)).toBe('compact');
    expect(classePour(SEUIL_MOYEN)).toBe('moyen');
    expect(classePour(820)).toBe('moyen');
    expect(classePour(SEUIL_LARGE - 1)).toBe('moyen');
    expect(classePour(SEUIL_LARGE)).toBe('large');
    expect(classePour(1440)).toBe('large');
  });

  it('ouvre une feuille a sa hauteur par defaut, une seule a la fois', () => {
    const m = creerMagasin({ objects: [] } as unknown as EtatApp);
    m.definirFeuille('outils');
    expect(m.store.getState().feuille).toBe('outils');
    expect(m.store.getState().hauteurFeuille).toBe('mi');
    m.definirFeuille('resultats');
    expect(m.store.getState().feuille).toBe('resultats');
    expect(m.store.getState().hauteurFeuille).toBe('plein');
    m.definirFeuille(null);
    expect(m.store.getState().feuille).toBeNull();
  });
});
