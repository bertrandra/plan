// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { useVersionVisible } from '../../../src/zones/composants/versionVisible.js';
import { creerMagasin, type Feuille, type Magasin } from '../../../src/app/magasin.js';
import type { EtatApp } from '../../../src/core/state.js';

// Au telephone, une zone portee par une feuille fermee ne suit pas les rendus du plan ; elle se redessine a l'ouverture de sa
// feuille, avec l'etat du moment. Sur tablette et au bureau, elle les suit tous.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function monter(magasin: Magasin, feuille: Feuille): { rendus: () => number; vue: () => string } {
  let n = 0;
  const hote = document.createElement('div');
  function Zone() { n++; useVersionVisible(magasin, feuille); return createElement('span', null, String(magasin.version())); }
  act(() => { createRoot(hote).render(createElement(Zone)); });
  return { rendus: () => n, vue: () => hote.textContent ?? '' };
}

describe('useVersionVisible', () => {
  it('au telephone, feuille fermee : aucun rendu ; a l ouverture : l etat du moment', () => {
    const magasin = creerMagasin({} as EtatApp);
    act(() => { magasin.definirClasse('compact'); });
    const z = monter(magasin, 'proprietes');
    const avant = z.rendus();
    act(() => { magasin.notifier(); magasin.notifier(); });
    expect(z.rendus()).toBe(avant);
    act(() => { magasin.definirFeuille('objets'); magasin.notifier(); });
    expect(z.rendus()).toBe(avant);
    act(() => { magasin.definirFeuille('proprietes'); });
    expect(z.rendus()).toBe(avant + 1);
    expect(z.vue()).toBe(String(magasin.version()));
    act(() => { magasin.notifier(); });
    expect(z.rendus()).toBe(avant + 2);
  });

  it('sur tablette et au bureau : chaque rendu du plan, feuille ou pas', () => {
    for (const classe of ['moyen', 'large'] as const) {
      const magasin = creerMagasin({} as EtatApp);
      act(() => { magasin.definirClasse(classe); });
      const z = monter(magasin, 'proprietes');
      const avant = z.rendus();
      act(() => { magasin.notifier(); });
      expect(z.rendus()).toBe(avant + 1);
    }
  });
});
