// Le reseau de l'IGN pour la fumee : joue en direct quand il repond, rejoue des donnees temoin sinon.
//
// Les points 12 a 15 (cadastre, voisinage, orthophoto, PLU) appellent la BAN, `apicarto` et
// `data.geopf.fr`. Sans reseau sortant ils echouaient a coup sur, apres plus de quarante secondes
// d'attente chacun ; en direct, ils dependent de donnees qui bougent. Les reponses d'un passage
// enregistre sont rangees dans `tests/fixtures/fumee-reseau/` (un index, un fichier par corps) et
// rejouees a l'identique quand le reseau manque.
//
//   FUMEE_RESEAU=direct       le vrai reseau, sans repli
//   FUMEE_RESEAU=temoin       les donnees temoin, meme si le reseau repond (le plus rapide)
//   FUMEE_RESEAU=enregistrer  le vrai reseau, et chaque reponse rangee comme temoin
//   (rien)                    direct si data.geopf.fr repond, temoin sinon

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const DOSSIER_FUMEE = new URL('../tests/fixtures/fumee-reseau/', import.meta.url).pathname;
const HOTES = /^https:\/\/(data\.geopf\.fr|apicarto\.ign\.fr|api-adresse\.data\.gouv\.fr|wxs\.ign\.fr)\//;
const SONDE = 'https://data.geopf.fr/geocodage/search?q=Rennes&limit=1';

// Les en-tetes rejoues tels qu'enregistres : l'autorisation CORS surtout. L'IGN ne la donne pas a
// toutes ses reponses (une tuile en erreur n'en a pas), et la Vue 3D, qui lit les tuiles par
// `fetch`, doit les voir arriver ou echouer exactement comme sur le vrai reseau.
const ENTETES_GARDES = ['access-control-allow-origin', 'access-control-expose-headers', 'cache-control'];

// Une meme requete part d'une partie a l'autre avec des coordonnees qui different aux derniers
// chiffres (le centre de la parcelle et l'emprise du LiDAR repassent par le repere du plan) : la
// cle les arrondit a six decimales, une dizaine de centimetres en degres, pour que le temoin les
// retrouve.
const arrondir = (texte) => texte.replace(/-?\d+\.\d{6,}/g, (n) => Number(n).toFixed(6));
/**
 * Une reponse servie par Playwright echappe au controle CORS du navigateur. Une lecture `fetch` d'une
 * autre origine, a laquelle l'IGN ne donne pas son autorisation (les tuiles de l'orthophoto, que la
 * Vue 3D lit ainsi), aboutirait alors ou le vrai reseau la refuse : on la refuse comme lui. Une
 * image posee dans le plan, elle, ne passe pas par ce controle.
 */
const refuseeParCors = (req, entetes) => (req.resourceType() === 'fetch' || req.resourceType() === 'xhr')
  && !(entetes && entetes['access-control-allow-origin']);

const LATENCE = process.env.FUMEE_LATENCE !== '0';
const LATENCE_MAX_MS = 30000;
/** La duree d'une requete, de son depart a la fin de sa reponse, en millisecondes entieres. */
const duree = (req) => { const t = req.timing(); return t && t.responseEnd > 0 ? Math.round(t.responseEnd) : 0; };

const cle = (req) => {
  const corps = req.postData();
  return req.method() + ' ' + arrondir(req.url()) + (corps ? ' #' + createHash('sha1').update(arrondir(corps)).digest('hex').slice(0, 12) : '');
};
// Les corps sont ranges compresses : le PLU d'un centre ancien pese plusieurs megaoctets de JSON.
const nomFichier = (k) => createHash('sha1').update(k).digest('hex').slice(0, 16) + '.gz';

