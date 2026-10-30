import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { CLE, SORTIE_FACADE, USAGE_P2, demande, demarrerFauxAnthropic, messageReussi, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { fichierAudit } from '../../fixtures/deploy/contextePlateforme.js';
import { dossierRange } from '../../fixtures/deploy/scenarioAudits.js';

// Le lot L0 (MD/spec-lecture-ia-elargie.md 4.8) par les routes d'analyse.php : toute requete laisse une trace (sans depot, ou dans
// le dossier de l'audit nomme), l'image une fois par empreinte ; le rejeu d'un run depuis son image gardee envoie les memes octets ;
// l'export « données d'analyse » relit toutes les traces et les propositions ; une image gardee se demande par son empreinte.
// Saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const IMAGE = 'QUJDRA==';
const SHA = crypto.createHash('sha256').update(Buffer.from(IMAGE, 'base64')).digest('hex');
const ECRITURE = { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' };

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
const ecrire = (entree: string, corps: unknown) => navigateur(entree, { method: 'POST', headers: ECRITURE, body: JSON.stringify(corps) });
const json = async (r: Response) => await r.json() as Record<string, unknown> & { trace: string };
const journal = (): Record<string, unknown>[] => {
  const d = path.join(demos, 'claude');
  return fs.readdirSync(d).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
};
const requeteFacade = (id: string, passe: number) => ({
  id, passe, usage: 'facade', facades: passe === 1 ? 1 : 0,
  contenu: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } }, { type: 'text', text: 'Façade : sud de Maison.' }]
});
const runFacade = (plus: Record<string, unknown> = {}) => ({ ...demande([]), usage: 'facade', requetes: [1, 2, 3].map((p) => requeteFacade('r' + p, p)), ...plus });
const sansDepot = (trace: string) => path.join(demos, 'claude', 'analyses', 'sans-depot', 'admin', trace.slice(0, 4) + '-' + trace.slice(4, 6));
const lire = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;

