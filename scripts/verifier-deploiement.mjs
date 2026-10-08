// Verifie un deploiement en ligne : ce que le serveur rend vraiment, pas ce qu'on croit avoir mis.
//
//   node scripts/verifier-deploiement.mjs https://plan.raillard.org
//
// La liste de sortie (MD/RELEASE.md §8.2) demande de verifier les en-tetes en ligne apres chaque
// mise en production. Le faire a la main, c'est le faire une fois. Les controles ci-dessous
// sont exactement les defauts constates le 22 septembre 2026, plus la verification que le fichier
// servi est bien celui qu'on a construit : une copie oubliee est le mode d'echec le plus courant,
// et le seul que des en-tetes corrects ne revelent pas.
//
// Sortie 0 si tout passe, 1 sinon, pour que la commande serve aussi dans un enchainement.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racineDepot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage : node scripts/verifier-deploiement.mjs https://<hote>');
  process.exit(2);
}

const resultats = [];
let cspServie = '';
const noter = (nom, ok, detail) => { resultats.push({ nom, ok, detail }); };

/** Un GET qui ne suit pas les redirections : on veut la reponse de cet hote, pas d'un autre. */
async function demander(chemin, options = {}) {
  const r = await fetch(base + chemin, { redirect: 'manual', ...options });
  return { statut: r.status, entetes: r.headers, corps: r };
}

