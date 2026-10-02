// Assemble `livraison/` : le deploiement Apache + PHP, sans Node (MD/spec-demos-admin.md).
//
//   npm run livraison                       origine de production (https://www.raillard.org)
//   BACKPROD_API_URL=https://… npm run livraison
//
// Le dossier produit se depose tel quel dans le dossier publie de l'hote (public_html/ ou un
// sous-dossier). `livraison.zip`, a cote, est le meme contenu en une archive a televerser.
//
//   index.html                 l'application, un seul fichier
//   .htaccess                  en-tetes, politique de contenu, renvoi de `admin/…` vers admin.php
//   admin.php                  l'admin des fichiers de demo (mot de passe verifie ici)
//   admin-config.exemple.php   a copier HORS du dossier publie, mot de passe a changer
//   plan-demos/1.json          la demonstration integree, premiere demo de l'admin (a poser hors racine)
//   LISEZMOI-DEPLOIEMENT.txt   les etapes

import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = resolve(racine, 'livraison');
const origine = process.env.BACKPROD_API_URL || 'https://www.raillard.org';

execSync('npx vite build', { cwd: racine, stdio: 'inherit', env: { ...process.env, BACKPROD_API_URL: origine } });
execSync('node scripts/verifier-paquet.mjs dist/index.html', { cwd: racine, stdio: 'inherit' });

rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
cpSync(resolve(racine, 'dist/index.html'), resolve(sortie, 'index.html'));
cpSync(resolve(racine, 'dist/.htaccess'), resolve(sortie, '.htaccess'));
cpSync(resolve(racine, 'deploy/admin.php'), resolve(sortie, 'admin.php'));
cpSync(resolve(racine, 'deploy/admin-config.exemple.php'), resolve(sortie, 'admin-config.exemple.php'));

const version = JSON.parse(readFileSync(resolve(racine, 'package.json'), 'utf8')).version;

// La premiere demo de l'admin : la demonstration integree, au format de l'export ({meta, objects,
// measures}). Elle vient de contrat/plan-produit.json, que tests/unit/contrat-produit.test.ts garde
// identique au code (model/demo.ts) : la livraison n'a pas a compiler du TypeScript pour l'avoir.
// Pas d'horodatage dans `meta` : deux livraisons du meme commit donnent le meme fichier.
const contrat = JSON.parse(readFileSync(resolve(racine, 'contrat/plan-produit.json'), 'utf8'));
const demo = contrat.demo_project;
if (!demo || !Array.isArray(demo.document?.objects) || !demo.document.objects.length) {
  throw new Error('contrat/plan-produit.json : pas de demo_project a livrer');
}
mkdirSync(resolve(sortie, 'plan-demos'), { recursive: true });
writeFileSync(resolve(sortie, 'plan-demos/1.json'), JSON.stringify({
  meta: { id: '1', name: demo.name, appVersion: contrat.app_version, schemaVersion: demo.schema_version, exportedBy: 'livraison' },
  objects: demo.document.objects,
  measures: demo.document.measures || []
}, null, 2) + '\n');
let commit = 'inconnu';
try { commit = execSync('git rev-parse --short HEAD', { cwd: racine, encoding: 'utf8' }).trim(); } catch { /* hors git */ }

writeFileSync(resolve(sortie, 'LISEZMOI-DEPLOIEMENT.txt'), `Plan ${version} (${commit}) - deploiement Apache + PHP, sans Node.js
Plateforme : ${origine}

1. Televerser le contenu de ce dossier (fichiers caches compris : .htaccess) dans le dossier
   publie, par exemple public_html/ (Gestionnaire de fichiers de Site Tools, ou FTP).
   Ne pas y laisser d'ancien api.php ni de dossier data/.

2. Admin des demos (facultatif) :
   a. Copier admin-config.exemple.php a cote de public_html/ (le dossier au-dessus de la racine
      web, pas dedans), sous le nom plan-admin-config.php. Cela vaut aussi si Plan est dans un
      sous-dossier de public_html/.
   b. Y remplacer « A-CHANGER » par le mot de passe admin.
   c. Copier aussi le dossier plan-demos/ de cette livraison a cote de plan-admin-config.php,
      hors du dossier publie. Il contient 1.json, la demonstration integree, premiere demo de
      l'admin. Les demos enregistrees ensuite y sont rangees : une nouvelle mise en ligne ne les
      touche pas. Si plan-demos/ existe deja la-bas, ne pas l'ecraser : ce sont vos demos.
      Laisse dans public_html/, il est refuse par .htaccess (404) et l'admin ne le voit pas.
   Sans ce fichier de configuration, l'admin n'existe pas (admin/... repond 404).

3. Verifier :
   - https://<hote>/                 l'atelier (connexion plateforme)
   - https://<hote>/?admin           le mot de passe admin, puis les demos
   - https://<hote>/?demofile=1      la demo 1 (admin seulement)
   - https://<hote>/admin/demos      doit repondre 401 sans session
   - https://<hote>/?mode=demo&file=1   la vitrine publique sur la demo 1 (sans mot de passe)
   - npm run verifier-deploiement https://<hote>   (depuis le depot)

Une demo est un fichier JSON au format de l'export de Plan ({meta, objects, measures}).
Sans aucune demo (plan-demos/ absent ou vide), le premier ?admin propose d'en creer une : « Ouvrir
le plan de demonstration » cree la demo 1.
`);

const zip = resolve(racine, 'livraison.zip');
rmSync(zip, { force: true });
execSync('zip -q -r ' + JSON.stringify(zip) + ' .', { cwd: sortie });
if (!existsSync(zip)) throw new Error('livraison.zip absent');
console.log('livraison/ et livraison.zip : Plan ' + version + ' (' + commit + '), plateforme ' + origine);
