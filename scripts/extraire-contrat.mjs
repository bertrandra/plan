// Extrait de l'openapi.json de la plateforme la part que Plan utilise, et l'epingle.
//
//   node scripts/extraire-contrat.mjs ../backprod
//
// Pourquoi extraire plutot que copier : le contrat complet fait 676 Ko et decrit cinq produits, une
// console, une facturation et une chaine de vente. Plan en utilise onze operations. Copier le tout
// rendrait toute relecture impossible et ferait bouger le contrat epingle a chaque changement qui
// ne nous concerne pas. On garde donc la fermeture transitive des onze operations — leurs
// parametres, leurs corps, leurs reponses, et tous les schemas que ceux-la referencent.
//
// Ce que ce script produit est SUIVI PAR GIT et relu comme du code :
//   contrat/backprod.openapi.json   la part extraite
//   contrat/SOURCE.md               d'ou elle vient, a quel commit, et comment la rafraichir
//
// Rafraichir le contrat est un geste deliberé : on relance ce script, on relit le diff, et
// `npm run gate:client` dit si le client genere doit changer avec lui.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Les operations que Plan appelle, et rien d'autre.
 *
 * Elles viennent de MD/spec-connexion-plateforme.md : la session (§3), le contexte (§3.4) et les
 * projets (§6.1). Ajouter une ligne ici est la seule facon d'elargir le contrat epingle — et cela
 * doit se voir dans le diff, d'ou la liste ecrite a la main plutot que deduite.
 */
const OPERATIONS = [
  'signIn', 'refreshSession', 'signOut',
  'showMyContext',
  'listProjects', 'createProject',
  'showProject', 'updateProject', 'deleteProject',
  'duplicateProject', 'listProjectVersions',
  'restoreProject', 'undeleteProject'
];

const depotPlateforme = process.argv[2];
if (!depotPlateforme) {
  console.error('Usage : node scripts/extraire-contrat.mjs <chemin du depot backprod>');
  process.exit(2);
}

const source = resolve(depotPlateforme, 'openapi.json');
const contrat = JSON.parse(readFileSync(source, 'utf8'));

