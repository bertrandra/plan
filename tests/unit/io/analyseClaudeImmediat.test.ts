import { describe, it, expect, vi } from 'vitest';
import { creerClientAnalyse, EchecAnalyse, type DemandeAnalyse } from '../../../src/io/analyseClaude.js';

// L'appel immediat (le run d'une facade, lot F2) : `POST admin/claude/messages`, le jeton et l'en-tete
// d'ecriture comme l'envoi d'un batch, les resultats dans la reponse.

const reponse = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const DEMANDE: DemandeAnalyse = { projet: 'p1', idu: 'AE0101', adresse: null, audit: 'releve-1', usage: 'facade', requetes: [{ id: 'f0-p1', passe: 1, facades: 1, contenu: [{ type: 'text', text: 'x' }] }] };

describe('l appel immediat', () => {
  it('poste la demande et rend les resultats', async () => {
    const resultats = [{ id: 'f0-p1', statut: 'reussi', passe: 1, usage: 'facade', sortie: { confiance: 'forte' }, erreur: null }];
    const f = vi.fn(async (entree: string) => (entree === 'admin/claude/messages' ? reponse(200, { modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats }) : reponse(404, {})));
    const lu = await creerClientAnalyse(f, () => 'jeton-1').immediat(DEMANDE);
    expect(lu.resultats).toEqual(resultats);
    const [entree, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(entree).toBe('admin/claude/messages');
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer jeton-1', 'X-Plan-Admin': '1', 'Content-Type': 'application/json' } });
    expect(JSON.parse(init.body as string)).toEqual(DEMANDE);
  });

  it('dit le plafond comme pour un batch', async () => {
    const c = creerClientAnalyse(async () => reponse(429, { error: { message: 'Plafond atteint' } }), () => null);
    await expect(c.immediat(DEMANDE)).rejects.toSatisfy((e: unknown) => e instanceof EchecAnalyse && e.motif === 'plafond');
  });
});
