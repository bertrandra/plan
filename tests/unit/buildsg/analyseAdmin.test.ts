import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { creerAdminDemos } from '../../../buildsg/demosAdmin.mjs';
import {
  creerAnalyseAdmin, coutAppel, tarifEnVigueur, tokensDeUsage, depenses, lirePrompt, verifierDemande, verifierTarifs, passeGarde,
  verifierPlafonds, lireResultat, parametresRequete, sortieConforme, CONSIGNE_JSON, PLAFONDS_DEFAUT, MAX_TOKENS, lireFiltres, moisEntre, decalerJour, filtrerConsommation,
  etatOrganisations, choixConsommation, type Tarifs, type Plafonds
} from '../../../buildsg/analyseAdmin.mjs';
import { connecterAdmin } from '../../../src/io/depotDemos.js';
import { CLE, COUT_P1, COUT_P1_FIN, COUT_P2, COUT_P2_FIN, TEXTE_DESORDONNE, TROUVE_DEFAUT, USAGE_P1, USAGE_P2, demande, demarrerFauxAnthropic, reponseParDefaut, reussi, type FauxAnthropic } from '../../fixtures/deploy/fauxAnthropic.js';
import { JETON_LECTEUR, JETON_ORGA, ORGA, demarrerFauxePlateforme, type FauxPlateforme } from '../../fixtures/deploy/fauxPlateforme.js';

// L'analyse par Claude, cote serveur (MD/spec-audit.md 13.2 et 13.3) : le calcul du cout et du
// journal sur des reponses simulees, puis les routes contre une API Message Batches simulee.

const racine = path.resolve(__dirname, '../../..');
const deploy = path.join(racine, 'deploy');
const TARIFS = JSON.parse(fs.readFileSync(path.join(deploy, 'claude-tarifs.json'), 'utf8')) as Tarifs;
const SCHEMA = JSON.parse(fs.readFileSync(path.join(deploy, 'schema-analyse.json'), 'utf8')) as { version: number; schema: Record<string, unknown> };
const HAIKU = tarifEnVigueur(TARIFS, 'claude-haiku-5-5', '2026-10-14');

