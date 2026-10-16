import { describe, it, expect, afterEach, vi } from 'vitest';
import { chargerEspecesServeur } from '../../../src/io/arbresServeur.js';
import { especesChargees, poserEspeces } from '../../../src/model/especesArbre.js';

const biblio = { format: 'plan-arbres', version: 1, especes: [{ id: 'chene', nom: 'Chêne', reglages: { seed: 1 } }, { id: 'X', reglages: {} }] };
const reponse = (corps: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => poserEspeces([]));

describe('la bibliotheque du serveur', () => {
  it('se lit une fois, sans session, et ne garde que les essences valides', async () => {
    const f = vi.fn<(e: string, i?: RequestInit) => Promise<Response>>(() => reponse(biblio));
    const lues = await chargerEspecesServeur(f, true);
    expect(lues.map((e) => e.id)).toEqual(['chene']);
    expect(especesChargees()).toHaveLength(1);
    await chargerEspecesServeur(f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toMatch(/admin\/arbres$/);
  });

  it('reste vide sans bibliotheque (404), sans reseau ou avec un document etranger, sans lever', async () => {
    expect(await chargerEspecesServeur(() => reponse({}, 404), true)).toEqual([]);
    expect(await chargerEspecesServeur(() => Promise.reject(new Error('hors ligne')), true)).toEqual([]);
    expect(await chargerEspecesServeur(() => reponse({ format: 'plan-palette' }), true)).toEqual([]);
  });

  it('relit quand on le demande', async () => {
    await chargerEspecesServeur(() => reponse(biblio), true);
    const lues = await chargerEspecesServeur(() => reponse({ ...biblio, especes: [] }), true);
    expect(lues).toEqual([]);
  });
});