// ---------------------------------------------------------------------------------------------
// 1. La page repond, et c'est le fichier qu'on a construit.
// ---------------------------------------------------------------------------------------------
let page = null;
try {
  // La racine, pas un nom de fichier : c'est l'adresse que la plateforme distribue (`app_url`),
  // celle qu'on doit donc verifier. Demander `/index.html` passerait a cote d'un `DirectoryIndex`
  // absent ou mal regle, qui est precisement le defaut que ce controle doit attraper.
  const r = await demander('/');
  if (r.statut === 401) {
    noter('la page repond', false, '401 : authentification basique encore en place devant cet hote');
  } else if (r.statut !== 200) {
    noter('la page repond', false, 'HTTP ' + r.statut);
  } else {
    page = Buffer.from(await r.corps.arrayBuffer());
    noter('la page repond', true, page.length.toLocaleString('fr-FR') + ' octets');
  }

  const local = resolve(racineDepot, 'livraison/index.html');
  if (page && existsSync(local)) {
    const enLigne = createHash('sha256').update(page).digest('hex');
    const ici = createHash('sha256').update(readFileSync(local)).digest('hex');
    noter('le fichier servi est celui du depot', enLigne === ici,
      enLigne === ici ? 'meme empreinte' : 'en ligne ' + enLigne.slice(0, 12) + ' / depot ' + ici.slice(0, 12));
  }

  if (page) {
    // La description du produit (src/model/produit.ts) : ce que la plateforme lit pour connaitre
    // les schemas de document que cette version accepte.
    const bloc = /<script type="application\/json" id="plan-produit">([\s\S]*?)<\/script>/.exec(page.toString('utf8'));
    let d = null;
    try { d = bloc ? JSON.parse(bloc[1]) : null; } catch { d = null; }
    noter('la page se decrit (plan-produit)', !!(d && d.app_version && Array.isArray(d.schema_versions)),
      d ? d.product + ' ' + d.app_version + ', schemas ' + JSON.stringify(d.schema_versions) : 'bloc absent ou illisible');

    const cache = r.entetes.get('cache-control') || '';
    const longue = /max-age=(\d+)/.exec(cache);
    const tropLong = longue && Number(longue[1]) > 3600;
    noter('la page n\'est pas mise en cache', /no-cache|no-store/.test(cache) && !tropLong,
      cache || 'aucun Cache-Control');

    for (const [entete, attendu] of [
      ['x-content-type-options', /nosniff/],
      ['referrer-policy', /strict-origin-when-cross-origin/],
      ['x-frame-options', /DENY/i],
      ['strict-transport-security', /max-age=\d+/]
    ]) {
      const v = r.entetes.get(entete) || '';
      noter('en-tete ' + entete, attendu.test(v), v || 'absent');
    }

    // La politique doit nommer le programme par l'empreinte du script en ligne servi.
    const csp = r.entetes.get('content-security-policy') || '';
    cspServie = csp;
    if (!csp) {
      noter('politique de contenu', false, 'absente');
    } else {
      const html = page.toString('utf8');
      const m = /<script(?![^>]*\ssrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/.exec(html);
      const empreinte = m ? createHash('sha256').update(m[1], 'utf8').digest('base64') : null;
      const nomme = empreinte ? csp.includes("'sha256-" + empreinte + "'") : false;
      noter('politique de contenu', nomme,
        nomme ? 'nomme le script servi par son empreinte'
              : (/unsafe-inline/.test(csp.split('script-src')[1] || '')
                  ? "script-src autorise 'unsafe-inline' : la protection est desactivee"
                  : "l'empreinte de la politique ne correspond pas au script servi — .htaccess d'un autre build"));
    }
  }
} catch (e) {
  noter('la page repond', false, String(e).slice(0, 120));
}

// ---------------------------------------------------------------------------------------------
// 1 bis. L'ancienne adresse mene toujours a la nouvelle.
//
// La page s'appelait `plan.html` jusqu'a la 2.0.1. Des signets existent, et un lien profond porte
// `?projet=<uuid>` : la redirection doit donc etre permanente ET reporter la chaine de requete,
// sans quoi elle renvoie sur un plan que la personne n'a pas demande.
// ---------------------------------------------------------------------------------------------
try {
  const r = await demander('/plan.html?projet=witness');
  const ou = r.entetes.get('location') || '';
  noter('l ancienne adresse redirige', r.statut === 301,
    r.statut === 301 ? '301 vers ' + (ou || '(sans Location)') : 'HTTP ' + r.statut);
  if (r.statut === 301) {
    noter('la redirection garde le projet demande', /\?projet=witness/.test(ou),
      ou || 'aucun Location');
  }
} catch (e) {
  noter('l ancienne adresse redirige', false, e.message);
}

// ---------------------------------------------------------------------------------------------
// 1 ter. La vitrine publique se laisse encadrer par la plateforme, et le reste non.
//
// `?mode=demo` est la Vue 3D de la demonstration que la page d'accueil du catalogue montre dans un
// <iframe> (app/vitrine.ts). Le `.htaccess` y retire `X-Frame-Options` et ouvre `frame-ancestors`
// a la plateforme seule ; un hote sans `<If>` ni mod_headers la laisserait refusee, ou pire, ouvrirait
// l'atelier entier a l'encadrement.
// ---------------------------------------------------------------------------------------------
try {
  const r = await demander('/?mode=demo&x=1024&y=768');
  const csp = r.entetes.get('content-security-policy') || '';
  const cadre = (/frame-ancestors ([^;]*)/.exec(csp) || [])[1] || '';
  noter('la vitrine repond', r.statut === 200, 'HTTP ' + r.statut);
  noter('la vitrine se laisse encadrer par la plateforme', !r.entetes.get('x-frame-options') && /https:\/\//.test(cadre) && !/\*/.test(cadre),
    'X-Frame-Options ' + (r.entetes.get('x-frame-options') || 'absent') + ' ; frame-ancestors ' + (cadre || 'absent'));
  noter("l'atelier refuse toujours l'encadrement", /'none'/.test((/frame-ancestors ([^;]*)/.exec(cspServie) || [])[1] || ''),
    'frame-ancestors ' + ((/frame-ancestors ([^;]*)/.exec(cspServie) || [])[1] || 'absent'));
} catch (e) {
  noter('la vitrine repond', false, String(e).slice(0, 120));
}

// ---------------------------------------------------------------------------------------------
// 1 quater. La vitrine lit sa demo.
//
// `?mode=demo&file=1` lit `admin/vitrine/1` : sans session, sans cookie, et de toute origine —
// l'<iframe> de la plateforme est en bac a sable, donc d'origine `null`, ce que `Origin: null`
// reproduit ici. Quand cette route ne repond pas un plan en JSON, la vitrine retombe sur la
// demonstration integree : la cause se lit dans la reponse (un fichier illisible, un admin non
// configure) — ou dans sa forme, quand une protection anti-robots de l'hebergeur repond sa page
// HTML a la place d'admin.php.
// ---------------------------------------------------------------------------------------------
try {
  const r = await demander('/admin/vitrine/1', { headers: { Accept: 'application/json', Origin: 'null' } });
  const type = r.entetes.get('content-type') || '';
  const texte = await r.corps.text();
  let corps = null;
  try { corps = JSON.parse(texte); } catch { corps = null; }
  const ok = r.statut === 200 && !!corps && Array.isArray(corps.objects) && corps.objects.length > 0;
  let detail;
  if (ok) detail = corps.objects.length + ' objet(s), ' + (corps.meta?.name || 'sans nom');
  else if (corps?.error) detail = 'HTTP ' + r.statut + ' ' + corps.error.code + ' : ' + corps.error.message;
  else if (/html/i.test(type) || /<html/i.test(texte)) detail = 'HTTP ' + r.statut + " : une page HTML repond a la place d'admin.php — protection anti-robots de l'hebergeur (SiteGround), ou page d'erreur ; la vitrine montre alors la demonstration integree";
  else if (r.statut === 200) detail = 'HTTP 200 mais pas un plan : ' + (texte.length ? texte.slice(0, 80) : 'corps vide (fichier illisible par PHP ? droits)');
  else detail = 'HTTP ' + r.statut;
  noter('la vitrine lit sa demo (admin/vitrine/1)', ok, detail);
  const acao = r.entetes.get('access-control-allow-origin');
  noter("la demo se lit depuis l'iframe en bac a sable", acao === '*', 'Access-Control-Allow-Origin ' + (acao || 'absent : la page encadree ne verra ni la demo ni la raison'));
} catch (e) {
  noter('la vitrine lit sa demo (admin/vitrine/1)', false, String(e).slice(0, 120));
}

// ---------------------------------------------------------------------------------------------
// 2. Ce qui ne doit plus etre la du tout.
//
// Depuis la 2.0.0 les projets vivent chez la plateforme : `api.php` et `data/` ont disparu du
// depot. Un hote qui les sert encore sert les fichiers d'une version precedente — et `data/` rendait
// un projet entier en clair a qui le demandait.
// ---------------------------------------------------------------------------------------------
try {
  for (const [nom, chemin] of [['api.php n est plus servi', '/api.php?action=list'], ['data/ est ferme', '/data/parcelle-ae-101.json']]) {
    const r = await demander(chemin);
    noter(nom, r.statut === 403 || r.statut === 404, 'HTTP ' + r.statut + (r.statut === 200 ? " : d'une version precedente, a retirer de l'hote" : ''));
  }
} catch (e) {
  noter('les restes de la 1.x', false, String(e).slice(0, 120));
}

// ---------------------------------------------------------------------------------------------
// 3. La politique nomme bien la plateforme.
//
// Sans son origine dans `connect-src`, chaque appel de la page est bloque par le navigateur — et
// seulement en production, puisque le serveur de developpement n'envoie aucune politique. C'est la
// facon la plus probable de livrer une version cassee (spec-connexion-plateforme §14.4).
// ---------------------------------------------------------------------------------------------
if (page) {
  const html = page.toString('utf8');
  // L'origine est stockee seule dans le paquet : les chemins du contrat s'y ajoutent a
  // l'execution. On la reconnait en ecartant les origines tierces que le programme nomme par
  // ailleurs — IGN, BAN, les deux CDN, les textures.
  const TIERCES = /^https:\/\/(api-adresse\.data\.gouv\.fr|apicarto\.ign\.fr|data\.geopf\.fr|www\.geoportail-urbanisme\.gouv\.fr|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|(api|cdn|dl)\.polyhaven\.(com|org))$/;
  const origine = [...new Set((html.match(/"https:\/\/[a-z0-9.-]+"/g) || []).map((s) => s.slice(1, -1)))]
    .find((o) => !TIERCES.test(o));
  const csp = cspServie;
  if (!origine) {
    noter("l'origine de la plateforme est dans le paquet", false, 'introuvable dans le fichier servi');
  } else {
    noter("l'origine de la plateforme est dans le paquet", true, origine);
    noter("connect-src nomme la plateforme", csp.includes(origine), csp ? (csp.includes(origine) ? origine + ' autorise' : origine + " ABSENT de connect-src : tous les appels seront bloques") : 'aucune politique');
  }
}

// ---------------------------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------------------------
const large = Math.max(...resultats.map((r) => r.nom.length));
console.log('\n' + base + '\n');
for (const r of resultats) {
  console.log((r.ok ? '  OK   ' : '  NON  ') + r.nom.padEnd(large) + '  ' + (r.detail || ''));
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log('\n' + (echecs === 0
  ? resultats.length + ' controles, tous passes.'
  : echecs + ' controle(s) en echec sur ' + resultats.length + '.') + '\n');
process.exit(echecs === 0 ? 0 : 1);
