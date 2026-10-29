import { describe, it, expect, vi } from 'vitest';
import { creerClientAnalyse, EchecAnalyse, lireBrouillonServeur, type DemandeAnalyse } from '../../../src/io/analyseClaude.js';

// Le client des routes de l'analyse (deploy/analyse.php) : le jeton de la plateforme sur chaque appel,
// l'en-tete d'ecriture sur l'envoi, et un motif par refus du serveur.

const reponse = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const DEMANDE: DemandeAnalyse = { projet: 'p1', idu: 'AE0101', adresse: null, audit: 'a1', usage: 'analyse', requetes: [{ id: 'b0-p1', passe: 1, facades: 1, contenu: [{ type: 'text', text: 'x' }] }] };

describe('le client de l analyse', () => {
  it('parle au serveur avec le jeton de la plateforme, et l en-tete d ecriture sur l envoi', async () => {
    const f = vi.fn(async (entree: string, init?: RequestInit) => {
      if (entree === 'admin/claude/etat') return reponse(200, { actif: true, prompt: 1, schema: 1, organisation: 'org-1', admin: false });
      if (entree === 'admin/claude/batches') return reponse(201, { batch: { id: 'msgbatch_1', etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 });
      if (entree === 'admin/claude/batches/msgbatch_1') return reponse(200, { id: 'msgbatch_1', etat: 'ended', compte: null });
      if (entree === 'admin/claude/batches/msgbatch_1/resultats') return reponse(200, { batch: { id: 'msgbatch_1', etat: 'ended', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: [] });
      return reponse(404, { error: { code: 'NOT_FOUND', message: 'route ' + entree + ' ' + (init?.method ?? 'GET') } });
    });
    const c = creerClientAnalyse(f, () => 'jeton-1');
    expect(await c.etat()).toEqual({ actif: true, prompt: 1, schema: 1, organisation: 'org-1', admin: false, modeles: [], brouillon: null });
    expect((await c.creerBatch(DEMANDE)).batch.id).toBe('msgbatch_1');
    expect((await c.etatBatch('msgbatch_1')).etat).toBe('ended');
    expect((await c.resultats('msgbatch_1')).resultats).toEqual([]);
    const envoi = f.mock.calls.find((x) => x[0] === 'admin/claude/batches')!;
    expect(envoi[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { Authorization: 'Bearer jeton-1', 'X-Plan-Admin': '1', 'Content-Type': 'application/json' } });
    expect(JSON.parse(envoi[1]!.body as string)).toEqual(DEMANDE);
    for (const x of f.mock.calls) expect((x[1]!.headers as Record<string, string>).Authorization).toBe('Bearer jeton-1');
  });

  it('se passe de jeton pour l administrateur : le cookie de sa session suffit', async () => {
    const f = vi.fn<(e: string, i?: RequestInit) => Promise<Response>>(async () => reponse(200, { actif: true }));
    await creerClientAnalyse(f, () => null).etat();
    expect((f.mock.calls[0]![1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('lit le modele de l escalade d une facade et ses prix ; un prix illisible se lit sans tarif', async () => {
    const etat = async (escaladeFacade: unknown) => (await creerClientAnalyse(async () => reponse(200, { actif: true, escaladeFacade }), () => null).etat()).escaladeFacade;
    expect(await etat({ modele: 'claude-sonnet-5-5', prix: { entree: 2, sortie: 10 } })).toEqual({ modele: 'claude-sonnet-5-5', prix: { entree: 2, sortie: 10 } });
    expect(await etat({ modele: 'claude-sonnet-5-5', prix: { entree: 'cher', sortie: 10 } })).toEqual({ modele: 'claude-sonnet-5-5', prix: null });
    expect(await etat(undefined)).toBeUndefined();
  });

  it('donne un motif a chaque refus : plafond, non configure, refuse, pas pret, reseau', async () => {
    const motif = async (r: () => Promise<Response>) => {
      try { await creerClientAnalyse(r, () => 'j').etatBatch('x'); return null; } catch (e) { return e instanceof EchecAnalyse ? [e.motif, e.message] : 'autre'; }
    };
    expect(await motif(async () => reponse(429, { error: { code: 'BUDGET_EXCEEDED', message: 'Plafond atteint' } }))).toEqual(['plafond', 'suivi de l’analyse : Plafond atteint']);
    expect(await motif(async () => reponse(503, { error: { message: 'cle' } }))).toEqual(['nonConfigure', 'suivi de l’analyse : cle']);
    expect(await motif(async () => reponse(401, {}))).toEqual(['refuse', 'suivi de l’analyse : HTTP 401']);
    expect(await motif(async () => reponse(409, { error: { message: 'pas fini' } }))).toEqual(['pasPret', 'suivi de l’analyse : pas fini']);
    expect(await motif(async () => reponse(404, {}))).toEqual(['introuvable', 'suivi de l’analyse : HTTP 404']);
    expect(await motif(async () => { throw new TypeError('Failed to fetch'); })).toEqual(['reseau', 'suivi de l’analyse : Failed to fetch']);
    expect(await motif(async () => reponse(500, {}))).toEqual(['serveur', 'suivi de l’analyse : HTTP 500']);
  });

  it('lit le brouillon des regles de l etat (administrateur), et l essai nomme dans la demande part tel quel', async () => {
    const corps: unknown[] = [];
    const f = vi.fn(async (entree: string, init?: RequestInit) => {
      if (entree === 'admin/claude/etat') return reponse(200, { actif: true, prompt: 5, schema: 1, organisation: 'admin', admin: true, brouillon: { enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1 } });
      if (entree === 'admin/claude/batches') { corps.push(JSON.parse(init!.body as string)); return reponse(201, { batch: { id: 'msgbatch_1', etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 6, schema: 1, essai: true }); }
      return reponse(404, { error: { code: 'NOT_FOUND', message: entree } });
    });
    const c = creerClientAnalyse(f, () => null);
    expect((await c.etat()).brouillon).toEqual({ enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1 });
    expect((await c.creerBatch({ ...DEMANDE, essai: 'brouillon' })).essai).toBe(true);
    expect(corps[0]).toMatchObject({ essai: 'brouillon' });
    // Un serveur d'avant le brouillon, ou un etat sans lui : aucun brouillon.
    expect(lireBrouillonServeur(undefined)).toBeNull();
    expect(lireBrouillonServeur(null)).toBeNull();
    expect(lireBrouillonServeur({ prompt: '6', schema: 2 })).toEqual({ enregistreLe: null, prompt: 6, schema: 2 });
  });
});