describe('le cout et le journal, sur des reponses simulees', () => {
  it('lit les compteurs de usage tels que l API les renvoie', () => {
    expect(tokensDeUsage(USAGE_P1)).toEqual({ entree: 4000, ecritureCache: 25000, ecritureCache1h: 0, lectureCache: 0, sortie: 1500 });
    expect(tokensDeUsage({ input_tokens: 10, cache_creation_input_tokens: 300, cache_creation: { ephemeral_1h_input_tokens: 100 } }).ecritureCache1h).toBe(100);
    expect(tokensDeUsage(null)).toEqual({ entree: 0, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 0 });
  });

  it('calcule le cout au tarif Batch de Claude Haiku 5.5, cache compris', () => {
    expect(coutAppel(tokensDeUsage(USAGE_P1), HAIKU, true)).toBe(COUT_P1);
    expect(coutAppel(tokensDeUsage(USAGE_P2), HAIKU, true)).toBe(COUT_P2);
    // Au tarif normal, le double ; l'estimation de la spec (une passe ~0,0014 $, cache chaud).
    expect(coutAppel(tokensDeUsage(USAGE_P2), HAIKU, false)).toBe(0.0014);
  });

  it('passe au palier au-dela de 100 000 tokens de prompt, cache compris', () => {
    const t = { entree: 80000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 30000, sortie: 1000 };
    // 80 000 x 0,50 + 30 000 x 0,05 + 1 000 x 2,50 = 44 000 micro-dollars, moitie en Batch.
    expect(coutAppel(t, HAIKU, true)).toBe(0.022);
    expect(coutAppel({ ...t, lectureCache: 20000 }, HAIKU, true)).toBe(0.00435);
  });

  it('prend l ecriture du cache a une heure a son propre tarif', () => {
    const t = { entree: 0, ecritureCache: 50000, ecritureCache1h: 20000, lectureCache: 0, sortie: 0 };
    // 30 000 x 0,125 + 20 000 x 0,20 = 7 750 micro-dollars.
    expect(coutAppel(t, HAIKU, false)).toBe(0.00775);
  });

  it('choisit la ligne de tarif en vigueur ce jour-la, sans reecrire le passe', () => {
    const t: Tarifs = { ...TARIFS, lignes: [...TARIFS.lignes, { ...TARIFS.lignes[0]!, depuis: '2027-01-01', sortie: 1 }] };
    expect(tarifEnVigueur(t, 'claude-haiku-5-5', '2026-12-31')?.sortie).toBe(0.5);
    expect(tarifEnVigueur(t, 'claude-haiku-5-5', '2027-01-01')?.sortie).toBe(1);
    expect(tarifEnVigueur(t, 'claude-haiku-5-5', '2026-01-01')).toBe(null);
    expect(coutAppel(tokensDeUsage(USAGE_P1), null, true)).toBe(null);
    expect(passeGarde(TARIFS, t, '2027-02-01')).toBe(true);
    expect(passeGarde(t, TARIFS, '2027-02-01')).toBe(false);
    expect(passeGarde(t, TARIFS, '2026-12-01')).toBe(true);
  });

  it('livre une table des tarifs valide, verifiee sur la page officielle', () => {
    expect(verifierTarifs(TARIFS)).toBe(TARIFS);
    for (const l of TARIFS.lignes) expect(l.source).toMatch(/^https:\/\/platform\.claude\.com\//);
    expect(() => verifierTarifs({ ...TARIFS, lignes: [{ ...TARIFS.lignes[0], entree: -1 }] })).toThrow();
  });

  it('additionne les depenses d une organisation par jour et par mois', () => {
    const lignes = [
      { t: '2026-10-14T10:00:00Z', organisation: 'admin', cout: COUT_P1 },
      { t: '2026-10-13T10:00:00Z', organisation: 'admin', cout: COUT_P2 },
      { t: '2026-10-14T11:00:00Z', organisation: 'autre', cout: 1 },
      { t: '2026-10-14T12:00:00Z', organisation: 'admin', cout: null }
    ];
    expect(depenses(lignes, 'admin', '2026-10-14')).toEqual({ jour: COUT_P1, mois: 0.0028375 });
  });

  it('lit une ligne de resultats : sortie, refus, coupure, erreur', () => {
    const ok = lireResultat(reussi('p1', USAGE_P1));
    expect(ok).toMatchObject({ id: 'p1', statut: 'reussi', arret: 'end_turn', erreur: null, sortie: { forme: { valeur: 'deux-pans' } } });
    const refus = reussi('p2', USAGE_P2) as { result: { message: { stop_reason: string } } };
    refus.result.message.stop_reason = 'refusal';
    expect(lireResultat(refus)).toMatchObject({ statut: 'reussi', arret: 'refusal', sortie: null, erreur: { type: 'refusal' } });
    expect(lireResultat(reponseParDefaut('x'))).toMatchObject({ statut: 'echoue', erreur: { type: 'overloaded_error' } });
    expect(lireResultat({ custom_id: 'y', result: { type: 'expired' } }).statut).toBe('expire');
  });
});

describe('le prompt, le schema et la demande', () => {
  it('versionne le prompt et le schema', () => {
    const p = lirePrompt(fs.readFileSync(path.join(deploy, 'prompt-analyse.md'), 'utf8'));
    expect(p.version).toBe(2);
    expect(p.texte).toMatch(/^# Rôle/);
    expect(p.texte).not.toMatch(/^version:/m);
    expect(SCHEMA.version).toBe(1);
  });

  it('respecte les limites de la sortie structuree : objets fermes, tous les champs requis', () => {
    const verifier = (n: unknown, ou: string): void => {
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties, ou).toBe(false);
        expect([...(o.required as string[])].sort(), ou).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const cle of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) expect(o[cle], ou + '.' + cle).toBeUndefined();
      for (const [k, v] of Object.entries(o)) verifier(v, ou + '.' + k);
    };
    verifier(SCHEMA.schema, 'schema');
    // Chaque terme du schema est defini dans le prompt : un mot hors liste n'a pas de sens pour Claude.
    const prompt = fs.readFileSync(path.join(deploy, 'prompt-analyse.md'), 'utf8');
    const formes = (SCHEMA.schema.properties as { forme: { properties: { valeur: { enum: string[] } } } }).forme.properties.valeur.enum;
    for (const f of formes.filter((x) => x !== 'indetermine')) expect(prompt, f).toContain('`' + f + '`');
    // Les facades (version 1) : chaque terme des details et du materiau aussi.
    const facade = (SCHEMA.schema.properties as { facades: { items: { properties: Record<string, { enum?: string[]; properties?: Record<string, { enum: string[] }> }> } } }).facades.items.properties;
    const termes = [...(facade.materiau!.enum ?? []), ...Object.values(facade.details!.properties ?? {}).flatMap((p) => p.enum ?? [])];
    for (const t of termes.filter((x) => !['indetermine', 'oui', 'non'].includes(x))) expect(prompt, t).toContain('`' + t + '`');
  });

  it('compte les facades de chaque requete, et refuse un compte hors bornes', () => {
    const d = verifierDemande(demande(), PLAFONDS_DEFAUT as Plafonds);
    expect(d.requetes.map((r) => r.facades)).toEqual([2, 2]);
    const sans = demande(['p1']) as { requetes: { facades?: number }[] };
    delete sans.requetes[0]!.facades;
    expect(verifierDemande(sans, PLAFONDS_DEFAUT as Plafonds).requetes[0]!.facades).toBe(0);
    expect(() => verifierDemande({ ...demande(['p1']), requetes: [{ ...(demande(['p1']) as { requetes: object[] }).requetes[0], facades: 201 }] }, PLAFONDS_DEFAUT as Plafonds)).toThrow(/façades/);
  });

  it('fixe le modele, le prompt en cache, l effort et la sortie, sans temperature', () => {
    const p = parametresRequete('claude-haiku-5-5', 'PROMPT', SCHEMA.schema, [{ type: 'text', text: 'x' }]);
    expect(p).toEqual({
      model: 'claude-haiku-5-5', max_tokens: MAX_TOKENS,
      // Le schema suit le prompt dans le meme bloc en cache : la sortie structuree en faisait une
      // grammaire que l'API refusait (« The compiled grammar is too large »).
      system: [{ type: 'text', text: 'PROMPT\n\n# Forme de la réponse\n\n' + CONSIGNE_JSON + '\n\n' + JSON.stringify(SCHEMA.schema), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
      output_config: { effort: 'low' }
    });
  });

  it('ramene une reponse ecrite sans sortie structuree a la forme du schema, sans rien inventer', () => {
    type Sortie = Record<string, unknown> & { facades: unknown[] };
    const s = sortieConforme(TEXTE_DESORDONNE, SCHEMA.schema) as Sortie;
    // Le texte autour et le bloc de code sont laisses ; la graphie des termes est celle du vocabulaire.
    expect(s.forme).toEqual({ indices: [{ image: 2, vu: 'pignon sur rue' }], valeur: 'deux-pans' });
    expect(s.bouts).toEqual({ indices: [], gauche: 'pignon', droite: 'indetermine' });
    expect(s.lucarnes).toEqual({ indices: [], nombre: 'indetermine', types: ['jacobine'], pan: 'indetermine' });
    // Un element hors vocabulaire n'est pas remplace par un autre : il est ecarte.
    expect(s.elements).toEqual([{ indices: [], element: 'verriere' }]);
    expect(s.facades[0]).toMatchObject({ facade: 'sud', ouvertures: { niveaux: 2, parNiveau: [3, 4], manquees: 'indetermine', enTrop: 'indetermine' }, materiau: 'meuliere', ecart: '' });
    expect(s.confiance).toBe('forte');
    expect(s).not.toHaveProperty('enTrop');
    expect(Object.keys(s)).toEqual(Object.keys((SCHEMA.schema as { properties: object }).properties));
    // Sans objet JSON, rien n'est lu ; sans confiance, la plus prudente.
    expect(sortieConforme('Je ne peux pas analyser ces images.', SCHEMA.schema)).toBeNull();
    expect(sortieConforme('[1, 2]', SCHEMA.schema)).toBeNull();
    expect((sortieConforme('{}', SCHEMA.schema) as Record<string, unknown>).confiance).toBe('faible');
  });

  it('n admet que des blocs texte et image, et des modeles connus', () => {
    const p = PLAFONDS_DEFAUT as Plafonds;
    const d = verifierDemande(demande(), p);
    // L'analyse part par defaut au modele plus fin : le modele rapide ne trouvait rien sur les photos.
    expect(d.modele).toBe('claude-sonnet-5-5');
    expect(d.requetes.map((r) => [r.id, r.passe, r.images])).toEqual([['p1', 1, 1], ['p2', 2, 1]]);
    expect(verifierDemande({ ...demande(), usage: 'escalade' }, p).modele).toBe('claude-sonnet-5-5');
    const avec = (r: object) => ({ ...demande(), requetes: [{ id: 'p1', passe: 1, contenu: [r] }] });
    expect(() => verifierDemande(avec({ type: 'document', source: {} }), p)).toThrow(/non admis/);
    expect(() => verifierDemande(avec({ type: 'image', source: { type: 'url', url: 'https://x' } }), p)).toThrow(/non admis/);
    expect(() => verifierDemande({ ...demande(), modele: 'claude-fable-5-1' }, p)).toThrow(/non admis/);
    expect(() => verifierDemande({ ...demande(), requetes: [{ id: '../x', contenu: [{ type: 'text', text: 'a' }] }] }, p)).toThrow(/Identifiant/);
    expect(() => verifierDemande({ ...demande(), requetes: Array.from({ length: 61 }, (_, i) => ({ id: 'r' + i, contenu: [{ type: 'text', text: 'a' }] })) }, p)).toThrow(/Trop de requêtes/);
    expect(() => verifierPlafonds({ ...PLAFONDS_DEFAUT, defaut: { jour: -1, mois: 1 } })).toThrow();
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
let maintenant = Date.parse('2026-10-14T09:00:00Z');

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

async function demarrer(cle: string | undefined): Promise<void> {
  const admin = creerAdminDemos({ dossier, motDePasse: MDP });
  const analyse = creerAnalyseAdmin({ dossier, actif: admin.actif, sessionValide: admin.sessionValide, cle, anthropicUrl: faux.url, plateformeUrl: plateforme.url, deploy, maintenant: () => maintenant });
  serveur = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    void (async () => {
      if (await analyse.traiter(req, res, url, {})) return;
      if (await admin.traiter(req, res, url, {})) return;
      res.writeHead(404); res.end('page');
    })();
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port; ok(); }));
}

describe('analyse par Claude, routes', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'analyse-'));
    cookie = '';
    maintenant = Date.parse('2026-10-14T09:00:00Z');
    faux = await demarrerFauxAnthropic(reponseParDefaut);
    plateforme = await demarrerFauxePlateforme();
  });
  afterEach(async () => {
    await new Promise((ok) => serveur.close(ok));
    await faux.fermer();
    await plateforme.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('exige la session admin, et l en-tete sur toute ecriture', async () => {
    await demarrer(CLE);
    expect((await navigateur('admin/claude/etat')).status).toBe(401);
    expect((await ecrire('admin/claude/batches', 'POST', demande())).status).toBe(401);
    expect(await connecterAdmin(navigateur, MDP)).toBe(null);
    expect((await navigateur('admin/claude/batches', { method: 'POST', body: JSON.stringify(demande()) })).status).toBe(403);
    const etat = await (await navigateur('admin/claude/etat')).json();
    expect(etat).toMatchObject({ actif: true, prompt: 2, schema: 1, effort: 'low', organisation: 'admin', admin: true });
    expect(faux.batches).toHaveLength(0);
  });

  it('ouvre l analyse a un utilisateur de la plateforme par son jeton, dans son organisation seulement', async () => {
    await demarrer(CLE);
    const porteur = (jeton: string) => ({ Authorization: 'Bearer ' + jeton });
    const utilisateur = (entree: string, init: RequestInit = {}) => navigateur(entree, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...porteur(JETON_ORGA) } });
    // Un jeton inconnu : la plateforme le refuse, nous aussi ; un lecteur seul ne lance rien.
    expect((await navigateur('admin/claude/etat', { headers: porteur('jeton-inconnu-de-la-plateforme') })).status).toBe(401);
    expect((await navigateur('admin/claude/etat', { headers: porteur(JETON_LECTEUR) })).status).toBe(403);
    expect(await (await utilisateur('admin/claude/etat')).json()).toMatchObject({ actif: true, organisation: ORGA, admin: false });
    // Tarifs, plafonds et consommation restent a l'administrateur.
    expect((await utilisateur('admin/claude/tarifs')).status).toBe(403);
    expect((await utilisateur('admin/claude/plafonds')).status).toBe(403);
    expect((await utilisateur('admin/consommation')).status).toBe(403);
    expect((await utilisateur('admin/claude/batches', { method: 'POST', body: JSON.stringify(demande()) })).status).toBe(403);

    const cree = await utilisateur('admin/claude/batches', { method: 'POST', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(demande()) });
    expect(cree.status).toBe(201);
    expect(plateforme.jetons.filter((j) => j === JETON_ORGA).length).toBeGreaterThan(0);
    expect(await (await utilisateur('admin/claude/batches/msgbatch_1')).json()).toMatchObject({ id: 'msgbatch_1' });
    faux.terminer();
    const lu = await (await utilisateur('admin/claude/batches/msgbatch_1/resultats')).json();
    expect(lu.resultats).toHaveLength(2);
    // Le journal porte l'organisation de la plateforme et les facades de chaque requete.
    expect(journal().find((l) => l.requete === 'p1')).toMatchObject({ organisation: ORGA, projet: 'projet-1', facades: 2, statut: 'reussi' });
    // L'administrateur voit ce batch ; un autre utilisateur ne le verrait pas (meme reponse qu'un batch inconnu).
    await connecterAdmin(navigateur, MDP);
    expect((await navigateur('admin/claude/batches/msgbatch_1')).status).toBe(200);
    const orgs = await (await navigateur('admin/consommation')).json();
    expect(orgs.organisations.map((o: { id: string }) => o.id).sort()).toEqual(['admin', ORGA].sort());
  });

  it('sans cle, dit pourquoi et n appelle rien', async () => {
    await demarrer(undefined);
    await connecterAdmin(navigateur, MDP);
    expect((await (await navigateur('admin/claude/etat')).json()).actif).toBe(false);
    const r = await ecrire('admin/claude/batches', 'POST', demande());
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe('NOT_CONFIGURED');
    expect(faux.entetes).toHaveLength(0);
  });

  it('cree le batch, suit son etat, lit ses resultats et les journalise une fois', async () => {
    await demarrer(CLE);
    await connecterAdmin(navigateur, MDP);
    const cree = await ecrire('admin/claude/batches', 'POST', demande());
    expect(cree.status).toBe(201);
    const { batch } = await cree.json();
    expect(batch).toMatchObject({ id: 'msgbatch_1', etat: 'in_progress' });

    // Ce qui part chez Anthropic : le prompt du serveur en cache, son schema, l'effort, la cle.
    const envoye = faux.batches[0]!.corps.requests;
    expect(envoye.map((r) => r.custom_id)).toEqual(['p1', 'p2']);
    expect(envoye[0]!.params).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: MAX_TOKENS, output_config: { effort: 'low' } });
    expect((envoye[0]!.params.system as { text: string; cache_control: unknown }[])[0]!.text).toMatch(/^# Rôle/);
    expect(envoye[0]!.params).not.toHaveProperty('temperature');
    expect(faux.entetes[0]!['x-api-key']).toBe(CLE);

    expect(await (await navigateur('admin/claude/batches/msgbatch_1')).json()).toMatchObject({ id: 'msgbatch_1', etat: 'in_progress' });
    expect((await navigateur('admin/claude/batches/msgbatch_1/resultats')).status).toBe(409);
    expect(journal()).toEqual([]);

    faux.terminer();
    const lu = await (await navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
    expect(lu.resultats.map((r: { id: string; passe: number; cout: number; statut: string }) => [r.id, r.passe, r.cout, r.statut]).sort()).toEqual([['p1', 1, COUT_P1_FIN, 'reussi'], ['p2', 2, COUT_P2_FIN, 'reussi']]);
    // La sortie revient dans la forme du schema : ce que la reponse ne dit pas est `indetermine` ou vide.
    expect(lu.resultats.find((r: { id: string }) => r.id === 'p1').sortie).toMatchObject({ forme: { indices: [], valeur: 'deux-pans' }, profil: { indices: [], valeur: 'indetermine' }, elements: [], confiance: 'faible' });

    const lignes = journal();
    expect(lignes).toHaveLength(2);
    expect(lignes.find((l) => l.requete === 'p1')).toEqual({
      t: '2026-10-14T10:00:00.000Z', organisation: 'admin', projet: 'projet-1', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet',
      audit: 'audit-1', usage: 'analyse', modele: 'claude-sonnet-5-5', batch: true, idBatch: 'msgbatch_1', requete: 'p1', passe: 1,
      tokens: { entree: 4000, ecritureCache: 25000, ecritureCache1h: 0, lectureCache: 0, sortie: 1500 }, images: 1, facades: 2, cout: COUT_P1_FIN,
      tarif: '2026-10-13', statut: 'reussi', arret: 'end_turn', prompt: 2, schema: 1, trouve: TROUVE_DEFAUT
    });
    // Ni photo ni contenu de reponse dans le journal.
    expect(JSON.stringify(lignes)).not.toMatch(/QUJDRA|deux-pans/);

    // Une seconde lecture rend les memes resultats, sans doubler le journal.
    expect((await navigateur('admin/claude/batches/msgbatch_1/resultats')).status).toBe(200);
    expect(journal()).toHaveLength(2);
  });

  it('ne lit que les batches crees ici', async () => {
    await demarrer(CLE);
    await connecterAdmin(navigateur, MDP);
    expect((await navigateur('admin/claude/batches/msgbatch_autre')).status).toBe(404);
    expect((await navigateur('admin/claude/batches/..%2Fx')).status).toBe(404);
    expect(faux.entetes).toHaveLength(0);
  });

  it('refuse au plafond, en comptant les batches encore ouverts, et le journalise', async () => {
    await demarrer(CLE);
    await connecterAdmin(navigateur, MDP);
    // Les montants de ce scenario sont ceux du modele rapide : il est regle pour l'analyse.
    expect((await ecrire('admin/claude/modeles', 'PUT', { format: 'plan-claude-modeles', usages: { analyse: 'claude-haiku-5-5' } })).status).toBe(200);
    expect((await ecrire('admin/claude/plafonds', 'PUT', { ...PLAFONDS_DEFAUT, defaut: { jour: 0.01, mois: 1 }, estimationRequete: 0.004 })).status).toBe(200);
    expect((await ecrire('admin/claude/batches', 'POST', demande())).status).toBe(201);
    // Deux requetes engagees, une demandee : 3 x 0,004 $ > 0,01 $.
    const refus = await ecrire('admin/claude/batches', 'POST', demande(['p1']));
    expect(refus.status).toBe(429);
    expect((await refus.json()).error.code).toBe('BUDGET_EXCEEDED');
    expect(faux.batches).toHaveLength(1);
    expect(journal()).toMatchObject([{ statut: 'plafond', cout: 0, images: 1, facades: 2, idBatch: null }]);

    // Le premier batch fini est journalise en passant : 0,0028 $ depenses + 0,004 $ estimes.
    maintenant = Date.parse('2026-10-14T11:00:00Z');
    faux.terminer();
    expect((await ecrire('admin/claude/batches', 'POST', demande(['p1']))).status).toBe(201);
    expect(journal().filter((l) => l.statut === 'reussi')).toHaveLength(2);
  });

  it('dit le refus d Anthropic, et le journalise', async () => {
    await demarrer(CLE);
    await connecterAdmin(navigateur, MDP);
    faux.statutCreation = 400;
    const r = await ecrire('admin/claude/batches', 'POST', demande());
    expect(r.status).toBe(502);
    expect((await r.json()).error.message).toMatch(/requete refusee/);
    expect(journal()).toMatchObject([{ statut: 'echoue', erreur: 'http-400', cout: 0 }]);
    expect((await ecrire('admin/claude/batches', 'POST', { ...demande(), usage: 'inconnu' })).status).toBe(400);
  });

  it('pose les tarifs livres au premier usage, et ne reecrit pas le passe', async () => {
    await demarrer(CLE);
    await connecterAdmin(navigateur, MDP);
    const f = path.join(dossier, 'claude', 'tarifs.json');
    expect(fs.existsSync(f)).toBe(false);
    const t = await (await navigateur('admin/claude/tarifs')).json();
    expect(t).toEqual(TARIFS);
    expect(fs.existsSync(f)).toBe(true);

    const reecrit = { ...TARIFS, lignes: [{ ...TARIFS.lignes[0]!, sortie: 0.4 }, TARIFS.lignes[1]!] };
    expect((await ecrire('admin/claude/tarifs', 'PUT', reecrit)).status).toBe(409);
    const ajoute = { ...TARIFS, lignes: [...TARIFS.lignes, { ...TARIFS.lignes[0]!, depuis: '2026-11-01', verifieLe: '2026-10-14', sortie: 0.4 }] };
    expect((await ecrire('admin/claude/tarifs', 'PUT', ajoute)).status).toBe(200);
    expect(fs.existsSync(f + '.bak')).toBe(true);
    expect((await (await navigateur('admin/claude/tarifs')).json()).lignes).toHaveLength(3);
    expect((await ecrire('admin/claude/plafonds', 'PUT', { format: 'plan-claude-plafonds' })).status).toBe(400);
    expect(await (await navigateur('admin/claude/plafonds')).json()).toEqual(PLAFONDS_DEFAUT);
  });
});

