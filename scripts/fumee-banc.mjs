// La fumee du banc d'apprentissage des facades (banc/, l'application a part) : l'ecran d'import Panoramax joue dans un vrai navigateur,
// sur le paquet construit, servi comme en ligne (la page a ?banc, la politique de contenu de son .htaccess, son API en PHP).
//
//   npm run build:banc
//   NODE_PATH=$(npm root -g) node scripts/fumee-banc.mjs            # deux passages : bureau clair, telephone sombre ; reseau temoin
//
// Ce qu'il joue, a « 2 allee des Limites, Le Vesinet » : l'ouverture sur la France (la couverture de Panoramax et ce que la carte en
// dit), l'adresse (la carte y va, la parcelle visee, les photos), « Seulement les facades » (son compte, puis la case decochee),
// l'apercu des facades d'un point (survole a la souris, touche au doigt), la fenetre « Choisir les vues », l'import d'une photo (201,
// le compteur du banc monte), puis l'ecran d'equilibre du jeu (les vues importees comptees dans leur departement, et sur sa carte),
// puis le redressement (les gestes de chaque carte en icones, une photo jetable supprimee, rendue par « Annuler », supprimee pour de bon).
// puis « Entrainer sur mon Mac » (etape 6 : la cle d'entrainement creee, son script telecharge, la commande a coller, la cle listee,
// revoquee ; le script telecharge est lance par bash dans le role du Mac, sans entrainer, et depose un faux modele ; etape 3 : il
// apparait, dit d'ou il vient, s'active). Il y faut bash et un Python 3.10 ou plus recent qui sait creer un environnement (venv).
// A chaque passage : ni erreur de console, ni refus de la politique de contenu, ni requete hors du temoin ;
// les contrastes des textes (4,5:1), et au doigt les cibles de 44 px, rien qui deborde, l'apercu sous la carte.
//
//   FUMEE_RESEAU=temoin (defaut) | direct | enregistrer   le reseau : jamais le vrai en temoin (une requete sans temoin echoue)
//   FUMEE_BANC_PASSAGES=bureau-clair,telephone-court-sombre | tous   (bureau, tablette, telephone, telephone-court × clair, sombre)
//   FUMEE_BANC_CAPTURES=dossier    une capture par moment du scenario (a 2 pixels par point)
//   FUMEE_BANC_AUDIT=1             relever tous les defauts de contraste et de mise en page, sans s'arreter au premier
//   FUMEE_BANC_TUILES=direct       le vrai fond de carte de l'IGN (pour les captures) au lieu de la tuile unie du temoin
//
// Le temoin (banc/tests/fumee/reseau/) : le geocodage, le cadastre et les batiments de l'IGN (WFS), les tuiles de couverture et la
// recherche de Panoramax, et les images de trois panoramiques, reduites (auteur et licence : banc/tests/fumee/LISEZMOI.md). Les tuiles du
// fond de carte ne sont pas gardees : une tuile unie les remplace. Une image sans temoin recoit une image de synthese, une tuile de
// couverture sans temoin est vide (204) ; toute autre requete sans temoin fait echouer le passage. `enregistrer` joue tous les
// passages sur le vrai reseau et refait le temoin.

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync, gunzipSync, gzipSync } from 'node:zlib';
import { reseau } from './fumee-reseau.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const RACINE = new URL('..', import.meta.url).pathname;
const PAQUET = join(RACINE, 'dist-banc');
const DOSSIER_FUMEE = join(RACINE, 'banc/tests/fumee');
const TEMOIN = join(DOSSIER_FUMEE, 'reseau/');
const ADRESSE = '2 allée des Limites, Le Vésinet';
const MODE = ['direct', 'enregistrer'].includes(process.env.FUMEE_RESEAU) ? process.env.FUMEE_RESEAU : 'temoin';
const CAPTURES = process.env.FUMEE_BANC_CAPTURES || null;
const AUDIT = process.env.FUMEE_BANC_AUDIT === '1';
const RAYON = Number(process.env.FUMEE_BANC_RAYON || 40);
const DELAI = Number(process.env.FUMEE_BANC_DELAI || 30) * 1000;

const HOTES = /^https:\/\/(data\.geopf\.fr|api-adresse\.data\.gouv\.fr|api\.panoramax\.xyz|panoramax\.openstreetmap\.fr|panoramax\.ign\.fr|panoramax-storage-public-fast\.s3\.gra\.perf\.cloud\.ovh\.net|panoramax\.mapcomplete\.org)\//;
const TUILE_FOND = /^https:\/\/data\.geopf\.fr\/wmts/;
const TUILE_COUVERTURE = /\/api\/map\/\d+\/\d+\/\d+\.mvt/;

const ECRANS = {
  bureau: { viewport: { width: 1440, height: 900 } },
  tablette: { viewport: { width: 820, height: 1100 }, hasTouch: true },
  telephone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  // La hauteur reelle sous la barre de Safari.
  'telephone-court': { viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true },
};
const TOUS = Object.keys(ECRANS).flatMap((e) => [e + '-clair', e + '-sombre']);
const demandes = process.env.FUMEE_BANC_PASSAGES;
const PASSAGES = MODE === 'enregistrer' && !demandes ? ['bureau-clair', 'tablette-clair', 'telephone-sombre', 'telephone-court-sombre']
  : !demandes ? ['bureau-clair', 'telephone-court-sombre'] : demandes === 'tous' ? TOUS : demandes.split(',').map((s) => s.trim()).filter(Boolean);

/** Une image PNG unie, ecrite a la main (ni dependance, ni fichier) : la tuile du fond de carte et l'image d'une photo sans temoin. */
function png(l, h, [r, v, b]) {
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(l * 3, Buffer.from([r, v, b]))]);
  const bloc = (type, d) => { const t = Buffer.concat([Buffer.from(type), d]), n = Buffer.alloc(4), c = Buffer.alloc(4); n.writeUInt32BE(d.length); c.writeUInt32BE(crc32(t)); return Buffer.concat([n, t, c]); };
  const tete = Buffer.alloc(13); tete.writeUInt32BE(l, 0); tete.writeUInt32BE(h, 4); tete.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', tete), bloc('IDAT', deflateSync(Buffer.concat(Array(h).fill(ligne)))), bloc('IEND', Buffer.alloc(0))]);
}
const TUILE_UNIE = png(256, 256, [233, 231, 226]);
const PHOTO_DE_SYNTHESE = png(512, 256, [150, 160, 170]);

