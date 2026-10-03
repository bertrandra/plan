// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranPalette } from '../../../src/zones/EcranPalette.js';
import { JETONS } from '../../../src/styles/jetons.js';

// Le selecteur avance de la palette : il s'ouvre depuis le reglage d'une couleur, chaque geste
// s'applique aussitot au code et aux apercus, et Echap le ferme.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('le selecteur de couleur avance', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });

  function ouvrir(nom: string, theme: string) {
    history.replaceState(null, '', '/');
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(EcranPalette)); });
    monte = { racine, hote };
    const reglage = hote.querySelector('[data-jeton="' + nom + '"] [data-theme="' + theme + '"]')!;
    act(() => { reglage.querySelector<HTMLButtonElement>('.palAvance')!.click(); });
    return { hote, reglage, code: () => reglage.querySelector<HTMLInputElement>('.palCodeCouleur')!.value, dialogue: () => hote.querySelector<HTMLElement>('.selCouleur') };
  }
  const poser = (champ: HTMLInputElement, valeur: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(champ, valeur); champ.dispatchEvent(new Event('input', { bubbles: true })); });
  };

  it('s ouvre depuis le reglage, en dialogue nomme, avec la couleur d avant', () => {
    const { reglage, dialogue } = ouvrir('accent', 'clair');
    expect(reglage.querySelector('.palAvance')!.getAttribute('aria-expanded')).toBe('true');
    expect(dialogue()!.getAttribute('role')).toBe('dialog');
    expect(dialogue()!.getAttribute('aria-label')).toContain('--accent');
    expect(dialogue()!.querySelector('.selAvantApres')!.textContent).toContain(JETONS.clair.accent);
  });

  it('applique la teinte, les champs RVB et le nuancier au code de la couleur', () => {
    const { code, dialogue } = ouvrir('accent', 'clair');
    poser(dialogue()!.querySelector<HTMLInputElement>('input[aria-label="Teinte"]')!, '200');
    expect(code()).not.toBe(JETONS.clair.accent);
    const rouge = dialogue()!.querySelector<HTMLInputElement>('input[aria-label^="Rouge"]')!;
    poser(rouge, '255');
    expect(code().slice(1, 3)).toBe('FF');
    act(() => { dialogue()!.querySelector<HTMLButtonElement>('[aria-label^="Reprendre --ok,"]')!.click(); });
    expect(code()).toBe(JETONS.clair.ok);
    act(() => { [...dialogue()!.querySelectorAll('button')].find(b => b.textContent === 'Revenir')!.click(); });
    expect(code()).toBe(JETONS.clair.accent);
  });

  it('montre les contrastes ou la couleur intervient', () => {
    const { dialogue } = ouvrir('ink-soft', 'clair');
    expect(dialogue()!.querySelectorAll('.selContrastes li').length).toBe(3);
  });

  it('se ferme par Echap', () => {
    const { dialogue } = ouvrir('paper', 'sombre');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(dialogue()).toBeNull();
  });
});
