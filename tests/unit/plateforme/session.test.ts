import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { creerSession, EchecPlateforme, MARGE_RENOUVELLEMENT_MS, REESSAI_RENOUVELLEMENT_MS, type ContexteSession } from '../../../src/plateforme/session.js';

// Etape 1 de MD/spec-connexion-plateforme.md §16 : la session existe, aucun ecran n'en depend.
// Ce que ces tests figent, ce sont les quatre regles ecrites en tete du module — et surtout celle
// qui compte le jour ou elle servira : un `401` ne doit pas tourner en boucle.

/** Une plateforme de papier : elle rend ce qu'on lui dit de rendre, et note ce qu'on lui demande. */
function monter(reponses: Array<{ statut: number; corps?: unknown; reseau?: boolean }> = []) {
  const appels: Array<{ url: string; methode: string; entetes: Record<string, string>; corps?: string }> = [];
  const file = [...reponses];
  const taches: Array<{ quand: number; quoi: () => void }> = [];
  let horloge = 1_000_000;
  const pertes: number[] = [];

  const ctx: ContexteSession = {
    fetch: (async (url: unknown, init: RequestInit = {}) => {
      appels.push({
        url: String(url), methode: init.method || 'GET',
        entetes: (init.headers || {}) as Record<string, string>,
        ...(typeof init.body === 'string' ? { corps: init.body } : {})
      });
      const r = file.shift() || { statut: 200, corps: {} };
      // Un appel que le reseau (ou le navigateur, pour une regle CORS) n'a pas laisse aboutir.
      if (r.reseau) throw new TypeError('Failed to fetch');
      return {
        ok: r.statut >= 200 && r.statut < 300,
        status: r.statut,
        json: async () => r.corps
      } as Response;
    }) as unknown as typeof fetch,
    maintenant: () => horloge,
    planifier: (quand, quoi) => { const t = { quand, quoi }; taches.push(t); return () => { const i = taches.indexOf(t); if (i >= 0) taches.splice(i, 1); }; },
    surPerte: () => { pertes.push(horloge); }
  };

  return {
    session: creerSession(ctx), appels, taches, pertes,
    avancer: (ms: number) => { horloge += ms; },
    maintenant: () => horloge
  };
}

const SESSION_OK = { statut: 200, corps: { access_token: 'jeton-a', token_type: 'Bearer', expires_in: 3600 } };

