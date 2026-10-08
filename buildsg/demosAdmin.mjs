// Les fichiers de demonstration de l'admin, servis et ecrits par app.js (MD/spec-demos-admin.md).
//
// Les demos sont des fichiers JSON au format de l'export de Plan (`{meta, objects, measures}`),
// ranges dans un dossier du serveur, hors du HTML : l'admin les ouvre par `?admin&demofile=<id>`,
// les modifie dans l'atelier, et « Enregistrer » les reecrit ici. Rien n'est reconstruit.
//
// **Le mot de passe se verifie ici, jamais dans la page.** Le fichier livre se lit en entier par
// n'importe qui : un mot de passe compare dans le navigateur ne protegerait rien. La page ne fait
// que le transmettre ; ce module le compare a `ADMIN_PASSWORD` et pose un cookie de session.
//
// Sans `ADMIN_PASSWORD`, rien de tout cela n'existe : chaque route repond 404, comme avant.
//
// Defenses, toutes cote serveur :
//   - le cookie est `HttpOnly`, `SameSite=Strict`, limite a `/admin/`, `Secure` derriere HTTPS ;
//   - toute ecriture exige l'en-tete `X-Plan-Admin: 1` : un formulaire d'un autre site ne peut pas
//     le poser, et un `fetch` d'un autre site devrait passer par un preflight que rien n'accepte ;
//   - cinq mots de passe faux en dix minutes depuis une adresse la bloquent dix minutes ;
//   - un identifiant de fichier ne contient que lettres, chiffres, `-` et `_` : pas de `..`, pas de `/`.
//   - avant chaque ecriture, l'ancienne version est gardee en `<id>.json.bak`.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const COOKIE = 'plan_admin';
const DUREE_SESSION_MS = 8 * 3600 * 1000;
const FENETRE_ECHECS_MS = 10 * 60 * 1000;
const ECHECS_MAX = 5;
const TAILLE_MAX = 25 * 1024 * 1024;
const ID_VALIDE = /^[A-Za-z0-9_-]{1,64}$/;

/** Compare deux chaines en temps constant, quelle que soit leur longueur. */
function egales(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function lireCookie(req, nom) {
  const brut = String(req.headers.cookie || '');
  for (const morceau of brut.split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0 && morceau.slice(0, i).trim() === nom) return morceau.slice(i + 1).trim();
  }
  return null;
}

function lireCorps(req, max) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    let taille = 0;
    req.on('data', (m) => {
      taille += m.length;
      if (taille > max) { reject(Object.assign(new Error('trop gros'), { statut: 413 })); req.destroy(); return; }
      morceaux.push(m);
    });
    req.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {{ dossier: string, motDePasse: string | undefined, maintenant?: () => number }} options
 */
