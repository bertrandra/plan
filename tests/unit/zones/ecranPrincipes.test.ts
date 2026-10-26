// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranPrincipes } from '../../../src/zones/EcranPrincipes.js';
import { demandeEcranPrincipes } from '../../../src/app/administration/ecranPrincipes.js';
import { PRINCIPES, FAMILLES } from '../../../src/model/principes.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); act(() => racine.render(createElement(EcranPrincipes, {}))); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

const taper = async (c: Element | null, valeur: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(c, valeur); c?.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('l ecran des principes', () => {
  it('se demande par ?admin&ecran=principes', () => {
    expect(demandeEcranPrincipes('?admin&ecran=principes')).toBe(true);
    expect(demandeEcranPrincipes('?admin&ecran=chaine')).toBe(false);
  });

  it('un sommaire par famille mene a chaque principe, qui a ses trois angles', () => {
    const liens = [...hote.querySelectorAll('.princSommaire a')];
    expect(liens.length).toBe(PRINCIPES.length);
    for (const p of PRINCIPES) {
      expect(liens.some((a) => a.getAttribute('href') === '#principe-' + p.id), p.id).toBe(true);
      const fiche = hote.querySelector('#principe-' + p.id) as HTMLElement;
      expect(fiche, p.id).not.toBeNull();
      expect([...fiche.querySelectorAll('section[data-angle]')].map((s) => s.getAttribute('data-angle'))).toEqual(['processus', 'actions', 'coulisses']);
    }
    expect(hote.querySelectorAll('.princSommaire .princFamille').length).toBe(Object.keys(FAMILLES).length);
  });

  it('dit qui agit en toutes lettres, et lie vers les ecrans qui existent', () => {
    const acteurs = new Set([...hote.querySelectorAll('.princActeur')].map((e) => e.textContent));
    expect([...acteurs].sort()).toEqual(['Admin', 'Claude', 'Plan', 'Vous']);
    expect([...hote.querySelectorAll('a.princEcran')].some((a) => a.getAttribute('href') === '?admin&ecran=regles')).toBe(true);
    expect([...hote.querySelectorAll('.princVoir a')].every((a) => hote.querySelector(a.getAttribute('href') as string))).toBe(true);
  });

  it('l angle choisi ne montre que lui', async () => {
    const bouton = [...hote.querySelectorAll('.segmente button')].find((b) => b.textContent === 'Coulisses') as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
    expect(hote.querySelectorAll('section[data-angle="coulisses"]').length).toBe(PRINCIPES.length);
    expect(hote.querySelectorAll('section[data-angle="processus"]').length).toBe(0);
    expect(hote.querySelectorAll('section[data-angle="actions"]').length).toBe(0);
  });

  it('la recherche garde les principes qui contiennent le mot, et le dit quand il n y en a aucun', async () => {
    await taper(hote.querySelector('input[type="search"]'), 'poids');
    const gardes = [...hote.querySelectorAll('article.princFiche')].map((a) => a.id);
    expect(gardes).toContain('principe-reconciliation');
    expect(gardes.length).toBeLessThan(PRINCIPES.length);
    expect(hote.querySelectorAll('.princSommaire a').length).toBe(gardes.length);
    await taper(hote.querySelector('input[type="search"]'), 'xyzzy');
    expect(hote.querySelector('[role="status"]')?.textContent).toContain('Aucun principe');
    expect(hote.querySelectorAll('article.princFiche').length).toBe(0);
  });
});
