import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { CLE, USAGE_P2, demarrerFauxAnthropic, reponseParDefaut, reussi, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { JETON_ORGA, demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { compterCeQuiEstTrouve, reglerLesModeles, type Serveur } from '../../fixtures/deploy/scenariosModeles.js';

// Le modele de chaque usage (`admin/claude/modeles`) et les comptes de ce que les reponses
// contiennent, dans analyse.php : memes scenarios que le serveur Node
// (tests/unit/buildsg/analyseAdminModeles.test.ts). Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');

let base = '';
let tmp: string;
let demos: string;
let config: string;
let serveur: ChildProcess;
let faux: FauxAnthropic;
let plateforme: FauxPlateforme;
let cookie = '';
const sorties: Record<string, object> = {};

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
const ecrire = (entree: string, methode: string, corps: unknown) => navigateur(entree, { method: methode, headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const journal = (): Record<string, unknown>[] => {
  const d = path.join(demos, 'claude');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
};
const leServeur = (): Serveur => ({ navigateur, ecrire, journal, fichier: path.join(demos, 'claude', 'modeles.json'), faux, sorties });

describe.skipIf(!php)('analyse.php, le modele de chaque usage', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'modelesphp-'));
    demos = path.join(tmp, 'demos');
    config = path.join(tmp, 'config.php');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    faux = await demarrerFauxAnthropic((id) => (sorties[id] ? reussi(id, USAGE_P2, sorties[id]) : reponseParDefaut(id)));
    plateforme = await demarrerFauxePlateforme();
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
    await faux.fermer();
    await plateforme.fermer();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(() => {
    cookie = '';
    for (const k of Object.keys(sorties)) delete sorties[k];
    const lignes = Object.entries({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url }).map(([k, v]) => '  ' + JSON.stringify(k) + ' => ' + JSON.stringify(v) + ',');
    fs.writeFileSync(config, '<?php return [\n' + lignes.join('\n') + '\n];\n');
    fs.rmSync(demos, { recursive: true, force: true });
    faux.batches.length = 0;
    // Le journal de PHP date chaque ligne a la fin du batch, a l'heure du serveur : la meme ici.
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  });

  it('reste a l administrateur', async () => {
    expect((await navigateur('admin/claude/modeles')).status).toBe(401);
    expect((await navigateur('admin/claude/modeles', { headers: { Authorization: 'Bearer ' + JETON_ORGA } })).status).toBe(403);
    await connecterAdmin(navigateur, 'secret-admin');
    expect((await navigateur('admin/claude/modeles', { method: 'PUT', body: '{}' })).status).toBe(403);
  });

  it('lit le defaut, pose et remplace le reglage, refuse un modele hors de la liste', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    await reglerLesModeles(leServeur());
  });

  it('journalise ce que chaque reponse contient', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    await compterCeQuiEstTrouve(leServeur());
  });
});
