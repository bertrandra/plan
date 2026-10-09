// Plan interactif — application Node.js pour SiteGround (Site Tools > Devs > Node.js).
//
// Ce dossier est un projet Node : les sources de Plan, construites ICI, sur l'hote, puis servies.
//
//   npm install          les six paquets du build (package.json)
//   node app.js          construit dist/ si besoin, puis sert la page
//   node app.js --build  construit seulement (npm run build)
//
// Le build se refait quand les sources recopiees changent (SOURCE) ou que l'origine de la
// plateforme change ; sinon le demarrage reprend `dist/` tel quel.
//
// Il n'y a pas d'Apache : ce serveur pose lui-meme ce que `deploy/htaccess.template` pose
// ailleurs. La politique de contenu n'est pas recopiee a la main : elle est lue dans le
// `dist/.htaccess` que le build vient d'ecrire, avec les empreintes des scripts de CE build.
//
// SiteGround donne le port dans `PORT` et termine le HTTPS devant l'application : le protocole
// d'origine arrive dans `X-Forwarded-Proto`.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creerAdminDemos } from './demosAdmin.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(ici, 'dist');

// L'origine de la plateforme est lue au build (vite.config.ts). Celle de production par defaut ;
// une autre se donne par la variable d'environnement de l'application dans Site Tools.
process.env.BACKPROD_API_URL ||= 'https://www.raillard.org';
const PORT = Number(process.env.PORT) || 3000;
const HOTE = process.env.HOST || '0.0.0.0';

// Les fichiers de demonstration de l'admin (demosAdmin.mjs, MD/spec-demos-admin.md). Sans
// ADMIN_PASSWORD, l'admin n'existe pas. DEMOS_DIR gagne a etre HORS du dossier de l'application :
// une mise en ligne qui remplace ce dossier emporterait sinon les demos enregistrees depuis.
const adminDemos = creerAdminDemos({
  dossier: process.env.DEMOS_DIR || path.join(ici, 'demos'),
  motDePasse: process.env.ADMIN_PASSWORD
});

// ---------------------------------------------------------------------------------------------
// Le build
// ---------------------------------------------------------------------------------------------

function lire(fichier) {
  try { return fs.readFileSync(fichier, 'utf8'); } catch { return null; }
}

/** Ce dont `dist/` est le produit : les sources recopiees et l'origine de la plateforme. */
const attendu = (lire(path.join(ici, 'SOURCE')) || '').trim() + ' ' + process.env.BACKPROD_API_URL;
const tampon = path.join(dist, '.construit');

