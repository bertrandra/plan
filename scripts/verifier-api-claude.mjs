// Verifie, contre la VRAIE API Claude, que les requetes du serveur PHP sont acceptees.
//
//   ANTHROPIC_API_KEY=… npm run verifier:api-claude
//   ANTHROPIC_API_KEY=… npm run verifier:api-claude -- --modele <id> [--plafond 0.10]
//
// Pourquoi : tous les tests passent par un faux Anthropic (tests/fixtures/deploy/fauxAnthropic.ts),
// qui accepte n'importe quel corps. Le refus « compiled grammar is too large » (15 octobre 2026) n'a
// donc ete vu qu'en production. Ce script ne reimplemente rien : il lance le vrai serveur du depot
// (deploy/analyse.php et deploy/admin.php, sous `php -S` derriere le routeur des tests), ouvre la
// session d'administrateur, et envoie par l'appel immediat (`POST admin/claude/messages`) une requete
// minimale par couple (prompt et schema, modele) que le serveur sert. Le serveur construit lui-meme
// le corps envoye a Anthropic, ramene la reponse au schema (`sortieConforme`) et journalise le cout.
//
// La cle se lit dans ANTHROPIC_API_KEY, jamais en argument : elle n'est ecrite que dans le fichier de
// configuration temporaire (droits 0600), supprime a la fin, et n'est jamais affichee. Le serveur
// lui-meme refuse au-dela du plafond pose dans le dossier temporaire (0,05 $ par jour par defaut).
//
// Le run d'une facade (usage `facade`, lot F2) part sur une image de synthese du depot (tests/fixtures/facades-ia/facade-test.jpg :
// l'assemblage d'une scene du banc, aucune photo personnelle) ; le script dit en plus si sa sortie a la forme du schema (calage,
// forme, surface, elements, ouvertures, carreaux). `--facades <dossier>` mesure x1 contre x3 : pour chaque image preparee par
// `.claude/skills/facades/scripts/ia-x1-x3.ts --preparer`, une passe puis trois, reponses et cout ecrits a cote (`<scene>.reponses.json`).
//
// VERIFIER_API_CLAUDE_URL_LOCALE (reserve aux tests) remplace l'API par un faux Anthropic, sur la
// boucle locale seulement : la cle ne part jamais vers une autre adresse que l'API ou la machine.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = path.join(racine, 'tests/fixtures/visuel/rue-compact-clair.jpg');
const IMAGE_FACADE = path.join(racine, 'tests/fixtures/facades-ia/facade-test.jpg');
const MOT_DE_PASSE = 'verification-api-claude';
const PLAFOND_DEFAUT = 0.05;
const PLAFOND_MAX = 2;
const URL_LOCALE = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;

// Les usages et la famille de prompt et de schema de chacun (deploy/analyse.php, FICHIERS_PAR_USAGE) :
// le renfort a les siens, tous les autres lisent ceux de l'analyse d'une maison. Le rejeu passe par un
// batch (l'appel immediat le refuse) ; le corps de chaque requete est pourtant le meme
// (`parametresRequete`), si bien que la requete de sa famille et de son modele le couvre.
const FAMILLE = (usage) => (usage === 'renfort' || usage === 'facade' ? usage : 'analyse');

function arreter(message, code = 2) {
  console.error('verifier-api-claude : ' + message);
  process.exit(code);
}

function lireOptions(argv) {
  const o = { modele: null, plafond: PLAFOND_DEFAUT, facades: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--modele') o.modele = argv[++i] ?? arreter('--modele demande un identifiant de modele.');
    else if (a === '--plafond') {
      const v = Number(argv[++i]);
      if (!(v > 0 && v <= PLAFOND_MAX)) arreter('--plafond demande un montant en dollars, entre 0 et ' + PLAFOND_MAX + '.');
      o.plafond = v;
    } else if (a === '--facades') {
      o.facades = argv[++i] ?? arreter('--facades demande le dossier préparé par ia-x1-x3.ts --preparer.');
      if (!fs.existsSync(o.facades)) arreter('--facades : dossier introuvable : ' + o.facades);
    } else if (a === '--aide' || a === '-h' || a === '--help') {
      console.log('usage : ANTHROPIC_API_KEY=… npm run verifier:api-claude [-- --modele <id>] [--plafond <dollars>] [--facades <dossier>]');
      process.exit(0);
    } else arreter('option inconnue : ' + a + ' (--modele <id>, --plafond <dollars>, --facades <dossier>).');
  }
  return o;
}

