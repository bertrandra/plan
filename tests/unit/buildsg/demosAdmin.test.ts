import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import { creerDepotDemos, connecterAdmin, sessionAdmin, deconnecterAdmin, lireControleurs, enregistrerControleurs, lirePalette, enregistrerPalette, lireArbres, enregistrerArbres, lireCalibration, enregistrerCalibration, listerCasCalibration, lireCasCalibration, enregistrerCasCalibration, supprimerCasCalibration } from '../../../src/io/depotDemos.js';

// L'admin des demos (MD/spec-demos-admin.md), cote serveur et cote page, l'un contre l'autre : un
// vrai serveur HTTP sur un dossier temporaire, et le depot de la page qui lui parle.

const MDP = 'secret-admin';
const PLAN = { meta: { name: 'Démo 1', schemaVersion: 3 }, objects: [{ key: 'parcelle', type: 'polygon' }], measures: [] };

let dossier: string;
let serveur: http.Server;
let base: string;
let cookie: string;

/** Un fetch de navigateur minimal : la base du serveur, et le cookie qu'il a pose. */
function navigateur(entree: string, init: RequestInit = {}): Promise<Response> {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  // La page appelle `admin/…`, relatif a son adresse : ici, a la racine du serveur.
  return fetch(base + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes }).then((r) => {
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    return r;
  });
}

function demarrer(motDePasse: string | undefined): Promise<void> {
  const admin = creerAdminDemos({ dossier, motDePasse });
  serveur = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    void admin.traiter(req, res, url, {}).then((pris) => {
      if (!pris) { res.writeHead(404); res.end('page'); }
    });
  });
  return new Promise((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      base = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port;
      ok();
    });
  });
}

beforeEach(() => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
  cookie = '';
});
afterEach(async () => {
  await new Promise((ok) => serveur.close(ok));
  fs.rmSync(dossier, { recursive: true, force: true });
});

describe('admin des demos, serveur', () => {
  it('sans ADMIN_PASSWORD, rien n existe', async () => {
    await demarrer(undefined);
    expect((await navigateur('/admin/session')).status).toBe(404);
    expect(await sessionAdmin(navigateur)).toBe(null);
    // Le reste du site n'est pas concerne.
    expect(await (await navigateur('/')).text()).toBe('page');
  });

  it('refuse les fichiers sans session, et un mauvais mot de passe', async () => {
    await demarrer(MDP);
    expect((await navigateur('/admin/demos')).status).toBe(401);
    expect(await sessionAdmin(navigateur)).toBe(false);
    expect(await connecterAdmin(navigateur, 'faux')).toBe('Mot de passe refusé.');
    expect(cookie).toBe('');
  });

  it('bloque apres cinq essais faux, meme avec le bon ensuite', async () => {
    await demarrer(MDP);
    for (let i = 0; i < 5; i++) await connecterAdmin(navigateur, 'faux' + i);
    expect(await connecterAdmin(navigateur, MDP)).toMatch(/Trop d’essais/);
  });

  it('exige l en-tete X-Plan-Admin sur toute ecriture', async () => {
    await demarrer(MDP);
    const r = await navigateur('/admin/session', { method: 'POST', body: JSON.stringify({ motDePasse: MDP }) });
    expect(r.status).toBe(403);
  });

  it('refuse un identifiant qui sortirait du dossier', async () => {
    await demarrer(MDP);
    expect(await connecterAdmin(navigateur, MDP)).toBe(null);
    expect((await navigateur('/admin/demos/..%2Fsecret')).status).toBe(400);
  });

  it('pose un cookie HttpOnly, SameSite=Strict, limite a /admin/', async () => {
    await demarrer(MDP);
    const r = await fetch(base + '/admin/session', { method: 'POST', headers: { 'X-Plan-Admin': '1' }, body: JSON.stringify({ motDePasse: MDP }) });
    const c = r.headers.get('set-cookie') || '';
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\/admin\//);
  });
});

