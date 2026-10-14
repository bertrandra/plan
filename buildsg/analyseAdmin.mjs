// L'analyse par Claude, cote serveur (MD/spec-audit.md 13.2 et 13.3, plan D1) : le proxy de l'API
// Message Batches d'Anthropic, ses plafonds et son journal. Meme contrat que deploy/analyse.php,
// route pour route : la page ne sait pas lequel lui repond.
//
//   GET  admin/claude/etat                    cle configuree ou non, versions du prompt et du schema
//   POST admin/claude/batches                 cree un batch (une requete par passe) apres les plafonds
//   GET  admin/claude/batches/<id>            son etat, lu chez Anthropic
//   GET  admin/claude/batches/<id>/resultats  ses resultats ; le journal recoit une ligne par requete
//   POST admin/claude/messages                l'appel immediat (renfort du releve, trois passes au plus)
//   GET|PUT admin/claude/tarifs               la table des tarifs datee
//   GET|PUT admin/claude/plafonds             les plafonds par organisation, par jour et par mois
//   GET  admin/consommation                   le journal filtre, pour le tableau de bord (13.3, L16 bis)
//
// **La cle ne quitte jamais le serveur**, et la page ne choisit ni le prompt, ni le schema, ni le
// reglage : elle n'envoie que la partie propre a la maison (images et texte). Sans quoi la cle
// servirait a n'importe quoi a qui ouvre une session.
//
// Qui peut appeler (plan D1, lot L17) : la session admin (celle de demosAdmin.mjs), ou un
// utilisateur de la plateforme par son jeton (`Authorization: Bearer`), verifie aupres de la
// plateforme elle-meme (`GET /api/v1/me/context`, `plateformeUrl`) : son organisation (`tenant.id`)
// est celle du journal et des plafonds. Un utilisateur ne voit que `etat` et ses propres batches ;
// tarifs, plafonds et consommation restent a l'administrateur. En-tete `X-Plan-Admin: 1` sur toute
// ecriture. Les chiffres du journal viennent du champ `usage` des reponses, jamais d'une
// estimation, et le cout de la table des tarifs en vigueur le jour de l'appel. Le journal ne garde
// ni photo ni contenu de reponse.
//
// L'appel a l'API se fait en HTTP direct, comme analyse.php qui n'a pas de Composer sur
// l'hebergement : les deux serveurs restent sans dependance, et parlent le meme JSON.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));

export const VERSION_API = '2023-06-01';
/** Les modeles que la page peut demander, et celui de chaque usage (spec-regles-toits.md 14.2). */
export const MODELES = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
export const USAGES = ['analyse', 'escalade', 'renfort', 'immediat'];
const MODELE_PAR_USAGE = { analyse: 'claude-haiku-5-5', escalade: 'claude-sonnet-5-5', renfort: 'claude-haiku-5-5', immediat: 'claude-haiku-5-5' };
/**
 * Le prompt et le schema de chaque usage : le renfort du calage et de la detection (lot L18) a les
 * siens ; les autres usages lisent ceux de l'analyse d'une maison.
 */
export const FICHIERS_PAR_USAGE = Object.freeze({ renfort: ['prompt-renfort.md', 'schema-renfort.json'] });
const FICHIERS_DEFAUT = ['prompt-analyse.md', 'schema-analyse.json'];
/** Un appel immediat (bouton « Demander de l'aide » du releve) : les trois passes d'une facade, pas plus. */
export const REQUETES_IMMEDIATES = 3;
/** Assez pour la reflexion a l'effort `low` et le JSON avec indices (~1 500 attendus, 14.4). */
export const MAX_TOKENS = 8000;
export const EFFORT = 'low';
const TAILLE_MAX = 48 * 1024 * 1024;
const ID_VALIDE = /^[A-Za-z0-9_-]{1,64}$/;
const ID_BATCH = /^[A-Za-z0-9_-]{1,128}$/;
const IMAGES_PAR_REQUETE = 40;
/** Les facades qu'une requete couvre (journal, cout par facade du tableau de bord) : un compte, borne. */
const FACADES_MAX = 200;
const PRODUIT_PLATEFORME = 'plan';
const PERMISSION_ANALYSE = 'projects.write';
const BLOCS_PAR_REQUETE = 120;
const TEXTE_MAX = 200000;
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Ce qui vaut tant que l'administrateur n'a rien regle : un euro par jour, dix par mois, environ. */
export const PLAFONDS_DEFAUT = Object.freeze({
  format: 'plan-claude-plafonds',
  defaut: { jour: 1, mois: 10 },
  organisations: {},
  requetesParBatch: 60,
  estimationRequete: 0.005
});

const PRIX = ['entree', 'ecritureCache5m', 'ecritureCache1h', 'lectureCache', 'sortie'];

// --- Le calcul, pur ---------------------------------------------------------------------------

/** Le prompt versionne : l'en-tete `---` porte `version:`, le reste part tel quel en system. */
export function lirePrompt(texte) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(texte);
  if (!m) throw new Error('prompt-analyse.md : en-tete --- manquant');
  const v = /^version:\s*(\d+)\s*$/m.exec(m[1] ?? '');
  if (!v) throw new Error('prompt-analyse.md : version manquante');
  return { version: Number(v[1]), texte: texte.slice(m[0].length).trim() };
}

/** Les compteurs de `usage`, tels que l'API les renvoie, sous les noms du journal. */
export function tokensDeUsage(usage) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
  const ecriture = n(u.cache_creation_input_tokens);
  const detail = u.cache_creation && typeof u.cache_creation === 'object' ? u.cache_creation : null;
  return {
    entree: n(u.input_tokens),
    ecritureCache: ecriture,
    // Sans detail, toute l'ecriture est au tarif 5 minutes : c'est la duree par defaut du cache.
    ecritureCache1h: Math.min(ecriture, detail ? n(detail.ephemeral_1h_input_tokens) : 0),
    lectureCache: n(u.cache_read_input_tokens),
    sortie: n(u.output_tokens)
  };
}

