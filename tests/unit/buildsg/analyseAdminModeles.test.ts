import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import {
  creerAnalyseAdmin, comptesSortie, filtrerConsommation, modelesParUsage, trouvailles, verifierDemande, verifierModeles,
  MODELE_PAR_USAGE, PLAFONDS_DEFAUT, type Plafonds
} from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import {
  CLE, SORTIE_ANALYSE, SORTIE_RENFORT, SORTIE_VIDE, TROUVE_ANALYSE, TROUVE_RENFORT, TROUVE_VIDE, USAGE_P2, demande, demarrerFauxAnthropic, reponseParDefaut, reussi,
  type FauxAnthropic
} from '../../fixtures/deploy/fauxAnthropic.js';
import { JETON_ORGA, demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { FIN, RAPIDE, compterCeQuiEstTrouve, reglerLesModeles, requeteRenfort, type Serveur } from '../../fixtures/deploy/scenariosModeles.js';

// Le modele de chaque usage, regle par l'administrateur (`admin/claude/modeles`), et les comptes de
// ce que les reponses contiennent, cote serveur Node. Memes scenarios que deploy/analyse.php
// (tests/unit/deploy/analysePhpModeles.test.ts).

const deploy = path.resolve(__dirname, '../../../deploy');
const P = PLAFONDS_DEFAUT as Plafonds;

describe('le modele de chaque usage', () => {
  it('prend le modele rapide par defaut pour tous les usages', () => {
    expect(MODELE_PAR_USAGE).toEqual({ analyse: RAPIDE, escalade: RAPIDE, renfort: RAPIDE, immediat: RAPIDE, candidats: RAPIDE });
    expect(modelesParUsage(null)).toEqual({ ...MODELE_PAR_USAGE });
  });

  it('suit le reglage, et retombe sur le defaut pour un modele qui n est plus admis', () => {
    expect(modelesParUsage({ format: 'plan-claude-modeles', usages: { analyse: FIN, renfort: 'claude-ancien-1' } })).toEqual({ ...MODELE_PAR_USAGE, analyse: FIN });
    expect(modelesParUsage({ usages: 'n importe quoi' })).toEqual({ ...MODELE_PAR_USAGE });
  });

  it('refuse un modele hors de la liste ou un usage inconnu', () => {
    expect(verifierModeles({ format: 'plan-claude-modeles', usages: { analyse: RAPIDE } })).toEqual({ format: 'plan-claude-modeles', usages: { analyse: RAPIDE } });
    expect(verifierModeles({ format: 'plan-claude-modeles', usages: [] })).toEqual({ format: 'plan-claude-modeles', usages: {} });
    expect(() => verifierModeles({ format: 'plan-claude-modeles', usages: { analyse: 'claude-fable-5-1' } })).toThrow(/non admis/);
    expect(() => verifierModeles({ format: 'plan-claude-modeles', usages: { autre: RAPIDE } })).toThrow(/Usage inconnu/);
    expect(() => verifierModeles({ format: 'autre', usages: {} })).toThrow(/réglage des modèles/);
  });

  it('donne a chaque requete le modele regle de son usage, sauf modele demande', () => {
    const d = { ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteRenfort('r1')] };
    expect(verifierDemande(d, P).requetes.map((r) => r.modele)).toEqual([RAPIDE, RAPIDE]);
    const regle = modelesParUsage({ usages: { analyse: FIN } });
    expect(verifierDemande(d, P, regle).requetes.map((r) => r.modele)).toEqual([FIN, RAPIDE]);
    expect(verifierDemande({ ...d, modele: FIN }, P).requetes.map((r) => r.modele)).toEqual([FIN, FIN]);
  });
});

