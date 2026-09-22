// Engendre `src/plateforme/contrat.ts` depuis le contrat epingle, ou verifie qu'il est a jour.
//
//   node scripts/generer-client.mjs              ecrit le fichier
//   node scripts/generer-client.mjs --verifier   ne l'ecrit pas, echoue s'il differe  (gate:client)
//
// La regle que ce garde-fou fait tenir, empruntee a ADR-036 de la plateforme et appliquee a travers
// une frontiere de depot : **aucun appel n'est ecrit a la main.** Les types et la table des
// operations viennent du contrat, donc un champ que la plateforme renomme casse le build de Plan et
// non l'apres-midi d'un client. Le fichier engendre est suivi par git : on veut voir le diff.
//
// Ce n'est pas un generateur openapi complet, et il ne cherche pas a l'etre. Il couvre ce que le
// contrat epingle contient reellement (MD/spec-connexion-plateforme.md §16, etape 0) et **echoue
// bruyamment** sur une construction qu'il ne sait pas traduire, plutot que de produire un `unknown`
// que personne ne remarquerait.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(racine, 'src/plateforme/contrat.ts');
const verifier = process.argv.includes('--verifier');
const contrat = JSON.parse(readFileSync(join(racine, 'contrat/backprod.openapi.json'), 'utf8'));

const erreurs = [];
const nomDeRef = (ref) => ref.split('/').pop();

/** Un schema openapi en un type TypeScript. `nul` porte le `| null` des types nullables. */
function typeDe(schema, chemin, indent = '  ') {
  if (!schema || typeof schema !== 'object') { erreurs.push(chemin + ' : schema vide'); return 'unknown'; }
  if (schema.$ref) return nomDeRef(schema.$ref);

  if (schema.allOf) {
    return schema.allOf.map((s, i) => typeDe(s, chemin + '.allOf[' + i + ']', indent)).join(' & ');
  }
  if (schema.oneOf || schema.anyOf) {
    const liste = schema.oneOf || schema.anyOf;
    return liste.map((s, i) => typeDe(s, chemin + '.oneOf[' + i + ']', indent)).join(' | ');
  }

  // Le contrat se dit 3.1 mais melange les deux conventions de nullabilite : `"type": ["string",
  // "null"]` dans les schemas nommes, et le `"nullable": true` de la 3.0 dans les reponses ecrites
  // en ligne — douze fois contre onze au commit epingle. Ne lire que l'une produisait un
  // `email: string` la ou la plateforme rend `null`, c'est-a-dire un type qui ment.
  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
  const nul = types.includes('null') || schema.nullable === true;
  const base = types.filter((t) => t !== 'null');
  const avecNul = (t) => (nul ? t + ' | null' : t);

  if (schema.enum) {
    const valeurs = schema.enum.map((v) => (typeof v === 'string' ? "'" + v + "'" : String(v)));
    return avecNul(valeurs.join(' | '));
  }
  if (!base.length) {
    // Un objet sans `type` mais avec des proprietes reste un objet ; sinon c'est un trou du contrat.
    if (schema.properties) return avecNul(objet(schema, chemin, indent));
    if (schema.additionalProperties === true) return avecNul('Record<string, unknown>');
    erreurs.push(chemin + ' : sans type exploitable');
    return 'unknown';
  }
  const t = base[0];
  if (t === 'string') return avecNul('string');
  if (t === 'integer' || t === 'number') return avecNul('number');
  if (t === 'boolean') return avecNul('boolean');
  if (t === 'array') return avecNul(typeDe(schema.items, chemin + '[]', indent) + '[]');
  if (t === 'object') {
    if (schema.properties) return avecNul(objet(schema, chemin, indent));
    return avecNul('Record<string, unknown>');
  }
  erreurs.push(chemin + ' : type « ' + t + ' » inconnu');
  return 'unknown';
}

/** Un objet a proprietes, ecrit en ligne et indente pour rester lisible. */
function objet(schema, chemin, indent) {
  const requis = new Set(schema.required || []);
  const lignes = Object.entries(schema.properties).map(([nom, sous]) => {
    const t = typeDe(sous, chemin + '.' + nom, indent + '  ');
    const doc = sous.description ? indent + '  /** ' + sous.description.replace(/\s+/g, ' ').slice(0, 110) + ' */\n' : '';
    return doc + indent + '  ' + (/^[A-Za-z_$][\w$]*$/.test(nom) ? nom : "'" + nom + "'") + (requis.has(nom) ? '' : '?') + ': ' + t + ';';
  });
  return '{\n' + lignes.join('\n') + '\n' + indent + '}';
}

// ---------------------------------------------------------------------------------------------
// Les types nommes du contrat.
// ---------------------------------------------------------------------------------------------
const morceaux = [];
for (const [nom, schema] of Object.entries(contrat.components.schemas || {})) {
  const doc = schema.description ? '/** ' + schema.description.replace(/\s+/g, ' ').slice(0, 220) + ' */\n' : '';
  morceaux.push(doc + 'export type ' + nom + ' = ' + typeDe(schema, nom, '') + ';\n');
}

