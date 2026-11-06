import { describe, it, expect, vi, afterEach } from 'vitest';
import { communeDuCadastre, interrogerCadastre } from '../../../src/geo/apiIgn.js';

// Paris, Lyon et Marseille : la BAN rend le code de l'arrondissement, le cadastre range les
// parcelles sous celui de la commune. Filtrer sur l'arrondissement ne ramenait rien (Zenith de
// Paris, BAN 75119, parcelle 75056 CR 33).
describe('le code de commune du cadastre', () => {
  it('ramene les arrondissements a leur commune', () => {
    expect(communeDuCadastre('75101')).toBe('75056');
    expect(communeDuCadastre('75119')).toBe('75056');
    expect(communeDuCadastre('75120')).toBe('75056');
    expect(communeDuCadastre('69381')).toBe('69123');
    expect(communeDuCadastre('69389')).toBe('69123');
    expect(communeDuCadastre('13201')).toBe('13055');
    expect(communeDuCadastre('13216')).toBe('13055');
  });
  it('laisse tout autre code tel quel', () => {
    for (const c of ['78650', '75056', '69123', '13055', '75121', '75100', '69380', '13217', '13200', '2A004', ''])
      expect(communeDuCadastre(c)).toBe(c);
  });
});

describe('interrogerCadastre a Paris', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('filtre sur 75056 et accepte la parcelle de la commune', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: null, properties: { code_insee: '75056', code_arr: '119', section: 'CR', numero: '0033' } }
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const geom = { type: 'Polygon' as const, coordinates: [[[2.39, 48.89], [2.40, 48.89], [2.40, 48.90], [2.39, 48.89]]] };
    const features = await interrogerCadastre(geom, '75119');
    expect(features).toHaveLength(1);
    expect(urls[0]).toContain('code_insee=75056');
    expect(urls[0]).not.toContain('75119');
  });
});