function construire() {
  const vite = path.join(ici, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) {
    console.error('Plan : vite est absent. Lancer `npm install` dans ' + ici + ' (Site Tools > Node.js), puis redemarrer.');
    process.exit(1);
  }
  console.log('Plan : construction (' + attendu + ')...');
  const r = spawnSync(process.execPath, [vite, 'build'], { cwd: ici, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error('Plan : le build a echoue (code ' + r.status + ').');
    process.exit(1);
  }
  fs.writeFileSync(tampon, attendu + '\n');
}

const seulementConstruire = process.argv.includes('--build');
if (seulementConstruire || (lire(tampon) || '').trim() !== attendu || !fs.existsSync(path.join(dist, 'index.html'))) construire();
if (seulementConstruire) process.exit(0);

// ---------------------------------------------------------------------------------------------
// Ce que le build a produit : la page, et la politique de son .htaccess
// ---------------------------------------------------------------------------------------------

const page = fs.readFileSync(path.join(dist, 'index.html'));
const pageGz = zlib.gzipSync(page, { level: 9 });
const etag = '"' + crypto.createHash('sha256').update(page).digest('base64url').slice(0, 27) + '"';

// Le formulaire officiel de la declaration prealable, que Vite recopie de public/cerfa/ : la page le
// demande a cote d'elle (src/export/cerfa13703.ts). Lu une fois, comme la page.
const dossierCerfa = path.join(dist, 'cerfa');
const formulaires = new Map((fs.existsSync(dossierCerfa) ? fs.readdirSync(dossierCerfa) : [])
  .filter((f) => f.endsWith('.pdf')).map((f) => ['/cerfa/' + f, fs.readFileSync(path.join(dossierCerfa, f))]));

const apache = fs.readFileSync(path.join(dist, '.htaccess'), 'utf8');
const csp = (/Header always set Content-Security-Policy "([^"]+)"/.exec(apache) || [])[1];
const cadre = /Header always edit Content-Security-Policy "(frame-ancestors [^"]+)" "(frame-ancestors [^"]+)"/.exec(apache);
if (!csp || !cadre || !csp.includes(cadre[1])) {
  console.error('Plan : dist/.htaccess ne porte pas la politique attendue (deploy/htaccess.template a change ?).');
  process.exit(1);
}
// §6 du .htaccess : la vitrine (?mode=demo) se laisse encadrer par la plateforme, et elle seule.
const cspVitrine = csp.replace(cadre[1], cadre[2]);

// ---------------------------------------------------------------------------------------------
// Le serveur
// ---------------------------------------------------------------------------------------------

/** Les en-tetes de securite, communs a toutes les reponses (§4 du .htaccess). */
function securite(req, vitrine) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy': vitrine ? cspVitrine : csp
  };
  if (!vitrine) h['X-Frame-Options'] = 'DENY';
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https' || req.socket.encrypted) h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}

function repondre(req, res, statut, entetes, corps) {
  res.writeHead(statut, entetes);
  res.end(req.method === 'HEAD' ? undefined : corps);
}

const texte = { 'Content-Type': 'text/plain; charset=utf-8' };

const serveur = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    return repondre(req, res, 400, texte, 'Requete invalide\n');
  }
  const vitrine = /(^|&)mode=demo(&|$)/.test(url.search.slice(1));
  const base = securite(req, vitrine);

  // L'admin des demos a ses propres methodes (POST, PUT, DELETE) : il passe avant le filtre.
  if (await adminDemos.traiter(req, res, url, base)) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return repondre(req, res, 405, { ...base, ...texte, Allow: 'GET, HEAD' }, 'Methode non autorisee\n');
  }

  // L'ancienne adresse mene a la nouvelle, definitivement, avec sa chaine de requete.
  if (url.pathname === '/plan.html') {
    return repondre(req, res, 301, { ...base, ...texte, Location: '/' + url.search }, 'Deplace vers /\n');
  }

  const formulaire = formulaires.get(url.pathname);
  if (formulaire) {
    return repondre(req, res, 200, { ...base, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400', 'Content-Length': formulaire.length }, formulaire);
  }

  // Le build est un fichier unique, plus le formulaire cerfa : rien d'autre ne se sert —
  // ni `data/`, ni `api.php`, ni les sources, ni un fichier qui commence par un point.
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return repondre(req, res, 404, { ...base, ...texte, 'Cache-Control': 'no-store' }, 'Introuvable\n');
  }

  // Le nom ne change jamais : la page se revalide a chaque visite, sinon une mise en ligne
  // n'atteint pas ceux qui reviennent.
  const entetes = {
    ...base,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, must-revalidate',
    ETag: etag,
    Vary: 'Accept-Encoding'
  };
  if (req.headers['if-none-match'] === etag) return repondre(req, res, 304, entetes);
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    return repondre(req, res, 200, { ...entetes, 'Content-Encoding': 'gzip', 'Content-Length': pageGz.length }, pageGz);
  }
  return repondre(req, res, 200, { ...entetes, 'Content-Length': page.length }, page);
});

serveur.listen(PORT, HOTE, () => {
  console.log('Plan : http://' + HOTE + ':' + PORT + '/ (' + page.length + ' octets)'
    + (adminDemos.actif ? ', admin des demos actif' : ', admin des demos inactif (ADMIN_PASSWORD absent)'));
});