// --- Le tableau de bord de la consommation (13.3, lot L16 bis) ----------------------------------

/** Une ligne de journal comme analyse.php l'ecrit, avec ce qui varie d'un test a l'autre. */
const ligneJournal = (t: string, plus: Record<string, unknown> = {}) => ({
  t, organisation: 'admin', projet: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
  usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, idBatch: 'msgbatch_1', requete: 'p1', passe: 1,
  tokens: { entree: 4000, ecritureCache: 25000, ecritureCache1h: 0, lectureCache: 0, sortie: 1500 }, images: 1, cout: COUT_P1,
  tarif: '2026-10-13', statut: 'reussi', arret: 'end_turn', prompt: 0, schema: 0, ...plus
});

describe('la consommation : filtres et lignes', () => {
  it('lit les filtres, trente jours par defaut, et refuse ce qui est mal forme', () => {
    expect(lireFiltres(new URLSearchParams(''), '2026-10-14')).toEqual({ du: '2026-09-15', au: '2026-10-14', organisation: null, modele: null, usage: null, parcelle: null });
    expect(lireFiltres(new URLSearchParams('du=2026-10-01&au=2026-10-14&modele=claude-sonnet-5-5&parcelle=78650000AE0101&usage=escalade&organisation=org-1'), '2026-10-14'))
      .toEqual({ du: '2026-10-01', au: '2026-10-14', organisation: 'org-1', modele: 'claude-sonnet-5-5', usage: 'escalade', parcelle: '78650000AE0101' });
    expect(() => lireFiltres(new URLSearchParams('du=2026-10-15&au=2026-10-14'), '2026-10-14')).toThrow(/Période/);
    expect(() => lireFiltres(new URLSearchParams('du=2026-02-30'), '2026-10-14')).toThrow(/Période/);
    expect(() => lireFiltres(new URLSearchParams('du=2024-01-01&au=2026-10-14'), '2026-10-14')).toThrow(/trop longue/);
    expect(() => lireFiltres(new URLSearchParams('modele=gpt'), '2026-10-14')).toThrow(/modele/);
    expect(() => lireFiltres(new URLSearchParams('parcelle=../x'), '2026-10-14')).toThrow(/parcelle/);
    expect(moisEntre('2025-11-20', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(decalerJour('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('ne rend que les lignes de la periode et des filtres, reduites aux compteurs', () => {
    const lignes = [
      ligneJournal('2026-10-01T08:00:00Z'),
      ligneJournal('2026-10-02T08:00:00Z', { modele: 'claude-sonnet-5-5', usage: 'escalade' }),
      ligneJournal('2026-10-03T08:00:00Z', { idu: '78650000AE0102', organisation: 'org-1' }),
      ligneJournal('2026-09-30T23:59:59Z')
    ];
    const tout = filtrerConsommation(lignes, { du: '2026-10-01', au: '2026-10-14' });
    expect(tout).toHaveLength(3);
    expect(Object.keys(tout[0]!)).toEqual(['t', 'organisation', 'projet', 'idu', 'adresse', 'audit', 'usage', 'modele', 'batch', 'idBatch', 'passe', 'tokens', 'images', 'facades', 'cout', 'statut', 'trouve']);
    expect(filtrerConsommation(lignes, { du: '2026-10-01', au: '2026-10-14', modele: 'claude-sonnet-5-5' }).map((l) => l.usage)).toEqual(['escalade']);
    expect(filtrerConsommation(lignes, { du: '2026-10-01', au: '2026-10-14', parcelle: '78650000AE0102' }).map((l) => l.organisation)).toEqual(['org-1']);
    expect(filtrerConsommation(lignes, { du: '2026-10-01', au: '2026-10-14', organisation: 'org-1', usage: 'analyse' })).toHaveLength(1);
  });

  it('donne a chaque organisation ses depenses du jour et du mois face a ses plafonds', () => {
    const p = { ...PLAFONDS_DEFAUT, organisations: { 'org-1': { jour: 0.5, mois: 5 } } } as Plafonds;
    const lignes = [ligneJournal('2026-10-14T08:00:00Z'), ligneJournal('2026-10-02T08:00:00Z'), ligneJournal('2026-10-14T09:00:00Z', { organisation: 'org-2', cout: 0.01 })];
    expect(etatOrganisations(lignes, p, '2026-10-14')).toEqual([
      { id: 'admin', jour: COUT_P1, mois: 2 * COUT_P1, plafond: { jour: 1, mois: 10 } },
      { id: 'org-1', jour: 0, mois: 0, plafond: { jour: 0.5, mois: 5 } },
      { id: 'org-2', jour: 0.01, mois: 0.01, plafond: { jour: 1, mois: 10 } }
    ]);
    expect(choixConsommation(lignes, p)).toEqual({
      organisations: ['admin', 'org-1', 'org-2'], modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
      usages: ['analyse', 'escalade', 'renfort', 'immediat', 'candidats'], parcelles: [{ idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet' }]
    });
  });
});

describe('la consommation, route admin/consommation', () => {
  beforeEach(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'consommation-'));
    cookie = '';
    maintenant = Date.parse('2026-10-14T09:00:00Z');
    faux = await demarrerFauxAnthropic(reponseParDefaut);
    fs.mkdirSync(path.join(dossier, 'claude'), { recursive: true });
    const ecrireJournal = (mois: string, lignes: object[]) => fs.writeFileSync(path.join(dossier, 'claude', 'journal-' + mois + '.jsonl'), lignes.map((l) => JSON.stringify(l) + '\n').join(''));
    ecrireJournal('2026-09', [ligneJournal('2026-09-20T08:00:00Z', { cout: 0.02 }), ligneJournal('2026-09-01T08:00:00Z')]);
    ecrireJournal('2026-10', [ligneJournal('2026-10-10T08:00:00Z'), ligneJournal('2026-10-14T08:00:00Z', { modele: 'claude-sonnet-5-5', usage: 'escalade', cout: 0.004 })]);
  });
  afterEach(async () => {
    await new Promise((ok) => serveur.close(ok));
    await faux.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('exige la session admin, lit le journal sans cle, et ne s ecrit pas', async () => {
    await demarrer(undefined);
    expect((await navigateur('admin/consommation')).status).toBe(401);
    await connecterAdmin(navigateur, MDP);
    const r = await navigateur('admin/consommation');
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d).toMatchObject({ format: 'plan-claude-consommation', du: '2026-09-15', au: '2026-10-14', aujourdhui: '2026-10-14' });
    expect(d.lignes.map((l: { t: string }) => l.t)).toEqual(['2026-09-20T08:00:00Z', '2026-10-10T08:00:00Z', '2026-10-14T08:00:00Z']);
    // Les sept derniers jours, sans filtre : pour les alertes.
    expect(d.recents.map((l: { t: string }) => l.t)).toEqual(['2026-10-10T08:00:00Z', '2026-10-14T08:00:00Z']);
    expect(d.organisations).toEqual([{ id: 'admin', jour: 0.004, mois: 0.0061375, plafond: { jour: 1, mois: 10 } }]);
    expect(d.choix.parcelles).toEqual([{ idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet' }]);
    expect((await ecrire('admin/consommation', 'PUT', {})).status).toBe(405);
    expect(faux.entetes).toHaveLength(0);
  });

  it('applique les filtres, et refuse un filtre mal forme', async () => {
    await demarrer(CLE);
    await connecterAdmin(navigateur, MDP);
    const d = await (await navigateur('admin/consommation?du=2026-10-01&au=2026-10-14&modele=claude-sonnet-5-5')).json();
    expect(d.lignes).toHaveLength(1);
    expect(d.lignes[0]).toMatchObject({ usage: 'escalade', cout: 0.004 });
    expect(d.filtres).toEqual({ organisation: null, modele: 'claude-sonnet-5-5', usage: null, parcelle: null });
    const refus = await navigateur('admin/consommation?du=2026-10-14&au=2026-10-01');
    expect(refus.status).toBe(400);
    expect((await refus.json()).error.code).toBe('BAD_REQUEST');
  });
});
