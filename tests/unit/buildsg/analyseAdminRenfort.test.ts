import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerAnalyseAdmin, coutAppel, lirePrompt, tarifEnVigueur, tokensDeUsage, verifierDemande, PLAFONDS_DEFAUT, REQUETES_IMMEDIATES, type Plafonds, type Tarifs } from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { CLE, SORTIE_RENFORT, TROUVE_RENFORT, USAGE_P2, demande, demarrerFauxAnthropic, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';

// Le renfort de Claude pour le calage et la detection (MD/spec-facades-calage-detection.md §12 bis,
// lot L18), cote serveur Node : son prompt et son schema, une requete de renfort dans le batch de
// l'analyse, et l'appel immediat du releve (`POST admin/claude/messages`).

const racine = path.resolve(__dirname, '../../..');
const deploy = path.join(racine, 'deploy');
const TARIFS = JSON.parse(fs.readFileSync(path.join(deploy, 'claude-tarifs.json'), 'utf8')) as Tarifs;
const SCHEMA = JSON.parse(fs.readFileSync(path.join(deploy, 'schema-renfort.json'), 'utf8')) as { version: number; schema: Record<string, unknown> };
const PROMPT = fs.readFileSync(path.join(deploy, 'prompt-renfort.md'), 'utf8');
const HAIKU = tarifEnVigueur(TARIFS, 'claude-haiku-5-5', '2026-10-14');

/** Une requete de renfort : la photo, l'elevation, le texte. */
const requeteRenfort = (id: string, passe: number) => ({
  id, passe, usage: 'renfort', facades: passe === 1 ? 1 : 0,
  contenu: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJDRA==' } },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJDRA==' } },
    { type: 'text', text: 'Largeur du mur : 9,00 m.' }
  ]
});

describe('le prompt et le schema du renfort', () => {
  it('sont versionnes, et le schema respecte les limites de la sortie structuree', () => {
    const p = lirePrompt(PROMPT);
    expect(p.version).toBe(2);
    expect(p.texte).toMatch(/^# Rôle/);
    expect(SCHEMA.version).toBe(1);
    const verifier = (n: unknown, ou: string): void => {
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties, ou).toBe(false);
        expect([...(o.required as string[])].sort(), ou).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const cle of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) expect(o[cle], ou + '.' + cle).toBeUndefined();
      for (const [k, v] of Object.entries(o)) verifier(v, ou + '.' + k);
    };
    verifier(SCHEMA.schema, 'schema');
  });

  it('definit dans le prompt chaque terme du schema', () => {
    const termes = new Set<string>();
    const lire = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.enum)) for (const t of o.enum as string[]) termes.add(t);
      for (const v of Object.values(o)) lire(v);
    };
    lire(SCHEMA.schema);
    for (const t of [...termes].filter((x) => !['indetermine', 'oui', 'non', 'faible', 'moyenne', 'forte'].includes(x))) expect(PROMPT, t).toContain('`' + t + '`');
  });

  it('donne a chaque requete son usage et son modele', () => {
    const p = PLAFONDS_DEFAUT as Plafonds;
    const d = verifierDemande({ ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteRenfort('r1', 1)] }, p);
    expect(d.requetes.map((r) => [r.id, r.usage, r.modele])).toEqual([['p1', 'analyse', 'claude-haiku-5-5'], ['r1', 'renfort', 'claude-haiku-5-5']]);
    expect(() => verifierDemande({ ...demande(['p1']), requetes: [{ ...requeteRenfort('r1', 1), usage: 'autre' }] }, p)).toThrow(/Usage inconnu/);
  });
});

// --- Les routes -------------------------------------------------------------------------------

const MDP = 'secret-admin';
let dossier: string;
let serveur: http.Server;
let base: string;
let cookie: string;
let faux: FauxAnthropic;
let plateforme: FauxPlateforme;

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
const journal = () => {
  const f = path.join(dossier, 'claude', 'journal-2026-10.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];
};

async function demarrer(): Promise<void> {
  const admin = creerAdminDemos({ dossier, motDePasse: MDP });
  const analyse = creerAnalyseAdmin({ dossier, actif: admin.actif, sessionValide: admin.sessionValide, cle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url, deploy, maintenant: () => Date.parse('2026-10-14T09:00:00Z') });
  serveur = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    void (async () => {
      if (await analyse.traiter(req, res, url, {})) return;
      if (await admin.traiter(req, res, url, {})) return;
      res.writeHead(404); res.end('page');
    })();
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port; ok(); }));
  await connecterAdmin(navigateur, MDP);
}

