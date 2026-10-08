import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { creerDepotDemos, connecterAdmin, sessionAdmin, deconnecterAdmin, lireControleurs, enregistrerControleurs, lirePalette, enregistrerPalette } from '../../../src/io/depotDemos.js';

// admin.php, l'admin des demos sans Node (deploy/admin.php), contre le depot de la page : memes
// scenarios que buildsg/demosAdmin.mjs. Lance par le serveur integre de PHP ; saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
// Le port est demande au systeme, libre a coup sur : un port tire au hasard (5390 a 5489) tombait
// parfois sur un service deja la, et le test parlait a ce service au lieu de php -S.
let base = '';
function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}
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
    const port = await portLibre();
    base = 'http://127.0.0.1:' + port;
    serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + port, path.join(racine, 'tests/fixtures/deploy/routeur-admin.php')], {
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

  it('sans mot de passe configure, rien n existe — sauf la vitrine, qui dit pourquoi', async () => {
    configurer('A-CHANGER');
    expect((await navigateur('admin/session')).status).toBe(404);
    expect(await sessionAdmin(navigateur)).toBe(null);
    // La vitrine ne lit pas sa demo, et le dit, de toute origine : l'<iframe> en bac a sable le voit.
    const v = await fetch(base + '/admin/vitrine/1');
    expect(v.status).toBe(404);
    expect((await v.json()).error.code).toBe('NOT_CONFIGURED');
    expect(v.headers.get('access-control-allow-origin')).toBe('*');
  });

  // Root lit tout, droits ou pas : ce cas ne s'eprouve qu'en utilisateur ordinaire (la CI l'est).
  it.skipIf(process.getuid?.() === 0)('dit qu une demo presente est illisible (droits du fichier)', async () => {
    fs.mkdirSync(demos, { recursive: true });
    const f = path.join(demos, '1.json');
    fs.writeFileSync(f, JSON.stringify(PLAN));
    fs.chmodSync(f, 0o000);
    try {
      const r = await fetch(base + '/admin/vitrine/1');
      expect(r.status).toBe(500);
      expect((await r.json()).error.code).toBe('UNREADABLE');
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      fs.chmodSync(f, 0o644);
    }
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

  it('enregistre et relit le registre des controleurs, hors de la liste des demos', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    expect(await lireControleurs(navigateur)).toBe(null);
    const registre = { format: 'plan-controleurs', version: 1, appVersion: '2.2.0', decouvertLe: '2026-10-02T08:00:00.000Z', arbre: { cle: 'plan', nom: 'Plan', genre: 'racine' } };
    await enregistrerControleurs(navigateur, registre);
    expect(await lireControleurs(navigateur)).toEqual(registre);
    expect(await creerDepotDemos(navigateur).lister()).toEqual([]);
    await expect(enregistrerControleurs(navigateur, { arbre: {} })).rejects.toMatchObject({ reason: 'server' });
  });

  it('se deconnecte : la session fermee, le mot de passe est redemande', async () => {
    expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null);
    expect(await sessionAdmin(navigateur)).toBe(true);
    expect(await deconnecterAdmin(navigateur)).toBe(true);
    expect(await sessionAdmin(navigateur)).toBe(false);
    expect((await navigateur('admin/demos')).status).toBe(401);
  });

  it('sert la vitrine sans session : admin/vitrine/<id>, en lecture seule', async () => {
    fs.mkdirSync(demos, { recursive: true });
    fs.writeFileSync(path.join(demos, '1.json'), JSON.stringify(PLAN));
    const r = await fetch(base + '/admin/vitrine/1');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('cache-control')).toMatch(/public/);
    // Lisible depuis un <iframe> en bac a sable (origine `null`) : celui de la plateforme.
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
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

  it('sert la palette sans session, et ne l ecrit qu avec la session', async () => {
    // Sans palette : 404, et la page garde ses couleurs d'origine.
    expect(await lirePalette(navigateur)).toBe(null);
    const palette = { format: 'plan-palette', version: 1, modifieLe: '2026-10-03T08:00:00.000Z', couleurs: { clair: { accent: '#336699' }, sombre: { accent: '#88AACC' } } };
    // Ecrire demande la session.
    await expect(enregistrerPalette(navigateur, palette)).rejects.toThrow(/session admin/);
    await connecterAdmin(navigateur, 'secret-admin');
    await enregistrerPalette(navigateur, palette);
    // La lire, non : une page sans cookie la recoit.
    const r = await fetch(base + '/admin/palette');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.json()).toEqual(palette);
    // Elle reste hors de la liste des demos, et un document qui n'est pas une palette est refuse.
    expect(await creerDepotDemos(navigateur).lister()).toEqual([]);
    await expect(enregistrerPalette(navigateur, { format: 'plan-palette', couleurs: { clair: { accent: 'rouge' } } })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerPalette(navigateur, { couleurs: {} })).rejects.toMatchObject({ reason: 'server' });
    expect(await lirePalette(navigateur)).toEqual(palette);
  });
});
