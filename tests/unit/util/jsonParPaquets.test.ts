import { describe, it, expect, vi } from 'vitest';
import { jsonParPaquets, octetsUtf8 } from '../../../src/util/jsonParPaquets.js';

// Ecrire un grand tableau en JSON par paquets (util/jsonParPaquets.ts) : exactement le texte d'un
// JSON.stringify d'un seul tenant, sa taille en octets UTF-8, et la main rendue entre deux paquets.

describe('jsonParPaquets', () => {
  const elements = Array.from({ length: 1003 }, (_, k) => ({ k, nom: k % 7 ? 'Bâtiment ' + k : 'Façade « nord » 🏠', vide: k % 3 ? null : [] }));

  it('rend les memes octets que JSON.stringify, en Blob de la taille de TextEncoder', async () => {
    const ceder = vi.fn(async () => {});
    const r = await jsonParPaquets(elements, (t) => t.map((e) => ({ ...e, double: e.k * 2 })), 100, ceder);
    const attendu = JSON.stringify(elements.map((e) => ({ ...e, double: e.k * 2 })));
    expect(await r.json.text()).toBe(attendu);
    expect(r.json.size).toBe(new TextEncoder().encode(attendu).length);
    expect(r.json.type).toBe('application/json');
    expect(r.valeurs.length).toBe(1003);
    // Onze paquets, la main rendue entre chacun.
    expect(ceder).toHaveBeenCalledTimes(10);
  });

  it('un tableau vide, ou un seul paquet', async () => {
    const vide = await jsonParPaquets([], (t) => t, 100, async () => {});
    expect(vide.valeurs).toEqual([]);
    expect(await vide.json.text()).toBe('[]');
    const un = await jsonParPaquets([1, 2], (t) => t, 100, async () => {});
    expect(await un.json.text()).toBe('[1,2]');
  });

  it('compte les octets UTF-8 sans recopier la chaine', () => {
    for (const s of ['', 'abc', 'é', '€', '🏠', 'a🏠é€z']) expect(octetsUtf8(s)).toBe(new TextEncoder().encode(s).length);
  });
});
