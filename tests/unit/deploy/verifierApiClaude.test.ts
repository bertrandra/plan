import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLE, SORTIE_ANALYSE, SORTIE_RENFORT, USAGE_P1, messageReussi, demarrerFauxAnthropic, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';

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
    faux.reponseMessage = (corps) => ({ statut: 200, corps: messageReussi(USAGE_P1, /relever une façade photographiée/.test(systeme(corps)) ? SORTIE_RENFORT : SORTIE_ANALYSE) });
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
    // Par defaut, le meme modele partout : l'analyse (qui couvre escalade, candidats et rejeu) et le renfort.
    expect(faux.messages).toHaveLength(2);
    expect(systeme(faux.messages[0] ?? {})).toMatch(/Vous observez une maison/);
    expect(systeme(faux.messages[1] ?? {})).toMatch(/relever une façade photographiée/);
    expect(r.stdout).toMatch(/analyse \(claude-haiku-5-5 ; couvre analyse, escalade, candidats, rejeu\) : accepté/);
    expect(r.stdout).toMatch(/renfort \(claude-haiku-5-5 ; couvre renfort\) : accepté/);
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

  it('echoue quand la reponse n est pas un objet JSON', async () => {
    faux.reponseMessage = () => ({ statut: 200, corps: { ...messageReussi(USAGE_P1, {}), content: [{ type: 'text', text: 'Je ne peux pas répondre.' }] } });
    const r = await lancer({ ANTHROPIC_API_KEY: CLE, VERIFIER_API_CLAUDE_URL_LOCALE: faux.url });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/sortie_illisible/);
  });
});
