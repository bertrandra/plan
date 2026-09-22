// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chargerProjetInitial, apiList, apiSave, definirDepot, getProjectIdFromUrl, LS_LAST_PROJECT } from '../../../src/io/api.js';
import type { DepotProjets } from '../../../src/io/depotPlateforme.js';

// La regle testee ici est la seule vraie subtilite du module, et elle a ete apprise a l'usage :
// on ne retombe sur le jeu de demonstration QUE si ce navigateur n'a jamais ouvert de projet.
// Substituer la demonstration a un projet reel faisait croire qu'il avait ete perdu alors que
// l'API avait seulement hoquete.

const DEMO = [{ key: 'demo' }];
const MESURES = [{ id: 'm' }];

/** Une defaillance telle que le depot la traduit : un message et un motif, jamais un statut brut. */
function echec(motif: 'network' | 'notfound' | 'server' | 'badjson', message = 'injoignable') {
  return Object.assign(new Error(message), { reason: motif });
}

let lister: ReturnType<typeof vi.fn>;
let ouvrir: ReturnType<typeof vi.fn>;
let enregistrer: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  lister = vi.fn();
  ouvrir = vi.fn();
  enregistrer = vi.fn().mockResolvedValue({ id: 'neuf' });
  definirDepot({ lister, ouvrir, enregistrer, supprimer: vi.fn() } as unknown as DepotProjets);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quand ce navigateur n a jamais ouvert de projet', () => {
  it('demarre sur la demonstration si l API est injoignable', async () => {
    lister.mockRejectedValue(echec('network'));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(false);
    expect(r.objects).toEqual(DEMO);
    expect(r.measures).toEqual(MESURES);
  });

  it('copie le jeu de demonstration plutot que de le partager', async () => {
    // Sans copie, la premiere modification du plan abimerait le jeu de demonstration pour de bon.
    lister.mockRejectedValue(echec('network'));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.objects).not.toBe(DEMO);
    expect(r.objects[0]).not.toBe(DEMO[0]);
  });

  it('demarre aussi sur la demonstration quand la plateforme repond du charabia', async () => {
    lister.mockRejectedValue(echec('badjson', 'reponse illisible'));
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(false);
  });
});

describe('quand un projet est connu', () => {
  it('remonte l echec au lieu de servir la demonstration', async () => {
    // C'est le coeur de la regle : un vrai projet existe peut-etre cote serveur.
    localStorage.setItem(LS_LAST_PROJECT, 'p1');
    lister.mockRejectedValue(echec('network'));
    await expect(chargerProjetInitial(DEMO, MESURES)).rejects.toThrow(/injoignable/);
  });

  it('porte le motif reseau, pour que l appelant sache quoi montrer', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'p1');
    lister.mockRejectedValue(echec('network'));
    const erreur = await chargerProjetInitial(DEMO, MESURES).catch((e) => e);
    expect(erreur.reason).toBe('network');
  });

  it('distingue un projet absent d une panne de la plateforme', async () => {
    lister.mockRejectedValueOnce(echec('notfound', 'projet absent'));
    expect((await apiList().catch((e) => e)).reason).toBe('notfound');
    lister.mockRejectedValueOnce(echec('server', 'la plateforme a repondu de travers'));
    expect((await apiList().catch((e) => e)).reason).toBe('server');
  });
});

describe('le projet demande par l adresse', () => {
  it('se lit dans les deux orthographes, la plateforme envoyant la sienne', () => {
    // `projet` est celle de Plan, `project` celle de la plateforme quand on
    // quitte un projet chez elle (ADR-051 §3). Sans la seconde, le bouton
    // « Ouvrir dans Plan » ouvrait le dernier projet vu ici, pas celui qui
    // etait a l'ecran — une reponse fausse qui a l'air d'une reponse.
    history.replaceState(null, '', '/?projet=p1');
    expect(getProjectIdFromUrl()).toBe('p1');
    history.replaceState(null, '', '/?product=plan&lang=fr&project=p2');
    expect(getProjectIdFromUrl()).toBe('p2');
    history.replaceState(null, '', '/?product=plan');
    expect(getProjectIdFromUrl()).toBeNull();
  });

  it('prefere la forme locale, que la page a pu reecrire apres coup', () => {
    history.replaceState(null, '', '/?project=venu-de-la-plateforme&projet=ouvert-ici');
    expect(getProjectIdFromUrl()).toBe('ouvert-ici');
  });

  it('ouvre celui que l adresse nomme, meme si ce navigateur en connait un autre', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'p2');
    history.replaceState(null, '', '/?project=p1');
    lister.mockResolvedValue([{ id: 'p1', name: 'un' }, { id: 'p2', name: 'deux' }]);
    ouvrir.mockResolvedValue({ objects: [], measures: [], meta: { id: 'p1', name: 'un' } });

    await chargerProjetInitial(DEMO, MESURES);

    expect(ouvrir).toHaveBeenCalledWith('p1');
  });
});

