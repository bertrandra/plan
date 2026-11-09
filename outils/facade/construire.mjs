// Construit facade.html, a la racine du depot : une page autonome (aucun fichier a cote, aucun
// reseau), qui embarque la chaine de calibration de src/facade/ sans la modifier.
//
//   node outils/facade/construire.mjs              ecrit facade.html
//   node outils/facade/construire.mjs --verifier   joue verifier.ts (photos synthetiques)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '../..');

if (process.argv.includes('--verifier')) {
  const sortie = resolve(racine, 'node_modules/.cache/facade-verifier.mjs');
  await build({ entryPoints: [resolve(ici, 'verifier.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'warning' });
  execFileSync(process.execPath, [sortie], { stdio: 'inherit' });
  process.exit(0);
}

const r = await build({ entryPoints: [resolve(ici, 'main.ts')], bundle: true, format: 'iife', target: ['es2020', 'safari14'], minify: true, write: false, logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const modele = readFileSync(resolve(ici, 'modele.html'), 'utf8');
const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: racine }).toString().trim();
  } catch {
    return 'inconnu';
  }
})();
const html = modele.replace('/*SCRIPT*/', () => js).replaceAll('{{COMMIT}}', commit);
writeFileSync(resolve(racine, 'facade.html'), html);
console.log('facade.html : ' + Math.round(html.length / 1024) + ' Ko (commit ' + commit + ')');