describe('la vitrine lit une demo sans session', () => {
  it('sert admin/vitrine/<id> en lecture seule, sans cookie, et rien d autre', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, '1.json'), JSON.stringify(PLAN));
    const r = await fetch(base + '/admin/vitrine/1');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('cache-control')).toMatch(/public/);
    // Lisible depuis un <iframe> en bac a sable (origine `null`) : celui de la plateforme.
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect((await r.json()).meta.name).toBe('Démo 1');
    expect((await fetch(base + '/admin/vitrine/9')).status).toBe(404);
    expect((await fetch(base + '/admin/vitrine/..%2Fconfig')).status).toBe(400);
    expect((await fetch(base + '/admin/vitrine/1', { method: 'PUT', headers: { 'X-Plan-Admin': '1' }, body: '{}' })).status).toBe(405);
    // La liste et l'ecriture restent derriere la session.
    expect((await fetch(base + '/admin/demos')).status).toBe(401);
  });

  it('dit pourquoi elle ne lit pas sa demo, de toute origine : admin non configure, fichier absent', async () => {
    await demarrer(undefined);
    let r = await fetch(base + '/admin/vitrine/1');
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('NOT_CONFIGURED');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    await demarrer(MDP);
    r = await fetch(base + '/admin/vitrine/1');
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('NOT_FOUND');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  // Root lit tout, droits ou pas : ce cas ne s'eprouve qu'en utilisateur ordinaire (la CI l'est).
  it.skipIf(process.getuid?.() === 0)('dit qu une demo presente est illisible (droits du fichier)', async () => {
    await demarrer(MDP);
    const f = path.join(dossier, '1.json');
    fs.writeFileSync(f, JSON.stringify(PLAN));
    fs.chmodSync(f, 0o000);
    try {
      const r = await fetch(base + '/admin/vitrine/1');
      expect(r.status).toBe(500);
      expect((await r.json()).error.code).toBe('UNREADABLE');
    } finally {
      fs.chmodSync(f, 0o644);
    }
  });
});

describe('se deconnecter de l admin', () => {
  it('ferme la session : le serveur l oublie, le mot de passe est redemande', async () => {
    await demarrer(MDP);
    expect(await connecterAdmin(navigateur, MDP)).toBe(null);
    expect(await sessionAdmin(navigateur)).toBe(true);
    const ancien = cookie;
    expect(await deconnecterAdmin(navigateur)).toBe(true);
    expect(await sessionAdmin(navigateur)).toBe(false);
    // Le jeton d'avant ne rouvre rien, meme rejoue a la main.
    expect((await fetch(base + '/admin/demos', { headers: { Cookie: ancien } })).status).toBe(401);
  });

  it('dit non si le serveur ne repond pas', async () => {
    expect(await deconnecterAdmin((async () => { throw new Error('reseau'); }) as never)).toBe(false);
  });
});

