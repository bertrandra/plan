// Aucun secret dans le fichier livre.
//
//   node scripts/verifier-paquet.mjs          verifie dist/index.html
//   node scripts/verifier-paquet.mjs livraison/index.html
//
// MD/spec-connexion-plateforme.md §2 : le paquet ne porte que deux faits, tous deux publics —
// l'origine de la plateforme et le code produit. La cle produit `bpk_…` et le secret de webhook
// `bwh_…` sont des secrets de serveur, et Plan n'a pas de serveur.
//
// **Ce garde-fou tourne alors qu'aucune cle n'existe encore, et c'est le but.** Le jour ou une cle
// existera, la question ne sera plus « faut-il verifier » mais « pourquoi la verification est-elle
// rouge » — ce qui est la seule forme de vigilance qui survit a six mois de silence.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cible = resolve(racine, process.argv[2] || 'dist/index.html');

if (!existsSync(cible)) {
  console.error('verifier-paquet : ' + cible + ' est absent. `npm run build` d\'abord.');
  process.exit(2);
}
// La page et le programme qu'elle appelle (assets/plan-<empreinte>.js, deploy/scripts-page.mjs) :
// un secret peut se trouver dans l'un comme dans l'autre, et l'origine de la plateforme est dans le
// programme.
const pageHtml = readFileSync(cible, 'utf8');
const programmes = [...pageHtml.matchAll(/<script[^>]*\ssrc="(assets\/plan-[0-9a-f]+\.js)"/g)].map((m) => m[1]);
const absents = programmes.filter((f) => !existsSync(join(dirname(cible), f)));
if (absents.length) {
  console.error('verifier-paquet : la page appelle ' + absents.join(', ') + ', absent a cote d\'elle.');
  process.exit(2);
}
const paquet = [pageHtml, ...programmes.map((f) => readFileSync(join(dirname(cible), f), 'utf8'))].join('\n');

/**
 * Ce qu'on refuse, et comment le reconnaitre.
 *
 * Les motifs portent sur le format des identifiants de la plateforme, pas sur des noms de
 * variables : c'est la valeur qui fuit, pas son etiquette. `bpk_` est suivi de douze hexa puis d'un
 * souligne (PostgresProductKeys), `bwh_` d'un base64url ; un `eyJ` est un jeton JWT qu'on aurait
 * fige par accident dans une fixture ou un commentaire.
 */
const INTERDITS = [
  { nom: 'cle produit', motif: /bpk_[0-9a-f]{12}_/, pourquoi: 'une cle produit permet de declarer la consommation de n\'importe quel locataire' },
  { nom: 'secret de webhook', motif: /bwh_[A-Za-z0-9_-]{20,}/, pourquoi: 'un secret de webhook permet de forger un evenement de la plateforme' },
  { nom: 'jeton de session', motif: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, pourquoi: 'un jeton fige est la session de quelqu\'un' }
];

const trouves = INTERDITS.filter((i) => i.motif.test(paquet));

// Les deux constantes publiques doivent, elles, etre reconnaissables : si une plateforme est
// branchee, son origine est forcement dans le paquet, et c'est normal. On le dit, pour que la
// sortie du garde-fou serve aussi de releve de ce qu'on livre.
//
// L'origine est stockee SEULE : les chemins du contrat s'y ajoutent a l'execution. Chercher
// `https://…/api/v1` ne trouvait donc jamais rien, et le garde-fou annoncait « aucune plateforme »
// sur un paquet qui en portait une. On cherche une origine qui ne soit aucune des origines
// tierces que le programme nomme par ailleurs (IGN, BAN, CDN, textures).
const TIERCES = /^https:\/\/(api-adresse\.data\.gouv\.fr|apicarto\.ign\.fr|data\.geopf\.fr|www\.geoportail-urbanisme\.gouv\.fr|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|(api|cdn|dl)\.polyhaven\.(com|org)|api\.panoramax\.xyz|panoramax\.(openstreetmap|ign)\.fr)$/;
const origine = [...new Set((paquet.match(/"https:\/\/[a-z0-9.-]+"/g) || []).map((s) => s.slice(1, -1)))]
  .filter((o) => !TIERCES.test(o)).map((o) => [o]).find(Boolean);

console.log('\n' + cible.replace(racine, '.') + '  ' + paquet.length.toLocaleString('fr-FR') + ' octets'
  + (programmes.length ? ' (page et ' + programmes.join(', ') + ')' : ''));
console.log(origine ? '  origine de la plateforme presente : ' + origine[0] : '  aucune plateforme branchee dans ce paquet');

// La description du produit (src/model/produit.ts) doit etre la, lisible sans executer la page :
// c'est elle que la plateforme lit pour connaitre les schemas acceptes.
const bloc = /<script type="application\/json" id="plan-produit">([\s\S]*?)<\/script>/.exec(paquet);
let description = null;
try { description = bloc ? JSON.parse(bloc[1]) : null; } catch { description = null; }
const descriptionOk = !!(description && typeof description.app_version === 'string' && Array.isArray(description.schema_versions));
console.log('  ' + (descriptionOk ? 'OK   ' : 'REFUS') + '  description du produit'
  + (descriptionOk ? ' : ' + JSON.stringify(description) : ' absente ou illisible'));
for (const i of INTERDITS) {
  const mauvais = i.motif.test(paquet);
  console.log('  ' + (mauvais ? 'REFUS' : 'OK   ') + '  ' + i.nom);
  if (mauvais) console.log('         ' + i.pourquoi);
}
console.log('');

if (trouves.length) {
  console.error('verifier-paquet : ' + trouves.length + ' secret(s) dans le fichier livre. Ce paquet ne part pas.');
  process.exit(1);
}
if (!descriptionOk) {
  console.error('verifier-paquet : la description du produit (plan-produit) manque. La plateforme ne saurait pas quels schemas accepter.');
  process.exit(1);
}
process.exit(0);
