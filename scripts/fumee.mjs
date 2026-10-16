// La liste de fumee, jouee par un navigateur (tests/CHECKLIST-FUMEE.md, spec-ihm-mobile §11.3).
//
// Chaque point est un geste pilote par de vrais evenements — souris, doigts (CDP), clavier — sur le
// jeu de demonstration, dans les trois classes d'ecran et les deux themes. Ce qu'un geste a change
// se mesure dans l'etat du plan (`window.__plan.etat()`, expose en developpement seulement), pas a
// l'oeil. La plateforme est simulee comme pour les captures (scripts/captures.mjs).
//
// Ce que ce script ne sait pas jouer, il le dit : les points qui demandent le reseau (cadastre,
// orthophoto, PLU, bibliotheque 3D) sortent « non joue » avec leur raison, jamais « passe ».
//
//   BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 &
//   node scripts/fumee.mjs [http://localhost:5199] [points…]
//
// FUMEE_CLASSES=large FUMEE_THEMES=light : une partie des classes d'ecran et des themes.
// FUMEE_PARALLELE=3 : parties jouees a la fois. FUMEE_RESEAU : voir scripts/fumee-reseau.mjs.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ouvrirDemo, FORMATS, BASE } from './captures.mjs';
import { choisirModeReseau, reseau, servirThreeLocal } from './fumee-reseau.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const choisis = process.argv.slice(3).map(Number).filter(Boolean);
const THEMES = ['light', 'dark'];

// ---- Aides cote page -----------------------------------------------------------------------------

/**
 * Les photos de synthese d'une scene du banc de facades (tests/fixtures/facades/), en PNG : la vue
 * principale puis ses autres vues. Rendues une fois par passage par le generateur du banc
 * (.claude/skills/facades/scripts/photos.ts), deterministe : le corpus ne porte aucune image.
 */
const photosRendues = new Map();
function photosScene(nom) {
  if (!photosRendues.has(nom)) {
    const dossier = mkdtempSync(join(tmpdir(), 'fumee-facade-'));
    execFileSync('npx', ['tsx', '.claude/skills/facades/scripts/photos.ts', nom, dossier], { stdio: 'ignore' });
    const vues = readdirSync(dossier).filter((f) => /^vue-\d+\.png$/.test(f)).sort().map((f) => readFileSync(join(dossier, f)));
    const { coins, largeur, largeurPx } = JSON.parse(readFileSync(join(dossier, 'coins.json'), 'utf8'));
    photosRendues.set(nom, { vues, coins, largeur, largeurPx });
  }
  return photosRendues.get(nom);
}

/**
 * Le mur de la maison le plus proche de la largeur d'une scene du banc : la detection se lit en metres,
 * et un mur deux fois plus court ecraserait les baies sous les seuils de taille.
 */
async function choisirMurProche(page, largeur) {
  const murs = page.locator('.releveListe [data-controle="releve.choisirMur"]');
  const largeurs = await murs.evaluateAll((bs) => bs.map((b) => Number((b.textContent.match(/([\d,]+) m/)?.[1] ?? '0').replace(',', '.'))));
  const k = largeurs.length ? largeurs.reduce((m, l, i) => (Math.abs(l - largeur) < Math.abs(largeurs[m] - largeur) ? i : m), 0) : -1;
  if (k >= 0) await murs.nth(k).click(); else await page.locator('[data-controle="releve.choisirMur"]').first().click();
  await page.waitForTimeout(600);
  return k >= 0 ? largeurs[k] : null;
}

/**
 * Le releve d'une seule photo de synthese d'une scene du banc, coins vrais poses au doigt, jusqu'a
 * l'etape Verifier. Rend l'etat des facades d'avant, pour le Ctrl+Z.
 */
async function releverScene(page, nom) {
  const { vues: [photo], coins, largeur, largeurPx } = photosScene(nom);
  await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
  const avant = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)));
  await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
  const mur = await choisirMurProche(page, largeur);
  await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'vue-0.png', mimeType: 'image/png', buffer: photo });
  await poserCoins(page, coins[0], largeurPx[0]);
  await page.locator('[data-controle="releve.analyser"]').first().click({ timeout: 30000 });
  await page.locator('[data-controle="releve.valider"]').first().waitFor({ timeout: 60000 });
  return { avant, mur };
}

/**
 * Pose au doigt les quatre coins du mur sur la photo du releve (haut gauche, haut droit, bas droit, bas
 * gauche), en pixels de la photo d'origine : chaque cible est glissee de sa place proposee a la sienne.
 * La photo importee a pu etre reduite : les coins le sont d'autant.
 */
async function poserCoins(page, coins, largeurPx) {
  await page.locator('svg.releveCoins').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await page.locator('circle.releveCoinCible').nth(i).scrollIntoViewIfNeeded();
    const { a, b } = await page.evaluate(({ i, p }) => {
      const svg = document.querySelector('svg.releveCoins');
      const img = svg.querySelector('image');
      const k = Number(img.getAttribute('width')) / p.largeurPx;
      const ctm = svg.getScreenCTM();
      const pt = svg.createSVGPoint();
      const c = svg.querySelectorAll('circle.releveCoinCible')[i];
      pt.x = Number(c.getAttribute('cx')); pt.y = Number(c.getAttribute('cy'));
      const a = pt.matrixTransform(ctm);
      pt.x = p.x * k; pt.y = p.y * k;
      const b = pt.matrixTransform(ctm);
      return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
    }, { i, p: { ...coins[i], largeurPx } });
    await glisser(page, a, b.x - a.x, b.y - a.y, 6);
  }
}

/** L'etat du plan, en JSON : ce qu'on compare avant et apres un geste. */
const lireEtat = (page) => page.evaluate(() => {
  const e = window.__plan.etat();
  return JSON.parse(JSON.stringify({ objects: e.objects, measures: e.measures, scene: e.scene, selectedKey: e.selectedKey }));
});
const objet = (etat, pred) => etat.objects.find(pred);

/**
 * L'image du canevas 3D une fois immobile : trois lectures egales a 200 ms d'ecart, ou `max` ms
 * au plus (l'ancienne attente fixe, qui reste le pire cas). La scene se construit puis la camera
 * glisse vers son point de vue : attendre l'immobilite plutot qu'une duree rend la main des que
 * c'est fini, et ne lit jamais une image en mouvement.
 */
async function image3dStable(page, max) {
  const lire = () => page.evaluate(() => document.querySelector('#terrasse3dCanvasHost canvas')?.toDataURL() ?? '');
  const fin = Date.now() + max;
  let derniere = await lire(), egales = 0;
  while (Date.now() < fin && egales < 2) {
    await page.waitForTimeout(200);
    const i = await lire();
    egales = i && i === derniere ? egales + 1 : 0;
    derniere = i;
  }
  return derniere;
}

/** Position a l'ecran (coordonnees de la page) d'un point du monde. */
async function versPage(page, p) {
  return page.evaluate((p) => {
    const e = window.__plan.etat();
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: r.left + e.scene.origine.x + p.x * e.scene.scale, y: r.top + e.scene.origine.y - p.y * e.scene.scale };
  }, p);
}
/** Le centre a l'ecran d'un element du plan. */
async function centreDe(page, selecteur) {
  const b = await page.locator(selecteur).first().boundingBox();
  if (!b) throw new Error('introuvable : ' + selecteur);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/**
 * Le centre d'un element du plan, a condition qu'il soit vraiment sous le pointeur a cet endroit
 * (et non sous un panneau, une feuille ou le tiroir). Sinon `null`, ou une erreur.
 */
async function visible(page, selecteur, exiger = true) {
  const c = await centreDe(page, selecteur).catch(() => null);
  const ok = c && await page.evaluate(({ c, selecteur }) => {
    const el = document.elementFromPoint(c.x, c.y);
    return !!el && el.matches(selecteur);
  }, { c, selecteur });
  if (ok) return c;
  if (exiger) throw new Error('masque ou hors ecran : ' + selecteur);
  return null;
}
/** Referme feuilles et panneaux flottants, puis cadre la selection : le plan est degage. */
async function degager(page) {
  await page.evaluate(() => {
    window.__plan.ouvrirFeuille(null);
    const m = window.__plan.magasin();
    if (m.classe === 'moyen' && m.inspecteurOuvert) document.querySelector('.inspecteurPli')?.click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__plan.executer('vue.ajuster'));
  await page.waitForTimeout(150);
}
async function glisser(page, de, dx, dy, pas = 8) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  for (let i = 1; i <= pas; i++) await page.mouse.move(de.x + dx * i / pas, de.y + dy * i / pas);
  await page.mouse.up();
  await page.waitForTimeout(120);
}
/**
 * Selectionne un objet et cadre dessus, comme le ferait la personne avant de le manipuler. Le plan
 * de demonstration s'ouvre sur tout son voisinage (100 m, a 2 px par metre) : la terrasse n'y fait que
 * quelques pixels, ses poignees se recouvrent, et le point 1 attrapait le sommet voisin.
 */
async function selectionner(page, pred) {
  await page.evaluate((src) => {
    const f = new Function('o', 'return ' + src);
    const o = window.__plan.etat().objects.find(f);
    window.__plan.selectionnerCle(o ? o.key : null);
    if (o) window.__plan.executer('vue.ajuster');
  }, pred);
  await page.waitForTimeout(200);
}
/**
 * Cadre la parcelle du projet en gardant la selection : les points qui visent deux objets (dalle et
 * maison, dalle et terrasse) ont besoin des deux a l'ecran, et l'ouverture sur tout le voisinage les
 * laisse trop petits pour que leurs aretes se distinguent.
 */
async function cadrerParcelle(page) {
  await page.evaluate(() => {
    const k = window.__plan.etat().selectedKey ?? null;
    window.__plan.selectionnerCle(null);
    window.__plan.executer('vue.ajuster');
    window.__plan.selectionnerCle(k);
  });
  await page.waitForTimeout(200);
}
async function classe(page) { return page.evaluate(() => window.__plan.magasin().classe); }
async function feuille(page, f) { await page.evaluate((f) => window.__plan.ouvrirFeuille(f), f); await page.waitForTimeout(280); }
const proches = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const aire = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
const angle = (pts, i) => {
  const n = pts.length, a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  return Math.acos((v1.x * v2.x + v1.y * v2.y) / Math.hypot(v1.x, v1.y) / Math.hypot(v2.x, v2.y)) * 180 / Math.PI;
};
/** Une commande de l'inspecteur, ou qu'il soit : feuille Proprietes sur telephone. */
async function inspecteur(page) {
  const c = await classe(page);
  if (c === 'compact') await feuille(page, 'proprietes');
  else await page.evaluate(() => { if (!window.__plan.magasin().inspecteurOuvert) document.querySelector('.inspecteurPli')?.click(); });
  await page.waitForTimeout(150);
}
async function ouvrirSection(page, id) {
  // Au doigt, les sections se rangent en trois familles (2.1.1) : on touche d'abord la bonne.
  await page.evaluate((id) => {
    const d = document.querySelector('#zoneInspecteur details[data-section="' + id + '"]');
    const onglet = d && document.querySelector('#zoneInspecteur .famillesSections [data-famille="' + d.dataset.famille + '"]');
    if (onglet && onglet.getAttribute('aria-selected') !== 'true') onglet.click();
  }, id);
  await page.waitForTimeout(80);
  await page.evaluate((id) => { const d = document.querySelector('#zoneInspecteur details[data-section="' + id + '"]'); if (d) { d.open = true; d.scrollIntoView(); } }, id);
  await page.waitForTimeout(80);
}
/** Ecrit un nombre de l'inspecteur par sa saisie directe, comme au clavier. */
async function saisirNombre(page, cle, valeur) {
  const champ = page.locator('#zoneInspecteur [data-cle="' + cle + '"] input[type="number"], #zoneInspecteur [data-cle="' + cle + '"] input[inputmode="decimal"]').first();
  await champ.scrollIntoViewIfNeeded();
  await champ.click();
  await champ.fill(String(valeur));
  await champ.press('Enter');
  await page.waitForTimeout(150);
}
/** Ecrit un sous-champ d'une ligne de l'inspecteur (la longueur d'un cote, l'angle d'un coin). */
async function saisirSousChamp(page, ligne, libelle, valeur) {
  const champ = page.locator('#zoneInspecteur [data-cle="' + ligne + '"] input[aria-label="' + libelle + '"]').first();
  await champ.scrollIntoViewIfNeeded();
  await champ.click();
  await champ.fill(String(valeur));
  await champ.press('Enter');
  await page.waitForTimeout(150);
}
async function annuler(page) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(120);
}
/** Deux, trois doigts, par le protocole du navigateur : de vrais evenements tactiles. */
async function doigts(page, depart, arrivee, pas = 10) {
  const cdp = await page.context().newCDPSession(page);
  const points = (t) => depart.map((d, i) => ({ x: d.x + (arrivee[i].x - d.x) * t, y: d.y + (arrivee[i].y - d.y) * t, id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let i = 1; i <= pas; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(i / pas) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  await cdp.detach();
}
async function telecharger(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), action()]);
  return readFileSync(await dl.path(), 'latin1');
}
/** Le meme, en octets : un .glb se lit binaire, pas en latin1. */
async function telechargerOctets(page, action, delai = 60000) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: delai }), action()]);
  return readFileSync(await dl.path());
}

/** « Auditer la parcelle… » comme la personne : menu Fichier sur bureau, feuille Projet au doigt (lot L9). */
async function ouvrirAuditParcelle(page) {
  if ((await classe(page)) !== 'large') await feuille(page, 'projet');
  await page.evaluate(() => document.getElementById('menuFichier')?.setAttribute('open', ''));
  await page.waitForTimeout(150);
  await page.locator('#menuFichier [data-commande="audit.parcelle"]').first().click({ timeout: 5000 });
  await page.locator('.dialogueAuditParcelle').waitFor({ timeout: 10000 });
}

/**
 * Un point du jardin, a quelques metres devant le plus long mur de la maison que l'on voit depuis la
 * parcelle, et le cap vers ce mur ; en degres par le calage du cadastre (a quelques centimetres pres
 * sur 20 m, c'est assez pour la reconnaissance).
 */
async function stationDevantLaMaison(page, distances = [8, 6, 10, 5]) {
  return page.evaluate((distances) => {
    const e = window.__plan.etat();
    const maison = e.objects.find((o) => o.key === 'maison');
    const parcelle = e.objects.find((o) => o.key === 'parcelle');
    const cad = parcelle && parcelle.cadastre;
    if (!maison || !cad) return null;
    const dans = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    const batis = e.objects.filter((o) => (o.fonction === 'batiment' || o.fonction === 'annexe') && Array.isArray(o.pts));
    const pts = maison.pts, n = pts.length;
    let aire = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; aire += a.x * b.y - b.x * a.y; }
    const cotes = pts.map((a, i) => {
      const b = pts[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y);
      return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, l, nx: (aire > 0 ? 1 : -1) * (b.y - a.y) / l, ny: (aire > 0 ? -1 : 1) * (b.x - a.x) / l };
    }).sort((u, v) => v.l - u.l);
    for (const c of cotes) for (const d of distances) {
      const p = { x: c.m.x + c.nx * d, y: c.m.y + c.ny * d };
      if (!dans(p, parcelle.pts) || batis.some((o) => dans(p, o.pts))) continue;
      const cap = (Math.atan2(c.m.x - p.x, c.m.y - p.y) * 180 / Math.PI + 360) % 360;
      return { lat: cad.origineLat + p.y / 111132.954, lon: cad.origineLon + p.x / (111319.49 * Math.cos(cad.origineLat * Math.PI / 180)), cap };
    }
    return null;
  }, distances);
}

/**
 * La capture minimale d'un audit de la parcelle, jusqu'aux propositions (lot L11) : les materiaux de
 * la maison (brique, ardoise), la cloture sur rue (mur de 1,60 m), une photo rangee sur une facade
 * choisie dans la liste, puis « Lancer l'analyse » ; on attend la fin des mesures.
 */
async function captureJusquAuxPropositions(page) {
  const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
  await etape('ouvrir', () => ouvrirAuditParcelle(page));
  await etape('materiaux', () => page.getByRole('button', { name: 'Noter : Matériaux de Maison' }).click({ timeout: 30000 }));
  await etape('brique', () => page.locator('button[data-controle="vu.murs"]', { hasText: 'Brique' }).first().click({ timeout: 30000 }));
  await etape('ardoise', () => page.locator('button[data-controle="vu.couverture"]', { hasText: 'Ardoise' }).first().click({ timeout: 30000 }));
  await etape('cloture', () => page.locator('button[data-controle="auditParcelle.noter"]', { hasText: 'Clôture côté rue' }).click({ timeout: 30000 }));
  await etape('mur', () => page.locator('button[data-controle="auditParcelle.typeCloture"]', { hasText: 'Mur' }).click({ timeout: 30000 }));
  await etape('hauteur', () => page.locator('input[data-controle="auditParcelle.hauteurCloture"]').fill('1.6', { timeout: 30000 }));
  await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
  // La Vue 3D s'ouvre sous l'ecran de prise : sa construction tient le fil quelques secondes.
  await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
  const dessin = await page.context().newPage();
  await dessin.setContent('<canvas id="c" width="800" height="600"></canvas><script>const x=document.getElementById("c").getContext("2d");x.fillStyle="#e4d6bc";x.fillRect(0,0,800,600);x.fillStyle="#2b3440";x.fillRect(180,220,120,160);x.fillRect(500,220,120,160);</script>');
  const photo = await dessin.locator('#c').screenshot({ type: 'png' });
  await dessin.close();
  await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
  await page.locator('.rangementAudit').waitFor({ timeout: 10000 }).catch(() => {});
  await etape('liste', () => page.locator('[data-controle="auditParcelle.liste"]').click({ timeout: 30000 }));
  await etape('lancer', () => page.locator('[data-controle="auditParcelle.lancer"]').click({ timeout: 30000 }));
  await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 60000 });
}

/**
 * Le serveur des audits partages (`admin/audits`, lot L21), simule : il garde ce qu'on lui envoie et
 * ce qu'on lui retire, pour que le point le mesure.
 */
async function simulerAudits(page) {
  const recus = [], retires = [];
  await page.route(/\/admin\/audits(\/|$)/, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      recus.push({ texte: req.postData() || '', entetes: req.headers() });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '20261013-090000-0000000' + recus.length, retrait: 'secret' + recus.length }) });
    }
    if (req.method() === 'DELETE') { retires.push({ url: req.url(), secret: req.headers()['x-plan-retrait'] }); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"retire":true}' }); }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return { recus, retires };
}
/**
 * Le serveur `admin/audits` complet, simule comme le vrai (deploy/analyse.php) : depot (POST, marque
 * `X-Plan-Depot`), remplacement par le secret ou la session (PUT), liste des fiches avec leur marque,
 * leurs photos et leur phase, lecture du fichier tel qu'il est arrive, retrait. La route vit avec la
 * page : apres un rechargement (l'admin des demos), le catalogue lit ce que la sauvegarde a depose.
 */
async function simulerDepotAudits(page) {
  const depots = new Map(), appels = [];
  let n = 0;
  const fiche = (id, texte, plus) => {
    const d = JSON.parse(texte), nb = (l) => (Array.isArray(l) ? l.length : 0);
    const photos = nb(d.cloture?.photos) + nb(d.portail?.photos) + (d.batiments || []).reduce((t, b) => t + nb(b?.photos) + (b?.facades || []).reduce((u, x) => u + nb(x?.photos), 0), 0);
    return { id, recuLe: new Date().toISOString().slice(0, 19) + 'Z', organisation: 'org-fumee', idu: d.parcelle?.idu, adresse: d.parcelle?.adresse ?? null, taille: Buffer.byteLength(texte), photos, phase: d.finCapture ? 'analyse' : 'capture', debut: d.debut ?? null, ...plus };
  };
  await page.route(/\/admin\/audits(\/|\?|$)/, async (route) => {
    const req = route.request(), u = new URL(req.url()), m = /\/admin\/audits(?:\/([^/]+))?\/?$/.exec(u.pathname);
    const id = m && m[1] ? decodeURIComponent(m[1]) : '', entetes = req.headers(), methode = req.method();
    const json = (corps, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
    appels.push({ methode, id, depot: entetes['x-plan-depot'] ?? null, retrait: entetes['x-plan-retrait'] ?? null });
    if (!id && methode === 'GET') return json({ audits: [...depots.values()].map((x) => x.fiche).sort((a, b) => b.recuLe.localeCompare(a.recuLe)) });
    if (!id && methode === 'POST') {
      n++;
      const nouvel = '20261014-1000' + String(n).padStart(2, '0') + '-0000000' + n, texte = req.postData() || '';
      depots.set(nouvel, { texte, retrait: 'secret' + n, fiche: fiche(nouvel, texte, { marque: entetes['x-plan-depot'] || 'corpus' }) });
      return json({ id: nouvel, retrait: 'secret' + n }, 201);
    }
    const x = depots.get(id);
    if (!x) return json({ error: { code: 'NOT_FOUND', message: 'Aucun audit « ' + id + ' ».' } }, 404);
    if (methode === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: x.texte });
    // L'administrateur (session simulee) n'envoie pas de secret ; un autre secret est refuse.
    if (entetes['x-plan-retrait'] && entetes['x-plan-retrait'] !== x.retrait) return json({ error: { code: 'FORBIDDEN', message: 'Secret de retrait invalide.' } }, 403);
    if (methode === 'PUT') { x.texte = req.postData() || ''; x.fiche = fiche(id, x.texte, { marque: x.fiche.marque }); return json({ id, remplace: true }); }
    if (methode === 'DELETE') { depots.delete(id); return json({ id, retire: true }); }
    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' } }, 405);
  });
  return { depots, appels };
}
/**
 * Une entree du menu Fichier (feuille Projet au doigt), touchee par le DOM : apres la Vue 3D, le
 * rendu logiciel tient le fil et Playwright n'attend pas assez qu'elle soit stable pour la cliquer.
 */
