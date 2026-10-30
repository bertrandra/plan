import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { php as appelPhp, constantePhp, phpObjets } from '../../fixtures/deploy/appelPhp.js';
import { CLE, USAGE_P2, demarrerFauxAnthropic, messageReussi, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';

// La redaction d'un texte du dossier de declaration (usage `texte`, lot L5) dans analyse.php, par ses routes : l'appel immediat sur
// les faits du projet en texte, la sortie structuree et son repli (l'exemple et la consigne de l'usage), le journal (jamais le texte),
// la trace (les faits envoyes). Les reponses du faux Anthropic sont SYNTHETIQUES. Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const SCHEMA_TEXTE = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/schema-texte.json'), 'utf8')) as { exemple: unknown; consigne: string };

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
const FAITS = '{\n  "terrain": { "adresse": "2 Allée des Limites 78110 Le Vésinet" },\n  "ouvrages": [ { "nom": "Pergola 1", "description": "une pergola en bois de 4,00 x 3,00 m" } ]\n}';
const requeteTexte = (piece = 'notice') => ({ id: 'texte-' + piece, passe: 1, facades: 0, contenu: [{ type: 'text', text: 'Pièce demandée : ' + piece + '.\n\nFaits du projet (JSON) :\n' + FAITS }] });
const demandeTexte = (piece = 'notice') => ({ projet: 'projet-1', idu: '78650000AE0101', adresse: null, audit: 'texte-' + piece, usage: 'texte', requetes: [requeteTexte(piece)] });
/** Une redaction SYNTHETIQUE (pas Claude). */
const SORTIE_TEXTE = { texte: 'Le projet consiste en la construction d’une pergola en bois de 4,00 x 3,00 m.', reserves: ['la couleur de la pergola'] };

describe.skipIf(!php)('analyse.php, la redaction d’un texte du dossier', () => {
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
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_TEXTE) });
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await connecterAdmin(navigateur, 'secret-admin');
  });

  it('dit les versions de la redaction, et envoie les faits en texte avec son prompt et la sortie structuree', async () => {
    const etat = await (await navigateur('admin/claude/etat')).json();
    expect(etat).toMatchObject({ texte: { prompt: 1, schema: 1 }, modelesParUsage: { texte: 'claude-haiku-5-5' } });
    expect(etat.usages).toContain('texte');
    const r = await ecrire('admin/claude/messages', demandeTexte());
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(faux.messages).toHaveLength(1);
    const m = faux.messages[0]!;
    expect(m).toMatchObject({ model: 'claude-haiku-5-5' });
    expect((m.messages as { content: object[] }[])[0]!.content).toEqual(requeteTexte().contenu);
    expect((m.system as { text: string }[])[0]!.text).toMatch(/rédiger une pièce écrite d'une déclaration préalable/);
    expect((m.output_config as { format?: { type: string } }).format?.type).toBe('json_schema');
    expect(corps).toMatchObject({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1 });
    expect(corps.resultats[0]).toMatchObject({ id: 'texte-notice', usage: 'texte', statut: 'reussi', structuree: true, sortie: SORTIE_TEXTE });
    // Le journal : l'usage, le cout et ce qui a ete rendu (un texte, une reserve), jamais le texte ni les faits.
    const l = journal().at(-1)!;
    expect(l).toMatchObject({ usage: 'texte', batch: false, requete: 'texte-notice', images: 0, prompt: 1, schema: 1, statut: 'reussi', trouve: { determines: 1, elements: 1, vide: false } });
    expect(typeof l.cout).toBe('number');
    expect(JSON.stringify(journal())).not.toContain('pergola en bois');
    expect(JSON.stringify(journal())).not.toContain('Allée des Limites');
  });

  it('garde les faits envoyes dans la trace (lot L0), et ce qui est revenu', async () => {
    const corps = await (await ecrire('admin/claude/messages', demandeTexte('description'))).json();
    expect(corps.trace).toMatch(/^\d{8}-\d{6}-/);
    const trouver = (d: string, nom: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? trouver(path.join(d, e.name), nom) : e.name === nom ? [path.join(d, e.name)] : []);
    const entrant = JSON.parse(fs.readFileSync(trouver(path.join(demos, 'claude'), 'entrant.json')[0]!, 'utf8'));
    expect(JSON.stringify(entrant.requetes[0].contenu)).toContain('Pièce demandée : description.');
    expect(JSON.stringify(entrant.requetes[0].contenu)).toContain('Pergola 1');
    expect(fs.readFileSync(trouver(path.join(demos, 'claude'), 'sortant.json')[0]!, 'utf8')).toContain('pergola en bois');
  });

  it('repart sans sortie structuree si l’API la refuse, avec l’exemple et la consigne de la redaction', async () => {
    faux.reponseMessage = (c) => ((c.output_config as { format?: unknown }).format
      ? { statut: 400, corps: { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format: schema is too complex' } } }
      : { statut: 200, corps: messageReussi(USAGE_P2, SORTIE_TEXTE) });
    const corps = await (await ecrire('admin/claude/messages', demandeTexte())).json();
    expect(faux.messages).toHaveLength(2);
    const systeme = (faux.messages[1]!.system as { text: string }[])[0]!.text;
    expect(systeme).toContain(SCHEMA_TEXTE.consigne);
    expect(systeme.endsWith('\n\n' + JSON.stringify(SCHEMA_TEXTE.exemple))).toBe(true);
    expect(corps.resultats[0]).toMatchObject({ structuree: false, refusFormat: 'output_config.format: schema is too complex', sortie: SORTIE_TEXTE });
  });

  it('refuse un PDF dans une redaction de texte', async () => {
    const pdf = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } };
    const r = await ecrire('admin/claude/messages', { ...demandeTexte(), requetes: [{ ...requeteTexte(), contenu: [pdf] }] });
    expect(r.status).toBe(400);
    expect(faux.messages).toHaveLength(0);
  });
});

describe.skipIf(!php)('analyse-fonctions.php, la redaction d’un texte fonction par fonction', () => {
  const P = constantePhp<Record<string, unknown>>('PLAFONDS_DEFAUT');
  it('verifierDemande admet l’usage texte, au modele rapide', () => {
    const d = appelPhp<{ usage: string; modele: string; requetes: { usage: string; images: number }[] }>('verifierDemande', demandeTexte(), P);
    expect(d).toMatchObject({ usage: 'texte', modele: 'claude-haiku-5-5' });
    expect(d.requetes[0]).toMatchObject({ usage: 'texte', images: 0 });
  });

  it('compte un texte rendu et ses reserves, et sert le prompt, le schema, l’exemple et la consigne de l’usage', () => {
    expect(appelPhp('comptesSortie', SORTIE_TEXTE, 'texte')).toMatchObject({ determines: 1, elements: 1, vide: false });
    expect(appelPhp('comptesSortie', { texte: '  ', reserves: [] }, 'texte')).toMatchObject({ determines: 0, vide: true });
    const [p, s] = phpObjets<[{ version: number; texte: string }, { version: number; exemple: unknown; consigne: string }]>('promptEtSchema', 'texte');
    expect(p.version).toBe(1);
    expect(s).toMatchObject({ version: 1, exemple: SCHEMA_TEXTE.exemple, consigne: SCHEMA_TEXTE.consigne });
    expect(constantePhp<string[]>('SORTIE_STRUCTUREE')).toContain('texte');
  });
});
