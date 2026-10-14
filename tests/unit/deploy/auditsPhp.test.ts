import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { demarrerContextePlateforme, type ContextePlateforme } from '../../fixtures/deploy/contextePlateforme.js';
import { jouerScenarioAudits } from '../../fixtures/deploy/scenarioAudits.js';

// Les audits de parcelle partages pour le corpus, cote PHP (deploy/analyse.php, `admin/audits` ;
// MD/spec-audit.md 15, lot L21) : le meme scenario que buildsg/analyseAdmin.mjs, derriere le role du
// .htaccess, contre une plateforme simulee. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');

let base = '';
let tmp: string;
let serveur: ChildProcess;
let plateforme: ContextePlateforme;
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

describe.skipIf(!php)('les audits partages, cote PHP', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auditsphp-'));
    fs.mkdirSync(path.join(tmp, 'sessions'));
    plateforme = await demarrerContextePlateforme();
    const config = path.join(tmp, 'config.php');
    fs.writeFileSync(config, '<?php return [\n  "motDePasse" => "secret-admin",\n  "dossierDemos" => ' + JSON.stringify(path.join(tmp, 'demos'))
      + ',\n  "anthropicCle" => "A-CHANGER",\n  "plateformeUrl" => ' + JSON.stringify(plateforme.url) + ',\n];\n');
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
  afterAll(async () => {
    serveur.kill();
    await plateforme.fermer();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('depose, liste, lit et retire comme analyseAdmin.mjs', async () => {
    await jouerScenarioAudits({ navigateur, connecter: async () => { expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null); }, dossier: path.join(tmp, 'demos') }, plateforme);
  });
});
