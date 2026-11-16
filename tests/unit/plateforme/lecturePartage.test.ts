import { describe, it, expect } from 'vitest';
import { ouvrirLienPartage, EchecLecturePartage } from '../../../src/plateforme/lecturePartage.js';

// Ouvrir un lien de partage (ADR-073, lot 6) : l'operation publique du contrat, sans session ni en-tete de produit, le jeton dans le
// corps ; chaque refus se dit par sa raison, et aucun ne porte le jeton.

const JETON = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde';
const reponse = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

describe('la lecture d un lien de partage', () => {
  it('appelle openSharedProject par POST, le jeton dans le corps, sans jeton d acces, sans produit ni cookie', async () => {
    const appels: { url: string; init: RequestInit }[] = [];
    const lu = { project: { name: 'Terrasse', schema_version: 2, document: { objects: [] }, updated_at: '2026-11-16T10:00:00Z' }, shared_by: 'Ada', expires_at: '2026-12-16T10:00:00Z' };
    const r = await ouvrirLienPartage(JETON, async (url, init) => { appels.push({ url: String(url), init: init ?? {} }); return reponse(200, lu); });
    expect(r).toEqual(lu);
    expect(appels).toHaveLength(1);
    const { url, init } = appels[0]!;
    expect(url.endsWith('/api/v1/public/shares/open')).toBe(true);
    expect(url).not.toContain(JETON);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(JSON.parse(String(init.body))).toEqual({ token: JETON });
    const entetes = new Headers(init.headers);
    expect(entetes.has('Authorization')).toBe(false);
    expect(entetes.has('X-Product')).toBe(false);
    expect(entetes.has('X-Tenant')).toBe(false);
  });

  it('dit 404, 429, le reseau et une panne par leur raison, jamais avec le jeton', async () => {
    const raison = async (f: typeof fetch) => {
      try { await ouvrirLienPartage(JETON, f); return null; } catch (e) {
        expect(e).toBeInstanceOf(EchecLecturePartage);
        expect(String((e as Error).message)).not.toContain(JETON);
        return (e as EchecLecturePartage).raison;
      }
    };
    expect(await raison(async () => reponse(404, { error: { code: 'SHARE_NOT_FOUND' } }))).toBe('introuvable');
    expect(await raison(async () => reponse(429, {}))).toBe('tropDeTentatives');
    expect(await raison(async () => { throw new TypeError('Failed to fetch'); })).toBe('reseau');
    expect(await raison(async () => reponse(500, {}))).toBe('panne');
    expect(await raison(async () => new Response('<html>', { status: 200 }))).toBe('panne');
  });

  it('ne fait pas partir un jeton mal forme', async () => {
    let appele = false;
    await expect(ouvrirLienPartage('abc', async () => { appele = true; return reponse(200, {}); })).rejects.toMatchObject({ raison: 'introuvable' });
    expect(appele).toBe(false);
  });
});
