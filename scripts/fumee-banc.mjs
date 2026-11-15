// La fumee du banc d'apprentissage des facades (banc/, l'application a part) : l'ecran d'import Panoramax joue dans un vrai navigateur,
// sur le paquet construit, servi comme en ligne (la page a ?banc, la politique de contenu de son .htaccess, son API en PHP).
//
//   npm run build:banc
//   NODE_PATH=$(npm root -g) node scripts/fumee-banc.mjs            # deux passages : bureau clair, telephone sombre ; reseau temoin
//
// Ce qu'il joue, a « 2 allee des Limites, Le Vesinet » : l'ouverture sur la France (la couverture de Panoramax et ce que la carte en
// dit), l'adresse (la carte y va, la parcelle visee, les photos), « Seulement les facades » (son compte, puis la case decochee),
// l'apercu des facades d'un point (survole a la souris, touche au doigt), la fenetre « Choisir les vues », l'import d'une photo (201,
// le compteur du banc monte). A chaque passage : ni erreur de console, ni refus de la politique de contenu, ni requete hors du temoin ;
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
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
  '.apercu-photo strong', '.apercu-photo small', '.apercu-vues li span', '.gestes-apercu label', '.gestes-apercu button', '.parcelle-visee', '.parcelle-visee button', '.parcelle-visee code', '.barre-choix button',
  '.mosaique.grande .carte span', '.mosaique.grande .carte button', '.tete-dialogue strong', '.tete-dialogue small', '.tete-dialogue button', '.dialogue .rang button', '.dialogue .rang span', 'form.rang label', 'form.rang button', 'form.rang select', '.segments button']
  .map((s) => (s.startsWith('.tete-dialogue') || s.startsWith('.dialogue') ? '.voile-dialogue ' + s : '.page ' + s)).join(', ');
const PASTILLES = '.carte-legende .pastille-carte, .carte-legende .pastille-couverture, .carte-couches .pastille-couverture';
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
    if (await page.locator('nav.etapes').isVisible()) await page.locator('nav.etapes button', { hasText: 'Import' }).first().click();
    else await page.selectOption('select.etapes-liste', { label: (await page.locator('select.etapes-liste option', { hasText: 'Import' }).first().innerText()) });
    await toucher(page.getByRole('radio', { name: /Panoramax/ }));

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
    await page.locator('form.rang input[type=number]').fill(String(RAYON));
    await toucher(page.getByRole('button', { name: 'Chercher' }));
    await attendre(() => /\d+ photo\(s\) à \d+ m de la parcelle AE 0*101 ; \d+ déjà dans le banc\./.test(document.querySelector('.import-panoramax > .etat')?.textContent ?? ''), null, 'la recherche ne dit pas les photos à 40 m de la parcelle AE 101');
    const [, trouvees, deja] = /(\d+) photo\(s\) à \d+ m.* ; (\d+) déjà/.exec(await texte('.import-panoramax > .etat')).map(Number);
    verifier(trouvees > 0, `aucune photo à ${RAYON} m de la parcelle`);
    verifier(deja === etat.importees, `${deja} photo(s) déjà dans le banc, ${etat.importees} attendue(s)`);
    verifier((await texte('.parcelle-visee')).replace(/\s+/g, ' ').match(/Parcelle visée : AE 0*101 /), 'la parcelle AE 101 n’est pas dite visée');
    await attendre(() => / m$/.test(document.querySelector('.carte-echelle')?.textContent ?? '') && !!document.querySelector('.carte-dessin .parcelle.choisie'), null, 'la carte n’est pas allée à l’adresse (échelle en mètres, parcelle visée dessinée)');
    verifier(await page.locator('.adresse-carte').count() === 1, 'le repère de l’adresse n’est pas sur la carte');

    // 4. « Seulement les facades » : son compte, les points et la liste ; la case decochee, toutes les photos.
    const COMPTE = /^(\d+) photos?, (\d+) façades? ; (\d+) écartées? : route ou campagne\.$/;
    await attendre((re) => new RegExp(re).test(document.querySelector('.compte-facades')?.textContent ?? ''), COMPTE.source, 'le filtre des façades ne dit pas son compte');
    const [, proposees, facades, ecartees] = COMPTE.exec(await texte('.compte-facades')).map(Number);
    verifier(proposees > 0 && facades >= proposees, `le filtre ne propose rien de cohérent : ${await texte('.compte-facades')}`);
    verifier(proposees + ecartees === trouvees - deja, `le compte du filtre (${proposees} + ${ecartees}) n’est pas celui des photos (${trouvees} − ${deja})`);
    const points = page.locator('g.point-photo:not(.valeur)'), cartes = page.locator('ul.mosaique.grande > li');
    verifier(await points.count() === proposees && await cartes.count() === proposees, `${await points.count()} point(s) et ${await cartes.count()} carte(s) pour ${proposees} photo(s) proposée(s)`);
    // Toutes cochees : le bouton d'import dit les vues gardees par le filtre, puis toutes celles de la visee.
    const vuesAImporter = async () => { await toucher(page.getByRole('button', { name: 'Tout cocher' })); return parseInt((await page.getByRole('button', { name: /^Importer \d+ vue/ }).innerText()).replace('Importer ', ''), 10); };
    verifier(await vuesAImporter() === facades, `le bouton d’import ne dit pas les ${facades} façade(s) du filtre`);
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
    await page.locator('.carte-cadre').evaluate((e) => e.scrollIntoView({ block: 'center' }));
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
      nFenetre = await controler('vues');
      if (doigt) await page.getByRole('button', { name: 'Terminé' }).tap(); else await page.keyboard.press('Escape');
      await fenetre.waitFor({ state: 'detached' });
      dire('« Choisir les vues » : ouverte, ses vues montrées, refermée');
    } else dire('« Choisir les vues » : aucun panoramique proposé, non jouée');

    // 7. L'import d'une photo, une fois par execution : 201, et le compteur du banc monte.
    if (!etat.importees) {
      await toucher(page.getByRole('button', { name: 'Tout décocher' }));
      await page.getByLabel('Photo choisie pour l’import').check();
      const bouton = page.getByRole('button', { name: /^Importer \d+ vue\(s\) de 1 photo\(s\)$/ });
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
      etat.importees = 1;
      dire(`import : ${nVues} vue(s), ${statuts.join(' ')} ; le banc passe de ${compteAvant} à ${compteAvant + nVues} photo(s)`);
    }

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
const etat = { importees: 0, gardees: new Set(), grandes: new Set() };
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