// Repli d'un temoin manquant : une coordonnee pile sur la limite d'arrondi tombe d'un cote ou de
// l'autre. On prend alors le temoin de meme forme (memes textes, memes nombres de nombres) dont
// les nombres sont les plus proches, a deux millioniemes pres.
const NOMBRE = /-?\d+(?:\.\d+)?/g;
const forme = (k) => k.replace(NOMBRE, '#');
function plusProche(index, k) {
  const f = forme(k), n = (k.match(NOMBRE) || []).map(Number);
  let meilleure = null, ecart = 2e-6 + 1e-12;
  for (const autre of Object.keys(index)) {
    if (forme(autre) !== f) continue;
    const m = (autre.match(NOMBRE) || []).map(Number);
    const e = Math.max(0, ...m.map((x, i) => Math.abs(x - n[i])));
    if (e <= ecart) { ecart = e; meilleure = autre; }
  }
  return meilleure && index[meilleure];
}

const lireIndex = (dossier) => (existsSync(dossier + 'index.json') ? JSON.parse(readFileSync(dossier + 'index.json', 'utf8')) : {});

/** Le mode du passage : celui demande, sinon direct si l'IGN repond au navigateur, temoin sinon. */
export async function choisirModeReseau(navigateur, demande = process.env.FUMEE_RESEAU) {
  if (demande === 'direct' || demande === 'temoin' || demande === 'enregistrer') return demande;
  const contexte = await navigateur.newContext();
  const repond = await contexte.request.get(SONDE, { timeout: 5000 }).then((r) => r.status() < 500).catch(() => false);
  await contexte.close();
  return repond ? 'direct' : 'temoin';
}

/**
 * Le reseau d'un passage : brancher chaque contexte, puis faire le bilan (et ecrire le temoin).
 * `dossier` : ou ranger le temoin (celui de la fumee par defaut ; le banc visuel a le sien).
 */
