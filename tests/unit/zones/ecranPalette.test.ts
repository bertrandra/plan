// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranPalette } from '../../../src/zones/EcranPalette.js';
import { demandeEcranPalette } from '../../../src/app/ecranPalette.js';
import { JETONS, FAMILLES_JETONS, ROLES_JETONS, PAIRES_CONTRASTE, POLICES, ECHELLE_TEXTE } from '../../../src/styles/jetons.js';

// L'ecran de la palette (`?palette`) : il montre chaque jeton, famille par
// famille, chaque paire de contraste, et pose sur chaque panneau les variables de son theme.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('l ecran de la palette', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });
  const monter = () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(EcranPalette)); });
    monte = { racine, hote };
    return hote;
  };

  it('s ouvre sur ?palette (et l ancienne adresse), pas sur l ecran des controleurs', () => {
    expect(demandeEcranPalette('?palette')).toBe(true);
    expect(demandeEcranPalette('?admin&ecran=palette')).toBe(true);
    expect(demandeEcranPalette('')).toBe(false);
    expect(demandeEcranPalette('?admin&ecran=controleurs')).toBe(false);
  });

  it('range chaque jeton dans une famille, et chaque famille en a au moins un', () => {
    const familles = new Set(Object.values(ROLES_JETONS).map(r => r.famille));
    expect([...familles].sort()).toEqual(FAMILLES_JETONS.map(f => f.id).sort());
    expect(Object.keys(ROLES_JETONS).sort()).toEqual(Object.keys(JETONS.clair).sort());
  });

  it('montre une carte par jeton et une ligne par paire de contraste', () => {
    const hote = monter();
    const noms = [...hote.querySelectorAll('.palCarte .palNom')].map(e => e.textContent);
    expect(noms.sort()).toEqual(Object.keys(ROLES_JETONS).map(n => '--' + n).sort());
    expect(hote.querySelectorAll('.palContrastes tbody tr').length).toBe(PAIRES_CONTRASTE.length);
    // Le verdict est ecrit en toutes lettres, pas porte par la seule couleur.
    expect(hote.querySelectorAll('.palVerdict--non').length).toBe(0);
  });

  it('pose les variables de chaque theme sur son panneau, et n en montre qu un sur demande', () => {
    const hote = monter();
    const sombre = hote.querySelector<HTMLElement>('[data-theme-montre="sombre"]')!;
    expect(sombre.style.getPropertyValue('--ink')).toBe(JETONS.sombre.ink);
    const clair = [...hote.querySelectorAll('[role="radio"]')].find(b => b.textContent === 'Clair') as HTMLButtonElement;
    act(() => { clair.click(); });
    expect(hote.querySelectorAll('[data-theme-montre="sombre"]').length).toBe(0);
    expect(hote.querySelectorAll('[data-theme-montre="clair"]').length).toBeGreaterThan(0);
  });

  it('montre chaque police et chaque taille de l echelle, dans chaque theme', () => {
    const hote = monter();
    const themes = hote.querySelectorAll('.palTypo').length;
    expect(themes).toBe(2);
    expect(hote.querySelectorAll('.palPolice').length).toBe(Object.keys(POLICES).length * themes);
    expect(hote.querySelectorAll('.palEchelleExemple').length).toBe(ECHELLE_TEXTE.length * themes);
  });
});
