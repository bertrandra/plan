import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { CLE, COUT_P1, COUT_P2, demande, demarrerFauxAnthropic, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';

// analyse.php, l'analyse par Claude sans Node (deploy/analyse.php), contre une API Message Batches
// simulee : memes scenarios que buildsg/analyseAdmin.mjs, memes couts au centime pres. Lance par le
// serveur integre de PHP derriere le role du .htaccess ; saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const TARIFS = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/claude-tarifs.json'), 'utf8')) as { lignes: unknown[] };

let base = '';
let tmp: string;
let demos: string;
let config: string;
let serveur: ChildProcess;
let faux: FauxAnthropic;
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
const ecrire = (entree: string, methode: string, corps: unknown) => navigateur(entree, { method: methode, headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

function configurer(valeurs: Record<string, string>): void {
  const lignes = Object.entries(valeurs).map(([k, v]) => '  ' + JSON.stringify(k) + ' => ' + JSON.stringify(v) + ',');
  fs.writeFileSync(config, '<?php return [\n' + lignes.join('\n') + '\n];\n');
}

const journal = (): Record<string, unknown>[] => {
  const d = path.join(demos, 'claude');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
};

describe.skipIf(!php)('analyse.php', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'analysephp-'));
    demos = path.join(tmp, 'demos');
    config = path.join(tmp, 'config.php');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    faux = await demarrerFauxAnthropic(reponseParDefaut);
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
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(() => {
    cookie = '';
    configurer({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url });
    fs.rmSync(demos, { recursive: true, force: true });
    faux.batches.length = 0;
    faux.entetes.length = 0;
    faux.statutCreation = 200;
    // Le journal de PHP date chaque ligne a la fin du batch, a l'heure du serveur : la meme ici.
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  });

  it('n existe pas sans configuration, et exige la session et l en-tete', async () => {
    configurer({ motDePasse: 'A-CHANGER', dossierDemos: demos });
    expect((await navigateur('admin/claude/etat')).status).toBe(404);
    configurer({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url });
    expect((await navigateur('admin/claude/etat')).status).toBe(401);
    expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null);
    expect((await navigateur('admin/claude/batches', { method: 'POST', body: JSON.stringify(demande()) })).status).toBe(403);
    expect(await (await navigateur('admin/claude/etat')).json()).toMatchObject({ actif: true, prompt: 0, schema: 0, effort: 'low' });
    // La session admin d'admin.php continue de servir les demos.
    expect((await navigateur('admin/demos')).status).toBe(200);
  });

  it('sans cle, repond 503 et n appelle rien', async () => {
    configurer({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: 'A-CHANGER', anthropicUrl: faux.url });
    await connecterAdmin(navigateur, 'secret-admin');
    expect((await (await navigateur('admin/claude/etat')).json()).actif).toBe(false);
    expect((await ecrire('admin/claude/batches', 'POST', demande())).status).toBe(503);
    expect(faux.entetes).toHaveLength(0);
  });

  it('cree le batch, lit ses resultats, journalise une fois aux memes couts que Node', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    const cree = await ecrire('admin/claude/batches', 'POST', demande());
    expect(cree.status).toBe(201);
    expect((await cree.json()).batch).toMatchObject({ id: 'msgbatch_1', etat: 'in_progress' });
    const params = faux.batches[0]!.corps.requests[0]!.params;
    expect(params).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect((params.system as { text: string; cache_control: unknown }[])[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
    // Le schema repart tel quel, objets vides compris.
    const schema = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/schema-analyse.json'), 'utf8')).schema;
    expect((params.output_config as { format: { schema: unknown } }).format.schema).toEqual(schema);
    expect(params).not.toHaveProperty('temperature');

    expect((await navigateur('admin/claude/batches/msgbatch_1/resultats')).status).toBe(409);
    faux.terminer();
    const lu = await (await navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
    const p1 = lu.resultats.find((r: { id: string }) => r.id === 'p1');
    expect(p1).toMatchObject({ statut: 'reussi', passe: 1, cout: COUT_P1, sortie: { forme: { indices: [], valeur: 'deux-pans' } } });
    expect(lu.resultats.find((r: { id: string }) => r.id === 'p2').cout).toBe(COUT_P2);

    const lignes = journal();
    expect(lignes).toHaveLength(2);
    expect(lignes.find((l) => l.requete === 'p2')).toMatchObject({
      organisation: 'admin', projet: 'projet-1', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
      usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, idBatch: 'msgbatch_1', passe: 2, images: 1, cout: COUT_P2,
      tokens: { entree: 4000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 25000, sortie: 1500 }, statut: 'reussi', prompt: 0, schema: 0
    });
    expect((await navigateur('admin/claude/batches/msgbatch_1/resultats')).status).toBe(200);
    expect(journal()).toHaveLength(2);
    expect((await navigateur('admin/claude/batches/msgbatch_9')).status).toBe(404);
  });

  it('refuse au plafond en comptant les batches ouverts, et le journalise', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    const plafonds = { format: 'plan-claude-plafonds', defaut: { jour: 0.01, mois: 1 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.004 };
    const pose = await ecrire('admin/claude/plafonds', 'PUT', plafonds);
    expect(pose.status).toBe(200);
    expect(await (await navigateur('admin/claude/plafonds')).json()).toEqual(plafonds);
    expect((await ecrire('admin/claude/batches', 'POST', demande())).status).toBe(201);
    const refus = await ecrire('admin/claude/batches', 'POST', demande(['p1']));
    expect(refus.status).toBe(429);
    expect(journal()).toMatchObject([{ statut: 'plafond', cout: 0 }]);
    faux.terminer();
    expect((await ecrire('admin/claude/batches', 'POST', demande(['p1']))).status).toBe(201);
    expect(journal().filter((l) => l.statut === 'reussi')).toHaveLength(2);
  });

  it('pose les tarifs livres, refuse de reecrire le passe, et dit le refus d Anthropic', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    expect(await (await navigateur('admin/claude/tarifs')).json()).toEqual(TARIFS);
    const lignes = TARIFS.lignes as Record<string, unknown>[];
    expect((await ecrire('admin/claude/tarifs', 'PUT', { ...TARIFS, lignes: [{ ...lignes[0], sortie: 0.4 }, lignes[1]] })).status).toBe(409);
    expect((await ecrire('admin/claude/tarifs', 'PUT', { ...TARIFS, lignes: [...lignes, { ...lignes[0], depuis: '2099-01-01', sortie: 0.4 }] })).status).toBe(200);
    expect(fs.existsSync(path.join(demos, 'claude/tarifs.json.bak'))).toBe(true);
    faux.statutCreation = 400;
    const r = await ecrire('admin/claude/batches', 'POST', demande());
    expect(r.status).toBe(502);
    expect(journal()).toMatchObject([{ statut: 'echoue', erreur: 'http-400' }]);
    expect((await ecrire('admin/claude/batches', 'POST', { ...demande(), requetes: [{ id: 'p1', contenu: [{ type: 'document' }] }] })).status).toBe(400);
  });
});