/** La ligne de tarif d'un modele en vigueur ce jour-la (`AAAA-MM-JJ`) : la plus recente qui le precede. */
export function tarifEnVigueur(tarifs, modele, jour) {
  let retenu = null;
  for (const l of (tarifs && Array.isArray(tarifs.lignes)) ? tarifs.lignes : []) {
    if (!l || l.modele !== modele || typeof l.depuis !== 'string' || l.depuis > jour) continue;
    if (!retenu || l.depuis > retenu.depuis) retenu = l;
  }
  return retenu;
}

/**
 * Le cout d'un appel en dollars. Le palier « au-dela » s'applique a toute la requete des que son
 * prompt (entree, ecriture et lecture du cache) passe le seuil ; la remise Batch multiplie chaque
 * prix, cache compris. Arrondi a 1e-8 $ : assez fin pour une passe a 0,001 $, et le meme en PHP.
 */
export function coutAppel(tokens, ligne, batch) {
  if (!ligne) return null;
  const prompt = tokens.entree + tokens.ecritureCache + tokens.lectureCache;
  const p = ligne.auDela && Number.isFinite(ligne.auDela.seuil) && prompt > ligne.auDela.seuil ? ligne.auDela : ligne;
  const remise = batch && Number.isFinite(ligne.remiseBatch) ? ligne.remiseBatch : 1;
  const somme = tokens.entree * p.entree
    + (tokens.ecritureCache - tokens.ecritureCache1h) * p.ecritureCache5m
    + tokens.ecritureCache1h * p.ecritureCache1h
    + tokens.lectureCache * p.lectureCache
    + tokens.sortie * p.sortie;
  return Math.round((somme / 1e6) * remise * 1e8) / 1e8;
}

/** Les depenses d'une organisation ce jour-la et ce mois-la, lues dans les lignes du journal du mois. */
export function depenses(lignes, organisation, jour) {
  let j = 0;
  let m = 0;
  for (const l of lignes) {
    if (!l || l.organisation !== organisation || typeof l.cout !== 'number' || typeof l.t !== 'string') continue;
    if (l.t.slice(0, 7) !== jour.slice(0, 7)) continue;
    m += l.cout;
    if (l.t.slice(0, 10) === jour) j += l.cout;
  }
  return { jour: Math.round(j * 1e8) / 1e8, mois: Math.round(m * 1e8) / 1e8 };
}

/** Le plafond d'une organisation : le sien, sinon celui par defaut. */
export function plafondDe(plafonds, organisation) {
  const o = plafonds.organisations && plafonds.organisations[organisation];
  return { jour: o && Number.isFinite(o.jour) ? o.jour : plafonds.defaut.jour, mois: o && Number.isFinite(o.mois) ? o.mois : plafonds.defaut.mois };
}

const refus = (message) => Object.assign(new Error(message), { statut: 400 });
const texteCourt = (v, max) => (v === undefined || v === null ? null : typeof v === 'string' && v.length <= max ? v : undefined);

/**
 * La demande de la page : l'identite de la parcelle et les requetes, une par passe. Seuls des
 * blocs `text` et `image` (base64) sont admis : le reste de la requete est fixe par le serveur.
 */
export function verifierDemande(d, plafonds) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw refus('Demande illisible.');
  const meta = {};
  for (const [cle, max] of [['projet', 128], ['idu', 64], ['adresse', 300], ['audit', 64]]) {
    const v = texteCourt(d[cle], max);
    if (v === undefined) throw refus('Champ « ' + cle + ' » invalide.');
    meta[cle] = v;
  }
  const usage = d.usage === undefined ? 'analyse' : d.usage;
  if (!USAGES.includes(usage)) throw refus('Usage inconnu : ' + String(usage) + '.');
  const modele = d.modele === undefined ? MODELE_PAR_USAGE[usage] : d.modele;
  if (!MODELES.includes(modele)) throw refus('Modèle non admis : ' + String(modele) + '.');
  if (!Array.isArray(d.requetes) || d.requetes.length === 0) throw refus('Aucune requête.');
  if (d.requetes.length > plafonds.requetesParBatch) throw refus('Trop de requêtes dans un batch (' + plafonds.requetesParBatch + ' au plus).');
  const vus = new Set();
  const requetes = d.requetes.map((r) => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !ID_VALIDE.test(r.id)) throw refus('Identifiant de requête invalide.');
    if (vus.has(r.id)) throw refus('Identifiant de requête en double : ' + r.id + '.');
    vus.add(r.id);
    const passe = r.passe === undefined || r.passe === null ? null : r.passe;
    if (passe !== null && !(Number.isInteger(passe) && passe >= 1 && passe <= 3)) throw refus('Passe invalide (1, 2 ou 3).');
    if (!Array.isArray(r.contenu) || r.contenu.length === 0 || r.contenu.length > BLOCS_PAR_REQUETE) throw refus('Contenu de requête invalide.');
    let images = 0;
    const contenu = r.contenu.map((b) => {
      if (b && b.type === 'text' && typeof b.text === 'string' && b.text.length > 0 && b.text.length <= TEXTE_MAX) return { type: 'text', text: b.text };
      const s = b && b.type === 'image' ? b.source : null;
      if (s && s.type === 'base64' && TYPES_IMAGE.includes(s.media_type) && typeof s.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(s.data)) {
        images++;
        return { type: 'image', source: { type: 'base64', media_type: s.media_type, data: s.data } };
      }
      throw refus('Bloc de contenu non admis (texte ou image base64 seulement).');
    });
    if (images > IMAGES_PAR_REQUETE) throw refus('Trop d’images dans une requête (' + IMAGES_PAR_REQUETE + ' au plus).');
    const facades = r.facades === undefined ? 0 : r.facades;
    if (!Number.isInteger(facades) || facades < 0 || facades > FACADES_MAX) throw refus('Nombre de façades invalide.');
    // Une requete peut porter son usage (le renfort d'une facade dans le batch de l'analyse) : son
    // prompt, son schema et son modele sont alors les siens.
    const usageR = r.usage === undefined ? usage : r.usage;
    if (!USAGES.includes(usageR)) throw refus('Usage inconnu : ' + String(usageR) + '.');
    const modeleR = d.modele === undefined ? MODELE_PAR_USAGE[usageR] : modele;
    return { id: r.id, passe, images, facades, usage: usageR, modele: modeleR, contenu };
  });
  return { ...meta, usage, modele, requetes };
}