function portLibre() {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

/** Une ligne PHP `'cle' => valeur,` : la valeur en JSON, que PHP lit comme une chaine litterale. */
function lignePhp(cle, valeur) {
  // Une chaine JSON est une chaine PHP entre guillemets doubles valide, sauf `$` qui serait interpole.
  return '  ' + JSON.stringify(cle) + ' => ' + JSON.stringify(valeur).replace(/\$/g, '\\$') + ',';
}

function journal(dossierClaude) {
  if (!fs.existsSync(dossierClaude)) return [];
  return fs.readdirSync(dossierClaude).filter((n) => /^journal-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
    .flatMap((n) => fs.readFileSync(path.join(dossierClaude, n), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)));
}

const dollars = (v) => (typeof v === 'number' ? v.toFixed(5) + ' $' : 'inconnu (tarif absent)');

/** Le contenu minimal d'une requete : la photo de test et une ligne de contexte, comme la page. */
function contenu(famille, image) {
  if (famille === 'facade') {
    return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      { type: 'text', text: 'Façade : scène de synthèse du banc (image de test de la vérification de l’API).\nL’image est l’assemblage des photos redressées du mur.\nLe plan attend une pointe de pignon : u 0.4, à environ 1.8 fois l’égout.' }];
  }
  const texte = famille === 'renfort'
    ? 'Largeur du mur : 9,00 m. Image 1 : la façade sur rue (image de test de la vérification de l’API).'
    : 'Image 1 : vue de la maison depuis la rue, prise à 12 m, vers 245° (image de test de la vérification de l’API).';
  return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: texte }];
}

async function principal() {
  const options = lireOptions(process.argv.slice(2));
  const cle = process.env.ANTHROPIC_API_KEY ?? '';
  if (!cle.trim()) arreter('ANTHROPIC_API_KEY est absente. Posez la clé de l’API dans cette variable (jamais en argument), puis relancez.');
  const urlLocale = process.env.VERIFIER_API_CLAUDE_URL_LOCALE;
  if (urlLocale !== undefined && !URL_LOCALE.test(urlLocale)) arreter('VERIFIER_API_CLAUDE_URL_LOCALE n’admet qu’une adresse http de la boucle locale (tests).');
  if (spawnSync('php', ['-v']).status !== 0) arreter('PHP est introuvable (php -v).');
  if (!/^curl$/m.test(spawnSync('php', ['-m'], { encoding: 'utf8' }).stdout ?? '')) console.warn('verifier-api-claude : extension curl absente, le serveur appellera l’API sans elle (plus lent).');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-api-claude-'));
  let serveur = null;
  // A la sortie, quelle qu'elle soit (`arreter` compris) : le serveur s'arrete et le dossier
  // temporaire, qui porte la cle, disparait.
  process.on('exit', () => {
    if (serveur && serveur.exitCode === null) serveur.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));
  return verifier(tmp, cle, urlLocale, options, (p) => { serveur = p; });
}

