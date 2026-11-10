import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { demarrerContextePlateforme, fichierAudit, JETON, type ContextePlateforme } from '../../fixtures/deploy/contextePlateforme.js';
import { dossierRange, jouerScenarioAudits } from '../../fixtures/deploy/scenarioAudits.js';

// Les audits de parcelle partages pour le corpus, cote PHP (deploy/analyse.php, `admin/audits` ;
// MD/spec-audit.md 15, lot L21), derriere le role du .htaccess, contre une plateforme simulee. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');

let base = '';
let tmp: string;
let serveur: ChildProcess;
let plateforme: ContextePlateforme;
let cookie = '';
let config = '';

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

/**
 * Un `php -S` sur un port libre, rendu quand PHP dit l'avoir pris. Le port choisi est relache avant
 * que PHP s'y attache : un autre serveur des tests lances en parallele peut le prendre entre-temps,
 * et PHP sort alors (« Failed to listen ») pendant qu'un autre repond a sa place. On attend donc son
 * « started », et on recommence sur un autre port s'il n'a pas pu s'y attacher.
 */
async function lancerPhp(ini: string[], env: NodeJS.ProcessEnv): Promise<{ proc: ChildProcess; base: string; journal: () => string }> {
  for (let essai = 0; essai < 5; essai++) {
    const port = await portLibre();
    const proc = spawn('php', [...ini, '-S', '127.0.0.1:' + port, path.join(racine, 'tests/fixtures/deploy/routeur-admin.php')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let sortie = '';
    const pris = await new Promise<boolean>((ok) => {
      const fin = setTimeout(() => ok(false), 10000);
      proc.stderr?.on('data', (d: Buffer) => {
        sortie += d.toString();
        if (sortie.includes('started')) { clearTimeout(fin); ok(true); }
      });
      proc.once('exit', () => { clearTimeout(fin); ok(false); });
    });
    if (pris) return { proc, base: 'http://127.0.0.1:' + port, journal: () => sortie };
    proc.kill();
  }
  throw new Error('php -S ne demarre pas');
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

const envPhp = (): NodeJS.ProcessEnv => ({ ...process.env, ADMIN_PHP: path.join(racine, 'deploy/admin.php'), ANALYSE_PHP: path.join(racine, 'deploy/analyse.php'), PLAN_ADMIN_CONFIG: config });

describe.skipIf(!php)('les audits partages, cote PHP', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auditsphp-'));
    fs.mkdirSync(path.join(tmp, 'sessions'));
    plateforme = await demarrerContextePlateforme();
    config = path.join(tmp, 'config.php');
    fs.writeFileSync(config, '<?php return [\n  "motDePasse" => "secret-admin",\n  "dossierDemos" => ' + JSON.stringify(path.join(tmp, 'demos'))
      + ',\n  "anthropicCle" => "A-CHANGER",\n  "plateformeUrl" => ' + JSON.stringify(plateforme.url) + ',\n];\n');
    const lance = await lancerPhp(['-d', 'session.save_path=' + path.join(tmp, 'sessions')], envPhp());
    serveur = lance.proc;
    base = lance.base;
  });
  afterAll(async () => {
    serveur.kill();
    await plateforme.fermer();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('depose, liste, lit et retire comme analyseAdmin.mjs', async () => {
    await jouerScenarioAudits({ navigateur, connecter: async () => { expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null); }, dossier: path.join(tmp, 'demos') }, plateforme);
  });

  it('lit un audit plus gros que post_max_size : PHP ne coupe pas un corps JSON', async () => {
    // Un hebergement a 8 Mo par defaut, un audit de 20 Mo : il doit passer. Ici, un plafond de 2 Ko.
    const petit = await lancerPhp(['-d', 'post_max_size=2K', '-d', 'display_errors=0', '-d', 'session.save_path=' + path.join(tmp, 'sessions')], envPhp());
    try {
      const gros = JSON.stringify({ ...(fichierAudit() as Record<string, unknown>), bourrage: 'x'.repeat(4096) });
      // Ce que PHP a ecrit accompagne un echec : c'est lui qui dit pourquoi il a coupe.
      const r = await fetch(petit.base + '/admin/audits', { method: 'POST', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json', 'X-Plan-Depot': 'sauvegarde', Authorization: 'Bearer ' + JETON }, body: gros })
        .catch((e: unknown) => { throw new Error(String(e) + ' ; php : ' + petit.journal(), { cause: e }); });
      expect(r.status, petit.journal()).toBe(201);
      const { id } = await r.json() as { id: string };
      expect(fs.readFileSync(path.join(dossierRange(path.join(tmp, 'demos'), id), 'audit.json'), 'utf8')).toBe(gros);
    } finally {
      petit.proc.kill();
    }
  });
});
