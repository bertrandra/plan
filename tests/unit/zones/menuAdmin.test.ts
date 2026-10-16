// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { creerRegistre } from '../../../src/app/commandes.js';

/** Le registre, avec la commande du menu (declaree dans app/ecouteurs/divers.ts). */
function registre() {
  const r = creerRegistre();
  r.declarer({ id: 'admin.consommation', libelle: 'Consommation de Claude', groupe: 'admin', executer: () => {} });
  r.declarer({ id: 'admin.conformite', libelle: 'Conformité', groupe: 'admin', executer: () => {} });
  r.declarer({ id: 'admin.regles', libelle: 'Règles', groupe: 'admin', executer: () => {} });
  r.declarer({ id: 'admin.auditsParcelle', libelle: 'Audits', groupe: 'admin', executer: () => {} });
  return r;
}

// Le menu Admin de la barre : il n'existe que pour un administrateur. Il mene au mode audit ; en
// admin des demos, aussi aux ecrans secondaires (controleurs, palette, consommation de Claude) ;
// la consommation passe par le registre des commandes.

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
    act(() => { racine.render(createElement(MenuAdmin, { commandes: registre() })); });
    monte = { racine, hote };
    return hote;
  }

  it('n existe pas hors admin', async () => {
    const hote = await monter(false);
    expect(hote.querySelector('#menuAdmin')).toBeNull();
  });

  it('mene au mode audit, aux controleurs, a la palette, a la consommation, a la conformite, aux regles et aux audits de parcelle en admin des demos', async () => {
    const hote = await monter(true);
    expect(hote.querySelector('#menuAdmin summary')?.textContent).toBe('Admin');
    expect([...hote.querySelectorAll('[data-controle], [data-commande]')].map(e => e.getAttribute('data-controle') ?? e.getAttribute('data-commande')))
      .toEqual(['admin.audit', 'admin.controleurs', 'admin.palette', 'admin.arbres', 'admin.consommation', 'admin.conformite', 'admin.regles', 'admin.auditsParcelle']);
    expect(hote.querySelector('[data-commande="admin.consommation"]')?.textContent).toBe('Consommation de Claude');
    expect(hote.querySelector('[data-commande="admin.conformite"]')?.textContent).toBe('Conformité');
    expect(hote.querySelector('[data-commande="admin.regles"]')?.textContent).toBe('Règles');
    expect(hote.querySelector('[data-commande="admin.auditsParcelle"]')?.textContent).toBe('Audits');
  });

  it('l administrateur de la plateforme n y trouve que le mode audit', async () => {
    vi.resetModules();
    const acces = await import('../../../src/app/acces.js');
    acces.poserAcces({} as never, { courant: () => null, charger: async () => ({ roles: ['tenant_admin'] }) } as never);
    expect(await acces.confirmerAdministrateur()).toBe(true);
    const { MenuAdmin } = await import('../../../src/zones/BarreApplication.js');
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(MenuAdmin, { commandes: registre() })); });
    monte = { racine, hote };
    expect([...hote.querySelectorAll('[data-controle], [data-commande]')].map(e => e.getAttribute('data-controle') ?? e.getAttribute('data-commande'))).toEqual(['admin.audit']);
  });

  it('un compte sans role d administration ne le voit pas', async () => {
    vi.resetModules();
    const acces = await import('../../../src/app/acces.js');
    acces.poserAcces({} as never, { courant: () => null, charger: async () => ({ roles: ['membre'] }) } as never);
    expect(await acces.confirmerAdministrateur()).toBe(false);
    expect(acces.estAdministrateur()).toBe(false);
  });
});