const portLibre = () => new Promise((ok, ko) => { const s = createServer(); s.on('error', ko); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

/** Le banc construit, servi par PHP comme en ligne, avec un mot de passe et des donnees fabriques sur place. */
async function servir() {
  if (!existsSync(join(PAQUET, 'index.html'))) throw new Error('dist-banc/ manque : lancer `npm run build:banc` d’abord.');
  if (spawnSync('php', ['-v']).status !== 0) throw new Error('PHP manque : l’API du banc (banc/public/api.php) ne peut pas être servie.');
  const tmp = mkdtempSync(join(tmpdir(), 'fumee-banc-'));
  const motDePasse = 'essai-' + randomBytes(9).toString('hex');
  mkdirSync(join(tmp, 'site')); mkdirSync(join(tmp, 'donnees')); mkdirSync(join(tmp, 'sessions'));
  symlinkSync(PAQUET, join(tmp, 'site/banc'));
  writeFileSync(join(tmp, 'config.php'), `<?php\nreturn ['motDePasse' => '${motDePasse}', 'dossierDonnees' => '${join(tmp, 'donnees')}'];\n`);
  const port = await portLibre();
  const journal = [];
  const php = spawn('php', ['-d', 'session.save_path=' + join(tmp, 'sessions'), '-d', 'upload_max_filesize=40M', '-d', 'post_max_size=48M', '-S', '127.0.0.1:' + port, '-t', join(tmp, 'site'), join(DOSSIER_FUMEE, 'routeur.php')],
    { env: { ...process.env, BANC_CONFIG: join(tmp, 'config.php') }, stdio: ['ignore', 'ignore', 'pipe'] });
  php.stderr.on('data', (d) => journal.push(String(d)));
  const url = 'http://127.0.0.1:' + port;
  for (let i = 0; ; i++) {
    if (await fetch(url + '/?banc').then((r) => r.ok).catch(() => false)) break;
    if (i > 100) { php.kill(); throw new Error('Le serveur PHP du banc ne répond pas : ' + journal.join('').slice(-400)); }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url, motDePasse, journal, fermer: () => { php.kill(); rmSync(tmp, { recursive: true, force: true }); } };
}

/**
 * Un faux fichier ONNX pour le depot du script d'entrainement : un ModelProto protobuf bien forme (version, jeu d'operateurs, un graphe avec un noeud,
 * une entree, une sortie et un poids de remplissage). Assez pour ce que le serveur verifie ; aucun moteur ne le lirait.
 */
function fauxOnnx() {
  const entier = (v) => { const o = []; for (; v > 127; v = Math.floor(v / 128)) o.push((v % 128) | 128); o.push(v); return o; };
  const champ = (numero, contenu) => [...entier(numero * 8 + 2), ...entier(contenu.length), ...contenu];
  const texte = (t) => [...Buffer.from(t)];
  const graphe = [...champ(1, champ(4, texte('Identity'))), ...champ(2, texte('fumee')), ...champ(5, new Array(9000).fill(7)), ...champ(11, champ(1, texte('input'))), ...champ(12, champ(1, texte('dets')))];
  return Uint8Array.from([8, 8, ...champ(7, graphe), ...champ(8, [0x10, 17])]);
}

/**
 * Le role du Mac : le script telecharge a l'etape 6, lance tel quel par bash dans un faux dossier personnel. BANC_ESSAI_MODELE lui fait
 * deposer un faux modele au lieu d'installer et d'entrainer ; tout le reste est le vrai chemin (Python trouve, environnement cree,
 * cle verifiee, jeu lu, depot). Rend ce qu'il a dit, son code de sortie, et ce qu'il a laisse dans le dossier personnel.
 */
// Sur une machine qui a rustup (celle de la CI), pip demande sa version a rustc pour se presenter, et rustup cree alors son dossier
// dans le dossier personnel qu'on lui montre : il garde le vrai, pour que le faux ne recoive que ce que le script y ecrit.
const OUTILS_DU_VRAI_DOSSIER = { RUSTUP_HOME: process.env.RUSTUP_HOME ?? join(homedir(), '.rustup'), CARGO_HOME: process.env.CARGO_HOME ?? join(homedir(), '.cargo') };

function lancerLeScript({ nom, script }) {
  const maison = mkdtempSync(join(tmpdir(), 'fumee-banc-mac-'));
  const telechargements = mkdtempSync(join(tmpdir(), 'fumee-banc-dl-'));
  writeFileSync(join(telechargements, nom), script, { mode: 0o600 });
  writeFileSync(join(telechargements, 'faux.onnx'), fauxOnnx());
  return new Promise((ok) => {
    const p = spawn('bash', [join(telechargements, nom)], { env: { ...process.env, ...OUTILS_DU_VRAI_DOSSIER, HOME: maison, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', BANC_ESSAI_MODELE: join(telechargements, 'faux.onnx') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '', erreur = '';
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { erreur += d; });
    p.on('error', (e) => ok({ code: -1, sortie, erreur: erreur + e.message, range: [] }));
    p.on('close', (code) => {
      const range = readdirSync(maison).sort();
      rmSync(maison, { recursive: true, force: true }); rmSync(telechargements, { recursive: true, force: true });
      ok({ code, sortie, erreur, range });
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Ce qui se mesure dans la page

/**
 * Les contrastes des textes montres (WCAG : 4,5:1) et des pastilles (3:1), sur le fond reellement dessous : chaque fond translucide
 * (les commandes posees sur la carte) est compose sur celui d'en dessous. Un bouton grise n'est pas mesure. Rend les echecs.
 */
function mesurerContrastes({ textes, pastilles }) {
  const lire = (s) => {
    let m = /^rgba?\(([^)]+)\)/.exec(s);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    m = /^color\(srgb ([^)]+)\)/.exec(s);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    return [0, 0, 0, 0];
  };
  const sur = (dessus, dessous) => { const a = dessus[3]; return [0, 1, 2].map((i) => dessus[i] * a + dessous[i] * (1 - a)).concat(1); };
  const fondDe = (e) => {
    const couches = [];
    for (let x = e; x; x = x.parentElement) { const c = lire(getComputedStyle(x).backgroundColor); if (c[3] > 0) { couches.push(c); if (c[3] >= 1) break; } }
    let fond = lire(getComputedStyle(document.body).backgroundColor);
    if (fond[3] < 1) fond = matchMedia('(prefers-color-scheme: dark)').matches ? [0, 0, 0, 1] : [255, 255, 255, 1];
    for (const c of couches.reverse()) fond = sur(c, fond);
    return fond;
  };
  const lum = (c) => { const [r, v, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * v + 0.0722 * b; };
  const rapport = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
  const nom = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '') + ' « ' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 40) + ' »';
  const echecs = [], vus = new Set();
  let n = 0;
  for (const e of document.querySelectorAll(textes)) {
    if (vus.has(e) || !visible(e) || e.closest(':disabled') || !(e.innerText || '').trim()) continue;
    vus.add(e); n++;
    const fond = fondDe(e), r = rapport(sur(lire(getComputedStyle(e).color), fond), fond);
    if (r < 4.5) echecs.push(`${nom(e)} : ${r.toFixed(2)}:1`);
  }
  for (const e of document.querySelectorAll(pastilles)) {
    if (!visible(e)) continue;
    n++;
    const s = getComputedStyle(e), fond = fondDe(e.parentElement);
    // Une pastille se lit par son fond ou par son lisere : le meilleur des deux.
    const r = Math.max(rapport(sur(lire(s.backgroundColor), fond), fond), parseFloat(s.borderTopWidth) > 0 ? rapport(sur(lire(s.borderTopColor), fond), fond) : 0);
    if (r < 3) echecs.push(`${nom(e)} (pastille) : ${r.toFixed(2)}:1`);
  }
  return { n, echecs };
}

/** Au doigt : les cibles de 44 px, rien qui deborde de l'ecran en largeur, les commandes de la carte dans son cadre et sans se recouvrir. */
function mesurerMiseEnPage({ cibles, doigt }) {
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
  const nom = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '') + ' « ' + (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0, 30) + ' »';
  const echecs = [];
  const L = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > L + 1) echecs.push(`la page déborde en largeur : ${document.documentElement.scrollWidth} px pour ${L}`);
  for (const e of document.querySelectorAll('.import-panoramax *, .voile-dialogue *')) {
    if (!visible(e) || e.closest('.carte-tuiles, svg, .pano')) continue;
    const r = e.getBoundingClientRect();
    if (r.right > L + 1 || r.left < -1) { echecs.push(`${nom(e)} sort de l’écran (${Math.round(r.left)} à ${Math.round(r.right)} px pour ${L})`); break; }
  }
  if (doigt) {
    for (const e of document.querySelectorAll(cibles)) {
      if (!visible(e)) continue;
      // Une case a cocher se touche par son etiquette.
      const r = (e.matches('input[type=checkbox]') ? e.closest('label') ?? e : e).getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) echecs.push(`${nom(e)} : cible de ${Math.round(r.width)} × ${Math.round(r.height)} px`);
    }
  }
  const cadre = document.querySelector('.carte-cadre');
  if (cadre && visible(cadre) && !document.querySelector('.voile-dialogue')) {
    const c = cadre.getBoundingClientRect();
    const poses = [...cadre.querySelectorAll('.carte-fonds, .carte-couches, .carte-zoom, .carte-avis, .carte-indice, .carte-echelle, .carte-credit')].filter(visible).map((e) => ({ e, r: e.getBoundingClientRect() }));
    for (const { e, r } of poses) if (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1) echecs.push(`${nom(e)} sort du cadre de la carte`);
    for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
      const a = poses[i].r, b = poses[j].r;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) echecs.push(`${nom(poses[i].e)} recouvre ${nom(poses[j].e)}`);
    }
    if (c.height > innerHeight) echecs.push(`la carte (${Math.round(c.height)} px) est plus haute que l’écran (${innerHeight} px)`);
  }
  return echecs;
}

const TEXTES = ['.aide', '.etat', '.carte-indice', '.carte-avis p', '.carte-fonds button', '.carte-couches button', '.carte-zoom button', '.carte-echelle', '.carte-credit', '.carte-legende span',
  '.apercu-photo strong', '.apercu-photo small', '.apercu-vues li span', '.apercu-vues .cadre-vue', '.barre-choix label', '.gestes-apercu label', '.gestes-apercu button', '.parcelle-visee', '.parcelle-visee button', '.parcelle-visee code', '.barre-choix button',
  '.mosaique.grande .carte span', '.mosaique.grande .carte button', '.tete-dialogue strong', '.tete-dialogue small', '.tete-dialogue button', '.dialogue .rang button', '.dialogue .rang span', 'form.rang label', 'form.rang button', 'form.rang select', '.segments button']
  .map((s) => (s.startsWith('.tete-dialogue') || s.startsWith('.dialogue') ? '.voile-dialogue ' + s : '.page ' + s)).join(', ');
const PASTILLES = '.carte-legende .pastille-carte, .carte-legende .pastille-couverture, .carte-couches .pastille-couverture';
// Le grand chiffre d'une tuile (25 px, gras) est un grand texte : la regle des 4,5:1 ne le concerne pas (3:1), il n'est pas mesure ici.
const TEXTES_EQUILIBRE = ['.libelle-tuile', '.tuile small', '.tete-section h3', '.compte-section', '.tableau-equilibre th', '.tableau-equilibre td', '.liste-manques li', '.carte-legende span', '.segments button', '.carte-zoom button', '.carte-echelle', '.carte-credit', '.titres-page small', '.titres-page h2']
  .map((s) => '.page ' + s).join(', ');
const TEXTES_LOT = ['.aide', '.etat', 'form.rang label', 'form.rang button', '.segments button', '.carte-legende span', '.carte-zoom button', '.carte-echelle', '.carte-credit', '.recap-du-lot h4', '.recap-du-lot .libelle-tuile', '.recap-du-lot small', '.recap-du-lot label', '.recap-du-lot button']
  .map((s) => '.import-lot ' + s).join(', ');
const CIBLES = ['button', 'select', 'input:not([type=checkbox])', 'input[type=checkbox]'].flatMap((s) => ['.import-panoramax ' + s, '.voile-dialogue ' + s]).join(', ');

// ---------------------------------------------------------------------------------------------------------------------
// Le scenario

class Echec extends Error {}
const verifier = (vrai, quoi) => { if (!vrai) throw new Echec(quoi); };

async function jouer(navigateur, serveur, net, nom, etat) {
  const sombre = nom.endsWith('-sombre'), ecran = ECRANS[nom.replace(/-(clair|sombre)$/, '')];
  verifier(ecran, `passage inconnu : ${nom} (${TOUS.join(', ')})`);
  const doigt = !!ecran.hasTouch;
  const contexte = await navigateur.newContext({ ...ecran, colorScheme: sombre ? 'dark' : 'light', reducedMotion: 'reduce', deviceScaleFactor: CAPTURES ? 2 : 1, locale: 'fr-FR' });
  const journal = [], horsTemoin = [];
  const releves = new Set();
  const dire = (t) => { console.log(`  ${nom} · ${t}`); };
  // En temoin, rien ne part : ce qui n'est ni le serveur local ni un hote rejoue est refuse, et compte comme un echec.
  if (MODE === 'temoin') await contexte.route((u) => !u.href.startsWith(serveur.url) && !/^(data|blob):/.test(u.href), (route) => { horsTemoin.push(route.request().url()); return route.abort('failed'); });
  await net.brancher(contexte);
  if (MODE === 'temoin' && process.env.FUMEE_BANC_TUILES !== 'direct') await contexte.route(TUILE_FOND, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TUILE_UNIE }));
  else if (process.env.FUMEE_BANC_TUILES === 'direct') await contexte.route(TUILE_FOND, (route) => route.continue());
  await contexte.addInitScript(() => { window.__refusCsp = []; document.addEventListener('securitypolicyviolation', (e) => window.__refusCsp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const page = await contexte.newPage();
  page.setDefaultTimeout(DELAI);
  page.on('console', (m) => { if (m.type() === 'error') journal.push('console : ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => journal.push('erreur de page : ' + String(e).slice(0, 300)));
  const images = [];
  page.on('request', (r) => { if (HOTES.test(r.url()) && r.resourceType() !== 'image' && /\.(jpe?g|webp)(\?|$)/.test(r.url())) images.push(r.url()); });
  // Les versions reduites lues en tache de fond (« la maison se voit-elle ? ») : le temoin les garde, la lecture en depend.
  page.on('request', (r) => { if (HOTES.test(r.url()) && r.resourceType() === 'fetch' && /\/sd\.jpe?g(\?|$)/.test(r.url())) etat.gardees.add(r.url()); });
  const capture = async (moment) => { if (CAPTURES) { mkdirSync(CAPTURES, { recursive: true }); await page.screenshot({ path: join(CAPTURES, `banc-${nom}-${moment}.png`) }); } };
  const texte = (s) => page.locator(s).first().innerText();
  const attendre = (f, arg, quoi) => page.waitForFunction(f, arg, { timeout: DELAI }).catch(async () => { throw new Echec(`${quoi} (attendu ${DELAI / 1000} s) ; l’écran dit : ${(await page.locator('.import-panoramax').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500)}`); });
  const controler = async (moment) => {
    const c = await page.evaluate(mesurerContrastes, { textes: TEXTES, pastilles: PASTILLES });
    const m = await page.evaluate(mesurerMiseEnPage, { cibles: CIBLES, doigt });
    verifier(c.n > 8, `${moment} : ${c.n} textes mesurés seulement, les sélecteurs ne trouvent plus l’écran`);
    // FUMEE_BANC_AUDIT=1 : tout relever sans s'arreter au premier defaut (pour un tour d'horizon avant de corriger).
    if (AUDIT) { for (const x of [...c.echecs, ...m]) if (!releves.has(x)) { releves.add(x); dire(`[audit] ${moment} : ${x.replace(/\s+/g, ' ')}`); } }
    else {
      verifier(!c.echecs.length, `${moment} : contrastes insuffisants — ${c.echecs.join(' ; ')}`);
      verifier(!m.length, `${moment} : mise en page — ${m.join(' ; ')}`);
    }
    await capture(moment);
    return c.n;
  };
  const toucher = (l) => (doigt ? l.tap() : l.click());

  try {
    // 1. La page, comme en ligne : sa politique de contenu, le mot de passe.
    const reponse = await page.goto(serveur.url + '/?banc');
    verifier(/connect-src[^;]*api\.panoramax\.xyz/.test(reponse.headers()['content-security-policy'] ?? ''), 'la page est servie sans la politique de contenu du banc');
    await page.fill('input[type=password]', serveur.motDePasse);
    await page.keyboard.press('Enter');
    // Le compteur du banc (cache au telephone, mais tenu).
    await page.waitForSelector('header.barre .compte', { state: 'attached' });
    const compteAvant = parseInt(await page.locator('header.barre .compte').textContent(), 10);
    // Les onglets au bureau, la liste deroulante au telephone.
    // Une etape se choisit par sa valeur (son identifiant : import, redressement, brouillon, export, equilibre…), jamais par son
    // libelle : il porte le nombre de photos en attente, qui change quand la page finit de relire le serveur (un libelle lu juste
    // avant ne se retrouvait plus, et le passage attendait trente secondes pour rien).
    const allerA = async (etape) => {
      if (await page.locator('nav.etapes').isVisible()) await page.locator(`nav.etapes button[data-etape="${etape}"]`).click();
      else await page.selectOption('select.etapes-liste', { value: etape });
    };
    await allerA('import');
    await toucher(page.getByRole('radio', { name: /Panoramax, sur la carte/ }));

    // 2. La France entiere : la couverture de Panoramax, et ce que la carte en dit.
    await attendre(() => document.querySelector('.carte-indice')?.textContent === 'Zoomez sur une zone orange pour voir ses photos de rue', null, 'la carte de France ne dit pas « Zoomez sur une zone orange pour voir ses photos de rue »');
    verifier(/km$/.test(await texte('.carte-echelle')), 'l’échelle de la carte de France n’est pas en kilomètres : ' + await texte('.carte-echelle'));
    verifier((await texte('.carte-legende')).includes('rues photographiées (Panoramax)'), 'la légende ne dit pas la couverture de Panoramax');
    verifier(await page.getByRole('button', { name: 'Couverture Panoramax' }).getAttribute('aria-pressed') === 'true', 'le bouton « Couverture Panoramax » n’est pas enfoncé');
    verifier(await page.locator('canvas.carte-couverture').count() === 1, 'la couverture n’a pas de dessin');
    const nFrance = await controler('france');
    dire(`France : couverture visible, « ${await texte('.carte-indice')} », échelle ${await texte('.carte-echelle')}`);

    // 3. L'adresse : la carte y va, sa parcelle est visee, les photos autour d'elle.
    await page.fill('input[aria-label="Adresse ou coordonnées"]', ADRESSE);
    await page.locator('.import-panoramax form.rang input[type=number]').fill(String(RAYON));
    await toucher(page.getByRole('button', { name: 'Chercher' }));
    await attendre(() => /\d+ photo\(s\) à \d+ m de la parcelle AE 0*101 ; \d+ déjà dans le banc\./.test(document.querySelector('.import-panoramax > .etat')?.textContent ?? ''), null, 'la recherche ne dit pas les photos à 40 m de la parcelle AE 101');
    const [, trouvees, deja] = /(\d+) photo\(s\) à \d+ m.* ; (\d+) déjà/.exec(await texte('.import-panoramax > .etat')).map(Number);
    verifier(trouvees > 0, `aucune photo à ${RAYON} m de la parcelle`);
    verifier(deja === etat.importees, `${deja} photo(s) déjà dans le banc, ${etat.importees} attendue(s)`);
    verifier((await texte('.parcelle-visee')).replace(/\s+/g, ' ').match(/Parcelle visée : AE 0*101 /), 'la parcelle AE 101 n’est pas dite visée');
    await attendre(() => / m$/.test(document.querySelector('.carte-echelle')?.textContent ?? '') && !!document.querySelector('.carte-dessin .parcelle.choisie'), null, 'la carte n’est pas allée à l’adresse (échelle en mètres, parcelle visée dessinée)');
    verifier(await page.locator('.adresse-carte').count() === 1, 'le repère de l’adresse n’est pas sur la carte');

    // 4. « Seulement les facades » : son compte, les points et la liste ; la case decochee, toutes les photos.
    const COMPTE = /^(\d+) photos?, (\d+) façades? de (\d+) bâtiments?, (\d+) doublons?(?: dont \d+ déjà dans le banc)?(?:, \d+ façades? cachées?)? ; (\d+) écartées? : route, campagne ou pas une maison\.$/;
    await attendre((re) => new RegExp(re).test(document.querySelector('.compte-facades')?.textContent ?? ''), COMPTE.source, 'le filtre des façades ne dit pas son compte');
    const [, proposees, facades, batiments, doublons, ecartees] = COMPTE.exec(await texte('.compte-facades')).map(Number);
    // Un mur deja dans le banc (la vue importee au premier passage) ne se propose plus : dit dans le compte, marque dans la liste, jamais coche.
    const dejaLa = Number(/dont (\d+) déjà dans le banc/.exec(await texte('.compte-facades'))?.[1] ?? 0), marquesDeja = await page.locator('ul.mosaique.grande > li .marque-doublon.deja-la').count();
    verifier(etat.importees ? dejaLa > 0 : dejaLa === 0, `${dejaLa} vue(s) dite(s) « déjà dans le banc » ${etat.importees ? 'après' : 'avant'} l’import`);
    verifier(dejaLa <= doublons && marquesDeja <= dejaLa && await page.locator('ul.mosaique.grande > li:has(.deja-la) input:checked').count() === 0, `« déjà dans le banc » : ${dejaLa} vue(s) au compte, ${marquesDeja} photo(s) marquée(s), ou l’une est cochée`);
    // Chaque photo proposee a une vue au moins (a importer ou en doublon), et chaque batiment regarde une vue au moins.
    verifier(proposees > 0 && facades + doublons >= proposees && batiments > 0 && batiments <= facades + doublons, `le filtre ne propose rien de cohérent : ${await texte('.compte-facades')}`);
    // Chaque carte dit sa note ; une photo toute en doublons le dit et n'est pas cochee d'office.
    verifier(await page.locator('ul.mosaique.grande > li .note-vue').count() === proposees, 'chaque photo proposée ne dit pas sa note');
    const notes = (await page.locator('ul.mosaique.grande > li:not(.doublon) .note-vue').allInnerTexts()).map((t) => parseInt(t.replace('note ', ''), 10));
    verifier(await page.locator('label', { hasText: 'Vues par bâtiment' }).locator('select').inputValue() === '1', 'le réglage « Vues par bâtiment » ne vaut pas 1 par défaut');
    verifier(notes.every((n, k) => n >= 0 && n <= 100 && (k === 0 || n <= notes[k - 1])), `la liste n’est pas triée par note décroissante : ${notes.join(' ')}`);
    verifier(await page.locator('ul.mosaique.grande > li.doublon input:checked').count() === 0, 'une photo en doublon est cochée d’office');
    // « La maison se voit-elle ? » : la case existe, decochee par defaut ; les apercus se lisent en tache de fond, et l'etat le dit.
    const cachees = page.getByLabel('Écarter les façades cachées');
    verifier(await cachees.count() === 1 && !(await cachees.isChecked()), 'la case « Écarter les façades cachées » manque, ou est cochée d’office');
    await attendre(() => /façades? cachées?/.test(document.querySelector('.compte-facades')?.textContent ?? '') && document.querySelectorAll('.marque-cachee').length > 0, null, 'aucune façade n’est lue cachée autour de AE 101 (haies et clôtures du boulevard)');
    verifier(proposees + ecartees === trouvees - deja, `le compte du filtre (${proposees} + ${ecartees}) n’est pas celui des photos (${trouvees} − ${deja})`);
    const points = page.locator('g.point-photo:not(.valeur)'), cartes = page.locator('ul.mosaique.grande > li');
    verifier(await points.count() === proposees && await cartes.count() === proposees, `${await points.count()} point(s) et ${await cartes.count()} carte(s) pour ${proposees} photo(s) proposée(s)`);
    // Toutes cochees : le bouton d'import dit les vues gardees par le filtre, puis toutes celles de la visee.
    // « Tout cocher » ne coche pas les doublons : le bouton d'import annonce les facades du compte (« N façades de N bâtiments »).
    const vuesAImporter = async () => { await toucher(page.getByRole('button', { name: 'Tout cocher' })); return parseInt((await page.getByRole('button', { name: /^Importer \d+ (vue|façade)/ }).innerText()).replace('Importer ', ''), 10); };
    verifier(await vuesAImporter() === facades, `le bouton d’import ne dit pas les ${facades} façade(s) du filtre`);
    // Un batiment, une fois : l'import annonce ses facades et ses batiments, et rien n'est coche en double.
    const annonce = /^Importer (\d+) façades? de (\d+) bâtiments?$/.exec(await page.getByRole('button', { name: /^Importer \d+ façade/ }).innerText());
    verifier(annonce && Number(annonce[2]) === batiments, `le bouton d’import n’annonce pas les ${batiments} bâtiment(s) du filtre : ${annonce?.[0]}`);
    verifier(await page.locator('.en-double').count() === 0, '« Tout cocher » a coché une façade deux fois');
    const avecDoublons = page.getByRole('button', { name: /^Avec les doublons/ });
    verifier((await avecDoublons.count() > 0) === (await page.locator('ul.mosaique.grande > li.doublon').count() > 0), 'le bouton « Avec les doublons » ne suit pas les photos en doublon');
    if (await avecDoublons.count()) {
      // Les doublons coches expres : l'ecran le dit, sans empecher l'import.
      await toucher(avecDoublons);
      verifier(/^\d+ bâtiments? en double$/.test(await texte('.en-double')), 'des doublons cochés ne sont pas signalés : ' + await texte('.barre-choix'));
      verifier(await page.getByRole('button', { name: /^Importer \d+ façade/ }).isEnabled(), 'des doublons cochés empêchent l’import');
      await toucher(page.getByRole('button', { name: 'Tout cocher' }));
    }
    await page.getByLabel('Seulement les façades').uncheck();
    await attendre((n) => !document.querySelector('.compte-facades') && document.querySelectorAll('g.point-photo:not(.valeur)').length === n, proposees + ecartees, `case décochée : la carte ne montre pas les ${proposees + ecartees} photos`);
    verifier(await cartes.count() === proposees + ecartees, 'case décochée : la liste ne montre pas toutes les photos');
    const sansFiltre = await vuesAImporter();
    verifier(sansFiltre >= facades, `case décochée : ${sansFiltre} vue(s), moins que les ${facades} façade(s) du filtre`);
    await page.getByLabel('Seulement les façades').check();
    await attendre((n) => document.querySelectorAll('g.point-photo:not(.valeur)').length === n, proposees, 'case recochée : le filtre ne revient pas');
    dire(`adresse : ${trouvees} photo(s) à ${RAYON} m de AE 101, ${deja} déjà dans le banc ; « ${await texte('.compte-facades')} » ; case décochée : ${proposees + ecartees} photo(s), ${sansFiltre} vue(s)`);

    // 5. L'apercu des facades d'un point : survole a la souris, touche au doigt. Un panoramique de preference, et un point que rien ne couvre.
    // Au telephone, la carte est sous le formulaire : on l'amene a l'ecran, comme le doigt le ferait.
    await page.locator('.import-panoramax .carte-cadre').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const choisi = await page.evaluate(() => {
      const l = [...document.querySelectorAll('g.point-photo:not(.valeur)')].map((g, i) => { const r = g.querySelector('.point').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; return { i, x, y, libre: g.contains(document.elementFromPoint(x, y)), pano: (g.getAttribute('aria-label') ?? '').includes('panoramique') }; }).filter((p) => p.libre);
      return l.find((p) => p.pano) ?? l[0] ?? null;
    });
    verifier(choisi, 'aucun point de photo n’est atteignable sur la carte');
    if (doigt) await page.touchscreen.tap(choisi.x, choisi.y); else await page.mouse.move(choisi.x, choisi.y, { steps: 4 });
    await page.waitForSelector('aside.apercu-photo:not(.vide)');
    await attendre(() => { const a = document.querySelector('aside.apercu-photo'), i = [...a.querySelectorAll('.apercu-vues img')]; return !a.textContent.includes('Lecture du panoramique') && i.length > 0 && i.every((x) => x.complete && x.naturalWidth > 0); }, null, 'l’aperçu des façades ne montre pas ses vues');
    const apercu = await page.evaluate(() => { const a = document.querySelector('aside.apercu-photo'), c = document.querySelector('.carte-cadre').getBoundingClientRect(), r = a.getBoundingClientRect(); return { titre: a.querySelector('header strong').textContent, vues: a.querySelectorAll('.apercu-vues img').length, texte: a.innerText, dessous: r.top >= c.bottom - 1, aCote: r.left >= c.right - 1, haut: r.top, sd: document.querySelector('li.carte.montree img')?.getAttribute('src') ?? null }; });
    verifier(!apercu.texte.includes('Aperçu impossible'), 'aperçu impossible : ' + apercu.texte.replace(/\s+/g, ' ').slice(0, 200));
    verifier(await page.locator('li.carte.montree').count() === 1, 'la photo montrée n’est pas mise en valeur dans la liste');
    if (ecran.viewport.width <= 900) verifier(apercu.dessous, 'au téléphone, l’aperçu des façades n’est pas sous la carte'); else verifier(apercu.aCote, 'au bureau, l’aperçu des façades n’est pas à côté de la carte');
    if (apercu.sd) etat.gardees.add(apercu.sd);
    // Le cadre de chaque vue d'un 360 se dit sous son image : calcule pour la facade (« 52° · ↑6° »), dans les bornes, ou celui d'avant.
    const CADRE = /^(\d+)° · ↑(\d+)°( · coupée)?$/;
    if (apercu.titre.startsWith('Panoramique')) {
      const cadres = await page.locator('aside.apercu-photo .apercu-vues .cadre-vue').allInnerTexts();
      verifier(cadres.length === apercu.vues && cadres.every((t) => { const m = CADRE.exec(t); return m && Number(m[1]) >= 40 && Number(m[1]) <= 100 && Number(m[2]) >= 0 && Number(m[2]) <= 35; }), 'l’aperçu ne dit pas le cadre de ses vues (champ de 40° à 100°, tangage de 0° à 35°) : ' + cadres.join(' | '));
      verifier(await page.getByLabel('Cadrer sur la façade').isChecked() && !(await page.getByLabel('Redresser sur le mur').isChecked()) && await page.getByLabel('Préférer l’hiver').isChecked(), 'les réglages du cadrage n’ont pas leurs valeurs de départ (cadrer et hiver cochés, redresser décoché)');
      // « Proposer un marquage » : le banc de la fumee n'a aucun modele, la case est grisee et dit pourquoi ; cocher « Redresser sur le mur » n'y change rien.
      const marquage = page.getByLabel('Proposer un marquage');
      verifier(await marquage.isDisabled() && !(await marquage.isChecked()) && /étape 3/.test(await page.locator('label:has-text("Proposer un marquage")').getAttribute('title') ?? ''), '« Proposer un marquage » n’est pas grisée sans modèle, ou ne dit pas d’en installer un à l’étape 3');
      // « Cadrer sur la facade » decochee : toutes les vues reviennent a 75 degres et 8 vers le haut.
      await page.getByLabel('Cadrer sur la façade').uncheck();
      await attendre(() => { const l = [...document.querySelectorAll('aside.apercu-photo .apercu-vues .cadre-vue')]; return l.length > 0 && l.every((x) => x.textContent === '75° · ↑8°'); }, null, 'case « Cadrer sur la façade » décochée : les vues ne reviennent pas à 75° et 8°');
      await page.getByLabel('Cadrer sur la façade').check();
      await attendre((avant) => [...document.querySelectorAll('aside.apercu-photo .apercu-vues .cadre-vue')].map((x) => x.textContent).join('|') === avant, cadres.join('|'), 'case « Cadrer sur la façade » recochée : le cadre calculé ne revient pas');
      dire(`cadre des vues : ${cadres.join(', ')} ; 75° · ↑8° la case décochée`);
    }
    const nApercu = await controler('apercu');
    dire(`aperçu : ${apercu.titre}, ${apercu.vues} vue(s) telles qu’importées, ${apercu.dessous ? 'sous' : 'à côté de'} la carte`);

    // 6. « Choisir les vues » s'ouvre et se ferme (Echap au clavier, « Termine » au doigt).
    if (!doigt) await page.mouse.click(choisi.x, choisi.y);
    const ouvrir = apercu.titre.startsWith('Panoramique') ? page.locator('aside.apercu-photo').getByRole('button', { name: 'Choisir les vues' }) : cartes.getByRole('button', { name: 'Choisir les vues' }).first();
    let nFenetre = 0;
    if (await ouvrir.count()) {
      await toucher(ouvrir);
      const fenetre = page.getByRole('dialog', { name: 'Vues du panoramique' });
      await fenetre.waitFor();
      await attendre(() => { const i = [...document.querySelectorAll('.dialogue .apercus img, .dialogue .pano img')]; return i.length > 0 && i.every((x) => x.complete && x.naturalWidth > 0); }, null, 'la fenêtre « Choisir les vues » ne montre pas ses vues');
      verifier(/^360 \d+ \/ \d+$/.test(await texte('.tete-dialogue strong')), 'la fenêtre ne dit pas quel 360 elle montre');
      const tient = await page.evaluate(() => { const d = document.querySelector('.dialogue').getBoundingClientRect(), b = [...document.querySelectorAll('.tete-dialogue button')].at(-1).getBoundingClientRect(); return d.left >= -1 && d.right <= innerWidth + 1 && d.bottom <= innerHeight + 1 && b.top >= 0 && b.bottom <= innerHeight; });
      verifier(tient, 'la fenêtre « Choisir les vues » dépasse de l’écran, ou son bouton « Terminé » n’est pas atteignable');
      // Le cadre d'une vue se retouche : cinq degres de champ de plus, puis de moins.
      const cadreVue = page.locator('.dialogue .apercus .cadre-de-vue span').first(), lu = async () => Number(/^(\d+)°/.exec(await cadreVue.innerText())?.[1]);
      const champ0 = await lu(), sens = champ0 >= 100 ? -5 : 5;
      await toucher(page.locator('.dialogue .apercus .cadre-de-vue').first().getByRole('button', { name: sens > 0 ? 'Élargir le champ de 5°' : 'Resserrer le champ de 5°' }));
      await attendre((n) => Number(/^(\d+)°/.exec(document.querySelector('.dialogue .apercus .cadre-de-vue span')?.textContent ?? '')?.[1]) === n, champ0 + sens, `« Choisir les vues » : le champ retouché ne passe pas de ${champ0}° à ${champ0 + sens}°`);
      await toucher(page.locator('.dialogue .apercus .cadre-de-vue').first().getByRole('button', { name: sens > 0 ? 'Resserrer le champ de 5°' : 'Élargir le champ de 5°' }));
      await attendre((n) => Number(/^(\d+)°/.exec(document.querySelector('.dialogue .apercus .cadre-de-vue span')?.textContent ?? '')?.[1]) === n, champ0, 'le champ retouché ne revient pas');
      nFenetre = await controler('vues');
      if (doigt) await page.getByRole('button', { name: 'Terminé' }).tap(); else await page.keyboard.press('Escape');
      await fenetre.waitFor({ state: 'detached' });
      dire('« Choisir les vues » : ouverte, ses vues montrées, refermée');
    } else dire('« Choisir les vues » : aucun panoramique proposé, non jouée');

    // 7. L'import d'une photo, une fois par execution : 201, et le compteur du banc monte.
    if (!etat.importees) {
      await toucher(page.getByRole('button', { name: 'Tout décocher' }));
      await page.getByLabel('Photo choisie pour l’import').check();
      const bouton = page.getByRole('button', { name: /^Importer \d+ (vue\(s\) de 1 photo\(s\)|façades? de \d+ bâtiments?)$/ });
      const nVues = parseInt((await bouton.innerText()).replace('Importer ', ''), 10);
      verifier(nVues >= 1, 'la photo choisie n’a aucune vue à importer');
      images.length = 0;
      const statuts = [];
      const ecoute = (r) => { if (r.url().includes('api.php') && r.request().method() === 'POST' && /[?&]r=images(&|$)/.test(r.url())) statuts.push(r.status()); };
      page.on('response', ecoute);
      await toucher(bouton);
      await attendre(() => /\d+ vue\(s\) importée\(s\), lot/.test(document.querySelector('.import-panoramax > .etat')?.textContent ?? ''), null, 'l’import ne se termine pas');
      page.off('response', ecoute);
      verifier(statuts.length === nVues && statuts.every((s) => s === 201), `l’import a répondu ${statuts.join(', ') || 'rien'} pour ${nVues} vue(s) (201 attendu)`);
      verifier((await texte('.import-panoramax > .etat')).startsWith(`${nVues} vue(s) importée(s), lot panoramax-`), 'l’import ne dit pas ses vues : ' + await texte('.import-panoramax > .etat'));
      await attendre((n) => parseInt(document.querySelector('header.barre .compte')?.textContent ?? '', 10) === n, compteAvant + nVues, `le compteur du banc ne monte pas à ${compteAvant + nVues}`);
      verifier(await cartes.count() === proposees - 1, 'la photo importée est encore proposée');
      for (const u of images) { etat.gardees.add(u); etat.grandes.add(u); }
      // Chaque vue importee par le tri garde le mur qu'elle montre (son batiment de la BD TOPO, son cote, son azimut).
      const murs = await page.evaluate(async () => (await (await fetch('api.php?r=images', { headers: { 'X-Banc': '1' } })).json()).map((m) => m.mur ?? null));
      verifier(murs.length === compteAvant + nVues && murs.every((m) => m && /^BATIMENT/.test(m.batiment) && m.cote >= 0 && m.cote <= 3 && typeof m.azimut === 'number' && typeof m.segment === 'number'), 'les vues importées ne gardent pas leur mur : ' + JSON.stringify(murs).slice(0, 300));
      etat.murs = murs.length;
      // Et son cadre : le champ et le tangage de la vue tiree du 360, sa focale equivalente pour le redressement.
      const cadrages = await page.evaluate(async () => (await (await fetch('api.php?r=images', { headers: { 'X-Banc': '1' } })).json()).map((m) => ({ c: m.cadrage ?? null, f: m.focale35 ?? null })));
      verifier(cadrages.every((x) => x.c && x.c.champ >= 40 && x.c.champ <= 100 && x.c.tangage >= 0 && x.c.tangage <= 35 && ['defaut', 'facade', 'main'].includes(x.c.source) && x.f > 10 && x.f < 60), 'les vues importées ne gardent pas leur cadre : ' + JSON.stringify(cadrages).slice(0, 300));
      etat.importees = 1;
      dire(`import : ${nVues} vue(s), ${statuts.join(' ')} ; le banc passe de ${compteAvant} à ${compteAvant + nVues} photo(s)`);
    }

    // 7 ter. L'import d'une zone en lot : un pave autour de l'adresse, une cible de deux facades ; le parcours (une requete de photos,
    // une de batiments), le recapitulatif, puis l'import une fois par execution. Aux passages suivants, ces batiments sont deja dans le banc.
    await allerA('import');
    await toucher(page.getByRole('radio', { name: /une zone en lot/ }));
    const lot = page.locator('.import-lot');
    await lot.getByLabel('Commune ou coordonnées').fill('48.90507, 2.13254');
    await toucher(lot.getByRole('button', { name: 'Viser' }));
    await attendre(() => /^Zone dessinée : \d+ ha\.$/.test(document.querySelector('.zone-du-lot')?.textContent ?? ''), null, 'le lot ne dit pas sa zone (un pavé autour du point)');
    await lot.getByLabel('Cible, en façades').fill('2');
    await toucher(lot.getByRole('button', { name: 'Parcourir la zone' }));
    const AVANCE = /Pavé (\d+) sur (\d+) · (\d+) photo\(s\) lue\(s\) · (\d+) façade\(s\) retenue\(s\) \((\d+) bâtiment\(s\) vus(?:, (\d+) déjà dans le banc)?\).*(cible atteinte|zone parcourue en entier)\./;
    await attendre((re) => new RegExp(re).test((document.querySelector('.avance-du-lot')?.textContent ?? '').replace(/\s+/g, ' ')), AVANCE.source, 'le parcours du lot ne se termine pas');
    const [, , nPaves, photosLues, retenuesLot, , dejaLot] = AVANCE.exec((await texte('.avance-du-lot')).replace(/\s+/g, ' ')).map((x) => Number(x ?? 0));
    verifier(nPaves >= 1 && photosLues > 0 && retenuesLot <= 2, `le lot a lu ${photosLues} photo(s) sur ${nPaves} pavé(s) et retenu ${retenuesLot} façade(s) pour une cible de 2`);
    verifier(etat.lot ? dejaLot >= etat.lot : true, `le lot ne dit pas les ${etat.lot} bâtiment(s) déjà dans le banc (${dejaLot})`);
    verifier(await page.locator('.carte-lot .zone-lot').count() === 1 && await page.locator('.carte-lot .pave.lu').count() === nPaves, 'la carte du lot ne montre pas la zone et ses pavés lus');
    const cLot = await page.evaluate(mesurerContrastes, { textes: TEXTES_LOT, pastilles: '.carte-lot .pastille-lot.lu, .carte-lot .pastille-lot.zone' });
    const mLot = await page.evaluate(mesurerMiseEnPage, { cibles: '.import-lot button, .import-lot input:not([type=checkbox]), .import-lot input[type=checkbox]', doigt });
    if (AUDIT) { for (const x of [...cLot.echecs, ...mLot]) dire(`[audit] lot : ${x.replace(/\s+/g, ' ')}`); }
    else {
      verifier(!cLot.echecs.length, `lot : contrastes insuffisants — ${cLot.echecs.join(' ; ')}`);
      verifier(!mLot.length, `lot : mise en page — ${mLot.join(' ; ')}`);
    }
    if (retenuesLot > 0) {
      const recap = lot.locator('.recap-du-lot');
      verifier(parseInt(await recap.locator('.valeur-tuile').first().innerText(), 10) === retenuesLot && (await recap.locator('.tuile').first().innerText()).includes('une par bâtiment'), 'le récapitulatif du lot ne dit pas ses façades, une par bâtiment');
      verifier(/Mo$/.test(await recap.locator('.valeur-tuile').nth(2).innerText()), 'le récapitulatif ne dit pas le poids estimé');
      verifier(await recap.getByLabel(/Écarter les façades cachées/).isChecked(), '« Écarter les façades cachées » n’est pas cochée d’office pour un lot');
      await capture('lot');
      if (!etat.lot) {
        // Les images du temoin sont de synthese : la lecture « facade cachee » n'y a pas de sens, on la leve pour l'import.
        await recap.getByLabel(/Écarter les façades cachées/).uncheck();
        const avantLot = parseInt(await page.locator('header.barre .compte').textContent(), 10);
        images.length = 0;
        await toucher(recap.getByRole('button', { name: /^Importer les \d+ façade/ }));
        await attendre(() => /\d+ façade\(s\) importée\(s\)/.test(document.querySelector('.import-lot > .etat')?.textContent ?? ''), null, 'l’import du lot ne se termine pas');
        const importees = parseInt(await texte('.import-lot > .etat'), 10);
        verifier(importees === retenuesLot, `le lot a importé ${importees} façade(s) sur ${retenuesLot} : ${await texte('.import-lot > .etat')}`);
        await attendre((n) => parseInt(document.querySelector('header.barre .compte')?.textContent ?? '', 10) === n, avantLot + importees, 'le compteur du banc ne monte pas après l’import du lot');
        await attendre(() => /Tout le lot est dans le banc/.test(document.querySelector('.recap-du-lot')?.textContent ?? ''), null, 'le lot ne dit pas qu’il est tout entier dans le banc');
        // Jamais deux fois le meme batiment dans le banc.
        const bats = await page.evaluate(async () => (await (await fetch('api.php?r=images', { headers: { 'X-Banc': '1' } })).json()).map((m) => m.mur?.batiment ?? null));
        verifier(bats.every(Boolean) && new Set(bats).size === bats.length, 'un bâtiment est deux fois dans le banc après le lot : ' + bats.join(', '));
        for (const u of images) { etat.gardees.add(u); etat.grandes.add(u); }
        etat.lot = importees;
        dire(`lot : ${photosLues} photo(s) lue(s) sur ${nPaves} pavé(s), ${retenuesLot} façade(s) retenue(s), ${importees} importée(s) ; aucun bâtiment en double`);
      } else dire(`lot : ${retenuesLot} façade(s) nouvelle(s) proposée(s), ${dejaLot} bâtiment(s) déjà dans le banc écarté(s)`);
    } else {
      verifier((await lot.innerText()).includes('Aucune façade nouvelle'), 'un lot sans façade ne le dit pas');
      dire(`lot : aucune façade nouvelle (${dejaLot} bâtiment(s) déjà dans le banc)`);
    }

    // 7 bis. L'equilibre du jeu (etape 8) : les vues importees se comptent la ou elles ont ete prises, et la carte les montre.
    await allerA('equilibre');
    await page.waitForSelector('.carte-equilibre .amas');
    const total = parseInt(await page.locator('header.barre .compte').textContent(), 10);
    const eq = await page.evaluate(() => {
      const ligne = (t) => { const tr = [...document.querySelectorAll('.tableau-equilibre tr')].find((x) => x.querySelector('th')?.textContent === t); return tr ? Number(tr.querySelector('td.nombre').textContent) : null; };
      const somme = (titre) => { const s = [...document.querySelectorAll('.grille-equilibre .section')].find((x) => x.querySelector('h3')?.firstChild?.textContent === titre); return s ? [...s.querySelectorAll('tr td.nombre:not(.part)')].reduce((n, td) => n + Number(td.textContent), 0) : null; };
      const cadre = document.querySelector('.carte-equilibre .carte-cadre').getBoundingClientRect();
      const amas = [...document.querySelectorAll('.carte-equilibre .amas')].map((g) => { const r = g.querySelector('circle').getBoundingClientRect(); return { n: Number(g.querySelector('text')?.textContent ?? 1), dedans: r.left >= cadre.left && r.right <= cadre.right && r.top >= cadre.top && r.bottom <= cadre.bottom }; });
      return { titre: document.querySelector('.page h2')?.textContent, photos: Number(document.querySelector('.tuile .valeur-tuile')?.textContent), yvelines: ligne('78 · Yvelines'), idf: ligne('Île-de-France'), panoramax: ligne('Panoramax'),
        batiments: somme('Par type de bâtiment'), doublons: [...document.querySelectorAll('.page details.section')].find((x) => x.querySelector('h3')?.firstChild?.textContent?.startsWith('Doublons'))?.querySelector('.compte-section')?.textContent ?? null, saisons: somme('Par saison'), vues: somme('Par type de vue'), etats: somme('Par état d’avancement'), regions: document.querySelectorAll('.grille-equilibre .section:first-child tr').length, amas, manques: document.querySelector('.liste-manques')?.innerText ?? '' };
    });
    verifier(eq.titre === 'Équilibre du jeu', 'l’écran d’équilibre ne s’ouvre pas');
    verifier(total > 0 && eq.photos === total, `l’équilibre compte ${eq.photos} photo(s), le banc en a ${total}`);
    verifier(eq.yvelines === total && eq.idf === total, `les ${total} vue(s) du Vésinet ne sont pas toutes comptées dans les Yvelines (${eq.yvelines}) et en Île-de-France (${eq.idf})`);
    verifier(eq.regions === 13, `la répartition par région montre ${eq.regions} région(s), 13 attendues (les vides à zéro)`);
    verifier(eq.panoramax === total && eq.saisons === total && eq.vues === total && eq.etats === total, `les comptes ne font pas ${total} : Panoramax ${eq.panoramax}, saisons ${eq.saisons}, types de vue ${eq.vues}, états ${eq.etats}`);
    verifier(eq.amas.reduce((n, a) => n + a.n, 0) === total && eq.amas.every((a) => a.dedans), `la carte de l’équilibre ne montre pas les ${total} vue(s) dans son cadre : ${JSON.stringify(eq.amas)}`);
    verifier(eq.manques.includes('type de bâtiment'), 'l’écran ne dit pas ce que les métadonnées ne portent pas');
    verifier(await page.getByRole('button', { name: 'Chercher où importer' }).count() === 1, 'l’écran d’équilibre ne propose pas « Où importer ensuite »');
    // Les vues importees par le tri disent leur mur : toutes comptees par type de batiment ; et les doublons du banc se disent.
    verifier(eq.batiments === total, `l’équilibre compte ${eq.batiments} vue(s) par type de bâtiment, ${total} attendue(s)`);
    verifier(/^(aucun|\d+ mur\(s\), \d+ image\(s\) en trop)$/.test(eq.doublons ?? ''), 'l’écran d’équilibre ne dit pas les doublons du banc : ' + eq.doublons);
    const cEq = await page.evaluate(mesurerContrastes, { textes: TEXTES_EQUILIBRE, pastilles: '.carte-equilibre .pastille-amas' });
    const mEq = await page.evaluate(mesurerMiseEnPage, { cibles: '.carte-equilibre button, .actions-page button', doigt });
    verifier(cEq.n > 30, `équilibre : ${cEq.n} textes mesurés seulement, les sélecteurs ne trouvent plus l’écran`);
    if (AUDIT) { for (const x of [...cEq.echecs, ...mEq]) dire(`[audit] équilibre : ${x.replace(/\s+/g, ' ')}`); }
    else {
      verifier(!cEq.echecs.length, `équilibre : contrastes insuffisants — ${cEq.echecs.join(' ; ')}`);
      verifier(!mEq.length, `équilibre : mise en page — ${mEq.join(' ; ')}`);
    }
    await capture('equilibre');
    dire(`équilibre : ${total} vue(s), toutes dans les Yvelines (Île-de-France), ${eq.amas.length} rond(s) sur la carte ; ${cEq.n} textes mesurés`);

    // 7 ter. Le Redressement (etape 2) : les gestes de chaque carte en icones seules, et la poubelle sans confirmation mais en differe
    // (demande du proprietaire, 15 novembre 2026). Une photo jetable, de synthese et sans mur (ni le lot ni l'equilibre ne la comptent) :
    // supprimee puis rendue par « Annuler », puis supprimee pour de bon, le DELETE recu par l'API d'essai.
    const nomJetable = `fumee-a-supprimer-${nom}`;
    const deletes = [];
    page.on('request', (r) => { if (r.method() === 'DELETE' && /[?&]r=image(&|$)/.test(r.url())) deletes.push(r.url()); });
    const idJetable = await page.evaluate(async ({ b64, nomPhoto }) => {
      const f = new FormData();
      f.append('fichier', new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }), 'photo.png');
      f.append('meta', JSON.stringify({ source: 'fichier', nom: nomPhoto }));
      return (await (await fetch('api.php?r=images', { method: 'POST', body: f, headers: { 'X-Banc': '1' } })).json()).id;
    }, { b64: PHOTO_DE_SYNTHESE.toString('base64'), nomPhoto: nomJetable });
    verifier(typeof idJetable === 'string', 'la photo jetable du redressement ne s’importe pas');
    // La page relit les photos du serveur au chargement (la session reste ouverte).
    await page.reload();
    await page.waitForSelector('header.barre .compte', { state: 'attached' });
    await allerA('redressement');
    const carte = page.locator('.grille-photos .tuile-photo', { has: page.locator('.legende-photo .nom', { hasText: nomJetable }) });
    await carte.waitFor();
    const gestes = await page.evaluate(() => [...document.querySelectorAll('.grille-photos .tuile-photo')].map((t) => {
      const c = t.getBoundingClientRect();
      const b = [...t.querySelectorAll('.actions-carte button')];
      return { labels: b.map((x) => x.getAttribute('aria-label')).join(' | '), textes: b.map((x) => x.innerText.trim()).join(''), titres: b.every((x) => (x.getAttribute('title') ?? '').length > 0),
        dehors: b.filter((x) => { const r = x.getBoundingClientRect(); return r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5; }).length };
    }));
    verifier(gestes.length > 0 && gestes.every((g) => g.labels === 'Redresser automatiquement | Redresser à la main | Déjà de face : garder telle quelle | Supprimer cette photo'), 'les quatre gestes d’une carte ne disent pas leur nom : ' + JSON.stringify(gestes[0]));
    verifier(gestes.every((g) => !g.textes && g.titres), 'un geste d’une carte montre encore son texte, ou n’a pas d’infobulle');
    verifier(gestes.every((g) => !g.dehors), 'les quatre icônes ne tiennent pas dans leur carte');
    const compteRedr = parseInt(await page.locator('header.barre .compte').textContent(), 10);
    const poubelle = () => carte.getByRole('button', { name: 'Supprimer cette photo' });
    await toucher(poubelle());
    await carte.waitFor({ state: 'detached' });
    await attendre(() => /^Photo supprimée\./.test(document.querySelector('.message')?.textContent ?? ''), null, 'la suppression ne dit pas « Photo supprimée »');
    const annuler = page.locator('.message').getByRole('button', { name: 'Annuler' });
    verifier(parseInt(await page.locator('header.barre .compte').textContent(), 10) === compteRedr - 1, 'le compteur du banc ne descend pas quand la photo est supprimée');
    const cRedr = await page.evaluate(mesurerContrastes, { textes: '.page .legende-photo .nom, .page .legende-photo small, .page .segments button, .message span, .message button', pastilles: ':not(*)' });
    const mRedr = await page.evaluate(mesurerMiseEnPage, { cibles: '.grille-photos .actions-carte button, .message button', doigt });
    if (AUDIT) { for (const x of [...cRedr.echecs, ...mRedr]) dire(`[audit] redressement : ${x.replace(/\s+/g, ' ')}`); }
    else {
      verifier(!cRedr.echecs.length, `redressement : contrastes insuffisants — ${cRedr.echecs.join(' ; ')}`);
      verifier(!mRedr.length, `redressement : mise en page — ${mRedr.join(' ; ')}`);
    }
    await capture('redressement-annuler');
    await toucher(annuler);
    await carte.waitFor();
    verifier(!deletes.length, 'l’API a reçu le DELETE avant la fin du délai, ou malgré « Annuler »');
    // Pour de bon : le DELETE part au bout du delai (6 s), et seulement celui-la ; la suppression annulee n'en envoie jamais.
    const reponseDelete = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes(idJetable), { timeout: 12000 });
    await toucher(poubelle());
    await carte.waitFor({ state: 'detached' });
    verifier((await reponseDelete).status() === 200, 'l’API d’essai refuse le DELETE de la photo');
    await page.waitForTimeout(300);
    verifier(deletes.length === 1, `${deletes.length} DELETE envoyé(s), un seul attendu`);
    const restantes = await page.evaluate(async () => (await (await fetch('api.php?r=images', { headers: { 'X-Banc': '1' } })).json()).map((m) => m.id));
    verifier(!restantes.includes(idJetable), 'la photo supprimée est encore sur le serveur');
    verifier(await carte.count() === 0 && parseInt(await page.locator('header.barre .compte').textContent(), 10) === compteRedr - 1, 'la photo supprimée revient à l’écran');
    await capture('redressement');
    dire(`redressement : ${gestes.length} carte(s), quatre icônes chacune ; supprimée, rendue par « Annuler », puis supprimée pour de bon (un DELETE) ; ${cRedr.n} textes mesurés`);

    // 7 quater. « Entrainer sur mon Mac » (demande du proprietaire, 20 novembre 2026 : moins de gestes entre l'export et le depot du
    // modele ; 21 novembre : l'entrainement se fait sur son Mac). Une photo corrigee jetable fait le jeu. A l'etape 6, le bouton cree
    // une cle et telecharge le script qui la porte, et l'ecran donne la commande a coller. Le script telecharge est alors lance tel
    // quel par bash, dans le role du Mac : il trouve Python, cree son environnement, verifie sa cle, lit le jeu et depose un faux ONNX
    // (BANC_ESSAI_MODELE : ni installation ni entrainement). Le modele apparait a l'etape 3 sans recharger la page, inactif, et
    // s'active d'un geste ; une seconde cle se revoque depuis l'ecran et ne vaut plus rien. Ni Mac, ni mps, ni entrainement ne sont joues.
    const idPhotoJeu = await page.evaluate(async ({ b64 }) => {
      const photo = () => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
      const envoi = async (r, champs) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.append(k, v, ...(v instanceof Blob ? ['photo.png'] : [])); return (await fetch('api.php?r=' + r, { method: 'POST', body: f, headers: { 'X-Banc': '1' } })).json(); };
      const { id } = await envoi('images', { fichier: photo(), meta: JSON.stringify({ source: 'fichier', nom: 'fumee-entrainement' }) });
      await envoi('redressee&id=' + id, { fichier: photo(), redressement: JSON.stringify({ methode: 'face' }) });
      const json = (methode, r, corps) => fetch('api.php?r=' + r + '&id=' + id, { method: methode, body: JSON.stringify(corps), headers: { 'X-Banc': '1', 'Content-Type': 'application/json' } }).then((x) => x.status);
      const marque = await json('PUT', 'annotation', { par: 'main', objets: [{ id: 'f1', classe: 'fenetre', type: 'fenetre_1v', forme: 'rectangle', points: [{ x: 4, y: 4 }, { x: 40, y: 40 }], parent: null, attributs: {}, origine: 'main' }] });
      const range = await json('PATCH', 'image', { bloc: 'train', verifiee: true });
      return marque === 200 && range === 200 ? id : null;
    }, { b64: PHOTO_DE_SYNTHESE.toString('base64') });
    verifier(typeof idPhotoJeu === 'string', 'la photo corrigée de l’entraînement ne se prépare pas');
    await page.reload();
    await page.waitForSelector('header.barre .compte', { state: 'attached' });
    await allerA('export');
    const boutonEntrainer = page.getByRole('button', { name: /Entraîner sur mon Mac/ });
    await boutonEntrainer.waitFor();
    verifier(/Ce script contient une clé valable 24 h : ne le partagez pas\./.test(await texte('.avis-cle')), 'l’écran ne prévient pas que le script porte une clé : ' + await texte('.avis-cle'));
    verifier(!/colab/i.test(await page.locator('body').innerText()), 'l’écran d’export parle encore de Colab');
    verifier(await page.locator('.cles-entrainement li').count() === 0, 'une clé d’entraînement est listée avant d’en avoir créé une');
    const creerCle = async () => {
      const [fichier] = await Promise.all([page.waitForEvent('download'), toucher(boutonEntrainer)]);
      return { nom: fichier.suggestedFilename(), script: readFileSync(await fichier.path(), 'utf8') };
    };
    const cle = await creerCle();
    verifier(/^entrainer-banc-rf-detr-nano-\d{8}-\d{6}\.sh$/.test(cle.nom) && cle.script.startsWith('#!/bin/bash\n') && cle.script.trimEnd().endsWith('# fin du script du banc'), 'le fichier téléchargé n’est pas un script entier du banc : ' + cle.nom);
    const jeton = /^BANC_CLE='(bj_[0-9a-f]{16}_[0-9a-f]{64})'$/m.exec(cle.script)?.[1];
    const apiBanc = serveur.url + '/banc/api.php';
    verifier(jeton && cle.script.includes(`BANC_ADRESSE='${apiBanc}'`), 'le script ne porte pas l’adresse du banc et sa clé');
    // L'ecran donne la commande a coller dans le Terminal, et jamais la cle.
    await page.locator('.script-pret').waitFor();
    verifier((await texte('.commande-script code')).trim() === `bash ~/Downloads/${cle.nom}`, 'l’écran ne donne pas la commande à coller : ' + await texte('.commande-script code'));
    verifier(!(await page.locator('body').innerText()).includes(jeton.split('_')[2]), 'l’écran montre la clé');
    await attendre(() => document.querySelectorAll('.cles-entrainement li').length === 1 && /En attente du script/.test(document.querySelector('.cles-entrainement')?.textContent ?? ''), null, 'la clé créée n’est pas listée « En attente du script »');
    const cEntr = await page.evaluate(mesurerContrastes, { textes: '.entrainement .aide, .entrainement .note, .entrainement button, .commande-script code, .cles-entrainement strong, .cles-entrainement small, .cles-entrainement button, .titre-cles', pastilles: ':not(*)' });
    const mEntr = await page.evaluate(mesurerMiseEnPage, { cibles: '.entrainement button.bouton, .cles-entrainement button.bouton', doigt });
    if (AUDIT) { for (const x of [...cEntr.echecs, ...mEntr]) dire(`[audit] entraînement : ${x.replace(/\s+/g, ' ')}`); }
    else {
      verifier(!cEntr.echecs.length, `entraînement : contrastes insuffisants — ${cEntr.echecs.join(' ; ')}`);
      verifier(!mEntr.length, `entraînement : mise en page — ${mEntr.join(' ; ')}`);
    }
    await capture('entrainement-cle');
    // Le Mac : le script telecharge, lance par bash dans un faux dossier personnel. Il lit le jeu et depose le faux modele.
    const mac = await lancerLeScript(cle);
    verifier(mac.code === 0, `le script d’entraînement s’arrête (code ${mac.code}) : ${(mac.sortie + mac.erreur).slice(-600)}`);
    verifier(/Clé acceptée, valable encore 2[34] h/.test(mac.sortie) && /Téléchargement du jeu/.test(mac.sortie) && /Déposé dans le banc : RF-DETR Nano · entraîné le /.test(mac.sortie) && /Terminé\./.test(mac.sortie), 'le script ne dit pas ce qu’il a fait : ' + mac.sortie.slice(-600));
    verifier(!(mac.sortie + mac.erreur).includes(jeton) && !(mac.sortie + mac.erreur).includes(jeton.split('_')[2]), 'le script affiche sa clé en entier');
    verifier(mac.range.join(',') === 'banc-entrainement', 'le script écrit hors de son dossier : ' + mac.range.join(', '));
    // L'etape 3, sans recharger la page : le modele depose est la, dit d'ou il vient, inactif ; il s'active d'un geste.
    await allerA('brouillon');
    const carteModele = page.locator('.carte-modele', { has: page.locator('.origine-modele') });
    await carteModele.waitFor();
    const idModele = await page.evaluate(async () => (await (await fetch('api.php?r=modeles')).json()).find((m) => m.depot)?.id);
    verifier(/^entrainement-\d{8}-\d{6}-[0-9a-f]{6}$/.test(idModele ?? ''), 'le modèle déposé n’a pas un nom choisi par le serveur : ' + idModele);
    const origine = await carteModele.locator('.origine-modele').innerText();
    verifier(/^Déposé par le script d’entraînement le \d\d\/\d\d\/\d{4} \d\d:\d\d · jeu du .* \(1 photo vérifiée\) · mAP non mesuré · à activer$/.test(origine.replace(/\s+/g, ' ')), 'la carte du modèle déposé ne dit pas d’où il vient : ' + origine);
    verifier(/rf-detr · 384 px · \d+ classe/.test(await carteModele.locator('.titres-modele small').innerText()), 'le modèle déposé n’a pas sa résolution ni ses classes');
    const relies = /\((\d+) \/ (\d+)\)/.exec(await carteModele.locator('.correspondances:not(.bilan-modele) summary').innerText());
    verifier(relies && relies[1] === relies[2] && Number(relies[2]) > 1, 'les noms du modèle déposé ne sont pas reliés aux types du banc');
    const interrupteur = carteModele.locator('.interrupteur input');
    verifier(!(await interrupteur.isChecked()), 'le modèle déposé par le script arrive déjà actif');
    const cModele = await page.evaluate(mesurerContrastes, { textes: '.carte-modele .origine-modele, .carte-modele .titres-modele strong, .carte-modele .titres-modele small, .carte-modele summary', pastilles: ':not(*)' });
    if (AUDIT) { for (const x of cModele.echecs) dire(`[audit] modèle déposé : ${x.replace(/\s+/g, ' ')}`); }
    else verifier(!cModele.echecs.length, `modèle déposé : contrastes insuffisants — ${cModele.echecs.join(' ; ')}`);
    await capture('entrainement-modele');
    // La case suit le serveur (elle ne change qu'apres sa reponse) : un toucher, puis l'attente de l'etat.
    await (doigt ? interrupteur.tap({ force: true }) : interrupteur.click({ force: true }));
    await attendre(() => document.querySelector('.carte-modele:has(.origine-modele)')?.classList.contains('actif') && !/à activer/.test(document.querySelector('.origine-modele')?.textContent ?? ''), null, 'le modèle déposé ne s’active pas');
    // Retour a l'etape 6 : la cle a servi ; une seconde se revoque depuis l'ecran et ne vaut plus rien.
    await allerA('export');
    await attendre(() => /Modèle déposé/.test(document.querySelector('.cles-entrainement')?.textContent ?? ''), null, 'la clé qui a servi n’est pas dite « Modèle déposé »');
    const duMac = (cleJeton, r, init = {}) => fetch(`${apiBanc}?r=${r}`, { ...init, headers: { 'X-Banc-Jeton': cleJeton, ...(init.headers ?? {}) } });
    verifier((await duMac(jeton, 'entrainement-jeu')).status === 409, 'la clé qui a déposé son modèle lit encore le jeu');
    const relance = await lancerLeScript(cle);
    verifier(relance.code === 2 && /cette clé a déjà déposé son modèle/.test(relance.erreur), 'relancé après le dépôt, le script ne dit pas que sa clé a servi : ' + relance.erreur.slice(-300));
    const seconde = await creerCle();
    const jeton2 = /^BANC_CLE='(bj_[0-9a-f]{16}_[0-9a-f]{64})'$/m.exec(seconde.script)?.[1];
    verifier(jeton2 && jeton2 !== jeton, 'la seconde clé n’est pas une clé neuve');
    await attendre(() => document.querySelectorAll('.cles-entrainement li').length === 2, null, 'la seconde clé n’est pas listée');
    const ouEnEst = await duMac(jeton2, 'entrainement-etat');
    verifier(ouEnEst.status === 200 && (await ouEnEst.json()).depose === false, 'la seconde clé ne dit pas où elle en est');
    verifier((await duMac(jeton2, 'entrainement-jeu')).status === 200, 'la seconde clé ne lit pas le jeu');
    // Revenir sur la page (depuis le Terminal) relit les cles : celle-ci dit que son script a lu le jeu.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await attendre(() => /Jeu lu par le script : entraînement en cours/.test(document.querySelector('.cles-entrainement')?.textContent ?? ''), null, 'revenir sur la page ne dit pas que le script a lu le jeu');
    await toucher(page.locator('.cles-entrainement li', { hasText: /Jeu lu par le script/ }).getByRole('button', { name: 'Révoquer' }));
    await attendre(() => document.querySelectorAll('.cles-entrainement li').length === 1, null, 'la clé révoquée reste listée');
    const refusee = await duMac(jeton2, 'entrainement-jeu');
    verifier(refusee.status === 401 && (await refusee.text()) === '{"erreur":"Jeton refusé."}', 'la clé révoquée lit encore le jeu');
    const revoquee = await lancerLeScript(seconde);
    verifier(revoquee.code === 2 && /la clé de ce script est refusée : elle a expiré ou a été révoquée/.test(revoquee.erreur), 'lancé avec une clé révoquée, le script ne le dit pas : ' + revoquee.erreur.slice(-300));
    await toucher(page.locator('.cles-entrainement li').getByRole('button', { name: 'Retirer' }));
    await attendre(() => !document.querySelector('.cles-entrainement li'), null, 'la clé qui a servi ne se retire pas de la liste');
    // Le passage suivant repart sans cette photo ni ce modele.
    const menage = await page.evaluate(async ({ image, modele }) => Promise.all([`image&id=${image}`, `modele&id=${modele}`].map((r) => fetch('api.php?r=' + r, { method: 'DELETE', headers: { 'X-Banc': '1' } }).then((x) => x.status))), { image: idPhotoJeu, modele: idModele });
    verifier(menage.every((c) => c === 200), 'la photo et le modèle de l’entraînement ne s’effacent pas');
    dire(`entraînement : script ${cle.nom} (${cle.script.split('\n').length} lignes) joué par bash sans entraîner (clé vérifiée, jeu lu, modèle déposé), apparu à l’étape 3 puis activé ; relancé : « a déjà déposé » ; seconde clé révoquée (401, et le script le dit) ; ${cEntr.n + cModele.n} textes mesurés`);

    // 8. Rien de travers : ni erreur de console, ni refus de la politique de contenu, ni requete hors du temoin.
    const refus = await page.evaluate(() => window.__refusCsp);
    verifier(!refus.length, 'refus de la politique de contenu : ' + refus.slice(0, 3).join(' ; '));
    verifier(!journal.length, 'erreurs de console : ' + journal.slice(0, 3).join(' ; '));
    verifier(!horsTemoin.length, 'requêtes hors des hôtes du témoin : ' + horsTemoin.slice(0, 3).join(' ; '));
    dire(`${nFrance + nApercu + nFenetre} textes et pastilles mesurés (4,5:1)${doigt ? ', cibles de 44 px' : ''} ; ni erreur de console, ni refus de CSP`);
    return null;
  } catch (e) {
    if (CAPTURES || process.env.FUMEE_CAPTURES) { const d = CAPTURES || process.env.FUMEE_CAPTURES; mkdirSync(d, { recursive: true }); await page.screenshot({ path: join(d, `banc-${nom}-echec.png`), fullPage: true }).catch(() => {}); }
    return (e instanceof Echec ? e.message : String(e.stack || e)) + (journal.length ? ` | console : ${journal.slice(0, 3).join(' ; ')}` : '');
  } finally {
    await contexte.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le temoin, apres un enregistrement : sans les tuiles du fond, avec les seules images des photos jouees, reduites.

async function allegerLeTemoin(navigateur, gardees, grandes) {
  const fichierIndex = TEMOIN + 'index.json', index = JSON.parse(readFileSync(fichierIndex, 'utf8'));
  const page = await (await navigateur.newContext()).newPage();
  const adresse = (k) => k.slice(k.indexOf(' ') + 1), redirection = (e) => e.statut >= 300 && e.statut < 400;
  // Une photo gardee l'est avec la ou sa redirection mene (le stockage de l'instance).
  for (const [k, e] of Object.entries(index)) if (redirection(e) && gardees.has(adresse(k)) && e.entetes?.location) { gardees.add(e.entetes.location); if (grandes.has(adresse(k))) grandes.add(e.entetes.location); }
  let retires = 0, reduites = 0;
  for (const [k, e] of Object.entries(index)) {
    const url = adresse(k);
    const image = (e.type ?? '').startsWith('image/');
    if (TUILE_FOND.test(url) || ((image || redirection(e)) && !gardees.has(url)) || e.echec) {
      if (e.fichier && existsSync(TEMOIN + e.fichier)) unlinkSync(TEMOIN + e.fichier);
      delete index[k]; retires++;
      continue;
    }
    e.duree = 0;
    if (!image) continue;
    // 1024 px de large pour la version reduite d'un panoramique, 2048 pour celle qu'on importe : de quoi jouer, pas de quoi publier.
    const corps = gunzipSync(readFileSync(TEMOIN + e.fichier)), cote = grandes.has(url) ? 2048 : 1024;
    const b64 = await page.evaluate(async ({ b64, cote }) => {
      const b = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
      const k = Math.min(1, cote / b.width), c = document.createElement('canvas');
      c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
      c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.6).split(',')[1];
    }, { b64: corps.toString('base64'), cote });
    const reduit = Buffer.from(b64, 'base64');
    if (reduit.length < corps.length) { writeFileSync(TEMOIN + e.fichier, gzipSync(reduit, { level: 9 })); e.type = 'image/jpeg'; reduites++; }
  }
  writeFileSync(fichierIndex, JSON.stringify(index, null, 1) + '\n');
  return `témoin allégé : ${retires} réponse(s) retirée(s) (tuiles du fond, images non jouées), ${reduites} image(s) réduite(s), ${Object.keys(index).length} gardée(s)`;
}

// ---------------------------------------------------------------------------------------------------------------------

const t0 = Date.now();
const serveur = await servir();
const proxy = MODE !== 'temoin' || process.env.FUMEE_BANC_TUILES === 'direct' ? process.env.HTTPS_PROXY || process.env.https_proxy : null;
const navigateur = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {});
const sansTemoin = [];
const net = reseau(MODE, TEMOIN, {
  hotes: HOTES, tolerance: 0.02, latence: false, redirections: true,
  // Une image sans temoin : une image de synthese ; une tuile de couverture : vide. Le reste n'a pas de reponse inventee.
  sansTemoin: (req) => {
    if (TUILE_COUVERTURE.test(req.url())) return { status: 204, body: '' };
    if (req.resourceType() === 'image' || /\.(jpe?g|webp|png)(\?|$)/.test(req.url())) return { status: 200, contentType: 'image/png', body: PHOTO_DE_SYNTHESE };
    sansTemoin.push(req.method() + ' ' + req.url());
    return null;
  },
});
console.log(`fumée du banc → ${serveur.url}/?banc · réseau ${MODE === 'temoin' ? 'témoin' : MODE} · ${PASSAGES.join(', ')}`);
const etat = { importees: 0, lot: 0, gardees: new Set(), grandes: new Set() };
const echecs = [];
for (const nom of PASSAGES) {
  const t = Date.now();
  const e = await jouer(navigateur, serveur, net, nom, etat);
  if (!e && sansTemoin.length) echecs.push(`${nom} : ${sansTemoin.length} requête(s) sans témoin, refusée(s) — ${sansTemoin.slice(0, 3).join(' ; ')} (refaire le témoin : FUMEE_RESEAU=enregistrer)`);
  else if (e) echecs.push(`${nom} : ${e}`);
  console.log(`${e || sansTemoin.length ? '✗' : '✓'} ${nom} (${((Date.now() - t) / 1000).toFixed(1)} s)${e ? ' — ' + e : ''}`);
  sansTemoin.length = 0;
}
console.log(net.bilan().replace('(laissées au réseau)', '(images de synthèse, tuiles de couverture vides)'));
if (MODE === 'enregistrer' && !echecs.length) console.log(await allegerLeTemoin(navigateur, etat.gardees, etat.grandes));
await navigateur.close();
serveur.fermer();
console.log(`${echecs.length ? 'ÉCHEC' : 'OK'} : ${PASSAGES.length - echecs.length} passage(s) sur ${PASSAGES.length} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (echecs.length) { for (const e of echecs) console.log(' - ' + e); process.exit(1); }
