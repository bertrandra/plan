import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { PLAFONDS_DEFAUT, choixConsommation, etatOrganisations, filtrerConsommation, type Plafonds } from '../../../buildsg/analyseAdmin.mjs';
import { CLE, COUT_P1_FIN, COUT_P2, COUT_P2_FIN, TROUVE_DEFAUT, demande, demarrerFauxAnthropic, reponseParDefaut, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { JETON_LECTEUR, JETON_ORGA, ORGA, demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';

// analyse.php, l'analyse par Claude sans Node (deploy/analyse.php), contre une API Message Batches
// simulee : memes scenarios que buildsg/analyseAdmin.mjs, memes couts au centime pres. Lance par le
// serveur integre de PHP derriere le role du .htaccess ; saute si PHP manque.

const php = spawnSync('php', ['-v']).status === 0;
const racine = path.resolve(__dirname, '../../..');
const TARIFS = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/claude-tarifs.json'), 'utf8')) as { lignes: unknown[] };

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
const ecrire = (entree: string, methode: string, corps: unknown) => navigateur(entree, { method: methode, headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

function configurer(valeurs: Record<string, string>): void {
  const lignes = Object.entries(valeurs).map(([k, v]) => '  ' + JSON.stringify(k) + ' => ' + JSON.stringify(v) + ',');
  fs.writeFileSync(config, '<?php return [\n' + lignes.join('\n') + '\n];\n');
}

const journal = (): Record<string, unknown>[] => {
  const d = path.join(demos, 'claude');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(d, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
};

describe.skipIf(!php)('analyse.php', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'analysephp-'));
    demos = path.join(tmp, 'demos');
    config = path.join(tmp, 'config.php');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    faux = await demarrerFauxAnthropic(reponseParDefaut);
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
  beforeEach(() => {
    cookie = '';
    configurer({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url });
    fs.rmSync(demos, { recursive: true, force: true });
    plateforme.jetons.length = 0;
    faux.batches.length = 0;
    faux.entetes.length = 0;
    faux.statutCreation = 200;
    // Le journal de PHP date chaque ligne a la fin du batch, a l'heure du serveur : la meme ici.
    faux.finLe = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  });

  it('n existe pas sans configuration, et exige la session et l en-tete', async () => {
    configurer({ motDePasse: 'A-CHANGER', dossierDemos: demos });
    expect((await navigateur('admin/claude/etat')).status).toBe(404);
    configurer({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: CLE, anthropicUrl: faux.url, plateformeUrl: plateforme.url });
    expect((await navigateur('admin/claude/etat')).status).toBe(401);
    expect(await connecterAdmin(navigateur, 'secret-admin')).toBe(null);
    expect((await navigateur('admin/claude/batches', { method: 'POST', body: JSON.stringify(demande()) })).status).toBe(403);
    expect(await (await navigateur('admin/claude/etat')).json()).toMatchObject({ actif: true, prompt: 1, schema: 1, effort: 'low', organisation: 'admin', admin: true });
    // La session admin d'admin.php continue de servir les demos.
    expect((await navigateur('admin/demos')).status).toBe(200);
  });

  it('ouvre l analyse a un utilisateur de la plateforme par son jeton, dans son organisation seulement', async () => {
    const porteur = (jeton: string) => ({ Authorization: 'Bearer ' + jeton });
    const utilisateur = (entree: string, init: RequestInit = {}) => navigateur(entree, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...porteur(JETON_ORGA) } });
    expect((await navigateur('admin/claude/etat', { headers: porteur('jeton-inconnu-de-la-plateforme') })).status).toBe(401);
    expect((await navigateur('admin/claude/etat', { headers: porteur(JETON_LECTEUR) })).status).toBe(403);
    expect(await (await utilisateur('admin/claude/etat')).json()).toMatchObject({ actif: true, organisation: ORGA, admin: false });
    expect((await utilisateur('admin/claude/tarifs')).status).toBe(403);
    expect((await utilisateur('admin/consommation')).status).toBe(403);
    const cree = await utilisateur('admin/claude/batches', { method: 'POST', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(demande()) });
    expect(cree.status).toBe(201);
    expect(plateforme.jetons).toContain(JETON_ORGA);
    faux.terminer();
    expect((await (await utilisateur('admin/claude/batches/msgbatch_1/resultats')).json()).resultats).toHaveLength(2);
    expect(journal().find((l) => l.requete === 'p1')).toMatchObject({ organisation: ORGA, projet: 'projet-1', facades: 2, statut: 'reussi' });
    // L'administrateur voit ce batch et cette organisation dans la consommation.
    await connecterAdmin(navigateur, 'secret-admin');
    expect((await navigateur('admin/claude/batches/msgbatch_1')).status).toBe(200);
    const d = await (await navigateur('admin/consommation')).json();
    expect(d.organisations.map((o: { id: string }) => o.id).sort()).toEqual(['admin', ORGA].sort());
  });

  it('sans cle, repond 503 et n appelle rien', async () => {
    configurer({ motDePasse: 'secret-admin', dossierDemos: demos, anthropicCle: 'A-CHANGER', anthropicUrl: faux.url });
    await connecterAdmin(navigateur, 'secret-admin');
    expect((await (await navigateur('admin/claude/etat')).json()).actif).toBe(false);
    expect((await ecrire('admin/claude/batches', 'POST', demande())).status).toBe(503);
    expect(faux.entetes).toHaveLength(0);
  });

  it('cree le batch, lit ses resultats, journalise une fois aux memes couts que Node', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    const cree = await ecrire('admin/claude/batches', 'POST', demande());
    expect(cree.status).toBe(201);
    expect((await cree.json()).batch).toMatchObject({ id: 'msgbatch_1', etat: 'in_progress' });
    const params = faux.batches[0]!.corps.requests[0]!.params;
    // L'analyse part par defaut au modele plus fin : le modele rapide ne trouvait rien sur les photos.
    expect(params).toMatchObject({ model: 'claude-sonnet-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect((params.system as { text: string; cache_control: unknown }[])[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
    // Le schema repart tel quel, objets vides compris.
    const schema = JSON.parse(fs.readFileSync(path.join(racine, 'deploy/schema-analyse.json'), 'utf8')).schema;
    expect((params.output_config as { format: { schema: unknown } }).format.schema).toEqual(schema);
    expect(params).not.toHaveProperty('temperature');

    expect((await navigateur('admin/claude/batches/msgbatch_1/resultats')).status).toBe(409);
    faux.terminer();
    const lu = await (await navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
    const p1 = lu.resultats.find((r: { id: string }) => r.id === 'p1');
    expect(p1).toMatchObject({ statut: 'reussi', passe: 1, cout: COUT_P1_FIN, sortie: { forme: { indices: [], valeur: 'deux-pans' } } });
    expect(lu.resultats.find((r: { id: string }) => r.id === 'p2').cout).toBe(COUT_P2_FIN);

    const lignes = journal();
    expect(lignes).toHaveLength(2);
    expect(lignes.find((l) => l.requete === 'p2')).toMatchObject({
      organisation: 'admin', projet: 'projet-1', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
      usage: 'analyse', modele: 'claude-sonnet-5-5', batch: true, idBatch: 'msgbatch_1', passe: 2, images: 1, facades: 2, cout: COUT_P2_FIN,
      tokens: { entree: 4000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 25000, sortie: 1500 }, statut: 'reussi', prompt: 1, schema: 1, trouve: TROUVE_DEFAUT
    });
    // La page ne recoit pas les comptes : ils ne servent qu'au tableau de bord.
    expect(p1).not.toHaveProperty('trouve');
    expect((await navigateur('admin/claude/batches/msgbatch_1/resultats')).status).toBe(200);
    expect(journal()).toHaveLength(2);
    expect((await navigateur('admin/claude/batches/msgbatch_9')).status).toBe(404);
  });

  it('refuse au plafond en comptant les batches ouverts, et le journalise', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    const plafonds = { format: 'plan-claude-plafonds', defaut: { jour: 0.01, mois: 1 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.004 };
    // Les montants de ce scenario sont ceux du modele rapide : il est regle pour l'analyse.
    expect((await ecrire('admin/claude/modeles', 'PUT', { format: 'plan-claude-modeles', usages: { analyse: 'claude-haiku-5-5' } })).status).toBe(200);
    const pose = await ecrire('admin/claude/plafonds', 'PUT', plafonds);
    expect(pose.status).toBe(200);
    expect(await (await navigateur('admin/claude/plafonds')).json()).toEqual(plafonds);
    expect((await ecrire('admin/claude/batches', 'POST', demande())).status).toBe(201);
    const refus = await ecrire('admin/claude/batches', 'POST', demande(['p1']));
    expect(refus.status).toBe(429);
    expect(journal()).toMatchObject([{ statut: 'plafond', cout: 0 }]);
    faux.terminer();
    expect((await ecrire('admin/claude/batches', 'POST', demande(['p1']))).status).toBe(201);
    expect(journal().filter((l) => l.statut === 'reussi')).toHaveLength(2);
  });

  it('pose les tarifs livres, refuse de reecrire le passe, et dit le refus d Anthropic', async () => {
    await connecterAdmin(navigateur, 'secret-admin');
    expect(await (await navigateur('admin/claude/tarifs')).json()).toEqual(TARIFS);
    const lignes = TARIFS.lignes as Record<string, unknown>[];
    expect((await ecrire('admin/claude/tarifs', 'PUT', { ...TARIFS, lignes: [{ ...lignes[0], sortie: 0.4 }, lignes[1]] })).status).toBe(409);
    expect((await ecrire('admin/claude/tarifs', 'PUT', { ...TARIFS, lignes: [...lignes, { ...lignes[0], depuis: '2099-01-01', sortie: 0.4 }] })).status).toBe(200);
    expect(fs.existsSync(path.join(demos, 'claude/tarifs.json.bak'))).toBe(true);
    faux.statutCreation = 400;
    const r = await ecrire('admin/claude/batches', 'POST', demande());
    expect(r.status).toBe(502);
    expect(journal()).toMatchObject([{ statut: 'echoue', erreur: 'http-400' }]);
    expect((await ecrire('admin/claude/batches', 'POST', { ...demande(), requetes: [{ id: 'p1', contenu: [{ type: 'document' }] }] })).status).toBe(400);
  });

  it('rend la consommation comme Node : periode, sept derniers jours, plafonds, filtres', async () => {
    // Le journal dans le dossier de PHP, date autour d'aujourd'hui (PHP lit l'heure du serveur).
    const jour = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const ligne = (n: number, plus: Record<string, unknown> = {}) => ({
      t: jour(n) + 'T08:00:00Z', organisation: 'admin', projet: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'a-' + n,
      usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, idBatch: 'msgbatch_1', requete: 'p1', passe: 1,
      tokens: { entree: 4000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 25000, sortie: 1500 }, images: 1, cout: COUT_P2, tarif: '2026-10-13',
      statut: 'reussi', arret: 'end_turn', prompt: 0, schema: 0, ...plus
    });
    // Dans l'ordre ou le serveur les lit : un fichier par mois, du plus ancien au plus recent.
    const lignes = [ligne(0), ligne(3, { modele: 'claude-sonnet-5-5', usage: 'escalade', cout: 0.004 }), ligne(20, { idu: '78650000AE0102', adresse: null }), ligne(45)]
      .sort((a, b) => a.t.slice(0, 7).localeCompare(b.t.slice(0, 7)));
    fs.mkdirSync(path.join(demos, 'claude'), { recursive: true });
    for (const l of lignes) fs.appendFileSync(path.join(demos, 'claude', 'journal-' + l.t.slice(0, 7) + '.jsonl'), JSON.stringify(l) + '\n');

    expect((await navigateur('admin/consommation')).status).toBe(401);
    await connecterAdmin(navigateur, 'secret-admin');
    const d = await (await navigateur('admin/consommation')).json();
    const aujourdhui = jour(0);
    const p = PLAFONDS_DEFAUT as Plafonds;
    // Le meme calcul, fait par le serveur Node : les deux serveurs rendent la meme reponse.
    expect(d).toEqual({
      format: 'plan-claude-consommation', du: jour(29), au: aujourdhui, aujourdhui,
      filtres: { organisation: null, modele: null, usage: null, parcelle: null },
      lignes: filtrerConsommation(lignes, { du: jour(29), au: aujourdhui }),
      recents: filtrerConsommation(lignes, { du: jour(6), au: aujourdhui }),
      organisations: etatOrganisations(lignes.filter((l) => l.t.startsWith(aujourdhui.slice(0, 7))), p, aujourdhui),
      choix: choixConsommation(lignes.filter((l) => l.t.slice(0, 7) >= jour(29).slice(0, 7)), p)
    });
    expect(d.lignes).toHaveLength(3);
    const f = await (await navigateur('admin/consommation?du=' + jour(29) + '&au=' + aujourdhui + '&parcelle=78650000AE0102')).json();
    expect(f.lignes.map((l: { idu: string }) => l.idu)).toEqual(['78650000AE0102']);
    expect((await navigateur('admin/consommation?du=2026-02-30')).status).toBe(400);
    expect((await ecrire('admin/consommation', 'PUT', {})).status).toBe(405);
  });
});
