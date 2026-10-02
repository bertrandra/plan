import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerDepotDemos, connecterAdmin, sessionAdmin } from '../../../src/io/depotDemos.js';

// L'admin des demos (MD/spec-demos-admin.md), cote serveur et cote page, l'un contre l'autre : un
// vrai serveur HTTP sur un dossier temporaire, et le depot de la page qui lui parle.

const MDP = 'secret-admin';
const PLAN = { meta: { name: 'Démo 1', schemaVersion: 3 }, objects: [{ key: 'parcelle', type: 'polygon' }], measures: [] };

let dossier: string;
let serveur: http.Server;
let base: string;
let cookie: string;

/** Un fetch de navigateur minimal : la base du serveur, et le cookie qu'il a pose. */
function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  // La page appelle `admin/…`, relatif a son adresse : ici, a la racine du serveur.
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}

function demarrer(motDePasse: string | undefined): Promise<void> {
  const admin = creerAdminDemos({ dossier, motDePasse });
  serveur = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    void admin.traiter(req, res, url, {}).then((pris) => {
      if (!pris) { res.writeHead(404); res.end('page'); }
    });
  });
  return new Promise((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      base = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port;
      ok();
    });
  });
}

beforeEach(() => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
  cookie = '';
});
afterEach(async () => {
  await new Promise((ok) => serveur.close(ok));
  fs.rmSync(dossier, { recursive: true, force: true });
});

describe('admin des demos, serveur', () => {
  it('sans ADMIN_PASSWORD, rien n existe', async () => {
    await demarrer(undefined);
    expect((await navigateur('/admin/session')).status).toBe(404);
    expect(await sessionAdmin(navigateur)).toBe(null);
    // Le reste du site n'est pas concerne.
    expect(await (await navigateur('/')).text()).toBe('page');
  });

  it('refuse les fichiers sans session, et un mauvais mot de passe', async () => {
    await demarrer(MDP);
    expect((await navigateur('/admin/demos')).status).toBe(401);
    expect(await sessionAdmin(navigateur)).toBe(false);
    expect(await connecterAdmin(navigateur, 'faux')).toBe('Mot de passe refusé.');
    expect(cookie).toBe('');
  });

  it('bloque apres cinq essais faux, meme avec le bon ensuite', async () => {
    await demarrer(MDP);
    for (let i = 0; i < 5; i++) await connecterAdmin(navigateur, 'faux' + i);
    expect(await connecterAdmin(navigateur, MDP)).toMatch(/Trop d’essais/);
  });

  it('exige l en-tete X-Plan-Admin sur toute ecriture', async () => {
    await demarrer(MDP);
    const r = await navigateur('/admin/session', { method: 'POST', body: JSON.stringify({ motDePasse: MDP }) });
    expect(r.status).toBe(403);
  });

  it('refuse un identifiant qui sortirait du dossier', async () => {
    await demarrer(MDP);
    expect(await connecterAdmin(navigateur, MDP)).toBe(null);
    expect((await navigateur('/admin/demos/..%2Fsecret')).status).toBe(400);
  });

  it('pose un cookie HttpOnly, SameSite=Strict, limite a /admin/', async () => {
    await demarrer(MDP);
    const r = await fetch(base + '/admin/session', { method: 'POST', headers: { 'X-Plan-Admin': '1' }, body: JSON.stringify({ motDePasse: MDP }) });
    const c = r.headers.get('set-cookie') || '';
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\/admin\//);
  });
});

describe('admin des demos, la page contre le serveur', () => {
  it('ouvre, enregistre et garde la version precedente', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, '1.json'), JSON.stringify(PLAN));
    expect(await connecterAdmin(navigateur, MDP)).toBe(null);
    expect(await sessionAdmin(navigateur)).toBe(true);
    const depot = creerDepotDemos(navigateur);

    expect(await depot.lister()).toMatchObject([{ id: '1', name: 'Démo 1' }]);
    const ouvert = await depot.ouvrir('1');
    expect(ouvert.meta).toMatchObject({ id: '1', name: 'Démo 1' });
    expect(ouvert.objects).toHaveLength(1);
    expect(ouvert.schemaVersion).toBe(3);

    const objets = [{ key: 'parcelle', type: 'polygon' }, { key: 'terrasse', type: 'polygon' }];
    await depot.enregistrer({ id: '1', name: 'Démo 1', objects: objets as never, measures: [] });
    const ecrit = JSON.parse(fs.readFileSync(path.join(dossier, '1.json'), 'utf8'));
    // Le format de l'export : meta, objects, measures.
    expect(Object.keys(ecrit)).toEqual(['meta', 'objects', 'measures']);
    expect(ecrit.meta).toMatchObject({ id: '1', name: 'Démo 1' });
    expect(ecrit.objects).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(dossier, '1.json.bak'), 'utf8')).objects).toHaveLength(1);
  });

  it('cree une nouvelle demo au premier numero libre, et la supprime sans l effacer', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, '1.json'), JSON.stringify(PLAN));
    await connecterAdmin(navigateur, MDP);
    const depot = creerDepotDemos(navigateur);
    const cree = await depot.enregistrer({ name: 'Nouvelle', objects: PLAN.objects as never });
    expect(cree.id).toBe('2');
    await depot.supprimer('2');
    expect(fs.existsSync(path.join(dossier, '2.json'))).toBe(false);
    expect(fs.readdirSync(dossier).some((n) => n.startsWith('2.json.supprime-'))).toBe(true);
  });

  it('dit qu une demo absente est introuvable, et qu un fichier sans objets n est pas un plan', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, 'vide.json'), JSON.stringify({ meta: {} }));
    await connecterAdmin(navigateur, MDP);
    const depot = creerDepotDemos(navigateur);
    await expect(depot.ouvrir('9')).rejects.toMatchObject({ reason: 'notfound' });
    await expect(depot.ouvrir('vide')).rejects.toMatchObject({ reason: 'badjson' });
  });
});
