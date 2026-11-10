import { describe, it, expect, vi } from 'vitest';
import { creerClientRegles } from '../../../src/io/reglesServeur.js';

// Le brouillon des regles sur le serveur (admin/claude/regles) : lecture, enregistrement, retrait ; les
// ecritures portent l'en-tete admin, les refus disent la raison du serveur.

const reponse = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

describe('le client du brouillon des règles', () => {
  it('lit le brouillon avec ses textes et l’état de l’éditeur, ou null quand il n’y en a pas', async () => {
    const f = vi.fn(async () => reponse(200, { brouillon: { enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1, prompt_texte: '---\nversion: 6\n---\ncorps', schema_texte: '{}', etat: { liste: [], exclus: [] } } }));
    const b = await creerClientRegles(f).lire();
    expect(b).toEqual({ enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1, promptTexte: '---\nversion: 6\n---\ncorps', schemaTexte: '{}', etat: { liste: [], exclus: [] } });
    expect(f).toHaveBeenCalledWith('admin/claude/regles', expect.objectContaining({ credentials: 'same-origin' }));
    expect(await creerClientRegles(async () => reponse(200, { brouillon: null })).lire()).toBeNull();
  });

  it('enregistre par PUT, avec l’en-tête admin et le prompt, le schéma et l’état', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => { expect(url).toBe('admin/claude/regles'); expect(init).toBeDefined(); return reponse(200, { brouillon: { enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1 } }); });
    const v = await creerClientRegles(f).enregistrer({ prompt: 'p', schema: 's', etat: { liste: [] } });
    expect(v).toEqual({ enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1 });
    const init = f.mock.calls[0]![1]!;
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'X-Plan-Admin': '1', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'p', schema: 's', etat: { liste: [] } });
  });

  it('retire par DELETE, avec l’en-tête admin', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => { expect(url).toBe('admin/claude/regles'); expect(init).toBeDefined(); return reponse(200, { brouillon: null }); });
    await creerClientRegles(f).retirer();
    expect(f.mock.calls[0]![1]).toMatchObject({ method: 'DELETE', headers: { 'X-Plan-Admin': '1' } });
  });

  it('dit la raison du serveur quand il refuse, et le réseau quand il est injoignable', async () => {
    await expect(creerClientRegles(async () => reponse(400, { error: { code: 'BAD_REQUEST', message: 'Prompt vide.' } })).enregistrer({ prompt: '', schema: '', etat: {} }))
      .rejects.toThrow('enregistrement du brouillon des règles : Prompt vide.');
    await expect(creerClientRegles(async () => reponse(403, { error: { code: 'FORBIDDEN', message: 'Réservé à l’administrateur.' } })).lire()).rejects.toThrow(/Réservé à l’administrateur/);
    await expect(creerClientRegles(async () => { throw new Error('hors ligne'); }).lire()).rejects.toThrow('hors ligne');
  });
});
