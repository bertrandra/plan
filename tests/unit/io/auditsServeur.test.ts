import { describe, it, expect, vi } from 'vitest';
import { creerClientAudits, EchecPartageAudit } from '../../../src/io/auditsServeur.js';
import type { FichierAuditParcelle } from '../../../src/model/fichierAuditParcelle.js';

// Le client des routes `admin/audits` (MD/spec-audit.md §15) : l'en-tete d'ecriture, le jeton de la
// plateforme quand il y en a un, le secret de retrait dans un en-tete, jamais dans l'adresse.

const FICHIER = { format: 'plan-audit-parcelle', version: 1 } as unknown as FichierAuditParcelle;
const reponse = (statut: number, corps: unknown) => new Response(corps === null ? null : JSON.stringify(corps), { status: statut });

describe('le client du partage des audits', () => {
  it('envoie le fichier avec le jeton, et rend l identifiant et le secret de retrait', async () => {
    const f = vi.fn(async () => reponse(201, { id: '20261013-090000-ab12cd', retrait: 'secret' }));
    const c = creerClientAudits(f, () => 'jeton-0123456789abcdef');
    expect(await c.envoyer(FICHIER)).toEqual({ id: '20261013-090000-ab12cd', retrait: 'secret' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('admin/audits');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Plan-Admin': '1', 'Content-Type': 'application/json', Authorization: 'Bearer jeton-0123456789abcdef' });
    expect(JSON.parse(String(init.body))).toEqual(FICHIER);
  });

  it('sans jeton, ne parle que par le cookie de la session admin', async () => {
    const f = vi.fn(async () => reponse(201, { id: 'x', retrait: 'y' }));
    await creerClientAudits(f, () => null).envoyer(FICHIER);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('retire par le secret, en en-tete ; un fichier deja absent compte comme retire', async () => {
    const f = vi.fn(async () => reponse(404, { error: { message: 'Aucun audit' } }));
    await creerClientAudits(f, () => null).retirer('20261013-090000-ab12cd', 'secret');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('admin/audits/20261013-090000-ab12cd');
    expect(init).toMatchObject({ method: 'DELETE', headers: { 'X-Plan-Retrait': 'secret', 'X-Plan-Admin': '1' } });
  });

  it('dit le refus du serveur, et le reseau absent', async () => {
    const refuse = creerClientAudits(async () => reponse(401, { error: { message: 'Mot de passe ou jeton de la plateforme requis.' } }), () => null);
    await expect(refuse.envoyer(FICHIER)).rejects.toThrow(new EchecPartageAudit('partage de l’audit : Mot de passe ou jeton de la plateforme requis.'));
    const horsLigne = creerClientAudits(async () => { throw new TypeError('Failed to fetch'); }, () => null);
    await expect(horsLigne.retirer('a', 'b')).rejects.toThrow('retrait de l’audit : Failed to fetch');
  });
});
