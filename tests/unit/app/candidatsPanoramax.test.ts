import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerAnalyseAdmin } from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { creerClientAnalyse } from '../../../src/io/analyseClaude.js';
import { lirePhotosRue } from '../../../src/geo/panoramax.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import { analyserVillage, emprise, etiquettePhoto, photosParBatiment, texteDuBatiment, idRequeteCandidat, type VillageJson } from '../../../src/app/candidatsPanoramax.js';
import { CLE, USAGE_P2, messageReussi, reussi, demarrerFauxAnthropic, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';
import { ORIGINE, RECHERCHE_PANORAMAX, SORTIE_DEUX_PANS, SORTIE_MANSART, VILLAGE, telechargementFige } from '../../fixtures/candidats/village.js';

// Les cas candidats Panoramax (lot G3 bis) : le choix des photos qui montrent un toit, puis un
// village entier par les routes de l'analyse (serveur Node, API Anthropic simulee), en batch et en
// appel immediat. Sans reseau : la recherche Panoramax et les photos sont figees.

const vues = () => {
  const proj = projecteurLocal(ORIGINE.lat, ORIGINE.lon);
  return lirePhotosRue(RECHERCHE_PANORAMAX).map((photo) => ({ photo, ...proj.versMetres(photo.lon, photo.lat) }));
};
const faites = new Map([['A', 10], ['B', 10]]);

describe('les photos qui montrent un toit', () => {
  it('garde la photo de face, avec du recul, et ecarte celle de trop pres et celle qui tourne le dos', () => {
    const p = photosParBatiment(VILLAGE.batiments, vues(), faites);
    expect(p.get('A')?.map((x) => x.vue.photo.id)).toEqual(['pa']);
    expect(p.get('B')?.map((x) => x.vue.photo.id)).toEqual(['pb']);
    const a = p.get('A')![0]!;
    expect(a.distanceM).toBeCloseTo(23, 0);
    expect(Math.min(a.capDeg, 360 - a.capDeg)).toBeCloseTo(0, 0);
    // Le batiment est au milieu de l'image : la photo regarde droit vers lui.
    expect(a.partLargeur).toBeCloseTo(0.5, 2);
  });

  it('perd une photo quand le faite sort du haut du cadre', () => {
    expect(photosParBatiment(VILLAGE.batiments, vues(), new Map([['A', 30], ['B', 10]])).get('A')).toBeUndefined();
  });

  it('cache le batiment derriere un autre : la photo ne le voit pas', () => {
    const avecEcran: VillageJson = { ...VILLAGE, batiments: [...VILLAGE.batiments, { key: 'ecran', pts: [{ x: -2, y: -9 }, { x: 14, y: -9 }, { x: 14, y: -7 }, { x: -2, y: -7 }] }] };
    expect(photosParBatiment(avecEcran.batiments, vues(), faites).get('A')).toBeUndefined();
  });

  it('borne la recherche autour du village, et etiquette chaque photo avec la place du batiment vise', () => {
    const e = emprise(VILLAGE.batiments);
    expect(e.centre).toEqual({ x: 21, y: 5 });
    expect(e.rayonM).toBeCloseTo(15 + 40, 5);
    const a = photosParBatiment(VILLAGE.batiments, vues(), faites).get('A')![0]!;
    expect(etiquettePhoto(1, a)).toMatch(/^Image 1 : photo de rue Panoramax, prise le 2025-06-01, à 23 m du bâtiment visé, qui est vers 0° ; le bâtiment visé est à 50 % de la largeur/);
    expect(texteDuBatiment(VILLAGE.batiments[0]!, null)).toMatch(/Façades à décrire \(étiquettes\) : aucune/);
    expect(idRequeteCandidat(3, 2)).toBe('c3-p2');
  });
});

// --- Un village entier, par le serveur Node et l'API simulee -------------------------------------

const MDP = 'secret-admin';
const deploy = path.resolve(__dirname, '../../../deploy');
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
const journal = () => {
  const d = path.join(dossier, 'claude');
  return fs.readdirSync(d).filter((n) => n.startsWith('journal-')).flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>));
};

describe('un village, par les routes de l analyse', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'candidats-'));
    cookie = '';
    faux = await demarrerFauxAnthropic((id) => reussi(id, USAGE_P2, id.startsWith('c0-') ? SORTIE_MANSART : SORTIE_DEUX_PANS));
    plateforme = await demarrerFauxePlateforme();
    const admin = creerAdminDemos({ dossier, motDePasse: MDP });
    const analyse = creerAnalyseAdmin({ dossier, actif: admin.actif, sessionValide: admin.sessionValide, cle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url, deploy });
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
  });
  afterEach(async () => {
    await new Promise((ok) => serveur.close(ok));
    await faux.fermer();
    await plateforme.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
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
    expect(r.bilan).toMatchObject({ batiments: 2, avecPhotos: 2, analyses: 2, echecs: 0, photos: 2, modele: 'claude-haiku-5-5' });
    expect(r.bilan.cout).toBeGreaterThan(0);
    expect([...r.analyses]).toEqual(['A', 'B']);
    expect(r.candidats).toHaveLength(1);
    expect(r.candidats[0]).toMatchObject({
      id: 'cand-BATIMENT0000000000000001', cle: 'A', cleabs: 'BATIMENT0000000000000001', statut: 'propose', visees: ['mansart', 'lucarnes'],
      observation: { forme: 'mansart', profil: 'brise', bouts: ['brisis', 'brisis'], lucarnes: { nombre: 3, types: ['jacobine'] } },
      source: { par: 'claude', usage: 'candidats', modele: 'claude-haiku-5-5', prompt: 4, schema: 1, le: '2026-10-14' },
      photos: [{ id: 'pa', url: 'https://panoramax.ign.fr/api/pictures/pa/hd.jpg', auteur: 'Contributeur de test', licence: 'CC-BY-SA-4.0' }],
    });
    expect(r.candidats[0]!.vote).toMatchObject({ passes: 3, forme: { valeur: 'mansart', accord: 1 }, contradictions: [] });
    // Le journal de l'analyse : une ligne par requete, sous l'usage des cas candidats, sans photo.
    const j = journal().filter((l) => l.requete);
    expect(j).toHaveLength(6);
    expect(j[0]).toMatchObject({ usage: 'candidats', modele: 'claude-haiku-5-5', batch: true, idu: '78646000AE0153', audit: 'candidats-test', facades: 0 });
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