// ---------------------------------------------------------------------------------------------
// Les operations : methode, chemin, parametres, corps, reponse.
// ---------------------------------------------------------------------------------------------
const operations = [];
for (const [chemin, noeud] of Object.entries(contrat.paths)) {
  for (const [methode, op] of Object.entries(noeud)) {
    if (methode === 'parameters') continue;
    const params = [...(noeud.parameters || []), ...(op.parameters || [])]
      .map((p) => (p.$ref ? contrat.components.parameters[nomDeRef(p.$ref)] : p))
      .filter(Boolean);
    const succes = Object.keys(op.responses).find((s) => /^2/.test(s));
    const schemaSucces = op.responses[succes]?.content?.['application/json']?.schema;
    const corps = op.requestBody?.content?.['application/json']?.schema;
    operations.push({
      id: op.operationId, methode: methode.toUpperCase(), chemin, succes,
      resume: (op.summary || '').replace(/\s+/g, ' '),
      cheminParams: params.filter((p) => p.in === 'path').map((p) => p.name),
      entetes: params.filter((p) => p.in === 'header').map((p) => ({ nom: p.name, requis: !!p.required })),
      requete: params.filter((p) => p.in === 'query').map((p) => p.name),
      corps: corps ? typeDe(corps, op.operationId + '.corps', '  ') : null,
      reponse: schemaSucces ? typeDe(schemaSucces, op.operationId + '.reponse', '  ') : 'void'
    });
  }
}
operations.sort((a, b) => a.id.localeCompare(b.id));

if (erreurs.length) {
  console.error('Le contrat porte ' + erreurs.length + ' construction(s) que le generateur ne sait pas traduire :');
  erreurs.slice(0, 12).forEach((e) => console.error('  ' + e));
  process.exit(1);
}

for (const op of operations) {
  const doc = op.resume ? '/** ' + op.resume.slice(0, 200) + ' */\n' : '';
  morceaux.push(doc + 'export type Reponse' + majuscule(op.id) + ' = ' + op.reponse + ';\n');
  if (op.corps) morceaux.push('export type Corps' + majuscule(op.id) + ' = ' + op.corps + ';\n');
}

const table = operations.map((op) => {
  const entetes = op.entetes.length ? '[' + op.entetes.map((e) => "{ nom: '" + e.nom + "', requis: " + e.requis + ' }').join(', ') + ']' : '[]';
  return "  " + op.id + ": {\n" +
    "    methode: '" + op.methode + "',\n" +
    "    chemin: '" + op.chemin + "',\n" +
    "    succes: " + op.succes + ",\n" +
    "    cheminParams: [" + op.cheminParams.map((p) => "'" + p + "'").join(', ') + "],\n" +
    "    entetes: " + entetes + ",\n" +
    "    requete: [" + op.requete.map((p) => "'" + p + "'").join(', ') + "]\n" +
    "  }";
}).join(',\n');

function majuscule(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const sortie = `// ENGENDRE PAR scripts/generer-client.mjs — NE PAS MODIFIER A LA MAIN.
//
// Source : contrat/backprod.openapi.json, extrait de la plateforme au commit
// ${contrat['x-source-commit']}.
// Regenerer : node scripts/generer-client.mjs — verifier : npm run gate:client
//
// ${operations.length} operations, ${Object.keys(contrat.components.schemas || {}).length} schemas. Ce fichier ne contient aucun appel : il dit ce que la
// plateforme promet. Qui appelle, et comment, est le travail de l'etape 1
// (MD/spec-connexion-plateforme.md §16).

${morceaux.join('\n')}
/**
 * Ou vivent les operations, pour que personne n'ecrive une URL a la main.
 *
 * \`chemin\` porte ses trous \`{nom}\` tels que le contrat les ecrit ; \`cheminParams\` les nomme, dans
 * l'ordre ou ils apparaissent. \`succes\` est le seul statut 2xx que le contrat declare — un autre
 * est une surprise, pas un succes.
 */
export const OPERATIONS = {
${table}
} as const;

export type IdOperation = keyof typeof OPERATIONS;
`;

const actuel = (() => { try { return readFileSync(SORTIE, 'utf8'); } catch { return null; } })();

if (verifier) {
  if (actuel === sortie) { console.log('gate:client : le client engendre est a jour (' + operations.length + ' operations).'); process.exit(0); }
  console.error('gate:client : ' + (actuel === null
    ? 'src/plateforme/contrat.ts est absent.'
    : 'src/plateforme/contrat.ts ne correspond plus au contrat epingle.'));
  console.error('Le contrat a bouge, ou le fichier a ete modifie a la main. Relancer :');
  console.error('  node scripts/generer-client.mjs');
  console.error('puis relire le diff : un champ disparu est une rupture pour Plan.');
  process.exit(1);
}

writeFileSync(SORTIE, sortie);
console.log('src/plateforme/contrat.ts  ' + operations.length + ' operations, ' + Object.keys(contrat.components.schemas || {}).length + ' schemas.');
