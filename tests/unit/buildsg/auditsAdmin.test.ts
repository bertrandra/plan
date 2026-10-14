import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerAnalyseAdmin, jetonPorteur, verifierAudit } from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { demarrerContextePlateforme, fichierAudit, type ContextePlateforme } from '../../fixtures/deploy/contextePlateforme.js';
import { jouerScenarioAudits } from '../../fixtures/deploy/scenarioAudits.js';

// Les audits de parcelle partages pour le corpus, cote Node (buildsg/analyseAdmin.mjs ; MD/spec-audit.md
// 15, lot L21) : deposes par la session admin ou le jeton de la plateforme, lus par l'administrateur,
// retires par leur secret. Le meme scenario que deploy/analyse.php (tests/unit/deploy/auditsPhp.test.ts).

const racine = path.resolve(__dirname, '../../..');
const MDP = 'secret-admin';
let dossier = '';
let base = '';
let cookie = '';
let serveur: http.Server;
let plateforme: ContextePlateforme;

function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}

describe('les audits partages, cote Node', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'audits-'));
    cookie = '';
    plateforme = await demarrerContextePlateforme();
    const admin = creerAdminDemos({ dossier, motDePasse: MDP });
    const analyse = creerAnalyseAdmin({ dossier, actif: admin.actif, sessionValide: admin.sessionValide, cle: undefined, plateformeUrl: plateforme.url, deploy: path.join(racine, 'deploy') });
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
    await plateforme.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('depose, liste, lit et retire comme analyse.php', async () => {
    await jouerScenarioAudits({ navigateur, connecter: async () => { expect(await connecterAdmin(navigateur, MDP)).toBe(null); }, dossier }, plateforme);
  });

  it('lit le jeton porteur, et verifie la forme d un audit', () => {
    expect(jetonPorteur('Bearer abcdefghijklmnop')).toBe('abcdefghijklmnop');
    expect(jetonPorteur('Bearer court')).toBe(null);
    expect(jetonPorteur(undefined)).toBe(null);
    expect(verifierAudit(fichierAudit())).toEqual({ idu: '78650000AE0101', adresse: '2 allée des Limites' });
    expect(verifierAudit(fichierAudit('48.900000,2.130000')).idu).toBe('48.900000,2.130000');
    expect(() => verifierAudit({ ...fichierAudit(), version: 2 })).toThrow('Version du fichier d’audit inconnue.');
    expect(() => verifierAudit({ ...fichierAudit(), parcelle: { idu: '../x' } })).toThrow('Parcelle du fichier d’audit invalide.');
  });
});