let commit = 'inconnu';
let depotUrl = 'inconnu';
try {
  commit = execFileSync('git', ['-C', depotPlateforme, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  depotUrl = execFileSync('git', ['-C', depotPlateforme, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
} catch { /* un depot sans git reste extractible, il est juste moins tracable */ }

// ---------------------------------------------------------------------------------------------
// 1. Retenir les chemins qui portent une operation voulue.
// ---------------------------------------------------------------------------------------------
const restants = new Set(OPERATIONS);
const chemins = {};
for (const [chemin, noeud] of Object.entries(contrat.paths || {})) {
  const garde = {};
  for (const [methode, op] of Object.entries(noeud)) {
    if (methode === 'parameters') continue;
    if (op && OPERATIONS.includes(op.operationId)) { garde[methode] = op; restants.delete(op.operationId); }
  }
  if (!Object.keys(garde).length) continue;
  if (noeud.parameters) garde.parameters = noeud.parameters;
  chemins[chemin] = garde;
}
if (restants.size) {
  console.error('Operations introuvables dans le contrat source : ' + [...restants].join(', '));
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// 2. Fermeture transitive des $ref, plus les schemas de securite que les operations nomment.
// ---------------------------------------------------------------------------------------------
const voulus = new Set();
function suivre(noeud) {
  if (!noeud || typeof noeud !== 'object') return;
  if (Array.isArray(noeud)) { noeud.forEach(suivre); return; }
  for (const [cle, valeur] of Object.entries(noeud)) {
    if (cle === '$ref' && typeof valeur === 'string') {
      if (voulus.has(valeur)) continue;
      voulus.add(valeur);
      suivre(resoudre(valeur));
    } else suivre(valeur);
  }
}
function resoudre(ref) {
  return ref.replace(/^#\//, '').split('/').reduce((n, p) => (n ? n[p] : undefined), contrat);
}
suivre(chemins);

const securites = new Set();
for (const noeud of Object.values(chemins)) {
  for (const [methode, op] of Object.entries(noeud)) {
    if (methode === 'parameters') continue;
    for (const s of op.security || []) Object.keys(s).forEach((n) => securites.add(n));
  }
}
for (const s of contrat.security || []) Object.keys(s).forEach((n) => securites.add(n));

// ---------------------------------------------------------------------------------------------
// 3. Reconstruire, en gardant l'ordre des cles stable pour que le diff soit lisible.
// ---------------------------------------------------------------------------------------------
const composants = {};
for (const ref of [...voulus].sort()) {
  // `#/components/schemas/Session` → section « components », sous-section « schemas », cle « Session ».
  const [section, sousSection, cle] = ref.replace(/^#\//, '').split('/');
  if (section !== 'components' || !sousSection || !cle) continue;
  (composants[sousSection] ||= {})[cle] = resoudre(ref);
}
if (securites.size) {
  composants.securitySchemes = {};
  for (const n of [...securites].sort()) {
    const s = contrat.components?.securitySchemes?.[n];
    if (s) composants.securitySchemes[n] = s;
  }
}
for (const sousSection of Object.keys(composants)) {
  composants[sousSection] = Object.fromEntries(Object.entries(composants[sousSection]).sort(([a], [b]) => a.localeCompare(b)));
}

const extrait = {
  openapi: contrat.openapi,
  info: { title: contrat.info?.title, version: contrat.info?.version },
  'x-extrait-par': 'scripts/extraire-contrat.mjs — la part que Plan utilise, pas le contrat entier',
  'x-source-commit': commit,
  paths: Object.fromEntries(Object.entries(chemins).sort(([a], [b]) => a.localeCompare(b))),
  components: Object.fromEntries(Object.entries(composants).sort(([a], [b]) => a.localeCompare(b)))
};

mkdirSync(join(racine, 'contrat'), { recursive: true });
writeFileSync(join(racine, 'contrat/backprod.openapi.json'), JSON.stringify(extrait, null, 2) + '\n');

const compteSchemas = Object.keys(composants.schemas || {}).length;
writeFileSync(join(racine, 'contrat/SOURCE.md'),
`# D'ou vient ce contrat

**Depot :** ${depotUrl}
**Commit epingle :** \`${commit}\`
**Extrait le :** ${new Date().toISOString().slice(0, 10)}

\`backprod.openapi.json\` n'est pas le contrat entier de la plateforme : c'est la fermeture
transitive des ${OPERATIONS.length} operations que Plan appelle, produite par
[\`../scripts/extraire-contrat.mjs\`](../scripts/extraire-contrat.mjs). Le contrat complet fait
676 Ko et decrit cinq produits, une console, une facturation et une chaine de vente ; Plan n'en
utilise rien d'autre que ceci.

| | |
|---|---|
| Operations | ${OPERATIONS.length} |
| Chemins | ${Object.keys(chemins).length} |
| Schemas | ${compteSchemas} |

Les operations, dans l'ordre ou la specification les introduit
([\`../MD/spec-connexion-plateforme.md\`](../MD/spec-connexion-plateforme.md) §3, §3.4, §6.1) :

${OPERATIONS.map((o) => '- `' + o + '`').join('\n')}

## Rafraichir

\`\`\`bash
node scripts/extraire-contrat.mjs ../backprod
npm run gate:client
\`\`\`

Le premier reecrit ce dossier, le second dit si \`src/plateforme/contrat.ts\` doit changer avec lui.
Les deux diffs se relisent : un champ qui disparait du contrat est une rupture pour Plan, et c'est
exactement ce que cette epingle sert a voir avant un client, pas apres.
`);

console.log('contrat/backprod.openapi.json  ' + Object.keys(chemins).length + ' chemins, ' + compteSchemas + ' schemas, commit ' + commit.slice(0, 12));
