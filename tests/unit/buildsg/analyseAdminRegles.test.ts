import { describe, it, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerAnalyseAdmin, verifierBrouillonRegles, vueBrouillonRegles, verifierDemande, PLAFONDS_DEFAUT, type Plafonds } from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { CLE, demande, demarrerFauxAnthropic, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { JETON_ORGA, demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { BROUILLON, verifierBrouillonDesRegles } from '../../fixtures/deploy/scenarioRegles.js';
import { expect } from 'vitest';

// Le brouillon des regles (Admin › Regles) et l'essai, cote serveur Node : memes scenarios que analyse.php
// (tests/unit/deploy/analysePhp.test.ts), par tests/fixtures/deploy/scenarioRegles.ts.

const racine = path.resolve(__dirname, '../../..');
const deploy = path.join(racine, 'deploy');
const MDP = 'secret-admin';

describe('le brouillon des règles, calcul pur', () => {
  it('lit le prompt et le schéma, garde leurs versions, refuse ce que le serveur ne saurait pas envoyer', () => {
    const b = verifierBrouillonRegles(BROUILLON, '2026-10-16T10:00:00.000Z');
    expect(vueBrouillonRegles(b)).toEqual({ enregistreLe: '2026-10-16T10:00:00.000Z', prompt: 8, schema: 4 });
    expect(b).toMatchObject({ format: 'plan-regles-brouillon', versionPrompt: 8, versionSchema: 4, etat: BROUILLON.etat });
    expect(() => verifierBrouillonRegles(null, 'x')).toThrow(/illisible/);
    expect(() => verifierBrouillonRegles({ ...BROUILLON, prompt: 'sans en-tete' }, 'x')).toThrow(/en-tete/);
    expect(() => verifierBrouillonRegles({ ...BROUILLON, prompt: '---\nversion: 8\n---\n  \n' }, 'x')).toThrow(/vide/);
    expect(() => verifierBrouillonRegles({ ...BROUILLON, schema: '[]' }, 'x')).toThrow(/Schéma/);
    expect(() => verifierBrouillonRegles({ ...BROUILLON, etat: [] }, 'x')).toThrow(/état/);
    expect(vueBrouillonRegles(null)).toBeNull();
  });

  it('la demande nomme l’essai ou non, et rien d’autre', () => {
    const p = PLAFONDS_DEFAUT as Plafonds;
    expect(verifierDemande(demande(), p).essai).toBe(false);
    expect(verifierDemande({ ...demande(), essai: 'brouillon' }, p).essai).toBe(true);
    expect(verifierDemande({ ...demande(), essai: null }, p).essai).toBe(false);
    expect(() => verifierDemande({ ...demande(), essai: 'oui' }, p)).toThrow(/essai/);
  });
});

describe('le brouillon des règles, routes', () => {
  let dossier: string;
  let serveur: http.Server;
  let base: string;
  let cookie = '';
  let faux: FauxAnthropic;
  let plateforme: FauxPlateforme;

  const navigateur = (entree: string, init: RequestInit = {}): Promise<Response> => {
    const entetes = new Headers(init.headers);
    if (cookie) entetes.set('Cookie', cookie);
    return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
      const pose = r.headers.get('set-cookie');
      if (pose) cookie = pose.split(';')[0] ?? '';
      return r;
    });
  };
  const ecrire = (entree: string, methode: string, corps: unknown) => navigateur(entree, { method: methode, headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const journal = () => {
    const f = path.join(dossier, 'claude', 'journal-2026-10.jsonl');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];
  };

  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'regles-'));
    cookie = '';
    faux = await demarrerFauxAnthropic(reponseParDefaut);
    plateforme = await demarrerFauxePlateforme();
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
  });
  afterEach(async () => {
    await new Promise((ok) => serveur.close(ok));
    await faux.fermer();
    await plateforme.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('garde le brouillon pour l’administrateur seul, et ne le lit que sur une demande d’essai', async () => {
    await verifierBrouillonDesRegles({
      navigateur, ecrire, faux, journal,
      utilisateur: (entree, init = {}) => navigateur(entree, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: 'Bearer ' + JETON_ORGA } }),
      connecterAdmin: async () => { expect(await connecterAdmin(navigateur, MDP)).toBe(null); },
    });
  });
});
