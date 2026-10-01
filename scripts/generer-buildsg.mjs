// Le second deploiement : Plan servi par Node.js sur SiteGround (Site Tools > Devs > Node.js),
// a cote du deploiement Apache de `livraison/`.
//
//   node scripts/generer-buildsg.mjs              depuis livraison/ (index.html + .htaccess)
//   node scripts/generer-buildsg.mjs dist         depuis la sortie d'un build frais
//
// Il n'y a pas de `.htaccess` sous Node : c'est `buildsg/app.js` qui pose les en-tetes. Mais la
// politique de contenu porte les empreintes des scripts du build, et l'origine de la plateforme —
// elle ne peut donc pas etre ecrite a la main dans le serveur. On la LIT dans le `.htaccess` produit
// par le meme build, au caractere pres, et on l'ecrit dans `buildsg/entetes.json`. Les deux
// deploiements servent ainsi la meme politique, et un `index.html` d'un autre build est refuse ici
// plutot qu'en production.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(racine, process.argv[2] || 'livraison');
const cible = resolve(racine, 'buildsg');

const page = resolve(source, 'index.html');
const htaccess = resolve(source, '.htaccess');
for (const f of [page, htaccess]) {
  if (!existsSync(f)) {
    console.error('generer-buildsg : ' + f + ' est absent.');
    process.exit(2);
  }
}

const apache = readFileSync(htaccess, 'utf8');
const csp = (/Header always set Content-Security-Policy "([^"]+)"/.exec(apache) || [])[1];
if (!csp) throw new Error('generer-buildsg : aucune Content-Security-Policy dans ' + htaccess);
const cadre = /Header always edit Content-Security-Policy "(frame-ancestors [^"]+)" "(frame-ancestors [^"]+)"/.exec(apache);
if (!cadre) throw new Error('generer-buildsg : la regle de la vitrine (?mode=demo) est absente de ' + htaccess);
if (!csp.includes(cadre[1])) throw new Error('generer-buildsg : la politique ne porte pas « ' + cadre[1] + ' »');

// Le .htaccess et la page doivent venir du meme build : sinon la page ne s'executerait pas.
const html = readFileSync(page, 'utf8');
const motif = /<script(?![^>]*\ssrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g;
for (let m = motif.exec(html); m; m = motif.exec(html)) {
  if (!m[1]) continue;
  const empreinte = "'sha256-" + createHash('sha256').update(m[1], 'utf8').digest('base64') + "'";
  if (!csp.includes(empreinte)) throw new Error('generer-buildsg : ' + htaccess + ' ne vient pas du build de ' + page);
}

copyFileSync(page, resolve(cible, 'index.html'));
writeFileSync(resolve(cible, 'entetes.json'), JSON.stringify({
  csp,
  cspVitrine: csp.replace(cadre[1], cadre[2])
}, null, 2) + '\n');
console.log('buildsg/ : index.html et entetes.json ecrits depuis ' + source);
