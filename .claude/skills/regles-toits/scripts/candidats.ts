// Cas candidats Panoramax (MD/spec-regles-toits.md §13.3 phase 4 et §14.5, usage 3 de Claude
// analyste ; lot G3 bis) : pour un village releve par village.mjs (skill toits), les photos de rue
// qui voient chaque batiment, trois passes de Claude par les routes de l'analyse du serveur de Plan
// (usage `candidats` : plafonds et journal de l'analyse), le vote, et les batiments qui ont
// probablement une forme visee, ecrits au statut `propose` dans le corpus. Rien ne s'applique au
// calcul ; vous triez ensuite chaque candidat sur ses photos (`valide` ou `sans_suite`).
//
//   npx tsx .claude/skills/regles-toits/scripts/candidats.ts versailles --essai
//   PLAN_ADMIN_MOT_DE_PASSE=… npx tsx .claude/skills/regles-toits/scripts/candidats.ts versailles \
//     --serveur https://www.raillard.org/plan --formes mansart,gambrel,lucarnes --max 60
//
// Options :
//   --essai              sans Claude : les batiments qui ont une photo de leur toit, et ce que l'appel couterait
//   --serveur URL        l'adresse de Plan (celle ou `admin/claude/…` repond) ; a defaut PLAN_SERVEUR
//   --origine lat,lon    l'origine du repere du plan, si le fichier du village (ancien) ne la porte pas
//   --formes a,b         ce que l'on cherche (formes du catalogue, `lucarnes`) ; par defaut tout ce que Plan ne fait pas
//   --max N              les N batiments les plus proches du centre de la parcelle, au plus
//   --immediat           l'appel immediat (tarif normal, tout de suite) plutot que le batch (moitie prix, differe)
//   --sortie fichier     a defaut tests/fixtures/toits/candidats/<village>.json
// Connexion : PLAN_ADMIN_MOT_DE_PASSE (session admin d'admin.php), ou PLAN_JETON (jeton de la plateforme).
// Le fichier du village : $TOITS_DOSSIER/village-<nom>.json (par defaut /tmp/toits).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { analyserVillage, preparerVillage, type ImageTelechargee, type VillageJson } from '../../../../src/app/toits/candidatsPanoramax.ts';
import { creerClientAnalyse } from '../../../../src/io/analyseClaude.ts';
import { connecterAdmin } from '../../../../src/io/depotDemos.ts';
import { compterCandidats, estVisee, fusionnerCandidats, lireFichierCandidats, texteCandidat, VISEES_PAR_DEFAUT, type ViseeCandidat } from '../../../../src/model/casCandidats.ts';

const args = process.argv.slice(2);
const option = (nom: string): string | undefined => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const drapeau = (nom: string): boolean => args.includes(nom);
const AVEC_VALEUR = new Set(['--serveur', '--origine', '--formes', '--max', '--sortie']);
const nom = args.filter((a, i) => !a.startsWith('--') && !AVEC_VALEUR.has(args[i - 1] ?? ''))[0];
if (!nom) throw new Error('usage : candidats.ts <village> [--essai] [--serveur URL] [--origine lat,lon] [--formes a,b] [--max N] [--immediat] [--sortie fichier]');

const S = (process.env.TOITS_DOSSIER || '/tmp/toits').replace(/\/?$/, '/');
const village = JSON.parse(readFileSync(S + 'village-' + nom + '.json', 'utf8')) as VillageJson;
const origine = option('--origine');
if (origine) {
  const [lat, lon] = origine.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('--origine lat,lon : deux nombres');
  village.origine = { lat: lat as number, lon: lon as number };
}
const visees = (option('--formes')?.split(',') ?? [...VISEES_PAR_DEFAUT]).map((v) => v.trim());
const inconnues = visees.filter((v) => !estVisee(v));
if (inconnues.length) throw new Error('--formes : ' + inconnues.join(', ') + ' inconnu(s) ; parmi ' + VISEES_PAR_DEFAUT.join(', '));
const max = option('--max') !== undefined ? Number(option('--max')) : undefined;
const sortie = option('--sortie') ?? 'tests/fixtures/toits/candidats/' + nom + '.json';
const ancien = existsSync(sortie) ? lireFichierCandidats(JSON.parse(readFileSync(sortie, 'utf8'))) : null;
// Un batiment deja trie par vous n'est pas renvoye a Claude : il ne coute rien et ne bouge plus.
const ignorer = new Set((ancien?.candidats ?? []).filter((c) => c.statut !== 'propose').map((c) => c.cle));