async function entreeFichier(page, commande) {
  if ((await classe(page)) !== 'large') await feuille(page, 'projet');
  await page.evaluate((c) => {
    document.getElementById('menuFichier')?.setAttribute('open', '');
    document.querySelector('#menuFichier [data-commande="' + c + '"]')?.click();
  }, commande);
}
/** Note chaque toast qui parait :il ne reste que quelques secondes, la Vue 3D logicielle ralentit tout. */
async function noterToasts(page) {
  await page.evaluate(() => {
    window.__toastsVus = [];
    new MutationObserver(() => document.querySelectorAll('.toast').forEach((t) => { if (!window.__toastsVus.includes(t.textContent)) window.__toastsVus.push(t.textContent); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
/** « Seulement les mesures » quand la question de l'analyse par Claude est posee (lot L17). */
async function seulementLesMesures(page) {
  const bouton = page.locator('[data-controle="auditParcelle.sansAnalyse"]');
  if (await bouton.count()) await bouton.click({ timeout: 30000 });
  await page.locator('.accordAnalyse').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
}
const toastVu = (page, motif) => page.evaluate((m) => (window.__toastsVus || []).find((t) => new RegExp(m).test(t)) ?? '', motif);

/**
 * Les routes `admin/claude/…` de l'analyse par Claude (deploy/analyse.php), simulees (lot L17) :
 * les demandes recues et leurs jetons ; un batch fini des le premier suivi, dont les trois passes
 * disent la meme chose (zinc, une cheminee, un parement en pierre sur chaque facade a decrire).
 * `panne` rend le serveur injoignable.
 */
async function simulerAnalyse(page) {
  const s = { demandes: [], jetons: [], panne: false };
  const ind = (image, vu) => [{ image, vu }];
  const sortie = (facades) => ({
    forme: { indices: ind(1, 'deux pans et deux pignons'), valeur: 'deux-pans' }, profil: { indices: [], valeur: 'droit' },
    faitage: { indices: [], sens: 'indetermine' }, bouts: { indices: [], gauche: 'pignon', droite: 'pignon' },
    lucarnes: { indices: [], nombre: 0, types: [], pan: 'aucun' },
    cheminees: { indices: ind(1, 'une souche de brique au faîtage'), nombre: 1, souches: [{ position: 'faitage', materiau: 'brique' }] },
    terrasse: { indices: [], presente: 'non', type: 'sans-objet', acrotere: 'non', edicules: 0 },
    couverture: { indices: ind(1, 'feuilles de zinc à joints debout'), valeur: 'zinc' }, elements: [],
    facades: facades.map((facade) => ({ indices: ind(1, 'moellons apparents'), facade, ouvertures: { niveaux: 2, parNiveau: [2, 2], manquees: 0, enTrop: 0 }, details: { volets: 'battants', coffre: 'non', balcon: 'non', forme: 'rectangulaire' }, materiau: 'pierre', ecart: '' })),
    ecarts: [], contradictions: [], confiance: 'forte',
  });
  await page.route(/\/admin\/claude\//, async (route) => {
    if (s.panne) return route.abort('failed');
    const req = route.request(), u = new URL(req.url());
    s.jetons.push(req.headers().authorization ?? '');
    const json = (status, corps) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
    const m = u.pathname.match(/\/admin\/claude\/batches(?:\/([^/]+)(\/resultats)?)?$/);
    if (!m) return json(404, { error: { code: 'NOT_FOUND', message: 'route simulée absente' } });
    if (!m[1] && req.method() === 'POST') {
      s.demandes.push(JSON.parse(req.postData() || 'null'));
      return json(201, { batch: { id: 'msgbatch_' + s.demandes.length, etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 });
    }
    const d = s.demandes[Number(String(m[1]).replace('msgbatch_', '')) - 1];
    if (!d) return json(404, { error: { code: 'NOT_FOUND', message: 'batch inconnu' } });
    const vue = { id: m[1], etat: 'ended', compte: { processing: 0, succeeded: d.requetes.length, errored: 0, canceled: 0, expired: 0 } };
    if (!m[2]) return json(200, vue);
    const resultats = d.requetes.map((r) => {
      const texte = r.contenu.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const facades = (texte.match(/Façades à décrire \(étiquettes\) : ([^.\n]*)\./)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      return { id: r.id, statut: 'reussi', passe: r.passe, sortie: sortie(facades), erreur: null };
    });
    return json(200, { batch: vue, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats });
  });
  return s;
}
/** Chaque toast qui parait est note : ils ne restent que quelques secondes. */
const notesToasts = (page) => page.evaluate(() => {
  window.__toastsVus = [];
  new MutationObserver(() => document.querySelectorAll('.toast').forEach((t) => { if (!window.__toastsVus.includes(t.textContent)) window.__toastsVus.push(t.textContent); }))
    .observe(document.body, { childList: true, subtree: true, characterData: true });
});
/** Ce que le plan dit de la maison et de la cloture : ce que les propositions changent. */
const etatAudite = (page) => page.evaluate(() => {
  const o = window.__plan.etat().objects;
  const m = o.find((x) => x.key === 'maison'), p = o.find((x) => x.key === 'parcelle');
  return JSON.stringify({ murs: m?.couleurMurs ?? null, couverture: m?.toit?.couverture ?? null, facades: (m?.facades ?? []).length, cloture: p?.cloture?.cotes ?? null, verifie: m?.verifieSurPlace ?? null });
});
/** Une ligne de proposition : cochee ou non, et son texte. */
const ligneProposition = async (page, texte) => {
  const l = page.locator('.ligneProposition', { hasText: texte }).first();
  if (!(await l.count())) return null;
  return { cochee: await l.locator('input[type="checkbox"]').isChecked(), texte: ((await l.textContent()) || '').replace(/\s+/g, ' ').trim() };
};
/**
 * Les deux vues avant / apres de la Vue 3D (three/comparaison3d.ts), lues sur le canevas : leurs
 * rectangles, l'ecart moyen de couleur entre elles (0 a 255 ; 0 : la meme image), et l'image de
 * « Après » reduite, pour voir si elle bouge. Le canevas garde son image (preserveDrawingBuffer).
 */
const lireDeuxVues = (page) => page.evaluate(() => {
  const v = window.__plan.deuxVues();
  const c = document.querySelector('#terrasse3dCanvasHost canvas');
  if (!v || !c) return null;
  const k = c.width / (c.clientWidth || 1);
  const t = document.createElement('canvas');
  t.width = c.width; t.height = c.height;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0);
  const lire = (r) => x.getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.max(1, Math.round(r.l * k)), Math.max(1, Math.round(r.h * k))).data;
  const a = lire(v.avant), b = lire(v.apres);
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  const image = [];
  for (let i = 0; i < b.length; i += 4 * 97) image.push(b[i], b[i + 1], b[i + 2]);
  return { vues: v, ecart: s / Math.max(1, n / 4) / 3, image };
});
/** L'ecart moyen entre deux images reduites (0 : identiques). */
const ecartImages = (a, b) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]); return s / Math.max(1, n); };

/**
 * L'adresse des points cadastraux, la meme depuis la `1.1.0` : c'est elle qui rend les valeurs que
 * le journal de la liste de fumee cite, et en changer rendrait les passages incomparables.
 */
const ADRESSE = 'Place de la Mairie 35000 Rennes';

const TERRASSE = "o.fonction === 'terrasse' && o.type === 'polygon' && o.name === 'Terrasse'";
const DALLE = "o.name === 'Dalle beton'";
const PARASOL = "o.fonction === 'parasol' && o.type === 'circle'";

/**
 * Les routes `admin/…` de l'ecran Admin › Conformité (lot G3), simulees : session ouverte, un audit
 * de parcelle recu (AE 101 tel que le corpus le fige, vu « en croupes » : le calcul le lit en deux
 * pans), et l'historique des mesures, qui garde ce que l'ecran y range. `illisible` ajoute un audit
 * d'une version plus recente, que l'ecran doit nommer sans s'arreter.
 */
async function simulerConformite(page, { illisible = false, facade = false } = {}) {
  const promenade = JSON.parse(readFileSync(new URL('../tests/fixtures/audit/audit-2026-10-13-1200-le-vesinet.json', import.meta.url), 'utf8'));
  const c = promenade.cas[0];
  const audit = {
    format: 'plan-audit-parcelle', version: 1, parcelle: { idu: '78650000AE0101', adresse: '2 allée des Limites', origine: null },
    code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-14T09:00:00Z', finCapture: null, ecritLe: '2026-10-14T10:00:00Z',
    batiments: [{ cle: 'maison', nom: 'Maison', mitoyen: false, cas: { identite: c.identite, entrees: c.entrees, sorties: c.sorties }, vu: { forme: 'croupes' }, photos: [], facades: facade ? [FACADE_RELEVEE] : [] }],
    cloture: { photos: [] }, portail: { photos: [] }, propositions: [], decisions: []
  };
  const recus = [{ id: '20261014-100000-abcdef01', recuLe: '2026-10-14T10:00:00Z', organisation: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites' }];
  if (illisible) recus.push({ id: '20261014-110000-0000beef', recuLe: '2026-10-14T11:00:00Z', organisation: 'admin', idu: '78650000AE0102', adresse: null });
  const serveur = { mesures: [], posts: [], listes: 0 };
  await page.route(/\/admin\//, async (route) => {
    const req = route.request(), u = new URL(req.url());
    const json = (corps, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
    if (u.pathname.endsWith('/admin/session')) return json({});
    if (u.pathname.endsWith('/admin/audits')) { serveur.listes++; return json({ audits: recus }); }
    if (u.pathname.endsWith('/admin/audits/20261014-100000-abcdef01')) return json(audit);
    if (u.pathname.endsWith('/admin/audits/20261014-110000-0000beef')) return json({ ...audit, version: 9 });
    if (u.pathname.endsWith('/admin/conformite')) {
      if (req.method() === 'POST') {
        const m = { ...JSON.parse(req.postData() || 'null'), recuLe: new Date().toISOString().slice(0, 19) + 'Z' };
        serveur.posts.push(m);
        serveur.mesures.push(m);
        return json({ recuLe: m.recuLe, mesures: serveur.mesures.length }, 201);
      }
      return json({ format: 'plan-conformite', version: 1, mesures: serveur.mesures });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return serveur;
}

/** Une facade relevee de 9 m sur 5,4 m avec deux fenetres seulement : la disposition automatique en pose bien plus (lot G13). */
const FACADE_RELEVEE = {
  cote: 0, orientation: 'Sud', largeurM: 9, hauteurM: 5.4, photos: [],
  mesure: {
    releve: {
      cote: 0, largeur: 9, hauteur: 5.4, texture: null, distance: null, sourceDistance: null, releveLe: '2026-10-14T09:30:00Z',
      ouvertures: [{ type: 'fenetre', x: 2, y: 0.9, l: 1, h: 1.2 }, { type: 'fenetre', x: 6, y: 0.9, l: 1, h: 1.2 }]
    },
    rangReleve: null, coinsTrouves: false, confiance: null, hauteurM: null, couleur: null
  }
};

/** L'ecran Admin › Conformité ouvert, les audits recus rejoues (l'etat le dit). */
async function ouvrirConformite(page) {
  await page.goto(BASE + '/?admin&ecran=conformite');
  await page.waitForSelector('.consTuile', { timeout: 20000 });
  await page.waitForFunction(() => /audits? reçus? \(/.test(document.querySelector('.consEtat')?.textContent || ''), null, { timeout: 90000 });
}

// ---- Les points --------------------------------------------------------------------------------
// Chacun rend { ok, mesure } ; `ok: null` veut dire non joue, et `mesure` dit pourquoi.

// `RESEAU`, qui rendait « non joué » sans essayer, a disparu le 25 septembre 2026 : les huit points
// qu'il couvrait — 12 à 15, 22 à 24, 38 — s'essaient maintenant pour de bon. Un environnement sans
// réseau sortant les verra échouer, avec la mesure qui dit où ça s'est arrêté, et c'est ce qu'on
// veut : un refus mesuré se lit, un refus décrété se recopie d'un passage à l'autre sans que
// personne ne le rejoue jamais.

const POINTS = {
  1: async (page) => {
    await selectionner(page, TERRASSE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const i = avant.pts.findIndex((_, k) => !(avant.frozenVertices || [])[k]);
    await glisser(page, await centreDe(page, `[data-role="point"][data-key="${avant.key}"][data-index="${i}"]`), 30, 20);
    const e = await lireEtat(page), apres = objet(e, (o) => o.key === avant.key);
    const dx = (apres.pts[i].x - avant.pts[i].x) * e.scene.scale, dy = -(apres.pts[i].y - avant.pts[i].y) * e.scene.scale;
    const autres = avant.pts.every((p, k) => k === i || (proches(p.x, apres.pts[k].x) && proches(p.y, apres.pts[k].y)));
    return { ok: Math.abs(dx - 30) < 3 && Math.abs(dy - 20) < 3 && autres, mesure: `sommet ${i} suivi de (${dx.toFixed(1)}, ${dy.toFixed(1)}) px pour (30, 20) ; autres sommets ${autres ? 'immobiles' : 'DÉPLACÉS'}` };
  },
  2: async (page) => {
    await selectionner(page, TERRASSE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const n = avant.pts.length, fr = avant.frozenVertices || [];
    const i = [...Array(n).keys()].find((k) => !fr[k] && !fr[(k + 1) % n]);
    await glisser(page, await centreDe(page, `[data-role="edge"][data-key="${avant.key}"][data-index="${i}"]`), 10, 10);
    const e = await lireEtat(page), apres = objet(e, (o) => o.key === avant.key);
    const bouge = avant.pts.map((p, k) => Math.hypot(apres.pts[k].x - p.x, apres.pts[k].y - p.y) * e.scene.scale);
    const ok = bouge[i] > 5 && bouge[(i + 1) % n] > 5 && bouge.every((b, k) => k === i || k === (i + 1) % n || b < 1e-6);
    return { ok, mesure: `arête ${i} : ses deux sommets à ${bouge[i].toFixed(1)} / ${bouge[(i + 1) % n].toFixed(1)} px, les ${n - 2} autres à 0` };
  },
  3: async (page) => {
    await selectionner(page, TERRASSE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const c = avant.pts.reduce((s, p) => ({ x: s.x + p.x / avant.pts.length, y: s.y + p.y / avant.pts.length }), { x: 0, y: 0 });
    await glisser(page, await versPage(page, c), 15, -10);
    const e = await lireEtat(page), apres = objet(e, (o) => o.key === avant.key);
    const v = avant.pts.map((p, k) => ({ x: (apres.pts[k].x - p.x) * e.scene.scale, y: -(apres.pts[k].y - p.y) * e.scene.scale }));
    const meme = v.every((w) => proches(w.x, v[0].x, 1e-6) && proches(w.y, v[0].y, 1e-6));
    return { ok: meme && Math.abs(v[0].x - 15) < 3 && Math.abs(v[0].y + 10) < 3, mesure: `${v.length} sommets déplacés du même vecteur (${v[0].x.toFixed(1)}, ${v[0].y.toFixed(1)}) px` };
  },
  4: async (page) => {
    await selectionner(page, TERRASSE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const c = await centreDe(page, `[data-role="edge"][data-key="${avant.key}"][data-index="0"]`);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForTimeout(150);
    const apres = objet(await lireEtat(page), (o) => o.key === avant.key);
    return { ok: apres.pts.length === avant.pts.length + 1, mesure: `${avant.pts.length} → ${apres.pts.length} sommets` };
  },
  5: async (page) => {
    await selectionner(page, TERRASSE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const sel = `[data-role="point"][data-key="${avant.key}"][data-index="1"]`;
    const c = await centreDe(page, sel);
    await page.mouse.dblclick(c.x, c.y); await page.waitForTimeout(150);
    const gele = !!(objet(await lireEtat(page), (o) => o.key === avant.key).frozenVertices || [])[1];
    const c2 = await centreDe(page, sel);
    await page.mouse.dblclick(c2.x, c2.y); await page.waitForTimeout(150);
    const degele = !(objet(await lireEtat(page), (o) => o.key === avant.key).frozenVertices || [])[1];
    const initial = !!(avant.frozenVertices || [])[1];
    return { ok: gele !== initial && (!degele) === initial, mesure: `coin 1 : ${initial ? 'figé' : 'libre'} → ${gele ? 'figé' : 'libre'} → ${degele ? 'libre' : 'figé'}` };
  },
  6: async (page) => {
    const r = await page.locator('#stage').boundingBox();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const s0 = (await lireEtat(page)).scene.scale;
    await doigts(page, [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }], [{ x: cx - 80, y: cy }, { x: cx + 80, y: cy }]);
    const s1 = (await lireEtat(page)).scene.scale;
    await doigts(page, [{ x: cx - 80, y: cy }, { x: cx + 80, y: cy }], [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }]);
    const s2 = (await lireEtat(page)).scene.scale;
    return { ok: Math.abs(s1 / s0 - 2) < 0.02 && Math.abs(s2 / s0 - 1) < 0.02, mesure: `pincement rapport ${(s1 / s0).toFixed(3)}, retour ${(s2 / s0).toFixed(3)}` };
  },
  7: async (page) => {
    const r = await page.locator('#stage').boundingBox();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const a = (await lireEtat(page)).scene;
    const dep = [{ x: cx - 40, y: cy }, { x: cx, y: cy + 30 }, { x: cx + 40, y: cy }];
    await doigts(page, dep, dep.map((p) => ({ x: p.x + 50, y: p.y })));
    const b = (await lireEtat(page)).scene;
    const dx = b.origine.x - a.origine.x;
    return { ok: Math.abs(dx - 50) < 2 && proches(a.scale, b.scale), mesure: `trois doigts : 50 px demandés / ${dx.toFixed(1)} obtenus, échelle × ${(b.scale / a.scale).toFixed(3)}` };
  },
  8: async (page) => {
    await selectionner(page, DALLE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Dalle beton');
    if (!avant || avant.pts.length !== 4) return { ok: null, mesure: 'non joué : pas de dalle à 4 sommets dans le jeu' };
    await inspecteur(page);
    await ouvrirSection(page, 'objet');
    const caseRect = page.locator('#zoneInspecteur [data-cle="rectangle"] input[type="checkbox"]').first();
    await caseRect.scrollIntoViewIfNeeded();
    if (!(await caseRect.isChecked())) await caseRect.click({ force: true });
    await page.waitForTimeout(150);
    await degager(page);
    const e1 = await lireEtat(page), o1 = objet(e1, (o) => o.key === avant.key);
    const a1 = o1.pts.map((_, i) => angle(o1.pts, i));
    await glisser(page, await visible(page, `[data-role="point"][data-key="${avant.key}"][data-index="0"]`), 20, 12);
    const o2 = objet(await lireEtat(page), (o) => o.key === avant.key);
    const a2 = o2.pts.map((_, i) => angle(o2.pts, i));
    const droits = [...a1, ...a2].every((a) => Math.abs(a - 90) < 0.05);
    const bouge = Math.hypot(o2.pts[0].x - o1.pts[0].x, o2.pts[0].y - o1.pts[0].y) > 1e-6;
    return { ok: droits && bouge, mesure: `angles ${a1.map((a) => a.toFixed(1)).join('/')} puis, après tirage d'un coin, ${a2.map((a) => a.toFixed(1)).join('/')}` };
  },
  9: async (page) => {
    await selectionner(page, TERRASSE);
    const depart = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const etapes = [];
    // Cinq glissers de la poignee du sommet 0, en zigzag : la poignee reste au-dessus de tout, et
    // le sommet ne s'en va pas sur un objet voisin.
    await degager(page);
    let j = 0;
    while (j < depart.pts.length && !(await visible(page, `[data-role="point"][data-key="${depart.key}"][data-index="${j}"]`, false))) j++;
    const x0 = objet(await lireEtat(page), (o) => o.key === depart.key).pts[j].x;
    // Vers l'interieur de la terrasse : un geste qui la ferait sortir de la parcelle serait refuse,
    // et un geste refuse ne laisse pas d'instantane.
    const cen = await versPage(page, depart.pts.reduce((s, p) => ({ x: s.x + p.x / depart.pts.length, y: s.y + p.y / depart.pts.length }), { x: 0, y: 0 }));
    for (let k = 0; k < 5; k++) {
      const h = await visible(page, `[data-role="point"][data-key="${depart.key}"][data-index="${j}"]`);
      const d = Math.hypot(cen.x - h.x, cen.y - h.y) || 1;
      // Une demi-seconde entre deux gestes : deux appuis au meme endroit en moins de 400 ms font un
      // double-clic, qui fige le coin (point 5) — c'est le comportement voulu, pas celui qu'on teste.
      await page.waitForTimeout(500);
      await glisser(page, h, 10 * (cen.x - h.x) / d, 10 * (cen.y - h.y) / d, 4);
      etapes.push(objet(await lireEtat(page), (o) => o.key === depart.key).pts[j].x);
    }
    const retour = [];
    for (let k = 0; k < 5; k++) { await annuler(page); retour.push(objet(await lireEtat(page), (o) => o.key === depart.key).pts[j].x); }
    const attendu = [...etapes.slice(0, 4).reverse(), x0];
    const ordre = retour.every((x, k) => proches(x, attendu[k], 1e-9));
    const c2 = await classe(page);
    const vide = await page.evaluate((c2) => {
      const b = c2 === 'compact' ? document.querySelector('.barreCompacte [data-commande="objet.annuler"]') : document.getElementById('undoBtn');
      return b ? b.disabled : null;
    }, c2);
    return { ok: ordre, mesure: `cinq glissers du sommet ${j} défaits dans l'ordre ${ordre ? 'exact' : 'FAUX (' + [x0, ...etapes].map((x) => x.toFixed(2)).join(' ') + ' / ' + retour.map((x) => x.toFixed(2)).join(' ') + ')'} ; bouton Annuler ${vide === null ? 'absent' : vide ? 'grisé' : 'encore actif (pile non vide : gestes antérieurs du chargement)'}` };
  },
  10: async (page) => {
    await selectionner(page, DALLE);
    await cadrerParcelle(page);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Dalle beton');
    const maison = objet(await lireEtat(page), (o) => o.name === 'Maison');
    await page.evaluate(() => window.__plan.executer('objet.aligner'));
    await page.waitForTimeout(150);
    await feuille(page, null);
    let k = 0, cible = null;
    for (; k < maison.pts.length && !cible; k++) cible = await visible(page, `[data-role="edge"][data-key="${maison.key}"][data-index="${k}"]`, false);
    k--;
    await page.mouse.click(cible.x, cible.y);
    await page.waitForTimeout(150);
    await inspecteur(page);
    await ouvrirSection(page, 'alignement');
    const info = await page.evaluate(() => document.querySelector('#zoneInspecteur [data-cle="info"]')?.textContent || '');
    await page.locator('#zoneInspecteur [data-cle="aligner"] button').first().click({ force: true });
    await page.waitForTimeout(200);
    const apres = objet(await lireEtat(page), (o) => o.key === avant.key);
    const dir = (a, b) => ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180 + 180) % 180;
    const t = dir(maison.pts[k], maison.pts[(k + 1) % maison.pts.length]);
    const cotes = apres.pts.map((p, i) => dir(p, apres.pts[(i + 1) % apres.pts.length]));
    const parallele = cotes.some((d) => Math.min(Math.abs(d - t), 180 - Math.abs(d - t)) < 0.1);
    const s1 = aire(avant.pts), s2 = aire(apres.pts);
    return { ok: parallele && Math.abs(s1 - s2) < 1e-6, mesure: `${info.replace(/\s+/g, ' ').slice(0, 60)} ; cible ${t.toFixed(1)}°, côtés ${cotes.map((d) => d.toFixed(1)).join('/')}° ; surface ${s1.toFixed(2)} → ${s2.toFixed(2)} m²` };
  },
  11: async (page) => {
    await cadrerParcelle(page);
    const avant = (await lireEtat(page)).measures.length;
    const dalle = objet(await lireEtat(page), (o) => o.name === 'Dalle beton');
    const terr = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    await page.evaluate(() => window.__plan.executer('mesure.nouvelle'));
    await page.waitForTimeout(150);
    await feuille(page, null);
    let ref = null, i = 0;
    for (; i < dalle.pts.length && !ref; i++) ref = await visible(page, `[data-role="edge"][data-key="${dalle.key}"][data-index="${i}"]`, false);
    await page.mouse.click(ref.x, ref.y); await page.waitForTimeout(150);
    // « Selectionner des coins », dans le panneau des cotes (feuille ou tiroir, il est dans le DOM).
    await page.evaluate(() => [...document.querySelectorAll('#measureControls button')].find((b) => /coins/i.test(b.textContent))?.click());
    await page.waitForTimeout(150);
    let pris = 0;
    for (let k = 0; k < terr.pts.length && pris < 2; k++) {
      const c = await visible(page, `[data-role="point"][data-key="${terr.key}"][data-index="${k}"]`, false);
      if (!c) continue;
      await page.mouse.click(c.x, c.y); await page.waitForTimeout(120); pris++;
    }
    await page.locator('.bandeauMode button').click();
    await page.evaluate(() => [...document.querySelectorAll('#measureControls button')].find((b) => /Ajouter/i.test(b.textContent))?.click());
    await page.waitForTimeout(200);
    const apres = (await lireEtat(page)).measures.length;
    return { ok: apres === avant + 2, mesure: `référence « Dalle beton : côté ${i} », deux coins de la terrasse, Terminer par le bandeau ; cotes ${avant} → ${apres}` };
  },
  // ---- Les points que le reseau porte ------------------------------------------------------------
  //
  // Ils etaient declares injouables : la recette de la 2.1.0 tournait sans reseau sortant, et le
  // pilote rendait « non joue » sans essayer. Ils s'essaient desormais, et disent pourquoi quand le
  // reseau manque — un refus mesure vaut mieux qu'un refus decrete.
  //
  // Ce qu'ils appellent vraiment : la BAN pour l'adresse, `apicarto` pour le cadastre et le PLU,
  // `data.geopf.fr` pour la BD TOPO et les tuiles, les deux CDN pour three.js. La plateforme, elle,
  // reste simulee : ce n'est pas elle qu'on eprouve ici.
  //
  // Les quatre premiers partagent un import : 13, 14 et 15 n'ont rien a mesurer sur le jeu de
  // demonstration, qui n'a ni voisinage, ni lieu cadastral, ni zonage. Ils rejouent donc 12 et
  // remontent son echec tel quel plutot que d'en inventer un a eux.
  12: async (page) => {
    const avant = (await lireEtat(page)).objects.length;
    await page.evaluate(() => window.__plan.executer('projet.depuisAdresse'));
    const boite = page.locator('.dialogueCadastre');
    await boite.waitFor({ timeout: 15000 });
    await boite.locator('input.promptInput').first().fill(ADRESSE);
    // La saisie declenche le geocodage au bout de 250 ms ; Entree prend la premiere suggestion, qu'on
    // attend plutot que deux secondes fixes.
    await boite.locator('[data-controle="cadastre.suggestion"]').first().waitFor({ timeout: 15000 }).catch(() => {});
    await boite.locator('input.promptInput').first().press('Enter');
    await page.locator('.dialogueCadastre', { hasText: 'Parcelle trouvee (2/3)' }).waitFor({ timeout: 30000 });
    await boite.getByRole('button', { name: /Parcelles voisines/ }).click();
    await page.locator('.dialogueCadastre', { hasText: 'creation (3/3)' }).waitFor({ timeout: 30000 });
    // Aucune mitoyenne n'est cochee : l'import initial ne pose pas le drapeau « voisinage » de
    // toute facon (voir le point 13), et en importer une trentaine pour rien allongerait chaque
    // passage sans rien prouver.
    await boite.getByRole('button', { name: /Creer le projet/ }).click();
    // La creation lit d'abord les toits des trente batiments les plus proches sur le LiDAR : 12 a 24 s
    // mesurees, puis la page repart sur le nouveau projet. Cinq secondes d'attente relisaient l'etat
    // d'avant (la demonstration) : on attend que le plan soit de nouveau la, avec autre chose qu'avant.
    await page.waitForFunction((n) => !document.querySelector('.dialogueCadastre') && !!window.__plan?.etat && window.__plan.etat().objects.length !== n, avant, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(500);
    const etat = await lireEtat(page);
    const pc = objet(etat, (o) => o.key === 'parcelle');
    const batiments = etat.objects.filter((o) => o.fonction === 'batiment').length;
    // La parcelle se nomme depuis l'ETAT, jamais depuis le texte du dialogue : celui-ci liste aussi
    // les mitoyennes, et la premiere qu'on y lit n'est pas forcement la principale.
    const c = pc && pc.cadastre;
    return {
      ok: !!c && etat.objects.length !== avant,
      mesure: `« ${ADRESSE} » → ${c ? c.section + ' ' + c.numero + ' (' + c.idu + '), ' + c.contenanceM2 + ' m²' : 'AUCUNE parcelle cadastrée'}, `
        + `${etat.objects.length} objets dont ${batiments} bâtiment(s)`
    };
  },
  13: async (page, contexte) => {
    const imp = await POINTS[12](page, contexte);
    if (!imp.ok) return { ok: imp.ok, mesure: 'import préalable : ' + imp.mesure };
    // Le drapeau « voisinage » vient d'« Actualiser IGN », pas de l'import initial : le type le dit
    // (`model/types.ts`), et l'import ne le pose pas. Cocher les mitoyennes a l'etape 3 du cadastre
    // ajoute bien des objets — treize au total — mais aucun n'est masquable, et la bascule ne peut
    // alors rien faire. C'est ce que le premier essai de ce point a montre : 13 → 13, zero masque.
    //
    // La commande recoit sa SOURCE et ne fait rien sans elle (`if (source)`), d'ou le clic sur
    // l'entree de menu plutot que l'appel nu. Le clic est emis DANS la page : l'entree vit dans un
    // menu replie, et Playwright refuse de cliquer hors du cadre visible, meme force. Un `.click()`
    // du DOM declenche le meme gestionnaire avec la meme `currentTarget` — c'est la commande qu'on
    // eprouve ici, pas le depliage du menu, dont les points 26 a 40 se chargent.
    await page.evaluate(() => document.querySelector('[data-commande="projet.actualiserIgn"]').click());
    const boiteIgn = page.locator('.dialogueActualisation');
    await boiteIgn.waitFor({ timeout: 15000 });
    // « Ajouter le voisinage », parcelles adjacentes (le choix par defaut une fois la case cochee).
    await boiteIgn.locator('[data-controle="actualisation.voisinage"]').check();
    await boiteIgn.locator('[data-controle="actualisation.lancer"]').click();
    // On attend le voisinage lui-meme, pas une duree : vingt secondes fixes payaient le pire cas a
    // chaque passage, et les donnees temoin repondent en une.
    await page.waitForFunction(() => window.__plan.etat().objects.some((o) => o.voisinage), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(300);
    // Un objet masque n'est pas retire du DOM : le rendu lui pose `display:none` (render/objects.ts),
    // pour qu'il reste choisissable dans l'explorateur et qu'on puisse le demasquer. On compte donc
    // ce qui est DESSINE, pas ce qui est present — la premiere version comptait les noeuds et
    // trouvait 13 avant comme apres.
    // Sur telephone, une partie du voisinage tombe hors du cadre et n'est pas dessinee : on compte
    // donc a part ce qui est dessine du voisinage et du reste. Masquer doit retirer tout le premier,
    // ne rien toucher au second, et la bascule suivante tout rendre.
    const voisins = (await lireEtat(page)).objects.filter((o) => o.voisinage).map((o) => o.key);
    const dessines = () => page.evaluate((cles) => {
      const vus = [...document.querySelectorAll('#stage svg [data-role="obj"]')].filter((e) => e.style.display !== 'none');
      const v = vus.filter((e) => cles.includes(e.getAttribute('data-key'))).length;
      return { voisins: v, autres: vus.length - v };
    }, voisins);
    const avant = await dessines();
    await page.evaluate(() => window.__plan.executer('affichage.voisinage'));
    await page.waitForTimeout(500);
    const apres = await dessines();
    await page.evaluate(() => window.__plan.executer('affichage.voisinage'));
    await page.waitForTimeout(500);
    const retour = await dessines();
    return {
      ok: voisins.length > 0 && avant.voisins > 0 && apres.voisins === 0 && apres.autres === avant.autres && retour.voisins === avant.voisins && retour.autres === avant.autres,
      mesure: `${voisins.length} objet(s) de voisinage importé(s) ; dessinés ${avant.voisins} voisin(s) + ${avant.autres} → ${apres.voisins} + ${apres.autres}, retour ${retour.voisins} + ${retour.autres}`
    };
  },
  14: async (page) => {
    const imp = await POINTS[12](page);
    if (!imp.ok) return { ok: imp.ok, mesure: 'import préalable : ' + imp.mesure };
    // Le fond orthophoto s'allume par defaut depuis la 2.2.0 : la bascule ne sert que s'il est eteint.
    // L'etat du fond se lit a la coche du menu Affichage (`ortho.actif`), l'objet ne le portant qu'une
    // fois enregistre. Sans menu dans la page, on laisse aux tuiles le temps de venir.
    const tuilesPosees = (ms) => page.waitForFunction(() => document.querySelectorAll('#stage svg image').length > 0, null, { timeout: ms }).then(() => true).catch(() => false);
    const coche = await page.evaluate(() => document.querySelector('[data-commande="affichage.orthophoto"]')?.closest('[aria-checked]')?.getAttribute('aria-checked') ?? null);
    if (coche === 'false' || (coche === null && !(await tuilesPosees(10000)))) await page.evaluate(() => window.__plan.executer('affichage.orthophoto'));
    await tuilesPosees(30000);
    // Les deux opacites, au curseur du menu Affichage (setter natif : c'est un champ controle par
    // React). Un fond laisse aux valeurs par defaut ne s'ecrit pas dans le projet (render/ortho.ts,
    // `enregistrerConfigOrtho`) : c'est le reglage qui doit s'y retrouver.
    await page.evaluate(() => {
      for (const [id, v] of [['orthoOpacite', 60], ['orthoParcelleOpacite', 30]]) {
        const c = document.getElementById(id);
        if (!c) continue;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, String(v));
        c.dispatchEvent(new Event('input', { bubbles: true }));
        c.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);
    const tuiles = await page.evaluate(() => document.querySelectorAll('#stage svg image').length);
    const json = await telecharger(page, () => page.evaluate(() => window.__plan.executer('fichier.exporterJson')));
    const porteur = JSON.parse(json).objects.find((x) => x.ortho);
    return {
      ok: tuiles > 0 && !!porteur && porteur.ortho.actif === true && porteur.ortho.opacite === 0.6 && porteur.ortho.parcelleOpacite === 0.3,
      mesure: `${tuiles} tuile(s) posée(s), enregistré dans le projet : ${porteur ? JSON.stringify(porteur.ortho) : 'ABSENT'}`
    };
  },
  15: async (page) => {
    const imp = await POINTS[12](page);
    if (!imp.ok) return { ok: imp.ok, mesure: 'import préalable : ' + imp.mesure };
    if (await classe(page) === 'compact') await feuille(page, 'resultats');
    await page.evaluate(() => window.__plan.ouvrirResultats('plu'));
    await page.waitForTimeout(400);
    // La commande se desarme seule pendant l'appel (`pluEnCours`, app/resultats.ts) : plus besoin du
    // bouton comme source. On attend le zonage range sur la parcelle, pas dix-huit secondes fixes.
    await page.evaluate(() => window.__plan.executer('plu.interroger'));
    await page.waitForFunction(() => !!window.__plan.etat().objects.find((o) => o.key === 'parcelle')?.plu, null, { timeout: 60000 }).catch(() => {});
    // Le resultat se lit dans l'ETAT, ou `interrogerPluDepuisBouton` le range (`parcelle.plu`), et
    // non dans le texte du panneau : celui-ci porte son titre et son bouton meme vide, si bien
    // qu'une recherche de « zone » dans sa prose passait sur un panneau qui n'avait rien recu.
    const plu = objet(await lireEtat(page), (o) => o.key === 'parcelle')?.plu;
    const zone = plu && plu.zones && plu.zones[0];
    return {
      ok: !!plu && Array.isArray(plu.zones) && plu.zones.length > 0,
      mesure: plu
        ? `zone ${zone ? zone.libelle + ' type ' + zone.typezone : 'AUCUNE'}, `
          + `${(plu.servitudes || []).length} servitude(s), ${(plu.spr || []).length} SPR, `
          + `commune ${plu.commune ? plu.commune.nom + ' (' + plu.commune.insee + ')' : '?'}`
        : 'aucun PLU rangé sur la parcelle'
    };
  },
  16: async (page) => {
    await selectionner(page, PARASOL);
    const svg = () => page.evaluate(() => document.querySelector('#stage > svg').innerHTML.length + ':' + [...document.querySelectorAll('#stage svg polygon, #stage svg path')].map((e) => e.getAttribute('points') || e.getAttribute('d')).join('|').length);
    await inspecteur(page);
    await ouvrirSection(page, 'parasol');
    const date = page.locator('#zoneInspecteur [data-cle="ombreDate"] input[type="date"]');
    const initiale = await date.inputValue();
    const affichee = page.locator('#zoneInspecteur [data-cle="ombreAffichee"] input[type="checkbox"]');
    if (!(await affichee.isChecked())) await affichee.click({ force: true });
    // Le fond orthophoto s'allume par defaut (2.2.0) : ses tuiles arrivent - ou echouent, sans reseau -
    // a un instant quelconque, et l'opacite des terrains change avec lui. On compare donc le plan
    // sans les tuiles ni les opacites de remplissage : les traces, dont celui de l'ombre, restent.
    const plan = () => page.evaluate(() => {
      const c = document.querySelector('#stage > svg').cloneNode(true);
      c.querySelectorAll('image').forEach((e) => e.remove());
      c.querySelectorAll('[fill-opacity]').forEach((e) => e.removeAttribute('fill-opacity'));
      return c.innerHTML;
    });
    await date.fill('2026-06-21'); await page.waitForTimeout(150);
    const ete = await plan();
    await date.fill('2026-12-21'); await page.waitForTimeout(150);
    const hiver = await plan();
    await date.fill('2026-06-21'); await page.waitForTimeout(150);
    const ete2 = await plan();
    void svg; void initiale;
    return { ok: ete !== hiver && ete === ete2, mesure: `ombre du 21 juin ≠ ombre du 21 décembre ; retour au 21 juin ${ete === ete2 ? 'identique' : 'DIFFÉRENT'}` };
  },
  17: async (page) => {
    await selectionner(page, TERRASSE);
    await page.evaluate(() => window.__plan.ouvrirResultats('bom'));
    const total = () => page.evaluate(() => document.getElementById('terrasseBomTotals').textContent);
    const vis = () => page.evaluate(() => { const l = [...document.querySelectorAll('#terrasseBomTable tr')].find((tr) => /Vis de fondation|Plots/.test(tr.textContent)); return l ? l.children[1].textContent : ''; });
    const t0 = await total(), v0 = await vis();
    await inspecteur(page);
    await ouvrirSection(page, 'structure');
    await saisirNombre(page, 'soliveEntraxe', 55);
    const t1 = await total(), v1 = await vis();
    await feuille(page, null);
    await annuler(page);
    const t2 = await total(), v2 = await vis();
    return { ok: t0 !== t1 && t0 === t2 && v0 === v2, mesure: `entraxe solives 65 → 55 cm : ${v0} → ${v1} ; « ${t0} » → « ${t1} », et retour exact à l'annulation` };
  },
  18: async (page) => {
    await selectionner(page, TERRASSE);
    await page.evaluate(() => window.__plan.ouvrirResultats('bom'));
    const r = await page.evaluate(() => {
      const box = document.getElementById('terrasseDebitBox');
      const total = [...box.querySelectorAll('tr')].find((tr) => /^Total/.test(tr.textContent.trim()));
      return { texte: box.textContent, total: total ? total.textContent : '' };
    });
    const m = r.total.match(/(\d+) barres\s*([\d.,]+) ml/);
    return { ok: !!m && /chutes/i.test(r.texte) && /about/i.test(r.texte), mesure: m ? `débit lames ${m[1]} barres / ${m[2]} ml, chutes remises au pot et abouts sur appui décrits` : 'ligne Total du débit introuvable' };
  },
  19: async (page) => {
    await selectionner(page, TERRASSE);
    await page.evaluate(() => window.__plan.ouvrirResultats('coupe'));
    const t = await page.evaluate(() => document.getElementById('terrasseCoupeWrap').textContent);
    const ok = /63\s*[x×]\s*175/.test(t) && /45\s*[x×]\s*70/.test(t) && /25/.test(t);
    return { ok, mesure: ok ? 'coupe : solive 63×175, lambourde 45×70, lame 25 mm' : 'libellés de coupe inattendus : ' + t.slice(0, 120) };
  },
  20: async (page) => {
    await selectionner(page, TERRASSE);
    await page.evaluate(() => window.__plan.ouvrirResultats('bom'));
    const bom = await page.evaluate(() => { const l = [...document.querySelectorAll('#terrasseBomTable tr')].find((tr) => /Vis de fondation|Plots/.test(tr.textContent)); return l ? parseInt(l.children[1].textContent, 10) : 0; });
    await page.evaluate(() => window.__plan.ouvrirResultats('implantation'));
    if (await classe(page) === 'compact') await feuille(page, 'resultats');
    // Les numeros d'appui s'ecrivent a partir du 1/100 : on passe a cette echelle, comme a la main.
    await page.locator('#terrasseImplantWrap select').first().selectOption('100');
    await page.waitForTimeout(200);
    const nums = await page.evaluate(() => [...document.querySelectorAll('#terrasseImplantWrap svg text')].map((t) => t.textContent.trim()).filter((s) => /^\d+$/.test(s)).map(Number));
    const n = nums.length ? Math.max(...nums) : 0;
    return { ok: n > 0 && n === bom, mesure: `${n} appuis numérotés au 1/100, autant que les ${bom} du BOM` };
  },
  21: async (page) => {
    await selectionner(page, TERRASSE);
    await page.evaluate(() => window.__plan.ouvrirResultats('chantier'));
    const t = await page.evaluate(() => document.getElementById('terrasseChantierWrap').textContent);
    const lignes = await page.evaluate(() => document.querySelectorAll('#terrasseChantierWrap table tr').length);
    const appuis = /Appuis[^\d]*11[,.]5\s*h/.test(t);
    return { ok: appuis, mesure: `${lignes} lignes, « Appuis 11,5 h » ${appuis ? 'présent' : 'ABSENT'}` };
  },
  22: async (page) => {
    await page.evaluate(() => window.__plan.executer('vue.3d'));
    await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 40000 });
    await page.waitForFunction(() => !!window.THREE, null, { timeout: 10000 }).catch(() => {});
    await image3dStable(page, 3500);
    const r = await page.evaluate(() => {
      const c = document.querySelector('#terrasse3dCanvasHost canvas');
      const texte = document.getElementById('vue3dPanel')?.innerText || '';
      return { trois: window.THREE ? window.THREE.REVISION : null, taille: c ? c.width + '×' + c.height : null, soleil: (/\d{2}:\d{2}[^\n]{0,40}/.exec(texte) || [''])[0] };
    });
    return { ok: !!r.trois && !!r.taille, mesure: `three r${r.trois}, canevas ${r.taille}, ${r.soleil}` };
  },
  23: async (page) => {
    const vue = await POINTS[22](page);
    if (!vue.ok) return { ok: vue.ok, mesure: 'vue 3D préalable : ' + vue.mesure };
    // `preserveDrawingBuffer: true` a la creation du rendu (three/scene.ts) : l'image du canevas est
    // donc relisible apres coup, ce qui est tout ce qui permet de mesurer ce point autrement qu'a
    // l'oeil. Sans ce reglage, `toDataURL` rendrait un cliche vide.
    const enregistrer = () => page.evaluate(() => window.__plan.executer('3d.enregistrerPointDeVue'));
    await enregistrer();
    for (let i = 0; i < 6; i++) await page.evaluate(() => window.__plan.executer('3d.zoomArriere'));
    await page.waitForTimeout(500);
    await enregistrer();
    const vues = (await lireEtat(page)).objects.filter((o) => o.fonction === 'camera');
    if (vues.length < 2) return { ok: false, mesure: `${vues.length} point(s) de vue créé(s), il en faut deux` };
    // La liste des points de vue vit dans la feuille des reglages 3D depuis la `2.1.0` : sur
    // telephone elle est repliee, et `selectOption` attend en vain qu'elle devienne visible. On
    // pose la valeur et on emet `change`, ce qui traverse le meme gestionnaire — c'est la liste
    // qu'on eprouve ici, pas la feuille qui la porte (le point 38 s'en charge).
    const choisir = (cle) => page.evaluate((cle) => {
      const s = document.getElementById('terrasse3dViewSelect');
      s.value = cle;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }, cle);
    await choisir(vues[0].key); const a = await image3dStable(page, 2500);
    await choisir(vues[1].key); const b = await image3dStable(page, 2500);
    await choisir(vues[0].key); const c = await image3dStable(page, 2500);
    return {
      ok: a !== b && a === c,
      mesure: `${vues.length} points de vue ; deux vues ${a === b ? 'IDENTIQUES (la caméra n a pas bougé)' : 'différentes'}, rappel reproductible : ${a === c}`
    };
  },
  24: async (page) => {
    // Le temoin se capture sans bibliotheque d'essences (repli : un tronc et une boule), pas avec celle
    // livree avec Plan : elle depend d'EZ-tree et du reseau, et l'empreinte ne doit dependre ni de l'un ni de l'autre.
    await page.evaluate(() => window.__plan.poserEspeces([]));
    const vue = await POINTS[22](page);
    if (!vue.ok) return { ok: vue.ok, mesure: 'vue 3D préalable : ' + vue.mesure };
    // La date de l'etude est fixee a l'ete : un arbre caduc est nu de novembre a mars, et le temoin
    // ne doit pas dependre du jour ou la fumee se joue.
    await page.evaluate(() => {
      const i = document.querySelector('[data-controle="vue3d.date"]');
      if (!i) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '2026-06-21');
      i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const glb = await telechargerOctets(page, () => page.evaluate(() => window.__plan.executer('export.glb')), 120000);
    if (process.env.FUMEE_GARDER_GLB) writeFileSync(process.env.FUMEE_GARDER_GLB, glb);
    const attendu = JSON.parse(readFileSync('tests/fixtures/golden/glb-structure.json', 'utf8')).compteurs;
    // En-tete glTF binaire : 12 octets, puis la longueur du morceau JSON sur 4 octets.
    const g = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
    const c = {
      noeuds: g.nodes?.length, mailles: g.meshes?.length, materiaux: g.materials?.length,
      textures: g.textures?.length, images: g.images?.length,
      accesseurs: g.accessors?.length, vuesTampon: g.bufferViews?.length, scenes: g.scenes?.length
    };
    // Les images ont cesse d'etre ecrites en double a la `2.0.1` (partage des textures) : `textures`,
    // `images` et la taille baissent, et c'est annonce dans EMPREINTES.md.
    //
    // LES VUES TAMPON BAISSENT AUSSI, D'AUTANT EXACTEMENT. Dans un .glb, chaque image embarquee
    // occupe sa propre vue tampon : en retirer 170 en retire 170. L'annonce d'EMPREINTES.md ne
    // citait que trois compteurs, elle en oubliait un — et c'est ce point qui l'a montre, la
    // soustraction tombant juste au premier essai (829 - 170 = 659, pour 178 images ramenees a 8).
    // On verifie donc l'arithmetique, pas l'immobilite : un ecart ici serait une vraie surprise.
    // `RECAPTURER_GLB=1` reecrit le temoin structurel depuis CE .glb. Il n'y a pas d'autre facon de
    // le capturer : il decrit un fichier que seule la vue 3D sait produire, et le produire demande
    // le reseau. La recapture reste un geste demande, jamais automatique — un temoin qui se
    // reecrirait tout seul ne serait plus un temoin.
    if (process.env.RECAPTURER_GLB === '1') {
      const noms = (l, cle) => [...new Set((l || []).map((x) => x[cle] || '(sans nom)'))];
      writeFileSync('tests/fixtures/golden/glb-structure.json', JSON.stringify({
        magic: glb.subarray(0, 4).toString('utf8'), version: glb.readUInt32LE(4),
        octetsTotal: glb.length, generator: g.asset?.generator, versionGltf: g.asset?.version,
        compteurs: c,
        nomsMailles: noms(g.meshes, 'name'), nombreNomsMaillesDistincts: noms(g.meshes, 'name').length,
        nomsMateriaux: noms(g.materials, 'name'), nombreMateriauxDistincts: noms(g.materials, 'name').length
      }, null, 2) + '\n');
    }
    const vuesAttendues = attendu.vuesTampon - (attendu.images - c.images);
    const stables = ['noeuds', 'mailles', 'materiaux', 'accesseurs', 'scenes'].filter((k) => c[k] !== attendu[k]);
    const vuesJustes = c.vuesTampon === vuesAttendues;
    return {
      ok: stables.length === 0 && vuesJustes && c.images <= attendu.images,
      mesure: `GLB ${glb.length} octets ; ${c.noeuds} nœuds, ${c.mailles} mailles, ${c.materiaux} matériaux, ${c.textures} textures et ${c.images} images (témoin ${attendu.textures}/${attendu.images}), ${c.accesseurs} accesseurs, ${c.vuesTampon} vues tampon (attendu ${vuesAttendues})`
        + (stables.length ? ` ; ONT BOUGÉ : ${stables.join(', ')}` : '')
        + (vuesJustes ? '' : ' ; VUES TAMPON hors compte')
    };
  },
  25: async (page) => {
    const pdf = await telecharger(page, () => page.evaluate(() => window.__plan.executer('export.dossier')));
    const m = pdf.match(/\/Count (\d+)/);
    return { ok: !!m && m[1] === '3', mesure: `dossier PDF, /Count ${m ? m[1] : '?'}, ${pdf.length} octets` };
  },

  // ---- Les points du mobile ------------------------------------------------------------------
  26: async (page) => {
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dpr: visualViewport.scale, stage: document.getElementById('stage').getBoundingClientRect().width }));
    return { ok: m.sw <= m.iw && m.dpr === 1 && m.stage >= m.iw - 2, mesure: `largeur de page ${m.sw} pour ${m.iw} px, échelle ${m.dpr}, plan ${Math.round(m.stage)} px` };
  },
  27: async (page) => {
    await selectionner(page, TERRASSE);
    const avant = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const c = avant.pts.reduce((s, p) => ({ x: s.x + p.x / avant.pts.length, y: s.y + p.y / avant.pts.length }), { x: 0, y: 0 });
    await glisser(page, await versPage(page, c), 20, 0);
    await page.locator('.barreCompacte [data-commande="objet.annuler"]').click();
    await page.waitForTimeout(150);
    const apres = objet(await lireEtat(page), (o) => o.key === avant.key);
    return { ok: proches(apres.pts[0].x, avant.pts[0].x, 1e-9), mesure: 'glisser défait par le bouton Annuler de la barre haute' };
  },
  28: async (page) => {
    // Dans l'ordre de la palette : les ouvrages, puis les formes geometriques.
    const noms = ['Terrasse', 'Pergola', 'Carport', 'Piscine', 'Piscine ronde', 'Parasol', 'Point de vue', 'Chemin', 'Polygone', 'Rectangle', 'Cercle'];
    const res = [];
    for (const nom of noms) {
      const n0 = (await lireEtat(page)).objects.length;
      await page.locator('.barreNavigation .boutonCreer').click(); await page.waitForTimeout(300);
      await page.locator(`#zonePalette button.outil:has(.libelle:text-is("${nom}"))`).click(); await page.waitForTimeout(200);
      const e = await lireEtat(page);
      const cree = e.objects.length === n0 + 1 && e.selectedKey === e.objects[e.objects.length - 1].key;
      const feuilleFermee = !(await page.evaluate(() => window.__plan.magasin().feuille));
      res.push(nom + (cree && feuilleFermee ? ' ✓' : ' ✗'));
    }
    return { ok: res.every((r) => r.endsWith('✓')), mesure: 'créés et sélectionnés, feuille refermée : ' + res.join(', ') };
  },
  29: async (page) => {
    await selectionner(page, DALLE);
    const n0 = (await lireEtat(page)).objects.length;
    await feuille(page, 'outils');
    await page.locator('#zonePalette button[data-commande="objet.dupliquer"]').click(); await page.waitForTimeout(200);
    const n1 = (await lireEtat(page)).objects.length;
    await feuille(page, 'outils');
    await page.locator('#zonePalette button[data-commande="objet.supprimer"]').click(); await page.waitForTimeout(200);
    await page.locator('.dialogueBoutons button', { hasText: 'Confirmer' }).click(); await page.waitForTimeout(200);
    const n2 = (await lireEtat(page)).objects.length;
    return { ok: n1 === n0 + 1 && n2 === n0, mesure: `${n0} → ${n1} (dupliqué) → ${n2} (supprimé après confirmation)` };
  },
  30: async (page) => {
    await feuille(page, 'objets');
    await page.locator('#zoneExplorateur .fambtn', { hasText: 'Tout' }).click(); await page.waitForTimeout(100);
    const oeil = page.locator('#zoneExplorateur .explorateurListe li:has(button:text-is("Maison")) .oeil');
    await oeil.click(); await page.waitForTimeout(150);
    const cache = objet(await lireEtat(page), (o) => o.name === 'Maison').hidden;
    const dessineCache = await page.evaluate(() => { const k = window.__plan.etat().objects.find((o) => o.name === 'Maison').key; return !document.querySelector(`#stage [data-role="obj"][data-key="${k}"]`) || getComputedStyle(document.querySelector(`#stage [data-role="obj"][data-key="${k}"]`)).display === 'none'; });
    await oeil.click(); await page.waitForTimeout(150);
    const revu = !objet(await lireEtat(page), (o) => o.name === 'Maison').hidden;
    return { ok: cache && dessineCache && revu, mesure: `Maison masquée (${dessineCache ? 'absente du plan' : 'ENCORE DESSINÉE'}) puis réaffichée depuis la feuille Objets` };
  },
  31: async (page) => {
    await selectionner(page, TERRASSE);
    await feuille(page, 'objets');
    // La liste s'ouvre sur la famille Terrain : on passe a Terrasse pour trouver la ligne selectionnee.
    await page.locator('#zoneExplorateur .fambtn', { hasText: 'Terrasse' }).first().click({ timeout: 5000 }); await page.waitForTimeout(100);
    const avant = await page.evaluate(() => document.querySelector('#stage > svg').innerHTML.length);
    await page.locator('#zoneExplorateur .explorateurCalquesMaitre input').click({ timeout: 5000 }); await page.waitForTimeout(200);
    const avecCalques = await page.evaluate(() => document.querySelector('#stage > svg').innerHTML.length);
    const n = await page.locator('#zoneExplorateur .explorateurCalques label').count();
    const angles0 = objet(await lireEtat(page), (o) => o.name === 'Terrasse').showAngles;
    await page.locator('#zoneExplorateur li.active .explorateurEtiquettes label', { hasText: 'Angles' }).first().click({ timeout: 5000 }); await page.waitForTimeout(150);
    const angles = objet(await lireEtat(page), (o) => o.name === 'Terrasse').showAngles;
    return { ok: avecCalques > avant && n > 1 && !!angles !== !!angles0, mesure: `structure dessinée (${avant} → ${avecCalques} caractères de SVG), ${n - 1} calques proposés, étiquette Angles ${angles0 ? 'cochée' : 'décochée'} → ${angles ? 'cochée' : 'décochée'}` };
  },
  32: async (page) => {
    await selectionner(page, TERRASSE);
    await inspecteur(page);
    await ouvrirSection(page, 'structure');
    const bandeau = () => page.evaluate(() => document.querySelector('.bandeauChiffrageValeurs')?.textContent);
    const lire = () => page.evaluate(() => window.__plan.etat().objects.find((o) => o.name === 'Terrasse').construction.soliveEntraxe);
    const b0 = await bandeau(), v0 = await lire();
    const moins = page.locator('#zoneInspecteur [data-cle="soliveEntraxe"] .pasBouton').first();
    await moins.click(); await page.waitForTimeout(150);
    const b1 = await bandeau(), v1 = await lire();
    // Appui maintenu : plusieurs pas, un seul instantane d'annulation.
    const bx = await moins.boundingBox();
    await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
    await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(150);
    const v2 = await lire();
    await feuille(page, null);
    await annuler(page);
    const v3 = await lire();
    return { ok: b0 !== b1 && v1 === v0 - 5 && v2 < v1 - 5 && v3 === v1, mesure: `− : ${v0} → ${v1} cm, bandeau « ${b0} » → « ${b1} » ; appui maintenu ${v1} → ${v2} cm, une annulation → ${v3} cm` };
  },
  33: async (page) => {
    await selectionner(page, TERRASSE);
    await inspecteur(page);
    await ouvrirSection(page, 'cotes');
    const champ = page.locator('#zoneInspecteur [data-cle="cote0"] input[inputmode="decimal"], #zoneInspecteur [data-cle="cote0"] input[type="number"]').first();
    await champ.scrollIntoViewIfNeeded();
    await champ.click();
    await champ.fill('');
    await page.keyboard.type('4,5', { delay: 60 });
    const garde = await page.evaluate(() => document.activeElement?.getAttribute('inputmode') === 'decimal' || document.activeElement?.type === 'number');
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const o = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const L = Math.hypot(o.pts[1].x - o.pts[0].x, o.pts[1].y - o.pts[0].y);
    return { ok: garde && Math.abs(L - 4.5) < 1e-6, mesure: `saisie « 4,5 » (virgule) : focus ${garde ? 'gardé pendant la frappe' : 'PERDU'}, côté 1 = ${L.toFixed(3)} m` };
  },
  34: async (page) => {
    await selectionner(page, TERRASSE);
    await page.evaluate(() => window.__plan.ouvrirResultats('bom'));
    await feuille(page, 'resultats');
    const champ = page.locator('#terrasseBomTable input[type="number"]').first();
    await champ.scrollIntoViewIfNeeded();
    await champ.fill('123.45'); await champ.press('Enter'); await champ.dispatchEvent('change'); await page.waitForTimeout(150);
    const t = await page.evaluate(() => document.getElementById('terrasseBomTotals').textContent);
    const carte = await page.evaluate(() => getComputedStyle(document.querySelector('#terrasseBomTable tr:nth-child(2)')).display);
    return { ok: /R[ée]el saisi/.test(t), mesure: `prix réel saisi dans une carte (${carte}) : « ${t} »` };
  },
  35: async (page) => {
    await page.evaluate(() => window.__plan.executer('mesure.nouvelle')); await page.waitForTimeout(150);
    const actif = await page.evaluate(() => !!document.querySelector('.bandeauMode'));
    await page.locator('.bandeauMode button').click(); await page.waitForTimeout(150);
    const fini = await page.evaluate(() => !document.querySelector('.bandeauMode'));
    const a = (await lireEtat(page)).scene.origine;
    const r = await page.locator('#stage').boundingBox();
    await glisser(page, { x: r.x + 30, y: r.y + r.height / 2 }, 40, 0);
    const b = (await lireEtat(page)).scene.origine;
    return { ok: actif && fini && Math.abs(b.x - a.x - 40) < 2, mesure: `bandeau ${actif ? 'affiché' : 'ABSENT'}, Annuler le retire ; la vue se déplace ensuite de ${(b.x - a.x).toFixed(1)} px pour 40` };
  },
  36: async (page) => {
    await selectionner(page, DALLE);
    await page.locator('.groupeFlottant #fitBtn').click(); await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const e = window.__plan.etat(), o = e.objects.find((o) => o.name === 'Dalle beton');
      const s = document.getElementById('stage').getBoundingClientRect();
      const sel = document.querySelector('.feuilleSelection')?.getBoundingClientRect();
      const ys = o.pts.map((p) => s.top + e.scene.origine.y - p.y * e.scene.scale);
      const xs = o.pts.map((p) => s.left + e.scene.origine.x + p.x * e.scene.scale);
      return { bas: Math.max(...ys), haut: Math.min(...ys), gauche: Math.min(...xs), droite: Math.max(...xs), limite: sel ? sel.top : s.bottom, s: s.top, w: s.right };
    });
    return { ok: r.bas <= r.limite && r.haut >= r.s && r.gauche >= 0 && r.droite <= r.w, mesure: `dalle cadrée entre ${Math.round(r.haut)} et ${Math.round(r.bas)} px, au-dessus de la feuille de sélection (${Math.round(r.limite)} px)` };
  },
  37: async (page) => {
    await feuille(page, 'projet');
    await page.locator('#menuExporter > summary').click(); await page.waitForTimeout(100);
    await page.locator('#pdfScaleInput').fill('100');
    const pdf = await telecharger(page, () => page.locator('#exportPdfBtn').click());
    const ferme = !(await page.evaluate(() => window.__plan.magasin().feuille));
    return { ok: /Echelle 1\/100/.test(pdf) && ferme, mesure: `PDF « Echelle 1/100 » ${/Echelle 1\/100/.test(pdf) ? 'présent' : 'ABSENT'}, feuille Projet ${ferme ? 'refermée' : 'restée ouverte'}` };
  },
  38: async (page) => {
    await page.evaluate(() => window.__plan.executer('vue.3d')); await page.waitForTimeout(300);
    // L'heure s'ouvre sous l'horloge du canevas ; un curseur ne se « remplit » pas : on le deplace
    // au clavier, comme au doigt on le glisse.
    await page.locator('#horloge3d').click({ force: true }); await page.waitForTimeout(150);
    await page.locator('#vue3dHeure').focus();
    for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const heure = await page.evaluate(() => document.getElementById('vue3dHeureTexte').textContent);
    await page.locator('#reglages3dBtn').click({ force: true }); await page.waitForTimeout(300);
    const ouverte = await page.evaluate(() => window.__plan.magasin().feuille === 'reglages3d' && getComputedStyle(document.getElementById('zoneReglages3d')).visibility === 'visible');
    // L'eclairage se mesure enfin, depuis que le reseau est joue : on attend la scene, on relit
    // l'image a deux heures eloignees, et elles doivent differer. Le texte de l'heure ne dit que
    // ce que le curseur vaut ; l'image dit ce que le soleil fait.
    let eclairage = "l'éclairage n'a pas pu être mesuré : la scène 3D n'est pas venue";
    let bouge = null;
    const canevas = page.locator('#terrasse3dCanvasHost canvas');
    if (await canevas.count().then((n) => n > 0).catch(() => false) || await canevas.waitFor({ timeout: 40000 }).then(() => true).catch(() => false)) {
      await image3dStable(page, 3000);
      // Le curseur est un champ controle par React : ecrire `value` ne lui dit rien, il faut passer
      // par le setter natif, comme le fait le navigateur sous le doigt. Sans cela l'heure restait a
      // 12:00 et les deux images etaient identiques — la mesure echouait, pas l'eclairage.
      const regler = (v) => page.evaluate((v) => {
        const c = document.getElementById('vue3dHeure');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, String(v));
        c.dispatchEvent(new Event('input', { bubbles: true }));
      }, v);
      await regler(9 * 60); const matin = await image3dStable(page, 1200);
      await regler(18 * 60); const soir = await image3dStable(page, 1200);
      bouge = matin !== soir;
      eclairage = `éclairage 09:00 ≠ 18:00 : ${bouge}`;
    }
    return {
      ok: bouge === null ? null : (bouge && ouverte),
      mesure: `curseur d'heure avancé de 36 crans → « ${heure} », feuille des réglages ${ouverte ? 'ouverte' : 'FERMÉE'} ; ${eclairage}`
    };
  },
  39: async (page, contexte) => {
    await selectionner(page, TERRASSE);
    await inspecteur(page);
    await ouvrirSection(page, 'structure');
    const champ = page.locator('#zoneInspecteur [data-cle="soliveEntraxe"] input').first();
    await champ.click(); await champ.fill('47');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      classe: window.__plan.magasin().classe,
      sel: window.__plan.etat().selectedKey,
      brouillon: document.querySelector('#zoneInspecteur [data-cle="soliveEntraxe"] input')?.value,
      ouvert: window.__plan.magasin().inspecteurOuvert
    }));
    await page.setViewportSize({ width: contexte.width, height: contexte.height });
    const nom = objet(await lireEtat(page), (o) => o.key === r.sel)?.name;
    return { ok: r.classe === 'moyen' && nom === 'Terrasse' && r.brouillon === '47', mesure: `paysage → ${r.classe}, sélection « ${nom} », inspecteur ${r.ouvert ? 'ouvert' : 'replié'}, brouillon « ${r.brouillon} »` };
  },
  40: async () => ({ ok: null, mesure: 'couvert par le passage en thème sombre de tous les points ci-dessus' }),

  // ---- Garde-fous de l'inspecteur et des controleurs (2.2.0, MD/spec-demos-admin.md) ------------
  // Les regressions qu'ils gardent ont existe : un Ctrl+Z vide apres une longueur ou un angle (#34),
  // des champs et des boutons modifiables en lecture seule.

  49: async (page) => {
    // Deux modifications de deux champs differents se defont en deux Ctrl+Z, ni plus ni moins.
    await selectionner(page, TERRASSE);
    const depart = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    await inspecteur(page);
    await ouvrirSection(page, 'cotes');
    await saisirSousChamp(page, 'cote0', 'Longueur', '3.9');
    await ouvrirSection(page, 'coins');
    await saisirSousChamp(page, 'coin1', 'Angle', '95');
    const modifie = objet(await lireEtat(page), (o) => o.key === depart.key);
    await feuille(page, null);
    await annuler(page);
    const un = objet(await lireEtat(page), (o) => o.key === depart.key);
    await annuler(page);
    const deux = objet(await lireEtat(page), (o) => o.key === depart.key);
    const memes = (a, b) => a.pts.every((p, k) => proches(p.x, b.pts[k].x, 1e-9) && proches(p.y, b.pts[k].y, 1e-9));
    const ok = !memes(modifie, depart) && !memes(un, depart) && memes(deux, depart);
    return { ok, mesure: `longueur puis angle modifiés ; après un Ctrl+Z ${memes(un, depart) ? 'DÉJÀ revenu (un geste perdu)' : 'reste la longueur'}, après deux ${memes(deux, depart) ? 'retour exact au départ' : 'PAS revenu (étape vide dans la pile)'}` };
  },
  50: async (page) => {
    // Un nom tape lettre a lettre est un seul geste : un seul Ctrl+Z le defait.
    await selectionner(page, TERRASSE);
    await inspecteur(page);
    const champ = page.locator('#zoneInspecteur [data-cle="name"] input').first();
    await champ.scrollIntoViewIfNeeded();
    const avant = await champ.inputValue();
    await champ.click(); await champ.press('End');
    await champ.pressSequentially('XYZ', { delay: 60 }); await page.waitForTimeout(150);
    const tape = objet(await lireEtat(page), (o) => o.fonction === 'terrasse' && o.type === 'polygon').name;
    await champ.blur(); await feuille(page, null);
    await annuler(page);
    const apres = objet(await lireEtat(page), (o) => o.fonction === 'terrasse' && o.type === 'polygon').name;
    return { ok: tape === avant + 'XYZ' && apres === avant, mesure: `« ${avant} » → « ${tape} » → un Ctrl+Z → « ${apres} »` };
  },
  51: async (page) => {
    // Une ecriture refusee (longueur 0) ne laisse pas d'etape vide : le Ctrl+Z suivant defait le
    // geste d'avant.
    await selectionner(page, TERRASSE);
    const depart = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    await inspecteur(page);
    await ouvrirSection(page, 'coins');
    await saisirSousChamp(page, 'coin1', 'Angle', '95');
    await ouvrirSection(page, 'cotes');
    await saisirSousChamp(page, 'cote0', 'Longueur', '0');
    await feuille(page, null);
    await annuler(page);
    const apres = objet(await lireEtat(page), (o) => o.key === depart.key);
    const revenu = apres.pts.every((p, k) => proches(p.x, depart.pts[k].x, 1e-9) && proches(p.y, depart.pts[k].y, 1e-9));
    return { ok: revenu, mesure: `angle modifié, longueur 0 refusée, un Ctrl+Z : ${revenu ? 'angle défait' : 'RIEN défait (étape vide)'}` };
  },
  52: async (page) => {
    // La vitrine est en lecture seule : tout ce qui ecrit le projet est grise — champs, boutons de
    // l'inspecteur, saisies du tiroir —, les reglages d'affichage restent libres.
    // La vitrine s'ouvre en Vue 3D : le plan n'y est pas dessine, on attend que Plan soit monte.
    await page.goto(BASE + '/?mode=demo');
    await page.waitForFunction(() => window.__plan && window.__plan.etat().objects.length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    await selectionner(page, TERRASSE);
    // Sur tablette, l'inspecteur demarre replie : ses champs ne sont montes qu'ouvert.
    await inspecteur(page);
    await page.evaluate(() => window.__plan.ouvrirResultats('bom'));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const actifs = (sel) => [...document.querySelectorAll(sel)].filter((e) => !e.disabled);
      return {
        champs: document.querySelectorAll('#zoneInspecteur [data-cle] input, #zoneInspecteur [data-cle] select').length,
        champsActifs: actifs('#zoneInspecteur [data-cle] input, #zoneInspecteur [data-cle] select').map((e) => e.closest('[data-cle]').getAttribute('data-cle')),
        supprimer: document.querySelectorAll('#zoneInspecteur [data-cle^="co"] button').length,
        supprimerActifs: actifs('#zoneInspecteur [data-cle^="cote"] button, #zoneInspecteur [data-cle^="coin"] button').length,
        saisies: document.querySelectorAll('#zoneResultats input[data-controle]').length,
        saisiesActives: actifs('#zoneResultats input[data-controle]').length
      };
    });
    // Seul un reglage d'affichage peut rester actif (« Distance au segment » de l'alignement).
    const libres = r.champsActifs.filter((k) => k !== 'distance');
    const ok = r.champs > 0 && !libres.length && r.supprimerActifs === 0 && r.saisies > 0 && r.saisiesActives === 0;
    return { ok, mesure: `${r.champs - r.champsActifs.length}/${r.champs} champs grisés (actifs : ${r.champsActifs.join(', ') || 'aucun'}), boutons supprimer actifs : ${r.supprimerActifs}, saisies du tiroir ${r.saisies - r.saisiesActives}/${r.saisies} grisées` };
  },
  53: async (page) => {
    // La decouverte des controleurs, dans les trois classes d'ecran : rien hors registre, rien hors
    // de sa zone, aucune ecriture sans droits. Les routes `admin/…` sont simulees : la session est
    // ouverte, aucun registre n'est enregistre, et celui qu'on enregistre est lu ici.
    let registre = null;
    await page.route(/\/admin\//, async (route) => {
      const req = route.request(), chemin = new URL(req.url()).pathname;
      if (chemin.endsWith('/admin/session')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      if (chemin.endsWith('/admin/controleurs') && req.method() === 'PUT') { registre = JSON.parse(req.postData() || 'null'); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto(BASE + '/?admin&ecran=controleurs');
    await page.getByRole('button', { name: 'Lancer la découverte' }).click();
    const enregistrer = page.getByRole('button', { name: 'Enregistrer la découverte' });
    await enregistrer.waitFor({ timeout: 60000 });
    await enregistrer.click();
    await page.waitForTimeout(500);
    if (!registre) return { ok: false, mesure: 'aucun registre enregistré' };
    const branche = (...cles) => cles.reduce((n, k) => n?.enfants?.find((e) => e.cle === k), registre.arbre);
    const ecran = branche('horsRegistre', 'ecran')?.details ?? {};
    const ecarts = branche('horsRegistre', 'ecartsZone')?.details?.nombre;
    const sansDroits = branche('ecritures', 'sansDroits')?.details?.nombre;
    const sansAnnulation = branche('ecritures', 'sansAnnulation')?.details?.nombre;
    let nommesParCle = 0, commandes = 0, sansDescription = 0;
    const voir = (n) => { if (n.genre === 'champ' && n.nom === n.cle) nommesParCle++; (n.enfants || []).forEach(voir); };
    voir(branche('inspecteur'));
    const compter = (n) => { if (n.genre === 'commande') { commandes++; if (!n.details?.description) sansDescription++; } (n.enfants || []).forEach(compter); };
    compter(branche('commandes'));
    const ok = ecran.horsRegistre === '0' && ecran.classes === 'bureau, tablette, téléphone' && ecarts === '0' && sansDroits === '0' && Number(sansAnnulation) <= 1 && nommesParCle === 0 && sansDescription === 0;
    return { ok, mesure: `classes : ${ecran.classes} ; hors registre ${ecran.horsRegistre} (${ecran.rattaches} rattachés) ; écarts de zone ${ecarts} ; écritures sans droits ${sansDroits}, sans annulation ${sansAnnulation} ; champs nommés par leur clé ${nommesParCle} ; commandes sans description ${sansDescription}/${commandes}` };
  },
  54: async (page) => {
    // Le releve de facade de bout en bout, sans camera : une facade synthetique (mur enduit, deux
    // fenetres et une porte) importee, coins proposes, analyse, Valider ; un Ctrl+Z le retire d'un coup.
    const dessin = await page.context().newPage();
    await dessin.setViewportSize({ width: 1600, height: 1200 });
    await dessin.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1200"></canvas><script>'
      + "const x=document.getElementById('c').getContext('2d');"
      + "x.fillStyle='#9cc3e6';x.fillRect(0,0,1600,1200);x.fillStyle='#6b6b5a';x.fillRect(0,1000,1600,200);"
      + "x.fillStyle='#e8dcc4';x.fillRect(200,250,1200,750);"
      + "x.fillStyle='#2b3440';x.fillRect(380,450,220,300);x.fillRect(1000,450,220,300);x.fillRect(700,620,200,380);"
      + '</script></body>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    const facades = () => page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)));
    const avant = await facades();
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo });
    await page.locator('[data-controle="releve.analyser"]').first().click({ timeout: 15000 });
    await page.locator('[data-controle="releve.valider"]').first().waitFor({ timeout: 30000 });
    // La precision annoncee (lot L6) : un pixel de la photo au mur, lu ici sur les coins poses.
    const precision = await page.locator('.releveNote', { hasText: 'Cotes précises' }).first().textContent({ timeout: 2000 }).catch(() => null);
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const ecrit = await page.evaluate(() => window.__plan.etat().objects.filter((o) => o.facades && o.facades.length).map((o) => ({ nom: o.name, ouvertures: o.facades.map((f) => f.ouvertures.length), pxParM: o.facades.map((f) => f.calage?.photos?.[0]?.pxParMSource ?? null) })));
    await annuler(page);
    const retour = (await facades()) === avant;
    const ouvertures = ecrit[0]?.ouvertures?.[0] ?? 0;
    const pxParM = ecrit[0]?.pxParM?.[0] ?? null;
    return { ok: ecrit.length === 1 && ouvertures >= 2 && retour && !!precision && pxParM > 0, mesure: `relevé écrit : ${ecrit.map((e) => e.nom + ' ' + e.ouvertures.join('/') + ' ouverture(s)').join(', ') || 'RIEN'} ; ${precision ? '« ' + precision.trim() + ' »' : 'PAS de précision annoncée'} ; calage gardé : ${pxParM ?? 'RIEN'} px/m ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  },
  58: async (page) => {
    // Le calage fin (lot L7) : une facade photographiee de biais, sous un ciel et sur un gazon,
    // importee sans distance ni cap ; les coins sont cherches sur la photo (dans un worker), trouves
    // pleins, predits en pointille ; un coin deplace au doigt le dit ; la loupe suit le doigt.
    const dessin = await page.context().newPage();
    await dessin.setViewportSize({ width: 1600, height: 1200 });
    await dessin.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1200"></canvas><script>'
      + "const x=document.getElementById('c').getContext('2d');"
      + "x.fillStyle='#9cc3e6';x.fillRect(0,0,1600,1200);x.fillStyle='#6f9a52';x.fillRect(0,865,1600,335);"
      + "const q=(c,p)=>{x.fillStyle=c;x.beginPath();x.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)x.lineTo(p[i],p[i+1]);x.closePath();x.fill();};"
      // Un mur de 8 m sur 6 m (la maison de la demonstration), vu un peu de biais, sous une bande de toit.
      + "q('#8a4a36',[260,170,1330,205,1330,300,260,290]);"
      + "q('#e4d6bc',[260,290,1330,300,1350,1040,240,1075]);"
      + "q('#2b3440',[420,420,620,423,620,660,420,662]);q('#2b3440',[980,428,1180,430,1180,665,980,664]);q('#5a3a2a',[730,760,880,762,880,1060,730,1065]);"
      + '</script></body>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo });
    const recherche = await page.locator('.releveNote', { hasText: 'Recherche des coins' }).count();
    await page.locator('.releveNote', { hasText: /trouvés? sur la photo|pas été trouvés/ }).first().waitFor({ timeout: 20000 });
    const note = (await page.locator('.releveNote', { hasText: /trouvés? sur la photo|pas été trouvés/ }).first().textContent())?.trim();
    const classes = () => page.locator('circle.releveCoinCible').evaluateAll((cs) => cs.map((c) => c.getAttribute('class')?.replace('releveCoinCible', '').trim() || ''));
    const avant = await classes();
    const etiquette = await page.locator('circle.releveCoinCible').first().getAttribute('aria-label');
    // Un geste sur le premier coin : il devient « place au doigt », la loupe s'ouvre pendant le geste.
    const cible = page.locator('circle.releveCoinCible').first();
    const b = await cible.boundingBox();
    let loupe = false;
    if (b) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 6, b.y + b.height / 2 + 4, { steps: 3 });
      loupe = (await page.locator('.releveLoupe').count()) > 0;
      await page.mouse.up();
    }
    const apres = await classes();
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const pleins = avant.filter((c) => c === 'trouve').length;
    const ok = pleins >= 2 && avant.length === 4 && apres[0] === 'doigt' && loupe && !!etiquette && /\(/.test(etiquette);
    return { ok, mesure: `${recherche ? 'recherche annoncée ; ' : ''}« ${note} » ; coins : ${avant.join(', ')} ; après un geste : ${apres.join(', ')} ; loupe ${loupe ? 'ouverte' : 'ABSENTE'} ; « ${etiquette} »` };
  },
  59: async (page) => {
    // La distorsion du grand-angle (lot L8) : une facade de face, vue par un ultra grand-angle non
    // corrige (barillet de 15 % au coin), en JPEG dont l'EXIF dit 13 mm ; la photo montree devient la
    // photo corrigee, une note le dit, et les coins sont trouves sur les aretes redevenues droites.
    const dessin = await page.context().newPage();
    const jpeg = await dessin.evaluate(() => {
      const L = 1280, H = 960, k = -0.15, R = Math.hypot(L, H) / 2;
      const c = document.createElement('canvas'); c.width = L; c.height = H;
      const x = c.getContext('2d'), img = x.createImageData(L, H);
      const fen = [[330, 360, 470, 520], [810, 360, 950, 520], [330, 590, 470, 750], [810, 590, 950, 750], [585, 600, 695, 800]];
      for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) {
        // Le pixel de la photo deformee vise le point du stenope qui y tombe (rd = ru (1 + k ru^2)).
        const dx = i + 0.5 - L / 2, dy = j + 0.5 - H / 2, rd = Math.hypot(dx, dy) / R;
        let ru = rd; for (let n = 0; n < 20; n++) ru -= (ru * (1 + k * ru * ru) - rd) / (1 + 3 * k * ru * ru);
        const f = rd > 1e-9 ? ru / rd : 1, u = L / 2 + dx * f, v = H / 2 + dy * f;
        let col = v > 800 ? [111, 154, 82] : [156, 195, 230];
        if (u > 200 && u < 1080 && v > 200 && v < 800) col = v < 250 ? [138, 74, 54] : [228, 214, 188];
        if (fen.some(([a, b, cc, d]) => u > a && u < cc && v > b && v < d)) col = [43, 52, 64];
        const o = (j * L + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      const brut = atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
      // Un segment APP1 Exif minimal : IFD0 -> sous-IFD Exif -> FocalLengthIn35mmFilm = 13.
      const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8,
        0, 1, 0x87, 0x69, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0,
        0, 1, 0xa4, 0x05, 0, 3, 0, 0, 0, 1, 0, 13, 0, 0, 0, 0, 0, 0];
      const app1 = [0xff, 0xe1, ((exif.length + 2) >> 8) & 0xff, (exif.length + 2) & 0xff, ...exif];
      const octets = [0xff, 0xd8, ...app1];
      for (let n = 2; n < brut.length; n++) octets.push(brut.charCodeAt(n));
      return octets;
    });
    await dessin.close();
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'grand-angle.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
    const urlAvant = await page.locator('.releveCoins image, .releveCoins img').first().getAttribute('href').catch(() => null);
    await page.locator('.releveNote', { hasText: /trouvés? sur la photo|pas été trouvés/ }).first().waitFor({ timeout: 30000 });
    const note = (await page.locator('.releveNote', { hasText: /trouvés? sur la photo|pas été trouvés/ }).first().textContent())?.trim() ?? '';
    const urlApres = await page.locator('.releveCoins image, .releveCoins img').first().getAttribute('href').catch(() => null);
    const classes = await page.locator('circle.releveCoinCible').evaluateAll((cs) => cs.map((c) => c.getAttribute('class')?.replace('releveCoinCible', '').trim() || ''));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const corrigee = /Distorsion du grand-angle corrigée/.test(note);
    const pleins = classes.filter((c) => c === 'trouve').length;
    const changee = !!urlApres && urlApres !== urlAvant && urlApres.startsWith('data:image/jpeg');
    return { ok: corrigee && pleins >= 2 && changee, mesure: `« ${note} » ; coins : ${classes.join(', ')} ; photo montrée ${changee ? 'remplacée par la corrigée' : 'PAS remplacée (' + (urlApres ?? 'aucune') + ')'}` };
  },
  60: async (page, f) => {
    // L'audit de la parcelle, la liste de controle (lot L9) : « Auditer la parcelle… » depuis le menu
    // Fichier (feuille Projet au doigt) ; les batiments de la parcelle, sans les maisons voisines ; une facade
    // marquee inaccessible, le toit note, la cloture notee ; fermer puis rouvrir garde tout ; rien
    // n'entre dans le projet ; rien ne deborde de l'ecran.
    const avant = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    const titres = await page.locator('.titreBatimentAudit').allTextContents();
    const compteurAvant = (await page.locator('.compteurAudit').textContent())?.trim();
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const debords = [await deborde()];
    const inaccessible = page.locator('button[data-controle="auditParcelle.inaccessible"][aria-label$="de Maison"]').first();
    await etape('inaccessible', () => inaccessible.click({ timeout: 5000 }));
    const marquee = await page.locator('.ligneAudit.statut-inaccessible').count();
    await etape('noter le toit', () => page.getByRole('button', { name: 'Noter : Toit de Maison' }).click({ timeout: 5000 }));
    await etape('forme', () => page.locator('button[data-controle="vu.forme"]', { hasText: 'Quatre pans (croupes)' }).first().click({ timeout: 5000 }));
    debords.push(await deborde());
    await etape('cloture', () => page.locator('button[data-controle="auditParcelle.noter"]', { hasText: 'Clôture côté rue' }).click({ timeout: 5000 }));
    await etape('mur', () => page.locator('button[data-controle="auditParcelle.typeCloture"]', { hasText: 'Mur' }).click({ timeout: 5000 }));
    const compteur = (await page.locator('.compteurAudit').textContent())?.trim();
    const lancerGrise = await page.locator('[data-controle="auditParcelle.lancer"]').isDisabled();
    await etape('fermer', () => page.locator('[data-controle="auditParcelle.fermer"]').click({ timeout: 5000 }));
    await page.waitForTimeout(300);
    await etape('rouvrir', () => ouvrirAuditParcelle(page));
    const garde = await page.locator('.ligneAudit', { hasText: 'Vu · Quatre pans (croupes)' }).count();
    const apres = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // Les batiments de la parcelle, puis la parcelle, et rien d'autre : plus de maisons voisines (15 octobre).
    const iParcelle = titres.indexOf('La parcelle');
    const ok = titres[0] === 'Maison' && iParcelle > 0 && iParcelle === titres.length - 1 && marquee >= 1 && garde === 1
      && /clôture notée/.test(compteur || '') && /1 toit vu sur/.test(compteur || '') && lancerGrise && avant === apres && !debords.some(Boolean);
    return { ok, mesure: `bâtiments ${titres.length - 1} (${titres.slice(0, 3).join(', ')}…) ; « ${compteurAvant} » → « ${compteur} » ; inaccessible ${marquee} ; toit gardé à la réouverture ${garde ? 'oui' : 'NON'} ; Lancer ${lancerGrise ? 'grisé' : 'ACTIF'} sans photo ; projet ${avant === apres ? 'inchangé' : 'MODIFIÉ'} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  61: async (page) => {
    // L'audit de la parcelle, l'ecran de prise (lot L9) : GPS simule devant un mur de la maison et
    // boussole tournee vers lui ; la facade est reconnue, nommee et surlignee dans la Vue 3D ; une
    // photo importee s'y range d'elle-meme ; « Ce n'est pas cette façade » en propose une autre ;
    // la liste compte la facade photographiee et « Lancer l'analyse » termine la capture.
    const station = await stationDevantLaMaison(page);
    if (!station) return { ok: false, mesure: 'aucun mur de la maison ne se voit depuis la parcelle' };
    await page.context().grantPermissions(['geolocation'], { origin: BASE });
    await page.context().setGeolocation({ latitude: station.lat, longitude: station.lon, accuracy: 4 });
    await ouvrirAuditParcelle(page);
    await page.locator('[data-controle="auditParcelle.prise"]').click();
    await page.locator('.auditPrise').waitFor({ timeout: 10000 });
    // La boussole : `deviceorientationabsolute`, dont alpha tourne dans l'autre sens que le cap.
    const tourner = (cap) => page.evaluate((a) => { for (let i = 0; i < 4; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, beta: 90, gamma: 0, absolute: true })); }, (360 - cap) % 360);
    await tourner(station.cap);
    await page.locator('.auditPrise .titreParcours', { hasText: 'Vous êtes devant' }).waitFor({ timeout: 15000 }).catch(() => {});
    const titre = (await page.locator('.auditPrise .titreParcours').textContent())?.trim() ?? '';
    // La Vue 3D se batit pendant ce temps : le surlignage y est pose des qu'elle est la.
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene.getObjectByName('facadeDevant'), null, { timeout: 30000 }).catch(() => {});
    const surlignee = await page.evaluate(() => !!window.__plan.scene3d()?.scene.getObjectByName('facadeDevant'));
    const dessin = await page.context().newPage();
    await dessin.setContent('<canvas id="c" width="800" height="600"></canvas><script>const x=document.getElementById("c").getContext("2d");x.fillStyle="#e4d6bc";x.fillRect(0,0,800,600);</script>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo });
    await page.locator('.rangementAudit').waitFor({ timeout: 10000 }).catch(() => {});
    const range = (await page.locator('.rangementAudit').textContent().catch(() => ''))?.trim() ?? '';
    const autre = page.locator('[data-controle="auditParcelle.pasCetteFacade"]');
    if (await autre.isEnabled()) await autre.click();
    await page.waitForTimeout(200);
    const titreApres = (await page.locator('.auditPrise .titreParcours').textContent())?.trim() ?? '';
    await page.locator('[data-controle="auditParcelle.liste"]').click();
    const compteur = (await page.locator('.compteurAudit').textContent())?.trim() ?? '';
    const lancer = page.locator('[data-controle="auditParcelle.lancer"]');
    const actif = await lancer.isEnabled();
    if (actif) await lancer.click();
    const toast = await page.locator('.toast', { hasText: 'Capture terminée' }).count();
    const ok = /^Vous êtes devant la façade .* de Maison, \d+,\d m — 0 photo$/.test(titre) && surlignee && /^Photo rangée sur la façade .* de Maison \(1 photo\)\.$/.test(range)
      && titreApres !== titre && /^1 façade sur/.test(compteur) && actif && toast === 1;
    return { ok, mesure: `« ${titre} » ; surlignée en 3D ${surlignee ? 'oui' : 'NON'} ; « ${range || 'RIEN'} » ; après « Ce n’est pas cette façade » : « ${titreApres} » ; « ${compteur} » ; Lancer ${actif ? 'actif' : 'GRISÉ'} ; toast ${toast ? 'oui' : 'NON'}` };
  },
  84: async (page) => {
    // « Photographier en marchant » (demande de l'utilisateur du 14 octobre) : la Vue 3D est a hauteur
    // d'homme, derriere vous, un peu vers le haut ; elle suit la boussole (pas une image fixe) ; la
    // facade visee est en rouge ; toucher une facade dans la 3D la choisit ; une facade photographiee
    // passe au vert et se reprend.
    const ecartCapFixe = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    const station = await stationDevantLaMaison(page);
    if (!station) return { ok: false, mesure: 'aucun mur de la maison ne se voit depuis la parcelle' };
    await page.context().grantPermissions(['geolocation'], { origin: BASE });
    await page.context().setGeolocation({ latitude: station.lat, longitude: station.lon, accuracy: 4 });
    await ouvrirAuditParcelle(page);
    await page.locator('[data-controle="auditParcelle.prise"]').click();
    await page.locator('.auditPrise').waitFor({ timeout: 10000 });
    const tourner = (cap) => page.evaluate((a) => { for (let i = 0; i < 6; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, beta: 90, gamma: 0, absolute: true })); }, (360 - cap) % 360);
    await tourner(station.cap);
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene.getObjectByName('facadeDevant'), null, { timeout: 30000 }).catch(() => {});
    await tourner(station.cap);
    await page.waitForTimeout(300);
    // La camera : hauteur dans la scene, cap et montee du regard (repere local : x vers l'est, z vers le sud).
    const camera = () => page.evaluate(() => {
      const sc = window.__plan.scene3d();
      if (!sc) return null;
      const c = sc.camera.position, t = sc.controls.target;
      const dx = t.x - c.x, dz = t.z - c.z;
      return { y: c.y, cap: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360, montee: (Math.atan2(t.y - c.y, Math.hypot(dx, dz)) * 180) / Math.PI };
    });
    // La camera glisse vers sa pose (un tiers de seconde a 60 images par seconde ; le navigateur de
    // la fumee, sans carte graphique, en dessine bien moins) : on la lit une fois arretee.
    const posee = async () => {
      let a = await camera();
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(250);
        const b = await camera();
        if (a && b && Math.abs(((a.cap - b.cap + 540) % 360) - 180) < 0.5 && Math.abs(a.montee - b.montee) < 0.5) return b;
        a = b;
      }
      return a;
    };
    const avant = await posee();
    await tourner((station.cap + 40) % 360);
    const apres = await posee();
    await tourner(station.cap);
    await posee();
    const couleurDe = (nom) => page.evaluate((n) => window.__plan.scene3d()?.scene.getObjectByName(n)?.getObjectByName('voile')?.material.color.getHex() ?? null, nom);
    const rouge = await couleurDe('facadeDevant');
    // Toucher la facade surlignee dans la 3D : elle devient « choisie ».
    const cible = await page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const voile = sc?.scene.getObjectByName('facadeDevant')?.getObjectByName('voile');
      if (!sc || !voile) return null;
      voile.geometry.computeBoundingBox();
      const b = voile.geometry.boundingBox;
      const r = sc.renderer.domElement.getBoundingClientRect();
      // Un point du mur que l'ecran de prise ne cache pas (au doigt, il couvre le bas de la vue).
      for (const part of [0.5, 0.75, 0.9, 0.3]) {
        const c = b.getCenter(new THREE.Vector3());
        c.y = b.min.y + (b.max.y - b.min.y) * part;
        c.project(sc.camera);
        const x = r.left + ((c.x + 1) / 2) * r.width, y = r.top + ((1 - c.y) / 2) * r.height;
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
      }
      return null;
    });
    if (cible) await page.mouse.click(cible.x, cible.y);
    // L'ecran se redessine apres le geste : sur une machine chargee, cela peut prendre plusieurs secondes.
    await page.locator('.auditPrise .titreParcours', { hasText: '(choisie)' }).waitFor({ timeout: 15000 }).catch(() => {});
    const titre = (await page.locator('.auditPrise .titreParcours').textContent())?.trim() ?? '';
    const toasts = (await page.locator('.toast').allTextContents()).join(' | ');
    const sousLeDoigt = cible ? await page.evaluate((c) => { const e = document.elementFromPoint(c.x, c.y); return e ? e.tagName + '.' + e.className : 'rien'; }, cible) : 'aucun point';
    // La facade choisie fixe la vue (orbite) : la boussole ne la tourne plus, et le zoom est verrouille.
    const fixe0 = await posee();
    await tourner((station.cap + 70) % 360);
    const fixe1 = await posee();
    const zoomVerrouille = await page.evaluate(() => window.__plan.scene3d()?.controls.enableZoom === false);
    const fixe = !!fixe0 && !!fixe1 && ecartCapFixe(fixe0.cap, fixe1.cap) < 2 && Math.abs(fixe0.y - fixe1.y) < 0.05 && zoomVerrouille;
    // Une photo sur cette facade : elle passe au vert, et une seconde photo s'y range encore.
    const dessin = await page.context().newPage();
    await dessin.setContent('<canvas id="c" width="800" height="600"></canvas><script>const x=document.getElementById("c").getContext("2d");x.fillStyle="#e4d6bc";x.fillRect(0,0,800,600);</script>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    const entree = page.locator('input[data-controle="auditParcelle.photo"]');
    await entree.setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo });
    await page.locator('.rangementAudit', { hasText: '(1 photo)' }).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    // Visee et photographiee : la facade passe au vert par son propre surlignage (rouge sur vert
    // faisait du brun, essai d'AE 101).
    const vert = await couleurDe('facadeDevant');
    await entree.setInputFiles({ name: 'facade2.png', mimeType: 'image/png', buffer: photo });
    await page.locator('.rangementAudit', { hasText: '(2 photos)' }).waitFor({ timeout: 30000 }).catch(() => {});
    const reprise = (await page.locator('.rangementAudit').textContent().catch(() => ''))?.trim() ?? '';
    // Sortir de l'audit depuis la prise : son propre bouton, sans repasser par la liste (16 octobre).
    await page.locator('.auditPrise [data-controle="auditParcelle.fermer"]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.auditPrise').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const sorti = (await page.locator('.auditPrise, .dialogueAuditParcelle').count()) === 0;
    const ecartCap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    const ok = sorti && fixe && !!avant && !!apres && avant.montee > 3 && avant.montee < 20
      && ecartCap(avant.cap, station.cap) < 15 && ecartCap(apres.cap, (station.cap + 40) % 360) < 15
      && rouge === 0xe0301e && /\(choisie\)/.test(titre) && vert === 0x2e9e4f && /\(2 photos\)/.test(reprise);
    return { ok, mesure: `caméra ${avant ? 'à ' + avant.y.toFixed(1) + ' m (scène), regard ' + avant.montee.toFixed(0) + '° vers le haut, cap ' + avant.cap.toFixed(0) + '° pour ' + station.cap.toFixed(0) + '°' : 'ABSENTE'} ; boussole +40° → cap ${apres ? apres.cap.toFixed(0) : '?'}° ; visée ${rouge === 0xe0301e ? 'rouge' : 'PAS rouge (' + rouge + ')'} ; toucher ${cible ? 'en ' + Math.round(cible.x) + ',' + Math.round(cible.y) + ' sur ' + sousLeDoigt : '(AUCUN point du mur visible)'} → « ${titre} »${toasts ? ' [toasts : ' + toasts + ']' : ''} ; facade choisie ${fixe ? 'fixe (boussole sans effet, zoom verrouillé)' : 'PAS fixe (' + (fixe0 ? fixe0.cap.toFixed(0) : '?') + '° → ' + (fixe1 ? fixe1.cap.toFixed(0) : '?') + '°, zoom ' + (zoomVerrouille ? 'verrouillé' : 'libre') + ')'} ; photographiée ${vert === 0x2e9e4f ? 'verte' : 'PAS verte (' + vert + ')'} ; reprise « ${reprise} » ; ${sorti ? 'sortie par le bouton Fermer de la prise' : 'PAS sorti par le bouton Fermer'}` };
  },
  88: async (page) => {
    // La vue epuree et la vue d'ensemble de l'audit de la parcelle (second essai d'AE 101, 15 octobre) :
    // pendant l'audit, la Vue 3D ne montre que les batiments de la parcelle et le sol (ni arbres, ni
    // voisins, ni clotures, ni terrasse) ; sans position, elle montre toute la maison en grand angle,
    // au-dessus de l'ecran de prise, et une facade s'y touche ; les propositions laissent voir la
    // maison, leur liste se replie ; l'audit ferme, tout revient, et le projet n'a pas bouge.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const avant = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    const familles = await page.evaluate(() => {
      const o = window.__plan.etat().objects;
      return { arbres: o.filter((x) => x.fonction === 'arbre').map((x) => x.key), voisins: o.filter((x) => x.voisinage && (x.fonction === 'batiment' || x.fonction === 'annexe')).map((x) => x.key) };
    });
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('prise', () => page.locator('[data-controle="auditParcelle.prise"]').click({ timeout: 30000 }));
    await page.locator('.auditPrise').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => (window.__plan.visibilite3d()?.masques.length ?? 0) > 0, null, { timeout: 90000 }).catch(() => {});
    const vis = await page.evaluate(() => window.__plan.visibilite3d());
    const epuree = vis.visibles.includes('maison') && !familles.arbres.some((k) => vis.visibles.includes(k)) && !familles.voisins.some((k) => vis.visibles.includes(k)) && vis.horsObjetsVisibles === 0;
    // La camera glisse vers sa pose : on la lit une fois arretee.
    const camera = () => page.evaluate(() => { const sc = window.__plan.scene3d(); return sc ? [sc.camera.position.x, sc.camera.position.y, sc.camera.position.z, sc.controls.target.y].map((v) => v.toFixed(2)).join(',') : ''; });
    const arretee = async () => { let a = await camera(); for (let i = 0; i < 30; i++) { await page.waitForTimeout(250); const b = await camera(); if (a && a === b) return; a = b; } };
    await arretee();
    // Les coins de la maison (au sol et sous le toit) : dans le canevas, hors de l'ecran pose dessus.
    const maisonVue = (sel) => page.evaluate((sel) => {
      const sc = window.__plan.scene3d();
      const m = window.__plan.etat().objects.find((o) => o.key === 'maison');
      const r = sc.renderer.domElement.getBoundingClientRect();
      const carte = document.querySelector(sel)?.getBoundingClientRect();
      let dedans = 0, total = 0;
      const pied = sc.controls.target.y - 3;
      for (const p of m.pts) for (const y of [pied, pied + 7]) {
        const v = new THREE.Vector3(p.x - sc.cen.x, y, sc.cen.y - p.y).project(sc.camera);
        const x = r.left + ((v.x + 1) / 2) * r.width, yy = r.top + ((1 - v.y) / 2) * r.height;
        total++;
        const sousCarte = carte && x >= carte.left && x <= carte.right && yy >= carte.top && yy <= carte.bottom;
        if (x >= r.left && x <= r.right && yy >= r.top && yy <= r.bottom && !sousCarte && v.z < 1) dedans++;
      }
      const c = sc.camera.position;
      return { dedans, total, hauteur: c.y - sc.controls.target.y };
    }, sel);
    const ensemble = await maisonVue('.auditPrise');
    // Toucher un mur de la maison dans la vue d'ensemble : il devient la facade de la prochaine photo.
    const cible = await page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const m = window.__plan.etat().objects.find((o) => o.key === 'maison');
      const r = sc.renderer.domElement.getBoundingClientRect();
      for (let i = 0; i < m.pts.length; i++) {
        const a = m.pts[i], b = m.pts[(i + 1) % m.pts.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 3) continue;
        const v = new THREE.Vector3((a.x + b.x) / 2 - sc.cen.x, sc.controls.target.y - 1, sc.cen.y - (a.y + b.y) / 2).project(sc.camera);
        const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
      }
      return null;
    });
    if (cible) await page.mouse.click(cible.x, cible.y);
    await page.locator('.auditPrise .titreParcours', { hasText: '(choisie)' }).waitFor({ timeout: 20000 }).catch(() => {});
    const titre = (await page.locator('.auditPrise .titreParcours').textContent())?.trim() ?? '';
    // Une photo, puis les propositions : elles laissent voir la maison, et leur liste se replie.
    const dessin = await page.context().newPage();
    await dessin.setContent('<canvas id="c" width="800" height="600"></canvas><script>const x=document.getElementById("c").getContext("2d");x.fillStyle="#e4d6bc";x.fillRect(0,0,800,600);</script>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await page.locator('.rangementAudit').waitFor({ timeout: 30000 }).catch(() => {});
    await etape('liste', () => page.locator('[data-controle="auditParcelle.liste"]').click({ timeout: 30000 }));
    await etape('lancer', () => page.locator('[data-controle="auditParcelle.lancer"]').click({ timeout: 30000 }));
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 90000 }).catch(() => {});
    // L'ecran s'ouvre sur « Les deux » (point 90) : ici, la vue unique, que la camera cadre au-dessus de la carte.
    await etape('une vue', () => page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Avant' }).click({ timeout: 30000 }));
    await page.waitForTimeout(800);
    await arretee();
    const carte = await page.evaluate(() => { const r = document.querySelector('.auditPropositions').getBoundingClientRect(); return { h: r.height, gauche: r.left, vh: innerHeight, vw: innerWidth }; });
    const propositions = await maisonVue('.auditPropositions');
    // Au plus la moitie de la hauteur en bas, ou un panneau a droite (ecran en largeur).
    const bornee = carte.gauche > carte.vw * 0.45 || carte.h <= carte.vh * 0.5 + 1;
    await etape('replier', () => page.locator('[data-controle="auditParcelle.replier"]').click({ timeout: 30000 }));
    await page.waitForTimeout(400);
    const repliee = await page.evaluate(() => ({ h: document.querySelector('.auditPropositions').getBoundingClientRect().height, cache: document.getElementById('corpsPropositions')?.hidden === true }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window.__plan.visibilite3d()?.masques.length ?? 1) === 0, null, { timeout: 30000 }).catch(() => {});
    const apres = await page.evaluate(() => window.__plan.visibilite3d());
    const rendue = apres.masques.length === 0 && apres.horsObjetsVisibles > 0;
    const projet = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    const ok = epuree && ensemble.dedans === ensemble.total && ensemble.hauteur > 4 && /\(choisie\)/.test(titre)
      && propositions.dedans >= propositions.total - 2 && bornee && repliee.cache && repliee.h < carte.h && rendue && projet === avant;
    return { ok, mesure: `vue épurée ${epuree ? 'oui' : 'NON'} (visibles ${vis.visibles.length}, masqués ${vis.masques.length}, hors objets visibles ${vis.horsObjetsVisibles}) ; vue d'ensemble : maison ${ensemble.dedans}/${ensemble.total} coins visibles, caméra ${ensemble.hauteur.toFixed(1)} m au-dessus du point visé ; toucher ${cible ? Math.round(cible.x) + ',' + Math.round(cible.y) : 'AUCUN mur visible'} → « ${titre} » ; propositions : carte ${Math.round(carte.h)} px sur ${carte.vh}${carte.gauche > carte.vw * 0.45 ? ', à droite' : ''}, maison ${propositions.dedans}/${propositions.total} coins visibles ; repliée ${repliee.cache ? Math.round(repliee.h) + ' px' : 'NON'} ; fermé : ${rendue ? 'tout revient' : 'PAS RENDU (' + apres.masques.length + ' masqués)'} ; projet ${projet === avant ? 'inchangé' : 'MODIFIÉ'}` };
  },
  89: async (page) => {
    // Le trait renforce de pres (demande de l'utilisateur du 15 octobre) : a 3,5 m de la facade de la
    // maison, ses aretes se dessinent en traits epais et sombres par-dessus le voile ; a 10 m, plus rien.
    const station = await stationDevantLaMaison(page, [3.5, 4]);
    if (!station) return { ok: false, mesure: 'aucun mur de la maison ne se voit a 3,5 m depuis la parcelle' };
    await page.context().grantPermissions(['geolocation'], { origin: BASE });
    await page.context().setGeolocation({ latitude: station.lat, longitude: station.lon, accuracy: 3 });
    await ouvrirAuditParcelle(page);
    await page.locator('[data-controle="auditParcelle.prise"]').click({ timeout: 30000 });
    await page.locator('.auditPrise').waitFor({ timeout: 30000 });
    const tourner = (cap) => page.evaluate((a) => { for (let i = 0; i < 6; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, beta: 90, gamma: 0, absolute: true })); }, (360 - cap) % 360);
    await tourner(station.cap);
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene.getObjectByName('facadeDevant'), null, { timeout: 60000 }).catch(() => {});
    await tourner(station.cap);
    // Les lignes epaisses arrivent a la demande : le trait fin d'attente est remplace.
    await page.waitForFunction(() => window.__plan.scene3d()?.scene.getObjectByName('traitDePres')?.type === 'LineSegments2', null, { timeout: 30000 }).catch(() => {});
    const lire = () => page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const t = sc?.scene.getObjectByName('traitDePres');
      return { trait: t ? { type: t.type, opacite: t.material.opacity, largeur: t.material.linewidth ?? 1, segments: t.geometry.attributes.instanceStart?.count ?? t.geometry.attributes.position.count / 2 } : null, voile: !!sc?.scene.getObjectByName('facadeDevant')?.getObjectByName('voile')?.visible };
    });
    const pres = await lire();
    // On recule a une dizaine de metres : le trait part.
    const loin = await stationDevantLaMaison(page, [11, 12, 13]);
    if (loin) {
      await page.context().setGeolocation({ latitude: loin.lat, longitude: loin.lon, accuracy: 3 });
      await page.waitForFunction(() => !window.__plan.scene3d()?.scene.getObjectByName('traitDePres'), null, { timeout: 40000 }).catch(() => {});
    }
    const apres = await lire();
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const ok = !!pres.trait && pres.trait.type === 'LineSegments2' && pres.trait.opacite > 0.9 && pres.trait.largeur >= 3 && pres.trait.segments > 12 && pres.voile && !!loin && !apres.trait;
    return { ok, mesure: `à 3,5 m : ${pres.trait ? pres.trait.type + ', ' + pres.trait.segments + ' arêtes, ' + pres.trait.largeur.toFixed(1) + ' px, opacité ' + pres.trait.opacite.toFixed(2) : 'AUCUN trait'} ; voile ${pres.voile ? 'visible' : 'ABSENT'} ; à une dizaine de mètres : ${loin ? (apres.trait ? 'trait ENCORE là (' + apres.trait.opacite.toFixed(2) + ')' : 'plus de trait') : 'AUCUNE station'}` };
  },
  62: async (page, f) => {
    // L'audit de la parcelle, propositions et validation (lot L11) : les mesures et les observations
    // deviennent des propositions ; « Après » les montre dans la Vue 3D sans toucher au projet ;
    // « Valider » les ecrit en un seul pas ; Ctrl+Z les defait.
    const avant = await etatAudite(page);
    await captureJusquAuxPropositions(page);
    const n = await page.locator('.ligneProposition').count();
    const releve = await ligneProposition(page, 'Façade');
    const murs = await ligneProposition(page, 'Matériau des murs de Maison');
    const couverture = await ligneProposition(page, 'Couverture de Maison');
    const cloture = await ligneProposition(page, 'Clôture côté rue');
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Après' }).click({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const apresPresse = await page.locator('button[data-controle="auditParcelle.avantApres"][aria-pressed="true"]').textContent();
    const pendantApercu = await etatAudite(page);
    await page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Avant' }).click({ timeout: 30000 });
    await page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Après' }).click({ timeout: 30000 });
    // Le toast ne reste que quelques secondes, et la Vue 3D logicielle ralentit le clic d'autant :
    // on note chaque toast qui parait, plutot que de le chercher apres coup.
    await page.evaluate(() => {
      window.__toastsVus = [];
      new MutationObserver(() => document.querySelectorAll('.toast').forEach((t) => { if (!window.__toastsVus.includes(t.textContent)) window.__toastsVus.push(t.textContent); }))
        .observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await page.locator('[data-controle="auditParcelle.valider"]').click({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const toast = (await page.evaluate(() => window.__toastsVus.find((t) => /Ctrl\+Z/.test(t)) ?? '')).trim();
    const ferme = (await page.locator('.auditPropositions').count()) === 0;
    const ecrit = await etatAudite(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(1500);
    const annule = await etatAudite(page);
    const e = JSON.parse(ecrit);
    const ok = n >= 4 && !!releve && !releve.cochee && /prédits par la prise de vue/.test(releve.texte) && !!murs?.cochee && !!couverture?.cochee && !!cloture?.cochee
      && apresPresse === 'Après' && pendantApercu === avant && ferme && /Ctrl\+Z les défait/.test(toast)
      && e.murs?.materiau === 'brique' && e.couverture === 'ardoise' && e.facades === 0 && (e.cloture ?? []).some((c) => c.type === 'mur' && c.hauteur === 1.6)
      && annule === avant && !deborde;
    return { ok, mesure: `${n} propositions ; relevé ${releve ? (releve.cochee ? 'COCHÉ' : 'décoché') : 'ABSENT'} ; murs ${murs?.cochee ? 'coché' : 'NON'} ; couverture ${couverture?.cochee ? 'cochée' : 'NON'} ; clôture ${cloture?.cochee ? 'cochée' : 'NON'} ; aperçu ${pendantApercu === avant ? 'sans toucher le projet' : 'PROJET MODIFIÉ'} ; « ${toast} » ; écrit ${ecrit} ; Ctrl+Z ${annule === avant ? 'défait tout' : 'RESTE ' + annule} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  63: async (page) => {
    // L'audit de la parcelle, une valeur choisie a la main (lot L11) : la couverture et la couleur
    // des murs reglees dans l'inspecteur ; leurs lignes arrivent decochees et le disent. Cochee a la
    // main, la ligne des murs s'ecrit ; la couverture choisie reste.
    await page.evaluate(() => {
      const m = window.__plan.etat().objects.find((x) => x.key === 'maison');
      m.couleurMurs = { source: 'plan' };
      m.toit = { ...m.toit, couverture: 'tuile' };
    });
    const avant = await etatAudite(page);
    await captureJusquAuxPropositions(page);
    const murs = await ligneProposition(page, 'Matériau des murs de Maison');
    const couverture = await ligneProposition(page, 'Couverture de Maison');
    await page.locator('.ligneProposition', { hasText: 'Matériau des murs de Maison' }).locator('input[type="checkbox"]').check({ timeout: 30000 });
    await page.locator('[data-controle="auditParcelle.valider"]').click({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const e = JSON.parse(await etatAudite(page));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(1500);
    const annule = await etatAudite(page);
    const ok = !!murs && !murs.cochee && /Remplace votre choix : couleur du plan/.test(murs.texte) && !!couverture && !couverture.cochee && /Remplace votre choix : tuiles mécaniques/.test(couverture.texte)
      && e.murs?.materiau === 'brique' && e.murs?.source === undefined && e.couverture === 'tuile' && annule === avant;
    return { ok, mesure: `murs ${murs ? (murs.cochee ? 'COCHÉS' : 'décochés') + ' « ' + (murs.texte.match(/Remplace votre choix : [^.]*/)?.[0] ?? '—') + ' »' : 'ABSENTS'} ; couverture ${couverture ? (couverture.cochee ? 'COCHÉE' : 'décochée') + ' « ' + (couverture.texte.match(/Remplace votre choix : [^.]*/)?.[0] ?? '—') + ' »' : 'ABSENTE'} ; écrit murs ${JSON.stringify(e.murs)}, couverture ${e.couverture} ; Ctrl+Z ${annule === avant ? 'défait tout' : 'RESTE ' + annule}` };
  },
  64: async (page, f) => {
    // Le 100 % protege (lot L12) : la maison marquee « verifiee sur place », Fichier › Actualiser le
    // projet pose sa question avec un point de plus et une case decochee « Recalculer aussi… » ; la
    // case se coche ; Annuler ne touche a rien. Sans batiment verifie, ni point ni case. Rien ne part
    // vers l'IGN : la question seule se joue ici.
    const marquer = (v) => page.evaluate((v) => { const m = window.__plan.etat().objects.find((x) => x.key === 'maison'); if (v) m.verifieSurPlace = { date: '2026-10-13' }; else delete m.verifieSurPlace; }, v);
    const ouvrir = async () => {
      await page.evaluate(() => document.querySelector('[data-commande="projet.actualiser"]').click());
      const boite = page.locator('.dialogueVoile', { hasText: 'Actualiser le projet' });
      await boite.waitFor({ timeout: 10000 });
      return boite;
    };
    await marquer(true);
    const avant = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    const boite = await ouvrir();
    const points = await boite.locator('.dialoguePoints li').allTextContents();
    const point = points.find((t) => /vérifiés sur place/.test(t)) ?? '';
    const caseVerifies = boite.locator('input[data-controle="dialogue.case"]');
    const nCases = await caseVerifies.count();
    const libelle = nCases ? ((await boite.locator('.dialogueCase').textContent()) || '').trim() : '';
    const decochee = nCases ? !(await caseVerifies.isChecked()) : false;
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueBoite')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    if (nCases) await boite.locator('.dialogueCase').click({ timeout: 5000 });
    const cochee = nCases ? await caseVerifies.isChecked() : false;
    await boite.locator('[data-controle="dialogue.secondaire"]').click({ timeout: 5000 });
    await page.waitForTimeout(300);
    const fermee = (await page.locator('.dialogueVoile').count()) === 0;
    const apres = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    // Sans batiment verifie : la question d'avant, sans point de plus ni case.
    await marquer(false);
    const boite2 = await ouvrir();
    const sansCase = (await boite2.locator('input[data-controle="dialogue.case"]').count()) === 0;
    const sansPoint = !(await boite2.locator('.dialoguePoints li').allTextContents()).some((t) => /vérifiés sur place/.test(t));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const ok = nCases === 1 && /Recalculer aussi « Maison », vérifié sur place le 13\/10\/2026/.test(libelle) && decochee && cochee && /Conservés tels quels, sauf si vous cochez la case/.test(point)
      && fermee && apres === avant && sansCase && sansPoint && !deborde;
    return { ok, mesure: `case ${nCases} « ${libelle} », ${decochee ? 'décochée' : 'COCHÉE'} à l'ouverture, ${cochee ? 'cochée' : 'NON COCHÉE'} au clic ; point « ${point.slice(0, 60)}… » ; Annuler : ${fermee ? 'fermé' : 'OUVERT'}, projet ${apres === avant ? 'inchangé' : 'MODIFIÉ'} ; sans bâtiment vérifié : case ${sansCase ? 'absente' : 'PRÉSENTE'}, point ${sansPoint ? 'absent' : 'PRÉSENT'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  57: async (page, f) => {
    // Admin › Consommation de Claude (MD/spec-audit.md 13.3). Les routes `admin/…` sont simulees :
    // session ouverte, un journal de trente jours (Haiku, Sonnet en escalade, trois parcelles), les
    // tarifs livres, des plafonds et le modele de chaque usage. On mesure : rien ne deborde de la page,
    // une couleur et un nom par modele, l'infobulle au survol, le tri, l'export CSV de la vue, la part
    // des reponses vides par modele, l'ajout d'un tarif et le choix du modele de l'analyse.
    const jour = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const lignes = [];
    for (let n = 0; n < 30; n++) {
      for (const [i, idu] of ['78650000AE0101', '78650000AE0102', '78650000AE0103'].entries()) {
        if ((n + i) % 3) continue;
        for (const passe of [1, 2, 3]) {
          lignes.push({ t: jour(n) + 'T0' + passe + ':00:00Z', organisation: 'admin', projet: 'admin', idu, adresse: (i + 2) + ' allée des Limites, Le Vésinet', audit: 'a' + n + i,
            usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, passe, tokens: { entree: 4000, ecritureCache: passe === 1 ? 25000 : 0, ecritureCache1h: 0, lectureCache: passe === 1 ? 0 : 25000, sortie: 1500 },
            images: 30, cout: passe === 1 ? 0.0021375 : 0.0007, statut: n === 4 && passe === 3 ? 'echoue' : 'reussi', idBatch: 'msgbatch_' + n + i,
            trouve: { ouvertures: 0, manquees: 0, enTrop: 0, bouts: 0, lucarnes: 0, elements: 0, ecarts: 0, coins: 0, determines: n % 2, vide: n % 2 === 0 } });
        }
        if (n % 7 === 0) lignes.push({ ...lignes[lignes.length - 1], t: jour(n) + 'T05:00:00Z', usage: 'escalade', modele: 'claude-sonnet-5-5', cout: 0.014, statut: 'reussi', passe: null,
          trouve: { ouvertures: 9, manquees: 1, enTrop: 0, bouts: 2, lucarnes: 1, elements: 1, ecarts: 1, coins: 0, determines: 4, vide: false } });
      }
    }
    const tarifs = JSON.parse(readFileSync(new URL('../deploy/claude-tarifs.json', import.meta.url), 'utf8'));
    let plafonds = { format: 'plan-claude-plafonds', defaut: { jour: 0.02, mois: 10 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.005 };
    let tarifsEnvoyes = null;
    const defaut = { analyse: 'claude-haiku-5-5', escalade: 'claude-haiku-5-5', renfort: 'claude-haiku-5-5', immediat: 'claude-haiku-5-5', candidats: 'claude-haiku-5-5' };
    let modelesEnvoyes = null;
    await page.route(/\/admin\//, async (route) => {
      const req = route.request(), u = new URL(req.url());
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/consommation')) {
        const du = u.searchParams.get('du'), au = u.searchParams.get('au'), modele = u.searchParams.get('modele');
        const periode = lignes.filter((l) => l.t.slice(0, 10) >= du && l.t.slice(0, 10) <= au);
        const auj = jour(0), mois = lignes.filter((l) => l.t.startsWith(auj.slice(0, 7)));
        return json({ format: 'plan-claude-consommation', du, au, aujourdhui: auj, filtres: {},
          lignes: periode.filter((l) => !modele || l.modele === modele), recents: lignes.filter((l) => l.t.slice(0, 10) >= jour(6)),
          organisations: [{ id: 'admin', jour: mois.filter((l) => l.t.startsWith(auj)).reduce((s, l) => s + l.cout, 0), mois: mois.reduce((s, l) => s + l.cout, 0), plafond: plafonds.defaut }],
          choix: { organisations: ['admin'], modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'], usages: ['analyse', 'escalade', 'renfort', 'immediat'],
            parcelles: [...new Map(periode.map((l) => [l.idu, l.adresse]))].map(([idu, adresse]) => ({ idu, adresse })) } });
      }
      if (u.pathname.endsWith('/admin/claude/tarifs')) { if (req.method() === 'PUT') tarifsEnvoyes = JSON.parse(req.postData() || 'null'); return json(tarifsEnvoyes || tarifs); }
      if (u.pathname.endsWith('/admin/claude/plafonds')) { if (req.method() === 'PUT') plafonds = JSON.parse(req.postData() || 'null'); return json(plafonds); }
      if (u.pathname.endsWith('/admin/claude/modeles')) {
        if (req.method() === 'PUT') modelesEnvoyes = JSON.parse(req.postData() || 'null');
        return json({ format: 'plan-claude-modeles', usages: { ...defaut, ...(modelesEnvoyes?.usages ?? {}) }, defaut, admis: ['claude-haiku-5-5', 'claude-sonnet-5-5'], regle: !!modelesEnvoyes });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    // Chaque geste nomme son etape : un echec dit ou il s'est arrete.
    const etape = async (nom, f) => { try { return await f(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await page.goto(BASE + '/?admin&ecran=consommation');
    await page.waitForSelector('.consTuile', { timeout: 20000 });
    await page.waitForSelector('.consAire');
    // Compare a la largeur de l'ecran, pas a innerWidth : un telephone qui dezoome elargit aussi innerWidth.
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    const debords = [await deborde()];
    const legende = await page.locator('.consLegende li').allTextContents();
    const alertes = await page.locator('.consAlertes li').allTextContents();
    // Une couleur differente par modele, prise dans les jetons du theme courant.
    const couleurs = await page.evaluate(() => [...document.querySelectorAll('.consAire')].map((a) => getComputedStyle(a).fill));
    const svg = page.locator('.consSvg');
    // Au doigt comme a la souris : un toucher sur le graphique choisit l'intervalle sous le doigt.
    const b = await svg.boundingBox();
    await svg.click({ position: { x: b.width * 0.5, y: b.height * 0.5 } });
    const infobulle = await page.locator('.consInfobulle').textContent({ timeout: 3000 }).catch(() => '');
    await etape('onglet Par parcelle', () => page.getByRole('tab', { name: 'Par parcelle' }).click({ timeout: 5000 }));
    const premiereAvant = await page.locator('.consTable tbody tr').first().locator('td').nth(1).textContent();
    await etape('tri IDU', () => page.locator('.consTri', { hasText: 'IDU' }).click({ timeout: 5000 }));
    const idus = await page.locator('.consTable tbody tr td:nth-child(2)').allTextContents();
    debords.push(await deborde());
    const [telechargement] = await etape('export CSV', () => Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.getByRole('button', { name: 'Exporter en CSV' }).click({ timeout: 5000 })]));
    const nomCsv = telechargement.suggestedFilename();
    await etape('onglet Par usage', () => page.getByRole('tab', { name: 'Par usage' }).click({ timeout: 5000 }));
    const barres = await page.locator('.consBarre').count();
    await etape('onglet Par modèle', () => page.getByRole('tab', { name: 'Par modèle' }).click({ timeout: 5000 }));
    const vides = await page.locator('.consEtiquette').allTextContents();
    const [csvModeles] = await etape('export CSV des modèles', () => Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.getByRole('button', { name: 'Exporter en CSV' }).click({ timeout: 5000 })]));
    debords.push(await deborde());
    await etape('onglet Par organisation', () => page.getByRole('tab', { name: 'Par organisation' }).click({ timeout: 5000 }));
    const jauges = await page.locator('.consJauge').count();
    debords.push(await deborde());
    await etape('onglet Réglages', () => page.getByRole('tab', { name: 'Réglages' }).click({ timeout: 5000 }));
    await etape('liste du modèle de l’analyse', () => page.waitForSelector('#consModele-analyse', { timeout: 5000 }));
    const optionsAnalyse = await page.locator('#consModele-analyse option').allTextContents();
    await page.selectOption('#consModele-analyse', 'claude-sonnet-5-5');
    await etape('Enregistrer les modèles', () => page.getByRole('button', { name: 'Enregistrer les modèles' }).click({ timeout: 5000 }));
    await page.waitForTimeout(300);
    await etape('formulaire du tarif', () => page.waitForSelector('#consTarif-sortie', { timeout: 5000 }));
    await page.fill('#consTarifDepuis', jour(-30));
    await page.fill('#consTarif-sortie', '0,45');
    await etape('Ajouter ce tarif', () => page.getByRole('button', { name: 'Ajouter ce tarif' }).click({ timeout: 5000 }));
    await page.waitForTimeout(300);
    const ajoute = tarifsEnvoyes?.lignes?.find((l) => l.depuis === jour(-30));
    debords.push(await deborde());
    const ok = !debords.some(Boolean) && legende.join() === 'Claude Haiku 5.5,Claude Sonnet 5.5' && new Set(couleurs).size === 2 && alertes.some((a) => /plafond du jour/.test(a))
      && /Claude Haiku 5\.5/.test(infobulle || '') && idus.length === 3 && [...idus].sort().join() === idus.join() && /^consommation-claude-parcelles-.*\.csv$/.test(nomCsv)
      && barres >= 2 && jauges === 2 && ajoute?.sortie === 0.45
      && vides.length === 2 && /^0 %/.test(vides[1] || '') && /^consommation-claude-modeles-.*\.csv$/.test(csvModeles.suggestedFilename())
      && optionsAnalyse.length === 2 && optionsAnalyse.every((o) => / \$ \/ .* \$/.test(o)) && modelesEnvoyes?.usages?.analyse === 'claude-sonnet-5-5';
    return { ok, mesure: `débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')} ; légende ${legende.join(', ')} ; couleurs ${couleurs.join(' / ')} ; alertes ${alertes.length} ; infobulle « ${(infobulle || '').slice(0, 60)} » ; tri IDU ${premiereAvant} → ${idus.join(', ')} ; CSV ${nomCsv} ; barres ${barres}, jauges ${jauges} ; tarif ajouté ${ajoute ? ajoute.depuis + ' sortie ' + ajoute.sortie : 'NON'} ; réponses vides ${vides.join(' | ')} ; CSV ${csvModeles.suggestedFilename()} ; modèles proposés ${optionsAnalyse.join(' | ')} ; analyse réglée à ${modelesEnvoyes?.usages?.analyse ?? 'RIEN'}` };
  },
  69: async (page, f) => {
    // L'analyse par Claude (lot L17) contre une API simulee : la question de l'accord dans l'ecran des
    // propositions (case « Partager cet audit » cochee par defaut) ; « Envoyer » part en trois passes
    // identiques par `admin/claude/batches`, avec le jeton de la plateforme ; le batch fini, le toast
    // dit que les propositions sont pretes et les lignes de Claude s'ajoutent, decochees, avec leurs
    // indices et la raison ; le projet n'est pas touche.
    const serveur = await simulerAnalyse(page);
    const avant = await etatAudite(page);
    await captureJusquAuxPropositions(page);
    await notesToasts(page);
    const question = await page.locator('.accordAnalyse').count();
    const partage = await page.locator('input[data-controle="auditParcelle.partagerAudit"]').isChecked().catch(() => null);
    const lignesAvant = await page.locator('.ligneProposition').count();
    await page.locator('[data-controle="auditParcelle.accordAnalyse"]').click({ timeout: 30000 });
    await page.locator('.ligneProposition.source-claude').first().waitFor({ timeout: 60000 }).catch(() => {});
    const toasts = await page.evaluate(() => window.__toastsVus);
    const parti = toasts.some((t) => /^Vos photos sont parties à l’analyse par Claude \(accord du /.test(t));
    const pret = toasts.some((t) => /^Les propositions de Claude sont prêtes : 1 bâtiment analysé\.$/.test(t));
    // Le renfort des facades (lot L18) part dans le meme batch, avec ses propres passes et son usage :
    // seules les requetes de la maison doivent etre trois passes identiques.
    const d0 = serveur.demandes[0];
    const d = d0 ? { ...d0, requetes: d0.requetes.filter((r) => !r.usage || r.usage === 'analyse') } : d0;
    const passes = d ? d.requetes.map((r) => r.passe).join(',') : '';
    const identiques = !!d && d.requetes.every((r) => JSON.stringify(r.contenu) === JSON.stringify(d.requetes[0].contenu));
    const images = d ? d.requetes[0].contenu.filter((b) => b.type === 'image').length : 0;
    const facades = d ? d.requetes[0].facades : 0;
    // Sans boussole, la photo n'a pas de prise de vue : pas de rendu du modele. Le texte de la requete
    // le dit a Claude (il citait « le rendu » qu'il n'avait pas), et la personne n'a rien a corriger.
    const sansRenduDit = !!d && d.requetes[0].contenu.some((b) => b.type === 'text' && b.text.includes('Aucun rendu du modèle n’est joint à cette requête'));
    const sansAlerteRendu = !toasts.some((t) => /^Le rendu du modèle n’a pas pu être joint/.test(t));
    const claude = await page.locator('.ligneProposition.source-claude').count();
    const couverture = await ligneProposition(page, 'Couverture de Maison');
    const zinc = await page.locator('.ligneProposition.source-claude', { hasText: 'Zinc' }).first();
    const zincTexte = (await zinc.count()) ? ((await zinc.textContent()) || '').replace(/\s+/g, ' ').trim() : '';
    const zincCoche = (await zinc.count()) ? await zinc.locator('input[type="checkbox"]').isChecked() : null;
    const etat = ((await page.locator('.etatAnalyse').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((x) => x.scrollWidth > x.clientWidth + 1), f.width);
    const apres = await etatAudite(page);
    const ok = question === 1 && partage === true && !!d && passes === '1,2,3' && identiques && images >= 1 && facades === 1 && sansRenduDit && sansAlerteRendu && serveur.jetons.every((j) => j === 'Bearer jeton')
      && parti && pret && claude >= 2 && claude + lignesAvant === (await page.locator('.ligneProposition').count()) && !!couverture
      && /Claude/.test(zincTexte) && /passes d’accord 100 %/.test(zincTexte) && /Taux d’accord de Claude non encore mesuré/.test(zincTexte) && zincCoche === false
      && /^Claude : Propositions de Claude prêtes/.test(etat) && apres === avant && !deborde;
    return { ok, mesure: `question ${question ? 'posée' : 'ABSENTE'}, partage ${partage ? 'coché' : 'DÉCOCHÉ'} ; envoi ${d ? `passes ${passes}, ${identiques ? 'identiques' : 'DIFFÉRENTES'}, ${images} image(s), ${facades} façade(s), ${sansRenduDit ? 'sans rendu, dit à Claude' : 'SANS la mention « aucun rendu »'}${sansAlerteRendu ? '' : ', ALERTE inutile'}, jeton ${serveur.jetons[0] ?? '—'}` : 'AUCUN'} ; toasts ${parti ? 'parti' : 'NON parti'} / ${pret ? 'prêt' : 'NON prêt'} ; ${claude} ligne(s) de Claude (${lignesAvant} des mesures) ; « ${zincTexte.slice(0, 160)} » ${zincCoche ? 'COCHÉE' : 'décochée'} ; « ${etat.slice(0, 80)} » ; projet ${apres === avant ? 'inchangé' : 'MODIFIÉ'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  70: async (page) => {
    // L'analyse par Claude (lot L17), sans accord ou sans reseau, puis le retrait : « Seulement les
    // mesures » n'envoie rien ; « Demander l'analyse » avec un serveur injoignable dit pourquoi et
    // laisse les mesures ; « Relancer » une fois le serveur revenu donne les lignes de Claude ;
    // « Retirer l'accord » les retire, et un second audit du projet repose la question.
    const serveur = await simulerAnalyse(page);
    await captureJusquAuxPropositions(page);
    await notesToasts(page);
    await page.locator('[data-controle="auditParcelle.sansAnalyse"]').click({ timeout: 30000 });
    await page.waitForTimeout(300);
    const refuse = ((await page.locator('.etatAnalyse').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const rienParti = serveur.demandes.length === 0;
    serveur.panne = true;
    await page.locator('[data-controle="auditParcelle.accordAnalyse"]').click({ timeout: 30000 });
    // La preparation (mesures, rendu hors ecran) passe avant l'envoi qui echoue : elle peut durer sous charge.
    await page.locator('.etatAnalyse.etat-erreur').waitFor({ timeout: 90000 }).catch(() => {});
    const erreur = ((await page.locator('.etatAnalyse').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const sansClaude = await page.locator('.ligneProposition.source-claude').count();
    serveur.panne = false;
    await page.locator('[data-controle="auditParcelle.relancerAnalyse"]').click({ timeout: 30000 });
    await page.locator('.ligneProposition.source-claude').first().waitFor({ timeout: 60000 }).catch(() => {});
    const avecClaude = await page.locator('.ligneProposition.source-claude').count();
    await page.locator('[data-controle="auditParcelle.retirerAccord"]').click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const retire = await page.locator('.ligneProposition.source-claude').count();
    const toasts = await page.evaluate(() => window.__toastsVus);
    const toastRetrait = toasts.some((t) => /^Accord retiré pour ce projet/.test(t));
    const garde = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('plan.accordAnalyse.')).length);
    const ok = /Analyse par Claude non demandée : seules les mesures sont proposées\./.test(refuse) && rienParti
      && /Le serveur de l’analyse ne répond pas : seules les mesures sont proposées\./.test(erreur) && sansClaude === 0
      && avecClaude >= 2 && retire === 0 && toastRetrait && garde === 0;
    return { ok, mesure: `« ${refuse.slice(0, 90)} » ; ${rienParti ? 'rien envoyé' : 'ENVOYÉ'} ; panne : « ${erreur.slice(0, 100)} », ${sansClaude} ligne(s) de Claude ; relancé : ${avecClaude} ligne(s) ; retrait : ${retire} ligne(s), toast ${toastRetrait ? 'oui' : 'NON'}, accord gardé ${garde}` };
  },
  65: async (page) => {
    // La fusion de plusieurs vues (lot L13) : deux photos du meme mur, de face puis de biais, une
    // voiture devant ; « Vues du mur entier » les fait fondre au lieu de les mettre cote a cote. Les
    // coins de la seconde sont proposes pour le mur entier ; l'analyse rend la facade, Valider l'ecrit
    // avec le calage des deux vues, un Ctrl+Z la retire.
    const dessiner = async (mur, voiture) => {
      const d = await page.context().newPage();
      await d.setViewportSize({ width: 1600, height: 1200 });
      await d.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1200"></canvas><script>'
        + "const x=document.getElementById('c').getContext('2d');"
        + "x.fillStyle='#9cc3e6';x.fillRect(0,0,1600,1200);x.fillStyle='#6f9a52';x.fillRect(0,880,1600,320);"
        + "const q=(c,p)=>{x.fillStyle=c;x.beginPath();x.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)x.lineTo(p[i],p[i+1]);x.closePath();x.fill();};"
        + `const m=${JSON.stringify(mur)};const v=${JSON.stringify(voiture)};`
        // Un point du mur (u, w en fractions de largeur et de hauteur) sur le quadrilatere du mur.
        + "const P=(u,w)=>{const h=[m[0]+(m[2]-m[0])*u,m[1]+(m[3]-m[1])*u],b=[m[6]+(m[4]-m[6])*u,m[7]+(m[5]-m[7])*u];return [h[0]+(b[0]-h[0])*w,h[1]+(b[1]-h[1])*w];};"
        + "const R=(u0,w0,u1,w1)=>[...P(u0,w0),...P(u1,w0),...P(u1,w1),...P(u0,w1)];"
        + "q('#e4d6bc',m);q('#2b3440',R(0.12,0.2,0.27,0.45));q('#2b3440',R(0.62,0.2,0.77,0.45));q('#5a3a2a',R(0.42,0.6,0.54,1));q('#2b3440',R(0.7,0.6,0.85,0.82));"
        + "x.fillStyle='#1e3c78';x.fillRect(v[0],v[1],v[2],v[3]);"
        + '</script></body>');
      const png = await d.locator('#c').screenshot({ type: 'png' });
      await d.close();
      return png;
    };
    const face = await dessiner([250, 260, 1350, 260, 1350, 1000, 250, 1000], [600, 820, 520, 230]);
    const biais = await dessiner([330, 200, 1250, 300, 1250, 960, 330, 1060], [820, 830, 470, 230]);
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    const facades = () => page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)));
    const avant = await facades();
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: face });
    await page.locator('[data-controle="releve.ajouterPhoto"]').first().click({ timeout: 15000 }); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'biais.png', mimeType: 'image/png', buffer: biais });
    const choix = page.locator('[data-controle="releve.assemblage"]');
    await choix.first().waitFor({ timeout: 15000 });
    const parDefaut = await choix.first().getAttribute('aria-pressed');
    await choix.nth(1).click(); await page.waitForTimeout(400);
    const vues = await choix.nth(1).getAttribute('aria-pressed');
    const consigne = (await page.locator('.releveConsigne').first().textContent())?.trim() ?? '';
    await page.locator('[data-controle="releve.analyser"]').first().click({ timeout: 30000 });
    await page.locator('[data-controle="releve.valider"]').first().waitFor({ timeout: 60000 });
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const ecrit = await page.evaluate(() => window.__plan.etat().objects.filter((o) => o.facades && o.facades.length).map((o) => ({ nom: o.name, vues: o.facades.map((f) => (f.calage?.photos ?? []).filter((p) => p.pxParMSource > 0).length), ouvertures: o.facades.map((f) => f.ouvertures.length) })));
    await annuler(page);
    const retour = (await facades()) === avant;
    const deux = ecrit[0]?.vues?.[0] ?? 0;
    const ok = parDefaut === 'true' && vues === 'true' && /^Vue 2 sur 2 .*mur entier/.test(consigne) && ecrit.length === 1 && deux === 2 && retour;
    return { ok, mesure: `assemblage par défaut : ${parDefaut === 'true' ? 'morceaux' : 'AUTRE'} ; « Vues du mur entier » ${vues === 'true' ? 'choisi' : 'NON choisi'} ; « ${consigne.slice(0, 60)}… » ; écrit : ${ecrit.map((e) => `${e.nom}, ${e.vues.join('/')} vue(s) calée(s), ${e.ouvertures.join('/')} ouverture(s)`).join(' ; ') || 'RIEN'} ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  },
  74: async (page, f) => {
    // Le partage pour le corpus (lot L21, decision D7) : la case « Partager cet audit pour améliorer
    // Plan » est cochee par defaut sur l'ecran des propositions ; rien ne part avant « Valider » ;
    // le fichier `plan-audit-parcelle` part alors, photos et decisions comprises ; decocher le retire
    // du serveur par son secret. Le serveur `admin/audits` est simule.
    const serveur = await simulerAudits(page);
    await captureJusquAuxPropositions(page);
    // La question de l'analyse par Claude (lot L17) porte la meme case tant qu'elle est posee :
    // « Seulement les mesures », et la case du partage parait seule.
    await seulementLesMesures(page);
    const boite = page.locator('.partageAudit');
    const visible = await boite.count();
    const cochee = visible ? await boite.locator('input[data-controle="auditParcelle.partagerCorpus"]').isChecked() : false;
    const note = visible ? ((await boite.locator('.notePartage').textContent()) || '').trim() : '';
    const avantValider = serveur.recus.length;
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await noterToasts(page);
    await page.locator('[data-controle="auditParcelle.valider"]').click({ timeout: 30000 });
    await page.waitForFunction(() => (window.__toastsVus || []).some((t) => /Audit partagé/.test(t)), null, { timeout: 30000 }).catch(() => {});
    const recu = serveur.recus[0];
    const fichier = recu ? JSON.parse(recu.texte) : null;
    const decisions = (fichier?.propositions ?? []).map((p) => p.decision);
    const photos = (fichier?.batiments ?? []).flatMap((b) => b.facades.flatMap((x) => x.photos)).length;
    // On revient sur les propositions : la case dit ce qui est parti ; la decocher le retire. La Vue 3D
    // logicielle tient le fil : l'entree du menu se touche par le DOM, sans attendre qu'elle soit stable.
    await entreeFichier(page, 'audit.parcelle');
    await page.locator('.dialogueAuditParcelle').waitFor({ timeout: 30000 });
    await page.locator('[data-controle="auditParcelle.propositions"]').click({ timeout: 30000 });
    await page.locator('.partageAudit').waitFor({ timeout: 30000 });
    const noteApres = ((await page.locator('.partageAudit .notePartage').textContent()) || '').trim();
    await page.locator('input[data-controle="auditParcelle.partagerCorpus"]').uncheck({ timeout: 30000 });
    await page.waitForFunction(() => (window.__toastsVus || []).some((t) => /Audit retiré/.test(t)), null, { timeout: 30000 }).catch(() => {});
    const retire = serveur.retires[0];
    const decocheeApres = !(await page.locator('input[data-controle="auditParcelle.partagerCorpus"]').isChecked());
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const ok = visible === 1 && cochee && /photos comprises/.test(note) && avantValider === 0 && serveur.recus.length === 1
      && fichier?.format === 'plan-audit-parcelle' && fichier?.version === 1 && !!fichier?.parcelle?.idu && photos >= 1 && decisions.includes('validee')
      && recu.entetes['x-plan-admin'] === '1' && /^Partagé le /.test(noteApres) && retire?.secret === 'secret1' && /\/admin\/audits\/20261013-090000-00000001$/.test(retire?.url || '')
      && decocheeApres && /Audit partagé/.test(await toastVu(page, 'Audit partagé')) && !deborde;
    return { ok, mesure: `case ${visible ? (cochee ? 'cochée' : 'DÉCOCHÉE') : 'ABSENTE'} « ${note.slice(0, 70)}… » ; avant Valider ${avantValider} envoi ; envoyé ${serveur.recus.length} : ${fichier?.format ?? '—'} v${fichier?.version ?? '?'}, parcelle ${fichier?.parcelle?.idu ?? '—'}, ${photos} photo(s), décisions ${decisions.join('/')} ; après : « ${noteApres.slice(0, 40)}… » ; décochée : retrait ${retire ? 'par le secret ' + retire.secret : 'AUCUN'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  75: async (page, f) => {
    // L'import d'un audit de parcelle (lot L21) : un audit valide sur cet appareil, son fichier
    // recupere ; Ctrl+Z ; Fichier › « Importer un audit de parcelle… » : un fichier d'une autre
    // parcelle est refuse et le dit ; celui de la parcelle demande avant de remplacer l'audit en
    // cours, puis rouvre les propositions, cases du fichier, sans rien ecrire avant « Valider ».
    const serveur = await simulerAudits(page);
    const avant = await etatAudite(page);
    await captureJusquAuxPropositions(page);
    await seulementLesMesures(page);
    await noterToasts(page);
    await page.locator('[data-controle="auditParcelle.valider"]').click({ timeout: 30000 });
    await page.waitForFunction(() => (window.__toastsVus || []).some((t) => /Audit partagé/.test(t)), null, { timeout: 30000 }).catch(() => {});
    const texte = serveur.recus[0]?.texte ?? '';
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(1500);
    const defait = (await etatAudite(page)) === avant;
    const importer = async (nom, contenu) => {
      const [choix] = await Promise.all([page.waitForEvent('filechooser', { timeout: 30000 }), entreeFichier(page, 'audit.importerParcelle')]);
      await choix.setFiles({ name: nom, mimeType: 'application/json', buffer: Buffer.from(contenu) });
      await page.waitForTimeout(800);
    };
    const autre = texte ? JSON.stringify({ ...JSON.parse(texte), parcelle: { ...JSON.parse(texte).parcelle, idu: '35238000AB0001' } }) : '{}';
    await importer('autre.json', autre);
    // Le fichier se lit en tache de fond, et la Vue 3D logicielle tient le fil : on attend le toast.
    await page.waitForFunction(() => (window.__toastsVus || []).some((t) => /Import refusé/.test(t)), null, { timeout: 30000 }).catch(() => {});
    const refus = await toastVu(page, 'Import refusé');
    const ouvertApresRefus = await page.locator('.auditPropositions').count();
    await importer('audit.json', texte);
    const question = page.locator('.dialogueVoile', { hasText: 'Remplacer l’audit en cours' });
    // La question attend la lecture du brouillon (IndexedDB) : elle peut venir apres le choix du fichier.
    await question.waitFor({ timeout: 30000 }).catch(() => {});
    const demande = await question.count();
    if (demande) await question.locator('[data-controle="dialogue.principal"]').click({ timeout: 30000 });
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 60000 }).catch(() => {});
    const importe = await toastVu(page, 'Audit de la parcelle importé');
    await seulementLesMesures(page);
    const murs = await ligneProposition(page, 'Matériau des murs de Maison');
    const releve = await ligneProposition(page, 'Façade');
    const caseCorpus = await page.locator('input[data-controle="auditParcelle.partagerCorpus"]').isChecked().catch(() => null);
    const intact = (await etatAudite(page)) === avant;
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await page.locator('[data-controle="auditParcelle.valider"]').click({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const e = JSON.parse(await etatAudite(page));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(1500);
    const annule = (await etatAudite(page)) === avant;
    const ok = !!texte && defait && /^Import refusé : Ce fichier est l’audit de la parcelle 35238000AB0001/.test(refus) && ouvertApresRefus === 0 && demande === 1
      && /Audit de la parcelle importé/.test(importe) && !!murs?.cochee && !!releve && !releve.cochee && caseCorpus === false && intact
      && e.murs?.materiau === 'brique' && annule && !deborde;
    return { ok, mesure: `fichier ${texte ? Math.round(texte.length / 1024) + ' Ko' : 'ABSENT'} ; Ctrl+Z ${defait ? 'défait' : 'NON'} ; autre parcelle : « ${refus.slice(0, 70)}… » ; question de remplacement ${demande ? 'posée' : 'ABSENTE'} ; « ${importe.slice(0, 60)}… » ; murs ${murs ? (murs.cochee ? 'cochés' : 'DÉCOCHÉS') : 'ABSENTS'}, relevé ${releve ? (releve.cochee ? 'COCHÉ' : 'décoché') : 'ABSENT'} ; partage ${caseCorpus === false ? 'décoché' : String(caseCorpus)} ; projet ${intact ? 'intact avant Valider' : 'MODIFIÉ'} ; Valider : murs ${e.murs?.materiau ?? '—'} ; Ctrl+Z ${annule ? 'défait tout' : 'RESTE'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  91: async (page) => {
    // Les arbres d'EZ-tree (MD/spec-arbres-3d.md) : la bibliotheque du serveur est simulee (un chene
    // et un pin, tires des presets d'EZ-tree), la Vue 3D du plan de demonstration dessine ses arbres en
    // instances. On mesure : EZ-tree se charge, des lots `InstancedMesh` existent et couvrent tous les
    // arbres, un caduc perd ses feuilles en janvier et un persistant les garde, le cout du dessin.
    const preset = (n) => JSON.parse(readFileSync('node_modules/@dgreenheck/ez-tree/src/lib/presets/' + n + '.json', 'utf8'));
    const biblio = { format: 'plan-arbres', version: 1, modifieLe: '2026-10-16T08:00:00.000Z', especes: [
      { id: 'chene', nom: 'Chêne', caduc: true, natures: ['feuillu'], hauteurM: 14, diametreM: 10, reglages: preset('oak_small') },
      { id: 'pin', nom: 'Pin', caduc: false, natures: ['conif'], hauteurM: 16, diametreM: 6, reglages: preset('pine_small') }] };
    await page.route('**/admin/arbres', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(biblio) }));
    await page.reload();
    await page.waitForFunction(() => !!window.__plan, null, { timeout: 30000 });
    // Un des arbres du plan prend le pin : deux lots d'essences differentes.
    await page.evaluate(() => { const o = window.__plan.etat().objects.find((x) => x.fonction === 'arbre'); if (o) o.especeArbre = 'pin'; });
    await page.evaluate(() => window.__plan.executer('vue.3d'));
    await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 40000 });
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene.getObjectByName('arbres-lots'), null, { timeout: 60000 }).catch(() => {});
    await image3dStable(page, 3500);
    const lire = () => page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const lots = sc?.scene.getObjectByName('arbres-lots');
      const mailles = lots ? lots.children : [];
      const arbres = [];
      sc?.scene.traverse((o) => { if (o.name === 'arbre') arbres.push(o); });
      const bois = mailles.filter((m) => m.name === 'arbres-branches'), feuilles = mailles.filter((m) => m.name === 'arbres-feuilles');
      sc.renderer.info.reset();
      sc.renderer.render(sc.scene, sc.camera);
      return {
        arbres: arbres.length, lots: bois.length, instances: bois.reduce((n, m) => n + m.count, 0),
        triangles: sc.renderer.info.render.triangles, appels: sc.renderer.info.render.calls,
        feuillesVisibles: feuilles.filter((m) => m.visible).length, feuillesTotal: feuilles.length,
        essences: [...new Set(feuilles.map((m) => m.userData.caduc))].sort().join('/')
      };
    });
    const ete = await lire();
    const changerDate = (d) => page.evaluate((d) => {
      const i = document.querySelector('[data-controle="vue3d.date"]');
      if (!i) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, d);
      i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
    }, d);
    await changerDate('2026-01-15');
    await page.waitForTimeout(500);
    const hiver = await lire();
    await changerDate('2026-06-21');
    const ok = ete.arbres > 0 && ete.lots >= 2 && ete.instances === ete.arbres && ete.feuillesVisibles === ete.feuillesTotal
      && hiver.feuillesTotal === ete.feuillesTotal && hiver.feuillesVisibles > 0 && hiver.feuillesVisibles < hiver.feuillesTotal;
    return { ok, mesure: `${ete.arbres} arbres du plan en ${ete.lots} lots (${ete.instances} instances), ${ete.triangles} triangles et ${ete.appels} appels de dessin en tout ; été : ${ete.feuillesVisibles}/${ete.feuillesTotal} lots de feuilles, hiver : ${hiver.feuillesVisibles}/${hiver.feuillesTotal} (le pin garde les siennes)` };
  },
  92: async (page, f) => {
    // Admin › Arbres (`?admin&ecran=arbres`) : la bibliotheque du serveur est simulee. On mesure : EZ-tree
    // se charge, l'apercu donne ses triangles, une essence s'ajoute depuis un modele, se renomme, et
    // « Enregistrer » envoie un document `plan-arbres` valide avec l'en-tete admin ; rien ne deborde.
    let envoye = null, entete = null;
    const biblio = { format: 'plan-arbres', version: 1, modifieLe: '2026-10-16T08:00:00.000Z', especes: [
      { id: 'chene', nom: 'Chêne', caduc: true, natures: [], hauteurM: 14, diametreM: 10, reglages: JSON.parse(readFileSync('node_modules/@dgreenheck/ez-tree/src/lib/presets/oak_small.json', 'utf8')) }] };
    await page.route('**/admin/**', (route) => {
      const req = route.request(), u = new URL(req.url());
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/palette')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (u.pathname.endsWith('/admin/arbres')) {
        if (req.method() === 'PUT') { envoye = JSON.parse(req.postData() || 'null'); entete = req.headers()['x-plan-admin']; return json({ modifieLe: envoye?.modifieLe ?? null }); }
        return json(biblio);
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await page.goto(BASE + '/?admin&ecran=arbres');
    await etape('liste des essences', () => page.locator('.arbEssence').first().waitFor({ timeout: 20000 }));
    await etape('chiffres de l\'apercu', () => page.locator('.arbChiffres').waitFor({ timeout: 60000 }));
    const triangles = await page.locator('.arbChiffres dd').first().textContent();
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const debords = [await deborde()];
    // Ajouter une essence depuis un modele d'EZ-tree, puis la renommer.
    await etape('modele Pine Small', () => page.locator('#arbPreset').selectOption('Pine Small'));
    await etape('nouvelle essence', () => page.locator('.arbEssence').nth(1).waitFor({ timeout: 5000 }));
    await page.locator('.arbFiche input[type="text"]').first().fill('Pin test');
    await etape('chiffres du pin', () => page.waitForFunction(() => /Pin test/.test(document.querySelector('.arbEssence.actif')?.textContent || ''), null, { timeout: 5000 }));
    await page.waitForTimeout(800);
    const nbEssences = await page.locator('.arbEssence').count();
    debords.push(await deborde());
    await etape('enregistrement', async () => {
      await page.getByRole('button', { name: 'Enregistrer', exact: true }).click({ timeout: 5000 });
      await page.waitForFunction(() => /Bibliothèque enregistrée/.test(document.querySelector('.arbMessage')?.textContent || ''), null, { timeout: 8000 });
    });
    const ids = (envoye?.especes ?? []).map((e) => e.id + ':' + e.caduc);
    const ok = nbEssences === 2 && /^\d/.test(triangles || '') && entete === '1' && envoye?.format === 'plan-arbres' && ids.join() === 'chene:true,pine-petit:false' && envoye?.especes?.[1]?.nom === 'Pin test' && !debords.some(Boolean);
    return { ok, mesure: `${nbEssences} essences, aperçu à ${triangles} triangles ; envoyé : ${ids.join(', ') || 'RIEN'} ; en-tête admin ${entete ?? 'ABSENT'} ; débordement ${debords.some(Boolean) ? 'OUI' : 'non'}` };
  },
  90: async (page, f) => {
    // L'avant et l'apres en deux vues (demande du 15 octobre 2026) : l'ecran des propositions s'ouvre
    // sur « Les deux » ; deux vues de la meme Vue 3D, « Avant » et « Après », a cote de l'ecran (l'une
    // au-dessus de l'autre au telephone) ; elles different tant qu'une case touche un batiment ou la
    // cloture, plus du tout quand tout est decoche ; tourner l'une tourne l'autre ; rien n'est ecrit.
    const avant = await etatAudite(page);
    await captureJusquAuxPropositions(page);
    await page.waitForTimeout(2500);
    const nomClasse = await classe(page);
    const presse = ((await page.locator('button[data-controle="auditParcelle.avantApres"][aria-pressed="true"]').textContent()) || '').trim();
    const etiquettes = await page.locator('.etiquetteDeuxVues').allTextContents();
    const d1 = await lireDeuxVues(page);
    // Les vues et leurs etiquettes evitent l'ecran des propositions.
    const recouvre = await page.evaluate(() => {
      const p = document.querySelector('.auditPropositions')?.getBoundingClientRect();
      const c = document.querySelector('#terrasse3dCanvasHost canvas')?.getBoundingClientRect();
      const v = window.__plan.deuxVues();
      if (!p || !c || !v) return true;
      const coupe = (a) => a.left < p.right - 1 && a.right > p.left + 1 && a.top < p.bottom - 1 && a.bottom > p.top + 1;
      const enFenetre = (r) => ({ left: c.left + r.x, top: c.top + r.y, right: c.left + r.x + r.l, bottom: c.top + r.y + r.h });
      return coupe(enFenetre(v.avant)) || coupe(enFenetre(v.apres)) || [...document.querySelectorAll('.etiquetteDeuxVues')].some((e) => coupe(e.getBoundingClientRect()));
    });
    const sensAttendu = nomClasse === 'compact' ? 'pile' : 'cote';
    // Tourner la vue « Avant » : « Après » tourne avec elle.
    const c = await page.locator('#terrasse3dCanvasHost canvas').boundingBox();
    if (c && d1) await glisser(page, { x: c.x + d1.vues.avant.x + d1.vues.avant.l / 2, y: c.y + d1.vues.avant.y + d1.vues.avant.h / 2 }, Math.min(80, d1.vues.avant.l / 3), 10);
    await page.waitForTimeout(2500);
    const d2 = await lireDeuxVues(page);
    const tourne = d1 && d2 ? ecartImages(d1.image, d2.image) : 0;
    // Tout decocher : les deux vues montrent la meme chose ; recocher les murs : elles different.
    // Une case decochee quitte `:checked` : on decoche toujours la premiere qui reste.
    const cochees = page.locator('.ligneProposition input[type="checkbox"]:checked');
    for (let i = 0; i < 10 && (await cochees.count()); i++) { await cochees.first().click({ timeout: 30000 }); await page.waitForTimeout(300); }
    await page.waitForTimeout(2500);
    const d3 = await lireDeuxVues(page);
    await page.locator('.ligneProposition', { hasText: 'Matériau des murs de Maison' }).locator('input[type="checkbox"]').check({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const d4 = await lireDeuxVues(page);
    const pendant = await etatAudite(page);
    // « Avant » seul ferme les deux vues, « Les deux » les rouvre.
    await page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Avant' }).click({ timeout: 30000 });
    await page.waitForTimeout(800);
    const seule = await page.locator('.etiquetteDeuxVues').count();
    await page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Les deux' }).click({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const rouvertes = await page.locator('.etiquetteDeuxVues').count();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const e = (x) => (x ? x.ecart.toFixed(1) : '—');
    const ok = presse === 'Les deux' && etiquettes.join(',') === 'Avant,Après' && !!d1 && d1.vues.sens === sensAttendu && !recouvre
      && d1.ecart > 1.5 && !!d2 && d2.ecart > 1.5 && tourne > 2 && !!d3 && d3.ecart < 0.5 && !!d4 && d4.ecart > 1
      && pendant === avant && seule === 0 && rouvertes === 2 && !deborde;
    return { ok, mesure: `« ${presse} » ; étiquettes ${etiquettes.join(', ') || 'AUCUNE'} ; vues ${d1 ? d1.vues.sens + ' ' + d1.vues.avant.l + '×' + d1.vues.avant.h : 'ABSENTES'} (attendu ${sensAttendu}) ; ${recouvre ? 'SOUS L’ÉCRAN' : 'à côté de l’écran'} ; écart avant/après ${e(d1)} ; après glisser « Après » bouge de ${tourne.toFixed(1)}, écart ${e(d2)} ; tout décoché ${e(d3)} ; murs recochés ${e(d4)} ; projet ${pendant === avant ? 'intact' : 'MODIFIÉ'} ; « Avant » : ${seule} étiquette(s), « Les deux » : ${rouvertes} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  85: async (page, f) => {
    // La sauvegarde de l'audit de parcelle sur le serveur, et le catalogue de l'administrateur (§15) :
    // une photo rangee part d'elle-meme au serveur simule quelques secondes apres (marque
    // `sauvegarde`) ; la liste de controle dit « Envoyé à … » ; « Envoyer l'audit au serveur » remplace
    // le meme depot (PUT, par son secret). Puis en admin des demos, sur le meme projet : Admin ›
    // « Audits de parcelle » le liste (sauvegarde, capture en cours, 1 photo) et « Ouvrir dans ce
    // projet » le reprend sur la liste de controle, en capture.
    const serveur = await simulerDepotAudits(page);
    const objets = await page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects)));
    await ouvrirAuditParcelle(page);
    await page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 });
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    const dessin = await page.context().newPage();
    await dessin.setContent('<canvas id="c" width="800" height="600"></canvas><script>const x=document.getElementById("c").getContext("2d");x.fillStyle="#e4d6bc";x.fillRect(0,0,800,600);x.fillStyle="#2b3440";x.fillRect(180,220,120,160);</script>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo });
    await page.locator('.rangementAudit').waitFor({ timeout: 10000 }).catch(() => {});
    const posee = Date.now();
    const premier = () => serveur.appels.find((a) => a.methode === 'POST' && a.depot === 'sauvegarde');
    for (let i = 0; i < 60 && !premier(); i++) await page.waitForTimeout(500);
    const delai = premier() ? Math.round((Date.now() - posee) / 1000) : null;
    await page.locator('[data-controle="auditParcelle.liste"]').click({ timeout: 30000 });
    await page.waitForFunction(() => /^Envoyé /.test(document.querySelector('.sauvegardeAudit .noteSauvegarde')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const envoye = ((await page.locator('.sauvegardeAudit .noteSauvegarde').textContent().catch(() => '')) || '').trim();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await page.locator('.sauvegardeAudit [data-commande="audit.envoyerParcelle"]').click({ timeout: 30000 });
    for (let i = 0; i < 60 && !serveur.appels.some((a) => a.methode === 'PUT'); i++) await page.waitForTimeout(500);
    const put = serveur.appels.find((a) => a.methode === 'PUT');
    const id = [...serveur.depots.keys()][0];
    const depots = serveur.depots.size;
    const fiche = serveur.depots.get(id)?.fiche;
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    // L'administrateur des demos, sur le meme projet (la demo 1 en est la copie). Ces routes ne
    // touchent pas `admin/audits` : le faux serveur des audits garde ses depots.
    await page.route(/\/admin\/(session|demos)/, async (route) => {
      const u = new URL(route.request().url());
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/demos')) return json({ demos: [{ id: '1', name: 'Démonstration' }] });
      if (u.pathname.endsWith('/admin/demos/1')) return json({ meta: { id: '1', name: 'Démonstration', schemaVersion: 1 }, objects: objets, measures: [] });
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto(BASE + '/?demofile=1');
    await page.waitForSelector('#stage svg', { timeout: 30000 });
    await page.waitForTimeout(500);
    const garder = page.getByRole('button', { name: 'Garder tel quel' });
    if (await garder.count()) { await garder.click(); await page.waitForTimeout(150); }
    await noterToasts(page);
    await page.evaluate(() => window.__plan.executer('admin.auditsParcelle'));
    await page.locator('.carteAuditRecu').first().waitFor({ timeout: 30000 }).catch(() => {});
    const cartes = await page.locator('.carteAuditRecu').count();
    const carte = ((await page.locator('.carteAuditRecu').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const ouvrir = page.locator('.carteAuditRecu [data-controle="auditsParcelle.ouvrir"]').first();
    const ouvrable = (await ouvrir.count()) ? await ouvrir.isEnabled() : false;
    const debordeCatalogue = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditsParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    if (ouvrable) await ouvrir.click({ timeout: 30000 });
    // Le brouillon de la meme parcelle est sur l'appareil : la question de remplacement d'abord.
    const question = page.locator('.dialogueVoile', { hasText: 'Remplacer l’audit en cours' });
    await question.waitFor({ timeout: 15000 }).catch(() => {});
    if (await question.count()) await question.locator('[data-controle="dialogue.principal"]').click({ timeout: 30000 });
    await page.locator('.dialogueAuditParcelle').waitFor({ timeout: 30000 }).catch(() => {});
    const liste = await page.locator('.dialogueAuditParcelle').count();
    const compteur = ((await page.locator('.dialogueAuditParcelle .compteurAudit').textContent().catch(() => '')) || '').trim();
    const repris = await toastVu(page, 'repris en capture');
    const ok = delai !== null && delai <= 20 && /^Envoyé (le \d\d\/\d\d )?à \d\d:\d\d\./.test(envoye) && !!put && put.id === id && put.retrait === 'secret1' && depots === 1
      && fiche?.marque === 'sauvegarde' && fiche?.phase === 'capture' && fiche?.photos === 1
      && cartes === 1 && /Sauvegarde/.test(carte) && /Capture en cours/.test(carte) && /1 photo/.test(carte) && ouvrable
      && liste === 1 && /^1 façade/.test(compteur) && /^Audit de la parcelle repris en capture : 1 photo/.test(repris) && !deborde && !debordeCatalogue;
    return { ok, mesure: `sauvegarde ${delai !== null ? 'partie en ' + delai + ' s' : 'NON partie'} (« ${envoye.slice(0, 50)} ») ; bouton : ${put ? 'PUT ' + put.id + ' par ' + put.retrait : 'AUCUN remplacement'}, ${depots} dépôt(s) ; fiche ${fiche ? fiche.marque + ', ' + fiche.phase + ', ' + fiche.photos + ' photo(s)' : '—'} ; catalogue ${cartes} carte(s) « ${carte.slice(0, 90)} », ouvrir ${ouvrable ? 'actif' : 'GRISÉ'} ; repris : ${liste ? 'liste de contrôle « ' + compteur.slice(0, 40) + ' »' : 'RIEN'}, « ${repris.slice(0, 60)} » ; débordement ${deborde || debordeCatalogue ? 'OUI' : 'non'}` };
  },
  86: async (page, f) => {
    // Admin › « Audits » (spec-audit 15.4 et 15.5) : un audit de parcelle range sur le serveur simule,
    // avec une analyse gardee ; « Détails » montre les photos et la conclusion (proposition validee) ;
    // « Rejouer l'analyse » avec le modele plus fin part en batch `rejeu` (depot, modele, images du
    // fichier) ; le batch fini, la comparaison montre l'analyse et le rejeu cote a cote ; « Voir »
    // ouvre le rejeu en entier : prompt envoye, image envoyee, reponse brute, sortie remise en forme.
    const objets = await page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects)));
    const parcelle = objets.find((o) => o.cadastre && typeof o.cadastre.idu === 'string');
    const maison = objets.find((o) => o.fonction === 'batiment' && !o.voisinage);
    const idu = parcelle?.cadastre?.idu ?? '';
    const dessin = await page.context().newPage();
    await dessin.setContent('<canvas id="c" width="800" height="600"></canvas><script>const x=document.getElementById("c").getContext("2d");x.fillStyle="#e4d6bc";x.fillRect(0,0,800,600);x.fillStyle="#2b3440";x.fillRect(180,220,120,160);</script>');
    const photo = (await dessin.locator('#c').screenshot({ type: 'jpeg', quality: 70 })).toString('base64');
    await dessin.close();
    const ID = '20261014-090000-0000beef';
    const fichier = JSON.stringify({
      format: 'plan-audit-parcelle', version: 1, parcelle: { idu, adresse: parcelle?.cadastre?.adresse ?? null, origine: null }, code: { version: '2.2.0', commit: null },
      regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-14T08:00:00.000Z', finCapture: '2026-10-14T08:30:00.000Z', ecritLe: '2026-10-14T09:00:00.000Z',
      batiments: [{ cle: maison?.key ?? 'maison', nom: 'Maison', mitoyen: false, cas: null, vu: {}, photos: [], facades: [{ cote: 0, orientation: 'Sud', largeurM: 9, hauteurM: 6, photos: [{ type: 'image/jpeg', base64: photo }], mesure: null }] }],
      cloture: { photos: [] }, portail: { photos: [] },
      propositions: [{ id: 'p1', objet: 'Toit de Maison', avant: 'tuile', apres: 'ardoise', source: 'claude', decision: 'validee', cible: { type: 'batiment', cle: maison?.key ?? 'maison' }, indices: [], confiance: 0.96, remplaceChoix: null, reserve: null, effet: { type: 'couverture', couverture: 'ardoise' } }],
      decisions: [{ t: '2026-10-14T09:00:00.000Z', acceptees: ['p1'], refusees: [], verifies: [] }],
    });
    const tokens = { entree: 3000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 900 };
    const trouve = { ouvertures: 5, manquees: 0, enTrop: 0, bouts: 1, lucarnes: 0, elements: 1, ecarts: 1, coins: 0, determines: 3, vide: false };
    const resultat = (modele) => ({ id: 'b0-p1', passe: 1, usage: 'analyse', modele, statut: 'reussi', arret: 'end_turn', erreur: null, tokens, cout: 0.0025, trouve });
    const resume = (id, nature, modele, etat) => ({ id, audit: ID, nature, etat, creeLe: nature === 'rejeu' ? new Date().toISOString().slice(0, 19) + 'Z' : '2026-10-14T09:10:00Z',
      finLe: etat === 'termine' ? (nature === 'rejeu' ? new Date(Date.now() + 90000).toISOString().slice(0, 19) + 'Z' : '2026-10-14T09:12:00Z') : null, idBatch: nature === 'rejeu' ? 'msgbatch_rejeu' : 'msgbatch_1',
      organisation: 'admin', usage: nature, modele, effort: 'low', prompt: 3, schema: 2, versions: {}, requetes: 3, images: 2, facades: 1, resultats: etat === 'termine' ? [resultat(modele)] : null, cout: etat === 'termine' ? 0.0025 : null, tokens: etat === 'termine' ? tokens : null });
    const s = { demande: null, rejeuFini: false, appels: [] };
    await page.route(/\/admin\/(session|demos|audits|claude)/, async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, json = (corps, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
      s.appels.push(req.method() + ' ' + p);
      if (p.endsWith('/admin/session')) return json({});
      if (p.endsWith('/admin/demos')) return json({ demos: [{ id: '1', name: 'Démonstration' }] });
      if (p.endsWith('/admin/demos/1')) return json({ meta: { id: '1', name: 'Démonstration', schemaVersion: 1 }, objects: objets, measures: [] });
      if (p.endsWith('/admin/audits')) return json({ audits: [{ id: ID, recuLe: '2026-10-14T09:00:00Z', organisation: 'admin', nature: 'parcelle', idu, adresse: parcelle?.cadastre?.adresse ?? null, dossier: 'parcelle/' + idu + '/' + ID, taille: fichier.length, marque: 'corpus', photos: 1, phase: 'analyse', debut: '2026-10-14T08:00:00.000Z', propositions: { total: 1, claude: 1, mesures: 0, validees: 1, refusees: 0, enAttente: 0 } }] });
      if (p.endsWith('/admin/audits/' + ID)) return route.fulfill({ status: 200, contentType: 'application/json', body: fichier });
      if (p.endsWith('/admin/audits/' + ID + '/analyses')) {
        return json({ analyses: [resume('20261014-091000-claude-haiku-5-5-aaaa', 'analyse', 'claude-haiku-5-5', 'termine'), ...(s.demande ? [resume('20261015-120000-claude-sonnet-5-5-bbbb', 'rejeu', 'claude-sonnet-5-5', s.rejeuFini ? 'termine' : 'en_cours')] : [])] });
      }
      if (p.includes('/admin/audits/' + ID + '/analyses/')) {
        const d = s.demande;
        const bloc = (d?.requetes?.[0]?.contenu ?? []).map((b) => (b.type === 'image' ? { type: 'image', media_type: b.source.media_type, image: 'a'.repeat(64) + '.jpg', octets: 1000 } : b));
        return json({ audit: ID, resume: resume('20261015-120000-claude-sonnet-5-5-bbbb', 'rejeu', 'claude-sonnet-5-5', 'termine'),
          entrant: { max_tokens: 8000, effort: 'low', usages: { rejeu: { prompt: 3, schema: 2, systeme: 'Vous regardez une maison. # Forme de la réponse', schemaJson: {} } }, requetes: [{ id: 'b0-p1', passe: 1, usage: 'rejeu', modele: 'claude-sonnet-5-5', facades: 1, images: 1, contenu: bloc }] },
          sortant: { idBatch: 'msgbatch_rejeu', finLe: '2026-10-15T12:01:30Z', resultats: [{ ...resultat('claude-sonnet-5-5'), texte: 'Voici : {"forme":{"valeur":"Deux pans"}}', sortie: { forme: { valeur: 'deux-pans' } }, tarif: '2026-10-01' }] } });
      }
      if (p.includes('/admin/audits/' + ID + '/images/')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from(photo, 'base64') });
      if (p.endsWith('/admin/claude/etat')) return json({ actif: true, modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'], prompt: 3, schema: 2, organisation: 'admin', admin: true });
      if (p.endsWith('/admin/claude/batches') && req.method() === 'POST') { s.demande = JSON.parse(req.postData() || '{}'); return json({ batch: { id: 'msgbatch_rejeu', etat: 'in_progress', compte: null }, modele: s.demande.modele, prompt: 3, schema: 2, trace: '20261015-120000-claude-sonnet-5-5-bbbb' }, 201); }
      if (p.endsWith('/admin/claude/batches/msgbatch_rejeu')) return json({ id: 'msgbatch_rejeu', etat: 'ended', compte: null });
      if (p.endsWith('/admin/claude/batches/msgbatch_rejeu/resultats')) { s.rejeuFini = true; return json({ batch: { id: 'msgbatch_rejeu', etat: 'ended', compte: null }, modele: 'claude-sonnet-5-5', prompt: 3, schema: 2, resultats: [] }); }
      return json({ error: { code: 'NOT_FOUND', message: 'route simulée absente : ' + p } }, 404);
    });
    await page.goto(BASE + '/?demofile=1');
    await page.waitForSelector('#stage svg', { timeout: 30000 });
    await page.waitForTimeout(500);
    const garder = page.getByRole('button', { name: 'Garder tel quel' });
    if (await garder.count()) { await garder.click(); await page.waitForTimeout(150); }
    await noterToasts(page);
    await page.evaluate(() => window.__plan.executer('admin.auditsParcelle'));
    await page.locator('.carteAuditRecu').first().waitFor({ timeout: 30000 }).catch(() => {});
    const titre = ((await page.locator('.dialogueAuditsParcelle .titreParcours').textContent().catch(() => '')) || '').trim();
    const sections = await page.locator('.titreSectionAudits').allTextContents();
    const conclusion = ((await page.locator('.carteAuditRecu .conclusionAuditRecu').first().textContent().catch(() => '')) || '').trim();
    await page.locator('.carteAuditRecu [data-controle="auditsParcelle.details"]').first().click({ timeout: 30000 });
    await page.locator('.carteAuditRecu .tableComparaison').waitFor({ timeout: 30000 }).catch(() => {});
    const vignettes = await page.locator('.carteAuditRecu .vignettesAudit img').count();
    const decision = ((await page.locator('.carteAuditRecu .tableAudit:not(.tableComparaison) tbody tr').first().textContent().catch(() => '')) || '').trim();
    await page.locator('[data-controle="auditsParcelle.modeleRejeu"]').selectOption('claude-sonnet-5-5').catch(() => {});
    const rejouer = page.locator('[data-controle="auditsParcelle.rejouer"]');
    const rejouable = (await rejouer.count()) ? await rejouer.isEnabled() : false;
    const raison = ((await page.locator('.detailAuditRecu .raisonAuditRecu').textContent().catch(() => '')) || '').trim();
    if (rejouable) await rejouer.click({ timeout: 30000 });
    for (let i = 0; i < 120 && !s.demande; i++) await page.waitForTimeout(500);
    await page.waitForFunction(() => document.querySelectorAll('.tableComparaison tbody tr').length >= 2 && !/En cours/.test(document.querySelector('.tableComparaison tbody tr:last-child')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const lignes = await page.locator('.tableComparaison tbody tr').allTextContents();
    const debordeDetail = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditsParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await page.locator('.tableComparaison tbody tr:last-child [data-controle="auditsParcelle.voirAnalyse"]').click({ timeout: 30000 }).catch(() => {});
    await page.locator('.traceAudit').waitFor({ timeout: 30000 }).catch(() => {});
    const trace = ((await page.locator('.traceAudit').textContent().catch(() => '')) || '');
    const imageTrace = await page.locator('.traceAudit .imageTrace').count();
    const debordeTrace = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditsParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const d = s.demande;
    const images = (d?.requetes?.[0]?.contenu ?? []).filter((b) => b.type === 'image').length;
    // L'avant et l'apres de cet audit : le meme ecran des propositions que l'audit, en lecture seule, sur
    // la Vue 3D du projet (deux vues), sans rien changer au projet ; « Retour aux audits » rouvre le catalogue.
    const projetAvant = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    await page.locator('.carteAuditRecu [data-controle="auditsParcelle.avantApres"]').first().click({ timeout: 30000 }).catch(() => {});
    await page.locator('.auditPropositions').waitFor({ timeout: 30000 }).catch(() => {});
    const consultation = ((await page.locator('.auditPropositions .titreParcours').textContent().catch(() => '')) || '').trim();
    const decisionConsultee = ((await page.locator('.auditPropositions .decisionProposition').first().textContent().catch(() => '')) || '').trim();
    const sansValider = (await page.locator('[data-controle="auditParcelle.valider"]').count()) === 0 && (await page.locator('.auditPropositions input[type="checkbox"]:not([disabled])').count()) === 0;
    await page.waitForFunction(() => !!window.__plan.deuxVues(), null, { timeout: 30000 }).catch(() => {});
    const deuxVues = await page.evaluate(() => !!window.__plan.deuxVues());
    const projetIntact = (await page.evaluate(() => JSON.stringify(window.__plan.etat().objects))) === projetAvant;
    await page.locator('[data-controle="auditsParcelle.retour"]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.dialogueAuditsParcelle').waitFor({ timeout: 15000 }).catch(() => {});
    const retourne = (await page.locator('.dialogueAuditsParcelle .carteAuditRecu').count()) === 1;
    const ok = consultation === 'Avant et après : l’audit reçu' && /Validée/.test(decisionConsultee) && sansValider && deuxVues && projetIntact && retourne
      && titre === 'Audits' && sections.length === 2 && /1 proposition .* 1 validée/.test(conclusion) && vignettes >= 1 && /Validée/.test(decision) && rejouable
      && d?.usage === 'rejeu' && d?.depot === ID && d?.modele === 'claude-sonnet-5-5' && d?.requetes?.length === 3 && images >= 1
      && lignes.length === 2 && /Rejeu/.test(lignes[1] ?? '') && /Claude Sonnet 5\.5/.test(lignes[1] ?? '') && !/En cours/.test(lignes[1] ?? '')
      && /Vous regardez une maison/.test(trace) && /Deux pans/.test(trace) && imageTrace >= 1 && !debordeDetail && !debordeTrace;
    return { ok, mesure: `« ${titre} », sections ${sections.join(' / ')} ; conclusion « ${conclusion.slice(0, 70)} » ; ${vignettes} vignette(s), décision « ${decision.slice(0, 50)} » ; rejeu ${rejouable ? 'actif' : 'GRISÉ (' + raison.slice(0, 80) + ')'} ; demande ${d ? d.usage + ', ' + d.modele + ', ' + d.requetes.length + ' requêtes, ' + images + ' image(s), depot ' + d.depot : 'AUCUNE'} ; comparaison ${lignes.length} ligne(s) « ${(lignes[1] ?? '').slice(0, 60)} » ; trace ${/Vous regardez/.test(trace) ? 'entrant' : 'SANS entrant'}, ${/Deux pans/.test(trace) ? 'sortant brut' : 'SANS sortant'}, ${imageTrace} image(s) ; avant/après : « ${consultation} », ${decisionConsultee || 'SANS décision'}, ${sansValider ? 'lecture seule' : 'ÉDITABLE'}, ${deuxVues ? 'deux vues' : 'PAS de deux vues'}, projet ${projetIntact ? 'intact' : 'MODIFIÉ'}, ${retourne ? 'retour aux audits' : 'PAS de retour'} ; débordement ${debordeDetail || debordeTrace ? 'OUI' : 'non'}` };
  },
  67: async (page) => {
    // La structure de la facade dans le releve (lot L15, spec facades §10 a §12) : une facade de trois
    // travees sur deux niveaux, la fenetre d'etage de droite absente ; « Ajouter dans la grille » la pose
    // au croisement libre ; « Meme taille pour la travee » egalise la travee de gauche ; Valider ecrit la
    // grille et les corrections tracees ; un Ctrl+Z retire tout.
    const dessin = await page.context().newPage();
    await dessin.setViewportSize({ width: 1600, height: 1200 });
    await dessin.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1200"></canvas><script>'
      + "const x=document.getElementById('c').getContext('2d');"
      + "x.fillStyle='#9cc3e6';x.fillRect(0,0,1600,1200);x.fillStyle='#6b6b5a';x.fillRect(0,1000,1600,200);"
      + "x.fillStyle='#e8dcc4';x.fillRect(200,250,1200,750);"
      // Rez : deux fenetres et la porte du milieu ; etage : deux fenetres, la gauche plus etroite de 20 cm.
      + "x.fillStyle='#2b3440';x.fillRect(380,700,180,180);x.fillRect(1040,700,180,180);x.fillRect(735,640,150,360);"
      + "x.fillRect(395,370,150,180);x.fillRect(720,370,180,180);"
      + '</script></body>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    const facades = () => page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)));
    const avant = await facades();
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo });
    await page.locator('[data-controle="releve.analyser"]').first().click({ timeout: 15000 });
    await page.locator('[data-controle="releve.valider"]').first().waitFor({ timeout: 30000 });
    const cadres = page.locator('g.releveOuverture:not(.decochee) rect');
    const n0 = await cadres.count();
    const grille = page.locator('[data-controle="releve.ajouterDansGrille"]');
    const grilleActif = await grille.isEnabled();
    if (grilleActif) await grille.click();
    await page.waitForTimeout(200);
    const n1 = await cadres.count();
    const ajoutee = (await page.locator('.releveFiche .releveNote').first().textContent({ timeout: 2000 }).catch(() => '')) ?? '';
    // La fenetre la plus a gauche du rez (la premiere dans l'ordre des x, puis des hauteurs).
    await cadres.first().click({ force: true });
    await page.waitForTimeout(200);
    const taille = page.locator('[data-controle="releve.memeTailleTravee"]');
    const tailleActif = (await taille.count()) > 0 && (await taille.isEnabled());
    if (tailleActif) await taille.click();
    await page.waitForTimeout(200);
    const apresTaille = (await taille.count()) > 0 ? await taille.isEnabled() : null;
    const fiche = ((await page.locator('.releveFiche .releveNote').first().textContent({ timeout: 2000 }).catch(() => '')) ?? '').trim();
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const ecrit = await page.evaluate(() => window.__plan.etat().objects.filter((o) => o.facades && o.facades.length).map((o) => {
      const f = o.facades[o.facades.length - 1];
      return { nom: o.name, ouvertures: f.ouvertures.length, niveaux: f.grille?.niveaux?.length ?? 0, travees: f.grille?.travees?.length ?? 0, gestes: (f.corrections ?? []).map((c) => c.geste), sources: f.ouvertures.map((x) => x.source ?? '—') };
    }));
    await annuler(page);
    const retour = (await facades()) === avant;
    const e = ecrit[0];
    const ok = n0 >= 4 && grilleActif && n1 === n0 + 1 && /Ajoutée par vous/.test(ajoutee) && tailleActif && apresTaille === false && !deborde
      && !!e && e.niveaux === 2 && e.travees === 3 && e.gestes.includes('ajout') && e.gestes.includes('deplacement') && e.sources.includes('ajoutee') && e.sources.includes('corrigee') && retour;
    return { ok, mesure: `${n0} ouverture(s) proposée(s) ; « Ajouter dans la grille » ${grilleActif ? 'actif' : 'GRISÉ'} → ${n1} (« ${ajoutee.trim()} ») ; « Même taille pour la travée » ${tailleActif ? 'actif, puis ' + (apresTaille ? 'TOUJOURS actif' : 'grisé') : 'GRISÉ'} (« ${fiche} ») ; écrit : ${e ? `${e.ouvertures} ouvertures, grille ${e.niveaux} × ${e.travees}, corrections [${e.gestes.join(', ')}], sources [${e.sources.join(', ')}]` : 'RIEN'} ; débordement ${deborde ? 'OUI' : 'non'} ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  },
  93: async (page, f) => {
    // Admin › Règles (`?admin&ecran=regles`, MD/architecture.md §5.2.4) : les huit sujets du depot, le
    // prompt livre a l'octet, puis une edition qui se voit tout de suite dans le prompt (une ligne change,
    // version 8), le brouillon enregistre sur le serveur (simule : enregistrer, relire, retirer), l'onglet
    // « Reglages et faits » (un seuil change sur sa ligne, la ligne de version a ajouter), un sujet retire d'une
    // case, un sujet nouveau en brouillon (prompt, schema, controles), le brouillon qui survit a un rechargement,
    // « Revenir au livre », et les deux telechargements.
    let surServeur = null;
    const json = (route, corps, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
    await page.route(/\/admin\//, (route) => {
      const chemin = new URL(route.request().url()).pathname, methode = route.request().method();
      if (chemin.endsWith('/admin/session')) return json(route, {});
      if (chemin.endsWith('/admin/claude/regles')) {
        if (methode === 'PUT') {
          const d = JSON.parse(route.request().postData() || '{}');
          surServeur = { enregistreLe: '2026-10-16T10:00:00Z', prompt: Number((/version:\s*(\d+)/.exec(d.prompt) || [])[1]), schema: 1, prompt_texte: d.prompt, schema_texte: d.schema, etat: d.etat };
          return json(route, { brouillon: { enregistreLe: surServeur.enregistreLe, prompt: surServeur.prompt, schema: 1 } });
        }
        if (methode === 'DELETE') { surServeur = null; return json(route, { brouillon: null }); }
        return json(route, { brouillon: surServeur });
      }
      return json(route, {}, 404);
    });
    await page.goto(BASE + '/?admin&ecran=regles');
    await page.waitForSelector('.reglSujet', { timeout: 20000 });
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    const debords = [await deborde()];
    const tuiles = async () => (await page.locator('.consTuile').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    const sujets = await page.locator('.reglSujet').count();
    const avant = await tuiles();
    const promptLivre = await page.locator('pre.reglSortie').textContent();
    // Edition : la consigne de la couverture, au clavier.
    await page.locator('[data-sujet="couverture"] button.small').click();
    const champ = page.locator('textarea[aria-label="Consignes (comment répondre) 1"]');
    await champ.fill('- `couverture` : le matériau de couverture du corps principal, vu sur le versant sud.');
    const apresEdition = await tuiles();
    const promptEdite = await page.locator('pre.reglSortie').textContent();
    debords.push(await deborde());
    // Le brouillon sur le serveur : enregistre (version 8, prompt edite), dit, puis retire.
    const etatServeur = async () => ((await page.locator('p[role="status"]').first().textContent()) || '').replace(/\s+/g, ' ');
    const avantServeur = await etatServeur();
    await page.getByRole('button', { name: 'Enregistrer sur le serveur', exact: true }).click();
    await page.waitForFunction(() => /prompt version 8/.test(document.querySelector('p[role="status"]')?.textContent || ''), null, { timeout: 10000 });
    const apresEnregistrement = await etatServeur();
    const gardeAuServeur = !!surServeur && surServeur.prompt === 8 && surServeur.prompt_texte.includes('vu sur le versant sud') && Array.isArray(surServeur.etat?.liste);
    await page.getByRole('button', { name: 'Retirer du serveur', exact: true }).click();
    await page.waitForFunction(() => /Aucun brouillon sur le serveur/.test(document.querySelector('p[role="status"]')?.textContent || ''), null, { timeout: 10000 });
    const retire = surServeur === null;
    // Les reglages et les faits : un seuil change sur sa ligne, l'empreinte change, la ligne de version est donnee.
    await page.locator('#reglVue-donnees').click();
    await page.locator('input[aria-label="Valeur de SEUIL_MARCHE_M"]').fill('0.9');
    const fichierToits = ((await page.locator('[data-fichier="reglagesToits"]').first().textContent()) || '').replace(/\s+/g, ' ');
    const ligneVersion = ((await page.locator('[aria-label="Lignes de version à ajouter"]').textContent()) || '').replace(/\s+/g, ' ');
    const faitsListes = ((await page.locator('[data-fichier="faitsToits"]').textContent()) || '').includes('BATIMENT0000000322509182');
    debords.push(await deborde());
    await page.getByRole('button', { name: 'Revenir au livré', exact: true }).first().click();
    const donneesRevenues = (await page.locator('[aria-label="Lignes de version à ajouter"]').count()) === 0;
    await page.locator('#reglVue-sujets').click();
    // Un sujet retire d'une case.
    await page.locator('[aria-label="Dans le prompt : Cheminées"]').uncheck();
    const sansCheminees = !(await page.locator('pre.reglSortie').textContent())?.includes('- `cheminees`');
    await page.locator('[aria-label="Dans le prompt : Cheminées"]').check();
    // Un sujet nouveau.
    await page.getByRole('button', { name: 'Nouveau sujet', exact: true }).click();
    await page.locator('input[name="id"]').fill('chienAssis');
    await page.locator('input[name="libelle"]').fill('Chiens-assis');
    await page.locator('input[name="question"]').fill('le nombre de chiens-assis vus sur le versant, ou « indetermine »');
    await page.getByRole('button', { name: 'Ajouter en brouillon' }).click();
    const avecNouveau = (await page.locator('pre.reglSortie').textContent())?.includes('- `chienAssis`');
    await page.locator('#reglOnglet-schema').click();
    const dansSchema = (await page.locator('pre.reglSortie').textContent())?.includes('"chienAssis"');
    await page.locator('#reglOnglet-controles').click();
    const controle = (await page.locator('.reglControles li').first().textContent()) || '';
    debords.push(await deborde());
    // Le brouillon survit a un rechargement ; « Revenir au livre » l'efface.
    await page.reload();
    await page.waitForSelector('.reglSujet', { timeout: 20000 });
    const apresRechargement = await page.locator('.reglSujet').count();
    await page.getByRole('button', { name: 'Revenir au livré' }).click();
    const revenu = await tuiles();
    const stocke = await page.evaluate(() => { try { return localStorage.getItem('plan.regles.brouillon'); } catch { return 'illisible'; } });
    // Les deux fichiers, tels que le serveur les lirait.
    const [dl1] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Télécharger le prompt' }).click()]);
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Télécharger le schéma' }).click()]);
    const ok = sujets === 8 && /8 \/ 8/.test(avant[0] || '') && /Identique/.test(avant[4] || '') && (promptLivre || '').includes('# Rôle') && (promptLivre || '').includes('Lire les pignons')
      && /1 ligne change/.test(apresEdition[4] || '') && /version 8/.test(apresEdition[4] || '') && (promptEdite || '').includes('vu sur le versant sud')
      && /Aucun brouillon sur le serveur/.test(avantServeur) && /prompt version 8.*\?regles=local/.test(apresEnregistrement) && gardeAuServeur && retire
      && /1 ligne change/.test(fichierToits) && /L’empreinte passe de/.test(fichierToits) && /LECTURES_TOITS.*version: 4/.test(ligneVersion) && faitsListes && donneesRevenues
      && sansCheminees && avecNouveau === true && dansSchema === true && /^Bon /.test(controle.trim())
      && apresRechargement === 9 && /8 \/ 8/.test(revenu[0] || '') && /Identique/.test(revenu[4] || '') && stocke === null
      && dl1.suggestedFilename() === 'prompt-analyse.md' && dl2.suggestedFilename() === 'schema-analyse.json' && !debords.some(Boolean);
    return { ok, mesure: `${sujets} sujets ; ${avant[1]} ; édition : « ${apresEdition[4]} » ; serveur : « ${avantServeur.slice(0, 30)} » puis « ${apresEnregistrement.slice(0, 48)} », gardé ${gardeAuServeur}, retiré ${retire} ; réglages : « ${fichierToits.slice(fichierToits.indexOf('1 ligne'), fichierToits.indexOf('1 ligne') + 40)} », ${ligneVersion.slice(0, 60)} ; sans cheminées : ${sansCheminees} ; brouillon dans prompt ${avecNouveau}, schéma ${dansSchema}, contrôle « ${controle.trim().slice(0, 40)} » ; après rechargement ${apresRechargement} sujets ; revenu : ${revenu[0]}, ${revenu[4]}, brouillon ${stocke === null ? 'effacé' : 'resté'} ; fichiers ${dl1.suggestedFilename()}, ${dl2.suggestedFilename()} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  76: async (page, f) => {
    // Admin › Conformité (lot G3) : le corpus du depot (deja juge, compile dans la page) et un audit
    // partage recu, rejoue dans la page. On mesure : le taux des deux sources (AE 101 conforme ; la
    // longere d'Hucqueliers, toujours en morceaux, et AE 101 vu en croupes, non : 33 %), le critere
    // de la phase 1, les colonnes a venir (facades, Claude), les axes, les cas ; rien ne deborde.
    await simulerConformite(page);
    await ouvrirConformite(page);
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    const debords = [await deborde()];
    const tuiles = (await page.locator('.consTuile').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    const formes = await page.locator('#confVue tbody tr td:first-child').allTextContents();
    const facades = await page.locator('#confVue tbody tr:first-child td:last-child').textContent();
    await page.getByRole('tab', { name: 'Par région' }).click({ timeout: 5000 });
    const regions = await page.locator('#confVue tbody tr td:first-child').allTextContents();
    await page.getByRole('tab', { name: 'Par problème' }).click({ timeout: 5000 });
    const problemes = await page.locator('#confVue tbody tr td:first-child').allTextContents();
    await page.getByRole('tab', { name: 'Cas', exact: true }).click({ timeout: 5000 });
    const cas = (await page.locator('#confVue tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    debords.push(await deborde());
    await page.getByRole('tab', { name: 'Accord de Claude' }).click({ timeout: 5000 });
    const claude = await page.locator('#confVue tbody tr').count();
    debords.push(await deborde());
    const ok = !debords.some(Boolean) && /33 %/.test(tuiles[0] || '') && /3 \/ 50/.test(tuiles[1] || '') && /À venir/.test(tuiles[4] || '') && /À venir/.test(tuiles[5] || '')
      && formes.includes('Deux pans') && formes.includes('Quatre pans (croupes)') && facades === '—'
      && regions.includes('Yvelines (78)') && regions.includes('Pas-de-Calais (62)') && problemes.includes('Découpé en morceaux')
      && cas.length === 3 && cas.some((t) => /lu deux-pans/.test(t)) && claude === 5;
    return { ok, mesure: `tuiles « ${tuiles.slice(0, 3).join(' | ')} » ; formes ${formes.join(', ')} (façades ${facades}) ; régions ${regions.join(', ')} ; problèmes ${problemes.join(', ')} ; ${cas.length} cas ; Claude ${claude} attributs ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  95: async (page, f) => {
    // Admin › « De l'IGN a ma maison » (`?admin&ecran=chaine`) : le schema des sept etapes, les douze vignettes 3D (gambrel,
    // demi-croupe, meuniere et rampante compris), le filtre par mode qui attenue le reste, un lien vers l'ecran des regles,
    // et le renvoi d'une ligne vers sa cible ; rien ne deborde.
    await page.route(/\/admin\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(BASE + '/?admin&ecran=chaine');
    await page.waitForSelector('.chaineEtape', { timeout: 20000 });
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    const etapes = await page.locator('.chaineSchema a').count();
    const vignettes = await page.locator('svg.chaineVignette').count();
    const nomsVignettes = await page.locator('svg.chaineVignette').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')));
    const polygones = await page.locator('svg.chaineVignette polygon').count();
    const lienRegles = await page.locator('a.chaineEcran[href="?admin&ecran=regles"]').count();
    await page.getByRole('button', { name: /^Manuel/ }).click();
    const attenuees = await page.locator('.chaineLigne[data-attenue="oui"]').count();
    await page.getByRole('button', { name: /^Tout/ }).click();
    const apres = await page.locator('.chaineLigne[data-attenue="oui"]').count();
    const voir = page.locator('a.chaineVoir').first();
    const cible = (await voir.getAttribute('href')) || '';
    const cibleExiste = cible.startsWith('#') && (await page.locator('[id="' + cible.slice(1) + '"]').count()) > 0;
    const sans = !(await deborde());
    const formesVoulues = ['Gambrel', 'Demi-croupe', 'Lucarne meunière', 'Lucarne rampante'].every((m) => nomsVignettes.includes('Vue 3D : ' + m));
    const ok = etapes === 7 && vignettes === 12 && formesVoulues && polygones > 60 && lienRegles >= 1 && attenuees > 0 && apres === 0 && cibleExiste && sans;
    return { ok, mesure: `${etapes} étapes ; ${vignettes} vignettes 3D, ${polygones} facettes ; gambrel, demi-croupe, meunière, rampante ${formesVoulues ? 'présentes' : 'ABSENTES'} ; ${lienRegles} lien(s) vers l’écran des règles ; filtre « Manuel » : ${attenuees} ligne(s) atténuée(s), « Tout » : ${apres} ; renvoi ${cibleExiste ? 'vers sa cible' : 'CASSÉ'} ; débordement ${sans ? 'non' : 'OUI'}` };
  },
  94: async (page, f) => {
    // Admin › Conformité (lot G13) : une facade relevee de 9 m avec deux fenetres seulement, dans un audit recu ;
    // la disposition automatique en pose bien plus, la facade n'est pas conforme. On mesure : la tuile « Conformite des
    // facades » (0 % sur 1 facade), la colonne par region (Yvelines), l'onglet « Facades » (le releve et la disposition
    // cote a cote, « ecart » sur les baies), la mesure rangee qui porte le resume ; rien ne deborde.
    const serveur = await simulerConformite(page, { facade: true });
    await ouvrirConformite(page);
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    const debords = [await deborde()];
    const tuile = ((await page.locator('.consTuile').nth(4).textContent()) || '').replace(/\s+/g, ' ');
    await page.getByRole('tab', { name: 'Par région' }).click({ timeout: 5000 });
    const region = ((await page.locator('#confVue tbody tr', { hasText: 'Yvelines' }).first().textContent()) || '').replace(/\s+/g, ' ');
    await page.getByRole('tab', { name: 'Façades', exact: true }).click({ timeout: 5000 });
    const lignes = (await page.locator('#confVue tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    debords.push(await deborde());
    await page.getByRole('button', { name: /Enregistrer la mesure/ }).click({ timeout: 5000 });
    await page.waitForFunction(() => /Mesure enregistrée/.test(document.querySelector('.confMessage')?.textContent || ''), null, { timeout: 10000 });
    const mesure = serveur.posts[0]?.facades;
    const ok = !debords.some(Boolean) && /0 %/.test(tuile) && /0 conforme sur 1 façade relevée/.test(tuile) && /0 %$/.test(region.trim())
      && lignes.length === 1 && /Non conforme/.test(lignes[0] || '') && /2 \/ \d+ écart/.test(lignes[0] || '')
      && !!mesure && mesure.total === 1 && mesure.conformes === 0 && mesure.baies.tenus === 0;
    return { ok, mesure: `tuile « ${tuile} » ; Yvelines « ${region} » ; ${lignes.length} facade(s) « ${(lignes[0] || '').slice(0, 120)} » ; mesure ${JSON.stringify(mesure && { total: mesure.total, conformes: mesure.conformes })} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  77: async (page, f) => {
    // Admin › Conformité (lot G3) : un audit recu illisible est nomme sans arreter les autres ;
    // « Enregistrer la mesure » range sur le serveur ce que l'ecran montre (toutes sources, facades et
    // Claude a venir), l'historique la montre ; « Relire les audits » relit la liste du serveur.
    const serveur = await simulerConformite(page, { illisible: true });
    await ouvrirConformite(page);
    const alertes = await page.locator('.consAlertes li').allTextContents();
    await page.getByRole('button', { name: 'Enregistrer la mesure' }).click({ timeout: 5000 });
    await page.waitForSelector('.confMessage', { timeout: 5000 });
    const message = await page.locator('.confMessage').textContent();
    const m = serveur.posts[0];
    await page.getByRole('tab', { name: 'Historique' }).click({ timeout: 5000 });
    await page.waitForSelector('#confVue tbody tr', { timeout: 5000 });
    const historique = (await page.locator('#confVue tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    await page.getByRole('button', { name: 'Relire les audits' }).click({ timeout: 5000 });
    await page.waitForFunction(() => /audits? reçus? \(/.test(document.querySelector('.consEtat')?.textContent || ''), null, { timeout: 90000 });
    const ok = alertes.length === 1 && /20261014-110000-0000beef/.test(alertes[0] || '') && /version plus récente/.test(alertes[0] || '')
      && message === 'Mesure enregistrée sur le serveur.' && serveur.posts.length === 1 && m?.format === 'plan-conformite-mesure'
      && m.sources?.corpus === 2 && m.sources?.audits === 1 && m.toits?.conformes === 1 && m.toits?.nonConformes === 2 && m.facades === null && m.claude === null && m.cas?.length === 3
      && historique.length === 1 && /33 %/.test(historique[0] || '') && serveur.listes === 2 && !deborde;
    return { ok, mesure: `alerte « ${(alertes[0] || '').slice(0, 90)} » ; « ${message} » ; mesure ${m ? `${m.format}, corpus ${m.sources?.corpus}, audits ${m.sources?.audits}, ${m.toits?.conformes}/${(m.toits?.conformes ?? 0) + (m.toits?.nonConformes ?? 0)} conformes, façades ${m.facades}, Claude ${m.claude}` : 'AUCUNE'} ; historique « ${(historique[0] || '').slice(0, 80)} » ; relu ${serveur.listes} fois ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  68: async (page) => {
    // La baie devinee en pointille, sur de vraies prises (lot G17, suite du lot L15, spec facades §10.5) :
    // les deux photos de synthese de la scene 19 du banc (une haie haute, presque contre le mur, cache la
    // fenetre de gauche du rez-de-chaussee sur les deux vues). « Vues du mur entier » les fait fondre ; la
    // parallaxe separe la haie du mur, la partie cachee partout finit dans le masque d'occlusion, et la
    // grille y devine une baie, proposee en pointille. Une touche la garde ; Valider l'ecrit avec sa
    // source `devinee` ; un Ctrl+Z retire tout.
    const { vues: [face, biais], coins, largeur, largeurPx } = photosScene('19-vues-haie-haute-baie-cachee');
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    const facades = () => page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)));
    const avant = await facades();
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await choisirMurProche(page, largeur);
    // Les coins vrais de chaque vue, poses au doigt comme le ferait l'utilisateur : la fumee joue la
    // fusion et la grille, pas le calage d'une photo sans EXIF.
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'vue-0.png', mimeType: 'image/png', buffer: face });
    await poserCoins(page, coins[0], largeurPx[0]);
    await page.locator('[data-controle="releve.ajouterPhoto"]').first().click({ timeout: 20000 }); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'vue-1.png', mimeType: 'image/png', buffer: biais });
    const choix = page.locator('[data-controle="releve.assemblage"]');
    await choix.first().waitFor({ timeout: 20000 });
    await choix.nth(1).click(); await page.waitForTimeout(400);
    await poserCoins(page, coins[1], largeurPx[1]);
    await page.locator('[data-controle="releve.analyser"]').first().click({ timeout: 30000 });
    await page.locator('[data-controle="releve.valider"]').first().waitFor({ timeout: 90000 });
    // Les devinees : sures, cochees mais en pointille ; peu sures, decochees, a garder d'une touche.
    const decochees = page.locator('g.releveOuverture.decochee rect[data-controle="releve.garderDevinee"]');
    const cochees = page.locator('g.releveOuverture:not(.decochee) rect');
    const caseGarder = page.locator('input[type="checkbox"][data-controle="releve.garderDevinee"]');
    const nDecochees = await decochees.count();
    const pointilles = page.locator('g.releveOuverture.incertaine:not(.decochee) rect');
    const nPointilles = await pointilles.count();
    // Parmi les pointilles, la devinee : sa fiche porte la case « Garder cette baie devinee ».
    let cochee = false;
    for (let i = 0; i < nPointilles && !cochee; i++) {
      await pointilles.nth(i).click({ force: true }); await page.waitForTimeout(200);
      cochee = (await caseGarder.count()) > 0 && await caseGarder.first().isChecked();
    }
    const c0 = await cochees.count(), d0 = await decochees.count();
    // La case decochee la rend au pointille decoche ; une touche la garde a nouveau.
    if (cochee) { await caseGarder.first().click(); await page.waitForTimeout(250); }
    const c1 = await cochees.count(), d1 = await decochees.count();
    if (d1) { await decochees.first().click({ force: true }); await page.waitForTimeout(250); }
    const c2 = await cochees.count(), d2 = await decochees.count();
    const regardee = (await caseGarder.count()) ? await caseGarder.first().isChecked() : null;
    const aller = cochee ? c1 === c0 - 1 && d1 === d0 + 1 : nDecochees > 0;
    const retourGeste = c2 === c1 + 1 && d2 === d1 - 1 && regardee === true;
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const ecrit = await page.evaluate(() => window.__plan.etat().objects.filter((o) => o.facades && o.facades.length).map((o) => {
      const f = o.facades[o.facades.length - 1];
      return { ouvertures: f.ouvertures.length, sources: f.ouvertures.map((x) => x.source ?? '—'), detail: f.ouvertures.map((x) => `${x.type} ${x.x.toFixed(2)},${x.y.toFixed(2)} ${x.l.toFixed(2)}x${x.h.toFixed(2)} ${x.source ?? '—'} ${x.confiance ?? ''}`), vues: (f.calage?.photos ?? []).filter((p) => p.pxParMSource > 0).length };
    }));
    await annuler(page);
    const retour = (await facades()) === avant;
    const e = ecrit[0];
    const devinees = e ? e.sources.filter((s) => s === 'devinee').length : 0;
    const ok = aller && retourGeste && !!e && e.vues === 2 && devinees >= 1 && !deborde && retour;
    return { ok, mesure: `proposée(s) : ${nDecochees} devinée(s) décochée(s), ${nPointilles} ouverture(s) en pointillé dont ${cochee ? 'une devinée cochée' : 'AUCUNE devinée cochée'} ; case « Garder » décochée : ${c0}/${d0} → ${c1}/${d1} (cochées/décochées) ; une touche : → ${c2}/${d2}, case ${regardee === null ? 'ABSENTE' : regardee ? 'cochée' : 'DÉCOCHÉE'} ; écrit : ${e ? `${e.ouvertures} ouvertures dont ${devinees} devinée(s), ${e.vues} vue(s) calée(s)` : 'RIEN'}${process.env.FUMEE_DETAIL ? ' [' + (e?.detail ?? []).join(' | ') + ']' : ''} ; débordement ${deborde ? 'OUI' : 'non'} ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  },
  80: async (page) => {
    // Les details des ouvertures dans le releve (lot G17) : la photo de synthese de la scene 20 du banc
    // (fenetre en plein cintre, persiennes fermees, balcon, oeil-de-boeuf, garde-corps). La fiche de
    // chaque ouverture dit ce qui a ete reconnu ; Valider ecrit les details avec le releve ; un Ctrl+Z
    // retire tout.
    const { avant, mur } = await releverScene(page, '20-details-cintres-persiennes-garde-corps');
    const cochees = page.locator('g.releveOuverture:not(.decochee) rect');
    const n = await cochees.count();
    const fiches = [];
    for (let i = 0; i < n; i++) {
      // Au telephone, la fiche ouverte pousse l'elevation vers le haut de la colonne : on la ramene a
      // l'ecran, et l'on referme d'un toucher les notifications qui la couvriraient.
      for (const t of await page.locator('.toast').all()) await t.click({ timeout: 1000 }).catch(() => {});
      await cochees.nth(i).scrollIntoViewIfNeeded();
      await cochees.nth(i).click({ force: true }); await page.waitForTimeout(150);
      fiches.push(((await page.locator('.releveFiche').first().textContent({ timeout: 2000 }).catch(() => '')) ?? '').replace(/\s+/g, ' '));
    }
    // Le haut cintre et les persiennes fermees sont lus a coup sur ; l'oeil-de-boeuf, petite baie ronde,
    // l'est au banc mais pas toujours ici (mur de la maison un peu plus large, coins poses au pixel pres) :
    // il est dit, sans etre exige.
    const lus = ['haut cintré', 'persiennes fermées', 'œil-de-bœuf'].map((t) => [t, fiches.some((f) => f.toLowerCase().includes(t))]);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const ecrites = await page.evaluate(() => window.__plan.etat().objects.filter((o) => o.facades && o.facades.length).flatMap((o) => o.facades.at(-1).ouvertures.map((x) => ({ d: x.details, t: `${x.type} ${x.x.toFixed(2)},${x.y.toFixed(2)} ${x.l.toFixed(2)}x${x.h.toFixed(2)} ${JSON.stringify(x.details ?? {})}` }))));
    const details = ecrites.map((x) => x.d).filter(Boolean);
    await annuler(page);
    const retour = (await page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)))) === avant;
    const formes = details.map((d) => d.forme).filter((f) => f === 'cintre' || f === 'rond').length;
    const ok = lus.slice(0, 2).every(([, v]) => v) && formes >= 1 && details.some((d) => d.forme === 'cintre') && details.some((d) => d.volets === 'persiennes') && !deborde && retour;
    return { ok, mesure: `mur de ${mur ?? '?'} m, ${n} ouverture(s) ; fiches : ${lus.map(([t, v]) => `« ${t} » ${v ? 'lu' : 'ABSENT'}`).join(', ')} ; écrit : ${details.length} ouverture(s) détaillée(s), ${formes} forme(s) cintrée ou ronde${process.env.FUMEE_DETAIL ? ' [' + ecrites.map((x) => x.t).join(' | ') + ']' : ''} ; débordement ${deborde ? 'OUI' : 'non'} ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  },
  81: async (page) => {
    // Les details des ouvertures en 3D (lot G17, three/detailsOuvertures.ts) : le releve de la scene 20
    // valide, la Vue 3D pose une maille de details (les persiennes fermees) et l'encadrement de la baie
    // cintree (et de l'oeil-de-boeuf quand il est lu) ; une maison sans details n'en a aucune (empreinte
    // du GLB, point 24).
    const compter = () => page.evaluate(() => {
      const n = { details: 0, formes: 0, quads: 0 };
      window.__plan.scene3d()?.scene.traverse((o) => {
        if (o.name === 'batiment-details-ouvertures') { n.details++; n.quads += (o.geometry.index?.count ?? 0) / 6; }
        if (o.name === 'releve-ouverture-forme') n.formes++;
      });
      return n;
    });
    const avantVue = await POINTS[22](page);
    if (!avantVue.ok) return { ok: avantVue.ok, mesure: 'vue 3D préalable : ' + avantVue.mesure };
    const sans = await compter();
    await page.evaluate(() => window.__plan.executer('vue.plan')); await page.waitForTimeout(400);
    const { avant } = await releverScene(page, '20-details-cintres-persiennes-garde-corps');
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__plan.executer('vue.3d'));
    await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 40000 });
    await image3dStable(page, 3500);
    const avec = await compter();
    if (process.env.FUMEE_CAPTURE_3D) {
      // Pour l'oeil : la camera devant le mur releve, a quelques metres (hors mesure).
      await page.evaluate(() => {
        const v = window.__plan.scene3d();
        const m = v.scene.getObjectByName('releve-ouverture-forme') ?? v.scene.getObjectByName('batiment-details-ouvertures');
        if (!m) return;
        const p = m.geometry.attributes.position.array;
        const a = new THREE.Vector3(p[0], p[1], p[2]), b = new THREE.Vector3(p[3], p[4], p[5]), c = new THREE.Vector3(p[6], p[7], p[8]);
        const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        n.y = 0; n.normalize();
        const centre = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        centre.x += 0; centre.y = 3;
        const lateral = new THREE.Vector3(-n.z, 0, n.x);
        v.camera.position.copy(centre.clone().add(n.clone().multiplyScalar(11)).add(lateral.multiplyScalar(4)).add(new THREE.Vector3(0, 1.5, 0)));
        v.controls.target.copy(centre.clone().add(new THREE.Vector3(-n.z, 0, n.x).multiplyScalar(-2)));
        v.controls.update();
        v.renderer.render(v.scene, v.camera);
      });
      await page.waitForTimeout(800);
      await page.locator('#terrasse3dCanvasHost canvas').screenshot({ path: process.env.FUMEE_CAPTURE_3D });
    }
    await page.evaluate(() => window.__plan.executer('vue.plan')); await page.waitForTimeout(400);
    await annuler(page);
    const retour = (await page.evaluate(() => JSON.stringify(window.__plan.etat().objects.map((o) => o.facades || null)))) === avant;
    const ok = sans.details === 0 && sans.formes === 0 && avec.details >= 1 && avec.formes >= 1 && retour;
    return { ok, mesure: `avant le relevé : ${sans.details} maille(s) de détails, ${sans.formes} encadrement(s) de forme ; après : ${avec.details} maille(s) de détails (${avec.quads} quads), ${avec.formes} encadrement(s) cintré ou rond ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  },
  71: async (page) => {
    // L'aide de Claude au releve (lot L18, spec facades §12 bis) : une photo sans aucune arete (un ciel en
    // degrade) laisse les quatre coins predits ; « Demander de l'aide » n'est propose que
    // sur ce signal ; le premier appel demande l'accord ; l'envoi part en trois passes par
    // `admin/claude/messages` (usage renfort, la photo et sa grille, jeton de la plateforme) ; les
    // graines que rien ne soutient sont rejetees, et la note le dit ; un coin ne change que s'il etait
    // predit, et devient « proposé par Claude ».
    const recues = [];
    const graines = { indices: [{ image: 1, vu: 'égout et pied' }], hautGauche: { colonne: 2, ligne: 3 }, hautDroit: { colonne: 8, ligne: 3 }, basDroit: { colonne: 8, ligne: 7.2 }, basGauche: { colonne: 2, ligne: 7.2 } };
    const sortie = { mur: { indices: [], vu: 'attendu' }, coins: graines, ouvertures: [], manquees: [], confiance: 'moyenne' };
    await page.route(/\/admin\/claude\/messages$/, async (route) => {
      const req = route.request();
      const d = JSON.parse(req.postData() || 'null');
      recues.push({ d, jeton: req.headers().authorization ?? '' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: d.requetes.map((q) => ({ id: q.id, statut: 'reussi', passe: q.passe, usage: 'renfort', sortie, erreur: null })) }) });
    });
    const dessin = await page.context().newPage();
    await dessin.setViewportSize({ width: 1600, height: 1200 });
    await dessin.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1200"></canvas><script>'
      + "const x=document.getElementById('c').getContext('2d');"
      // Un ciel en degrade doux, sans aucune arete : rien sur quoi caler les coins.
      + "const g=x.createRadialGradient(800,500,50,800,600,1100);g.addColorStop(0,'#c9dcef');g.addColorStop(1,'#7fa8cf');x.fillStyle=g;x.fillRect(0,0,1600,1200);"
      + '</script></body>');
    const photo = await dessin.locator('#c').screenshot({ type: 'png' });
    await dessin.close();
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'ciel.png', mimeType: 'image/png', buffer: photo });
    await page.locator('.releveNote', { hasText: /trouvés? sur la photo|pas été trouvés/ }).first().waitFor({ timeout: 20000 });
    const classes = () => page.locator('circle.releveCoinCible').evaluateAll((cs) => cs.map((c) => c.getAttribute('class')?.replace('releveCoinCible', '').trim() || ''));
    const avant = await classes();
    const bouton = page.locator('[data-controle="releve.demanderAide"]');
    const propose = await bouton.count();
    const note = ((await page.locator('.releveAide .releveNote').first().textContent({ timeout: 2000 }).catch(() => '')) || '').trim();
    if (propose) await bouton.first().click();
    const accord = page.locator('[data-controle="releve.accorderAide"]');
    const demandeAccord = await accord.count();
    if (demandeAccord) await accord.first().click();
    await page.locator('.releveAide [role="status"]').first().waitFor({ timeout: 30000 }).catch(() => {});
    const message = ((await page.locator('.releveAide [role="status"]').first().textContent().catch(() => '')) || '').trim();
    const apres = await classes();
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.unroute(/\/admin\/claude\/messages$/);
    const d = recues[0]?.d;
    const images = d ? d.requetes[0].contenu.filter((b) => b.type === 'image').length : 0;
    const coinsOk = apres.length === 4 && apres.every((c, k) => c === avant[k] || (avant[k] === 'predit' && c === 'claude'));
    const ok = avant.every((c) => c === 'predit') && propose === 1 && /coins non trouvés/.test(note) && demandeAccord === 1 && recues.length === 1
      && d?.usage === 'renfort' && d.requetes.length === 3 && d.requetes.every((q) => q.usage === 'renfort') && images === 1 && /^Bearer /.test(recues[0].jeton)
      && /^Claude (a proposé|n’a situé aucun coin)/.test(message) && coinsOk && !deborde;
    return { ok, mesure: `coins ${avant.join(', ')} ; aide ${propose ? 'proposée' : 'ABSENTE'} (« ${note.slice(0, 70)}… ») ; accord ${demandeAccord ? 'demandé' : 'PAS demandé'} ; envoi : ${recues.length} appel(s), ${d ? d.requetes.length + ' passe(s) ' + d.usage + ', ' + images + ' image(s), jeton ' + (/^Bearer /.test(recues[0].jeton) ? 'oui' : 'NON') : 'RIEN'} ; « ${message.slice(0, 90)} » ; coins après : ${apres.join(', ')} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  73: async (page) => {
    // L'essai des faits des toits (lot L20, `?regles=local`, MD/spec-regles-toits.md §9.2) : l'entree
    // du menu Admin n'existe qu'avec `?regles=local` ; un fichier de faits se charge depuis le poste,
    // les batiments touches sont rendus a relire, rien n'est enregistre ni marque « modifie » ; un
    // fichier abime est refuse avec sa raison.
    const sansEssai = await page.locator('[data-commande="admin.faitsLocaux"]').count();
    // Recharge : la plateforme simulee rouvre le plan de demonstration deja cree.
    await page.goto(BASE + '/?regles=local');
    await page.waitForSelector('#stage svg', { timeout: 30000 });
    await page.waitForTimeout(300);
    const garder = page.getByRole('button', { name: 'Garder tel quel' });
    if (await garder.count()) { await garder.click(); await page.waitForTimeout(150); }
    const avecEssai = await page.locator('[data-commande="admin.faitsLocaux"]').count();
    const cle = 'BATIMENT0000000322509179';
    const lu = () => page.evaluate((k) => window.__plan.etat().objects.find((o) => o.bdtopo?.cleabs === k)?.toitLidarLu ?? null, cle);
    const sale = () => page.evaluate(() => !!window.__plan.etat().dirty);
    const [luAvant, saleAvant] = [await lu(), await sale()];
    const charger = async (nom, contenu) => {
      const [choix] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.evaluate(() => window.__plan.executer('admin.faitsLocaux'))]);
      await choix.setFiles({ name: nom, mimeType: 'application/json', buffer: Buffer.from(contenu) });
      await page.waitForTimeout(500);
    };
    await charger('faits.json', JSON.stringify({ format: 'plan-faits-toits', version: 1, faits: { [cle]: { observation: { forme: 'croupes' } } } }));
    const toast = (await page.locator('.toast', { hasText: /Faits d’essai chargés/ }).first().textContent({ timeout: 3000 }).catch(() => '')) ?? '';
    const [luApres, saleApres] = [await lu(), await sale()];
    await charger('abime.json', JSON.stringify({ format: 'plan-faits-toits', faits: { [cle]: { observation: { forme: 'mansart' } } } }));
    const refus = (await page.locator('body').textContent())?.match(/Faits refusés : .{0,160}?(forme|format)/)?.[0] ?? '';
    const ok = sansEssai === 0 && avecEssai === 1 && /1 fait\(s\), 1 bâtiment/.test(toast) && luApres === null && saleApres === saleAvant && /forme/.test(refus);
    return { ok, mesure: `entrée sans essai : ${sansEssai}, avec ?regles=local : ${avecEssai} ; « ${toast.trim().slice(0, 70)}… » ; bâtiment touché : marque ${luAvant} → ${luApres} ; projet modifié ${saleAvant ? 'oui' : 'non'} → ${saleApres ? 'oui' : 'non'} ; refus : « ${refus.slice(0, 80)} »` };
  },
  82: async (page) => {
    // Le masque d'occlusion hachure (lot G20, spec facades §8) : deux vues du meme mur, une
    // camionnette vitree devant qui se deplace d'une vue a l'autre sans jamais degager le milieu du
    // mur ; « Vues du mur entier », Analyser. La part cachee sur les deux vues se hachure dans
    // l'elevation, avec sa legende ; « Demander de l'aide » est propose (avant G20, jamais sur
    // plusieurs photos), en disant la part cachee ; l'envoi porte la photo de reference et l'elevation
    // (route `admin/claude/messages` simulee).
    const recues = [];
    const sortie = { mur: { indices: [], vu: 'attendu' }, coins: { indices: [], hautGauche: 'indetermine', hautDroit: 'indetermine', basDroit: 'indetermine', basGauche: 'indetermine' }, ouvertures: [], manquees: [], confiance: 'moyenne' };
    await page.route(/\/admin\/claude\/messages$/, async (route) => {
      const d = JSON.parse(route.request().postData() || 'null');
      recues.push(d);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: d.requetes.map((q) => ({ id: q.id, statut: 'reussi', passe: q.passe, usage: 'renfort', sortie, erreur: null })) }) });
    });
    const dessiner = async (mur, camion) => {
      const d = await page.context().newPage();
      await d.setViewportSize({ width: 1600, height: 1200 });
      await d.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1200"></canvas><script>'
        + "const x=document.getElementById('c').getContext('2d');"
        + "x.fillStyle='#9cc3e6';x.fillRect(0,0,1600,1200);x.fillStyle='#6f9a52';x.fillRect(0,880,1600,320);"
        + "const q=(c,p)=>{x.fillStyle=c;x.beginPath();x.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)x.lineTo(p[i],p[i+1]);x.closePath();x.fill();};"
        + `const m=${JSON.stringify(mur)};const v=${JSON.stringify(camion)};`
        + "const P=(u,w)=>{const h=[m[0]+(m[2]-m[0])*u,m[1]+(m[3]-m[1])*u],b=[m[6]+(m[4]-m[6])*u,m[7]+(m[5]-m[7])*u];return [h[0]+(b[0]-h[0])*w,h[1]+(b[1]-h[1])*w];};"
        + "const R=(u0,w0,u1,w1)=>[...P(u0,w0),...P(u1,w0),...P(u1,w1),...P(u0,w1)];"
        + "q('#e4d6bc',m);q('#2b3440',R(0.12,0.2,0.27,0.45));q('#2b3440',R(0.62,0.2,0.77,0.45));q('#5a3a2a',R(0.42,0.6,0.54,1));q('#2b3440',R(0.7,0.6,0.85,0.82));"
        // La camionnette et ses deux vitres : leurs bords trahissent le recul d'une vue a l'autre.
        + "x.fillStyle='#1e3c78';x.fillRect(v[0],v[1],700,420);x.fillStyle='#cfe3f2';x.fillRect(v[0]+80,v[1]+40,160,110);x.fillRect(v[0]+420,v[1]+40,160,110);"
        + '</script></body>');
      const png = await d.locator('#c').screenshot({ type: 'png' });
      await d.close();
      return png;
    };
    const face = await dessiner([250, 260, 1350, 260, 1350, 1000, 250, 1000], [400, 620]);
    const biais = await dessiner([330, 200, 1250, 300, 1250, 960, 330, 1060], [620, 640]);
    await selectionner(page, "o.fonction === 'batiment' || /maison/i.test(o.name)");
    await page.evaluate(() => window.__plan.executer('facade.relever')); await page.waitForTimeout(600);
    await page.locator('[data-controle="releve.choisirMur"]').first().click(); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: face });
    await page.locator('[data-controle="releve.ajouterPhoto"]').first().click({ timeout: 15000 }); await page.waitForTimeout(600);
    await page.locator('input[data-controle="releve.importerPhoto"]').first().setInputFiles({ name: 'biais.png', mimeType: 'image/png', buffer: biais });
    const choix = page.locator('[data-controle="releve.assemblage"]');
    await choix.first().waitFor({ timeout: 15000 });
    await choix.nth(1).click(); await page.waitForTimeout(400);
    // Les coins se posent au doigt sur chaque vue, comme la personne le ferait : le calage fin de ces
    // dessins (sans perspective vraie) n'est pas ce que ce point mesure.
    await page.locator('.releveNote', { hasText: /trouvés? sur la photo|pas été trouvés/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const poser = async (quad) => {
      const svg = page.locator('svg.releveCoins').first();
      await svg.scrollIntoViewIfNeeded();
      for (let k = 0; k < 4; k++) {
        const cible = await svg.evaluate((s, [x, y]) => { const p = s.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(s.getScreenCTM()); return { x: q.x, y: q.y }; }, [quad[2 * k], quad[2 * k + 1]]);
        const b = await page.locator('circle.releveCoinCible').nth(k).boundingBox();
        if (!b) continue;
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        await page.mouse.move(cible.x, cible.y, { steps: 4 });
        await page.mouse.up();
      }
    };
    await poser([330, 200, 1250, 300, 1250, 960, 330, 1060]);
    await page.locator('.releveVignette').first().click(); await page.waitForTimeout(500);
    await poser([250, 260, 1350, 260, 1350, 1000, 250, 1000]);
    const auDoigt = await page.locator('circle.releveCoinCible.doigt').count();
    await page.locator('[data-controle="releve.analyser"]').first().click({ timeout: 30000 });
    await page.locator('[data-controle="releve.valider"]').first().waitFor({ timeout: 60000 });
    const chemins = await page.locator('g.releveMasque path').evaluateAll((ps) => ps.map((p) => (p.getAttribute('d') || '').split('M').length - 1));
    // Le trait du hachure lit son jeton : une couleur resolue dans les deux themes, pas « none ».
    const trait = await page.locator('g.releveMasque .releveMasqueTrait').first().evaluate((l) => getComputedStyle(l).stroke).catch(() => 'absent');
    const legende = ((await page.locator('.releveLegendeMasque').first().textContent({ timeout: 2000 }).catch(() => '')) || '').trim();
    const bouton = page.locator('[data-controle="releve.demanderAide"]');
    const propose = await bouton.count();
    const note = ((await page.locator('.releveAide .releveNote').first().textContent({ timeout: 2000 }).catch(() => '')) || '').trim();
    if (propose) await bouton.first().click();
    const accord = page.locator('[data-controle="releve.accorderAide"]');
    if (await accord.count()) await accord.first().click();
    await page.locator('.releveAide [role="status"]').first().waitFor({ timeout: 30000 }).catch(() => {});
    const message = ((await page.locator('.releveAide [role="status"]').first().textContent().catch(() => '')) || '').trim();
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.unroute(/\/admin\/claude\/messages$/);
    const d = recues[0];
    const images = d ? d.requetes[0].contenu.filter((b) => b.type === 'image').length : 0;
    const zones = chemins[1] ?? 0;
    const ok = chemins.length === 2 && zones >= 1 && !!trait && trait !== 'none' && trait !== 'absent'
      && /^Hachuré : caché sur toutes les photos .*\d+ % du mur\.$/.test(legende) && propose === 1 && /\d+ % du mur caché sur toutes les photos/.test(note)
      && recues.length === 1 && d.usage === 'renfort' && d.requetes.length === 3 && images === 2 && /^Claude (propose|confirme)/.test(message) && !deborde;
    return { ok, mesure: `coins au doigt ${auDoigt}/4 ; hachure : ${zones} zone(s), trait ${trait} ; « ${legende.slice(0, 90)} » ; aide ${propose ? 'proposée' : 'ABSENTE'} (« ${note.slice(0, 80)}… ») ; envoi : ${recues.length} appel(s), ${d ? d.requetes.length + ' passe(s), ' + images + ' image(s)' : 'RIEN'} ; « ${message.slice(0, 70)} » ; débordement ${deborde ? 'OUI' : 'non'}` };
  }
};

/** Quels points se jouent dans quelle classe : les 25 d'origine partout, ceux du mobile au telephone, les garde-fous et le releve sans camera (49 a 54, 57 a 59, 65), l'audit de la parcelle (60, 61). */
function pointsPour(nomClasse) {
  const base = [...Array(25).keys()].map((i) => i + 1);
  const mobile = nomClasse === 'compact' ? [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39] : [];
  // Les garde-fous de l'inspecteur partout ; la decouverte une fois, elle parcourt deja les trois classes.
  // 57 : le tableau de bord de la consommation de Claude ; 58 : le calage fin d'une facade (lot L7) ;
  // 59 : la distorsion du grand-angle (lot L8) ; 60 et 61 : l'audit de la parcelle, liste et prise (lot L9) ;
  // 62 et 63 : ses propositions, l'apercu avant / apres, la validation et Ctrl+Z (lot L11).
  // 59 : la distorsion du grand-angle (lot L8) ; 65 : la fusion de plusieurs vues (lot L13) ;
  // 73 : l'essai des faits des toits (lot L20).
  // 65 : la fusion de plusieurs vues (lot L13) ; 64 : le batiment verifie sur place protege de
  // l'actualisation (lot L12).
  // 67 : la structure de la facade dans le releve, ses gestes et ses corrections tracees (lot L15).
  // 68 : la baie devinee en pointille, sur les deux vues de synthese d'une scene du banc (lot G17).
  // 80 et 81 : les details des ouvertures, dans le releve puis en 3D (lot G17).
  // 69 et 70 : l'analyse par Claude, accord et propositions (lot L17).
  // 71 : l'aide de Claude au releve, proposee sur signal, accord, appel immediat (lot L18).
  // 74 et 75 : le fichier de l'audit de parcelle, partage et import (lot L21).
  // 76 et 77 : l'ecran Admin › Conformité, indicateurs et mesure rangee (lot G3).
  // 82 : le masque d'occlusion hachure, et l'aide de Claude sur plusieurs vues (lot G20).
  // 84 : la vue a hauteur d'homme de « Photographier en marchant », qui suit la boussole ; facades rouge et vertes, facade touchee.
  // 85 : la sauvegarde de l'audit de parcelle sur le serveur, et Admin › Audits qui la rouvre (§15).
  // 86 : Admin › Audits : donnees, conclusion, analyses cote a cote, rejeu par modele et son detail (§15.4, §15.5).
  // 88 : la vue epuree et la vue d'ensemble de l'audit de parcelle ; les propositions laissent voir la maison.
  // 89 : le trait renforce de la facade, de pres.
  // 90 : l'avant et l'apres des propositions en deux vues de la Vue 3D, synchronisees.
  // 91 et 92 : les arbres d'EZ-tree en instances, et Admin › Arbres.
  // 93 : Admin › Regles : les sujets de l'audit, le prompt et le schema recalcules en direct.
  // 95 : Admin › « De l'IGN a ma maison » : le schema de bout en bout et les vignettes 3D des formes de toit.
  const gardeFous = [49, 50, 51, 52, 54, ...(nomClasse === 'large' ? [53] : []), 57, 58, 59, 60, 61, 62, 63, 64, 65, 67, 68, 69, 70, 71, 73, 74, 75, 76, 77, 80, 81, 82, 84, 85, 86, 88, 89, 90, 91, 92, 93, 94, 95];
  const tous = [...base, ...mobile, ...(nomClasse === 'compact' ? [40] : []), ...gardeFous];
  return choisis.length ? tous.filter((n) => choisis.includes(n)) : tous;
}


/**
 * Les parties d'un passage : une par point, classe d'ecran et theme. `FUMEE_CLASSES` et
 * `FUMEE_THEMES` (listes separees par des virgules) en retiennent une partie, pour le travail au
 * quotidien ; le passage complet reste celui d'avant une livraison.
 */
function parties() {
  const liste = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : null);
  const classes = liste(process.env.FUMEE_CLASSES);
  const themes = liste(process.env.FUMEE_THEMES);
  const inconnues = [...(classes || []).filter((c) => !FORMATS.some((f) => f.nom === c)), ...(themes || []).filter((t) => !THEMES.includes(t))];
  if (inconnues.length) throw new Error(`classe ou theme inconnu : ${inconnues.join(', ')} (classes : ${FORMATS.map((f) => f.nom).join(', ')} ; themes : ${THEMES.join(', ')})`);
  const toutes = [];
  for (const f of FORMATS.filter((f) => !classes || classes.includes(f.nom))) {
    for (const theme of THEMES.filter((t) => !themes || themes.includes(t))) {
      for (const n of pointsPour(f.nom)) if (!(n === 40 && theme === 'light')) toutes.push({ f, theme, n });
    }
  }
  return toutes;
}

/** Joue une partie dans un contexte neuf : les parties ne partagent rien, d'ou leur parallelisme. */
async function jouer(navigateur, net, { f, theme, n }) {
  const contexte = await navigateur.newContext({
    viewport: { width: f.width, height: f.height }, isMobile: f.mobile, hasTouch: f.mobile,
    deviceScaleFactor: 1, colorScheme: theme, acceptDownloads: true
  });
  await net.brancher(contexte);
  const page = await contexte.newPage();
  await servirThreeLocal(page);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('dialog', (d) => d.accept());
  let r;
  try {
    await ouvrirDemo(page);
    r = await POINTS[n](page, f);
  } catch (e) {
    r = { ok: false, mesure: 'erreur du script : ' + e.message.split('\n')[0].slice(0, 160) };
  }
  const bruit = erreurs.filter((m) => !/bibliotheque 3D/.test(m));
  if (bruit.length && r.ok) r = { ok: false, mesure: r.mesure + ' ; erreur de page : ' + bruit[0].slice(0, 120) };
  await contexte.close().catch(() => {});
  return r;
}

const ligne = (r) => `${r.classe.padEnd(7)} ${r.theme.padEnd(5)} ${String(r.n).padStart(2)} ${r.ok === true ? 'OK  ' : r.ok === false ? 'ÉCHEC' : '—   '} ${r.mesure}`;

/**
 * `FUMEE_PARALLELE` parties a la fois (par defaut, une par tranche de quatre coeurs, entre 1 et 4) :
 * le serveur Vite et le navigateur sans carte graphique se partagent les coeurs. Sur quatre coeurs,
 * deux parties a la fois ne raccourcissaient pas le passage et rendaient instables les points aux
 * longues attentes (62, 67, 70, qui passent joues seuls). Chaque ligne s'ecrit quand sa partie
 * finit ; le recapitulatif, trie, reprend l'ordre du passage.
 */
async function principal() {
  const aJouer = parties();
  const parallele = Math.max(1, Number(process.env.FUMEE_PARALLELE) || Math.min(4, Math.max(1, Math.floor(cpus().length / 4))));
  const navigateur = await chromium.launch();
  const net = reseau(await choisirModeReseau(navigateur));
  console.log(`${aJouer.length} partie(s), ${parallele} à la fois, ${net.mode === 'direct' ? 'réseau direct' : net.mode === 'temoin' ? 'réseau rejoué (données témoin)' : 'réseau enregistré'}\n`);
  const resultats = new Array(aJouer.length);
  let suivante = 0;
  const ouvrier = async () => {
    while (suivante < aJouer.length) {
      const i = suivante++;
      const p = aJouer[i];
      const r = await jouer(navigateur, net, p);
      resultats[i] = { classe: p.f.nom, theme: p.theme, n: p.n, ...r };
      console.log(ligne(resultats[i]));
    }
  };
  const debut = Date.now();
  await Promise.all(Array.from({ length: parallele }, ouvrier));
  await navigateur.close();
  const compte = (v) => resultats.filter((r) => r.ok === v).length;
  if (parallele > 1 && compte(false)) {
    console.log('\nÉchecs, dans l\'ordre du passage :');
    for (const r of resultats) if (r.ok === false) console.log(ligne(r));
  }
  console.log(`\n${net.bilan()}`);
  console.log(`${compte(true)} passés, ${compte(false)} échecs, ${compte(null)} non joués, sur ${resultats.length}, en ${Math.round((Date.now() - debut) / 1000)} s.`);
  if (compte(false)) process.exitCode = 1;
}

await principal();
