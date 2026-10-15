import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { demarrerContextePlateforme, type ContextePlateforme } from '../../fixtures/deploy/contextePlateforme.js';
import { CLE, demarrerFauxAnthropic, reussi, SORTIE_ANALYSE, USAGE_P2, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { jouerScenarioDonnees, poserAncienDossier } from '../../fixtures/deploy/scenarioDonnees.js';

// Le dossier des donnees cote PHP (deploy/donnees.php) : la disposition, la migration d'un ancien
// plan-demos/, le rangement des audits et les traces des rejeux, avec le meme scenario que Node
// (tests/unit/buildsg/donnees.test.ts). Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racineDepot = path.resolve(__dirname, '../../..');

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

/** Un `php -S` sur un port libre, rendu quand PHP dit l'avoir pris (voir auditsPhp.test.ts). */
async function lancerPhp(ini: string[], env: NodeJS.ProcessEnv): Promise<{ proc: ChildProcess; base: string }> {
  for (let essai = 0; essai < 5; essai++) {
    const port = await portLibre();
    const proc = spawn('php', [...ini, '-S', '127.0.0.1:' + port, path.join(racineDepot, 'tests/fixtures/deploy/routeur-admin.php')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let sortie = '';
    const pris = await new Promise<boolean>((ok) => {
      const fin = setTimeout(() => ok(false), 10000);
      proc.stderr?.on('data', (d: Buffer) => { sortie += d.toString(); if (sortie.includes('started')) { clearTimeout(fin); ok(true); } });
      proc.once('exit', () => { clearTimeout(fin); ok(false); });
    });
    if (pris) return { proc, base: 'http://127.0.0.1:' + port };
    proc.kill();
  }
  throw new Error('php -S ne demarre pas');
}

/** Un petit script PHP qui inclut donnees.php et rend en JSON ce qu'il calcule. */
function donneesPhp(code: string): unknown {
  const r = spawnSync('php', ['-r', 'require ' + JSON.stringify(path.join(racineDepot, 'deploy/donnees.php')) + '; echo json_encode(' + code + ', JSON_UNESCAPED_SLASHES);'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

describe.skipIf(!php)('les donnees, cote PHP', () => {
  let racine = '', sessions = '', base = '', cookie = '';
  let serveur: ChildProcess;
  let plateforme: ContextePlateforme;
  let faux: FauxAnthropic;

  beforeAll(async () => {
    racine = fs.mkdtempSync(path.join(os.tmpdir(), 'donneesphp-'));
    sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'donneesphp-sessions-'));
    plateforme = await demarrerContextePlateforme();
    faux = await demarrerFauxAnthropic((id) => reussi(id, USAGE_P2, SORTIE_ANALYSE));
    const config = path.join(racine, 'plan-admin-config.php');
    const lignes = Object.entries({ motDePasse: 'secret-admin', dossierDonnees: path.join(racine, 'data'), anthropicCle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url })
      .map(([k, v]) => '  ' + JSON.stringify(k) + ' => ' + JSON.stringify(v) + ',');
    fs.writeFileSync(config, '<?php return [\n' + lignes.join('\n') + '\n];\n');
    poserAncienDossier(racine);
    const lance = await lancerPhp(['-d', 'session.save_path=' + sessions], { ...process.env, ADMIN_PHP: path.join(racineDepot, 'deploy/admin.php'), ANALYSE_PHP: path.join(racineDepot, 'deploy/analyse.php'), PLAN_ADMIN_CONFIG: config });
    serveur = lance.proc;
    base = lance.base;
  });
  afterAll(async () => {
    serveur.kill();
    await plateforme.fermer();
    await faux.fermer();
    fs.rmSync(racine, { recursive: true, force: true });
    fs.rmSync(sessions, { recursive: true, force: true });
  });

  const sansSession = (entree: string, init: RequestInit = {}) => fetch(base + '/' + entree.replace(/^\//, ''), init);
  function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
    const entetes = new Headers(init.headers);
    if (cookie) entetes.set('Cookie', cookie);
    return sansSession(entree, { ...init, headers: entetes }).then((r) => {
      const pose = r.headers.get('set-cookie');
      if (pose) cookie = pose.split(';')[0] ?? '';
      return r;
    });
  }

  it('deplace plan-demos/ dans data/, range les audits, garde l entree et la sortie d un rejeu, et n ecrit rien ailleurs', async () => {
    await jouerScenarioDonnees({ navigateur, sansSession, connecter: async () => { expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null); }, racine, faux, ignorer: () => false });
  });

  it('choisit la disposition comme buildsg/donnees.mjs', () => {
    // L'ancien reglage seul garde l'ancienne disposition.
    expect(donneesPhp("dossiersDonnees(['dossierDemos' => '/h/plan-demos'], '/h/public_html', '/h/public_html', '/h/plan-admin-config.php')")).toEqual({
      disposition: 'ancienne', racine: '/h/plan-demos', demos: '/h/plan-demos', admin: '/h/plan-demos', palette: '/h/plan-demos/.palette.json',
      controleurs: '/h/plan-demos/.controleurs.json', echecs: '/h/plan-demos/.echecs.json', anciens: [] });
    // Sans reglage : data/ a cote de la racine web, meme quand Plan est dans un sous-dossier.
    expect(donneesPhp("dossiersDonnees(['motDePasse' => 'x'], '/h/public_html', '/h/public_html/plan', '/h/plan-admin-config.php')")).toMatchObject({
      disposition: 'data', racine: '/h/data', demos: '/h/data/demo', palette: '/h/data/admin/palette.json', anciens: ['/h/plan-demos', '/h/public_html/plan/demos'] });
    // Les deux : data/ l'emporte, et l'ancien dossier est le premier a migrer.
    expect(donneesPhp("dossiersDonnees(['dossierDonnees' => '/d/data/', 'dossierDemos' => '/d/vieux'], '', '/w', null)")).toMatchObject({ racine: '/d/data', anciens: ['/d/vieux', '/plan-demos', '/w/demos'] });
  });

  it('ne s ecrase pas : ce qui existe deja dans data/ reste, et l ancien aussi', () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'donneesphp-conflit-'));
    try {
      fs.mkdirSync(path.join(r, 'plan-demos'));
      fs.mkdirSync(path.join(r, 'data', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(r, 'plan-demos', '1.json'), 'ancien');
      fs.writeFileSync(path.join(r, 'plan-demos', '2.json'), 'deux');
      fs.writeFileSync(path.join(r, 'data', 'demo', '1.json'), 'livre');
      const m = donneesPhp("migrerDonnees(dossiersDonnees(['dossierDonnees' => " + JSON.stringify(path.join(r, 'data')) + "], '', " + JSON.stringify(path.join(r, 'public_html')) + ", " + JSON.stringify(path.join(r, 'plan-admin-config.php')) + "), '2026-10-15T10:00:00Z')") as Record<string, unknown>;
      expect(m).toEqual({ format: 'plan-migration-donnees', version: 1, le: '2026-10-15T10:00:00Z', depuis: path.join(r, 'plan-demos'), deplaces: ['2.json'], laisses: ['1.json'] });
      expect(fs.readFileSync(path.join(r, 'data', 'demo', '1.json'), 'utf8')).toBe('livre');
      expect(fs.readFileSync(path.join(r, 'plan-demos', '1.json'), 'utf8')).toBe('ancien');
      expect(fs.readFileSync(path.join(r, 'plan-demos', 'DEPLACE-VERS-DATA.txt'), 'utf8')).toContain('Restent ici');
      // Une fois : le second passage relit migration.json sans rien refaire.
      fs.writeFileSync(path.join(r, 'plan-demos', '3.json'), 'trois');
      donneesPhp("migrerDonnees(dossiersDonnees(['dossierDonnees' => " + JSON.stringify(path.join(r, 'data')) + "], '', '/x', null))");
      expect(fs.existsSync(path.join(r, 'plan-demos', '3.json'))).toBe(true);
    } finally {
      fs.rmSync(r, { recursive: true, force: true });
    }
  });
});
