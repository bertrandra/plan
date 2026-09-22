import { describe, it, expect } from 'vitest';
import { creerContexte, fermetureDe, type Contexte } from '../../../src/plateforme/contexte.js';
import type { Session } from '../../../src/plateforme/session.js';

// Etape 2 de MD/spec-connexion-plateforme.md §16 : la porte. Ce que ces tests figent, c'est la
// duree de vie du cache — jamais au-dela de `token_expires_at`, jamais sur le disque — et la
// traduction d'un refus de la plateforme en ecran, par son code et jamais par son message.
//
// Les codes et les statuts ci-dessous ne sont pas inventes : ils ont ete releves le 22 septembre
// 2026 contre la plateforme lancee en local, sur le monde de demonstration.

const CONTEXTE: Contexte = {
  user: { id: 'u1', email: 'acme-admin@raillard.org', display_name: 'ACME tenant admin', locale: 'en' },
  tenant: { id: 't1', slug: 'acme', name: 'Acme Ltd' },
  product: { id: 'p1', code: 'plan', name: 'Plan', app_url: 'https://plan.raillard.org' },
  roles: ['TENANT_ADMIN'],
  permissions: ['projects.read', 'projects.write', 'members.read'],
  capabilities: ['exports', 'max_projects', 'plan.documents', 'users', 'white_label'],
  entitlements: [],
  usage: [
    { feature: 'plan.documents', name: 'Documents', unit: 'documents', limit: 25, unlimited: false, metered: true, used: 2, remaining: 23 },
    { feature: 'white_label', name: 'Marque', unit: null, limit: null, unlimited: true, metered: false, used: null, remaining: null }
  ],
  token_expires_at: '2026-09-22T15:09:30Z'
} as Contexte;

/** Une session de papier : elle rend le contexte qu'on lui donne, et compte ses lectures. */
function monter(reponse: Contexte | Error = CONTEXTE) {
  let lectures = 0;
  let horloge = Date.parse('2026-09-22T14:09:30Z');
  const session = {
    appeler: async () => { lectures++; if (reponse instanceof Error) throw reponse; return reponse; }
  } as unknown as Session;
  const contexte = creerContexte(session, () => horloge);
  return { contexte, lectures: () => lectures, avancer: (ms: number) => { horloge += ms; } };
}

describe('le cache du contexte', () => {
  it('ne lit la plateforme qu une fois tant que le jeton vaut', async () => {
    const { contexte, lectures } = monter();
    await contexte.charger();
    await contexte.charger();
    await contexte.charger();
    expect(lectures()).toBe(1);
  });

  it('relit des que token_expires_at est passe', async () => {
    const { contexte, lectures, avancer } = monter();
    await contexte.charger();
    avancer(3600 * 1000 + 1);
    await contexte.charger();
    expect(lectures()).toBe(2);
  });

  it('ne garde rien quand token_expires_at est nul', async () => {
    // « Null … ce qu'un produit traite comme : ne pas mettre en cache. »
    const { contexte, lectures } = monter({ ...CONTEXTE, token_expires_at: null } as Contexte);
    await contexte.charger();
    await contexte.charger();
    expect(lectures()).toBe(2);
    expect(contexte.courant()).toBeNull();
  });

  it('oublie sur demande', async () => {
    const { contexte, lectures } = monter();
    await contexte.charger();
    contexte.oublier();
    expect(contexte.courant()).toBeNull();
    await contexte.charger();
    expect(lectures()).toBe(2);
  });
});

describe('ce que le contexte repond', () => {
  it('dit les permissions de la personne', async () => {
    const { contexte } = monter();
    await contexte.charger();
    expect(contexte.aPermission('projects.write')).toBe(true);
    expect(contexte.aPermission('billing.pay')).toBe(false);
  });

  it('dit les capacites de l organisation, quota et booleen confondus', async () => {
    const { contexte } = monter();
    await contexte.charger();
    expect(contexte.aCapacite('plan.documents')).toBe(true);
    expect(contexte.aCapacite('white_label')).toBe(true);
    // Le catalogue de la plateforme ne porte pas de `plan.access` : c'est le 200 qui vaut acces.
    expect(contexte.aCapacite('plan.access')).toBe(false);
  });

  it('rend le reste d un quota, et rien pour ce qui n en est pas un', async () => {
    const { contexte } = monter();
    await contexte.charger();
    expect(contexte.quota('plan.documents')).toEqual({ limite: 25, illimite: false, utilise: 2, reste: 23 });
    expect(contexte.quota('une.fonction.inconnue')).toBeNull();
  });

  it('ne repond rien avant d avoir lu', () => {
    const { contexte } = monter();
    expect(contexte.aPermission('projects.read')).toBe(false);
    expect(contexte.courant()).toBeNull();
  });
});

describe('traduire un refus en ecran', () => {
  // Statuts et codes releves contre la plateforme locale le 22 septembre 2026.
  const refus = (code: string, statut: number) => ({ code, message: 'peu importe', requestId: 'r-1', statut });

  it('un 401 renvoie au formulaire', () => {
    expect(fermetureDe(refus('UNAUTHENTICATED', 401)).raison).toBe('anonyme');
  });

  it('un 403 NO_TENANT_ACCESS dit que ce compte ne tient pas Plan', () => {
    expect(fermetureDe(refus('NO_TENANT_ACCESS', 403)).raison).toBe('sansPlan');
  });

  it('un 404 PRODUCT_NOT_FOUND dit la meme chose : le produit n est pas la', () => {
    expect(fermetureDe(refus('PRODUCT_NOT_FOUND', 404)).raison).toBe('sansPlan');
  });

  it('un 400 PRODUCT_CONTEXT_REQUIRED est une panne de Plan, pas un refus a la personne', () => {
    // C'est Plan qui a oublie l'en-tete `X-Product`. Le dire « vous n'avez pas Plan » serait un
    // mensonge, et surtout la mauvaise piste pour celui qui devra corriger.
    expect(fermetureDe(refus('PRODUCT_CONTEXT_REQUIRED', 400)).raison).toBe('panne');
  });

  it('garde le request_id, qui est la seule chose a citer', () => {
    const f = fermetureDe(refus('NO_TENANT_ACCESS', 403));
    expect(f.raison === 'sansPlan' && f.requestId).toBe('r-1');
  });
});
