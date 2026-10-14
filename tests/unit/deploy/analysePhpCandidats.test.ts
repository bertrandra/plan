import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { creerClientAnalyse } from '../../../src/io/analyseClaude.js';
import { analyserVillage } from '../../../src/app/candidatsPanoramax.js';
import { CLE, USAGE_P2, demarrerFauxAnthropic, messageReussi, reussi, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { RECHERCHE_PANORAMAX, SORTIE_DEUX_PANS, SORTIE_MANSART, VILLAGE, telechargementFige } from '../../fixtures/candidats/village.js';

// Les cas candidats Panoramax (lot G3 bis) par analyse.php, la route de production : l'usage
// `candidats`, le prompt et le schema de l'analyse, le journal. Memes attentes que le serveur Node
// (tests/unit/app/candidatsPanoramax.test.ts). Saute si PHP manque.

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
const journal = (): Record<string, unknown>[] => {
  const d = path.join(demos, 'claude');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
};
describe.skipIf(!php)('analyse.php, les cas candidats', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'candidatsphp-'));
    demos = path.join(tmp, 'demos');
    config = path.join(tmp, 'config.php');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    faux = await demarrerFauxAnthropic((id) => reussi(id, USAGE_P2, id.startsWith('c0-') ? SORTIE_MANSART : SORTIE_DEUX_PANS));
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
  beforeEach(async () => {
    cookie = '';
    const lignes = Object.entries({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url }).map(([k, v]) => '  ' + JSON.stringify(k) + ' => ' + JSON.stringify(v) + ',');
    fs.writeFileSync(config, '<?php return [\n' + lignes.join('\n') + '\n];\n');
    fs.rmSync(demos, { recursive: true, force: true });
    faux.batches.length = 0;
    faux.messages.length = 0;
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await connecterAdmin(navigateur, 'secret-admin');
  });

  it('analyse le village en batch sous l usage candidats, et propose A en Mansart a lucarnes', async () => {
    const r = await analyserVillage(VILLAGE, {
      village: 'test', client: creerClientAnalyse(navigateur, () => null), telecharger: telechargementFige().telecharger,
      lireJson: async () => RECHERCHE_PANORAMAX, attendre: async () => { faux.terminer(); },
    });
    const requetes = faux.batches[0]!.corps.requests;
    expect(requetes).toHaveLength(6);
    expect((requetes[0]!.params.system as { text: string }[])[0]!.text).toMatch(/Vous observez une maison/);
    expect(requetes[0]!.params.model).toBe('claude-haiku-5-5');
    expect(r.bilan).toMatchObject({ analyses: 2, echecs: 0, modele: 'claude-haiku-5-5' });
    expect(r.bilan.cout).toBeGreaterThan(0);
    expect(r.candidats.map((c) => [c.cle, c.visees, c.observation.forme])).toEqual([['A', ['mansart', 'lucarnes'], 'mansart']]);
    const j = journal().filter((l) => l.requete);
    expect(j).toHaveLength(6);
    expect(j.every((l) => l.usage === 'candidats' && l.modele === 'claude-haiku-5-5' && l.batch === true)).toBe(true);
  });

  it('fait l appel immediat sous l usage candidats', async () => {
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_MANSART) });
    const r = await analyserVillage(VILLAGE, {
      village: 'test', client: creerClientAnalyse(navigateur, () => null), telecharger: telechargementFige().telecharger,
      lireJson: async () => RECHERCHE_PANORAMAX, immediat: true, maxBatiments: 1,
    });
    expect(faux.messages).toHaveLength(3);
    expect(r.bilan).toMatchObject({ analyses: 1 });
    expect(r.candidats.map((c) => c.cle)).toEqual(['A']);
    expect(journal().filter((l) => l.requete).every((l) => l.usage === 'candidats' && l.batch === false)).toBe(true);
  });
});