async function verifier(tmp, cle, urlLocale, options, garderServeur) {
  const donnees = path.join(tmp, 'donnees');
  const dossierClaude = path.join(donnees, 'claude');
  const config = path.join(tmp, 'config.php');
  fs.mkdirSync(path.join(tmp, 'sessions'));
  fs.mkdirSync(dossierClaude, { recursive: true });
  // Le plafond, tenu par le serveur lui-meme (organisation `admin` de la session) : au-dela, 429.
  fs.writeFileSync(path.join(dossierClaude, 'plafonds.json'), JSON.stringify({
    format: 'plan-claude-plafonds', defaut: { jour: options.plafond, mois: options.plafond }, organisations: {}, requetesParBatch: 3, estimationRequete: 0.005
  }));
  const reglages = { motDePasse: MOT_DE_PASSE, dossierDemos: donnees, anthropicCle: cle, ...(urlLocale ? { anthropicUrl: urlLocale } : {}) };
  fs.writeFileSync(config, '<?php return [\n' + Object.entries(reglages).map(([k, v]) => lignePhp(k, v)).join('\n') + '\n];\n', { mode: 0o600 });

  const port = await portLibre();
  const base = 'http://127.0.0.1:' + port;
  const env = { ...process.env, ADMIN_PHP: path.join(racine, 'deploy/admin.php'), ANALYSE_PHP: path.join(racine, 'deploy/analyse.php'), PLAN_ADMIN_CONFIG: config };
  delete env.ANTHROPIC_API_KEY;
  const serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + port, path.join(racine, 'tests/fixtures/deploy/routeur-admin.php')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  garderServeur(serveur);
  let traces = '';
  serveur.stderr.on('data', (m) => { traces = (traces + m.toString()).slice(-4000); });
  let pret = false;
  for (let i = 0; i < 100 && !pret; i++) {
    try { await fetch(base + '/'); pret = true; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
  }
  if (!pret) arreter('le serveur PHP ne démarre pas.\n' + traces);

  let cookie = '';
  const appel = async (entree, init = {}) => {
    const entetes = new Headers(init.headers);
    if (cookie) entetes.set('Cookie', cookie);
    const r = await fetch(base + '/' + entree, { ...init, headers: entetes });
    const pose = r.headers.get('set-cookie');
    if (pose) cookie = pose.split(';')[0] ?? '';
    let corps = null;
    try { corps = await r.json(); } catch { /* corps vide ou illisible */ }
    return { statut: r.status, corps };
  };
  const ecrire = (entree, corps) => appel(entree, { method: 'POST', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

  const session = await ecrire('admin/session', { motDePasse: MOT_DE_PASSE });
  if (session.statut !== 200) arreter('session d’administrateur refusée (HTTP ' + session.statut + ') : ' + JSON.stringify(session.corps));
  const etat = await appel('admin/claude/etat');
  if (etat.statut !== 200 || !etat.corps?.actif) arreter('le serveur ne se dit pas prêt (HTTP ' + etat.statut + ') : ' + JSON.stringify(etat.corps));
  if (options.modele && !etat.corps.modeles.includes(options.modele)) arreter('modèle non admis par le serveur : ' + options.modele + ' (admis : ' + etat.corps.modeles.join(', ') + ').');

  // Une requete par couple (famille, modele) : les usages qui partagent prompt, schema et modele
  // envoient le meme corps a l'API.
  const groupes = new Map();
  for (const usage of etat.corps.usages) {
    if (usage === 'immediat') continue; // un usage de journal, sans demande a lui
    const modele = options.modele ?? etat.corps.modelesParUsage[usage];
    const k = FAMILLE(usage) + ' ' + modele;
    if (!groupes.has(k)) groupes.set(k, { famille: FAMILLE(usage), modele, usages: [] });
    groupes.get(k).usages.push(usage);
  }
  const image = fs.readFileSync(IMAGE).toString('base64');
  const imageFacade = fs.readFileSync(IMAGE_FACADE).toString('base64');
  console.log('Vérification de l’API Claude par le serveur PHP du dépôt' + (urlLocale ? ' (faux Anthropic local : ' + urlLocale + ')' : '') + '.');
  console.log('Prompt et schéma : analyse v' + etat.corps.prompt + '/v' + etat.corps.schema + ', renfort v' + (etat.corps.renfort?.prompt ?? '?') + '/v' + (etat.corps.renfort?.schema ?? '?') + ' ; plafond ' + options.plafond + ' $.');

  let n = 0;
  for (const g of groupes.values()) {
    n++;
    const id = 'verif' + n;
    const demande = { projet: 'verification-api', idu: null, adresse: 'vérification de l’API Claude', audit: null, usage: g.famille, modele: g.modele,
      requetes: [{ id, passe: 1, facades: 1, contenu: contenu(g.famille, g.famille === 'facade' ? imageFacade : image) }] };
    process.stdout.write('- ' + g.famille + ' (' + g.modele + ' ; couvre ' + g.usages.join(', ') + ') : ');
    const r = await ecrire('admin/claude/messages', demande);
    const x = r.corps?.resultats?.[0];
    if (r.statut !== 200 || !x) {
      console.log('REFUSÉ');
      arreter('le serveur a répondu HTTP ' + r.statut + ' : ' + (r.corps?.error?.message ?? JSON.stringify(r.corps))
        + (r.statut === 429 ? '\n(plafond atteint : relancez avec --plafond <dollars>)' : ''), 1);
    }
    if (x.statut !== 'reussi' || x.erreur || x.sortie === null || typeof x.sortie !== 'object') {
      console.log('REFUSÉ');
      const e = x.erreur ?? {};
      arreter('statut « ' + x.statut + ' », arrêt « ' + (x.arret ?? '-') + ' ».\nAnthropic : ' + (e.type ?? '?') + ' : ' + (e.message ?? '(aucun message)'), 1);
    }
    const ligne = journal(dossierClaude).find((l) => l.requete === id);
    const t = x.tokens ?? {};
    if (g.famille === 'facade') {
      const defaut = formeFacade(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie du run d’une façade n’a pas la forme du schéma : ' + defaut, 1); }
    }
    console.log('accepté, sortie conforme (' + Object.keys(x.sortie).length + ' champs' + (g.famille === 'facade' ? ' ; ' + resumeFacade(x.sortie) : '') + ') ; tokens entrée ' + (t.entree ?? 0) + ', cache écrit ' + (t.ecritureCache ?? 0)
      + ', cache lu ' + (t.lectureCache ?? 0) + ', sortie ' + (t.sortie ?? 0) + ' ; coût journalisé ' + dollars(ligne?.cout));
  }
  if (options.facades) await mesurerFacades(options.facades, ecrire, options.modele);
  const total = journal(dossierClaude).reduce((s, l) => s + (typeof l.cout === 'number' ? l.cout : 0), 0);
  console.log('Toutes les requêtes ont été acceptées (' + n + '). Coût total journalisé : ' + dollars(total) + '.');
  return 0;
}

/** Ce qui manque a une sortie du run d'une facade pour avoir la forme du schema (deploy/schema-facade.json) ; null si rien. */
function formeFacade(s) {
  const objet = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!objet(s.calage) || !objet(s.calage.angles)) return 'calage.angles absent';
  for (const k of ['pointes', 'appentis', 'corps', 'cache']) if (!Array.isArray(s.calage[k])) return 'calage.' + k + ' absent';
  if (!objet(s.forme) || !objet(s.surface) || !Array.isArray(s.surface.zones)) return 'forme ou surface absente';
  if (!Array.isArray(s.elements) || !Array.isArray(s.ouvertures)) return 'elements ou ouvertures absents';
  if (s.ouvertures.some((o) => !objet(o.details) || !objet(o.carreaux) || ![o.u0, o.u1, o.v0, o.v1].every((x) => typeof x === 'number'))) return 'une ouverture sans boîte, détails ou carreaux';
  return null;
}

/** La sortie du run d'une facade en quelques mots : ce qu'elle a vu. */
function resumeFacade(s) {
  const angles = ['gauche', 'droite'].filter((k) => s.calage.angles[k] && typeof s.calage.angles[k] === 'object').length;
  const carreaux = s.ouvertures.filter((o) => typeof o.carreaux.colonnes === 'number').length;
  return angles + ' angle(s), ' + s.calage.pointes.length + ' pointe(s), parement ' + s.surface.principale + ', ' + s.ouvertures.length + ' ouverture(s) dont ' + carreaux + ' aux carreaux lus';
}

/**
 * La mesure x1 contre x3 (MD/spec-facade-calage-audit.md §11.2) : pour chaque image du dossier (preparee par ia-x1-x3.ts --preparer),
 * une passe, puis trois, par l'appel immediat du serveur ; les sorties, les tokens et le cout de chaque mode dans <scene>.reponses.json.
 */
async function mesurerFacades(dossier, ecrire, modele) {
  const images = fs.readdirSync(dossier).filter((f) => f.endsWith('.png') && fs.existsSync(path.join(dossier, f.replace(/\.png$/, '.texte.txt')))).sort();
  console.log('Mesure x1 contre x3 sur ' + images.length + ' façades de synthèse (' + dossier + ').');
  for (const f of images) {
    const nom = f.replace(/\.png$/, '');
    const blocs = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(path.join(dossier, f)).toString('base64') } },
      { type: 'text', text: fs.readFileSync(path.join(dossier, nom + '.texte.txt'), 'utf8') }];
    const sortie = { source: 'claude' };
    for (const [m, passes] of [['x1', 1], ['x3', 3]]) {
      const debut = Date.now();
      const r = await ecrire('admin/claude/messages', { projet: 'verification-api', idu: null, adresse: 'mesure x1 contre x3', audit: null, usage: 'facade', ...(modele ? { modele } : {}),
        requetes: Array.from({ length: passes }, (_, i) => ({ id: nom.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) + '-' + m + '-p' + (i + 1), passe: i + 1, facades: i ? 0 : 1, contenu: blocs })) });
      if (r.statut !== 200) arreter('mesure ' + nom + ' ' + m + ' : HTTP ' + r.statut + ' : ' + (r.corps?.error?.message ?? JSON.stringify(r.corps)) + (r.statut === 429 ? '\n(plafond atteint : relancez avec --plafond <dollars>)' : ''), 1);
      const res = r.corps.resultats ?? [];
      const somme = (k) => res.reduce((s, x) => s + (x.tokens?.[k] ?? 0), 0);
      sortie[m] = { modele: r.corps.modele, prompt: r.corps.prompt, schema: r.corps.schema, sorties: res.filter((x) => x.statut === 'reussi' && x.sortie).map((x) => x.sortie),
        tokens: { entree: somme('entree') + somme('ecritureCache') + somme('lectureCache'), sortie: somme('sortie') },
        cout: res.every((x) => typeof x.cout === 'number') ? res.reduce((s, x) => s + x.cout, 0) : null, secondes: Math.round((Date.now() - debut) / 100) / 10 };
      console.log('- ' + nom + ' ' + m + ' : ' + sortie[m].sorties.length + '/' + passes + ' passe(s) lisible(s), ' + dollars(sortie[m].cout) + ', ' + sortie[m].secondes + ' s');
    }
    fs.writeFileSync(path.join(dossier, nom + '.reponses.json'), JSON.stringify(sortie));
  }
}

principal().then((code) => process.exit(code), (e) => arreter(e?.stack ?? String(e), 1));
