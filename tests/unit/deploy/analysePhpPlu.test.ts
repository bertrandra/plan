import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { php as appelPhp, constantePhp, phpObjets } from '../../fixtures/deploy/appelPhp.js';
import { CLE, USAGE_P2, demande, demarrerFauxAnthropic, messageReussi, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';

// La lecture du reglement du PLU (usage `plu`, lot L4) dans analyse.php, par ses routes : l'appel immediat avec un extrait PDF en
// bloc `document`, la sortie structuree et son repli (l'exemple et la consigne de l'usage), le texte brut rendu a la page et jamais
// au journal ; un PDF refuse ailleurs. Les reponses du faux Anthropic sont SYNTHETIQUES. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const SCHEMA_PLU = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/schema-plu.json'), 'utf8')) as { exemple: unknown; consigne: string };

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
const PDF = fs.readFileSync(path.join(racine, 'tests/fixtures/plu/chatou-ul-extrait.pdf')).toString('base64');
const blocPdf = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF } };
const requetePlu = (contenu: object[] = [blocPdf, { type: 'text', text: 'Zone demandée : ULp.' }]) => ({ id: 'plu', passe: 1, facades: 0, contenu });
const demandePlu = (contenu?: object[]) => ({ projet: 'projet-1', idu: '78146000AB0001', adresse: null, audit: 'plu-78146-ULp', usage: 'plu', requetes: [requetePlu(contenu)] });
/** Une lecture SYNTHETIQUE (pas Claude) : deux regles du secteur ULp de Chatou, citees. */
const SORTIE_PLU = { zone: { libelle: 'ULp', trouvee: 'oui' }, regles: [
  { grandeur: 'emprise-max', valeur: 30, unite: 'pourcent', termes: [], condition: 'secteur ULp', article: 'UL 9.2', citation: 'Dans le secteur ULp, l’emprise au sol ne doit pas excéder 30% de la superficie totale du terrain.', page: 48, confiance: 'forte' },
  { grandeur: 'hauteur-absolue-max', valeur: 10, unite: 'm', termes: [], condition: 'secteur ULp', article: 'UL 10.2', citation: 'La hauteur des constructions est limitée à 10 mètres.', page: 49, confiance: 'forte' },
], remarques: '' };