describe('choix du projet a ouvrir', () => {
  it('ouvre celui de localStorage quand il existe encore', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'p2');
    lister.mockResolvedValue([{ id: 'p1', name: 'un' }, { id: 'p2', name: 'deux' }]);
    ouvrir.mockResolvedValue({ objects: [{ key: 'x' }], measures: [], meta: { id: 'p2', name: 'deux' } });
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(true);
    expect((r.meta as { name: string }).name).toBe('deux');
    expect(ouvrir).toHaveBeenCalledWith('p2');
  });

  it('retombe sur le premier de la liste quand le projet retenu a disparu', async () => {
    localStorage.setItem(LS_LAST_PROJECT, 'efface');
    lister.mockResolvedValue([{ id: 'p1', name: 'un' }]);
    ouvrir.mockResolvedValue({ objects: [], measures: [] });
    await chargerProjetInitial(DEMO, MESURES);
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('p1');
  });

  it('cree un projet de demonstration quand la plateforme n en a aucun', async () => {
    lister.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'neuf', name: 'demo' }]);
    ouvrir.mockResolvedValue({ objects: [], measures: [] });
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.apiAvailable).toBe(true);
    expect(enregistrer).toHaveBeenCalled();
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('neuf');
  });

  it('retient le projet ouvert, pour le retrouver au retour', async () => {
    lister.mockResolvedValue([{ id: 'p9', name: 'neuf' }]);
    ouvrir.mockResolvedValue({ objects: [], measures: [] });
    await chargerProjetInitial(DEMO, MESURES);
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('p9');
  });

  it('rend une liste de mesures vide quand le projet n en a pas', async () => {
    lister.mockResolvedValue([{ id: 'p1', name: 'un' }]);
    ouvrir.mockResolvedValue({ objects: [] });
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(r.measures).toEqual([]);
  });
});

describe('un document qui n est pas un plan', () => {
  it('en cree un plutot que de bloquer, quand c est Plan qui a choisi le projet', async () => {
    // La ressource de la plateforme est partagee par tous les produits : rien n'oblige un projet
    // qui s'y trouve a etre un plan, et le monde de demonstration en porte deux qui n'en sont pas.
    // Mourir la-dessus empecherait de demarrer sur un locataire parfaitement sain.
    lister.mockResolvedValueOnce([{ id: 'etranger', name: 'Abri de jardin' }])
      .mockResolvedValueOnce([{ id: 'neuf', name: 'Parcelle AE 101' }]);
    ouvrir.mockRejectedValueOnce(echec('badjson', 'pas la forme d un plan'))
      .mockResolvedValueOnce({ objects: [{ key: 'demo' }], measures: [] });
    const r = await chargerProjetInitial(DEMO, MESURES);
    expect(enregistrer).toHaveBeenCalled();
    expect(localStorage.getItem(LS_LAST_PROJECT)).toBe('neuf');
    expect(r.apiAvailable).toBe(true);
  });

  it('remonte l echec quand c est l utilisateur qui a nomme ce projet', async () => {
    // Il a demande celui-la, pas un autre : lui en substituer un ferait croire que le sien a ete
    // perdu ou remplace, ce qui est la regle que ce module tient depuis le debut.
    localStorage.setItem(LS_LAST_PROJECT, 'etranger');
    lister.mockResolvedValue([{ id: 'etranger', name: 'Abri de jardin' }]);
    ouvrir.mockRejectedValue(echec('badjson', 'pas la forme d un plan'));
    await expect(chargerProjetInitial(DEMO, MESURES)).rejects.toThrow(/plan/);
    expect(enregistrer).not.toHaveBeenCalled();
  });
});

describe('sans depot', () => {
  it('refuse tout de suite plutot que d echouer plus loin', async () => {
    // Un appel avant que la porte soit franchie est un defaut de cablage, pas une panne reseau :
    // il vaut mieux qu'il le dise a l'endroit ou il se produit.
    definirDepot(undefined as unknown as DepotProjets);
    await expect(apiList()).rejects.toThrow(/porte/);
  });
});

describe('ce que le depot rend', () => {
  it('relaie l enregistrement sans rien y ajouter', async () => {
    enregistrer.mockResolvedValue({ id: 'p1', updatedAt: '2026-09-22T10:00:00Z' });
    const r = await apiSave({ id: 'p1', name: 'un', objects: [] });
    expect(r).toEqual({ id: 'p1', updatedAt: '2026-09-22T10:00:00Z' });
    expect(enregistrer).toHaveBeenCalledWith({ id: 'p1', name: 'un', objects: [] });
  });

  it('remonte un echec d ecriture avec son motif', async () => {
    enregistrer.mockRejectedValue(echec('server', 'enregistrement du projet : QUOTA_EXCEEDED'));
    const e = await apiSave({ objects: [] }).catch((x) => x);
    expect(e.reason).toBe('server');
    expect(String(e.message)).toContain('QUOTA_EXCEEDED');
  });
});
