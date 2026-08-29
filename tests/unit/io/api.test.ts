// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chargerProjetInitial, apiList, apiSave, LS_LAST_PROJECT } from '../../../src/io/api.js';

// La regle testee ici est la seule vraie subtilite du module, et elle a ete apprise a l'usage :
// on ne retombe sur le jeu de demonstration QUE si ce navigateur n'a jamais ouvert de projet.
// Substituer la demonstration a un projet reel faisait croire qu'il avait ete perdu alors que
// l'API avait seulement hoquete.

const DEMO = [{ key: 'demo' }];
const MESURES = [{ id: 'm' }];

function reponse(corps: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => corps } as Response;
}

let fetchSimule: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  fetchSimule = vi.fn();
  vi.stubGlobal('fetch', fetchSimule);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quand ce navigateur n a jamais ouvert de projet', () => {
  it('demarre sur la demonstration si l API est injoignable', async () => {
    fetchSimule.mockRejectedValue(new Error('offline'));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(false);
    expect(r.objects).toEqual(DEMO);
    expect(r.measures).toEqual(MESURES);
  });

  it('copie le jeu de demonstration plutot que de le partager', async () => {
    // Sans copie, la premiere modification du plan abimerait le jeu de demonstration pour de bon.
    fetchSimule.mockRejectedValue(new Error('offline'));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.objects).not.toBe(DEMO);
    expect(r.objects[0]).not.toBe(DEMO[0]);
  });

  it('demarre aussi sur la demonstration quand api.php repond du charabia', async () => {
    fetchSimule.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('pas du JSON'); } } as unknown as Response);
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(false);
  });
});

describe('quand un projet est connu', () => {
  it('remonte l echec au lieu de servir la demonstration', async () => {
    // C'est le coeur de la regle : un vrai projet existe peut-etre cote serveur.
    localStorage.setItem(LS_LAST_PROJECT, 'p1');
    fetchSimule.mockRejectedValue(new Error('offline'));
    await expect(chargerProjetInitial(DEMO, MESURES)).rejects.toThrow(/injoignable/);
  });

  it('porte le motif reseau, pour que l appelant sache quoi montrer', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'p1');
    fetchSimule.mockRejectedValue(new Error('offline'));
    const erreur = await chargerProjetInitial(DEMO, MESURES).catch((e) => e);
    expect(erreur.reason).toBe('network');
  });

  it('distingue un 404 d une panne serveur', async () => {
    fetchSimule.mockResolvedValue(reponse(null, false, 404));
    const e404 = await apiList().catch((e) => e);
    expect(e404.reason).toBe('notfound');
    fetchSimule.mockResolvedValue(reponse(null, false, 500));
    const e500 = await apiList().catch((e) => e);
    expect(e500.reason).toBe('server');
  });
});

describe('choix du projet a ouvrir', () => {
  it('ouvre celui de localStorage quand il existe encore', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'p2');
    fetchSimule
      .mockResolvedValueOnce(reponse([{ id: 'p1' }, { id: 'p2' }]))
      .mockResolvedValueOnce(reponse({ objects: [{ key: 'x' }], measures: [], meta: { name: 'deux' } }));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(true);
    expect((r.meta as { name: string }).name).toBe('deux');
  });

  it('retombe sur le premier de la liste quand le projet retenu a disparu', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'efface');
    fetchSimule
      .mockResolvedValueOnce(reponse([{ id: 'p1' }]))
      .mockResolvedValueOnce(reponse({ objects: [], measures: [] }));
    await chargerProjetInitial(DEMO, MESURES);
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('p1');
  });

  it('cree un projet de demonstration quand le serveur est vide', async () => {
    fetchSimule
      .mockResolvedValueOnce(reponse([]))                    // list : rien
      .mockResolvedValueOnce(reponse({ id: 'neuf' }))        // save
      .mockResolvedValueOnce(reponse([{ id: 'neuf' }]))      // list a nouveau
      .mockResolvedValueOnce(reponse({ objects: [], measures: [] }));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(true);
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('neuf');
  });

  it('retient le projet ouvert, pour le retrouver au retour', async () => {
    fetchSimule
      .mockResolvedValueOnce(reponse([{ id: 'p9' }]))
      .mockResolvedValueOnce(reponse({ objects: [], measures: [] }));
    await chargerProjetInitial(DEMO, MESURES);
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('p9');
  });

  it('rend une liste de mesures vide quand le projet n en a pas', async () => {
    fetchSimule
      .mockResolvedValueOnce(reponse([{ id: 'p1' }]))
      .mockResolvedValueOnce(reponse({ objects: [] }));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.measures).toEqual([]);
  });
});

describe('les requetes', () => {
  it('portent la version du client, pour qu un onglet trop vieux soit reperable', async () => {
    fetchSimule.mockResolvedValue(reponse([]));
    await apiList();
    const entetes = fetchSimule.mock.calls[0][1].headers;
    expect(entetes['X-App-Version']).toBeTruthy();
    expect(entetes['X-Schema-Version']).toBeTruthy();
  });

  it('n utilisent jamais le cache : un projet relu doit etre a jour', async () => {
    fetchSimule.mockResolvedValue(reponse([]));
    await apiList();
    expect(fetchSimule.mock.calls[0][1].cache).toBe('no-store');
  });

  it('signalent un echec d ecriture', async () => {
    fetchSimule.mockResolvedValue(reponse(null, false, 500));
    await expect(apiSave({})).rejects.toThrow(/api save HTTP 500/);
  });
});
