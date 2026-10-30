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
// La lecture du reglement du PLU (usage `plu`, lot L4) part sur un extrait PUBLIC de trois pages du reglement de Chatou, zone UL
// (tests/fixtures/plu/chatou-ul-extrait.pdf, un document d'urbanisme publie au Geoportail de l'urbanisme), en bloc `document` ; le
// script dit en plus si sa sortie a la forme du schema et ce qu'elle a releve (attendu : l'emprise de 30 % et la hauteur de 10 m du
// secteur ULp, chatou-ul-extrait.json).
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
const IMAGE_JARDIN = path.join(racine, 'tests/fixtures/jardin-ia/jardin-test.jpg');
const PDF_PLU = path.join(racine, 'tests/fixtures/plu/chatou-ul-extrait.pdf');
const MOT_DE_PASSE = 'verification-api-claude';
const PLAFOND_DEFAUT = 0.05;
const PLAFOND_MAX = 2;
const URL_LOCALE = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;

// Les usages et la famille de prompt et de schema de chacun (deploy/analyse.php, FICHIERS_PAR_USAGE) :
// le run d'une facade a les siens, tous les autres lisent ceux de l'analyse d'une maison. Le rejeu passe par un
// batch (l'appel immediat le refuse) ; le corps de chaque requete est pourtant le meme
// (`parametresRequete`), si bien que la requete de sa famille et de son modele le couvre.
//
// L'escalade n'a pas de prompt a elle (lot F3, `verifierDemande`) : une demande `escalade` garde le prompt et le schema de
// la requete escaladee et prend le modele de l'escalade (Sonnet par defaut depuis le 29 octobre 2026). Elle part donc comme
// la page l'envoie (`envoyerEscalade`) : une demande `escalade` dont la requete porte l'usage `facade`. C'est la seule qui
// demande la sortie structuree, compilee par l'API pour ce modele-la, donc la seule dont l'acceptation depend du modele ;
// l'escalade d'une maison envoie le corps de l'analyse (schema dans le prompt) avec ce meme modele, couvert par les deux.
// Une seule requete du modele fin, pour tenir sous le plafond par defaut : une analyse d'une maison au tarif de Sonnet
// (prompt et schema en ecriture du cache) en couterait a elle seule pres de la moitie.
//
// La lecture du jardin (usage `jardin`, lot L3) a ses fichiers et part sur une orthophoto de SYNTHESE du depot
// (tests/fixtures/jardin-ia/jardin-test.jpg, dessinee par dessiner.py : aucune photo reelle) ; le script dit si sa sortie a la forme du
// schema (objets, points, genre d'arbre). Une requete au modele rapide, quelques dixiemes de centime : sous le plafond par defaut.
// La lecture enrichie d'une facade (usage `facade-enrichie`, lot L1) a ses fichiers et part sur la meme image que le run : le script dit
// si sa sortie a la forme de son schema (baies, saillies, modenature…).
// Le toit lu sur une facade (usage `facade-toit`, lot L2) a ses fichiers et part sur la meme image : le script dit si sa sortie a la forme
// de son schema (toit, elements).
// La redaction d'un texte du dossier (usage `texte`, lot L5) a ses fichiers et part sur des faits de projet INVENTES (FAITS_TEXTE : ni
// adresse ni personne reelles), en texte seul ; le script dit si sa sortie a la forme du schema (un texte, des reserves).
const LECTURES_FACADE = ['facade-enrichie', 'facade-toit'];
const FAMILLE = (usage) => (usage === 'facade' || usage === 'escalade' ? 'facade' : LECTURES_FACADE.includes(usage) ? usage : usage === 'plu' ? 'plu' : usage === 'jardin' ? 'jardin' : usage === 'texte' ? 'texte' : 'analyse');
/** Les faits d'un projet invente, comme export/faitsDossier.ts les ecrit : une pergola dans une zone UZ inventee. */
const FAITS_TEXTE = JSON.stringify({
  terrain: { adresse: '1 rue de l’Exemple 99999 Commune-Inventée', commune: 'Commune-Inventée', references: ['000 ZZ 1'], superficieM2: 600 },
  ouvrages: [{ nom: 'Pergola 1', nature: 'pergola', description: 'une pergola en bois de 4,00 x 3,00 m, emprise au sol 12,0 m², hauteur 2,62 m, toit chevrons et toile tendue, adossé(e) à la maison', empriseM2: 12, hauteurM: 2.62 }],
  existant: [{ nom: 'Maison', nature: 'bâtiment', hauteurM: 8.4, couverture: 'tuile' }],
  cloture: { type: 'Haie', hauteurM: 1.8 },
  plu: { zone: 'UZ', regles: [{ regle: 'Hauteur maximale des annexes', valeur: '3,5 m', article: 'UZ 10.3', condition: '' }] },
  protections: [],
}, null, 2);

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
  if (famille === 'plu') {
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(PDF_PLU).toString('base64') } },
      { type: 'text', text: 'Commune : Chatou (INSEE 78146).\nDocument d’urbanisme : 78146_PLU_20181003.\nZone demandée : ULp (« ULp : Secteur urbain »).\nL’extrait envoyé va de la page 47 à la page 49 du document entier (252 pages) : sa première page est la page 47.' }];
  }
  if (famille === 'facade' || LECTURES_FACADE.includes(famille)) {
    return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      { type: 'text', text: 'Façade : scène de synthèse du banc (image de test de la vérification de l’API).\nL’image est l’assemblage des photos redressées du mur.\nLe plan attend une pointe de pignon : u 0.4, à environ 1.8 fois l’égout.' }];
  }
  if (famille === 'texte') return [{ type: 'text', text: 'Pièce demandée : notice.\n\nFaits du projet (JSON) :\n' + FAITS_TEXTE }];
  if (famille === 'jardin') {
    return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      { type: 'text', text: 'Image 1 : orthophoto de synthèse d’un jardin (image de test de la vérification de l’API), 30 m de côté, nord en haut ; contour de la parcelle en jaune, maison en blanc.\nLe plan ne contient encore rien dans le jardin.' }];
  }
  const texte = 'Image 1 : vue de la maison depuis la rue, prise à 12 m, vers 245° (image de test de la vérification de l’API).';
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
  // envoient le meme corps a l'API. L'escalade seule sur son modele part en dernier (le plus cher, apres les autres).
  const groupes = new Map();
  for (const usage of etat.corps.usages) {
    if (usage === 'immediat') continue; // un usage de journal, sans demande a lui
    const modele = options.modele ?? etat.corps.modelesParUsage[usage];
    const k = FAMILLE(usage) + ' ' + modele;
    if (!groupes.has(k)) groupes.set(k, { famille: FAMILLE(usage), modele, usages: [] });
    groupes.get(k).usages.push(usage);
  }
  // La demande d'un groupe : celle de son usage s'il en a un a lui, sinon celle de l'escalade (sa requete gardant sa famille).
  const demandeDe = (g) => (g.usages.includes(g.famille) ? g.famille : 'escalade');
  const aEnvoyer = [...groupes.values()].sort((a, b) => Number(demandeDe(a) === 'escalade') - Number(demandeDe(b) === 'escalade'));
  const image = fs.readFileSync(IMAGE).toString('base64');
  const imageFacade = fs.readFileSync(IMAGE_FACADE).toString('base64');
  const imageJardin = fs.readFileSync(IMAGE_JARDIN).toString('base64');
  console.log('Vérification de l’API Claude par le serveur PHP du dépôt' + (urlLocale ? ' (faux Anthropic local : ' + urlLocale + ')' : '') + '.');
  console.log('Prompt et schéma : analyse v' + etat.corps.prompt + '/v' + etat.corps.schema + ', run d’une façade v' + (etat.corps.facade?.prompt ?? '?') + '/v' + (etat.corps.facade?.schema ?? '?') + ', façade enrichie v' + (etat.corps.facadeEnrichie?.prompt ?? '?') + '/v' + (etat.corps.facadeEnrichie?.schema ?? '?')
    + ', toit d’une façade v' + (etat.corps.facadeToit?.prompt ?? '?') + '/v' + (etat.corps.facadeToit?.schema ?? '?')
    + ', lecture du PLU v' + (etat.corps.plu?.prompt ?? '?') + '/v' + (etat.corps.plu?.schema ?? '?') + ', jardin v' + (etat.corps.jardin?.prompt ?? '?') + '/v' + (etat.corps.jardin?.schema ?? '?')
    + ', texte du dossier v' + (etat.corps.texte?.prompt ?? '?') + '/v' + (etat.corps.texte?.schema ?? '?') + ' ; plafond ' + options.plafond + ' $.');

  let n = 0;
  for (const g of aEnvoyer) {
    n++;
    const id = 'verif' + n;
    const usage = demandeDe(g);
    // L'escalade part sans `modele` : le serveur prend lui-meme celui de l'usage `escalade` (le reglage de l'administrateur, sinon
    // le defaut), comme pour la page ; `--modele` l'impose a toutes.
    const demande = { projet: 'verification-api', idu: null, adresse: 'vérification de l’API Claude', audit: null, usage, ...(usage === 'escalade' && !options.modele ? {} : { modele: g.modele }),
      requetes: [{ id, passe: 1, facades: usage === 'escalade' || g.famille === 'plu' || g.famille === 'jardin' || g.famille === 'texte' || LECTURES_FACADE.includes(g.famille) ? 0 : 1, usage: g.famille, contenu: contenu(g.famille, g.famille === 'facade' || LECTURES_FACADE.includes(g.famille) ? imageFacade : g.famille === 'jardin' ? imageJardin : image) }] };
    process.stdout.write('- ' + (usage === 'escalade' ? 'escalade d’une façade' : g.famille) + ' (' + g.modele + ' ; couvre ' + g.usages.join(', ') + ') : ');
    const r = await ecrire('admin/claude/messages', demande);
    const x = r.corps?.resultats?.[0];
    if (r.statut !== 200 || !x) {
      console.log('REFUSÉ');
      arreter('le serveur a répondu HTTP ' + r.statut + ' : ' + (r.corps?.error?.message ?? JSON.stringify(r.corps))
        + (r.statut === 429 ? '\n(plafond atteint : relancez avec --plafond <dollars>)' : ''), 1);
    }
    if (x.statut !== 'reussi' || x.erreur || x.sortie === null || typeof x.sortie !== 'object') {
      console.log('REFUSÉ');
      // La mesure x1 contre x3 (--facades) ne part pas apres un refus : ses 88 requetes partent du meme prompt et du meme schema,
      // et un refus ici les predit ; ce qui suit suffit a corriger avant de la relancer.
      arreter(diagnostic(x), 1);
    }
    const ligne = journal(dossierClaude).find((l) => l.requete === id);
    const t = x.tokens ?? {};
    if (g.famille === 'facade') {
      const defaut = formeFacade(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie du run d’une façade n’a pas la forme du schéma : ' + defaut, 1); }
    }
    if (g.famille === 'facade-enrichie') {
      const defaut = formeEnrichie(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie de la lecture enrichie d’une façade n’a pas la forme du schéma : ' + defaut, 1); }
    }
    if (g.famille === 'facade-toit') {
      const defaut = formeToit(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie du toit lu sur une façade n’a pas la forme du schéma : ' + defaut, 1); }
    }
    if (g.famille === 'plu') {
      const defaut = formePlu(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie de la lecture du PLU n’a pas la forme du schéma : ' + defaut, 1); }
    }
    if (g.famille === 'jardin') {
      const defaut = formeJardin(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie de la lecture du jardin n’a pas la forme du schéma : ' + defaut, 1); }
    }
    if (g.famille === 'texte') {
      const defaut = formeTexte(x.sortie);
      if (defaut) { console.log('NON CONFORME'); arreter('la sortie de la rédaction d’un texte n’a pas la forme du schéma : ' + defaut, 1); }
    }
    const resume = g.famille === 'texte' ? ' ; ' + resumeTexte(x.sortie) : g.famille === 'facade' ? ' ; ' + resumeFacade(x.sortie) : g.famille === 'facade-enrichie' ? ' ; ' + resumeEnrichie(x.sortie) : g.famille === 'facade-toit' ? ' ; ' + resumeToit(x.sortie) : g.famille === 'plu' ? ' ; ' + resumePlu(x.sortie) : g.famille === 'jardin' ? ' ; ' + resumeJardin(x.sortie) : '';
    console.log('accepté, sortie conforme (' + Object.keys(x.sortie).length + ' champs' + resume + structure(x) + ') ; tokens entrée ' + (t.entree ?? 0) + ', cache écrit ' + (t.ecritureCache ?? 0)
      + ', cache lu ' + (t.lectureCache ?? 0) + ', sortie ' + (t.sortie ?? 0) + ' ; coût journalisé ' + dollars(ligne?.cout));
  }
  if (options.facades) await mesurerFacades(options.facades, ecrire, options.modele);
  const total = journal(dossierClaude).reduce((s, l) => s + (typeof l.cout === 'number' ? l.cout : 0), 0);
  console.log('Toutes les requêtes ont été acceptées (' + n + '). Coût total journalisé : ' + dollars(total) + '.');
  return 0;
}

/**
 * Ce qui dit pourquoi une requete n'a pas ete lue : le statut, l'arret, l'erreur, les tokens de sortie, si la sortie structuree
 * etait demandee, et le debut du texte que le modele a ecrit (rendu par le serveur pour une sortie illisible ; ni cle ni en-tete).
 */
function diagnostic(x) {
  const e = x.erreur ?? {};
  return 'statut « ' + x.statut + ' », arrêt « ' + (x.arret ?? '-') + ' », tokens de sortie ' + (x.tokens?.sortie ?? '?')
    + (typeof x.structuree === 'boolean' ? ', sortie structurée ' + (x.structuree ? 'demandée' : x.refusFormat ? 'refusée par l’API (« ' + x.refusFormat + ' »), repli sans elle' : 'non demandée') : '') + '.\n'
    + 'Anthropic : ' + (e.type ?? '?') + ' : ' + (e.message ?? '(aucun message)')
    + (typeof e.apercu === 'string' ? '\nDébut du texte rendu (' + e.apercu.length + ' caractères au plus 400) :\n' + e.apercu : '');
}

/** Ce qui manque a une sortie de la lecture enrichie pour avoir la forme du schema (deploy/schema-facade-enrichie.json) ; null si rien. */
function formeEnrichie(s) {
  const objet = (v) => v && typeof v === 'object' && !Array.isArray(v);
  for (const k of ['baies', 'saillies', 'decroches', 'appendices', 'etat']) if (!Array.isArray(s[k])) return k + ' absent';
  if (!objet(s.modenature)) return 'modenature absente';
  if (s.baies.some((b) => !objet(b) || ![b.u0, b.u1, b.v0, b.v1].every((x) => typeof x === 'number'))) return 'une baie sans boîte';
  return null;
}

/** La sortie de la lecture enrichie en quelques mots : les baies decrites, et ce qu'elle voit d'autre. */
function resumeEnrichie(s) {
  const couleurs = s.baies.filter((b) => typeof b.couleurMenuiserie === 'string' && b.couleurMenuiserie !== 'indetermine').length;
  return s.baies.length + ' baie(s) dont ' + couleurs + ' à la menuiserie colorée, ' + s.saillies.length + ' saillie(s), ' + s.appendices.length + ' appendice(s), égout ' + (s.modenature.egout ?? '?');
}

/** Ce qui manque a une sortie du toit lu sur une facade pour avoir la forme du schema (deploy/schema-facade-toit.json) ; null si rien. */
function formeToit(s) {
  if (!s.toit || typeof s.toit !== 'object' || Array.isArray(s.toit)) return 'toit absent';
  for (const k of ['couverture', 'pose', 'debord', 'faitage', 'gouttiere']) if (typeof s.toit[k] !== 'string') return 'toit.' + k + ' absent';
  if (!Array.isArray(s.elements)) return 'elements absent';
  if (s.elements.some((e) => !e || typeof e !== 'object' || ![e.u0, e.u1, e.v].every((x) => typeof x === 'number'))) return 'un élément sans place';
  return null;
}

/** La sortie du toit lu en quelques mots : la couverture et sa pose, le faitage, la gouttiere, les elements du pan. */
function resumeToit(s) {
  return 'couverture ' + s.toit.couverture + ' (' + s.toit.pose + '), débord ' + s.toit.debord + ', faîtage ' + s.toit.faitage + ', gouttière ' + s.toit.gouttiere + ', ' + s.elements.length + ' élément(s) du pan';
}

/** Ce que la requete a fait de la sortie structuree, pour la ligne d'une requete acceptee. */
function structure(x) {
  if (x.structuree) return ' ; sortie structurée';
  return x.refusFormat ? ' ; sortie structurée refusée par l’API (« ' + x.refusFormat + ' »), lue sans elle' : '';
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

/** Ce qui manque a une sortie de la lecture du jardin pour avoir la forme du schema (deploy/schema-jardin.json) ; null si rien. */
function formeJardin(s) {
  const objet = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!Array.isArray(s.objets)) return 'objets absent';
  for (const o of s.objets) {
    if (!objet(o) || typeof o.genre !== 'string') return 'un objet sans genre';
    if (!Array.isArray(o.points) || !o.points.length || o.points.some((p) => !objet(p) || typeof p.x !== 'number' || typeof p.y !== 'number')) return 'un objet sans points (x, y)';
    if (o.points.some((p) => p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05)) return 'un point hors de l’image : des pixels ou des mètres au lieu de parts ?';
    if (!objet(o.arbre) || typeof o.arbre.genre !== 'string') return 'un objet sans bloc arbre';
  }
  return null;
}

/** La sortie de la lecture du jardin en quelques mots : combien d'objets de chaque genre. */
function resumeJardin(s) {
  const n = new Map();
  for (const o of s.objets) n.set(o.genre, (n.get(o.genre) ?? 0) + 1);
  return s.objets.length + ' objet(s)' + (n.size ? ' : ' + [...n].map(([g, k]) => k + ' ' + g).join(', ') : '');
}

/** Ce qui manque a une sortie de la redaction d'un texte pour avoir la forme du schema (deploy/schema-texte.json) ; null si rien. */
function formeTexte(s) {
  if (typeof s.texte !== 'string' || !s.texte.trim()) return 'texte absent ou vide';
  if (!Array.isArray(s.reserves) || s.reserves.some((r) => typeof r !== 'string')) return 'reserves absentes';
  return null;
}

/** La sortie de la redaction en quelques mots : la longueur du texte et ses reserves. */
function resumeTexte(s) {
  return s.texte.length + ' caractères, ' + s.reserves.length + ' réserve(s)';
}

/** Ce qui manque a une sortie de la lecture du PLU pour avoir la forme du schema (deploy/schema-plu.json) ; null si rien. */
function formePlu(s) {
  if (!s.zone || typeof s.zone !== 'object' || !Array.isArray(s.regles) || typeof s.remarques !== 'string') return 'zone, regles ou remarques absents';
  if (s.regles.some((r) => typeof r.grandeur !== 'string' || typeof r.article !== 'string' || typeof r.citation !== 'string' || !Array.isArray(r.termes))) return 'une règle sans grandeur, article, citation ou termes';
  return null;
}

/** La sortie de la lecture du PLU en quelques mots : la zone, et chaque regle relevee avec sa valeur et son article. */
function resumePlu(s) {
  const valeur = (r) => (typeof r.valeur === 'number' ? r.valeur + (r.unite === 'pourcent' ? ' %' : r.unite === 'm' ? ' m' : r.unite === 'degres' ? '°' : '') : '—');
  return 'zone ' + (s.zone.libelle || '?') + ' (' + s.zone.trouvee + '), ' + s.regles.length + ' règle(s) : '
    + (s.regles.map((r) => r.grandeur + ' ' + valeur(r) + ' [' + r.article + ']').join(', ') || 'aucune');
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
    // La lecture enrichie (lot L1) part aussi, trois passes sur la meme image : son cout s'ajoute a celui du run (le tableau le dit).
    // Le toit lu (lot L2) aussi, trois passes sur la meme image : son cout s'ajoute, sans rien changer aux deux autres.
    for (const [m, passes, usage] of [['x1', 1, 'facade'], ['x3', 3, 'facade'], ['enrichie', 3, 'facade-enrichie'], ['toit', 3, 'facade-toit']]) {
      const debut = Date.now();
      const r = await ecrire('admin/claude/messages', { projet: 'verification-api', idu: null, adresse: 'mesure x1 contre x3', audit: null, usage, ...(modele ? { modele } : {}),
        requetes: Array.from({ length: passes }, (_, i) => ({ id: nom.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) + '-' + m + '-p' + (i + 1), passe: i + 1, facades: i || usage !== 'facade' ? 0 : 1, usage, contenu: blocs })) });
      if (r.statut !== 200) arreter('mesure ' + nom + ' ' + m + ' : HTTP ' + r.statut + ' : ' + (r.corps?.error?.message ?? JSON.stringify(r.corps)) + (r.statut === 429 ? '\n(plafond atteint : relancez avec --plafond <dollars>)' : ''), 1);
      const res = r.corps.resultats ?? [];
      const somme = (k) => res.reduce((s, x) => s + (x.tokens?.[k] ?? 0), 0);
      // Les passes illisibles sont comptees a part (et leur debut de texte garde) : le tableau mesure la lecture de la facade, pas
      // celle du JSON.
      const ratees = res.filter((x) => !(x.statut === 'reussi' && x.sortie));
      sortie[m] = { modele: r.corps.modele, prompt: r.corps.prompt, schema: r.corps.schema, sorties: res.filter((x) => x.statut === 'reussi' && x.sortie).map((x) => x.sortie),
        passes, illisibles: ratees.length, structurees: res.filter((x) => x.structuree).length,
        refusFormat: res.find((x) => x.refusFormat)?.refusFormat ?? null,
        echecs: ratees.map((x) => ({ statut: x.statut, arret: x.arret ?? null, type: x.erreur?.type ?? null, message: x.erreur?.message ?? null, apercu: x.erreur?.apercu ?? null })),
        tokens: { entree: somme('entree') + somme('ecritureCache') + somme('lectureCache'), sortie: somme('sortie') },
        cout: res.every((x) => typeof x.cout === 'number') ? res.reduce((s, x) => s + x.cout, 0) : null, secondes: Math.round((Date.now() - debut) / 100) / 10 };
      console.log('- ' + nom + ' ' + m + ' : ' + sortie[m].sorties.length + '/' + passes + ' passe(s) lisible(s), sortie structurée ' + sortie[m].structurees + '/' + passes + ', ' + dollars(sortie[m].cout) + ', ' + sortie[m].secondes + ' s');
      const rate = res.find((x) => x.statut !== 'reussi' || !x.sortie);
      if (rate) console.log('  ' + diagnostic(rate).replace(/\n/g, '\n  '));
    }
    fs.writeFileSync(path.join(dossier, nom + '.reponses.json'), JSON.stringify(sortie));
  }
}

principal().then((code) => process.exit(code), (e) => arreter(e?.stack ?? String(e), 1));
