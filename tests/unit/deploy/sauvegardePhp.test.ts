import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin, ROUTE_SAUVEGARDE } from '../../../src/io/depotDemos.js';

// La sauvegarde des donnees cote PHP (deploy/admin.php, `GET admin/sauvegarde`) : une archive zip de
// tout le dossier des donnees, sous la session admin, sans rien de ce qui est hors de lui (la
// configuration, la cible d'un lien symbolique). L'archive est relue par ZipArchive. Saute si PHP
// ou son extension zip manque.

const php = spawnSync('php', ['-r', 'exit(class_exists("ZipArchive") ? 0 : 1);']).status === 0;
const racineDepot = path.resolve(__dirname, '../../..');

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

/** Ce que contient une archive : nom -> contenu (vide pour un dossier), lu par ZipArchive. */
function lireZip(fichier: string): Record<string, string> {
  const code = '$z = new ZipArchive(); if ($z->open($argv[1]) !== true) exit(2); $r = [];'
    + ' for ($i = 0; $i < $z->numFiles; $i++) { $n = $z->getNameIndex($i); $r[$n] = str_ends_with($n, "/") ? "" : base64_encode((string)$z->getFromIndex($i)); }'
    + ' echo json_encode($r, JSON_UNESCAPED_SLASHES);';
  const r = spawnSync('php', ['-r', code, fichier], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('archive illisible : ' + r.stderr);
  const brut = JSON.parse(r.stdout) as Record<string, string>;
  return Object.fromEntries(Object.entries(brut).map(([n, c]) => [n, Buffer.from(c, 'base64').toString('latin1')]));
}

describe.skipIf(!php)('la sauvegarde des donnees, cote PHP', () => {
  let tmp = '', data = '', base = '', cookie = '';
  let serveur: ChildProcess;

  function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
    const entetes = new Headers(init.headers);
    if (cookie) entetes.set('Cookie', cookie);
    return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
      const pose = r.headers.get('set-cookie');
      if (pose) cookie = pose.split(';')[0] ?? '';
      return r;
    });
  }

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauvegardephp-'));
    data = path.join(tmp, 'data');
    const publicHtml = path.join(tmp, 'public_html');
    fs.mkdirSync(publicHtml);
    fs.mkdirSync(path.join(tmp, 'sessions'));
    const config = path.join(tmp, 'plan-admin-config.php');
    fs.writeFileSync(config, '<?php return [\n  "motDePasse" => "secret-admin",\n  "dossierDonnees" => ' + JSON.stringify(data) + ',\n  "anthropicCle" => "sk-cle-secrete",\n];\n');
    // Un dossier des donnees comme sur le serveur : quelques rubriques, une image, un dossier vide.
    fs.mkdirSync(path.join(data, 'audits', 'a1', 'images'), { recursive: true });
    fs.mkdirSync(path.join(data, 'claude'), { recursive: true });
    fs.mkdirSync(path.join(data, 'admin'), { recursive: true });
    fs.mkdirSync(path.join(data, 'conformite'), { recursive: true });
    fs.writeFileSync(path.join(data, 'audits', 'a1.json'), '{"audit":1}');
    fs.writeFileSync(path.join(data, 'audits', 'a1', 'images', 'facade.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    fs.writeFileSync(path.join(data, 'claude', 'journal-2026-10.jsonl'), '{"l":1}\n');
    fs.writeFileSync(path.join(data, 'admin', 'palette.json'), '{"format":"plan-palette"}');
    // Hors du dossier : un secret, et un dossier. Des liens symboliques y menent ; ils ne se suivent pas.
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'NE PAS SAUVEGARDER');
    fs.mkdirSync(path.join(tmp, 'dehors'));
    fs.writeFileSync(path.join(tmp, 'dehors', 'autre.json'), '{"dehors":true}');
    fs.symlinkSync(path.join(tmp, 'secret.txt'), path.join(data, 'lien-secret.txt'));
    fs.symlinkSync(config, path.join(data, 'admin', 'lien-config.php'));
    fs.symlinkSync(path.join(tmp, 'dehors'), path.join(data, 'audits', 'dehors'));
    // La configuration posee par erreur dans le dossier des donnees ne part pas non plus.
    fs.writeFileSync(path.join(data, 'plan-admin-config.php'), '<?php return ["motDePasse" => "copie"];');

    for (let essai = 0; essai < 5 && !base; essai++) {
      const port = await portLibre();
      const proc = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + port, path.join(racineDepot, 'tests/fixtures/deploy/routeur-admin.php')], {
        cwd: publicHtml,
        env: { ...process.env, ADMIN_PHP: path.join(racineDepot, 'deploy/admin.php'), PLAN_ADMIN_CONFIG: config },
        stdio: ['ignore', 'ignore', 'pipe']
      });
      let sortie = '';
      const pris = await new Promise<boolean>((ok) => {
        const fin = setTimeout(() => ok(false), 10000);
        proc.stderr?.on('data', (d: Buffer) => { sortie += d.toString(); if (sortie.includes('started')) { clearTimeout(fin); ok(true); } });
        proc.once('exit', () => { clearTimeout(fin); ok(false); });
      });
      if (pris) { serveur = proc; base = 'http://127.0.0.1:' + port; } else proc.kill();
    }
    if (!base) throw new Error('php -S ne demarre pas');
  });
  afterAll(() => {
    serveur?.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('refuse sans session, et en ecriture', async () => {
    cookie = '';
    const r = await navigateur(ROUTE_SAUVEGARDE);
    expect(r.status).toBe(401);
    expect(r.headers.get('content-type')).toContain('application/json');
  });

  it('rend tout le dossier des donnees en zip, et rien d autre', async () => {
    expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null);
    expect((await navigateur(ROUTE_SAUVEGARDE, { method: 'POST', headers: { 'X-Plan-Admin': '1' } })).status).toBe(405);
    const r = await navigateur(ROUTE_SAUVEGARDE);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/zip');
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="plan-data-\d{4}-\d{2}-\d{2}-\d{4}\.zip"$/);
    expect(r.headers.get('x-plan-sauvegarde')).toMatch(/^fichiers=\d+; octets=\d+$/);
    const octets = Buffer.from(await r.arrayBuffer());
    expect(octets.subarray(0, 2).toString()).toBe('PK');
    const f = path.join(tmp, 'archive.zip');
    fs.writeFileSync(f, octets);
    const contenu = lireZip(f);
    const noms = Object.keys(contenu).sort();

    // L'arborescence du dossier, sous data/ : les fichiers deposes, et ce qu'admin.php y a cree.
    expect(contenu['data/audits/a1.json']).toBe('{"audit":1}');
    expect(contenu['data/claude/journal-2026-10.jsonl']).toBe('{"l":1}\n');
    expect(contenu['data/admin/palette.json']).toBe('{"format":"plan-palette"}');
    expect(Buffer.from(contenu['data/audits/a1/images/facade.jpg'] ?? '', 'latin1')).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(noms).toContain('data/conformite/');
    expect(noms).toContain('data/migration.json');
    // Ni lien symbolique, ni configuration, ni rien du dehors.
    expect(noms.filter((n) => /lien|dehors|admin-config/.test(n))).toEqual([]);
    expect(Object.values(contenu).some((c) => c.includes('NE PAS SAUVEGARDER') || c.includes('sk-cle-secrete') || c.includes('secret-admin'))).toBe(false);
    expect(noms.every((n) => n === 'sauvegarde.json' || n.startsWith('data/'))).toBe(true);

    // Le manifeste dit ce que l'archive contient.
    const m = JSON.parse(contenu['sauvegarde.json'] ?? '{}') as Record<string, unknown>;
    const fichiersDonnees = noms.filter((n) => n.startsWith('data/') && !n.endsWith('/'));
    expect(m).toMatchObject({ format: 'plan-sauvegarde', version: 1, disposition: 'data', racine: data, fichiers: fichiersDonnees.length, liensIgnores: 3 });
    expect(m.octets).toBe(fichiersDonnees.reduce((s, n) => s + fs.statSync(path.join(tmp, n)).size, 0));
    // Le fichier temporaire est efface, juste apres le dernier octet servi.
    const restants = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('plan-sauvegarde-'));
    for (let i = 0; i < 20 && restants().length; i++) await new Promise((ok) => setTimeout(ok, 50));
    expect(restants()).toEqual([]);
  });
});
