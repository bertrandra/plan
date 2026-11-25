// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { creerRegistre, type Droits } from '../../../src/app/commandes.js';
import { ortho } from '../../../src/render/ortho.js';
import { ChoixFond } from '../../../src/zones/BarreApplication.js';

// Le choix du fond au menu Affichage : « Photo aérienne » ou « Plan IGN », un seul coché (le fond affiché), chacun une
// commande du registre ; effacé avec la capacité du fond.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tout: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => true, reste: () => null };

describe('le choix du fond', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } ortho.actif = false; ortho.couche = 'photo'; });

  function monter(droits: Droits = tout) {
    const r = creerRegistre(droits);
    const execute = vi.fn();
    for (const id of ['affichage.fondPhoto', 'affichage.fondPlan']) r.declarer({ id, libelle: id, groupe: 'affichage', capacite: 'plan.ortho', description: 'Prend ' + id, executer: () => execute(id) });
    const hote = document.createElement('ul');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(ChoixFond, { commandes: r })); });
    monte = { racine, hote };
    return { hote, execute };
  }
  const coches = (hote: HTMLElement) => [...hote.querySelectorAll('[role="menuitemradio"]')].map((li) => [li.textContent, li.getAttribute('aria-checked')]);

  it('propose les deux fonds sous un titre, et coche celui qui est affiche', () => {
    ortho.actif = true; ortho.couche = 'plan';
    const { hote } = monter();
    expect(hote.querySelector('.menuTitre')?.textContent).toBe('Fond');
    expect(coches(hote)).toEqual([['Photo aérienne', 'false'], ['✓Plan IGN', 'true']]);
  });

  it('fond eteint : rien n est coche', () => {
    const { hote } = monter();
    expect(coches(hote).map(([, c]) => c)).toEqual(['false', 'false']);
  });

  it('un choix execute sa commande', () => {
    const { hote, execute } = monter();
    act(() => { hote.querySelector<HTMLButtonElement>('[data-commande="affichage.fondPlan"]')!.click(); });
    expect(execute).toHaveBeenCalledWith('affichage.fondPlan');
    expect(hote.querySelector('[data-commande="affichage.fondPlan"]')?.getAttribute('title')).toBe('Prend affichage.fondPlan');
  });

  it('s efface sans la capacite du fond', () => {
    const { hote } = monter({ ...tout, aCapacite: (c) => c !== 'plan.ortho' });
    expect(hote.children).toHaveLength(0);
  });
});