describe.skipIf(!php)('analyse.php, tout garder (lot L0)', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'donneesia-'));
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
  beforeEach(async () => {
    cookie = '';
    const lignes = Object.entries({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url }).map(([k, v]) => '  ' + JSON.stringify(k) + ' => ' + JSON.stringify(v) + ',');
    fs.writeFileSync(config, '<?php return [\n' + lignes.join('\n') + '\n];\n');
    fs.rmSync(demos, { recursive: true, force: true });
    faux.batches.length = 0;
    faux.messages.length = 0;
    faux.reponseMessage = () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_FACADE) });
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await connecterAdmin(navigateur, 'secret-admin');
  });

  it('garde chaque appel immediat sans depot : entree, sortie brute, empreintes ; trois passes et une escalade font une image', async () => {
    const r = await json(await ecrire('admin/claude/messages', runFacade()));
    expect(r.trace).toMatch(/^\d{8}-\d{6}-claude-haiku-5-5-[0-9a-f]{4}$/);
    expect((r.resultats as { empreintes: unknown }[])[0]?.empreintes).toEqual([{ sha256: SHA, octets: 4, type: 'image/jpeg' }]);
    const mois = sansDepot(r.trace);
    const dt = path.join(mois, r.trace);
    expect(fs.readdirSync(dt).filter((n) => n.endsWith('.json')).sort()).toEqual(['entrant.json', 'resume.json', 'sortant.json']);
    expect(lire(path.join(dt, 'resume.json'))).toMatchObject({ id: r.trace, audit: null, nature: 'immediat', etat: 'termine', idBatch: null, organisation: 'admin', idu: '78650000AE0101', requetes: 3 });
    const sortant = lire(path.join(dt, 'sortant.json')) as { resultats: { id: string; texte: string; reponse: string; empreintes: string[]; prompt: number }[] };
    const texte = JSON.stringify(SORTIE_FACADE);
    expect(sortant.resultats.map((x) => x.id)).toEqual(['r1', 'r2', 'r3']);
    expect(sortant.resultats[0]).toMatchObject({ texte, reponse: crypto.createHash('sha256').update(texte).digest('hex'), empreintes: [SHA], prompt: 4 });
    // Le journal ne garde que les empreintes, et la trace qui les porte.
    expect(journal().at(-1)).toMatchObject({ usage: 'facade', requete: 'r3', empreintes: [SHA], reponse: sortant.resultats[0]?.reponse, trace: r.trace });
    expect(JSON.stringify(journal())).not.toContain(IMAGE);
    // L'escalade de la meme facade : la meme image, gardee une fois pour le mois de l'organisation.
    const e = await json(await ecrire('admin/claude/messages', { ...demande([]), usage: 'escalade', requetes: [{ ...requeteFacade('escalade-p1', 1), facades: 0 }] }));
    expect(e.trace).not.toBe(r.trace);
    expect(fs.readdirSync(path.join(mois, 'images'))).toEqual([SHA + '.jpg']);
    expect(lire(path.join(mois, e.trace, 'resume.json'))).toMatchObject({ nature: 'immediat', usage: 'escalade' });
  });

  it('garde un batch sans depot sous l organisation, et rend les empreintes avec ses resultats', async () => {
    const c = await json(await ecrire('admin/claude/batches', { ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteFacade('b0-f2-p1', 1)] }));
    expect(c.depot).toBe(null);
    const dt = path.join(sansDepot(c.trace), c.trace);
    expect(lire(path.join(dt, 'resume.json'))).toMatchObject({ nature: 'analyse', etat: 'en_cours', idBatch: 'msgbatch_1' });
    faux.terminer();
    const lu = await json(await navigateur('admin/claude/batches/msgbatch_1/resultats'));
    expect((lu.resultats as { id: string; empreintes: unknown }[]).find((x) => x.id === 'b0-f2-p1')?.empreintes).toEqual([{ sha256: SHA, octets: 4, type: 'image/jpeg' }]);
    expect(lire(path.join(dt, 'resume.json'))).toMatchObject({ etat: 'termine' });
    expect((lire(path.join(dt, 'sortant.json')).resultats as unknown[])).toHaveLength(2);
    expect(journal().find((l) => l.requete === 'b0-f2-p1')).toMatchObject({ empreintes: [SHA], trace: c.trace });
  });

  it('range l appel d un audit nomme dans son dossier, rejoue un run depuis son image gardee, et exporte les donnees d analyse', async () => {
    const audit = { ...(fichierAudit() as Record<string, unknown>), propositions: [{ id: 'p1', objet: 'Façade sud de Maison', source: 'claude', avant: '4', apres: '6', confiance: 0.9, decision: 'refusee',
      reserve: null, cible: { type: 'facade', cle: 'b1', cote: 2 }, effet: { type: 'ouvertures' }, indices: [] }] };
    const depot = await json(await navigateur('admin/audits', { method: 'POST', headers: ECRITURE, body: JSON.stringify(audit) }));
    const id = depot.id as string;
    const r = await json(await ecrire('admin/claude/messages', runFacade({ depot: id })));
    const dir = dossierRange(demos, id);
    expect(fs.existsSync(path.join(dir, 'analyses', r.trace, 'sortant.json'))).toBe(true);
    expect(fs.readdirSync(path.join(dir, 'images'))).toEqual([SHA + '.jpg']);
    const liste = await json(await navigateur('admin/audits/' + id + '/analyses'));
    expect(liste.analyses).toEqual([expect.objectContaining({ id: r.trace, audit: id, nature: 'immediat', etat: 'termine' })]);

    // Le rejeu : la requete gardee repart octet pour octet, comptee en rejeu, et sa trace se range a cote.
    faux.messages.length = 0;
    expect((await ecrire('admin/claude/rejouer', { audit: id, trace: r.trace, requete: 'r9' })).status).toBe(404);
    const rj = await json(await ecrire('admin/claude/rejouer', { audit: id, trace: r.trace, requete: 'r2', passes: 1 }));
    expect(rj).toMatchObject({ source: r.trace, prompt: 4, schema: 4 });
    expect(faux.messages).toHaveLength(1);
    const envoye = (faux.messages[0]?.messages as { content: { type: string; source?: { data: string }; text?: string }[] }[])[0]?.content;
    expect(envoye?.[0]?.source?.data).toBe(IMAGE);
    expect(envoye?.[1]?.text).toBe('Façade : sud de Maison.');
    expect(journal().at(-1)).toMatchObject({ usage: 'rejeu', requete: 'rejeu-p1', empreintes: [SHA], trace: rj.trace });
    expect(lire(path.join(dir, 'analyses', rj.trace, 'resume.json'))).toMatchObject({ nature: 'rejeu-facade', audit: id });
    expect(fs.readdirSync(path.join(dir, 'images'))).toEqual([SHA + '.jpg']);
    // Une requete gardee sans depot se rejoue aussi ; une maison ne se rejoue pas ainsi.
    const libre = await json(await ecrire('admin/claude/messages', runFacade({ requetes: [requeteFacade('r1', 1)] })));
    expect((await ecrire('admin/claude/rejouer', { audit: null, trace: libre.trace, requete: 'r1', passes: 1 })).status).toBe(200);
    const maison = await json(await ecrire('admin/claude/batches', demande(['p1'])));
    expect((await ecrire('admin/claude/rejouer', { trace: maison.trace, requete: 'p1' })).status).toBe(400);

    // L'export de la periode : toutes les reponses revenues, de l'audit et sans depot, et la proposition avec sa decision.
    const jour = new Date().toISOString().slice(0, 10);
    const d = await json(await navigateur('admin/claude/donnees-analyse?du=' + jour + '&au=' + jour));
    expect(d).toMatchObject({ format: 'plan-donnees-analyse', version: 1, du: jour, au: jour });
    const requetes = d.requetes as Record<string, unknown>[];
    expect(requetes.filter((l) => l.audit === id).map((l) => [l.lot, l.usage, l.requete])).toEqual(expect.arrayContaining([['immediat', 'facade', 'r1'], ['rejeu-facade', 'rejeu', 'rejeu-p1']]));
    expect(requetes.filter((l) => l.audit === null && l.lot === 'immediat')).toHaveLength(1);
    expect(requetes.every((l) => !JSON.stringify(l).includes(IMAGE))).toBe(true);
    expect(requetes.find((l) => l.requete === 'rejeu-p1')).toMatchObject({ idu: '78650000AE0101', empreintes: [SHA], facade: null, texte: JSON.stringify(SORTIE_FACADE) });
    expect(d.propositions).toEqual([expect.objectContaining({ nature: 'proposition', audit: id, proposition: 'p1', decision: 'refusee', accordClaude: 'claude-seul', facade: 2 })]);
    const filtre = await json(await navigateur('admin/claude/donnees-analyse?du=' + jour + '&au=' + jour + '&usage=rejeu'));
    expect((filtre.requetes as unknown[]).length).toBe(2);

    // Les images se demandent une a une, par leur empreinte.
    const img = await navigateur('admin/claude/images/' + SHA + '.jpg?audit=' + id);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await img.arrayBuffer()).toString('base64')).toBe(IMAGE);
    expect((await navigateur('admin/claude/images/' + SHA + '.jpg')).status).toBe(200);
    expect((await navigateur('admin/claude/images/' + '0'.repeat(64) + '.jpg')).status).toBe(404);

    // Sans la session admin : ni export, ni image, ni rejeu.
    cookie = '';
    expect((await navigateur('admin/claude/donnees-analyse')).status).toBe(401);
    expect((await navigateur('admin/claude/images/' + SHA + '.jpg')).status).toBe(401);
    expect((await ecrire('admin/claude/rejouer', { audit: id, trace: r.trace, requete: 'r2' })).status).toBe(401);
  });
});
