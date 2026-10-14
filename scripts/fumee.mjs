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

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ouvrirDemo, FORMATS, BASE } from './captures.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const choisis = process.argv.slice(3).map(Number).filter(Boolean);
const THEMES = ['light', 'dark'];

// ---- Aides cote page -----------------------------------------------------------------------------

/** L'etat du plan, en JSON : ce qu'on compare avant et apres un geste. */
const lireEtat = (page) => page.evaluate(() => {
  const e = window.__plan.etat();
  return JSON.parse(JSON.stringify({ objects: e.objects, measures: e.measures, scene: e.scene, selectedKey: e.selectedKey }));
});
const objet = (etat, pred) => etat.objects.find(pred);

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
async function stationDevantLaMaison(page) {
  return page.evaluate(() => {
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
    for (const c of cotes) for (const d of [8, 6, 10, 5]) {
      const p = { x: c.m.x + c.nx * d, y: c.m.y + c.ny * d };
      if (!dans(p, parcelle.pts) || batis.some((o) => dans(p, o.pts))) continue;
      const cap = (Math.atan2(c.m.x - p.x, c.m.y - p.y) * 180 / Math.PI + 360) % 360;
      return { lat: cad.origineLat + p.y / 111132.954, lon: cad.origineLon + p.x / (111319.49 * Math.cos(cad.origineLat * Math.PI / 180)), cap };
    }
    return null;
  });
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
 * L'adresse des points cadastraux, la meme depuis la `1.1.0` : c'est elle qui rend les valeurs que
 * le journal de la liste de fumee cite, et en changer rendrait les passages incomparables.
 */
const ADRESSE = 'Place de la Mairie 35000 Rennes';

const TERRASSE = "o.fonction === 'terrasse' && o.type === 'polygon' && o.name === 'Terrasse'";
const DALLE = "o.name === 'Dalle beton'";
const PARASOL = "o.fonction === 'parasol' && o.type === 'circle'";

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
    // La saisie declenche le geocodage au bout de 250 ms ; Entree prend la premiere suggestion.
    await page.waitForTimeout(2000);
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
    const boiteIgn = page.locator('.dialogueVoile', { hasText: "Actualiser depuis l'IGN" });
    await boiteIgn.waitFor({ timeout: 15000 });
    await boiteIgn.getByText('Ajouter les parcelles adjacentes').click();
    await boiteIgn.getByRole('button', { name: /^Actualiser$/ }).click();
    await page.waitForTimeout(20000);
    // Un objet masque n'est pas retire du DOM : le rendu lui pose `display:none` (render/objects.ts),
    // pour qu'il reste choisissable dans l'explorateur et qu'on puisse le demasquer. On compte donc
    // ce qui est DESSINE, pas ce qui est present — la premiere version comptait les noeuds et
    // trouvait 13 avant comme apres.
    const dessines = () => page.evaluate(() => [...document.querySelectorAll('#stage svg [data-role="obj"]')].filter((e) => e.style.display !== 'none').length);
    const voisins = (await lireEtat(page)).objects.filter((o) => o.voisinage).length;
    const avant = await dessines();
    await page.evaluate(() => window.__plan.executer('affichage.voisinage'));
    await page.waitForTimeout(500);
    const apres = await dessines();
    await page.evaluate(() => window.__plan.executer('affichage.voisinage'));
    await page.waitForTimeout(500);
    const retour = await dessines();
    return {
      ok: voisins > 0 && apres === avant - voisins && retour === avant,
      mesure: `${voisins} objet(s) de voisinage importé(s) ; dessinés ${avant} → ${apres} (${avant - apres} masqués), retour ${retour}`
    };
  },
  14: async (page) => {
    const imp = await POINTS[12](page);
    if (!imp.ok) return { ok: imp.ok, mesure: 'import préalable : ' + imp.mesure };
    await page.evaluate(() => window.__plan.executer('affichage.orthophoto'));
    await page.waitForTimeout(8000);
    const tuiles = await page.evaluate(() => document.querySelectorAll('#stage svg image').length);
    const json = await telecharger(page, () => page.evaluate(() => window.__plan.executer('fichier.exporterJson')));
    const porteur = JSON.parse(json).objects.find((x) => x.ortho);
    return {
      ok: tuiles > 0 && !!porteur && porteur.ortho.actif === true,
      mesure: `${tuiles} tuile(s) posée(s), enregistré dans le projet : ${porteur ? JSON.stringify(porteur.ortho) : 'ABSENT'}`
    };
  },
  15: async (page) => {
    const imp = await POINTS[12](page);
    if (!imp.ok) return { ok: imp.ok, mesure: 'import préalable : ' + imp.mesure };
    if (await classe(page) === 'compact') await feuille(page, 'resultats');
    await page.evaluate(() => window.__plan.ouvrirResultats('plu'));
    await page.waitForTimeout(400);
    // Le bouton, et non la commande nue : `plu.interroger` reçoit sa SOURCE et s'en sert pour se
    // désarmer pendant l'appel (`bouton.disabled = true`). L'exécuter sans source la fait lever —
    // « Cannot set properties of undefined » — et le panneau restait vide sans qu'on sache pourquoi.
    // Clic emis dans la page, pour la meme raison qu'au point 13 : le bouton peut etre hors cadre.
    await page.evaluate(() => document.getElementById('pluInterrogerBtn').click());
    await page.waitForTimeout(18000);
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
    await page.waitForTimeout(3500);
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
    const image = () => page.evaluate(() => document.querySelector('#terrasse3dCanvasHost canvas').toDataURL());
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
    await choisir(vues[0].key); await page.waitForTimeout(2500);
    const a = await image();
    await choisir(vues[1].key); await page.waitForTimeout(2500);
    const b = await image();
    await choisir(vues[0].key); await page.waitForTimeout(2500);
    const c = await image();
    return {
      ok: a !== b && a === c,
      mesure: `${vues.length} points de vue ; deux vues ${a === b ? 'IDENTIQUES (la caméra n a pas bougé)' : 'différentes'}, rappel reproductible : ${a === c}`
    };
  },
  24: async (page) => {
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
      await page.waitForTimeout(3000);
      const image = () => page.evaluate(() => document.querySelector('#terrasse3dCanvasHost canvas').toDataURL());
      // Le curseur est un champ controle par React : ecrire `value` ne lui dit rien, il faut passer
      // par le setter natif, comme le fait le navigateur sous le doigt. Sans cela l'heure restait a
      // 12:00 et les deux images etaient identiques — la mesure echouait, pas l'eclairage.
      const regler = (v) => page.evaluate((v) => {
        const c = document.getElementById('vue3dHeure');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, String(v));
        c.dispatchEvent(new Event('input', { bubbles: true }));
      }, v);
      await regler(9 * 60); await page.waitForTimeout(1200); const matin = await image();
      await regler(18 * 60); await page.waitForTimeout(1200); const soir = await image();
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
    // Fichier (feuille Projet au doigt) ; les batiments de la parcelle puis les mitoyens ; une facade
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
    const ok = titres[0] === 'Maison' && titres.some((t) => /mitoyen$/.test(t)) && titres.at(-1) === 'La parcelle' && marquee >= 1 && garde === 1
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
    // tarifs livres et des plafonds. On mesure : rien ne deborde de la page, une couleur et un nom
    // par modele, l'infobulle au survol, le tri, l'export CSV de la vue, l'ajout d'un tarif.
    const jour = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const lignes = [];
    for (let n = 0; n < 30; n++) {
      for (const [i, idu] of ['78650000AE0101', '78650000AE0102', '78650000AE0103'].entries()) {
        if ((n + i) % 3) continue;
        for (const passe of [1, 2, 3]) {
          lignes.push({ t: jour(n) + 'T0' + passe + ':00:00Z', organisation: 'admin', projet: 'admin', idu, adresse: (i + 2) + ' allée des Limites, Le Vésinet', audit: 'a' + n + i,
            usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, passe, tokens: { entree: 4000, ecritureCache: passe === 1 ? 25000 : 0, ecritureCache1h: 0, lectureCache: passe === 1 ? 0 : 25000, sortie: 1500 },
            images: 30, cout: passe === 1 ? 0.0021375 : 0.0007, statut: n === 4 && passe === 3 ? 'echoue' : 'reussi' });
        }
        if (n % 7 === 0) lignes.push({ ...lignes[lignes.length - 1], t: jour(n) + 'T05:00:00Z', usage: 'escalade', modele: 'claude-sonnet-5-5', cout: 0.014, statut: 'reussi', passe: null });
      }
    }
    const tarifs = JSON.parse(readFileSync(new URL('../deploy/claude-tarifs.json', import.meta.url), 'utf8'));
    let plafonds = { format: 'plan-claude-plafonds', defaut: { jour: 0.02, mois: 10 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.005 };
    let tarifsEnvoyes = null;
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
    await etape('onglet Par organisation', () => page.getByRole('tab', { name: 'Par organisation' }).click({ timeout: 5000 }));
    const jauges = await page.locator('.consJauge').count();
    debords.push(await deborde());
    await etape('onglet Tarifs', () => page.getByRole('tab', { name: 'Tarifs et plafonds' }).click({ timeout: 5000 }));
    await etape('formulaire du tarif', () => page.waitForSelector('#consTarif-sortie', { timeout: 5000 }));
    await page.fill('#consTarifDepuis', jour(-30));
    await page.fill('#consTarif-sortie', '0,45');
    await etape('Ajouter ce tarif', () => page.getByRole('button', { name: 'Ajouter ce tarif' }).click({ timeout: 5000 }));
    await page.waitForTimeout(300);
    const ajoute = tarifsEnvoyes?.lignes?.find((l) => l.depuis === jour(-30));
    debords.push(await deborde());
    const ok = !debords.some(Boolean) && legende.join() === 'Claude Haiku 5.5,Claude Sonnet 5.5' && new Set(couleurs).size === 2 && alertes.some((a) => /plafond du jour/.test(a))
      && /Claude Haiku 5\.5/.test(infobulle || '') && idus.length === 3 && [...idus].sort().join() === idus.join() && /^consommation-claude-parcelles-.*\.csv$/.test(nomCsv)
      && barres >= 2 && jauges === 2 && ajoute?.sortie === 0.45;
    return { ok, mesure: `débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')} ; légende ${legende.join(', ')} ; couleurs ${couleurs.join(' / ')} ; alertes ${alertes.length} ; infobulle « ${(infobulle || '').slice(0, 60)} » ; tri IDU ${premiereAvant} → ${idus.join(', ')} ; CSV ${nomCsv} ; barres ${barres}, jauges ${jauges} ; tarif ajouté ${ajoute ? ajoute.depuis + ' sortie ' + ajoute.sortie : 'NON'}` };
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
    const d = serveur.demandes[0];
    const passes = d ? d.requetes.map((r) => r.passe).join(',') : '';
    const identiques = !!d && d.requetes.every((r) => JSON.stringify(r.contenu) === JSON.stringify(d.requetes[0].contenu));
    const images = d ? d.requetes[0].contenu.filter((b) => b.type === 'image').length : 0;
    const facades = d ? d.requetes[0].facades : 0;
    const claude = await page.locator('.ligneProposition.source-claude').count();
    const couverture = await ligneProposition(page, 'Couverture de Maison');
    const zinc = await page.locator('.ligneProposition.source-claude', { hasText: 'Zinc' }).first();
    const zincTexte = (await zinc.count()) ? ((await zinc.textContent()) || '').replace(/\s+/g, ' ').trim() : '';
    const zincCoche = (await zinc.count()) ? await zinc.locator('input[type="checkbox"]').isChecked() : null;
    const etat = ((await page.locator('.etatAnalyse').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((x) => x.scrollWidth > x.clientWidth + 1), f.width);
    const apres = await etatAudite(page);
    const ok = question === 1 && partage === true && !!d && passes === '1,2,3' && identiques && images >= 1 && facades === 1 && serveur.jetons.every((j) => j === 'Bearer jeton')
      && parti && pret && claude >= 2 && claude + lignesAvant === (await page.locator('.ligneProposition').count()) && !!couverture
      && /Claude/.test(zincTexte) && /passes d’accord 100 %/.test(zincTexte) && /Taux d’accord de Claude non encore mesuré/.test(zincTexte) && zincCoche === false
      && /^Claude : Propositions de Claude prêtes/.test(etat) && apres === avant && !deborde;
    return { ok, mesure: `question ${question ? 'posée' : 'ABSENTE'}, partage ${partage ? 'coché' : 'DÉCOCHÉ'} ; envoi ${d ? `passes ${passes}, ${identiques ? 'identiques' : 'DIFFÉRENTES'}, ${images} image(s), ${facades} façade(s), jeton ${serveur.jetons[0] ?? '—'}` : 'AUCUN'} ; toasts ${parti ? 'parti' : 'NON parti'} / ${pret ? 'prêt' : 'NON prêt'} ; ${claude} ligne(s) de Claude (${lignesAvant} des mesures) ; « ${zincTexte.slice(0, 160)} » ${zincCoche ? 'COCHÉE' : 'décochée'} ; « ${etat.slice(0, 80)} » ; projet ${apres === avant ? 'inchangé' : 'MODIFIÉ'} ; débordement ${deborde ? 'OUI' : 'non'}` };
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
    await page.locator('.etatAnalyse.etat-erreur').waitFor({ timeout: 30000 }).catch(() => {});
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
  // l'actualisation (lot L12) ; 69 et 70 : l'analyse par Claude, accord et propositions (lot L17).
  const gardeFous = [49, 50, 51, 52, 54, ...(nomClasse === 'large' ? [53] : []), 57, 58, 59, 60, 61, 62, 63, 64, 65, 69, 70, 73];
  const tous = [...base, ...mobile, ...(nomClasse === 'compact' ? [40] : []), ...gardeFous];
  return choisis.length ? tous.filter((n) => choisis.includes(n)) : tous;
}

/**
 * three.js r128 et ses trois scripts d'exemples, servis depuis `node_modules/three` (la meme version
 * que le CDN, en devDependency) plutot que depuis jsDelivr : les points de la Vue 3D (22, 23, 24, 38)
 * se jouent alors sans reseau sortant. `FUMEE_CDN=1` rejoue le vrai CDN.
 */
async function servirThreeLocal(page) {
  if (process.env.FUMEE_CDN === '1') return;
  const racine = new URL('../node_modules/three/', import.meta.url).pathname;
  const servir = (route, fichier) => existsSync(fichier) ? route.fulfill({ path: fichier, contentType: 'application/javascript' }) : route.continue();
  // La bibliotheque vient de cdnjs, ses exemples de jsDelivr (three/glbViewer.ts, three/chargeurs.ts).
  await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, (route) => servir(route, racine + 'build/three.min.js'));
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/(.*)/, (route) =>
    servir(route, racine + route.request().url().split('three@0.128.0/')[1].split('?')[0]));
}

async function principal() {
  const navigateur = await chromium.launch();
  const resultats = [];
  for (const f of FORMATS) {
    for (const theme of THEMES) {
      for (const n of pointsPour(f.nom)) {
        if (n === 40 && theme === 'light') continue;
        const contexte = await navigateur.newContext({
          viewport: { width: f.width, height: f.height }, isMobile: f.mobile, hasTouch: f.mobile,
          deviceScaleFactor: 1, colorScheme: theme, acceptDownloads: true
        });
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
        resultats.push({ classe: f.nom, theme, n, ...r });
        console.log(`${f.nom.padEnd(7)} ${theme.padEnd(5)} ${String(n).padStart(2)} ${r.ok === true ? 'OK  ' : r.ok === false ? 'ÉCHEC' : '—   '} ${r.mesure}`);
        await contexte.close();
      }
    }
  }
  await navigateur.close();
  const compte = (v) => resultats.filter((r) => r.ok === v).length;
  console.log(`\n${compte(true)} passés, ${compte(false)} échecs, ${compte(null)} non joués, sur ${resultats.length}.`);
  if (compte(false)) process.exitCode = 1;
}

await principal();