/** Les parametres d'une requete du batch : le prompt en cache, la sortie structuree, l'effort. */
export function parametresRequete(modele, prompt, schema, contenu) {
  return {
    model: modele,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: contenu }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema } }
  };
}

/** Une table des tarifs valide : `{format, lignes: [{modele, depuis, verifieLe, prix…}]}`. */
export function verifierTarifs(d) {
  const r = () => refus('Ce n’est pas une table des tarifs (format, lignes datées, prix positifs).');
  if (!d || d.format !== 'plan-claude-tarifs' || !Array.isArray(d.lignes)) throw r();
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const prix = (o) => PRIX.every((k) => Number.isFinite(o[k]) && o[k] >= 0);
  for (const l of d.lignes) {
    if (!l || typeof l.modele !== 'string' || !/^claude-[a-z0-9-]{1,60}$/.test(l.modele) || !date.test(String(l.depuis)) || !date.test(String(l.verifieLe))) throw r();
    if (!prix(l) || !(Number.isFinite(l.remiseBatch) && l.remiseBatch > 0 && l.remiseBatch <= 1)) throw r();
    if (l.auDela !== undefined && !(l.auDela && Number.isInteger(l.auDela.seuil) && l.auDela.seuil > 0 && prix(l.auDela))) throw r();
  }
  return d;
}

/** Les lignes passees ne se reecrivent pas : chacune doit revenir a l'identique. */
export function passeGarde(ancien, nouveau, jour) {
  const cle = (l) => l.modele + '@' + l.depuis;
  const signe = (l) => JSON.stringify([...PRIX.map((k) => l[k]), l.remiseBatch, l.auDela ? [l.auDela.seuil, ...PRIX.map((k) => l.auDela[k])] : null]);
  const nouvelles = new Map(nouveau.lignes.map((l) => [cle(l), signe(l)]));
  return ((ancien && ancien.lignes) || []).every((l) => !l || l.depuis > jour || nouvelles.get(cle(l)) === signe(l));
}

/** Des plafonds valides : montants positifs par jour et par mois, par defaut et par organisation. */
export function verifierPlafonds(d) {
  const r = () => refus('Ce ne sont pas des plafonds (format, montants par jour et par mois).');
  const paire = (o) => o && Number.isFinite(o.jour) && o.jour >= 0 && Number.isFinite(o.mois) && o.mois >= 0;
  if (!d || d.format !== 'plan-claude-plafonds' || !paire(d.defaut) || !d.organisations || typeof d.organisations !== 'object' || Array.isArray(d.organisations)) throw r();
  for (const [id, o] of Object.entries(d.organisations)) if (!ID_VALIDE.test(id) || !paire(o)) throw r();
  if (!(Number.isInteger(d.requetesParBatch) && d.requetesParBatch >= 1 && d.requetesParBatch <= 1000)) throw r();
  if (!(Number.isFinite(d.estimationRequete) && d.estimationRequete >= 0)) throw r();
  return d;
}

// --- Le tableau de bord de la consommation (13.3, lot L16 bis) ----------------------------------

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const MODELE_VALIDE = /^claude-[a-z0-9-]{1,60}$/;
const USAGE_VALIDE = /^[a-z]{1,20}$/;
/** Le journal est garde 24 mois : une periode n'en demande pas plus (25 fichiers mensuels au plus). */
export const MOIS_CONSULTABLES = 25;
/** Les champs d'une ligne que le tableau de bord lit : des compteurs et l'identite de la parcelle. */
const CHAMPS_CONSOMMATION = ['t', 'organisation', 'projet', 'idu', 'adresse', 'audit', 'usage', 'modele', 'batch', 'passe', 'tokens', 'images', 'facades', 'cout', 'statut'];

const jourMs = (j) => Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10)));
const jourValide = (j) => typeof j === 'string' && JOUR.test(j) && new Date(jourMs(j)).toISOString().slice(0, 10) === j;

/** Un jour (`AAAA-MM-JJ`) decale de `n` jours, en UTC. */
export function decalerJour(jour, n) {
  return new Date(jourMs(jour) + n * 86400000).toISOString().slice(0, 10);
}

/** Les mois (`AAAA-MM`) d'une periode, dans l'ordre : un fichier de journal par mois. */
export function moisEntre(du, au) {
  const mois = [];
  const fin = Number(au.slice(0, 4)) * 12 + Number(au.slice(5, 7)) - 1;
  for (let k = Number(du.slice(0, 4)) * 12 + Number(du.slice(5, 7)) - 1; k <= fin; k++) {
    mois.push(String(Math.floor(k / 12)) + '-' + String((k % 12) + 1).padStart(2, '0'));
  }
  return mois;
}

/**
 * Les filtres de `GET admin/consommation`, lus dans l'adresse : `du` et `au` (AAAA-MM-JJ, par defaut
 * les trente derniers jours), `organisation`, `modele`, `usage`, `parcelle` (un IDU). Un filtre mal
 * forme est refuse net : ignore en silence, il montrerait des chiffres faux.
 */
