import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { creerClientAnalyse } from '../../../src/io/analyseClaude.js';
import { analyserVillage } from '../../../src/app/toits/candidatsPanoramax.js';
import { CLE, USAGE_P2, demarrerFauxAnthropic, messageReussi, reussi, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { RECHERCHE_PANORAMAX, SORTIE_DEUX_PANS, SORTIE_MANSART, VILLAGE, telechargementFige } from '../../fixtures/candidats/village.js';

// Les cas candidats Panoramax (lot G3 bis) par analyse.php, la route de production : l'usage
// `candidats`, le prompt et le schema de l'analyse, le journal, un village entier en batch et en appel
// immediat (API Anthropic simulee, recherche Panoramax et photos figees). Le choix des photos est
// eprouve sans serveur (tests/unit/app/toits/candidatsPanoramax.test.ts). Saute si PHP manque.

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

  it('en batch : trois passes par batiment, usage candidats, et A propose en Mansart a lucarnes', async () => {
    const urlsRecherche: string[] = [];
    const t = telechargementFige();
    const attentes: number[] = [];
    const r = await analyserVillage(VILLAGE, {
      village: 'test', client: creerClientAnalyse(navigateur, () => null), telecharger: t.telecharger,
      lireJson: async (url) => { urlsRecherche.push(url); return RECHERCHE_PANORAMAX; },
      attendre: async (ms) => { attentes.push(ms); faux.terminer(); }, maintenant: () => new Date('2026-10-14T09:00:00Z'),
    });
    expect(urlsRecherche).toHaveLength(1);
    expect(urlsRecherche[0]).toMatch(/^https:\/\/api\.panoramax\.xyz\/api\/search\?bbox=.*&limit=500$/);
    expect(t.urls).toEqual(['https://panoramax.ign.fr/api/pictures/pa/sd.jpg', 'https://panoramax.ign.fr/api/pictures/pb/sd.jpg']);
    expect(attentes).toEqual([60000]);
    const requetes = faux.batches[0]!.corps.requests;
    expect(requetes.map((q) => q.custom_id)).toEqual(['c0-p1', 'c0-p2', 'c0-p3', 'c1-p1', 'c1-p2', 'c1-p3']);
    // Le prompt et le schema de l'analyse d'une maison, et le batiment vise dit dans l'etiquette.
    expect((requetes[0]!.params.system as { text: string }[])[0]!.text).toMatch(/Vous observez une maison/);
    expect(JSON.stringify(requetes[0]!.params.messages)).toMatch(/Bâtiment visé : A\./);
    expect(requetes[0]!.params.model).toBe('claude-haiku-5-5');
    expect(r.bilan).toMatchObject({ batiments: 2, avecPhotos: 2, analyses: 2, echecs: 0, photos: 2, modele: 'claude-haiku-5-5' });
    expect(r.bilan.cout).toBeGreaterThan(0);
    expect([...r.analyses]).toEqual(['A', 'B']);
    expect(r.candidats).toHaveLength(1);
    expect(r.candidats[0]).toMatchObject({
      id: 'cand-BATIMENT0000000000000001', cle: 'A', cleabs: 'BATIMENT0000000000000001', statut: 'propose', visees: ['mansart', 'lucarnes'],
      observation: { forme: 'mansart', profil: 'brise', bouts: ['brisis', 'brisis'], lucarnes: { nombre: 3, types: ['jacobine'] } },
      source: { par: 'claude', usage: 'candidats', modele: 'claude-haiku-5-5', prompt: 9, schema: 5, le: '2026-10-14' },
      photos: [{ id: 'pa', url: 'https://panoramax.ign.fr/api/pictures/pa/hd.jpg', auteur: 'Contributeur de test', licence: 'CC-BY-SA-4.0' }],
    });
    expect(r.candidats[0]!.vote).toMatchObject({ passes: 3, forme: { valeur: 'mansart', accord: 1 }, contradictions: [] });
    // Le journal de l'analyse : une ligne par requete, sous l'usage des cas candidats, sans photo.
    const j = journal().filter((l) => l.requete);
    expect(j).toHaveLength(6);
    expect(j.every((l) => l.usage === 'candidats' && l.modele === 'claude-haiku-5-5' && l.batch === true)).toBe(true);
    expect(j[0]).toMatchObject({ idu: '78646000AE0153', audit: 'candidats-test', facades: 0 });
    expect(JSON.stringify(journal())).not.toMatch(/QUJDRA/);
  });

  it('en appel immediat : un appel de trois passes par batiment, et un batiment deja trie n est pas renvoye', async () => {
    faux.reponseMessage = (_c, n) => ({ statut: 200, corps: messageReussi(USAGE_P2, n < 3 ? SORTIE_MANSART : SORTIE_DEUX_PANS) });
    const r = await analyserVillage(VILLAGE, {
      village: 'test', client: creerClientAnalyse(navigateur, () => null), telecharger: telechargementFige().telecharger,
      lireJson: async () => RECHERCHE_PANORAMAX, immediat: true, ignorer: new Set(['B']),
    });
    expect(faux.messages).toHaveLength(3);
    expect(faux.batches).toHaveLength(0);
    expect(r.bilan).toMatchObject({ batiments: 1, analyses: 1 });
    expect(r.candidats.map((c) => c.cle)).toEqual(['A']);
    expect(journal().filter((l) => l.requete).every((l) => l.usage === 'candidats' && l.batch === false)).toBe(true);
  });

  it('compte en echec un batiment dont les passes echouent, et refuse un village sans origine', async () => {
    faux.reponseMessage = () => ({ statut: 529, corps: { type: 'error', error: { type: 'overloaded_error', message: 'Surcharge' } } });
    const o = { village: 'test', client: creerClientAnalyse(navigateur, () => null), telecharger: telechargementFige().telecharger, lireJson: async () => RECHERCHE_PANORAMAX, immediat: true };
    const r = await analyserVillage(VILLAGE, o);
    expect(r.bilan).toMatchObject({ analyses: 0, echecs: 2 });
    expect(r.candidats).toEqual([]);
    expect(r.analyses.size).toBe(0);
    await expect(analyserVillage({ ...VILLAGE, origine: null }, o)).rejects.toThrow(/origine/);
  });
});
