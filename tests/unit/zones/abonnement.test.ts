// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { useCle, ZoneMontee, cleEtat } from '../../../src/zones/composants/abonnement.js';
import { creerMagasin, type Magasin } from '../../../src/app/magasin.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ZoneMasquable } from '../../../src/zones/composants/versionVisible.js';

// Une zone ne se redessine que si ce qu'elle montre change (sa cle), pas a chaque rendu du plan ; cachee, elle est gelee. En
// developpement, un rendu saute est verifie : la zone redessinee a part doit montrer la meme chose, sinon `[cle de version]`.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Une zone qui montre `donnees.montre` et declare `donnees.cle` : les deux peuvent diverger, pour le garde-fou. */
function monter(magasin: Magasin, donnees: { cle: string; montre: string }, zone?: ZoneMasquable) {
  let n = 0;
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  function Zone() { n++; useCle(magasin, 'essai', () => donnees.cle, zone); return createElement('span', null, donnees.montre); }
  act(() => { createRoot(hote).render(createElement(ZoneMontee.Provider, { value: { conteneur: hote, magasin } }, createElement(Zone))); });
  return { rendus: () => n, vue: () => hote.textContent ?? '' };
}

const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

describe('useCle', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('un rendu du plan qui ne change pas la cle ne redessine pas la zone ; une cle changee la redessine', async () => {
    const magasin = creerMagasin({} as EtatApp);
    const d = { cle: 'a', montre: 'a' };
    const z = monter(magasin, d);
    const avant = z.rendus();
    act(() => { magasin.notifier(); magasin.notifier(); });
    await attendre();
    // Le garde-fou a redessine la zone a part (developpement), mais pas sur l'abonnement : au plus un rendu par verification.
    const apresInchange = z.rendus();
    d.cle = 'b'; d.montre = 'b';
    act(() => { magasin.notifier(); });
    expect(z.rendus()).toBeGreaterThan(apresInchange);
    expect(z.vue()).toBe('b');
    expect(apresInchange - avant).toBeLessThanOrEqual(2);
  });

  it('la cle ne se relit qu a un nouveau rendu du plan : le pointeur qui bouge ne coute rien', () => {
    const magasin = creerMagasin({} as EtatApp);
    let lectures = 0;
    function Zone() { useCle(magasin, 'essai', () => { lectures++; return 'x'; }); return null; }
    const hote = document.createElement('div');
    act(() => { createRoot(hote).render(createElement(Zone)); });
    const avant = lectures;
    act(() => { for (let i = 0; i < 20; i++) magasin.definirPointeur({ x: i, y: i }); });
    expect(lectures).toBe(avant);
    act(() => { magasin.notifier(); });
    expect(lectures).toBe(avant + 1);
  });

  it('cachee, la zone est gelee ; montree, elle se redessine avec l etat du moment', () => {
    const magasin = creerMagasin({} as EtatApp);
    act(() => { magasin.definirClasse('compact'); });
    const d = { cle: 'a', montre: 'a' };
    const z = monter(magasin, d, 'inspecteur');
    const avant = z.rendus();
    d.cle = 'b'; d.montre = 'b';
    act(() => { magasin.notifier(); });
    expect(z.rendus()).toBe(avant);
    expect(z.vue()).toBe('a');
    act(() => { magasin.definirFeuille('proprietes'); });
    expect(z.vue()).toBe('b');
  });

  it('en developpement, une zone dont la cle oublie ce qu elle montre est signalee, et redessinee', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const magasin = creerMagasin({} as EtatApp);
    const d = { cle: 'a', montre: 'a' };
    const z = monter(magasin, d);
    d.montre = 'b'; // la cle ne le dit pas
    act(() => { magasin.notifier(); });
    await attendre();
    expect(erreur.mock.calls.some((c) => String(c[0]).startsWith('[cle de version] zone « essai »'))).toBe(true);
    expect(z.vue()).toBe('b');
  });

  it('une cle complete ne declenche aucun signalement', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const magasin = creerMagasin({} as EtatApp);
    monter(magasin, { cle: 'a', montre: 'a' });
    act(() => { magasin.notifier(); magasin.notifier(); });
    await attendre();
    expect(erreur.mock.calls.filter((c) => String(c[0]).startsWith('[cle de version]'))).toEqual([]);
  });

  it('la part commune des cles suit l etat d interface du plan', () => {
    const etat = { objects: [], measures: [], selectedKey: null, highlight: { type: null, index: null }, showNorth: true, grilleVisible: false,
      parasol: { ombreAffichee: true, carteAffichee: false, dateStr: '2026-06-21', minutes: 900 } } as unknown as EtatApp;
    const magasin = creerMagasin(etat);
    const a = cleEtat(magasin.store.getState());
    etat.grilleVisible = true;
    act(() => { magasin.notifier(); });
    const b = cleEtat(magasin.store.getState());
    expect(b).not.toBe(a);
    act(() => { magasin.notifier(); });
    expect(cleEtat(magasin.store.getState())).toBe(b);
  });
});
