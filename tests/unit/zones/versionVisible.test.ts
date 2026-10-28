// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ZoneMasquable } from '../../../src/zones/composants/versionVisible.js';
import { useCle } from '../../../src/zones/composants/abonnement.js';
import { creerMagasin, type Magasin } from '../../../src/app/magasin.js';
import type { EtatApp } from '../../../src/core/state.js';

// Une regle pour les trois classes : une zone cachee ne suit pas les rendus du plan ; elle se redessine des qu'elle redevient
// visible, avec l'etat du moment. Au telephone, elle se cache dans sa feuille fermee ; ailleurs, repliee.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function monter(magasin: Magasin, zone: ZoneMasquable): { rendus: () => number; vue: () => string } {
  let n = 0;
  const hote = document.createElement('div');
  function Zone() { n++; useCle(magasin, 'essai', (s) => String(s.version), zone); return createElement('span', null, String(magasin.version())); }
  act(() => { createRoot(hote).render(createElement(Zone)); });
  return { rendus: () => n, vue: () => hote.textContent ?? '' };
}

describe('une zone qui peut se cacher (useCle)', () => {
  it('au telephone, feuille fermee : aucun rendu ; a l ouverture : l etat du moment', () => {
    const magasin = creerMagasin({} as EtatApp);
    act(() => { magasin.definirClasse('compact'); });
    const z = monter(magasin, 'inspecteur');
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

  it('sur tablette et au bureau : repliee, aucun rendu ; depliee, chaque rendu', () => {
    for (const classe of ['moyen', 'large'] as const) {
      const magasin = creerMagasin({} as EtatApp);
      act(() => { magasin.definirClasse(classe); });
      const z = monter(magasin, 'inspecteur');
      const avant = z.rendus();
      act(() => { magasin.notifier(); });
      expect(z.rendus()).toBe(avant + 1);
      act(() => { magasin.store.setState({ inspecteurOuvert: false }); });
      const replie = z.rendus();
      act(() => { magasin.notifier(); magasin.notifier(); });
      expect(z.rendus()).toBe(replie);
      act(() => { magasin.store.setState({ inspecteurOuvert: true }); });
      expect(z.rendus()).toBe(replie + 1);
      expect(z.vue()).toBe(String(magasin.version()));
    }
  });
});
