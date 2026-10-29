import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLE, SORTIE_ANALYSE, USAGE_P1, messageFacade, messageReussi, demarrerFauxAnthropic, reponseParDefaut, schemaFacade, texteSqueletteDuSchema, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';

// scripts/verifier-api-claude.mjs : la verification des requetes du serveur PHP contre l'API Claude,
// jouee ici contre le faux Anthropic (la vraie API demande une cle, absente des tests). Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(racine, 'scripts/verifier-api-claude.mjs');

interface Sortie { code: number | null; stdout: string; stderr: string }

function lancer(env: Record<string, string>, args: string[] = []): Promise<Sortie> {
  const base = { ...process.env };
  delete base.ANTHROPIC_API_KEY;
  delete base.VERIFIER_API_CLAUDE_URL_LOCALE;
  return new Promise((ok) => {
    const p = spawn('node', [SCRIPT, ...args], { env: { ...base, ...env, TMPDIR: tmp } });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (m: Buffer) => { stdout += m.toString(); });
    p.stderr.on('data', (m: Buffer) => { stderr += m.toString(); });
    p.on('close', (code) => ok({ code, stdout, stderr }));
  });
}

const systeme = (corps: Record<string, unknown>): string => {
  const s = corps.system;
  return Array.isArray(s) && typeof s[0]?.text === 'string' ? s[0].text : '';
};

let faux: FauxAnthropic;
let tmp: string;