export function lireFiltres(params, aujourdhui) {
  const au = params.get('au') || aujourdhui;
  const du = params.get('du') || (jourValide(au) ? decalerJour(au, -29) : '');
  if (!jourValide(du) || !jourValide(au) || du > au) throw refus('Période invalide (du et au en AAAA-MM-JJ, du avant au).');
  if (moisEntre(du, au).length > MOIS_CONSULTABLES) throw refus('Période trop longue (le journal est gardé 24 mois).');
  const f = { du, au, organisation: null, modele: null, usage: null, parcelle: null };
  for (const [cle, motif] of [['organisation', ID_VALIDE], ['modele', MODELE_VALIDE], ['usage', USAGE_VALIDE], ['parcelle', ID_VALIDE]]) {
    const v = params.get(cle);
    if (v === null || v === '') continue;
    if (!motif.test(v)) throw refus('Filtre « ' + cle + ' » invalide.');
    f[cle] = v;
  }
  return f;
}

/** Les lignes de la periode qui passent les filtres, reduites aux champs du tableau de bord. */
export function filtrerConsommation(lignes, f) {
  return lignes.filter((l) => l && typeof l.t === 'string' && l.t.slice(0, 10) >= f.du && l.t.slice(0, 10) <= f.au
    && (!f.organisation || l.organisation === f.organisation) && (!f.modele || l.modele === f.modele)
    && (!f.usage || l.usage === f.usage) && (!f.parcelle || l.idu === f.parcelle))
    .map((l) => Object.fromEntries(CHAMPS_CONSOMMATION.map((k) => [k, l[k] === undefined ? null : l[k]])));
}

const chaines = (lignes, k) => lignes.map((l) => l && l[k]).filter((x) => typeof x === 'string' && x !== '');
const organisationsConnues = (lignes, p) => [...new Set(['admin', ...Object.keys(p.organisations || {}), ...chaines(lignes, 'organisation')])].sort();

/** Chaque organisation connue (plafonds ou journal du mois) : ses depenses du jour et du mois, ses plafonds. */
export function etatOrganisations(lignesDuMois, p, jour) {
  return organisationsConnues(lignesDuMois, p).map((id) => ({ id, ...depenses(lignesDuMois, id, jour), plafond: plafondDe(p, id) }));
}

/** De quoi remplir les listes des filtres : ce que la periode contient, avant filtre. */
export function choixConsommation(lignes, p) {
  const parcelles = new Map();
  for (const l of lignes) if (l && typeof l.idu === 'string' && l.idu && !parcelles.has(l.idu)) parcelles.set(l.idu, typeof l.adresse === 'string' ? l.adresse : null);
  return {
    organisations: organisationsConnues(lignes, p),
    modeles: [...new Set([...MODELES, ...chaines(lignes, 'modele')])],
    usages: [...new Set([...USAGES, ...chaines(lignes, 'usage')])],
    parcelles: [...parcelles].map(([idu, adresse]) => ({ idu, adresse })).sort((a, b) => (a.idu < b.idu ? -1 : a.idu > b.idu ? 1 : 0))
  };
}

const STATUT_RESULTAT ={ succeeded: 'reussi', errored: 'echoue', expired: 'expire', canceled: 'annule' };

/** Ce qu'une ligne de resultats d'Anthropic devient : pour la page, et pour le journal. */
export function lireResultat(ligne) {
  const r = ligne && ligne.result ? ligne.result : {};
  const statut = STATUT_RESULTAT[r.type] || 'echoue';
  const message = r.type === 'succeeded' && r.message ? r.message : null;
  const tokens = tokensDeUsage(message ? message.usage : null);
  let sortie = null;
  let erreur = null;
  if (message) {
    const bloc = (Array.isArray(message.content) ? message.content : []).find((b) => b && b.type === 'text');
    if (message.stop_reason === 'refusal') erreur = { type: 'refusal', message: 'Analyse refusée par le modèle.' };
    else if (message.stop_reason === 'max_tokens') erreur = { type: 'max_tokens', message: 'Réponse coupée (max_tokens).' };
    else {
      try { sortie = JSON.parse(bloc ? bloc.text : ''); } catch { erreur = { type: 'sortie_illisible', message: 'Sortie non JSON.' }; }
    }
  } else if (r.type === 'errored') {
    const e = r.error && r.error.error ? r.error.error : r.error || {};
    erreur = { type: String(e.type || 'erreur'), message: String(e.message || '').slice(0, 300) };
  }
  return { id: String(ligne && ligne.custom_id), statut, arret: message ? message.stop_reason ?? null : null, tokens, sortie, erreur };
}

// --- Le serveur -------------------------------------------------------------------------------

/**
 * @param {{
 *   dossier: string,              dossier des donnees de l'admin (celui des demos)
 *   actif: boolean,               l'admin existe (mot de passe configure)
 *   sessionValide: (req: import('node:http').IncomingMessage) => boolean,
 *   cle: string | undefined,      ANTHROPIC_API_KEY
 *   anthropicUrl?: string,        pour les tests
 *   plateformeUrl?: string,       l'origine de la plateforme, qui verifie les jetons des utilisateurs
 *   deploy?: string,              ou lire le prompt, le schema et les tarifs livres
 *   maintenant?: () => number
 * }} options
 */
