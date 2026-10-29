import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { php as appelPhp } from '../../fixtures/deploy/appelPhp.js';
import { CLE, SORTIE_FACADE, SORTIE_RENFORT, TROUVE_RENFORT, USAGE_P2, demande, demarrerFauxAnthropic, messageFacade, messageReussi, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { verifierEscalade } from '../../fixtures/deploy/scenarioEscalade.js';

// Le renfort de Claude (lot L18) dans analyse.php, par ses routes : la requete de
// renfort dans le batch, l'appel immediat, l'escalade. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const TARIFS = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/claude-tarifs.json'), 'utf8')) as { lignes: unknown[] };
const SCHEMA = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/schema-renfort.json'), 'utf8')).schema as unknown;

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
const ecrire = (entree: string, corps: unknown) => navigateur(entree, { method: 'POST', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const journal = (): Record<string, unknown>[] => {
  const d = path.join(demos, 'claude');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
};
const requeteRenfort = (id: string, passe: number) => ({
  id, passe, usage: 'renfort', facades: passe === 1 ? 1 : 0,
  contenu: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJDRA==' } }, { type: 'text', text: 'Largeur du mur : 9,00 m.' }]
});

describe.skipIf(!php)('analyse.php, le renfort', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'renfortphp-'));
    demos = path.join(tmp, 'demos');
    config = path.join(tmp, 'config.php');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    faux = await demarrerFauxAnthropic(reponseParDefaut);
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
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_RENFORT) });
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await connecterAdmin(navigateur, 'secret-admin');
  });

  it('dit les versions du renfort, et envoie son prompt et son schema dans le batch de l analyse', async () => {
    expect(await (await navigateur('admin/claude/etat')).json()).toMatchObject({ renfort: { prompt: 2, schema: 1 } });
    const d = { ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteRenfort('r1', 1)] };
    expect((await ecrire('admin/claude/batches', d)).status).toBe(201);
    const r1 = faux.batches[0]!.corps.requests[1]!;
    expect((r1.params.system as { text: string }[])[0]!.text.endsWith('\n\n' + JSON.stringify(SCHEMA))).toBe(true);
    expect((r1.params.system as { text: string }[])[0]!.text).toMatch(/relever une façade photographiée/);
    faux.terminer();
    const lu = await (await navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
    expect(lu.resultats.map((r: { id: string; usage: string }) => [r.id, r.usage]).sort()).toEqual([['p1', 'analyse'], ['r1', 'renfort']]);
    expect(journal().find((l) => l.requete === 'r1')).toMatchObject({ usage: 'renfort', modele: 'claude-haiku-5-5', batch: true, facades: 1, prompt: 2, schema: 1, trouve: null });
    expect(journal().find((l) => l.requete === 'p1')).toMatchObject({ usage: 'analyse' });
  });

  it('fait l appel immediat au cout du tarif en vigueur, et le borne a trois requetes', async () => {
    const d = (n: number) => ({ ...demande([]), usage: 'renfort', requetes: Array.from({ length: n }, (_, i) => requeteRenfort('r' + (i + 1), (i % 3) + 1)) });
    const r = await ecrire('admin/claude/messages', d(3));
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(faux.messages).toHaveLength(3);
    const cout = appelPhp('coutAppel', appelPhp('tokensDeUsage', USAGE_P2), appelPhp('tarifEnVigueur', TARIFS, 'claude-haiku-5-5', new Date().toISOString().slice(0, 10)), false);
    expect(corps.resultats.map((x: { id: string; statut: string; cout: number }) => [x.id, x.statut, x.cout])).toEqual([['r1', 'reussi', cout], ['r2', 'reussi', cout], ['r3', 'reussi', cout]]);
    expect(corps.resultats[0].sortie).toEqual(SORTIE_RENFORT);
    expect(journal()).toHaveLength(3);
    expect(journal()[0]).toMatchObject({ usage: 'renfort', batch: false, requete: 'r1', facades: 1, cout, statut: 'reussi', trouve: TROUVE_RENFORT });
    expect((await ecrire('admin/claude/messages', d(4))).status).toBe(400);
  });

  it('demande au run d une facade la sortie structuree, et repart une fois sans elle si l API la refuse', async () => {
    const requeteFacade = (id: string) => ({ id, passe: 1, usage: 'facade', facades: 1, contenu: requeteRenfort(id, 1).contenu });
    const d = { ...demande([]), usage: 'facade', requetes: [requeteFacade('f1')] };
    faux.reponseMessage = (corps) => messageFacade(corps);
    let r = await (await ecrire('admin/claude/messages', d)).json();
    expect(faux.messages).toHaveLength(1);
    expect((faux.messages[0]?.output_config as { format?: { type: string } }).format?.type).toBe('json_schema');
    expect(r.resultats[0]).toMatchObject({ statut: 'reussi', structuree: true, erreur: null, sortie: SORTIE_FACADE });
    expect(journal().at(-1)).toMatchObject({ usage: 'facade', structuree: true });
    // Le schema refuse : la meme requete sans format, lue dans le texte tel qu'une reponse libre l'ecrit.
    faux.messages.length = 0;
    faux.reponseMessage = (corps) => messageFacade(corps, true);
    r = await (await ecrire('admin/claude/messages', d)).json();
    expect(faux.messages.map((m) => (m.output_config as { format?: unknown }).format === undefined)).toEqual([false, true]);
    expect(r.resultats[0]).toMatchObject({ statut: 'reussi', structuree: false, erreur: null, sortie: SORTIE_FACADE });
    // Le renfort, lui, part sans : sa reponse se lit dans le texte, comme avant.
    faux.messages.length = 0;
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_RENFORT) });
    await ecrire('admin/claude/messages', { ...demande([]), usage: 'renfort', requetes: [requeteRenfort('r1', 1)] });
    expect((faux.messages[0]?.output_config as { format?: unknown }).format).toBeUndefined();
  });

  it('fait l escalade (D20) : usage escalade, prompt et schema de l analyse, modele demande', async () => {
    await verifierEscalade({ ecrire: (e, _m, c) => ecrire(e, c), faux, journal });
  });
});