const lireJson = async (url: string): Promise<unknown> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Panoramax : HTTP ' + r.status + ' sur ' + url);
  return r.json();
};
const telecharger = async (url: string): Promise<ImageTelechargee | null> => {
  const r = await fetch(url);
  if (!r.ok) return null;
  const type = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0]?.trim();
  const mediaType = type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg';
  return { base64: Buffer.from(await r.arrayBuffer()).toString('base64'), mediaType };
};
const journal = (l: string) => console.log('·', l);

if (drapeau('--essai')) {
  const { lots, bilan } = await preparerVillage(village, { lireJson, telecharger, ignorer, journal, ...(max !== undefined ? { maxBatiments: max } : {}) });
  console.log(nom, ':', bilan.batiments, 'batiments,', bilan.avecPhotos, 'avec une photo de leur toit,', bilan.photos, 'photos telechargees');
  for (const x of lots) console.log(' ', x.b.key, x.b.bdtopo?.cleabs ?? '', x.photos.map((p) => p.vue.photo.id + ' a ' + Math.round(p.distanceM) + ' m').join(', '));
  // Trois passes par batiment, au cout nominal de la spec (§14.4 : ~0,0014 $ la passe, moitie en Batch).
  console.log('requetes :', lots.length * 3, '; cout estime : ~' + (lots.length * 3 * 0.0014 * (drapeau('--immediat') ? 1 : 0.5)).toFixed(2), '$');
  process.exit(0);
}

const serveur = (option('--serveur') ?? process.env.PLAN_SERVEUR ?? '').replace(/\/$/, '');
if (!serveur) throw new Error('--serveur URL (ou PLAN_SERVEUR) : l’adresse de Plan, ou admin/claude/ repond');
let cookie = '';
const jeton = process.env.PLAN_JETON ?? null;
const f = async (entree: string, init: RequestInit = {}): Promise<Response> => {
  const entetes = new Headers(init.headers);
  if (cookie) entetes.set('Cookie', cookie);
  const r = await fetch(serveur + '/' + entree.replace(/^\//, ''), { ...init, headers: entetes });
  const pose = r.headers.get('set-cookie');
  if (pose) cookie = pose.split(';')[0] ?? '';
  return r;
};
const mdp = process.env.PLAN_ADMIN_MOT_DE_PASSE;
if (mdp) {
  const refus = await connecterAdmin(f, mdp);
  if (refus) throw new Error('Connexion admin : ' + refus);
} else if (!jeton) throw new Error('PLAN_ADMIN_MOT_DE_PASSE ou PLAN_JETON : il faut se connecter au serveur de Plan');

const r = await analyserVillage(village, {
  village: nom, client: creerClientAnalyse(f, () => jeton), lireJson, telecharger, visees: visees as ViseeCandidat[], ignorer, journal,
  immediat: drapeau('--immediat'), ...(max !== undefined ? { maxBatiments: max } : {}),
});
const fichier = fusionnerCandidats(ancien, r.candidats, r.analyses, { village: nom, parcelle: village.parcelle ?? null });
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, JSON.stringify(fichier, null, 2) + '\n');
const b = r.bilan;
console.log(nom, ':', b.batiments, 'batiments,', b.avecPhotos, 'avec photo,', b.analyses, 'analyses,', b.echecs, 'en echec ;', r.candidats.length, 'candidats ; cout reel', b.cout.toFixed(4), '$ (' + (b.modele ?? '?') + ')');
for (const c of r.candidats) console.log(' ', c.cle, c.cleabs ?? '', '·', texteCandidat(c), '·', c.photos.map((p) => p.url).join(' '));
console.log('corpus :', sortie, '·', compterCandidats(fichier).map((l) => l.visee + ' ' + l.propose + ' propose(s), ' + l.valide + ' valide(s), ' + l.sans_suite + ' sans suite').join(' ; '));