describe('ce que les reponses contiennent', () => {
  it('compte les baies, les bouts, les lucarnes, les elements et les ecarts de l analyse', () => {
    expect(comptesSortie(SORTIE_ANALYSE, 'analyse')).toEqual(TROUVE_ANALYSE);
    expect(comptesSortie(SORTIE_ANALYSE, 'escalade')).toEqual(TROUVE_ANALYSE);
    expect(comptesSortie(SORTIE_VIDE, 'analyse')).toEqual(TROUVE_VIDE);
  });

  it('compte les avis, les baies manquees, les coins et le mur du renfort', () => {
    expect(comptesSortie(SORTIE_RENFORT, 'renfort')).toEqual(TROUVE_RENFORT);
    const retiree = { ...SORTIE_RENFORT, ouvertures: [{ ...SORTIE_RENFORT.ouvertures[0], decision: 'retirer', raison: 'ombre' }], manquees: [], mur: { indices: [], vu: 'indetermine' }, coins: { indices: [] } };
    expect(comptesSortie(retiree, 'renfort')).toMatchObject({ ouvertures: 0, enTrop: 1, manquees: 0, coins: 0, determines: 0, vide: false });
  });

  it('borne un nombre aberrant, ignore une forme inattendue, et ne compte que les reponses lues', () => {
    expect(comptesSortie({ facades: [{ ouvertures: { parNiveau: [5000, -2, 1.5, '3'], manquees: 1e9 } }] }, 'analyse')).toMatchObject({ ouvertures: 999, manquees: 999 });
    expect(comptesSortie([], 'analyse')).toEqual(TROUVE_VIDE);
    expect(comptesSortie('texte', 'renfort')).toEqual(TROUVE_VIDE);
    expect(comptesSortie(null, 'analyse')).toBe(null);
    expect(trouvailles({ statut: 'reussi', erreur: null, sortie: SORTIE_VIDE }, 'analyse')).toEqual(TROUVE_VIDE);
    expect(trouvailles({ statut: 'reussi', erreur: { type: 'max_tokens', message: '' }, sortie: null }, 'analyse')).toBe(null);
    expect(trouvailles({ statut: 'echoue', erreur: { type: 'overloaded_error', message: '' }, sortie: null }, 'analyse')).toBe(null);
  });

  it('rend `trouve` et `idBatch` a null pour une ligne de journal d avant les comptes', () => {
    const ancienne = { t: '2026-10-02T08:00:00Z', organisation: 'admin', usage: 'analyse', modele: RAPIDE, batch: true, statut: 'reussi', cout: 0.001 };
    expect(filtrerConsommation([ancienne], { du: '2026-10-01', au: '2026-10-14' })[0]).toMatchObject({ trouve: null, idBatch: null });
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
let sorties: Record<string, object>;

function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}
const ecrire = (entree: string, methode: string, corps: unknown) => navigateur(entree, { method: methode, headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const journal = () => {
  const f = path.join(dossier, 'claude', 'journal-2026-10.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];
};
const leServeur = (): Serveur => ({ navigateur, ecrire, journal, fichier: path.join(dossier, 'claude', 'modeles.json'), faux, sorties });

describe('le modele de chaque usage, routes', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'modeles-'));
    cookie = '';
    sorties = {};
    faux = await demarrerFauxAnthropic((id) => (sorties[id] ? reussi(id, USAGE_P2, sorties[id]) : reponseParDefaut(id)));
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

  it('reste a l administrateur', async () => {
    expect((await navigateur('admin/claude/modeles')).status).toBe(401);
    expect((await navigateur('admin/claude/modeles', { headers: { Authorization: 'Bearer ' + JETON_ORGA } })).status).toBe(403);
    await connecterAdmin(navigateur, MDP);
    expect((await navigateur('admin/claude/modeles', { method: 'PUT', body: '{}' })).status).toBe(403);
  });

  it('lit le defaut, pose et remplace le reglage, refuse un modele hors de la liste', async () => {
    await connecterAdmin(navigateur, MDP);
    await reglerLesModeles(leServeur());
  });

  it('journalise ce que chaque reponse contient', async () => {
    await connecterAdmin(navigateur, MDP);
    await compterCeQuiEstTrouve(leServeur());
  });
});
