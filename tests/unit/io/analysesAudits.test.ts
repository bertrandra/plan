import { describe, it, expect, vi } from 'vitest';
import { creerClientAnalysesAudits, EchecAnalysesAudit } from '../../../src/io/analysesAudits.js';

// Le client des analyses gardees d'un audit (MD/spec-audit.md 15.5) : la session admin (cookie),
// en lecture seule ; les adresses relatives a la page, l'identifiant de la trace encode.

const reponse = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

describe('le client des analyses d un audit', () => {
  it('liste, lit une analyse, et donne l adresse d une image', async () => {
    const f = vi.fn(async (entree: string) => {
      if (entree === 'admin/audits/20261013-154200-0000abcd/analyses') return reponse(200, { analyses: [{ id: 't1', etat: 'termine' }, { pas: 'une analyse' }] });
      if (entree === 'admin/audits/20261013-154200-0000abcd/analyses/t1') return reponse(200, { audit: '20261013-154200-0000abcd', resume: { id: 't1' }, entrant: null, sortant: null });
      return reponse(404, { error: { code: 'NOT_FOUND', message: 'Aucune analyse « ' + entree + ' ».' } });
    });
    const c = creerClientAnalysesAudits(f);
    expect((await c.lister('20261013-154200-0000abcd')).map((x) => x.id)).toEqual(['t1']);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
    expect((await c.lire('20261013-154200-0000abcd', 't1')).resume.id).toBe('t1');
    expect(c.urlImage('20261013-154200-0000abcd', 'a'.repeat(64) + '.jpg')).toBe('admin/audits/20261013-154200-0000abcd/images/' + 'a'.repeat(64) + '.jpg');
    await expect(c.lire('20261013-154200-0000abcd', 'absente')).rejects.toThrow(new EchecAnalysesAudit('analyse « absente » : Aucune analyse « admin/audits/20261013-154200-0000abcd/analyses/absente ».', 404));
  });
});
