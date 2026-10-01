// Plan interactif — serveur Node.js pour SiteGround (Site Tools > Devs > Node.js).
//
// Le pendant de `livraison/.htaccess` (deploy/htaccess.template) pour un hote sans Apache. Aucune
// dependance : `npm install` n'a rien a installer, et rien ne peut casser au deploiement.
//
// Ce dossier se regenere par `node scripts/generer-buildsg.mjs` : `index.html` et `entetes.json`
// viennent du build ; seuls `app.js` et `package.json` sont ecrits a la main.
//
// SiteGround donne le port dans `PORT` et termine le HTTPS devant l'application : le protocole
// d'origine arrive dans `X-Forwarded-Proto`.

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOTE = process.env.HOST || '0.0.0.0';

// Le fichier est lu une fois, au demarrage : une mise en ligne passe par un redemarrage de
// l'application dans Site Tools, ce qui est aussi ce qui recharge `entetes.json`.
const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const pageGz = zlib.gzipSync(page, { level: 9 });
const etag = '"' + crypto.createHash('sha256').update(page).digest('base64url').slice(0, 27) + '"';
const { csp, cspVitrine } = JSON.parse(fs.readFileSync(path.join(__dirname, 'entetes.json'), 'utf8'));

/** Les en-tetes de securite, communs a toutes les reponses (§4 du .htaccess). */
function securite(req, vitrine) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // §5 et §6 : la vitrine (?mode=demo) se laisse encadrer par la plateforme, et elle seule.
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

const serveur = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    return repondre(req, res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Requete invalide\n');
  }
  const vitrine = /(^|&)mode=demo(&|$)/.test(url.search.slice(1));
  const base = securite(req, vitrine);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return repondre(req, res, 405, { ...base, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Methode non autorisee\n');
  }

  // L'ancienne adresse mene a la nouvelle, definitivement, avec sa chaine de requete.
  if (url.pathname === '/plan.html') {
    return repondre(req, res, 301, { ...base, Location: '/' + url.search, 'Content-Type': 'text/plain; charset=utf-8' }, 'Deplace vers /\n');
  }

  // Le build est un fichier unique : rien d'autre n'existe, donc rien d'autre ne se sert —
  // ni `data/`, ni `api.php`, ni un fichier qui commence par un point.
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return repondre(req, res, 404, { ...base, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, 'Introuvable\n');
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
  console.log('Plan : http://' + HOTE + ':' + PORT + '/ (' + page.length + ' octets)');
});
