// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Le menu Admin de la barre : il n'existe qu'en admin des demos, et mene aux deux ecrans
// secondaires (controleurs, palette).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('le menu Admin', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } vi.resetModules(); });

  async function monter(admin: boolean) {
    vi.resetModules();
    const acces = await import('../../../src/app/acces.js');
    if (admin) acces.entrerEnAdmin();
    const { MenuAdmin } = await import('../../../src/zones/BarreApplication.js');
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(MenuAdmin)); });
    monte = { racine, hote };
    return hote;
  }

  it('n existe pas hors admin', async () => {
    const hote = await monter(false);
    expect(hote.querySelector('#menuAdmin')).toBeNull();
  });

  it('mene aux controleurs et a la palette en admin', async () => {
    const hote = await monter(true);
    expect(hote.querySelector('#menuAdmin summary')?.textContent).toBe('Admin');
    expect([...hote.querySelectorAll('[data-controle]')].map(e => e.getAttribute('data-controle'))).toEqual(['admin.controleurs', 'admin.palette']);
  });
});
