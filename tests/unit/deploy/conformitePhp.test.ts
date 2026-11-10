import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { jouerScenarioConformite } from '../../fixtures/deploy/scenarioConformite.js';

// Les mesures de conformite, cote PHP (deploy/analyse.php, `admin/conformite` ; lot G3),
// derriere le role du .htaccess. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');

let base = '';
let tmp: string;
let serveur: ChildProcess;
let cookie = '';

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}

describe.skipIf(!php)('les mesures de conformite, cote PHP', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conformitephp-'));
    fs.mkdirSync(path.join(tmp, 'sessions'));
    const config = path.join(tmp, 'config.php');
    fs.writeFileSync(config, '<?php return [\n  "motDePasse" => "secret-admin",\n  "dossierDemos" => ' + JSON.stringify(path.join(tmp, 'demos')) + ',\n  "anthropicCle" => "A-CHANGER",\n];\n');
    const port = await portLibre();
    base = 'http://127.0.0.1:' + port;
    serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + port, path.join(racine, 'tests/fixtures/deploy/routeur-admin.php')], {
      env: { ...process.env, ADMIN_PHP: path.join(racine, 'deploy/admin.php'), ANALYSE_PHP: path.join(racine, 'deploy/analyse.php'), PLAN_ADMIN_CONFIG: config },
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

  it('lit et range comme analyseAdmin.mjs', async () => {
    await jouerScenarioConformite({ navigateur, connecter: async () => { expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null); }, dossier: path.join(tmp, 'demos') });
  });
});
