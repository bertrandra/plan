import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerAnalyseAdmin, verifierMesureConformite, MESURES_CONFORMITE_MAX } from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin, enregistrerMesureConformite, lireMesuresConformiteServeur } from '../../../src/io/depotDemos.js';
import { lireMesuresConformite, MESURES_CONFORMITE_MAX as MAX_PAGE } from '../../../src/regles/conformite.js';
import { jouerScenarioConformite, mesureEssai } from '../../fixtures/deploy/scenarioConformite.js';

// Les mesures de conformite, cote Node (buildsg/analyseAdmin.mjs, `admin/conformite` ; lot G3) : le
// meme scenario que deploy/analyse.php (tests/unit/deploy/conformitePhp.test.ts).

const racine = path.resolve(__dirname, '../../..');
const MDP = 'secret-admin';
let dossier = '';
let base = '';
let cookie = '';
let serveur: http.Server;

function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}
const connecter = async () => { expect(await connecterAdmin(navigateur, MDP)).toBe(null); };

describe('les mesures de conformite, cote Node', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'conformite-'));
    cookie = '';
    const admin = creerAdminDemos({ dossier, motDePasse: MDP });
    const analyse = creerAnalyseAdmin({ dossier, actif: admin.actif, sessionValide: admin.sessionValide, cle: undefined, deploy: path.join(racine, 'deploy') });
    serveur = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      void (async () => {
        if (await analyse.traiter(req, res, url, {})) return;
        if (await admin.traiter(req, res, url, {})) return;
        res.writeHead(404); res.end('page');
      })();
    });
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port; ok(); }));
  });
  afterEach(async () => {
    await new Promise((ok) => serveur.close(ok));
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('lit et range comme analyse.php', async () => {
    await jouerScenarioConformite({ navigateur, connecter, dossier });
  });

  it('ne garde que les dernieres mesures', async () => {
    expect(MESURES_CONFORMITE_MAX).toBe(MAX_PAGE);
    await connecter();
    const f = (e: string, i?: RequestInit) => navigateur(e, i);
    const ancien = { format: 'plan-conformite', version: 1, mesures: Array.from({ length: MESURES_CONFORMITE_MAX }, (_, i) => ({ ...mesureEssai(new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString()), recuLe: 'x' })) };
    fs.mkdirSync(path.join(dossier, 'conformite'), { recursive: true });
    fs.writeFileSync(path.join(dossier, 'conformite', 'mesures.json'), JSON.stringify(ancien));
    await enregistrerMesureConformite(f, mesureEssai('2026-10-14T10:00:00Z'));
    const lu = lireMesuresConformite(await lireMesuresConformiteServeur(f));
    expect(lu).toHaveLength(MESURES_CONFORMITE_MAX);
    expect(lu?.at(-1)?.t).toBe('2026-10-14T10:00:00.000Z');
    expect(lu?.[0]?.t).toBe('2026-01-01T01:00:00.000Z');
    // L'ancien fichier est garde a cote : une ecriture ratee ne perd pas l'historique.
    expect(fs.existsSync(path.join(dossier, 'conformite', 'mesures.json.bak'))).toBe(true);
  });

  it('verifie la forme d une mesure', () => {
    const m = mesureEssai('2026-10-14T10:00:00Z');
    expect(verifierMesureConformite(m)).toBe(m);
    expect(() => verifierMesureConformite({ ...m, format: 'autre' })).toThrow('Ce n’est pas une mesure de conformité.');
    expect(() => verifierMesureConformite({ ...m, t: 'hier' })).toThrow('Date de la mesure invalide.');
    expect(() => verifierMesureConformite({ ...m, toits: { ...m.toits, conformes: '1' } })).toThrow('Résumé de la mesure invalide.');
    expect(() => verifierMesureConformite({ ...m, parRegion: null })).toThrow('Mesure de conformité incomplète.');
  });
});
