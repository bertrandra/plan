// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { creerPreferencesDevis, reglagesImprimes } from '../../../src/app/devis.js';
import { poserAcces } from '../../../src/app/acces.js';
import { creerContexte, type Contexte } from '../../../src/plateforme/contexte.js';
import type { Session } from '../../../src/plateforme/session.js';
import { tauxSaisi } from '../../../src/ui/champs/devis.js';

// Les reglages du devis (app/devis.ts) : l'emetteur et le taux restent dans ce navigateur, le numero vaut pour la page ; rien
// n'entre dans le projet.

beforeEach(() => { localStorage.clear(); });

describe('les reglages du devis', () => {
  it('gardent l emetteur et le taux dans le navigateur, et le numero pour la page seulement', () => {
    const jour = () => new Date('2026-11-16T10:00:00');
    const p = creerPreferencesDevis(() => 'Parcelle AE 101', jour);
    expect(p.numeroPropose()).toBe('PARCELLE-AE-101-20261116');
    p.ecrire({ emetteur: { nom: '  Atelier Bois  ', telephone: '01 23' }, tauxTva: '5,5', numero: 'D-7' });
    expect(p.lire()).toEqual({ emetteur: { nom: 'Atelier Bois', telephone: '01 23' }, tauxTva: '5,5', numero: 'D-7' });
    p.ecrire({ emetteur: { telephone: '' } });
    expect(p.lire().emetteur).toEqual({ nom: 'Atelier Bois' });
    // Une autre page (un autre devis) retrouve l'emetteur et le taux, pas le numero.
    const q = creerPreferencesDevis(() => null, jour);
    expect(q.lire()).toEqual({ emetteur: { nom: 'Atelier Bois' }, tauxTva: '5,5', numero: '' });
    expect(reglagesImprimes(q)).toEqual({ emetteur: { nom: 'Atelier Bois' }, numero: '', tauxTva: 5.5 });
  });

  it('un stockage illisible ne casse rien', () => {
    localStorage.setItem('plan.devis', '{pas du json');
    expect(creerPreferencesDevis(() => null).lire()).toEqual({ emetteur: {}, tauxTva: '', numero: '' });
  });

  it('un taux se lit en pourcent, a la virgule ; ce qui n en est pas un ne dit rien', () => {
    expect(tauxSaisi('20')).toBe(20);
    expect(tauxSaisi('5,5 %')).toBe(5.5);
    expect(tauxSaisi('')).toBeNull();
    expect(tauxSaisi('abc')).toBeNull();
    expect(tauxSaisi('150')).toBeNull();
  });
});

describe('le nom propose de l emetteur', () => {
  const lu = (token_expires_at: string | null) => ({
    user: { id: 'u1', email: 'ada@atelier.fr', display_name: 'Ada', locale: 'fr' },
    tenant: { id: 't1', slug: 'atelier', name: 'Atelier Bois' },
    product: { id: 'p1', code: 'plan', name: 'Plan', app_url: '' },
    roles: [], permissions: [], capabilities: [], entitlements: [], usage: [], token_expires_at
  }) as unknown as Contexte;

  async function brancher(c: Contexte) {
    const session = { appeler: async () => c } as unknown as Session;
    const contexte = creerContexte(session, () => Date.parse('2026-11-16T10:00:00Z'));
    poserAcces(session, contexte);
    await contexte.charger();
  }

  it('vient du compte meme quand la plateforme ne laisse pas garder le contexte (token_expires_at nul)', async () => {
    await brancher(lu(null));
    const p = creerPreferencesDevis(() => null);
    expect(p.defautsEmetteur()).toEqual({ nom: 'Atelier Bois', email: 'ada@atelier.fr' });
    expect(reglagesImprimes(p).emetteur).toEqual({ nom: 'Atelier Bois', email: 'ada@atelier.fr' });
  });

  it('est le meme, cache valide ou non : le devis d un emetteur donne ne change pas', async () => {
    await brancher(lu('2026-11-16T11:00:00Z'));
    const avec = reglagesImprimes(creerPreferencesDevis(() => null));
    await brancher(lu(null));
    expect(reglagesImprimes(creerPreferencesDevis(() => null))).toEqual(avec);
  });
});