describe('le renfort, routes', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'renfort-'));
    cookie = '';
    faux = await demarrerFauxAnthropic(reponseParDefaut);
    plateforme = await demarrerFauxePlateforme();
    await demarrer();
  });
  afterEach(async () => {
    await new Promise((ok) => serveur.close(ok));
    await faux.fermer();
    await plateforme.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('dit les versions du renfort dans l etat', async () => {
    expect(await (await navigateur('admin/claude/etat')).json()).toMatchObject({ prompt: 3, schema: 1, renfort: { prompt: 2, schema: 1 } });
  });

  it('envoie une requete de renfort dans le batch de l analyse, avec son prompt et son schema, et la journalise sous son usage', async () => {
    const d = { ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteRenfort('r1', 1)] };
    expect((await ecrire('admin/claude/batches', d)).status).toBe(201);
    const [p1, r1] = faux.batches[0]!.corps.requests;
    expect((p1!.params.system as { text: string }[])[0]!.text).toContain('"required":["forme",');
    expect((r1!.params.system as { text: string }[])[0]!.text.endsWith('\n\n' + JSON.stringify(SCHEMA.schema))).toBe(true);
    expect((r1!.params.system as { text: string }[])[0]!.text).toMatch(/relever une façade photographiée/);
    faux.terminer();
    const lu = await (await navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
    expect(lu.resultats.map((r: { id: string; usage: string }) => [r.id, r.usage]).sort()).toEqual([['p1', 'analyse'], ['r1', 'renfort']]);
    expect(journal().find((l) => l.requete === 'r1')).toMatchObject({ usage: 'renfort', modele: 'claude-haiku-5-5', batch: true, facades: 1, prompt: 2, schema: 1, trouve: null });
  });

  it('fait l appel immediat en trois passes, au tarif normal, et le journalise', async () => {
    const d = { ...demande([]), usage: 'renfort', requetes: [1, 2, 3].map((p) => requeteRenfort('r' + p, p)) };
    const r = await ecrire('admin/claude/messages', d);
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(faux.messages).toHaveLength(3);
    expect(faux.messages[0]).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
    const cout = coutAppel(tokensDeUsage(USAGE_P2), HAIKU, false);
    expect(corps).toMatchObject({ modele: 'claude-haiku-5-5', prompt: 2, schema: 1 });
    expect(corps.resultats.map((x: { id: string; statut: string; passe: number; usage: string; cout: number }) => [x.id, x.statut, x.passe, x.usage, x.cout])).toEqual([['r1', 'reussi', 1, 'renfort', cout], ['r2', 'reussi', 2, 'renfort', cout], ['r3', 'reussi', 3, 'renfort', cout]]);
    expect(corps.resultats[0].sortie).toEqual(SORTIE_RENFORT);
    expect(journal()).toHaveLength(3);
    expect(journal()[0]).toMatchObject({ usage: 'renfort', batch: false, idBatch: null, requete: 'r1', facades: 1, cout, statut: 'reussi', trouve: TROUVE_RENFORT });
    expect(JSON.stringify(journal())).not.toMatch(/QUJDRA|derrière la haie/);
  });

  it('borne l appel immediat a trois requetes, dit une passe en erreur, et refuse au plafond', async () => {
    const d = (n: number) => ({ ...demande([]), usage: 'renfort', requetes: Array.from({ length: n }, (_, i) => requeteRenfort('r' + i, (i % 3) + 1)) });
    expect(REQUETES_IMMEDIATES).toBe(3);
    expect((await ecrire('admin/claude/messages', d(4))).status).toBe(400);
    faux.reponseMessage = (_c, n) => (n === 1 ? { statut: 529, corps: { type: 'error', error: { type: 'overloaded_error', message: 'Surcharge' } } } : { statut: 200, corps: { id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(SORTIE_RENFORT) }], usage: USAGE_P2 } });
    const lu = await (await ecrire('admin/claude/messages', d(2))).json();
    expect(lu.resultats.map((x: { statut: string }) => x.statut).sort()).toEqual(['echoue', 'reussi']);
    expect(lu.resultats.find((x: { statut: string }) => x.statut === 'echoue').erreur).toMatchObject({ type: 'overloaded_error' });
    expect((await navigateur('admin/claude/plafonds', { method: 'PUT', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...PLAFONDS_DEFAUT, defaut: { jour: 0.001, mois: 1 } }) })).status).toBe(200);
    const refus = await ecrire('admin/claude/messages', d(1));
    expect(refus.status).toBe(429);
    expect(journal().at(-1)).toMatchObject({ statut: 'plafond', batch: false, usage: 'renfort' });
    expect((await navigateur('admin/claude/messages')).status).toBe(405);
  });
});