describe('admin des demos, la page contre le serveur', () => {
  it('ouvre, enregistre et garde la version precedente', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, '1.json'), JSON.stringify(PLAN));
    expect(await connecterAdmin(navigateur, MDP)).toBe(null);
    expect(await sessionAdmin(navigateur)).toBe(true);
    const depot = creerDepotDemos(navigateur);

    expect(await depot.lister()).toMatchObject([{ id: '1', name: 'Démo 1' }]);
    const ouvert = await depot.ouvrir('1');
    expect(ouvert.meta).toMatchObject({ id: '1', name: 'Démo 1' });
    expect(ouvert.objects).toHaveLength(1);
    expect(ouvert.schemaVersion).toBe(3);

    const objets = [{ key: 'parcelle', type: 'polygon' }, { key: 'terrasse', type: 'polygon' }];
    await depot.enregistrer({ id: '1', name: 'Démo 1', objects: objets as never, measures: [] });
    const ecrit = JSON.parse(fs.readFileSync(path.join(dossier, '1.json'), 'utf8'));
    // Le format de l'export : meta, objects, measures.
    expect(Object.keys(ecrit)).toEqual(['meta', 'objects', 'measures']);
    expect(ecrit.meta).toMatchObject({ id: '1', name: 'Démo 1' });
    expect(ecrit.objects).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(dossier, '1.json.bak'), 'utf8')).objects).toHaveLength(1);
  });

  it('cree une nouvelle demo au premier numero libre, et la supprime sans l effacer', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, '1.json'), JSON.stringify(PLAN));
    await connecterAdmin(navigateur, MDP);
    const depot = creerDepotDemos(navigateur);
    const cree = await depot.enregistrer({ name: 'Nouvelle', objects: PLAN.objects as never });
    expect(cree.id).toBe('2');
    await depot.supprimer('2');
    expect(fs.existsSync(path.join(dossier, '2.json'))).toBe(false);
    expect(fs.readdirSync(dossier).some((n) => n.startsWith('2.json.supprime-'))).toBe(true);
  });

  it('dit qu une demo absente est introuvable, et qu un fichier sans objets n est pas un plan', async () => {
    await demarrer(MDP);
    fs.writeFileSync(path.join(dossier, 'vide.json'), JSON.stringify({ meta: {} }));
    await connecterAdmin(navigateur, MDP);
    const depot = creerDepotDemos(navigateur);
    await expect(depot.ouvrir('9')).rejects.toMatchObject({ reason: 'notfound' });
    await expect(depot.ouvrir('vide')).rejects.toMatchObject({ reason: 'badjson' });
  });

  it('enregistre et relit le registre des controleurs, hors de la liste des demos', async () => {
    await demarrer(MDP);
    await connecterAdmin(navigateur, MDP);
    expect(await lireControleurs(navigateur)).toBe(null);
    const registre = { format: 'plan-controleurs', version: 1, appVersion: '2.2.0', decouvertLe: '2026-10-02T08:00:00.000Z', arbre: { cle: 'plan', nom: 'Plan', genre: 'racine' } };
    await enregistrerControleurs(navigateur, registre);
    expect(await lireControleurs(navigateur)).toEqual(registre);
    expect(await creerDepotDemos(navigateur).lister()).toEqual([]);
    await expect(enregistrerControleurs(navigateur, { arbre: {} })).rejects.toMatchObject({ reason: 'server' });
  });

  it('sert la palette sans session, et ne l ecrit qu avec la session', async () => {
    // Sans palette : 404, et la page garde ses couleurs d'origine.
    await demarrer(MDP);
    expect(await lirePalette(navigateur)).toBe(null);
    const palette = { format: 'plan-palette', version: 1, modifieLe: '2026-10-03T08:00:00.000Z', couleurs: { clair: { accent: '#336699' }, sombre: { accent: '#88AACC' } } };
    // Ecrire demande la session.
    await expect(enregistrerPalette(navigateur, palette)).rejects.toThrow(/session admin/);
    await connecterAdmin(navigateur, MDP);
    await enregistrerPalette(navigateur, palette);
    // La lire, non : une page sans cookie la recoit.
    const r = await fetch(base + '/admin/palette');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.json()).toEqual(palette);
    // Elle reste hors de la liste des demos, et un document qui n'est pas une palette est refuse.
    expect(await creerDepotDemos(navigateur).lister()).toEqual([]);
    await expect(enregistrerPalette(navigateur, { format: 'plan-palette', couleurs: { clair: { accent: 'rouge' } } })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerPalette(navigateur, { couleurs: {} })).rejects.toMatchObject({ reason: 'server' });
    expect(await lirePalette(navigateur)).toEqual(palette);
  });
});