export function reseau(mode, dossier = DOSSIER_FUMEE) {
  const DOSSIER = dossier.endsWith('/') ? dossier : dossier + '/';
  const INDEX = DOSSIER + 'index.json';
  const index = lireIndex(DOSSIER);
  const neufs = {};
  const manquants = new Set();

  async function brancher(contexte) {
    if (mode === 'direct') return;
    if (mode === 'enregistrer') {
      // L'enregistrement ecoute sans intercepter : ce qui est range est ce que le NAVIGATEUR a recu,
      // avec ses en-tetes a lui (origine, referent). Une requete refaite par Playwright n'obtenait
      // pas toujours la meme reponse de l'IGN — des tuiles refusees au navigateur passaient.
      const hote = (req) => HOTES.test(req.url());
      contexte.on('requestfinished', async (req) => {
        if (!hote(req)) return;
        // Une reponse peut arriver apres la fermeture de sa partie : elle n'est plus lisible, et ne
        // manque a personne.
        try {
          const r = await req.response();
          if (!r) return;
          const corps = await r.body();
          const h = await r.allHeaders();
          const type = h['content-type'] || 'application/octet-stream';
          const entetes = Object.fromEntries(ENTETES_GARDES.filter((n) => h[n] !== undefined).map((n) => [n, h[n]]));
          const k = cle(req);
          neufs[k] = { statut: r.status(), type, entetes, duree: duree(req), fichier: nomFichier(k), corps };
        } catch { /* partie fermee */ }
      });
      contexte.on('requestfailed', (req) => {
        if (!hote(req)) return;
        const k = cle(req);
        if (!neufs[k]) neufs[k] = { echec: req.failure()?.errorText || 'failed', duree: duree(req) };
      });
      return;
    }
    await contexte.route(HOTES, async (route) => {
      const req = route.request();
      const k = cle(req);
      const e = index[k] || plusProche(index, k);
      // La reponse arrive apres le meme delai qu'au passage enregistre : la Vue 3D de la
      // demonstration se construit avant les tuiles de l'orthophoto, et le .glb du point 24 (golden)
      // en depend. `FUMEE_LATENCE=0` rejoue tout sans attendre, au prix de cette fidelite.
      if (e && LATENCE && e.duree > 0) await new Promise((r) => setTimeout(r, Math.min(e.duree, LATENCE_MAX_MS)));
      // Un echec enregistre (coupure, refus) se rejoue en echec.
      if (e && e.echec) return route.abort('failed').catch(() => {});
      if (e && existsSync(DOSSIER + e.fichier)) {
        if (refuseeParCors(req, e.entetes)) return route.abort('failed').catch(() => {});
        // L'IGN renvoie l'origine qui l'appelle : le temoin porte celle du passage enregistre
        // (http://localhost:5199), et un serveur Vite sur un autre port se voyait refuser chaque
        // lecture `fetch` par le controle CORS. On rend l'origine de la requete, comme l'IGN.
        const entetes = { ...(e.entetes || {}) };
        // Une partie fermee pendant la latence ne se lit plus, ni ne se sert : personne n'attend.
        const origine = (await req.allHeaders().catch(() => ({})))['origin'];
        if (origine && entetes['access-control-allow-origin'] && entetes['access-control-allow-origin'] !== '*') entetes['access-control-allow-origin'] = origine;
        return route.fulfill({ status: e.statut, contentType: e.type, headers: { ...entetes, 'content-type': e.type }, body: gunzipSync(readFileSync(DOSSIER + e.fichier)) }).catch(() => {});
      }
      // Sans temoin, la requete part sur le vrai reseau : hors ligne, elle echoue comme elle l'aurait
      // fait ; en ligne (temoin impose), elle y trouve sa reponse. Elle n'est jamais inventee.
      manquants.add(k);
      return route.continue().catch(() => {});
    });
  }


  function bilan() {
    if (mode === 'enregistrer') {
      mkdirSync(DOSSIER, { recursive: true });
      const fusion = { ...index };
      for (const [k, e] of Object.entries(neufs)) {
        if (e.echec) { fusion[k] = { echec: e.echec, duree: e.duree }; continue; }
        writeFileSync(DOSSIER + e.fichier, gzipSync(e.corps, { level: 9 }));
        fusion[k] = { statut: e.statut, type: e.type, entetes: e.entetes, duree: e.duree, fichier: e.fichier };
      }
      const trie = Object.fromEntries(Object.keys(fusion).sort().map((k) => [k, fusion[k]]));
      writeFileSync(INDEX, JSON.stringify(trie, null, 1) + '\n');
      return `réseau enregistré : ${Object.keys(neufs).length} réponse(s) rangée(s) dans ${DOSSIER}`;
    }
    if (mode === 'temoin') {
      const liste = [...manquants];
      return `réseau rejoué depuis les données témoin`
        + (liste.length ? ` ; ${liste.length} requête(s) sans témoin (laissées au réseau), dont ${liste.slice(0, 3).join(' ; ')}` : '');
    }
    return 'réseau direct';
  }

  return { mode, brancher, bilan };
}

/**
 * three.js et ses exemples (modules ES), servis depuis `node_modules/three` (la meme version que le
 * CDN, en devDependency) plutot que depuis jsDelivr : les points de la Vue 3D (22, 23, 24, 38) se
 * jouent alors sans reseau sortant. `FUMEE_CDN=1` rejoue le vrai CDN.
 */
export async function servirThreeLocal(page) {
  if (process.env.FUMEE_CDN === '1') return;
  const racine = new URL('../node_modules/three/', import.meta.url).pathname;
  const servir = (route, fichier) => existsSync(fichier) ? route.fulfill({ path: fichier, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }) : route.continue();
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/(.*)/, (route) =>
    servir(route, racine + route.request().url().split(/three@[\d.]+\//)[1].split('?')[0]));
  // EZ-tree (le generateur d'arbres, three/bibliotheque.ts), de node_modules lui aussi.
  const ez = new URL('../node_modules/@dgreenheck/ez-tree/', import.meta.url).pathname;
  await page.route(/cdn\.jsdelivr\.net\/npm\/@dgreenheck\/ez-tree@[\d.]+\/(.*)/, (route) =>
    servir(route, ez + route.request().url().split(/ez-tree@[\d.]+\//)[1].split('?')[0]));
}
