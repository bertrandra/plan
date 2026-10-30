import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { php as appelPhp } from '../../fixtures/deploy/appelPhp.js';
import { CLE, SORTIE_FACADE, TROUVE_FACADE, USAGE_P2, demande, demarrerFauxAnthropic, messageFacade, messageReussi, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { verifierEscalade } from '../../fixtures/deploy/scenarioEscalade.js';

// Le run d'une facade (lots F2 et F3) dans analyse.php, par ses routes : sa requete dans le batch de
// l'analyse (l'audit), l'appel immediat (la calibration, le releve), l'escalade. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const TARIFS = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/claude-tarifs.json'), 'utf8')) as { lignes: unknown[] };
const EXEMPLE = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/schema-facade.json'), 'utf8')).exemple as unknown;

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
const requeteFacade = (id: string, passe: number) => ({
  id, passe, usage: 'facade', facades: passe === 1 ? 1 : 0,
  contenu: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJDRA==' } }, { type: 'text', text: 'Façade : sud de Maison.' }]
});

describe.skipIf(!php)('analyse.php, le run d une facade', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'facadephp-'));
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
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_FACADE) });
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await connecterAdmin(navigateur, 'secret-admin');
  });

  it('dit les versions du run, et envoie son prompt et son schema dans le batch de l analyse (l audit, lot F3)', async () => {
    const etat = await (await navigateur('admin/claude/etat')).json();
    expect(etat).toMatchObject({ facade: { prompt: 5, schema: 4 } });
    expect(etat).not.toHaveProperty('renfort');
    const d = { ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteFacade('r1', 1)] };
    expect((await ecrire('admin/claude/batches', d)).status).toBe(201);
    const r1 = faux.batches[0]!.corps.requests[1]!;
    // Le batch n'a pas de sortie structuree : le prompt montre l'exemple de reponse, pas le schema (lot F2, prompt v2).
    expect((r1.params.system as { text: string }[])[0]!.text.endsWith('\n\n' + JSON.stringify(EXEMPLE))).toBe(true);
    expect((r1.params.output_config as { format?: unknown }).format).toBeUndefined();
    expect((r1.params.system as { text: string }[])[0]!.text).toMatch(/lire \*\*une façade\*\*/);
    faux.terminer();
    const lu = await (await navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
    expect(lu.resultats.map((r: { id: string; usage: string }) => [r.id, r.usage]).sort()).toEqual([['p1', 'analyse'], ['r1', 'facade']]);
    // Une requete d'un autre usage que le batch garde son modele et ses versions : la page les enregistre avec la reponse.
    const r = lu.resultats.find((x: { id: string }) => x.id === 'r1');
    expect(r).toMatchObject({ modele: 'claude-haiku-5-5', prompt: 5, schema: 4 });
    expect(lu.resultats.find((x: { id: string }) => x.id === 'p1')).not.toHaveProperty('prompt');
    expect(journal().find((l) => l.requete === 'r1')).toMatchObject({ usage: 'facade', modele: 'claude-haiku-5-5', batch: true, facades: 1, prompt: 5, schema: 4, trouve: null });
    expect(journal().find((l) => l.requete === 'p1')).toMatchObject({ usage: 'analyse' });
    // Le renfort (lot L18) n'est plus un usage : refuse dans le batch, et a l'appel immediat.
    expect((await ecrire('admin/claude/batches', { ...d, requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, { ...requeteFacade('r1', 1), usage: 'renfort' }] })).status).toBe(400);
    expect((await ecrire('admin/claude/messages', { ...demande([]), usage: 'renfort', requetes: [{ ...requeteFacade('r1', 1), usage: 'renfort' }] })).status).toBe(400);
  });

  it('fait l appel immediat au cout du tarif en vigueur, et le borne a trois requetes', async () => {
    const d = (n: number) => ({ ...demande([]), usage: 'facade', requetes: Array.from({ length: n }, (_, i) => requeteFacade('r' + (i + 1), (i % 3) + 1)) });
    const r = await ecrire('admin/claude/messages', d(3));
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(faux.messages).toHaveLength(3);
    const cout = appelPhp('coutAppel', appelPhp('tokensDeUsage', USAGE_P2), appelPhp('tarifEnVigueur', TARIFS, 'claude-haiku-5-5', new Date().toISOString().slice(0, 10)), false);
    expect(corps.resultats.map((x: { id: string; statut: string; cout: number }) => [x.id, x.statut, x.cout])).toEqual([['r1', 'reussi', cout], ['r2', 'reussi', cout], ['r3', 'reussi', cout]]);
    expect(corps.resultats[0].sortie).toMatchObject({ forme: { silhouette: 'plusieurs-sommets', bout: 'pignon' }, confiance: 'moyenne' });
    expect(journal()).toHaveLength(3);
    expect(journal()[0]).toMatchObject({ usage: 'facade', batch: false, requete: 'r1', facades: 1, cout, statut: 'reussi', trouve: TROUVE_FACADE });
    expect((await ecrire('admin/claude/messages', d(4))).status).toBe(400);
  });

  it('demande au run d une facade la sortie structuree, et repart une fois sans elle si l API la refuse', async () => {
    const d = { ...demande([]), usage: 'facade', requetes: [requeteFacade('f1', 1)] };
    faux.reponseMessage = (corps) => messageFacade(corps);
    let r = await (await ecrire('admin/claude/messages', d)).json();
    expect(faux.messages).toHaveLength(1);
    expect((faux.messages[0]?.output_config as { format?: { type: string } }).format?.type).toBe('json_schema');
    expect(r.resultats[0]).toMatchObject({ statut: 'reussi', structuree: true, refusFormat: null, erreur: null, sortie: SORTIE_FACADE });
    expect(journal().at(-1)).toMatchObject({ usage: 'facade', structuree: true, prompt: 5, schema: 4 });
    // Le schema part en sortie structuree, et plus dans le prompt.
    const systeme = (m: Record<string, unknown> | undefined) => (m?.system as { text: string }[])[0]!.text;
    expect(systeme(faux.messages[0])).not.toContain('additionalProperties');
    // Le schema refuse : la meme requete sans format, lue dans le texte tel qu'une reponse libre l'ecrit.
    faux.messages.length = 0;
    faux.reponseMessage = (corps) => messageFacade(corps, true);
    r = await (await ecrire('admin/claude/messages', d)).json();
    expect(faux.messages.map((m) => (m.output_config as { format?: unknown }).format === undefined)).toEqual([false, true]);
    expect(r.resultats[0]).toMatchObject({ statut: 'reussi', structuree: false, refusFormat: 'output_config.format: The compiled grammar is too large', erreur: null, sortie: SORTIE_FACADE });
    expect(journal().at(-1)).toMatchObject({ structuree: false, refusFormat: 'output_config.format: The compiled grammar is too large' });
    // Le repli montre l'exemple de reponse, pas le schema (que Haiku recopiait).
    expect(systeme(faux.messages[1])).toMatch(/C’est un EXEMPLE/);
    expect(systeme(faux.messages[1])).not.toContain('additionalProperties');
  });

  it('escalade une facade a la demande : UNE requete au modele de l usage escalade, avec le prompt, le schema et la sortie structuree du run', async () => {
    // Le modele de l'escalade est celui que l'administrateur regle (Reglages › Modeles) ; l'etat l'annonce avec ses prix du jour.
    const regle = await navigateur('admin/claude/modeles', { method: 'PUT', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'plan-claude-modeles', usages: { escalade: 'claude-sonnet-5-5' } }) });
    expect(regle.status).toBe(200);
    const etat = await (await navigateur('admin/claude/etat')).json();
    expect(etat.escaladeFacade).toEqual({ modele: 'claude-sonnet-5-5', prix: { entree: 2, sortie: 10 } });
    faux.reponseMessage = (corps) => messageFacade(corps);
    const r = await (await ecrire('admin/claude/messages', { ...demande([]), usage: 'escalade', requetes: [{ ...requeteFacade('escalade-p1', 1), facades: 0 }] })).json();
    expect(faux.messages).toHaveLength(1);
    const m = faux.messages[0]!;
    expect(m).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect((m.system as { text: string }[])[0]!.text).toMatch(/lire \*\*une façade\*\*/);
    expect((m.output_config as { format?: { type: string } }).format?.type).toBe('json_schema');
    expect(r).toMatchObject({ modele: 'claude-sonnet-5-5', prompt: 5, schema: 4 });
    expect(r.resultats.map((x: { id: string; usage: string; statut: string }) => [x.id, x.usage, x.statut])).toEqual([['escalade-p1', 'escalade', 'reussi']]);
    expect(r.resultats[0].sortie).toEqual(SORTIE_FACADE);
    // Elle se compte en escalade (le tableau de bord en dit la part), avec ce qu'elle a trouve comme un run de facade.
    expect(journal().at(-1)).toMatchObject({ usage: 'escalade', modele: 'claude-sonnet-5-5', batch: false, requete: 'escalade-p1', facades: 0, prompt: 5, schema: 4, structuree: true, trouve: TROUVE_FACADE });
    // Une maison escaladee sans modele impose prend aussi le modele de l'escalade (avant : celui de l'analyse).
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_FACADE) });
    faux.messages.length = 0;
    await ecrire('admin/claude/messages', { ...demande(['e1']), usage: 'escalade', requetes: (demande(['e1']) as { requetes: object[] }).requetes.map((q) => ({ ...q, usage: 'analyse', passe: 1, facades: 0 })) });
    expect(faux.messages[0]).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(journal().at(-1)).toMatchObject({ usage: 'escalade', modele: 'claude-sonnet-5-5' });
  });

  it('fait l escalade (D20) : usage escalade, prompt et schema de l analyse, modele demande', async () => {
    await verifierEscalade({ ecrire: (e, _m, c) => ecrire(e, c), faux, journal });
  });
});