describe('app.js sert le programme sorti de la page', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../../buildsg/app.js'), 'utf8');
  it('lit dist/assets/plan-<empreinte>.js et le sert en JavaScript, gardable sans limite', () => {
    expect(app).toMatch(/path\.join\(dist, 'assets'\)/);
    expect(app).toMatch(/\^plan-\[0-9a-f\]\{16\}\\\.js\$/);
    expect(app).toMatch(/'Content-Type': 'text\/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable'/);
  });

  it('sert la bibliotheque d arbres sans session, et ne l ecrit qu avec la session', async () => {
    await demarrer(MDP);
    expect(await lireArbres(navigateur)).toBe(null);
    const arbres = { format: 'plan-arbres', version: 1, modifieLe: '2026-10-16T08:00:00.000Z', especes: [{ id: 'chene', nom: 'Chêne', caduc: true, reglages: { seed: 1, branch: { levels: 3 } } }] };
    await expect(enregistrerArbres(navigateur, arbres)).rejects.toThrow(/session admin/);
    await connecterAdmin(navigateur, MDP);
    await enregistrerArbres(navigateur, arbres);
    const r = await fetch(base + '/admin/arbres');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.json()).toEqual(arbres);
    // Un identifiant hors [a-z0-9-], un doublon ou un document d'un autre format sont refuses.
    await expect(enregistrerArbres(navigateur, { ...arbres, especes: [{ id: 'Chêne', reglages: { a: 1 } }] })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerArbres(navigateur, { ...arbres, especes: [arbres.especes[0], arbres.especes[0]] })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerArbres(navigateur, { format: 'plan-palette', especes: [] })).rejects.toMatchObject({ reason: 'server' });
    expect(await lireArbres(navigateur)).toEqual(arbres);
  });
  it('sert la calibration sans session ; les cas de calibration (avec leurs photos) ne se lisent et ne s ecrivent qu avec elle', async () => {
    await demarrer(MDP);
    expect(await lireCalibration(navigateur)).toBe(null);
    const calib = { format: 'plan-calibration', version: 1, modifieLe: '2026-10-17T08:00:00.000Z', parametres: { 'facades.detection.areteNette': 0.7 }, historique: [] };
    await expect(enregistrerCalibration(navigateur, calib)).rejects.toThrow(/session admin/);
    await expect(listerCasCalibration(navigateur)).rejects.toThrow(/session admin/);
    await connecterAdmin(navigateur, MDP);
    await enregistrerCalibration(navigateur, calib);
    const r = await fetch(base + '/admin/calibration');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe(null);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.json()).toEqual(calib);
    await expect(enregistrerCalibration(navigateur, { ...calib, parametres: { 'autre.nom': 1 } })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerCalibration(navigateur, { ...calib, parametres: { 'facades.detection.areteNette': 'x' } })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerCalibration(navigateur, { format: 'plan-arbres', parametres: {} })).rejects.toMatchObject({ reason: 'server' });
    expect(await lireCalibration(navigateur)).toEqual(calib);

    expect(await listerCasCalibration(navigateur)).toEqual([]);
    const coins = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 5 }, { x: 0, y: 5 }];
    const cas = { format: 'plan-facade-reelle', version: 1, nom: 'Maison nord', statut: 'valide', largeurM: 9, hauteurM: 5, photos: [{ fichier: 'p0', coins }], images: ['data:image/jpeg;base64,AAAA'], ouvertures: [{ type: 'fenetre', x: 1, y: 1, l: 1, h: 1.2 }] };
    await expect(enregistrerCasCalibration(navigateur, 'cas 1', cas)).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerCasCalibration(navigateur, 'cas1', { ...cas, images: [] })).rejects.toMatchObject({ reason: 'server' });
    await expect(enregistrerCasCalibration(navigateur, 'cas1', { ...cas, images: ['pas une image'] })).rejects.toMatchObject({ reason: 'server' });
    await enregistrerCasCalibration(navigateur, 'cas1', cas);
    const liste = await listerCasCalibration(navigateur);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: 'cas1', nom: 'Maison nord', statut: 'valide', photos: 1, ouvertures: 1 });
    expect(await lireCasCalibration(navigateur, 'cas1')).toEqual(cas);
    // Les photos ne se lisent pas sans session.
    cookie = '';
    expect((await fetch(base + '/admin/calibration-cas/cas1')).status).toBe(401);
    await connecterAdmin(navigateur, MDP);
    await supprimerCasCalibration(navigateur, 'cas1');
    expect(await listerCasCalibration(navigateur)).toEqual([]);
  });
});