describe.skipIf(!php)('analyse.php, la lecture du PLU', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pluphp-'));
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
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_PLU) });
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await connecterAdmin(navigateur, 'secret-admin');
  });

  it('dit les versions de la lecture, et envoie l’extrait en document avec son prompt et la sortie structuree', async () => {
    const etat = await (await navigateur('admin/claude/etat')).json();
    expect(etat).toMatchObject({ plu: { prompt: 1, schema: 1 }, modelesParUsage: { plu: 'claude-haiku-5-5' } });
    const r = await ecrire('admin/claude/messages', demandePlu());
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(faux.messages).toHaveLength(1);
    const m = faux.messages[0]!;
    expect(m).toMatchObject({ model: 'claude-haiku-5-5' });
    expect((m.messages as { content: object[] }[])[0]!.content[0]).toEqual(blocPdf);
    expect((m.system as { text: string }[])[0]!.text).toMatch(/le règlement écrit d'un plan local d'urbanisme/);
    expect((m.output_config as { format?: { type: string } }).format?.type).toBe('json_schema');
    expect(corps).toMatchObject({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1 });
    expect(corps.resultats[0]).toMatchObject({ id: 'plu', usage: 'plu', statut: 'reussi', structuree: true, sortie: SORTIE_PLU, brut: JSON.stringify(SORTIE_PLU) });
    // Le journal : l'usage, le cout et ce qui a ete trouve (deux regles), jamais le texte de la reponse ni le PDF.
    const l = journal().at(-1)!;
    expect(l).toMatchObject({ usage: 'plu', batch: false, requete: 'plu', images: 0, prompt: 1, schema: 1, statut: 'reussi', trouve: { determines: 2, vide: false } });
    expect(typeof l.cout).toBe('number');
    expect(JSON.stringify(journal())).not.toContain('UL 9.2');
    expect(JSON.stringify(journal())).not.toContain(PDF.slice(0, 40));
  });

  it('repart sans sortie structuree si l’API la refuse, avec l’exemple et la consigne de la lecture du PLU', async () => {
    faux.reponseMessage = (c) => ((c.output_config as { format?: unknown }).format
      ? { statut: 400, corps: { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format: schema is too complex' } } }
      : { statut: 200, corps: messageReussi(USAGE_P2, SORTIE_PLU) });
    const corps = await (await ecrire('admin/claude/messages', demandePlu())).json();
    expect(faux.messages).toHaveLength(2);
    const systeme = (faux.messages[1]!.system as { text: string }[])[0]!.text;
    expect(systeme).toContain(SCHEMA_PLU.consigne);
    expect(systeme.endsWith('\n\n' + JSON.stringify(SCHEMA_PLU.exemple))).toBe(true);
    expect(systeme).not.toMatch(/pour une façade inventée/);
    expect(corps.resultats[0]).toMatchObject({ structuree: false, refusFormat: 'output_config.format: schema is too complex', sortie: SORTIE_PLU });
  });

  it('refuse un PDF hors de la lecture du PLU, deux PDF, ou un document qui n’est pas un PDF', async () => {
    const autre = { ...demande(['a1']), requetes: [{ id: 'a1', passe: 1, facades: 1, contenu: [blocPdf] }] };
    const r = await ecrire('admin/claude/messages', { ...autre, usage: 'facade' });
    expect(r.status).toBe(400);
    expect((await r.json()).error.message).toMatch(/texte ou image base64 seulement/);
    expect((await ecrire('admin/claude/batches', autre)).status).toBe(400);
    const deux = await ecrire('admin/claude/messages', demandePlu([blocPdf, blocPdf]));
    expect(deux.status).toBe(400);
    expect((await deux.json()).error.message).toMatch(/Un seul document PDF/);
    expect((await ecrire('admin/claude/messages', demandePlu([{ type: 'document', source: { type: 'base64', media_type: 'text/plain', data: 'QUJD' } }]))).status).toBe(400);
    expect(faux.messages).toHaveLength(0);
  });
});

describe.skipIf(!php)('analyse-fonctions.php, la lecture du PLU fonction par fonction', () => {
  const P = constantePhp<Record<string, unknown>>('PLAFONDS_DEFAUT');
  it('verifierDemande admet un PDF pour l’usage plu seulement, et le recopie tel quel', () => {
    const d = appelPhp<{ usage: string; modele: string; requetes: { usage: string; images: number; contenu: object[] }[] }>('verifierDemande', demandePlu(), P);
    expect(d).toMatchObject({ usage: 'plu', modele: 'claude-haiku-5-5' });
    expect(d.requetes[0]).toMatchObject({ usage: 'plu', images: 0 });
    expect(d.requetes[0]!.contenu[0]).toEqual(blocPdf);
    expect(() => appelPhp('verifierDemande', { ...demandePlu(), usage: 'analyse', requetes: [{ ...requetePlu(), usage: 'facade' }] }, P)).toThrow(/texte ou image base64 seulement/);
  });

  it('compte les regles relevees, et sert le prompt, le schema, l’exemple et la consigne de l’usage', () => {
    expect(appelPhp('comptesSortie', SORTIE_PLU, 'plu')).toMatchObject({ determines: 2, vide: false });
    expect(appelPhp('comptesSortie', { regles: [] }, 'plu')).toMatchObject({ determines: 0, vide: true });
    const [p, s] = phpObjets<[{ version: number; texte: string }, { version: number; exemple: unknown; consigne: string }]>('promptEtSchema', 'plu');
    expect(p.version).toBe(1);
    expect(s).toMatchObject({ version: 1, exemple: SCHEMA_PLU.exemple, consigne: SCHEMA_PLU.consigne });
    expect(appelPhp<string>('systemeDe', 'P', {}, { a: 1 }, false, 'Consigne.')).toBe('P\n\n# Forme de la réponse\n\nConsigne.\n\n{"a":1}');
  });
});