export function creerAdminDemos({ dossier, motDePasse, maintenant = () => Date.now() }) {
  const actif = typeof motDePasse === 'string' && motDePasse.length > 0;
  /** jeton -> expiration. En memoire : un redemarrage demande de se reconnecter, c'est voulu. */
  const sessions = new Map();
  /** adresse -> instants des derniers echecs. */
  const echecs = new Map();

  if (actif) fs.mkdirSync(dossier, { recursive: true });

  const fichier = (id) => path.join(dossier, id + '.json');

  function sessionValide(req) {
    const jeton = lireCookie(req, COOKIE);
    if (!jeton) return false;
    const fin = sessions.get(jeton);
    if (!fin) return false;
    if (fin < maintenant()) { sessions.delete(jeton); return false; }
    return true;
  }

  function bloque(ip) {
    const t = (echecs.get(ip) || []).filter((x) => x > maintenant() - FENETRE_ECHECS_MS);
    echecs.set(ip, t);
    return t.length >= ECHECS_MAX;
  }

  /** Le resume d'un fichier, tel que la liste des projets de Plan l'attend. */
  function resume(id) {
    const f = fichier(id);
    const st = fs.statSync(f);
    let name = id;
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (d && d.meta && typeof d.meta.name === 'string' && d.meta.name) name = d.meta.name;
    } catch { /* un fichier illisible se liste quand meme : l'ouvrir dira pourquoi */ }
    return { id, name, updatedAt: st.mtime.toISOString() };
  }

  function lister() {
    return fs.readdirSync(dossier)
      .filter((n) => n.endsWith('.json') && ID_VALIDE.test(n.slice(0, -5)))
      .map((n) => resume(n.slice(0, -5)))
      .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }));
  }

  /** Le prochain identifiant numerique libre : 1, 2, 3… */
  function prochainId() {
    const pris = new Set(fs.readdirSync(dossier).map((n) => n.replace(/\.json(\.bak)?$/, '')));
    let n = 1;
    while (pris.has(String(n))) n++;
    return String(n);
  }

  /** Ecrit le document, en gardant la version precedente. Ecriture atomique : jamais de demi-fichier. */
  function ecrire(id, document) {
    const f = fichier(id);
    if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
    const tmp = f + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(document, null, 2) + '\n');
    fs.renameSync(tmp, f);
  }

  /**
   * Traite la requete si elle est pour l'admin. Rend `false` sinon, et app.js continue.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   * @param {Record<string, string>} base en-tetes de securite communs
   */
  async function traiter(req, res, url, base) {
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return false;
    const json = (statut, corps, plus = {}) => {
      const texte = corps === undefined ? '' : JSON.stringify(corps);
      res.writeHead(statut, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...plus });
      res.end(req.method === 'HEAD' ? undefined : texte);
      return true;
    };
    const erreur = (statut, code, message) => json(statut, { error: { code, message } });

    // La vitrine (`/admin/vitrine/<id>`) est publique : ses refus se disent, et se lisent de toute
    // origine — l'<iframe> de la plateforme est en bac a sable (origine `null`), et sans cet en-tete
    // sur CHAQUE reponse, la page n'y voit ni la demo ni la raison de son absence (deploy/admin.php).
    const v = /^\/admin\/vitrine\/([^/]+)$/.exec(url.pathname);
    const refus = (statut, code, message) => json(statut, { error: { code, message } }, { 'Access-Control-Allow-Origin': '*' });
    if (!actif) {
      if (v) return refus(404, 'NOT_CONFIGURED', 'Admin non configuré : pas de mot de passe. La vitrine ne peut pas lire ses démos.');
      return erreur(404, 'NOT_FOUND', 'Introuvable');
    }

    const methode = req.method || 'GET';
    const lecture = methode === 'GET' || methode === 'HEAD';
    if (!lecture && req.headers['x-plan-admin'] !== '1') return erreur(403, 'FORBIDDEN', 'En-tete X-Plan-Admin manquant.');

    try {
      // --- La vitrine -----------------------------------------------------------------------------
      // La demo <id> en lecture seule, sans session : ce que montre `?mode=demo&file=<id>`
      // (deploy/admin.php, meme route). Rien n'y ecrit, et aucun cookie n'y est pose.
      if (v) {
        if (!lecture) return refus(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        const id = decodeURIComponent(v[1]);
        if (!ID_VALIDE.test(id)) return refus(400, 'BAD_ID', 'Identifiant de démo invalide.');
        const f = fichier(id);
        if (!fs.existsSync(f)) return refus(404, 'NOT_FOUND', 'Aucune démo « ' + id + ' ».');
        // Presente mais illisible (droits du fichier) : le dire plutot qu'un 500 muet ou un corps vide.
        try { fs.accessSync(f, fs.constants.R_OK); } catch { return refus(500, 'UNREADABLE', 'Démo « ' + id + ' » présente mais illisible : droits du fichier (644, même utilisateur que le site).'); }
        // Lisible de toute origine : la vitrine encadree en bac a sable (`sandbox` sans
        // `allow-same-origin`) a l'origine `null` ; la reponse est publique et sans cookie.
        res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*', 'Last-Modified': fs.statSync(f).mtime.toUTCString() });
        res.end(methode === 'HEAD' ? undefined : fs.readFileSync(f, 'utf8'));
        return true;
      }

      // --- La palette ---------------------------------------------------------------------------
      // Les couleurs de l'interface (styles/paletteServeur.ts), lues SANS session par chaque page
      // (deploy/admin.php, meme route). L'ecriture, plus bas, demande la session.
      const fPalette = path.join(dossier, '.palette.json');
      if (url.pathname === '/admin/palette' && lecture) {
        if (!fs.existsSync(fPalette)) return erreur(404, 'NOT_FOUND', 'Aucune palette enregistrée.');
        res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', 'Last-Modified': fs.statSync(fPalette).mtime.toUTCString() });
        res.end(methode === 'HEAD' ? undefined : fs.readFileSync(fPalette, 'utf8'));
        return true;
      }

      // --- La session ---------------------------------------------------------------------------
      if (url.pathname === '/admin/session') {
        if (lecture) return sessionValide(req) ? json(200, { admin: true }) : erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
        if (methode === 'POST') {
          const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
          if (bloque(ip)) return erreur(429, 'TOO_MANY_ATTEMPTS', 'Trop d’essais. Réessayez dans dix minutes.');
          let donne = '';
          try { donne = String(JSON.parse(await lireCorps(req, 4096)).motDePasse ?? ''); } catch { /* corps illisible : refus */ }
          if (!egales(donne, motDePasse)) {
            echecs.get(ip).push(maintenant());
            return erreur(401, 'BAD_PASSWORD', 'Mot de passe refusé.');
          }
          echecs.delete(ip);
          const jeton = crypto.randomBytes(32).toString('base64url');
          sessions.set(jeton, maintenant() + DUREE_SESSION_MS);
          const https = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || req.socket.encrypted;
          const cookie = COOKIE + '=' + jeton + '; Path=/admin/; HttpOnly; SameSite=Strict; Max-Age=' + DUREE_SESSION_MS / 1000 + (https ? '; Secure' : '');
          return json(200, { admin: true }, { 'Set-Cookie': cookie });
        }
        if (methode === 'DELETE') {
          const jeton = lireCookie(req, COOKIE);
          if (jeton) sessions.delete(jeton);
          return json(200, { admin: false }, { 'Set-Cookie': COOKIE + '=; Path=/admin/; HttpOnly; SameSite=Strict; Max-Age=0' });
        }
        return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
      }

      if (!sessionValide(req)) return erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');

      // --- Les fichiers ---------------------------------------------------------------------------
      if (url.pathname === '/admin/demos') {
        if (lecture) return json(200, { demos: lister() });
        if (methode === 'POST') {
          const document = verifierDocument(await lireCorps(req, TAILLE_MAX));
          const id = prochainId();
          ecrire(id, document);
          return json(201, resume(id));
        }
        return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
      }

      // L'arbre des controleurs de l'ecran (app/controleurs.ts) : un seul document, a part des
      // demos. Le point en tete le garde hors de la liste des demos.
      if (url.pathname === '/admin/controleurs') {
        const f = path.join(dossier, '.controleurs.json');
        if (lecture) {
          if (!fs.existsSync(f)) return erreur(404, 'NOT_FOUND', 'Aucun registre des contrôleurs enregistré.');
          res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(methode === 'HEAD' ? undefined : fs.readFileSync(f, 'utf8'));
          return true;
        }
        if (methode === 'PUT') {
          const document = verifierRegistre(await lireCorps(req, TAILLE_MAX));
          if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
          const tmp = f + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(document, null, 2) + '\n');
          fs.renameSync(tmp, f);
          return json(200, { decouvertLe: document.decouvertLe });
        }
        return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
      }

      if (url.pathname === '/admin/palette') {
        if (methode !== 'PUT') return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        const document = verifierPalette(await lireCorps(req, 65536));
        if (fs.existsSync(fPalette)) fs.copyFileSync(fPalette, fPalette + '.bak');
        const tmp = fPalette + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(document, null, 2) + '\n');
        fs.renameSync(tmp, fPalette);
        return json(200, { modifieLe: document.modifieLe ?? null });
      }

      const m = /^\/admin\/demos\/([^/]+)$/.exec(url.pathname);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!ID_VALIDE.test(id)) return erreur(400, 'BAD_ID', 'Identifiant de démo invalide.');
        const f = fichier(id);
        if (lecture) {
          if (!fs.existsSync(f)) return erreur(404, 'NOT_FOUND', 'Aucune démo « ' + id + ' ».');
          const texte = fs.readFileSync(f, 'utf8');
          res.writeHead(200, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Last-Modified': fs.statSync(f).mtime.toUTCString() });
          res.end(methode === 'HEAD' ? undefined : texte);
          return true;
        }
        if (methode === 'PUT') {
          const document = verifierDocument(await lireCorps(req, TAILLE_MAX));
          ecrire(id, document);
          return json(200, resume(id));
        }
        if (methode === 'DELETE') {
          if (!fs.existsSync(f)) return erreur(404, 'NOT_FOUND', 'Aucune démo « ' + id + ' ».');
          // Rien ne s'efface pour de bon : le fichier est renomme, on le retrouve a la main.
          fs.renameSync(f, f + '.supprime-' + new Date(maintenant()).toISOString().replace(/[:.]/g, '-'));
          return json(200, {});
        }
        return erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
      }
      return erreur(404, 'NOT_FOUND', 'Introuvable');
    } catch (e) {
      if (e && e.statut === 413) return erreur(413, 'TOO_LARGE', 'Fichier trop gros (25 Mo au plus).');
      if (e && e.statut === 400) return erreur(400, 'BAD_DOCUMENT', e.message);
      console.error('Plan admin :', e);
      return erreur(500, 'SERVER_ERROR', 'Erreur du serveur.');
    }
  }

  return { actif, traiter };
}

