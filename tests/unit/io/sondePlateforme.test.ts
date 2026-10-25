import { describe, it, expect, vi, afterEach } from 'vitest';
import { sonderPlateforme, DELAI_SONDE_MS } from '../../../src/io/sondePlateforme.js';

// La sonde de la porte (io/sondePlateforme.ts) : vrai sur un 2xx de /auth/jwks, faux sur toute autre reponse, une panne de reseau,
// un delai depasse ou un arret demande ; jamais depuis le cache.

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('sonderPlateforme', () => {
  it('demande les cles publiques sans cache, et dit vrai sur un 2xx', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await sonderPlateforme('https://plateforme.test/', new AbortController().signal)).toBe(true);
    expect(f).toHaveBeenCalledWith('https://plateforme.test/api/v1/auth/jwks', expect.objectContaining({ cache: 'no-store' }));
  });

  it('dit faux sur une erreur, ou quand le reseau ne repond pas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await sonderPlateforme('https://plateforme.test', new AbortController().signal)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await sonderPlateforme('https://plateforme.test', new AbortController().signal)).toBe(false);
  });

  it('abandonne au bout du delai, ou quand on l arrete', async () => {
    vi.useFakeTimers();
    const pendante = (_: string, o: RequestInit) => new Promise<Response>((_r, rejeter) => {
      o.signal?.addEventListener('abort', () => rejeter(new DOMException('abandon', 'AbortError')));
    });
    vi.stubGlobal('fetch', vi.fn(pendante));
    const p = sonderPlateforme('https://plateforme.test', new AbortController().signal);
    vi.advanceTimersByTime(DELAI_SONDE_MS);
    expect(await p).toBe(false);
    const stop = new AbortController();
    const q = sonderPlateforme('https://plateforme.test', stop.signal);
    stop.abort();
    expect(await q).toBe(false);
  });
});
