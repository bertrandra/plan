import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerAnalyseAdmin, dossierRelatifAudit, nomSur } from '../../../buildsg/analyseAdmin.mjs';
import { dossiersDonnees, migrerDonnees } from '../../../buildsg/donnees.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { demarrerContextePlateforme, type ContextePlateforme } from '../../fixtures/deploy/contextePlateforme.js';
import { CLE, demarrerFauxAnthropic, reussi, SORTIE_ANALYSE, USAGE_P2, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { jouerScenarioDonnees, poserAncienDossier } from '../../fixtures/deploy/scenarioDonnees.js';

// Le dossier des donnees cote Node (buildsg/donnees.mjs), branche comme app.js le fait : le meme
// scenario que deploy/donnees.php (tests/unit/deploy/donneesPhp.test.ts).

const racineDepot = path.resolve(__dirname, '../../..');

describe('les donnees, cote Node', () => {
  let racine = '', base = '', cookie = '';
  let serveur: http.Server;
  let plateforme: ContextePlateforme;
  let faux: FauxAnthropic;

  beforeAll(async () => {
    racine = fs.mkdtempSync(path.join(os.tmpdir(), 'donnees-'));
    plateforme = await demarrerContextePlateforme();
    faux = await demarrerFauxAnthropic((id) => reussi(id, USAGE_P2, SORTIE_ANALYSE));
    poserAncienDossier(racine);
    // Comme app.js : DATA_DIR, et l'ancien dossier de l'application a migrer.
    const donnees = dossiersDonnees({ dossierDonnees: path.join(racine, 'data'), parent: racine, anciens: [path.join(racine, 'plan-demos')] });
    migrerDonnees(donnees);
    const admin = creerAdminDemos({ dossier: donnees.demos, palette: donnees.palette, controleurs: donnees.controleurs, motDePasse: 'secret-admin' });
    const analyse = creerAnalyseAdmin({ dossier: donnees.racine, donnees, actif: admin.actif, sessionValide: admin.sessionValide, cle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url, deploy: path.join(racineDepot, 'deploy') });
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
  afterAll(async () => {
    await new Promise((ok) => serveur.close(ok));
    await plateforme.fermer();
    await faux.fermer();
    fs.rmSync(racine, { recursive: true, force: true });
  });

  const sansSession = (entree: string, init: RequestInit = {}) => fetch(base + '/' + entree.replace(/^\//, ''), init);
  function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
    const entetes = new Headers(init.headers);
    if (cookie) entetes.set('Cookie', cookie);
    return sansSession(entree, { ...init, headers: entetes }).then((r) => {
      const pose = r.headers.get('set-cookie');
      if (pose) cookie = pose.split(';')[0] ?? '';
      return r;
    });
  }

  it('deplace plan-demos/ dans data/, range les audits, garde l entree et la sortie d un rejeu, et n ecrit rien ailleurs', async () => {
    await jouerScenarioDonnees({ navigateur, sansSession, connecter: async () => { expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null); }, racine, faux, ignorer: () => false });
  });

  it('choisit la disposition comme deploy/donnees.php', () => {
    expect(dossiersDonnees({ dossierDemos: '/h/plan-demos', parent: '/h' })).toEqual({
      disposition: 'ancienne', racine: '/h/plan-demos', demos: '/h/plan-demos', admin: '/h/plan-demos', palette: '/h/plan-demos/.palette.json',
      controleurs: '/h/plan-demos/.controleurs.json', echecs: '/h/plan-demos/.echecs.json', anciens: [] });
    expect(dossiersDonnees({ parent: '/h', anciens: ['/h/app/demos'] })).toMatchObject({ disposition: 'data', racine: '/h/data', demos: '/h/data/demo', palette: '/h/data/admin/palette.json', anciens: ['/h/app/demos'] });
    expect(dossiersDonnees({ dossierDonnees: '/d/data/', dossierDemos: '/d/vieux', parent: '/', anciens: ['/w/demos'] })).toMatchObject({ racine: '/d/data', anciens: ['/d/vieux', '/w/demos'] });
  });

  it('nomme les dossiers des audits comme analyse.php', () => {
    expect(nomSur('Le Vésinet', 'x', true)).toBe('le-vesinet');
    expect(nomSur('48.900000,2.130000', 'x')).toBe('48-900000-2-130000');
    expect(nomSur('  ', 'sans-commune', true)).toBe('sans-commune');
    expect(nomSur('Saint-Germain-en-Laye (78)', 'x', true)).toBe('saint-germain-en-laye-78');
    expect(dossierRelatifAudit({ id: '20261013-154200-0000abcd', nature: 'parcelle', idu: '78650000AE0101' })).toBe('parcelle/78650000AE0101/20261013-154200-0000abcd');
    expect(dossierRelatifAudit({ id: '20261013-154200-0000abcd', nature: 'promenade', commune: 'Île-de-Bréhat' })).toBe('promenade/ile-de-brehat/20261013-154200-0000abcd');
  });
});
