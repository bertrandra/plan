// La carte du programme livre (audit d'architecture, AD-10) : ce que pese chaque dossier de `src/` dans les fichiers
// `assets/`, morceau par morceau, et qui importe qui entre les dossiers (statiquement, ou a la demande par `import()`).
//
// Sans dependance de plus : le poids vient de Rollup lui-meme (la longueur rendue de chaque module dans son morceau, avant
// minification du morceau entier, donc une proportion et non des octets livres) ; le graphe, des imports ecrits dans les sources.
//
//   BACKPROD_API_URL=http://plateforme.test node scripts/carte-paquet.mjs [MD/carte-paquet.md]
//
// Sans fichier de sortie, le rapport s'ecrit sur la sortie standard.
import { build } from 'vite';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const racine = resolve(dirname(new URL(import.meta.url).pathname), '..');
const src = join(racine, 'src');
process.env.BACKPROD_API_URL ||= 'http://plateforme.test';

/** Le dossier de premier niveau de `src/` d'un module (ou les deux premiers, `niveaux` = 2), ou ce qu'il est s'il vient d'ailleurs. */
function dossierDe(id, niveaux = 1) {
  const propre = id.replace(/\?.*$/, '').replace(/^\0/, '');
  if (propre.includes('/node_modules/')) {
    const m = /\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(propre);
    return 'npm:' + (m ? m[1] : '?');
  }
  const r = relative(src, propre);
  if (r.startsWith('..')) return relative(racine, propre).split('/')[0] || propre;
  const parties = r.split('/');
  if (parties.length === 1) return '(racine de src)';
  return parties.length > niveaux ? parties.slice(0, niveaux).join('/') : parties.slice(0, -1).join('/') || parties[0];
}

// --- Le poids, morceau par morceau --------------------------------------------------------------------------------------
const morceaux = [];
const collecte = {
  name: 'carte-paquet',
  generateBundle(_options, bundle) {
    for (const [nom, sortie] of Object.entries(bundle)) {
      if (sortie.type !== 'chunk') continue;
      const parDossier = new Map(), parSousDossier = new Map();
      for (const [id, m] of Object.entries(sortie.modules)) {
        parDossier.set(dossierDe(id), (parDossier.get(dossierDe(id)) ?? 0) + m.renderedLength);
        parSousDossier.set(dossierDe(id, 2), (parSousDossier.get(dossierDe(id, 2)) ?? 0) + m.renderedLength);
      }
      morceaux.push({ nom, entree: sortie.isEntry, dynamique: sortie.isDynamicEntry, octets: sortie.code.length, parDossier, parSousDossier, ouvre: sortie.facadeModuleId ? relative(racine, sortie.facadeModuleId) : null });
    }
  }
};
// Le build ordinaire, dans `dist/` : la configuration (vite.config.ts) y relit la page qu'elle vient d'ecrire.
await build({ root: racine, logLevel: 'warn', plugins: [collecte] });

// --- Le graphe des imports entre dossiers --------------------------------------------------------------------------------
function fichiers(dossier) {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts') ? [p] : [];
  });
}
const aretes = new Map();
const noter = (de, vers, genre) => {
  if (de === vers) return;
  const cle = de + ' -> ' + vers;
  const a = aretes.get(cle) ?? { de, vers, statiques: 0, dynamiques: 0 };
  a[genre]++;
  aretes.set(cle, a);
};
for (const f of fichiers(src)) {
  const texte = readFileSync(f, 'utf8');
  const de = dossierDe(f);
  for (const m of texte.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"](\.[^'"]+)['"]/gm)) noter(de, dossierDe(resolve(dirname(f), m[1])), 'statiques');
  for (const m of texte.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) noter(de, dossierDe(resolve(dirname(f), m[1])), 'dynamiques');
}

// --- Le rapport ----------------------------------------------------------------------------------------------------------
const ko = (n) => (n / 1024).toFixed(0).padStart(6) + ' Ko';
const lignes = [];
const total = morceaux.reduce((t, m) => t + m.octets, 0);
lignes.push('# Carte du paquet', '', `Produite par \`scripts/carte-paquet.mjs\` le ${new Date().toISOString().slice(0, 10)}.`, '');
lignes.push(`## Morceaux livrés (${morceaux.length}, ${ko(total).trim()} au total)`, '', 'Un morceau partagé est importé par plusieurs autres ; « à la demande » : derrière un `import()`.', '', '| Morceau | Ouvert par | Chargé | Taille |', '|---|---|---|---:|');
for (const m of [...morceaux].sort((a, b) => b.octets - a.octets)) lignes.push(`| \`${m.nom}\` | ${m.ouvre ? '`' + m.ouvre + '`' : '—'} | ${m.entree ? 'au démarrage' : m.dynamique ? 'à la demande' : 'partagé'} | ${ko(m.octets).trim()} |`);
lignes.push('', '## Poids par dossier (avant minification, en part du programme)', '', '| Dossier | Part | Dans les morceaux chargés au démarrage |', '|---|---:|---:|');
const parDossier = new Map(), auDemarrage = new Map();
for (const m of morceaux) for (const [d, n] of m.parDossier) {
  parDossier.set(d, (parDossier.get(d) ?? 0) + n);
  if (m.entree) auDemarrage.set(d, (auDemarrage.get(d) ?? 0) + n);
}
const somme = [...parDossier.values()].reduce((a, b) => a + b, 0);
for (const [d, n] of [...parDossier].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  lignes.push(`| ${d} | ${((100 * n) / somme).toFixed(1)} % | ${n ? (((auDemarrage.get(d) ?? 0) / n) * 100).toFixed(0) : 0} % |`);
}
lignes.push('', '## Les plus lourds sous-dossiers', '', '| Sous-dossier | Part |', '|---|---:|');
const parSous = new Map();
for (const m of morceaux) for (const [d, n] of m.parSousDossier) parSous.set(d, (parSous.get(d) ?? 0) + n);
for (const [d, n] of [...parSous].sort((a, b) => b[1] - a[1]).slice(0, 25)) lignes.push(`| ${d} | ${((100 * n) / somme).toFixed(1)} % |`);
lignes.push('', '## Imports entre dossiers de `src/`', '', 'Imports de valeurs seulement (les `import type` disparaissent à la compilation). « À la demande » : `import()`.', '');
lignes.push('| De | Vers | Statiques | À la demande |', '|---|---|---:|---:|');
for (const a of [...aretes.values()].sort((x, y) => x.de.localeCompare(y.de) || y.statiques - x.statiques)) {
  lignes.push(`| ${a.de} | ${a.vers} | ${a.statiques} | ${a.dynamiques} |`);
}
const texte = lignes.join('\n') + '\n';
const cible = process.argv[2];
if (cible) { writeFileSync(resolve(racine, cible), texte); console.log('carte-paquet : ' + cible); }
else process.stdout.write(texte);
