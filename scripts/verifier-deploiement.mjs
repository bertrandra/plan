// Verifie un deploiement en ligne : ce que le serveur rend vraiment, pas ce qu'on croit avoir mis.
//
//   node scripts/verifier-deploiement.mjs https://plan1.raillard.org
//
// La liste de sortie (MD/RELEASE.md §8.2) demande de verifier les en-tetes en ligne apres chaque
// mise en production. Le faire a la main, c'est le faire une fois. Les huit controles ci-dessous
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
  const r = await demander('/plan.html');
  if (r.statut === 401) {
    noter('la page repond', false, '401 : authentification basique encore en place devant cet hote');
  } else if (r.statut !== 200) {
    noter('la page repond', false, 'HTTP ' + r.statut);
  } else {
    page = Buffer.from(await r.corps.arrayBuffer());
    noter('la page repond', true, page.length.toLocaleString('fr-FR') + ' octets');
  }

  const local = resolve(racineDepot, 'plan.html');
  if (page && existsSync(local)) {
    const enLigne = createHash('sha256').update(page).digest('hex');
    const ici = createHash('sha256').update(readFileSync(local)).digest('hex');
    noter('le fichier servi est celui du depot', enLigne === ici,
      enLigne === ici ? 'meme empreinte' : 'en ligne ' + enLigne.slice(0, 12) + ' / depot ' + ici.slice(0, 12));
  }

  if (page) {
    const cache = r.entetes.get('cache-control') || '';
    const longue = /max-age=(\d+)/.exec(cache);
    const tropLong = longue && Number(longue[1]) > 3600;
    noter('plan.html n\'est pas mis en cache', /no-cache|no-store/.test(cache) && !tropLong,
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
    if (!csp) {
      noter('politique de contenu', false, 'absente');
    } else {
      const html = page.toString('utf8');
      const m = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html);
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
// 2. Les projets ne se lisent que par l'API.
// ---------------------------------------------------------------------------------------------
try {
  const liste = await demander('/api.php?action=list');
  let ids = [];
  if (liste.statut === 200) {
    try { ids = (await liste.corps.json()).map((p) => p.id).filter(Boolean); } catch { /* pas du JSON */ }
  }
  noter('api.php repond', liste.statut === 200, 'HTTP ' + liste.statut + (ids.length ? ' — ' + ids.length + ' projet(s)' : ''));

  // On essaie de lire directement le premier projet connu, et un nom generique s'il n'y en a pas.
  const cible = '/data/' + (ids[0] || 'parcelle-ae-101') + '.json';
  const direct = await demander(cible);
  noter('data/ est ferme au public', direct.statut === 403 || direct.statut === 404,
    'GET ' + cible + ' → HTTP ' + direct.statut + (direct.statut === 200 ? ' : le projet est telechargeable sans passer par l\'API' : ''));

  const bak = await demander('/data/' + (ids[0] || 'parcelle-ae-101') + '.json.bak');
  noter('les sauvegardes .bak sont fermees', bak.statut === 403 || bak.statut === 404, 'HTTP ' + bak.statut);
} catch (e) {
  noter('api.php repond', false, String(e).slice(0, 120));
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
