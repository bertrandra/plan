// Fait passer les projets d'un hote `api.php` a la ressource `projects` de la plateforme.
//
//   node scripts/migrer-projets.mjs https://plan1.raillard.org https://<plateforme> <adresse> [--pour-de-vrai]
//
// A blanc par defaut : sans `--pour-de-vrai`, le script lit tout, verifie tout, et n'ecrit rien.
// C'est la seule facon raisonnable de decouvrir qu'un projet ne passera pas avant d'en avoir ecrit
// la moitie (MD/spec-connexion-plateforme.md §6.3).
//
// Ce qu'il fait, dans l'ordre :
//
//   1. lit la liste et chaque projet de l'ancien hote ;
//   2. ouvre une session sur la plateforme, avec le compte qu'on lui donne ;
//   3. cree un projet par ancien projet, le document tel quel ;
//   4. relit chacun et compare octet pour octet le document renvoye a celui envoye ;
//   5. imprime la table de correspondance des identifiants, ancien vers nouveau.
//
// Le point 5 n'est pas de la decoration : les gens ont mis `?projet=<id>` dans leurs marque-pages,
// et sans cette table on ne peut plus leur dire ou est passe leur plan.
//
// Le mot de passe se donne par l'environnement (`MOT_DE_PASSE`), jamais en argument : une ligne de
// commande se retrouve dans l'historique du shell et dans la liste des processus.

import { createHash } from 'node:crypto';

const [, , ancienHote, plateforme, email, ...reste] = process.argv;
const pourDeVrai = reste.includes('--pour-de-vrai');
const motDePasse = process.env.MOT_DE_PASSE;

if (!ancienHote || !plateforme || !email) {
  console.error('Usage : node scripts/migrer-projets.mjs <ancien hote> <plateforme> <adresse> [--pour-de-vrai]');
  console.error('        MOT_DE_PASSE=… dans l environnement.');
  process.exit(2);
}
if (!motDePasse) { console.error('MOT_DE_PASSE manquant dans l environnement.'); process.exit(2); }

const base = plateforme.replace(/\/+$/, '');

/**
 * Une forme canonique : cles triees, recursivement.
 *
 * Comparer `JSON.stringify` brut serait faux, et l'essai du 22 septembre 2026 l'a montre — meme
 * longueur, 41 693 octets de part et d'autre, mais une divergence des le 31e caractere. La cause
 * est `jsonb` : PostgreSQL range les cles dans son propre ordre, et **le contrat de la plateforme a
 * tort de promettre que « l'ordre des cles est preserve »**. Ce qui est preserve, c'est le contenu.
 *
 * Cela n'atteint pas les six artefacts exportes : `projet.json` est ecrit par le serialiseur de
 * Plan, dans l'ordre de son code, a partir du modele en memoire — jamais recopie depuis le document
 * stocke. L'ordre du stockage ne remonte donc pas jusqu'a un export.
 */
function canonique(v) {
  if (Array.isArray(v)) return v.map(canonique);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonique(v[k])]));
  }
  return v;
}
const empreinte = (o) => createHash('sha256').update(JSON.stringify(canonique(o))).digest('hex');

// --- 1. L'ancien hote ---------------------------------------------------------------------------
const lireAncien = async (chemin) => {
  const r = await fetch(ancienHote.replace(/\/+$/, '') + chemin);
  if (!r.ok) throw new Error(chemin + ' : HTTP ' + r.status);
  return r.json();
};
const anciens = await lireAncien('/api.php?action=list');
console.log('\n' + anciens.length + ' projet(s) sur ' + ancienHote);

// --- 2. La session ------------------------------------------------------------------------------
let cookies = '';
const appeler = async (chemin, init = {}) => {
  const entetes = { 'X-Product': 'plan', ...(init.headers || {}) };
  if (cookies) entetes['Cookie'] = cookies;
  const r = await fetch(base + chemin, { ...init, headers: entetes });
  const poses = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  for (const c of poses) {
    const paire = c.split(';')[0];
    const nom = paire.split('=')[0];
    cookies = [...cookies.split('; ').filter((x) => x && !x.startsWith(nom + '=')), paire].join('; ');
  }
  return r;
};

const ouverture = await appeler('/api/v1/auth/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: motDePasse })
});
if (!ouverture.ok) { console.error('Connexion refusee : HTTP ' + ouverture.status); process.exit(1); }
const jeton = (await ouverture.json()).access_token;
const avecJeton = (init = {}) => ({ ...init, headers: { Authorization: 'Bearer ' + jeton, ...(init.headers || {}) } });

const ctx = await (await appeler('/api/v1/me/context', avecJeton())).json();
console.log('connecte : ' + ctx.user.email + ' / ' + ctx.tenant.slug + (pourDeVrai ? '' : '   (essai a blanc)') + '\n');

// --- 3 a 5 --------------------------------------------------------------------------------------
const table = [];
let refuses = 0;

for (const resume of anciens) {
  const projet = await lireAncien('/api.php?action=load&id=' + encodeURIComponent(resume.id));
  const { meta, ...document } = projet;
  const schema = (meta && meta.schemaVersion) || 1;

  if (!Array.isArray(document.objects)) {
    console.log('  REFUS  ' + resume.id + ' : aucun tableau « objects » dans le projet');
    refuses++;
    continue;
  }
  const attendue = empreinte(document);

  if (!pourDeVrai) {
    console.log('  a blanc ' + resume.id.padEnd(28) + ' ' + String(document.objects.length).padStart(3) + ' objets, schema ' + schema);
    table.push({ ancien: resume.id, nouveau: '(non ecrit)' });
    continue;
  }

  const cree = await appeler('/api/v1/projects', avecJeton({
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: resume.name || resume.id, schema_version: schema, document })
  }));
  if (!cree.ok) {
    console.log('  REFUS  ' + resume.id + ' : HTTP ' + cree.status + ' ' + JSON.stringify(await cree.json()).slice(0, 120));
    refuses++;
    continue;
  }
  const neuf = await cree.json();

  // 4. On relit, et on compare. Un aller-retour par JSONB n'est pas cense changer le document —
  //    c'est la garantie sur laquelle tout le stockage repose, donc c'est elle qu'on verifie.
  const relu = await (await appeler('/api/v1/projects/' + neuf.id, avecJeton())).json();
  const obtenue = empreinte(relu.document);
  const identique = obtenue === attendue;
  if (!identique) refuses++;
  console.log('  ' + (identique ? 'OK    ' : 'DIFFERE') + ' ' + resume.id.padEnd(28) + ' -> ' + neuf.id
    + '  ' + String(document.objects.length).padStart(3) + ' objets'
    + (identique ? '' : '   ALLER-RETOUR NON IDENTIQUE'));
  table.push({ ancien: resume.id, nouveau: neuf.id });
}

console.log('\n| ancien | nouveau |\n|---|---|');
for (const l of table) console.log('| `' + l.ancien + '` | `' + l.nouveau + '` |');
console.log('\n' + (refuses === 0
  ? table.length + ' projet(s) ' + (pourDeVrai ? 'migres, tous identiques a la relecture.' : 'prets a migrer.')
  : refuses + ' projet(s) en echec.'));
console.log(pourDeVrai ? 'Gardez les anciens fichiers en lecture seule 90 jours.\n' : 'Relancez avec --pour-de-vrai pour ecrire.\n');
process.exit(refuses === 0 ? 0 : 1);
