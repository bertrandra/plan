// Le second deploiement : Plan comme application Node.js sur SiteGround (Site Tools > Devs >
// Node.js), construite SUR le serveur, a cote du deploiement Apache de `livraison/`.
//
//   npm run buildsg
//
// `buildsg/` est un projet Node autonome : les sources de Plan, la configuration de Vite, un
// `package.json` reduit a ce que le build demande, et `app.js` (ecrit a la main, jamais touche
// ici). Sur l'hote : `npm install`, puis `node app.js`, qui construit `dist/` au premier
// demarrage et le sert. Aucun HTML pre-construit ne voyage.
//
// Ce script recopie les sources telles qu'elles sont dans le depot : il se relance a chaque
// version, comme on recopiait `livraison/`.

import { readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cible = resolve(racine, 'buildsg');

// Ce que `vite build` lit, et rien d'autre : pas de tests, pas de documentation.
const COPIES = ['src', 'index.html', 'vite.config.ts', 'tsconfig.json', 'deploy/htaccess.template'];
// Les seuls paquets que le build importe. `three` n'est importe qu'en types : la page le charge
// depuis un CDN a l'execution. Tout va dans `dependencies` : un `npm install` de production
// ignorerait des `devDependencies`, et le build ne se ferait pas.
const PAQUETS = ['react', 'react-dom', 'zustand', 'vite', '@vitejs/plugin-react', 'vite-plugin-singlefile'];

for (const chemin of [...COPIES, 'package-lock.json', 'SOURCE']) rmSync(resolve(cible, chemin), { recursive: true, force: true });
rmSync(resolve(cible, 'deploy'), { recursive: true, force: true });
mkdirSync(resolve(cible, 'deploy'), { recursive: true });
for (const chemin of COPIES) cpSync(resolve(racine, chemin), resolve(cible, chemin), { recursive: true });

const depot = JSON.parse(readFileSync(resolve(racine, 'package.json'), 'utf8'));
const versions = { ...depot.devDependencies, ...depot.dependencies };
const dependencies = {};
for (const p of PAQUETS) {
  if (!versions[p]) throw new Error('generer-buildsg : ' + p + ' absent du package.json du depot');
  dependencies[p] = versions[p];
}
writeFileSync(resolve(cible, 'package.json'), JSON.stringify({
  name: depot.name + '-siteground',
  version: depot.version,
  private: true,
  type: 'module',
  description: 'Plan interactif, application Node.js pour SiteGround : construit sur le serveur, servi par app.js.',
  main: 'app.js',
  engines: depot.engines,
  scripts: {
    start: 'node app.js',
    build: 'node app.js --build'
  },
  dependencies
}, null, 2) + '\n');

// L'empreinte de ce qui a ete recopie : `app.js` reconstruit quand elle change, et seulement alors.
let commit = 'inconnu';
try { commit = execSync('git rev-parse HEAD', { cwd: racine, encoding: 'utf8' }).trim(); } catch { /* hors depot git */ }
writeFileSync(resolve(cible, 'SOURCE'), depot.version + ' ' + commit + '\n');

// Le verrou, pour que l'hote installe les memes versions qu'ici.
try {
  execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { cwd: cible, stdio: 'ignore' });
} catch {
  console.warn('generer-buildsg : package-lock.json non genere (reseau ?), l\'hote resoudra les versions lui-meme.');
}
console.log('buildsg/ : sources ' + depot.version + ' (' + commit.slice(0, 7) + ') recopiees.');
