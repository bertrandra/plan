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

// Une tuile sans temoin (cadrage nouveau, ecran different) : un carre gris neutre plutot qu'une
// erreur, pour que le plan se dessine comme avec le reseau.
const TUILE_GRISE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ceIEAAS0AlkWLoFAAAAAAElFTkSuQmCC', 'base64');

// Une meme requete part d'une partie a l'autre avec des coordonnees qui different aux derniers
// chiffres (le centre de la parcelle et l'emprise du LiDAR repassent par le repere du plan) : la
// cle les arrondit a six decimales, une dizaine de centimetres en degres, pour que le temoin les
// retrouve.
const arrondir = (texte) => texte.replace(/-?\d+\.\d{6,}/g, (n) => Number(n).toFixed(6));
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
    await contexte.route(HOTES, async (route) => {
      const req = route.request();
      const k = cle(req);
      if (mode === 'enregistrer') {
        // Une reponse peut arriver apres la fermeture de sa partie : elle n'est alors plus lisible,
        // et ne manque a personne.
        try {
          const r = await route.fetch();
          const corps = await r.body();
          const type = r.headers()['content-type'] || 'application/octet-stream';
          neufs[k] = { statut: r.status(), type, fichier: nomFichier(k), corps };
          await route.fulfill({ response: r, body: corps });
        } catch { await route.abort().catch(() => {}); }
        return;
      }
      const e = index[k] || plusProche(index, k);
      const entetes = { 'access-control-allow-origin': '*' };
      if (e && existsSync(DOSSIER + e.fichier)) {
        return route.fulfill({ status: e.statut, contentType: e.type, headers: entetes, body: gunzipSync(readFileSync(DOSSIER + e.fichier)) });
      }
      manquants.add(k);
      if (req.resourceType() === 'image' || /\.(png|jpe?g)|image%2F|image\//i.test(req.url())) {
        return route.fulfill({ status: 200, contentType: 'image/png', headers: entetes, body: TUILE_GRISE });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', headers: entetes, body: '{"erreur":"aucun temoin pour cette requete"}' });
    });
  }

  function bilan() {
    if (mode === 'enregistrer') {
      mkdirSync(DOSSIER, { recursive: true });
      const fusion = { ...index };
      for (const [k, { statut, type, fichier, corps }] of Object.entries(neufs)) {
        writeFileSync(DOSSIER + fichier, gzipSync(corps, { level: 9 }));
        fusion[k] = { statut, type, fichier };
      }
      const trie = Object.fromEntries(Object.keys(fusion).sort().map((k) => [k, fusion[k]]));
      writeFileSync(INDEX, JSON.stringify(trie, null, 1) + '\n');
      return `réseau enregistré : ${Object.keys(neufs).length} réponse(s) rangée(s) dans ${DOSSIER}`;
    }
    if (mode === 'temoin') {
      const liste = [...manquants];
      return `réseau rejoué depuis les données témoin`
        + (liste.length ? ` ; ${liste.length} requête(s) sans témoin (tuile grise ou 404), dont ${liste.slice(0, 3).join(' ; ')}` : '');
    }
    return 'réseau direct';
  }

  return { mode, brancher, bilan };
}

/**
 * three.js r128 et ses trois scripts d'exemples, servis depuis `node_modules/three` (la meme version
 * que le CDN, en devDependency) plutot que depuis jsDelivr : les points de la Vue 3D (22, 23, 24, 38)
 * se jouent alors sans reseau sortant. `FUMEE_CDN=1` rejoue le vrai CDN.
 */
export async function servirThreeLocal(page) {
  if (process.env.FUMEE_CDN === '1') return;
  const racine = new URL('../node_modules/three/', import.meta.url).pathname;
  const servir = (route, fichier) => existsSync(fichier) ? route.fulfill({ path: fichier, contentType: 'application/javascript' }) : route.continue();
  // La bibliotheque vient de cdnjs, ses exemples de jsDelivr (three/glbViewer.ts, three/chargeurs.ts).
  await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, (route) => servir(route, racine + 'build/three.min.js'));
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/(.*)/, (route) =>
    servir(route, racine + route.request().url().split('three@0.128.0/')[1].split('?')[0]));
}