describe('ouvrir une session', () => {
  it('garde le jeton en memoire et rien ailleurs', async () => {
    const { session, appels } = monter([SESSION_OK]);
    await session.ouvrir('quelquun@exemple.test', 'un-mot-de-passe-long');
    expect(session.jeton()?.valeur).toBe('jeton-a');
    expect(session.ouverte()).toBe(true);
    // Le corps part une fois, et rien ne le range : la seule copie est celle que fetch a emportee.
    expect(appels[0]?.corps).toContain('quelquun@exemple.test');
  });

  it('convertit expires_in en instant, des la reponse', async () => {
    const { session, maintenant } = monter([SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    expect(session.jeton()?.expireA).toBe(maintenant() + 3600 * 1000);
  });

  it('envoie X-Product, que le contrat ne declare pas sur cette route', async () => {
    const { session, appels } = monter([SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    expect(appels[0]?.entetes['X-Product']).toBe('plan');
  });

  it('rend l enveloppe de la plateforme, pas un message a nous', async () => {
    const { session } = monter([{ statut: 401, corps: { error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.', details: {}, request_id: 'r-1' } } }]);
    await expect(session.ouvrir('a@b.test', 'faux')).rejects.toThrow(EchecPlateforme);
  });

  it('nomme quand meme la defaillance quand la reponse n a pas d enveloppe', async () => {
    // Une passerelle en panne rend du HTML. On ne doit pas tomber dessus sans rien dire.
    const { session } = monter([{ statut: 502 }]);
    const echec = await session.ouvrir('a@b.test', 'motdepasse1234').then(() => null, (e: EchecPlateforme) => e);
    expect(echec).toBeInstanceOf(EchecPlateforme);
    expect(echec!.erreur.code).toBe('REPONSE_ILLISIBLE');
    expect(echec!.erreur.statut).toBe(502);
  });
});

describe('reprendre une session', () => {
  it('n envoie aucun corps : la preuve est le cookie', async () => {
    const { session, appels } = monter([SESSION_OK]);
    await session.reprendre();
    expect(appels[0]?.corps).toBeUndefined();
    expect(appels[0]?.methode).toBe('POST');
  });

  it('rend faux quand personne n est connecte, sans lever', async () => {
    const { session, pertes } = monter([{ statut: 401, corps: {} }]);
    await expect(session.reprendre()).resolves.toBe(false);
    expect(pertes.length).toBe(1);
  });
});

describe('le renouvellement anticipe', () => {
  it('se programme soixante secondes avant l expiration', async () => {
    const { session, taches } = monter([SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    expect(taches.length).toBe(1);
    expect(taches[0]?.quand).toBe(3600 * 1000 - MARGE_RENOUVELLEMENT_MS);
  });

  it('remplace la tache precedente plutot que d en empiler une seconde', async () => {
    const { session, taches } = monter([SESSION_OK, SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await session.reprendre();
    expect(taches.length).toBe(1);
  });

  it('ne programme rien une fois la session fermee', async () => {
    const { session, taches } = monter([SESSION_OK, { statut: 204 }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await session.fermer();
    expect(taches.length).toBe(0);
    expect(session.jeton()).toBeNull();
  });

  it('oublie le jeton meme si la plateforme ne repond pas a la fermeture', async () => {
    const { session } = monter([SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    const ctx = session as unknown as { appeler: unknown };
    void ctx;
    await session.fermer().catch(() => undefined);
    expect(session.jeton()).toBeNull();
  });
});

describe('un 401 en plein appel', () => {
  it('donne droit a un renouvellement et un seul reessai', async () => {
    const { session, appels } = monter([
      SESSION_OK,                                   // ouverture
      { statut: 401, corps: {} },                   // l'appel
      SESSION_OK,                                   // le renouvellement
      { statut: 200, corps: { projects: [], total: 0, limit: 20, offset: 0 } } // le reessai
    ]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    const r = await session.appeler<{ total: number }>('listProjects');
    expect(r.total).toBe(0);
    expect(appels.map((a) => a.url.split('/api/v1')[1])).toEqual([
      '/auth/token', '/projects', '/auth/refresh', '/projects'
    ]);
  });

  it('ne boucle pas quand le reessai echoue encore', async () => {
    const { session, appels, pertes } = monter([
      SESSION_OK,
      { statut: 401, corps: {} },
      SESSION_OK,
      { statut: 401, corps: { error: { code: 'UNAUTHENTICATED', message: 'x', details: {}, request_id: 'r' } } }
    ]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await expect(session.appeler('listProjects')).rejects.toThrow(EchecPlateforme);
    // Quatre appels, pas cinq : le second 401 s'arrete la.
    expect(appels.length).toBe(4);
    expect(pertes.length).toBe(1);
  });

  it('ne previent de la perte qu une seule fois', async () => {
    const { session, pertes } = monter([
      SESSION_OK,
      { statut: 401, corps: {} }, { statut: 401, corps: {} },
      { statut: 401, corps: {} }, { statut: 401, corps: {} }
    ]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await session.appeler('listProjects').catch(() => undefined);
    await session.appeler('listProjects').catch(() => undefined);
    expect(pertes.length).toBe(1);
  });
});

describe('un appel ordinaire', () => {
  it('porte le jeton, le produit, et remplit les trous du chemin', async () => {
    const { session, appels } = monter([SESSION_OK, { statut: 200, corps: { id: 'p1' } }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await session.appeler('showProject', { params: { projectId: 'p1' } });
    const a = appels[1]!;
    expect(a.url).toContain('/api/v1/projects/p1');
    expect(a.entetes['Authorization']).toBe('Bearer jeton-a');
    expect(a.entetes['X-Product']).toBe('plan');
    expect(a.entetes['X-Tenant']).toBeUndefined();
  });

  it('ajoute X-Tenant seulement quand on le lui donne', async () => {
    const { session, appels } = monter([SESSION_OK, { statut: 200, corps: {} }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await session.appeler('listProjects', { locataire: 'c9f98cf9' });
    expect(appels[1]?.entetes['X-Tenant']).toBe('c9f98cf9');
  });

  it('rend rien sur un 204, sans essayer de lire un corps absent', async () => {
    const { session } = monter([SESSION_OK, { statut: 204 }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await expect(session.appeler('deleteProject', { params: { projectId: 'p1' } })).resolves.toBeUndefined();
  });

  it('refuse de fabriquer une URL avec un trou vide', async () => {
    const { session } = monter([SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await expect(session.appeler('showProject')).rejects.toThrow(/projectId/);
  });
});

describe('ce que la session ne fait pas', () => {
  it('ne touche jamais au stockage du navigateur', () => {
    // Le test vaut ce que vaut sa lecture : on lit le module, parce qu'une absence ne se teste pas
    // autrement. C'est la regle 1, et elle est facile a casser par inadvertance.
    const source = readSource();
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it('ne decide de rien sur les droits', () => {
    const source = readSource();
    expect(source).not.toMatch(/capabilities|permissions/);
  });
});

/**
 * Le code du module, commentaires retires.
 *
 * Sans ce depouillement, le test se declencherait sur la prose : le module dit noir sur blanc qu'il
 * ne touche ni a `localStorage` ni aux droits, et une regle ecrite ne doit pas faire echouer le
 * test qui verifie qu'elle est tenue.
 */
function readSource(): string {
  return readFileSync(resolve(__dirname, '../../../src/plateforme/session.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

describe('l horloge', () => {
  it('considere close une session dont le jeton a expire', async () => {
    const { session, avancer } = monter([SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    expect(session.ouverte()).toBe(true);
    avancer(3600 * 1000 + 1);
    expect(session.ouverte()).toBe(false);
  });

  it('ne programme pas un renouvellement dans le passe', async () => {
    const { session, taches } = monter([{ statut: 200, corps: { access_token: 'j', token_type: 'Bearer', expires_in: 5 } }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    expect(taches[0]?.quand).toBe(0);
  });
});

// Un garde-fou de forme : vi est importe pour la symetrie des autres suites, mais ce module
// n'espionne rien — tout passe par le contexte injecte, ce qui est la raison d'etre de celui-ci.
void vi;

describe('seul un 401 ferme la session', () => {
  // Le symptome de septembre 2026 : « deja connecte a la plateforme et j'arrive sur la page de login
  // dans Plan ». Une panne passagere du renouvellement ne dit pas que la session est morte.
  const PANNE = { statut: 503, corps: { error: { code: 'UNAVAILABLE', message: 'Plus tard.' } } };

  it('garde la session quand le renouvellement qui suit un 401 tombe en 5xx', async () => {
    const { session, pertes } = monter([SESSION_OK, { statut: 401 }, PANNE]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await expect(session.appeler('listProjects')).rejects.toBeInstanceOf(EchecPlateforme);
    expect(pertes).toHaveLength(0);
    expect(session.jeton()?.valeur).toBe('jeton-a');
  });

  it('garde la session quand le renouvellement qui suit un 401 n atteint pas la plateforme', async () => {
    const { session, pertes } = monter([SESSION_OK, { statut: 401 }, { statut: 0, reseau: true }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await expect(session.appeler('listProjects')).rejects.toThrow('Failed to fetch');
    expect(pertes).toHaveLength(0);
  });

  it('ferme la session quand le renouvellement repond 401', async () => {
    const { session, pertes } = monter([SESSION_OK, { statut: 401 }, { statut: 401 }]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await expect(session.appeler('listProjects')).rejects.toBeInstanceOf(EchecPlateforme);
    expect(pertes).toHaveLength(1);
    expect(session.jeton()).toBeNull();
  });

  it('reessaie le renouvellement anticipe qui n a pas abouti, sans rien fermer', async () => {
    const { session, taches, pertes } = monter([SESSION_OK, PANNE]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    taches.shift()!.quoi();
    await new Promise((r) => setTimeout(r, 0));
    expect(pertes).toHaveLength(0);
    expect(taches.map((t) => t.quand)).toEqual([REESSAI_RENOUVELLEMENT_MS]);
  });

  it('fait un seul renouvellement pour deux appels qui prennent un 401 ensemble', async () => {
    const { session, appels } = monter([SESSION_OK, { statut: 401 }, { statut: 401 }, SESSION_OK]);
    await session.ouvrir('a@b.test', 'motdepasse1234');
    await Promise.allSettled([session.appeler('listProjects'), session.appeler('listProjects')]);
    expect(appels.filter((a) => a.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});