describe.skipIf(!php)('scripts/verifier-api-claude.mjs', () => {
  beforeAll(async () => {
    faux = await demarrerFauxAnthropic(reponseParDefaut);
  });
  afterAll(async () => {
    await faux.fermer();
  });
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verifapi-'));
    faux.messages.length = 0;
    // Le run d'une facade comme l'API le rend : l'objet seul avec la sortie structuree, du texte autour sans elle.
    faux.reponseMessage = (corps) => (/lire \*\*une façade\*\*/.test(systeme(corps)) ? messageFacade(corps) : { statut: 200, corps: messageReussi(USAGE_P1, SORTIE_ANALYSE) });
    return () => fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('refuse de partir sans cle, et n accepte comme autre adresse que la boucle locale', async () => {
    const sans = await lancer({});
    expect(sans.code).toBe(2);
    expect(sans.stderr).toMatch(/ANTHROPIC_API_KEY est absente/);
    const ailleurs = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: 'https://exemple.test' });
    expect(ailleurs.code).toBe(2);
    expect(faux.messages).toHaveLength(0);
  });

  it('envoie une requete par prompt et modele, verifie la sortie, dit le cout, et ne laisse rien', async () => {
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    // Par defaut, le meme modele partout : l'analyse (qui couvre escalade, candidats et rejeu) et le run d'une facade.
    expect(faux.messages).toHaveLength(2);
    expect(systeme(faux.messages[0] ?? {})).toMatch(/Vous observez une maison/);
    expect(systeme(faux.messages[1] ?? {})).toMatch(/lire \*\*une façade\*\*/);
    expect(r.stdout).toMatch(/facade \(claude-haiku-5-5 ; couvre facade\) : accepté, sortie conforme \(\d+ champs ; 2 angle\(s\), 2 pointe\(s\), parement enduit, 2 ouverture\(s\) dont 1 aux carreaux lus ; sortie structurée\)/);
    expect(r.stdout).toMatch(/analyse \(claude-haiku-5-5 ; couvre analyse, escalade, candidats, rejeu\) : accepté/);
    expect(r.stdout).toMatch(/coût journalisé 0\.\d{5} \$/);
    expect(r.stdout + r.stderr).not.toContain(CLE);
    // Le dossier temporaire (et sa configuration, qui porte la cle) est supprime.
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('prend le modele demande, et refuse un modele que le serveur n admet pas', async () => {
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url }, ['--modele', 'claude-sonnet-5-5', '--plafond', '0.5']);
    expect(r.code).toBe(0);
    expect(faux.messages.map((m) => m.model)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5']);
    const non = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url }, ['--modele', 'claude-inconnu-1']);
    expect(non.code).toBe(2);
    expect(non.stderr).toMatch(/modèle non admis/);
  });

  it('s arrete au plafond que le serveur tient', async () => {
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url }, ['--modele', 'claude-sonnet-5-5']);
    expect(r.code).toBe(1);
    expect(faux.messages).toHaveLength(1);
    expect(r.stderr).toMatch(/HTTP 429 : Plafond/);
  });

  it('echoue au premier refus de l API, avec son message tel quel', async () => {
    faux.reponseMessage = () => ({ statut: 400, corps: { type: 'error', error: { type: 'invalid_request_error', message: 'The compiled grammar is too large' } } });
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url });
    expect(r.code).toBe(1);
    expect(faux.messages).toHaveLength(1);
    expect(r.stderr).toMatch(/Anthropic : invalid_request_error : The compiled grammar is too large/);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('echoue quand la reponse n est pas un objet JSON, et dit l arret, les tokens et le debut du texte', async () => {
    faux.reponseMessage = () => ({ statut: 200, corps: { ...messageReussi(USAGE_P1, {}), content: [{ type: 'text', text: 'Je ne peux pas répondre.' }] } });
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/arrêt « end_turn », tokens de sortie 1500, sortie structurée non demandée\.\nAnthropic : sortie_illisible : Sortie non JSON\.\nDébut du texte rendu \(24 caractères au plus 400\) :\nJe ne peux pas répondre\./);
    expect(r.stdout + r.stderr).not.toContain(CLE);
  });

  it('lit le run d une facade quand l API refuse la sortie structuree, sur le texte qu elle ecrit alors', async () => {
    faux.reponseMessage = (corps) => (/lire \*\*une façade\*\*/.test(systeme(corps)) ? messageFacade(corps, true) : { statut: 200, corps: messageReussi(USAGE_P1, SORTIE_ANALYSE) });
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    // L'analyse, puis le run d'une facade : refuse en sortie structuree, puis repris sans elle (le renfort est parti au lot F3).
    expect(faux.messages).toHaveLength(3);
    expect(r.stdout).toMatch(/facade \(claude-haiku-5-5 ; couvre facade\) : accepté, sortie conforme \(\d+ champs ; 2 angle\(s\), 2 pointe\(s\), parement enduit, 2 ouverture\(s\) dont 1 aux carreaux lus ; sortie structurée refusée par l’API \(« output_config\.format: The compiled grammar is too large »\), lue sans elle\)/);
    // Le repli montre l'exemple, jamais le schema en texte.
    expect(systeme(faux.messages[2] ?? {})).toMatch(/C’est un EXEMPLE/);
    expect(systeme(faux.messages[2] ?? {})).not.toContain('additionalProperties');
  });

  it('dit la reponse qui recopie le schema, valeurs logees dedans, et ne la prend pas pour une facade vide', async () => {
    const copie = texteSqueletteDuSchema(schemaFacade());
    faux.reponseMessage = (corps) => (/lire \*\*une façade\*\*/.test(systeme(corps))
      ? { statut: 200, corps: { ...messageReussi(USAGE_P1, {}), content: [{ type: 'text', text: copie }] } }
      : { statut: 200, corps: messageReussi(USAGE_P1, SORTIE_ANALYSE) });
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/facade \(claude-haiku-5-5 ; couvre facade\) : REFUSÉ/);
    expect(r.stderr).toMatch(/sortie structurée demandée\.\nAnthropic : sortie_illisible : Sortie hors du schéma\.\nDébut du texte rendu \(400 caractères au plus 400\) :\n\{"type":"object","additionalProperties":false/);
  });

  it('mesure x1 contre x3 sur un dossier prepare : une passe puis trois par facade, reponses et cout ecrits a cote', async () => {
    const dossier = path.join(tmp, 'mesure');
    fs.mkdirSync(dossier);
    fs.copyFileSync(path.join(racine, 'tests/fixtures/facades-ia/facade-test.jpg'), path.join(dossier, 'scene.png'));
    fs.writeFileSync(path.join(dossier, 'scene.texte.txt'), 'Façade : essai.');
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url }, ['--facades', dossier, '--plafond', '1']);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    // Les deux requetes de la verification (analyse, run d'une facade), puis une passe et trois pour la scene.
    expect(faux.messages).toHaveLength(2 + 4);
    const lu = JSON.parse(fs.readFileSync(path.join(dossier, 'scene.reponses.json'), 'utf8')) as { source: string; x1: { sorties: unknown[]; cout: number }; x3: { sorties: unknown[]; cout: number } };
    expect(lu.x1.sorties).toHaveLength(1);
    expect(lu.source).toBe('claude');
    expect([lu.x1.sorties.length, lu.x3.sorties.length]).toEqual([1, 3]);
    expect(lu.x3.cout).toBeGreaterThan(lu.x1.cout);
    expect(r.stdout).toMatch(/scene x3 : 3\/3 passe\(s\) lisible\(s\), sortie structurée 3\/3/);
    // La mesure fait la requete de production : sortie structuree, schema hors du prompt.
    expect(faux.messages.slice(3).every((m) => (m.output_config as { format?: { type: string } }).format?.type === 'json_schema' && !systeme(m).includes('additionalProperties'))).toBe(true);
    expect(lu).toMatchObject({ x1: { passes: 1, illisibles: 0, structurees: 1, refusFormat: null, echecs: [] }, x3: { passes: 3, illisibles: 0, structurees: 3 } });
    fs.rmSync(dossier, { recursive: true, force: true });
  });
});
