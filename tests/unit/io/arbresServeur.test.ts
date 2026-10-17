import { describe, it, expect, afterEach, vi } from 'vitest';
import { chargerEspecesServeur } from '../../../src/io/arbresServeur.js';
import { especesChargees, poserEspeces } from '../../../src/model/especesArbre.js';
import { BIBLIOTHEQUE_LIVREE } from '../../fixtures/bibliotheque-livree.js';

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

  it('laisse la bibliotheque vide sans bibliotheque du serveur (404) ou avec un document etranger, sans lever : le code n\'a aucune essence', async () => {
    poserEspeces([]);
    expect(await chargerEspecesServeur(() => reponse({}, 404), true)).toEqual([]);
    poserEspeces([]);
    expect(await chargerEspecesServeur(() => reponse({ format: 'plan-palette' }), true)).toEqual([]);
  });

  it('lit le fichier livre tel que le serveur le sert : 40 essences', async () => {
    const texte = JSON.parse(JSON.stringify({ format: 'plan-arbres', version: 1, modifieLe: 'x', especes: BIBLIOTHEQUE_LIVREE }));
    expect(await chargerEspecesServeur(() => reponse(texte), true)).toHaveLength(40);
  });

  it('sans reseau, la bibliotheque reste ce qu\'elle etait', async () => {
    poserEspeces(BIBLIOTHEQUE_LIVREE);
    expect(await chargerEspecesServeur(() => Promise.reject(new Error('hors ligne')), true)).toEqual(BIBLIOTHEQUE_LIVREE);
  });

  it('relit quand on le demande', async () => {
    await chargerEspecesServeur(() => reponse(biblio), true);
    const lues = await chargerEspecesServeur(() => reponse({ ...biblio, especes: [] }), true);
    // Une bibliotheque enregistree vide reste vide : les arbres se dessinent en repli.
    expect(lues).toEqual([]);
  });
});