/** Un document de demo : le format de l'export, `{meta, objects, measures}`, avec au moins des objets. */
function verifierDocument(texte) {
  let d;
  try { d = JSON.parse(texte); } catch { throw Object.assign(new Error('JSON illisible.'), { statut: 400 }); }
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.objects)) {
    throw Object.assign(new Error('Le document n’a pas la forme d’un plan (objects manquant).'), { statut: 400 });
  }
  return d;
}

/** Une palette : `{format: 'plan-palette', couleurs: {clair: {nom: '#RRGGBB'}, sombre: {...}}}`. */
function verifierPalette(texte) {
  let d;
  try { d = JSON.parse(texte); } catch { throw Object.assign(new Error('JSON illisible.'), { statut: 400 }); }
  const refus = () => Object.assign(new Error('Ce n’est pas une palette (couleurs #RRGGBB, thèmes clair et sombre).'), { statut: 400 });
  if (!d || d.format !== 'plan-palette' || !d.couleurs || typeof d.couleurs !== 'object' || Array.isArray(d.couleurs)) throw refus();
  for (const [theme, valeurs] of Object.entries(d.couleurs)) {
    if (!['clair', 'sombre'].includes(theme) || !valeurs || typeof valeurs !== 'object' || Array.isArray(valeurs)) throw refus();
    for (const [nom, v] of Object.entries(valeurs)) {
      if (!/^[a-z0-9-]{1,40}$/.test(nom) || typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v)) throw refus();
    }
  }
  return d;
}

/** Un registre des controleurs : `{format: 'plan-controleurs', arbre: {...}}`. */
function verifierRegistre(texte) {
  let d;
  try { d = JSON.parse(texte); } catch { throw Object.assign(new Error('JSON illisible.'), { statut: 400 }); }
  if (!d || d.format !== 'plan-controleurs' || !d.arbre || typeof d.arbre !== 'object') {
    throw Object.assign(new Error('Ce n’est pas un registre des contrôleurs.'), { statut: 400 });
  }
  return d;
}
