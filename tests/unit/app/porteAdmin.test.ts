import { describe, it, expect, vi, afterEach } from 'vitest';
import { quitterAdmin } from '../../../src/app/porteAdmin.js';

// Sortir de l'admin : la session se ferme chez le serveur AVANT que la page se recharge ; si le
// serveur ne repond pas, on ne recharge pas — la porte reviendrait sur une session encore ouverte.

afterEach(() => { vi.unstubAllGlobals(); });

describe('quitter l admin', () => {
  it('ferme la session, puis recharge', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => { appels.push((init?.method ?? 'GET') + ' ' + u); return new Response('{}', { status: 200 }); });
    const recharger = vi.fn();
    expect(await quitterAdmin(recharger)).toBe(null);
    expect(appels).toEqual(['DELETE admin/session']);
    expect(recharger).toHaveBeenCalledOnce();
  });

  it('ne recharge pas si le serveur ne repond pas, et le dit', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('reseau'); });
    const recharger = vi.fn();
    expect(await quitterAdmin(recharger)).toMatch(/reste ouverte/);
    expect(recharger).not.toHaveBeenCalled();
  });
});
