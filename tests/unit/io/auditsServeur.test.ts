import { describe, it, expect, vi } from 'vitest';
import { creerClientAudits, EchecPartageAudit, lireFicheAudit } from '../../../src/io/auditsServeur.js';
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

  it('marque le depot : corpus par defaut, sauvegarde a la demande, et accepte un texte deja ecrit', async () => {
    const f = vi.fn(async () => reponse(201, { id: 'x', retrait: 'y' }));
    const c = creerClientAudits(f, () => null);
    await c.envoyer(FICHIER);
    await c.envoyer('{"format":"plan-audit-parcelle"}', 'sauvegarde');
    const [, corpus] = f.mock.calls[0] as unknown as [string, RequestInit];
    const [, sauvegarde] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(corpus.headers).toMatchObject({ 'X-Plan-Depot': 'corpus' });
    expect(sauvegarde.headers).toMatchObject({ 'X-Plan-Depot': 'sauvegarde' });
    expect(sauvegarde.body).toBe('{"format":"plan-audit-parcelle"}');
  });

  it('remplace un depot sous le meme identifiant, par son secret ou par la session admin', async () => {
    const f = vi.fn(async () => reponse(200, { id: '20261013-090000-ab12cd', remplace: true }));
    const c = creerClientAudits(f, () => 'jeton-0123456789abcdef');
    expect(await c.remplacer('20261013-090000-ab12cd', 'secret', FICHIER)).toEqual({ id: '20261013-090000-ab12cd', retrait: 'secret' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('admin/audits/20261013-090000-ab12cd');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'X-Plan-Retrait': 'secret', 'X-Plan-Depot': 'sauvegarde', 'X-Plan-Admin': '1', Authorization: 'Bearer jeton-0123456789abcdef' } });
    await c.remplacer('a', '', FICHIER);
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('X-Plan-Retrait');
    // Retire entre-temps : l'echec porte le statut, la sauvegarde en fait un nouveau depot.
    const absent = creerClientAudits(async () => reponse(404, { error: { message: 'Aucun audit « a ».' } }), () => null);
    await expect(absent.remplacer('a', 's', FICHIER)).rejects.toMatchObject({ statut: 404, message: 'envoi de l’audit : Aucun audit « a ».' });
  });

  it('liste les audits recus, fiches anciennes comprises', async () => {
    const f = vi.fn(async () => reponse(200, { audits: [
      { id: 'b', recuLe: '2026-10-14T10:00:00Z', organisation: 'org', idu: '78650000AE0101', adresse: '2 allée des Limites', taille: 2048, marque: 'sauvegarde', photos: 12, phase: 'capture', debut: '2026-10-14T09:00:00.000Z' },
      { id: 'a', recuLe: '2026-10-13T10:00:00Z', organisation: 'admin', idu: '78650000AE0101', adresse: null, taille: 1024 },
      { id: 'abime' },
    ] }));
    const audits = await creerClientAudits(f, () => null).lister();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('admin/audits');
    expect(audits).toEqual([
      { id: 'b', recuLe: '2026-10-14T10:00:00Z', organisation: 'org', idu: '78650000AE0101', adresse: '2 allée des Limites', taille: 2048, marque: 'sauvegarde', photos: 12, phase: 'capture', debut: '2026-10-14T09:00:00.000Z' },
      { id: 'a', recuLe: '2026-10-13T10:00:00Z', organisation: 'admin', idu: '78650000AE0101', adresse: null, taille: 1024, marque: 'corpus', photos: null, phase: null, debut: null },
    ]);
    expect(lireFicheAudit(null)).toBeNull();
  });

  it('lit un audit tel qu il est arrive, a l octet pres', async () => {
    const texte = '{"format":"plan-audit-parcelle",  "version":1}';
    const f = vi.fn(async () => new Response(texte, { status: 200 }));
    expect(await creerClientAudits(f, () => null).lire('20261013-090000-ab12cd')).toBe(texte);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('admin/audits/20261013-090000-ab12cd');
  });

  it('dit les refus de la liste et de la lecture, sans session ou sans reseau', async () => {
    const sansSession = creerClientAudits(async () => reponse(401, { error: { message: 'Mot de passe requis.' } }), () => null);
    await expect(sansSession.lister()).rejects.toThrow(new EchecPartageAudit('liste des audits reçus : Mot de passe requis.'));
    await expect(sansSession.lire('x')).rejects.toMatchObject({ statut: 401, message: 'lecture de l’audit « x » : Mot de passe requis.' });
    const illisible = creerClientAudits(async () => reponse(200, { rien: true }), () => null);
    await expect(illisible.lister()).rejects.toThrow('liste des audits reçus : réponse illisible du serveur');
    const horsLigne = creerClientAudits(async () => { throw new TypeError('Failed to fetch'); }, () => null);
    await expect(horsLigne.lister()).rejects.toMatchObject({ statut: null, message: 'liste des audits reçus : Failed to fetch' });
  });
});
