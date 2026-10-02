import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerDepotDemos, connecterAdmin, sessionAdmin } from '../../../src/io/depotDemos.js';

// admin.php, l'admin des demos sans Node (deploy/admin.php), contre le depot de la page : memes
// scenarios que buildsg/demosAdmin.mjs. Lance par le serveur integre de PHP ; saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const PORT = 5390 + Math.floor(Math.random() * 100);
const base = 'http://127.0.0.1:' + PORT;
const PLAN = { meta: { name: 'Démo 1', schemaVersion: 3 }, objects: [{ key: 'parcelle', type: 'polygon' }], measures: [] };

let tmp: string;
let demos: string;
let config: string;
let serveur: ChildProcess;
let cookie = '';

function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}

function configurer(motDePasse: string): void {
  fs.writeFileSync(config, '<?php return ' + JSON.stringify({ motDePasse, dossierDemos: demos }).replace(/^\{/, '[').replace(/\}$/, ']').replace(/":/g, '" =>') + ';');
}

describe.skipIf(!php)('admin.php', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adminphp-'));
    demos = path.join(tmp, 'demos');
    config = path.join(tmp, 'config.php');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    configurer('secret-admin');
    serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + PORT, path.join(racine, 'tests/fixtures/deploy/routeur-admin.php')], {
      env: { ...process.env, ADMIN_PHP: path.join(racine, 'deploy/admin.php'), PLAN_ADMIN_CONFIG: config },
      stdio: 'ignore'
    });
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + '/'); return; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
    }
  });
  afterAll(() => {
    serveur.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(() => {
    cookie = '';
    configurer('secret-admin');
    fs.rmSync(demos, { recursive: true, force: true });
  });

  it('sans mot de passe configure, rien n existe', async () => {
    configurer('A-CHANGER');
    expect((await navigateur('admin/session')).status).toBe(404);
    expect(await sessionAdmin(navigateur)).toBe(null);
  });

  it('refuse sans session, sans en-tete, et un mauvais mot de passe', async () => {
    expect((await navigateur('admin/demos')).status).toBe(401);
    expect((await navigateur('admin/session', { method: 'POST', body: JSON.stringify({ motDePasse: 'secret-admin' }) })).status).toBe(403);
    expect(await connecterAdmin(navigateur, 'faux')).toBe('Mot de passe refusé.');
    expect(await sessionAdmin(navigateur)).toBe(false);
  });

  it('pose un cookie HttpOnly, SameSite=Strict, limite a admin/', async () => {
    const r = await fetch(base + '/admin/session', { method: 'POST', headers: { 'X-Plan-Admin': '1' }, body: JSON.stringify({ motDePasse: 'secret-admin' }) });
    const c = r.headers.get('set-cookie') || '';
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
    expect(c).toMatch(/path=\/admin\//i);
  });

  it('ouvre, enregistre avec .bak, cree, supprime sans effacer', async () => {
    fs.mkdirSync(demos, { recursive: true });
    fs.writeFileSync(path.join(demos, '1.json'), JSON.stringify(PLAN));
    expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null);
    expect(await sessionAdmin(navigateur)).toBe(true);
    const depot = creerDepotDemos(navigateur);
    expect(await depot.lister()).toMatchObject([{ id: '1', name: 'Démo 1' }]);
    const ouvert = await depot.ouvrir('1');
    expect(ouvert.meta).toMatchObject({ id: '1', name: 'Démo 1' });
    expect(ouvert.schemaVersion).toBe(3);
    await depot.enregistrer({ id: '1', name: 'Démo 1', objects: [...PLAN.objects, { key: 't' }] as never, measures: [] });
    const ecrit = JSON.parse(fs.readFileSync(path.join(demos, '1.json'), 'utf8'));
    expect(Object.keys(ecrit)).toEqual(['meta', 'objects', 'measures']);
    expect(ecrit.objects).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(demos, '1.json.bak'), 'utf8')).objects).toHaveLength(1);
    const cree = await depot.enregistrer({ name: 'Nouvelle', objects: PLAN.objects as never });
    expect(cree.id).toBe('2');
    await depot.supprimer('2');
    expect(fs.existsSync(path.join(demos, '2.json'))).toBe(false);
    expect(fs.readdirSync(demos).some((n) => n.startsWith('2.json.supprime-'))).toBe(true);
    await expect(depot.ouvrir('9')).rejects.toMatchObject({ reason: 'notfound' });
    expect((await navigateur('admin/demos/..%2Fconfig')).status).toBe(400);
  });

  it('sert la vitrine sans session : admin/vitrine/<id>, en lecture seule', async () => {
    fs.mkdirSync(demos, { recursive: true });
    fs.writeFileSync(path.join(demos, '1.json'), JSON.stringify(PLAN));
    const r = await fetch(base + '/admin/vitrine/1');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('cache-control')).toMatch(/public/);
    expect((await r.json()).meta.name).toBe('Démo 1');
    expect((await fetch(base + '/admin/vitrine/9')).status).toBe(404);
    expect((await fetch(base + '/admin/vitrine/..%2Fconfig')).status).toBe(400);
    expect((await fetch(base + '/admin/vitrine/1', { method: 'PUT', headers: { 'X-Plan-Admin': '1' }, body: '{}' })).status).toBe(405);
    expect((await fetch(base + '/admin/demos')).status).toBe(401);
  });

  it('bloque apres cinq essais faux, meme avec le bon ensuite', async () => {
    for (let i = 0; i < 5; i++) await connecterAdmin(navigateur, 'faux' + i);
    expect(await connecterAdmin(navigateur, 'secret-admin')).toMatch(/Trop d’essais/);
  });
});