export function creerAnalyseAdmin({ dossier, actif, sessionValide, cle, anthropicUrl = 'https://api.anthropic.com', plateformeUrl = 'https://www.raillard.org', deploy = path.join(ici, 'deploy'), maintenant = () => Date.now() }) {
  const dossierClaude = path.join(dossier, 'claude');
  const dossierBatches = path.join(dossierClaude, 'batches');
  const fTarifs = path.join(dossierClaude, 'tarifs.json');
  const fPlafonds = path.join(dossierClaude, 'plafonds.json');
  const avecCle = typeof cle === 'string' && cle.length > 0;

  const iso = () => new Date(maintenant()).toISOString();
  const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

  /** Ecriture atomique, version precedente gardee en `.bak` : jamais de demi-fichier. */
  function ecrireJson(f, d) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
    const tmp = f + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n');
    fs.renameSync(tmp, f);
  }

  /** La table des tarifs : la premiere lecture pose celle livree avec Plan. */
  function tarifs() {
    const t = lireJson(fTarifs);
    if (t) return t;
    const livree = JSON.parse(fs.readFileSync(path.join(deploy, 'claude-tarifs.json'), 'utf8'));
    ecrireJson(fTarifs, livree);
    return livree;
  }
  const plafonds = () => lireJson(fPlafonds) || PLAFONDS_DEFAUT;

  const fJournal = (t) => path.join(dossierClaude, 'journal-' + t.slice(0, 7) + '.jsonl');
  /** Une ligne par appel, ajoutee d'un seul trait : le journal ne se reecrit jamais. */
  function journaliser(lignes) {
    if (!lignes.length) return;
    fs.mkdirSync(dossierClaude, { recursive: true });
    const parFichier = new Map();
    for (const l of lignes) parFichier.set(fJournal(l.t), (parFichier.get(fJournal(l.t)) || '') + JSON.stringify(l) + '\n');
    for (const [f, texte] of parFichier) fs.appendFileSync(f, texte);
  }
  function lireJournal(t) {
    let texte = '';
    try { texte = fs.readFileSync(fJournal(t), 'utf8'); } catch { return []; }
    return texte.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  }

  function promptEtSchema(usage = 'analyse') {
    const [fPrompt, fSchema] = FICHIERS_PAR_USAGE[usage] || FICHIERS_DEFAUT;
    const prompt = lirePrompt(fs.readFileSync(path.join(deploy, fPrompt), 'utf8'));
    const s = JSON.parse(fs.readFileSync(path.join(deploy, fSchema), 'utf8'));
    return { prompt, schema: { version: s.version, schema: s.schema } };
  }
  /** Le prompt et le schema de chaque usage des requetes, lus une fois. */
  function promptsDesRequetes(requetes) {
    const par = {};
    for (const r of requetes) if (!par[r.usage]) par[r.usage] = promptEtSchema(r.usage);
    return par;
  }

  /**
   * L'appel immediat (le bouton « Demander de l'aide » du releve, spec facades 12 bis) : les memes
   * plafonds qu'un batch, l'API Messages au tarif normal (sans la remise Batch), en parallele, une
   * ligne de journal par requete, et la reponse au format des resultats d'un batch. Rend
   * `{refus: [statut, corps]}` au plafond.
   */
  async function appelImmediat(demande, organisation, admin) {
    const t = iso();
    const p = plafonds();
    const identite = { organisation, projet: demande.projet ?? (admin ? 'admin' : null), idu: demande.idu, adresse: demande.adresse, audit: demande.audit };
    const prompts = promptsDesRequetes(demande.requetes);
    const premier = demande.requetes[0];
    const p0 = prompts[premier.usage];
    const ouverts = await engagements(organisation);
    const fait = depenses(lireJournal(t), organisation, t.slice(0, 10));
    const engage = (ouverts + demande.requetes.length) * p.estimationRequete;
    const plafond = plafondDe(p, organisation);
    if (fait.jour + engage > plafond.jour || fait.mois + engage > plafond.mois) {
      journaliser([{ t, ...identite, usage: demande.usage, modele: premier.modele, batch: false, idBatch: null, requete: null, passe: null, tokens: tokensDeUsage(null),
        images: demande.requetes.reduce((s, r) => s + r.images, 0), facades: 0, cout: 0, tarif: null, statut: 'plafond', arret: null, prompt: p0.prompt.version, schema: p0.schema.version }]);
      return { refus: [429, { error: { code: 'BUDGET_EXCEEDED', message: 'Plafond de l’analyse atteint pour aujourd’hui ou ce mois-ci.' }, depense: fait, engage, plafond }] };
    }
    const lignesApi = await Promise.all(demande.requetes.map(async (r) => {
      const { prompt, schema } = prompts[r.usage];
      try {
        const x = await anthropic('POST', '/v1/messages', parametresRequete(r.modele, prompt.texte, schema.schema, r.contenu));
        let m = null;
        try { m = JSON.parse(x.texte); } catch { m = null; }
        if (x.statut === 200 && m && typeof m === 'object') return { custom_id: r.id, result: { type: 'succeeded', message: m } };
        const e = m && m.error && typeof m.error === 'object' ? m.error : { type: 'http-' + x.statut, message: x.texte.slice(0, 200) };
        return { custom_id: r.id, result: { type: 'errored', error: { type: 'error', error: e } } };
      } catch (e) {
        return { custom_id: r.id, result: { type: 'errored', error: { type: 'error', error: { type: 'reseau', message: String(e && e.message || e).slice(0, 200) } } } };
      }
    }));
    const table = tarifs();
    const journal = [];
    const resultats = demande.requetes.map((r, i) => {
      const x = lireResultat(lignesApi[i]);
      const ligneTarif = tarifEnVigueur(table, r.modele, t.slice(0, 10));
      const cout = coutAppel(x.tokens, ligneTarif, false);
      const { prompt, schema } = prompts[r.usage];
      journal.push({ t, ...identite, usage: r.usage, modele: r.modele, batch: false, idBatch: null, requete: r.id, passe: r.passe, tokens: x.tokens, images: r.images, facades: r.facades,
        cout, tarif: ligneTarif ? ligneTarif.depuis : null, statut: x.statut, arret: x.arret, prompt: prompt.version, schema: schema.version });
      return { id: r.id, statut: x.statut, arret: x.arret, tokens: x.tokens, sortie: x.sortie, erreur: x.erreur, passe: r.passe, usage: r.usage, cout };
    });
    journaliser(journal);
    return { reponse: { modele: premier.modele, prompt: p0.prompt.version, schema: p0.schema.version, resultats } };
  }

  async function anthropic(methode, chemin, corps) {
    const r = await fetch(anthropicUrl.replace(/\/$/, '') + chemin, {
      method: methode,
      headers: { 'x-api-key': String(cle), 'anthropic-version': VERSION_API, ...(corps ? { 'content-type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {})
    });
    return { statut: r.status, texte: await r.text() };
  }
  const messageApi = (texte) => { try { return String(JSON.parse(texte).error.message); } catch { return texte.slice(0, 200); } };

  /** Le jeton porteur de la plateforme, s'il y en a un. */
  const jetonPorteur = (req) => {
    const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{16,4096})$/.exec(String(req.headers.authorization || '').trim());
    return m ? m[1] : null;
  };

  /**
   * Qui appelle : l'administrateur, ou un utilisateur de la plateforme dont le jeton est verifie
   * aupres d'elle a chaque appel (`/me/context`) : la plateforme seule sait s'il vaut encore, et son
   * organisation est celle qui paie l'analyse. Rend `{statut, code, message}` quand il faut refuser.
   */
  async function acteur(req) {
    if (sessionValide(req)) return { admin: true, organisation: 'admin' };
    const jeton = jetonPorteur(req);
    if (!jeton) return { refus: [401, 'UNAUTHENTICATED', 'Mot de passe ou jeton de la plateforme requis.'] };
    let r;
    try {
      r = await fetch(plateformeUrl.replace(/\/$/, '') + '/api/v1/me/context', { headers: { Authorization: 'Bearer ' + jeton, 'X-Product': PRODUIT_PLATEFORME, Accept: 'application/json' } });
    } catch { return { refus: [502, 'UPSTREAM', 'Plateforme injoignable.'] }; }
    if (r.status === 401) return { refus: [401, 'UNAUTHENTICATED', 'Jeton de la plateforme refusé.'] };
    if (r.status !== 200) return { refus: [403, 'FORBIDDEN', 'Ce compte ne tient pas Plan (' + r.status + ').'] };
    let c = null;
    try { c = await r.json(); } catch { c = null; }
    const organisation = c && c.tenant && typeof c.tenant.id === 'string' ? c.tenant.id : '';
    if (!ID_VALIDE.test(organisation) || organisation === 'admin') return { refus: [502, 'UPSTREAM', 'Réponse de la plateforme illisible.'] };
    if (!Array.isArray(c.permissions) || !c.permissions.includes(PERMISSION_ANALYSE)) return { refus: [403, 'FORBIDDEN', 'Le droit d’écrire les projets est requis pour lancer une analyse.'] };
    return { admin: false, organisation };
  }

  const fBatch = (id) => path.join(dossierBatches, id + '.json');
  const vueBatch = (b) => ({ id: b.id, etat: b.processing_status, compte: b.request_counts || null, creeLe: b.created_at || null, finLe: b.ended_at || null, expireLe: b.expires_at || null });

  /** Les resultats d'un batch termine ; le journal les recoit une fois, a la premiere lecture. */
  async function resultats(fiche) {
    const r = await anthropic('GET', '/v1/messages/batches/' + encodeURIComponent(fiche.id) + '/results');
    if (r.statut !== 200) return { erreur: r };
    const lus = r.texte.split('\n').filter((l) => l.trim()).map((l) => lireResultat(JSON.parse(l)));
    const t = typeof fiche.finLe === 'string' && !Number.isNaN(Date.parse(fiche.finLe)) ? new Date(fiche.finLe).toISOString() : iso();
    const table = tarifs();
    // Une requete du renfort dans le batch de l'analyse a son usage, son modele, son prompt et son schema.
    const detail = lus.map((x) => {
      const req = fiche.requetes[x.id] || { passe: null, images: 0, facades: 0 };
      const modele = req.modele || fiche.modele;
      const ligneTarif = tarifEnVigueur(table, modele, t.slice(0, 10));
      return { x: { ...x, passe: req.passe, usage: req.usage || fiche.usage, cout: coutAppel(x.tokens, ligneTarif, true) }, req, modele, tarif: ligneTarif ? ligneTarif.depuis : null };
    });
    if (!fiche.journalise) {
      journaliser(detail.map(({ x, req, modele, tarif }) => ({
        t, organisation: fiche.organisation, projet: fiche.projet, idu: fiche.idu, adresse: fiche.adresse, audit: fiche.audit,
        usage: x.usage, modele, batch: true, idBatch: fiche.id, requete: x.id, passe: x.passe,
        tokens: x.tokens, images: req.images ?? 0, facades: req.facades ?? 0, cout: x.cout, tarif,
        statut: x.statut, arret: x.arret, prompt: req.prompt ?? fiche.promptVersion, schema: req.schema ?? fiche.schemaVersion
      })));
      ecrireJson(fBatch(fiche.id), { ...fiche, journalise: true, etat: 'ended' });
    }
    return { sortie: detail.map((d) => d.x) };
  }

  /** Les batches encore ouverts d'une organisation : ceux finis sont journalises, les autres comptes. */
  async function engagements(organisation) {
    let ouverts = 0;
    let noms = [];
    try { noms = fs.readdirSync(dossierBatches).filter((n) => n.endsWith('.json')); } catch { return 0; }
    for (const n of noms) {
      const fiche = lireJson(path.join(dossierBatches, n));
      if (!fiche || fiche.journalise || fiche.organisation !== organisation) continue;
      if (avecCle) {
        try {
          const r = await anthropic('GET', '/v1/messages/batches/' + encodeURIComponent(fiche.id));
          const b = r.statut === 200 ? JSON.parse(r.texte) : null;
          if (b && b.processing_status === 'ended') {
            const fini = { ...fiche, finLe: b.ended_at || null };
            if (!(await resultats(fini)).erreur) continue;
          }
        } catch { /* injoignable : le batch reste compte comme engage */ }
      }
      ouverts += Object.keys(fiche.requetes || {}).length;
    }
    return ouverts;
  }

  async function lireCorps(req, max) {
    const morceaux = [];
    let taille = 0;
    for await (const m of req) {
      taille += m.length;
      if (taille > max) throw Object.assign(new Error('trop gros'), { statut: 413 });
      morceaux.push(m);
    }
    const texte = Buffer.concat(morceaux).toString('utf8');
    try { return JSON.parse(texte); } catch { throw refus('JSON illisible.'); }
  }

  /**
   * Traite la requete si elle est pour l'analyse. Rend `false` sinon (demosAdmin.mjs continue).
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   * @param {Record<string, string>} base
   */
  async function traiter(req, res, url, base) {
    // `admin/consommation` (13.3) est servi ici aussi : il ne fait que relire le journal de ce module.
    const m = /^\/admin\/(?:claude(?:\/(.*))?|(consommation)\/?)$/.exec(url.pathname);
    if (!m || !actif) return false;
    const chemin = m[2] ? '@consommation' : (m[1] || '').replace(/\/$/, '');
    const json = (statut, corps) => {
      res.writeHead(statut, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(corps));
      return true;
    };
    const erreur = (statut, code, message) => json(statut, { error: { code, message } });
    const methode = req.method || 'GET';
    const lecture = methode === 'GET' || methode === 'HEAD';
    if (!lecture && req.headers['x-plan-admin'] !== '1') return erreur(403, 'FORBIDDEN', 'En-tete X-Plan-Admin manquant.');
    const qui = await acteur(req);
    if (qui.refus) return erreur(...qui.refus);
    const organisation = qui.organisation;
    const reserveAdmin = () => (qui.admin ? null : erreur(403, 'FORBIDDEN', 'Réservé à l’administrateur.'));
    const sansCle = () => erreur(503, 'NOT_CONFIGURED', 'Clé Anthropic absente : ANTHROPIC_API_KEY sur ce serveur (anthropicCle dans plan-admin-config.php pour Apache).');

    try {
      if (chemin === 'etat') {
        if (!lecture) return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        const { prompt, schema } = promptEtSchema();
        // Un deploiement d'avant le lot L18 n'a pas les fichiers du renfort : l'etat le dit, sans tomber.
        let renfort = null;
        try { const r = promptEtSchema('renfort'); renfort = { prompt: r.prompt.version, schema: r.schema.version }; } catch { renfort = null; }
        return json(200, { actif: avecCle, modeles: MODELES, usages: USAGES, prompt: prompt.version, schema: schema.version, effort: EFFORT, renfort, organisation, admin: qui.admin });
      }

      if (chemin === '@consommation') {
        if (!lecture) return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (reserveAdmin()) return true;
        const aujourdhui = iso().slice(0, 10);
        const f = lireFiltres(url.searchParams, aujourdhui);
        const p = plafonds();
        // Chaque fichier mensuel est lu une fois, meme s'il sert a la periode, aux sept derniers
        // jours et au mois des plafonds.
        const lus = new Map();
        const mois = (m) => { if (!lus.has(m)) lus.set(m, lireJournal(m + '-01').filter(Boolean)); return lus.get(m); };
        const periode = moisEntre(f.du, f.au).flatMap(mois);
        const debutRecents = decalerJour(aujourdhui, -6);
        return json(200, {
          format: 'plan-claude-consommation', du: f.du, au: f.au, aujourdhui,
          filtres: { organisation: f.organisation, modele: f.modele, usage: f.usage, parcelle: f.parcelle },
          lignes: filtrerConsommation(periode, f),
          recents: filtrerConsommation(moisEntre(debutRecents, aujourdhui).flatMap(mois), { du: debutRecents, au: aujourdhui }),
          organisations: etatOrganisations(mois(aujourdhui.slice(0, 7)), p, aujourdhui),
          choix: choixConsommation(periode, p)
        });
      }

      if (chemin === 'tarifs' || chemin === 'plafonds') {
        if (reserveAdmin()) return true;
        const f = chemin === 'tarifs' ? fTarifs : fPlafonds;
        if (lecture) return json(200, chemin === 'tarifs' ? tarifs() : plafonds());
        if (methode !== 'PUT') return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        const d = await lireCorps(req, 1024 * 1024);
        if (chemin === 'tarifs') {
          verifierTarifs(d);
          if (!passeGarde(tarifs(), d, iso().slice(0, 10))) return erreur(409, 'PAST_PRICES', 'Un tarif passé ne se réécrit pas : ajoutez une ligne datée.');
        } else verifierPlafonds(d);
        ecrireJson(f, d);
        return json(200, d);
      }

      if (chemin === 'batches') {
        if (methode !== 'POST') return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!avecCle) return sansCle();
        const p = plafonds();
        const demande = verifierDemande(await lireCorps(req, TAILLE_MAX), p);
        const t = iso();
        const identite = { organisation, projet: demande.projet ?? (qui.admin ? 'admin' : null), idu: demande.idu, adresse: demande.adresse, audit: demande.audit, usage: demande.usage, modele: demande.modele, batch: true };
        const { prompt, schema } = promptEtSchema(demande.usage);
        const prompts = promptsDesRequetes(demande.requetes);
        const images = demande.requetes.reduce((s, r) => s + r.images, 0);
        // Les passes d'une maison couvrent les memes facades : on les compte sur la premiere passe.
        const facades = demande.requetes.reduce((s, r) => s + ((r.passe ?? 1) === 1 ? r.facades : 0), 0);
        const ligneVide = (statut, extra) => ({ t, ...identite, idBatch: null, requete: null, passe: null, tokens: tokensDeUsage(null), images, facades, cout: 0, tarif: null, statut, arret: null, prompt: prompt.version, schema: schema.version, ...extra });

        // Les plafonds : ce qui est depense, plus ce qui est engage dans les batches ouverts, plus
        // une estimation de celui-ci. Un batch se paie a la fin : sans l'engage, dix batches lances
        // d'un coup passeraient tous sous le plafond.
        const ouverts = await engagements(organisation);
        const fait = depenses(lireJournal(t), organisation, t.slice(0, 10));
        const engage = (ouverts + demande.requetes.length) * p.estimationRequete;
        const plafond = plafondDe(p, organisation);
        if (fait.jour + engage > plafond.jour || fait.mois + engage > plafond.mois) {
          journaliser([ligneVide('plafond', {})]);
          return json(429, { error: { code: 'BUDGET_EXCEEDED', message: 'Plafond de l’analyse atteint pour aujourd’hui ou ce mois-ci.' }, depense: fait, engage, plafond });
        }

        const corps = { requests: demande.requetes.map((r) => ({ custom_id: r.id, params: parametresRequete(r.modele, prompts[r.usage].prompt.texte, prompts[r.usage].schema.schema, r.contenu) })) };
        let r;
        try { r = await anthropic('POST', '/v1/messages/batches', corps); } catch (e) {
          journaliser([ligneVide('echoue', { erreur: 'reseau' })]);
          return erreur(502, 'UPSTREAM', 'Anthropic injoignable : ' + String(e && e.message || e).slice(0, 120));
        }
        if (r.statut < 200 || r.statut >= 300) {
          journaliser([ligneVide('echoue', { erreur: 'http-' + r.statut })]);
          return erreur(502, 'UPSTREAM', 'Anthropic a refusé le batch (' + r.statut + ') : ' + messageApi(r.texte));
        }
        const b = JSON.parse(r.texte);
        if (!b || typeof b.id !== 'string' || !ID_BATCH.test(b.id)) return erreur(502, 'UPSTREAM', 'Réponse d’Anthropic illisible.');
        ecrireJson(fBatch(b.id), {
          id: b.id, creeLe: t, ...identite, promptVersion: prompt.version, schemaVersion: schema.version,
          requetes: Object.fromEntries(demande.requetes.map((x) => [x.id, { passe: x.passe, images: x.images, facades: x.facades, usage: x.usage, modele: x.modele, prompt: prompts[x.usage].prompt.version, schema: prompts[x.usage].schema.version }])),
          etat: b.processing_status, journalise: false
        });
        return json(201, { batch: vueBatch(b), modele: demande.modele, prompt: prompt.version, schema: schema.version });
      }

      if (chemin === 'messages') {
        if (methode !== 'POST') return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!avecCle) return sansCle();
        const p = plafonds();
        const d = await lireCorps(req, TAILLE_MAX);
        if (d && typeof d === 'object' && !Array.isArray(d) && d.usage === undefined) d.usage = 'renfort';
        const demande = verifierDemande(d, { ...p, requetesParBatch: Math.min(REQUETES_IMMEDIATES, p.requetesParBatch) });
        const r = await appelImmediat(demande, organisation, qui.admin);
        return r.refus ? json(...r.refus) : json(200, r.reponse);
      }

      const mb = /^batches\/([^/]+)(\/resultats)?$/.exec(chemin);
      if (mb) {
        if (!lecture) return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        const id = decodeURIComponent(mb[1] || '');
        // Seuls les batches crees par ce serveur se lisent, et par l'organisation qui les a crees : la
        // cle ne sert pas a fouiller le compte, ni une organisation a lire les resultats d'une autre.
        const fiche = ID_BATCH.test(id) ? lireJson(fBatch(id)) : null;
        if (!fiche || (!qui.admin && fiche.organisation !== organisation)) return erreur(404, 'NOT_FOUND', 'Aucun batch « ' + id + ' ».');
        if (!avecCle) return sansCle();
        const r = await anthropic('GET', '/v1/messages/batches/' + encodeURIComponent(id));
        if (r.statut !== 200) return erreur(502, 'UPSTREAM', 'Anthropic : ' + r.statut + ' ' + messageApi(r.texte));
        const b = JSON.parse(r.texte);
        if (!mb[2]) {
          if (fiche.etat !== b.processing_status) ecrireJson(fBatch(id), { ...fiche, etat: b.processing_status });
          return json(200, vueBatch(b));
        }
        if (b.processing_status !== 'ended') return erreur(409, 'NOT_READY', 'Le batch n’est pas terminé (' + b.processing_status + ').');
        const lu = await resultats({ ...fiche, finLe: b.ended_at || null });
        if (lu.erreur) return erreur(502, 'UPSTREAM', 'Anthropic : ' + lu.erreur.statut + ' ' + messageApi(lu.erreur.texte));
        return json(200, { batch: vueBatch(b), modele: fiche.modele, prompt: fiche.promptVersion, schema: fiche.schemaVersion, resultats: lu.sortie });
      }
      return erreur(404, 'NOT_FOUND', 'Introuvable');
    } catch (e) {
      if (e && e.statut === 413) return erreur(413, 'TOO_LARGE', 'Demande trop grosse (48 Mo au plus).');
      if (e && e.statut === 400) return erreur(400, 'BAD_REQUEST', e.message);
      console.error('Plan analyse :', e);
      return erreur(500, 'SERVER_ERROR', 'Erreur du serveur.');
    }
  }

  return { actif: actif && avecCle, traiter };
}
