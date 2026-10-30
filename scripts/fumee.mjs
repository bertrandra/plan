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
// FUMEE_QUALITE_3D=econome : le niveau de la Vue 3D pose dans le navigateur avant l'ouverture.
// FUMEE_DELAI_POINT=150 : un point qui ne conclut pas en 150 s echoue, nomme, au lieu de pendre.
// FUMEE_CAPTURES=dossier : la page de chaque point en echec, en PNG, pour la lire apres coup.
// FUMEE_LOT=ci (ou l'argument `ci`) : le lot joue a chaque PR, avec ses reglages (LOTS, plus bas).

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ouvrirDemo, FORMATS, BASE } from './captures.mjs';
import { choisirModeReseau, reseau, servirThreeLocal } from './fumee-reseau.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const THEMES = ['light', 'dark'];

/**
 * Les lots nommes : une liste de points et les reglages qui vont avec. Un reglage deja pose dans
 * l'environnement l'emporte (pour rejouer le lot dans une autre classe, par exemple).
 *
 * `ci` est le lot joue a chaque PR par le job `fumee` (.github/workflows/ci.yml) : le coeur de
 * l'outil, un point par usage, au bureau en theme clair, Vue 3D en Econome (le rendu logiciel de la
 * CI coute 1 a 3 s par image : en Normale le seul point 23 passe de 45 s a plus de trois minutes),
 * reseau de l'IGN rejoue (aucune dependance a l'IGN), un delai par point pour qu'un point qui pend
 * echoue sous son nom. Chaque point a ete retenu stable (trois passages verts de suite en local) et
 * court (moins d'une minute joue seul) :
 *   1   glisser un sommet de la terrasse : le geste de base du plan, mesure au pixel ;
 *   49  l'inspecteur : longueur d'un cote, angle d'un coin, et deux Ctrl+Z exacts ;
 *   17  la nomenclature chiffree se recalcule a un changement d'entraxe, et revient a l'annulation ;
 *   18  le debit des lames (barres, chutes, abouts) ;
 *   20  l'implantation : autant d'appuis numerotes que de plots au BOM ;
 *   25  l'export du dossier PDF (trois pages) ;
 *   99  le fichier du projet : exporte en JSON, rouvert par le menu Fichier, le plan revient a l'identique ;
 *   22  la Vue 3D s'ouvre : three.js (servi localement) charge, canevas dessine ;
 *   97  une interaction de la Vue 3D : mode Toit, un panneau solaire pose, valide, un Ctrl+Z le retire ;
 *   14  le reseau rejoue : import d'une parcelle par adresse (point 12), orthophoto, et le projet
 *       enregistre en JSON porte le reglage ;
 *   60  l'audit de la parcelle, la liste de controle (rien n'entre dans le projet) ;
 *   57  un ecran d'admin : Consommation de Claude (graphique, tri, export CSV, tarifs).
 * Ecartes : 23 (points de vue 3D), qui rate un passage sur quatre en Econome, l'image du rappel
 * changeant avec les tuiles qui arrivent ; 93 (Admin › Regles), qui echoue aujourd'hui sur `main` ;
 * le GLB (24, deux minutes de rendu logiciel) ; les facades (photos de synthese a generer, longues
 * attentes : 102 a 114) ; les points du telephone.
 */
const LOTS = {
  ci: {
    points: [1, 49, 17, 18, 20, 25, 99, 22, 97, 14, 60, 57],
    reglages: { FUMEE_CLASSES: 'large', FUMEE_THEMES: 'light', FUMEE_RESEAU: 'temoin', FUMEE_QUALITE_3D: 'econome', FUMEE_DELAI_POINT: '150', FUMEE_PARALLELE: '1' }
  }
};
const argsPoints = process.argv.slice(3);
const nomLot = process.env.FUMEE_LOT || argsPoints.find((a) => LOTS[a]);
if (nomLot && !LOTS[nomLot]) throw new Error(`lot inconnu : ${nomLot} (lots : ${Object.keys(LOTS).join(', ')})`);
const lot = nomLot ? LOTS[nomLot] : null;
if (lot) for (const [k, v] of Object.entries(lot.reglages)) if (!process.env[k]) process.env[k] = v;
const choisis = lot ? lot.points : argsPoints.map(Number).filter(Boolean);

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
  // Les plis de champs de la section (ce qui sert rarement : textures, ombre d'un parasol...) s'ouvrent aussi.
  await page.evaluate((id) => {
    const d = document.querySelector('#zoneInspecteur details[data-section="' + id + '"]');
    if (!d) return;
    d.open = true;
    d.querySelectorAll('details.plichamps').forEach((p) => { p.open = true; });
    d.scrollIntoView();
  }, id);
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
/**
 * Le toit lu sur une facade (lot L2, MD/spec-lecture-ia-elargie.md §3.2, §4.3) contre une API simulee : la maison du point 117 (un corps a
 * deux pans, une aile, une mesure LiDAR), la photo de la scene 22 ; la reponse SYNTHETIQUE du toit lu (la troisieme requete) voit une
 * ardoise en ecaille, un faitage en zinc, une gouttiere pendante et une fenetre de toit. `quoi` : `couverture` (point 118 : la ligne
 * « Couverture de Maison » arrive decochee, l'emporte sur l'analyse d'une maison, s'ecrit en ardoise + ecaille et se dessine) ou
 * `fenetre` (point 119 : la ligne de la fenetre de toit arrive decochee, posee par le moteur sur le pan sud du corps 1). Ctrl+Z defait.
 */
async function jouerToitLu(page, f, quoi) {
  const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.key === 'maison');
      const p = (x, y) => ({ x, y });
      o.pts = [p(-8, -20), p(0, -20), p(0, -11), p(-4, -11), p(-4, -6), p(-8, -6)];
      o.vertexNames = ['A', 'B', 'C', 'D', 'E', 'F']; o.segmentNames = ['', '', '', '', '', '']; o.frozenVertices = o.pts.map(() => false);
      const b = (o.batiment ??= {});
      delete b.facades; delete b.volumesToit; delete b.egoutChoisi;
      o.elevation = 5.2;
      b.toit = { forme: 'deux-pans', hauteur: 3.6, angleFaitage: 0, source: 'saisie' };
      b.corpsToit = [{ pts: [p(-8, -20), p(0, -20), p(0, -11), p(-8, -11)], posFaitage: 4.5, faitage: 8.8, egouts: [5.2, 5.2], pignons: [], ecart: 0.1 },
        { pts: [p(-8, -11), p(-4, -11), p(-4, -6), p(-8, -6)], posFaitage: 2, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0.1 }];
      const z = [];
      for (let j = 0; j < 29; j++) for (let i = 0; i < 17; i++) {
        const x = -8 + i * 0.5, y = -6 - j * 0.5;
        z.push(y <= -11 && x <= 0 ? 8.8 - (3.6 * Math.abs(y + 15.5)) / 4.5 : y > -11 && x <= -4 ? 6 - Math.abs(x + 6) : null);
      }
      b.toitMesure = { pas: 0.5, x0: -8, y0: -6, nx: 17, ny: 29, z, egout: 5.2, faite: 8.8, source: 'lidar' };
      window.__plan.toucher('maison');
      window.__plan.etat().measures.length = 0;
    });
    const SORTIE = {
      calage: { angles: { gauche: 'indetermine', droite: 'indetermine' }, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [],
      surface: { principale: 'pierre', zones: [], confiance: 'forte' }, ouvertures: [], confiance: 'forte',
    };
    const ENRICHIE = {
      baies: [], saillies: [], decroches: [], modenature: { egout: 'indetermine', rangsGenoise: -1, bandeaux: [], chaines: 'indetermine', encadrements: 'indetermine', soubassement: -1, parementSoubassement: 'indetermine', descentes: [] },
      appendices: [], etat: [],
    };
    // Le toit lu : la fenetre de toit a mi-pente du pan sud (1,3 fois l'egout de 5,2 m, entre l'egout et le faitage a 8,8 m).
    const TOIT = { toit: { couverture: 'ardoise', pose: 'ecaille', debord: 'faible', faitage: 'zinc', gouttiere: 'pendante', confiance: 'forte' }, elements: [{ element: 'fenetre-toit', u0: 0.45, u1: 0.55, v: 1.3, confiance: 'forte' }] };
    const serveur = await simulerAnalyse(page, { facade: SORTIE, enrichie: ENRICHIE, toit: TOIT });
    const canon = (v) => JSON.parse(JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)));
    const lire = async () => canon(await page.evaluate(() => { const b = window.__plan.etat().objects.find((x) => x.key === 'maison').batiment; return JSON.parse(JSON.stringify({ toit: b?.toit ?? null, corps: b?.corpsToit ?? [] })); }));
    const avant = await lire();
    const { vues: [photo] } = photosScene('22-pignon-decentre-pierre');
    const capture = async (q) => { if (process.env.FUMEE_CAPTURE_L2) await page.screenshot({ path: process.env.FUMEE_CAPTURE_L2 + '-' + quoi + '-' + f.nom + '-' + q + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label^="Photographier : Façade sud"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 180000 }));
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 90000 }).catch(() => {});
    await etape('accord', () => toucher(page.locator('[data-controle="auditParcelle.accordAnalyse"]').first()));
    const texte = quoi === 'couverture' ? 'Ardoise en écaille' : 'fenêtre de toit';
    await page.locator('.ligneProposition', { hasText: texte }).first().waitFor({ state: 'attached', timeout: 90000 }).catch(() => {});
    const requetes = serveur.demandes.flatMap((d) => d.requetes ?? []);
    const n = (u) => requetes.filter((q) => q.usage === u).length;
    const ligne = await ligneProposition(page, texte);
    await capture('propositions');
    const pendant = await lire();
    if (ligne) {
      await etape('cocher', () => cocherLigne(page, texte));
      await etape('valider', () => toucher(page.locator('[data-controle="auditParcelle.valider"]')));
      await page.waitForTimeout(1500);
    }
    const ecrit = await lire();
    await page.waitForTimeout(1500);
    // La 3D : la couverture texturee du corps (toit-corps, sa texture), et la fenetre de toit (toit-elements).
    const dessin = await page.evaluate(() => { const r = { toit: 0, texture: 0, elements: 0 }; window.__plan.scene3d()?.scene?.traverse((o) => { if (o.name === 'toit-corps') { r.toit++; if (o.material?.map) r.texture++; } if (o.name === 'toit-elements') r.elements++; }); return r; });
    await capture('apres');
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    await page.waitForTimeout(1500);
    const annule = await lire();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const base = n('facade') >= 3 && n('facade-enrichie') >= 3 && n('facade-toit') >= 3 && !!ligne && !ligne.cochee && memes(pendant, avant) && memes(annule, avant) && !deborde;
    const toit = ecrit.toit ?? {}, c0 = ecrit.corps[0] ?? {};
    const ok = base && (quoi === 'couverture'
      ? toit.couverture === 'ardoise' && toit.pose === 'ecaille' && memes(ecrit.corps, avant.corps) && dessin.texture > 0
      : (c0.elementsToit ?? []).length === (avant.corps[0]?.elementsToit ?? []).length + 1 && c0.elementsToit.at(-1).type === 'fenetre-toit' && c0.elementsToit.at(-1).pan === 0 && /posée par le moteur des toits sur ce pan/.test(ligne.texte) && memes(ecrit.corps.slice(1), avant.corps.slice(1)) && dessin.elements > 0);
    const fe = c0.elementsToit?.at?.(-1);
    return { ok, mesure: `${n('facade')} passe(s) du run, ${n('facade-enrichie')} de la lecture enrichie, ${n('facade-toit')} du toit lu ; ligne ${ligne ? (ligne.cochee ? 'COCHÉE' : 'décochée') + ' « ' + ligne.texte.slice(0, 160) + ' »' : 'ABSENTE'} ; aperçu ${memes(pendant, avant) ? 'sans toucher le projet' : 'PROJET MODIFIÉ'} ; validée : couverture ${toit.couverture ?? '—'}${toit.pose ? ' (' + toit.pose + ')' : ''}${fe ? ', fenêtre de toit pan ' + fe.pan + ' à ' + fe.sM + ' m / ' + fe.dM + ' m' : ''} ; 3D ${dessin.toit} toit(s) dont ${dessin.texture} texturé(s), ${dessin.elements} maille(s) d’éléments ; Ctrl+Z ${memes(annule, avant) ? 'défait tout' : 'RESTE'} ; débordement ${deborde ? 'OUI' : 'non'}` };
}

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
  await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
  await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
  await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 60000 });
}

/**
 * Le serveur des audits partages (`admin/audits`, lot L21), simule : il garde ce qu'on lui envoie et
 * ce qu'on lui retire, pour que le point le mesure.
 */
async function simulerAudits(page) {
  // `recus` : les partages pour le corpus seulement (sans marque, ou marque `corpus`). La sauvegarde de la capture (marque
  // `sauvegarde`, MD/spec-audit.md §15) part d'elle-meme pendant la prise et se remplace par PUT : comptee a part, elle ne
  // doit ni passer pour un partage, ni decaler les numeros des depots du corpus.
  const recus = [], retires = [], sauvegardes = [];
  await page.route(/\/admin\/audits(\/|$)/, async (route) => {
    const req = route.request();
    const marque = req.headers()['x-plan-depot'] || 'corpus';
    if (marque === 'sauvegarde' && (req.method() === 'POST' || req.method() === 'PUT')) {
      sauvegardes.push({ methode: req.method(), texte: req.postData() || '' });
      return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify({ id: 'sauvegarde-1', retrait: 'secret-sauvegarde' }) });
    }
    if (req.method() === 'POST') {
      recus.push({ texte: req.postData() || '', entetes: req.headers() });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '20261013-090000-0000000' + recus.length, retrait: 'secret' + recus.length }) });
    }
    if (req.method() === 'DELETE') { retires.push({ url: req.url(), secret: req.headers()['x-plan-retrait'] }); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"retire":true}' }); }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return { recus, retires, sauvegardes };
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
async function simulerAnalyse(page, { jardin = null, facade = null, enrichie = null, toit = null } = {}) {
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
      // La lecture du jardin (lot L3) : la sortie que le point donne, SYNTHETIQUE ; sans elle, la reponse d'une maison (illisible).
      if (r.usage === 'jardin' && jardin) return { id: r.id, statut: 'reussi', passe: 1, usage: 'jardin', sortie: jardin, erreur: null, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 };
      // Le run d'une facade et sa lecture enrichie (lot L1) : les sorties que le point donne, SYNTHETIQUES, les memes pour leurs trois passes.
      if (r.usage === 'facade' && facade) return { id: r.id, statut: 'reussi', passe: r.passe, usage: 'facade', sortie: facade, erreur: null, modele: 'claude-haiku-5-5', prompt: 2, schema: 2, cout: 0.0016, tokens: { entree: 5400, ecritureCache: 0, lectureCache: 0, sortie: 2600 } };
      // Le toit lu (lot L2) : la troisieme requete, sa sortie SYNTHETIQUE, la meme pour ses trois passes.
      if (r.usage === 'facade-toit' && toit) return { id: r.id, statut: 'reussi', passe: r.passe, usage: 'facade-toit', sortie: toit, erreur: null, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, cout: 0.0011, tokens: { entree: 5400, ecritureCache: 0, lectureCache: 0, sortie: 300 } };
      if (r.usage === 'facade-enrichie' && enrichie) return { id: r.id, statut: 'reussi', passe: r.passe, usage: 'facade-enrichie', sortie: enrichie, erreur: null, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, cout: 0.0012, tokens: { entree: 5400, ecritureCache: 0, lectureCache: 0, sortie: 1500 } };
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
  return JSON.stringify({ murs: m?.batiment?.couleurMurs ?? null, couverture: m?.batiment?.toit?.couverture ?? null, facades: (m?.batiment?.facades ?? []).length, cloture: p?.cloture?.cotes ?? null, verifie: m?.batiment?.verifieSurPlace ?? null });
});
/** Une ligne de proposition : cochee ou non, et son texte. */
/**
 * Coche la ligne de proposition qui porte ce texte, comme la personne : les niveaux de l'arbre des propositions sont en accordeon
 * (un seul ouvert par groupe, le premier par defaut, zones/parcours/PropositionsAudit.tsx), la ligne peut donc etre repliee ; on
 * ouvre d'abord, par leur titre, les niveaux qui la cachent.
 */
/**
 * Touche un element de l'ecran des propositions, une fois visible, par le DOM. Apres la Vue 3D (et l'avant/apres en deux vues),
 * le rendu logiciel de la machine de la CI tient le fil : Playwright ne voit jamais l'element « stable » et son clic expire, au bureau
 * surtout, ou le canevas est le plus grand (nuit du 26 octobre 2026 : 62, 63, 74, 75, 90, un theme ou l'autre). Comme entreeFichier.
 */
const toucher = async (element, timeout = 30000) => {
  await element.waitFor({ state: 'visible', timeout });
  await element.evaluate((e) => e.click());
};
/**
 * Ouvre les niveaux replies qui contiennent cet element de l'ecran des propositions : c'est un accordeon (un seul niveau ouvert
 * par groupe, zones/parcours/PropositionsAudit.tsx), une ligne peut donc etre dans un niveau ferme.
 */
const ouvrirSesNiveaux = async (page, element) => {
  const fermes = await element.evaluate((e) => {
    const n = [];
    for (let x = e.parentElement; x; x = x.parentElement) if (x.tagName === 'DETAILS' && !x.open) n.unshift(x.querySelector(':scope > summary')?.textContent ?? '');
    return n;
  });
  for (const titre of fermes) await toucher(page.locator('details.niveauPropositions > summary', { hasText: titre }).first(), 10000);
};
const cocherLigne = async (page, texte) => {
  const ligne = page.locator('.ligneProposition', { hasText: texte }).first();
  await ligne.waitFor({ state: 'attached', timeout: 30000 });
  await ouvrirSesNiveaux(page, ligne);
  const caseLigne = ligne.locator('input[type="checkbox"]');
  if (!(await caseLigne.isChecked())) await toucher(caseLigne);
};
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
/**
 * Le nombre d'attributs du tableau « Accord de Claude » (Admin › Conformite) : une ligne par entree de `ATTRIBUTS_CLAUDE`
 * (src/regles/conformite.ts). Lu dans le source plutot qu'ecrit ici : un attribut ajoute (la forme du toit, en octobre 2026)
 * ne doit pas rendre le point rouge.
 */
/** La version de lecture des toits qu'Admin › Regles propose d'ajouter : la derniere de `LECTURES_TOITS` (src/app/toits/toitsLidar.ts), plus un. */
function versionLectureSuivante() {
  const texte = readFileSync('src/app/toits/toitsLidar.ts', 'utf8');
  const bloc = /export const LECTURES_TOITS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(texte);
  const versions = bloc ? [...bloc[1].matchAll(/\{\s*version:\s*(\d+)/g)].map((m) => Number(m[1])) : [];
  return versions.length ? Math.max(...versions) + 1 : -1;
}

function nombreAttributsClaude() {
  const texte = readFileSync('src/regles/conformite.ts', 'utf8');
  const bloc = /export const ATTRIBUTS_CLAUDE[^=]*=\s*\[([\s\S]*?)\];/.exec(texte);
  return bloc ? (bloc[1].match(/\{\s*code:/g) ?? []).length : -1;
}

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

/**
 * Un coin libre de la parcelle de la demonstration (lot L3) : un rectangle de 2 m sur 1,5 m dans la parcelle, a plus de 2 m de tout
 * objet, et le cadrage carre que l'audit donne a l'orthophoto du jardin (render/imagesAnalyse.ts, `dessinerOrthoJardin`, marge 2 m).
 */
const coinLibreDeLaParcelle = (page) => page.evaluate(() => {
  const objets = window.__plan.etat().objects, p = objets.find((x) => x.key === 'parcelle');
  const dans = (q, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
  const cote = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 4;
  const cadrage = { xMin: (Math.min(...xs) + Math.max(...xs)) / 2 - cote / 2, yMin: (Math.min(...ys) + Math.max(...ys)) / 2 - cote / 2, cote };
  const occupe = (q) => objets.some((o) => o !== p && o.fonction !== 'terrain' && (o.type === 'circle' ? Math.hypot(o.center.x - q.x, o.center.y - q.y) < o.r + 2
    : (o.pts ?? []).some((s) => Math.hypot(s.x - q.x, s.y - q.y) < 2.5) || (o.type === 'polygon' && dans(q, o.pts))));
  for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
    const q = { x: Math.min(...xs) + (i / 20) * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + (j / 20) * (Math.max(...ys) - Math.min(...ys)) };
    const coins = [[-1, -0.75], [1, -0.75], [1, 0.75], [-1, 0.75]].map(([dx, dy]) => ({ x: q.x + dx, y: q.y + dy }));
    if (coins.every((c) => dans(c, p.pts)) && !occupe(q)) return { centre: q, coins, cadrage };
  }
  return null;
});

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
    // L'outil « Aligner » de la palette va jusqu'au bout : le cote cible designe, la dalle pivote, sans passer par l'inspecteur.
    await page.mouse.click(cible.x, cible.y);
    await page.waitForTimeout(250);
    const info = `cible : côté ${k + 1} de « Maison »`;
    const apres = objet(await lireEtat(page), (o) => o.key === avant.key);
    const dir = (a, b) => ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180 + 180) % 180;
    const t = dir(maison.pts[k], maison.pts[(k + 1) % maison.pts.length]);
    const cotes = apres.pts.map((p, i) => dir(p, apres.pts[(i + 1) % apres.pts.length]));
    const parallele = cotes.some((d) => Math.min(Math.abs(d - t), 180 - Math.abs(d - t)) < 0.1);
    const s1 = aire(avant.pts), s2 = aire(apres.pts);
    // Puis avec une distance dans le bandeau de l'outil : la dalle se pose aussi a 0,50 m du trait.
    await page.evaluate(() => window.__plan.executer('objet.aligner'));
    await page.waitForTimeout(150);
    await page.locator('[data-controle="objet.aligner.distance"]').fill('0.5');
    const cible2 = await visible(page, `[data-role="edge"][data-key="${maison.key}"][data-index="${k}"]`, false);
    await page.mouse.click(cible2.x, cible2.y);
    await page.waitForTimeout(250);
    const pose = objet(await lireEtat(page), (o) => o.key === avant.key);
    const a = maison.pts[k], b = maison.pts[(k + 1) % maison.pts.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    const aLaLigne = (p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    const ecart = Math.min(...pose.pts.map(aLaLigne));
    return { ok: parallele && Math.abs(s1 - s2) < 1e-6 && Math.abs(ecart - 0.5) < 0.01,
      mesure: `${info.replace(/\s+/g, ' ').slice(0, 60)} ; cible ${t.toFixed(1)}°, côtés ${cotes.map((d) => d.toFixed(1)).join('/')}° ; surface ${s1.toFixed(2)} → ${s2.toFixed(2)} m² ; à 0,50 m demandé : ${ecart.toFixed(3)} m` };
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
      // Le calque lui-meme ne se monte qu'a l'arrivee des tuiles : son enveloppe est videe aussi.
      c.querySelectorAll('#coupeCalqueOrtho').forEach((coupe) => {
        const g = coupe.parentElement; g.innerHTML = ''; g.removeAttribute('data-version'); g.removeAttribute('opacity');
      });
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
    // Le rappel se juge sur la camera (position et point vise, au millimetre) : l'image d'une meme camera peut encore changer
    // pendant que la scene finit de se charger (tuiles, arbres), et rendait ce point rouge au bureau sans que la camera ait bouge.
    const camera = () => page.evaluate(() => {
      const s = window.__plan.scene3d();
      return s ? [s.camera.position.x, s.camera.position.y, s.camera.position.z, s.controls.target.x, s.controls.target.y, s.controls.target.z].map((v) => v.toFixed(3)).join(',') : null;
    });
    await choisir(vues[0].key); const a = await image3dStable(page, 2500); const camA = await camera();
    await choisir(vues[1].key); const b = await image3dStable(page, 2500);
    await choisir(vues[0].key); await image3dStable(page, 2500); const camC = await camera();
    return {
      ok: a !== b && !!camA && camA === camC,
      mesure: `${vues.length} points de vue ; deux vues ${a === b ? 'IDENTIQUES (la caméra n a pas bougé)' : 'différentes'}, rappel reproductible : ${!!camA && camA === camC}`
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
    await page.evaluate(() => window.__plan.executer('vue.3d'));
    // L'horloge vient avec la scene prete : le moteur de la 3D se charge a l'ouverture (AD-10), plus ou moins vite.
    await page.locator('#horloge3d').waitFor({ state: 'visible', timeout: 40000 }); await page.waitForTimeout(300);
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
    // Les seules ecritures sans annulation admises : creer le projet depuis le cadastre (le resume, ou l'import direct) le remplace,
    // il n'y a rien a defaire. Toute autre se voit ici, par son nom.
    const ADMISES_SANS_ANNULATION = new Set(['controle:cadastre.creerProjet', 'controle:cadastre.creerDirect']);
    const sansAnnulationNoeuds = branche('ecritures', 'sansAnnulation')?.enfants ?? [];
    const sansAnnulation = sansAnnulationNoeuds.length;
    const nonAdmises = sansAnnulationNoeuds.map((n) => n.cle).filter((k) => !ADMISES_SANS_ANNULATION.has(k));
    let nommesParCle = 0, commandes = 0, sansDescription = 0;
    const voir = (n) => { if (n.genre === 'champ' && n.nom === n.cle) nommesParCle++; (n.enfants || []).forEach(voir); };
    voir(branche('inspecteur'));
    const compter = (n) => { if (n.genre === 'commande') { commandes++; if (!n.details?.description) sansDescription++; } (n.enfants || []).forEach(compter); };
    compter(branche('commandes'));
    const ok = ecran.horsRegistre === '0' && ecran.classes === 'bureau, tablette, téléphone' && ecarts === '0' && sansDroits === '0' && !nonAdmises.length && nommesParCle === 0 && sansDescription === 0;
    return { ok, mesure: `classes : ${ecran.classes} ; hors registre ${ecran.horsRegistre} (${ecran.rattaches} rattachés) ; écarts de zone ${ecarts} ; écritures sans droits ${sansDroits}, sans annulation ${sansAnnulation}${nonAdmises.length ? ' (non admises : ' + nonAdmises.join(', ') + ')' : ' (admises)'} ; champs nommés par leur clé ${nommesParCle} ; commandes sans description ${sansDescription}/${commandes}` };
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
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
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
    await toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Après' }));
    await page.waitForTimeout(1500);
    const apresPresse = await page.locator('button[data-controle="auditParcelle.avantApres"][aria-pressed="true"]').textContent();
    const pendantApercu = await etatAudite(page);
    await toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Avant' }));
    await toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Après' }));
    // Le toast ne reste que quelques secondes, et la Vue 3D logicielle ralentit le clic d'autant :
    // on note chaque toast qui parait, plutot que de le chercher apres coup.
    await page.evaluate(() => {
      window.__toastsVus = [];
      new MutationObserver(() => document.querySelectorAll('.toast').forEach((t) => { if (!window.__toastsVus.includes(t.textContent)) window.__toastsVus.push(t.textContent); }))
        .observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await toucher(page.locator('[data-controle="auditParcelle.valider"]'));
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
      const b = (m.batiment ??= {});
      b.couleurMurs = { source: 'plan' };
      b.toit = { ...b.toit, couverture: 'tuile' };
      // Ecrire dans un objet se dit, comme dans l'application (core/controleurObjets.ts).
      window.__plan.toucher('maison');
    });
    const avant = await etatAudite(page);
    await captureJusquAuxPropositions(page);
    const murs = await ligneProposition(page, 'Matériau des murs de Maison');
    const couverture = await ligneProposition(page, 'Couverture de Maison');
    await cocherLigne(page, 'Matériau des murs de Maison');
    await toucher(page.locator('[data-controle="auditParcelle.valider"]'));
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
    const marquer = (v) => page.evaluate((v) => { const m = window.__plan.etat().objects.find((x) => x.key === 'maison'); if (v) (m.batiment ??= {}).verifieSurPlace = { date: '2026-10-13' }; else delete m.batiment?.verifieSurPlace; window.__plan.toucher('maison'); }, v);
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
  66: async (page, f) => {
    // Retoucher la forme d'un objet de l'IGN, apres un avertissement (decision du 27 octobre 2026) : la parcelle de la
    // demonstration vient du cadastre. Tirer un de ses sommets pose la question, sans rien bouger ; « Annuler » ne laisse rien ;
    // « Confirmer » pose le marque `retoucheMain`, et le glisser suivant se fait sans question. Fichier › Actualiser le projet
    // propose alors une case decochee « Reprendre la version de l'IGN pour… ». Rien ne part vers l'IGN. La parcelle de la
    // demonstration est verrouillee (rien ne s'y retouche) : on la deverrouille d'abord, comme le ferait sa case de l'inspecteur.
    await page.evaluate(() => { const p = window.__plan.etat().objects.find((x) => x.key === 'parcelle'); p.locked = false; window.__plan.toucher('parcelle'); });
    await selectionner(page, "o.key === 'parcelle'");
    const avant = objet(await lireEtat(page), (o) => o.key === 'parcelle');
    let poignee = null, i = 0;
    for (; i < avant.pts.length && !poignee; i++) if (!(avant.frozenVertices || [])[i]) poignee = await visible(page, `[data-role="point"][data-key="parcelle"][data-index="${i}"]`, false);
    i--;
    if (!poignee) return { ok: false, mesure: 'aucune poignée de la parcelle à l’écran' };
    const question = page.locator('.dialogueVoile', { hasText: 'vient du cadastre' });
    const sommet = async () => objet(await lireEtat(page), (o) => o.key === 'parcelle').pts[i];
    // 1. La question, a l'appui : rien ne bouge.
    await glisser(page, poignee, 30, 20);
    const posee = await question.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    const texte = posee ? ((await question.locator('.dialogueTexte').textContent()) || '').trim() : '';
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueBoite')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const immobile = proches((await sommet()).x, avant.pts[i].x) && proches((await sommet()).y, avant.pts[i].y);
    // 2. « Annuler » : ni marque, ni mouvement.
    if (posee) await question.locator('[data-controle="dialogue.annuler"]').click({ timeout: 5000 });
    await page.waitForTimeout(200);
    const sansMarque = !objet(await lireEtat(page), (o) => o.key === 'parcelle').retoucheMain;
    // 3. « Confirmer » : le marque ; le glisser suivant se fait, sans autre question.
    await glisser(page, poignee, 30, 20);
    const reposee = await question.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    if (reposee) await question.locator('[data-controle="dialogue.confirmer"]').click({ timeout: 5000 });
    await page.waitForTimeout(200);
    const marque = objet(await lireEtat(page), (o) => o.key === 'parcelle').retoucheMain ?? null;
    // Le message « Retouche permise » s'affiche (Z9) : au telephone, il couvre la poignee le temps de se lire. La personne
    // attend qu'il parte, le point aussi.
    const sel = `[data-role="point"][data-key="parcelle"][data-index="${i}"]`;
    await page.waitForFunction((sel) => { const e = document.querySelector(sel); if (!e) return false; const b = e.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === e; }, sel, { timeout: 10000 }).catch(() => {});
    await glisser(page, (await visible(page, sel, false)) ?? poignee, 30, 20);
    const sansQuestion = (await page.locator('.dialogueVoile').count()) === 0;
    const bouge = !proches((await sommet()).x, avant.pts[i].x);
    // 4. Actualiser le projet : une case decochee pour reprendre la version de l'IGN.
    await page.evaluate(() => document.querySelector('[data-commande="projet.actualiser"]').click());
    const boite = page.locator('.dialogueVoile', { hasText: 'Actualiser le projet' });
    await boite.waitFor({ timeout: 10000 }).catch(() => {});
    const cases = boite.locator('.dialogueCase', { hasText: 'Reprendre la version de l’IGN' });
    const nCases = await cases.count();
    const libelle = nCases ? ((await cases.first().textContent()) || '').trim() : '';
    const decochee = nCases ? !(await cases.first().locator('input').isChecked()) : false;
    const point = (await boite.locator('.dialoguePoints li').allTextContents()).some((t) => /retouchés à la main/.test(t));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // 5. Le dialogue « Actualiser depuis l'IGN » : la meme case, decochee.
    await page.evaluate(() => document.querySelector('[data-commande="projet.actualiserIgn"]').click());
    const boiteIgn = page.locator('.dialogueActualisation');
    await boiteIgn.waitFor({ timeout: 10000 }).catch(() => {});
    const caseIgn = boiteIgn.locator('[data-controle="actualisation.reprendre"]');
    const nIgn = await caseIgn.count();
    const libelleIgn = nIgn ? ((await caseIgn.first().locator('xpath=..').textContent()) || '').trim() : '';
    const decocheeIgn = nIgn ? !(await caseIgn.first().isChecked()) : false;
    const debordeIgn = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    if (await boiteIgn.count()) await boiteIgn.locator('[data-controle="actualisation.annuler"]').click({ timeout: 5000 }).catch(() => {});
    const [a, m, j] = (marque?.date ?? '').split('-');
    const ok = posee && /^« .+ » vient du cadastre\. La retoucher à la main la détache de l’IGN .*Continuer \?$/.test(texte) && immobile && sansMarque
      && reposee && !!marque && sansQuestion && bouge && nCases === 1 && libelle.endsWith('retouché à la main le ' + j + '/' + m + '/' + a) && decochee && point && !deborde
      && nIgn === 1 && libelleIgn === libelle && decocheeIgn && !debordeIgn;
    return { ok, mesure: `question ${posee ? '« ' + texte.slice(0, 50) + '… »' : 'ABSENTE'}, sommet ${immobile ? 'immobile' : 'DÉPLACÉ'} ; Annuler : ${sansMarque ? 'sans marque' : 'MARQUÉ'} ; Confirmer : marque ${JSON.stringify(marque)}, glisser suivant ${bouge ? 'fait' : 'NON FAIT'} ${sansQuestion ? 'sans question' : 'AVEC QUESTION'} ; Actualiser le projet : ${nCases} case « ${libelle} » ${decochee ? 'décochée' : 'COCHÉE'}, point ${point ? 'présent' : 'ABSENT'} ; Actualiser depuis l’IGN : ${nIgn} case${libelleIgn === libelle ? ', même libellé' : ' « ' + libelleIgn + ' »'}, ${decocheeIgn ? 'décochée' : 'COCHÉE'} ; débordement ${deborde || debordeIgn ? 'OUI' : 'non'}` };
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
    const defaut = { analyse: 'claude-haiku-5-5', escalade: 'claude-sonnet-5-5', immediat: 'claude-haiku-5-5', candidats: 'claude-haiku-5-5', facade: 'claude-haiku-5-5' };
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
    // Le run de chaque facade (lot F3) part dans le meme batch, avec son usage :
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
    // Depuis que le moteur arbitre les sources (lot G), la couverture que Claude voit n'est plus une ligne a part : c'est une source
    // de la ligne « Couverture de Maison », ecartee ici, puisque la couverture vue sur place (ardoise) l'emporte.
    const { sourceZinc, couvertureTexte } = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.ligneProposition')].find((e) => /Couverture de Maison/.test(e.textContent || ''));
      const tr = l ? [...l.querySelectorAll('tr')].find((t) => /Claude/.test(t.textContent || '') && /Zinc/.test(t.textContent || '')) : null;
      const propre = (x) => (x?.textContent || '').replace(/\s+/g, ' ').trim();
      return { sourceZinc: propre(tr), couvertureTexte: propre(l) };
    });
    const etat = ((await page.locator('.etatAnalyse').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((x) => x.scrollWidth > x.clientWidth + 1), f.width);
    const apres = await etatAudite(page);
    const ok = question === 1 && partage === true && !!d && passes === '1,2,3' && identiques && images >= 1 && facades === 1 && sansRenduDit && sansAlerteRendu && serveur.jetons.every((j) => j === 'Bearer jeton')
      && parti && pret && claude >= 1 && claude + lignesAvant === (await page.locator('.ligneProposition').count()) && !!couverture
      && /100 %/.test(sourceZinc) && /Écarté/.test(sourceZinc) && /devient Ardoise, vue sur place/.test(couvertureTexte)
      && /^Claude : Propositions de Claude prêtes/.test(etat) && apres === avant && !deborde;
    return { ok, mesure: `question ${question ? 'posée' : 'ABSENTE'}, partage ${partage ? 'coché' : 'DÉCOCHÉ'} ; envoi ${d ? `passes ${passes}, ${identiques ? 'identiques' : 'DIFFÉRENTES'}, ${images} image(s), ${facades} façade(s), ${sansRenduDit ? 'sans rendu, dit à Claude' : 'SANS la mention « aucun rendu »'}${sansAlerteRendu ? '' : ', ALERTE inutile'}, jeton ${serveur.jetons[0] ?? '—'}` : 'AUCUN'} ; toasts ${parti ? 'parti' : 'NON parti'} / ${pret ? 'prêt' : 'NON prêt'} ; ${claude} ligne(s) de Claude (${lignesAvant} des mesures) ; zinc de Claude dans la couverture : « ${sourceZinc.slice(0, 80) || 'ABSENT'} », couverture ${/devient Ardoise, vue sur place/.test(couvertureTexte) ? 'ardoise vue sur place' : 'AUTRE'} ; « ${etat.slice(0, 80)} » ; projet ${apres === avant ? 'inchangé' : 'MODIFIÉ'} ; débordement ${deborde ? 'OUI' : 'non'}` };
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
      // Une ligne de Claude, au moins : sa couverture n'est plus une ligne a part, le moteur l'arbitre dans « Couverture » (point 69).
      && avecClaude >= 1 && retire === 0 && toastRetrait && garde === 0;
    return { ok, mesure: `« ${refuse.slice(0, 90)} » ; ${rienParti ? 'rien envoyé' : 'ENVOYÉ'} ; panne : « ${erreur.slice(0, 100)} », ${sansClaude} ligne(s) de Claude ; relancé : ${avecClaude} ligne(s) ; retrait : ${retire} ligne(s), toast ${toastRetrait ? 'oui' : 'NON'}, accord gardé ${garde}` };
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
    await toucher(page.locator('[data-controle="auditParcelle.valider"]'));
    await page.waitForFunction(() => (window.__toastsVus || []).some((t) => /Audit partagé/.test(t)), null, { timeout: 30000 }).catch(() => {});
    const recu = serveur.recus[0];
    const fichier = recu ? JSON.parse(recu.texte) : null;
    const decisions = (fichier?.propositions ?? []).map((p) => p.decision);
    const photos = (fichier?.batiments ?? []).flatMap((b) => b.facades.flatMap((x) => x.photos)).length;
    // On revient sur les propositions : la case dit ce qui est parti ; la decocher le retire. La Vue 3D
    // logicielle tient le fil : l'entree du menu se touche par le DOM, sans attendre qu'elle soit stable.
    await entreeFichier(page, 'audit.parcelle');
    await page.locator('.dialogueAuditParcelle').waitFor({ timeout: 30000 });
    await toucher(page.locator('[data-controle="auditParcelle.propositions"]'));
    await page.locator('.partageAudit').waitFor({ timeout: 30000 });
    const noteApres = ((await page.locator('.partageAudit .notePartage').textContent()) || '').trim();
    await page.locator('input[data-controle="auditParcelle.partagerCorpus"]').uncheck({ timeout: 30000 });
    await page.waitForFunction(() => (window.__toastsVus || []).some((t) => /Audit retiré/.test(t)), null, { timeout: 30000 }).catch(() => {});
    // Le retrait du partage, par l'adresse de son depot : la copie de la capture (sauvegarde) est retiree elle aussi, une fois validee.
    const retire = serveur.retires.find((r) => /\/admin\/audits\/20261013-090000-00000001$/.test(r.url));
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
    await toucher(page.locator('[data-controle="auditParcelle.valider"]'));
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
    await toucher(page.locator('[data-controle="auditParcelle.valider"]'));
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
    await page.evaluate(() => { const o = window.__plan.etat().objects.find((x) => x.fonction === 'arbre'); if (o) { (o.arbre ??= {}).espece = 'pin'; window.__plan.toucher(o.key); } });
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
  100: async (page, f) => {
    // Admin › Calibrer la detection, le rejeu d'un cas par l'enchainement de la facade (MD/spec-facade-calage-audit.md §4 ter.5, §7.3,
    // lot F0). Un cas du serveur simule : la photo de synthese de la scene 22 du banc (un pignon decentre), ses coins vrais et son
    // gabarit. « Ouvrir », « Rejouer », puis toucher le segment « Mur » de la barre et « Rejouer depuis cette étape ». On mesure : la
    // barre de huit segments, chacun avec son etat en mot (le texte lu) et sa forme ; la frise de neuf etapes, chacune avec son etat ;
    // l'etape ouverte (son resultat, son contrat, la ligne sous la barre) ; le rejeu depuis une etape qui garde les precedentes ;
    // rien ne deborde. Lot F1 : l'E4 dit le score d'explication sans le toit ; son option manuelle, sur l'assemblage, est le seul
    // composant du geste (quatre poignees : egout, sol, deux bouts) ; tirer un bout au clavier puis « Appliquer le calage et rejouer »
    // pose le mur a la main et rejoue depuis le calage.
    const { vues: [photo], coins, largeur, largeurPx } = photosScene('22-pignon-decentre-pierre');
    const scene = JSON.parse(readFileSync('tests/fixtures/facades/22-pignon-decentre-pierre.json', 'utf8'));
    const hauteur = scene.verite.hauteur, pignon = scene.synthese.mur.pignon;
    const cas = { format: 'plan-facade-reelle', version: 1, nom: 'Synthèse 22 · pignon décentré', statut: 'brouillon', source: 'fumee', largeurM: largeur, hauteurM: hauteur,
      gabarit: [{ u: 0, v: 1 }, { u: 0.4, v: 1 + pignon / hauteur }, { u: 1, v: 1 }], photos: [{ fichier: 'photo-1', coins: coins[0] }], ouvertures: [],
      images: ['data:image/png;base64,' + photo.toString('base64')] };
    await page.route(/\/admin\//, (route) => {
      const u = new URL(route.request().url());
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/calibration-cas')) return json({ cas: [{ id: 'cas-22', nom: cas.nom, statut: 'brouillon', photos: 1, ouvertures: 0, updatedAt: '2026-10-29T10:00:00Z' }] });
      if (u.pathname.endsWith('/admin/calibration-cas/cas-22')) return json(cas);
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const finRejeu = () => page.waitForFunction(() => document.querySelector('[data-controle="calibration.rejouer"]')?.textContent === 'Rejouer' && !!document.querySelector('.calFrise'), null, { timeout: 90000 });
    await page.goto(BASE + '/?admin&ecran=calibration');
    await etape('ouvrir le cas', () => page.locator('[data-controle="calibration.ouvrirCas"]').first().click({ timeout: 20000 }));
    await etape('rejouer', () => page.locator('[data-controle="calibration.rejouer"]').click({ timeout: 10000 }));
    await etape('fin du rejeu', finRejeu);
    const segments = await page.locator('.barreFacade ol > li').evaluateAll((ls) => ls.map((l) => ({ etat: l.className.replace('barreFacadeSegment', '').replace('courant', '').trim(), texte: l.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '', forme: !!l.querySelector('svg, .barreFacadePastille') })));
    const frise = await page.locator('.calFrise > li .calFriseEtat').allTextContents();
    const debords = [await deborde()];
    await etape('segment Mur', () => page.locator('.barreFacade button[data-etape="calage"]').click({ timeout: 5000 }));
    await etape('etape ouverte', () => page.locator('.calEtapeOuverte').waitFor({ timeout: 5000 }));
    const titre = (await page.locator('.calEtapeOuverte h3').textContent()) || '';
    const resume = (await page.locator('.calEtapeOuverte .calResume').textContent()) || '';
    const contrat = await page.locator('.calEtapeOuverte .calContrat dt').count();
    const ligne = (await page.locator('.barreFacadeLigne').first().textContent()) || '';
    const courant = await page.locator('.barreFacade li[aria-current="step"] [aria-label]').getAttribute('aria-label');
    const legende = (await page.locator('.calEtapeOuverte figcaption').first().textContent()) || '';
    await etape('poignees du calage', () => page.locator('.calEtapeOuverte .ajusterMurPhoto').waitFor({ timeout: 10000 }));
    const poignees = await page.locator('.calEtapeOuverte .ajusterMurPhoto [role="slider"]').evaluateAll((l) => l.map((x) => x.getAttribute('aria-label')));
    const appliquerAvant = await page.locator('[data-controle="calibration.appliquerCalage"]').isDisabled();
    debords.push(await deborde());
    await etape('rejouer depuis', () => page.locator('[data-controle="calibration.rejouerDepuis"]').click({ timeout: 5000 }));
    await etape('fin du rejeu depuis', finRejeu);
    const frise2 = await page.locator('.calFrise > li .calFriseEtat').allTextContents();
    debords.push(await deborde());
    await etape('tirer un bout', async () => { const b = page.locator('.calEtapeOuverte .ajusterMurPhoto [role="slider"][aria-label="Bout gauche du mur"]'); await b.focus({ timeout: 5000 }); await page.keyboard.press('Shift+ArrowRight'); });
    const appliquerApres = await page.locator('[data-controle="calibration.appliquerCalage"]').isDisabled();
    await etape('appliquer le calage', () => page.locator('[data-controle="calibration.appliquerCalage"]').click({ timeout: 5000 }));
    await etape('fin du rejeu cale', finRejeu);
    await etape('etape cale', () => page.locator('.calEtapeOuverte .calResume').waitFor({ timeout: 10000 }));
    const resumeCale = (await page.locator('.calEtapeOuverte .calResume').textContent()) || '';
    const calage = poignees.join() === 'Égout,Sol,Bout gauche du mur,Bout droit du mur' && appliquerAvant && !appliquerApres && /score d’explication sans le toit \d,\d\d/.test(legende) && /^Mur posé à la main/.test(resumeCale);
    const etats = new Set(['faite', 'à confirmer', 'en échec', 'sautée', 'à venir']);
    const ok = segments.length === 8 && segments.every((x) => /^Étape \d sur 8, /.test(x.texte) && x.forme) && segments[0]?.etat === 'ok' && segments[1]?.etat === 'ok'
      && frise.length === 9 && frise.every((t) => etats.has(t)) && /^É4 · Calage du mur/.test(titre) && /Mur cherché sur l’assemblage : x de \d+ à \d+/.test(resume)
      && contrat >= 5 && /^Mur : calage du mur, /.test(ligne) && /^Étape 3 sur 8, Mur/.test(courant || '') && frise2.length === 9 && frise2[1] === frise[1] && frise2[2] === frise[2] && calage && !debords.some(Boolean);
    return { ok, mesure: `barre : ${segments.map((x) => x.etat).join(' ')} (« ${segments[2]?.texte} ») ; frise : ${frise.join(', ')} ; ouverte : « ${titre} », « ${resume.slice(0, 90)}… », contrat ${contrat} lignes ; sous la barre « ${ligne} » ; courant « ${courant} » ; depuis É4 : ${frise2.join(', ')} ; calage : « ${(legende.match(/score d’explication sans le toit [\d,]+/) || ['PAS de score'])[0]} », poignées ${poignees.join('/')}, « Appliquer » ${appliquerAvant ? 'grisé' : 'ACTIF'} puis ${appliquerApres ? 'GRISÉ' : 'actif'}, après : « ${resumeCale.slice(0, 60)}… » ; largeur de la photo ${largeurPx[0]} px ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  101: async (page, f) => {
    // Admin › Calibrer la detection, le mode « IA » du rejeu (MD/spec-facade-calage-audit.md §7.2, §8, lot F2). Un cas du serveur simule :
    // la photo de synthese de la scene 02 du banc, ses coins vrais, ses ouvertures vraies, et une reponse ENREGISTREE du run de la
    // facade (SYNTHETIQUE, tests/fixtures/facades-ia/02-synthetique.json : pas Claude). « Rejouer », puis « IA (réponse enregistrée) » :
    // le rejeu repart du calage avec elle, sans reseau. On mesure : l'entete de la reponse (date, passes, modele, versions, cout) ; l'E4
    // dit la pose des deux angles de Claude et l'accord ; son calque (la pose de Claude en trait sombre) ; l'E7 dit ses boites
    // retrouvees par la detection et la boite seule, decochee ; toucher une boite dessine la division de son vitrage ; la note de version
    // dit l'IA et l'empreinte de ses regles ; rien ne debord. Aucun appel a `admin/claude/messages`.
    const { vues: [photo], coins, largeur } = photosScene('02-enduit-uni-face');
    const scene = JSON.parse(readFileSync('tests/fixtures/facades/02-enduit-uni-face.json', 'utf8'));
    const run = JSON.parse(readFileSync('tests/fixtures/facades-ia/02-synthetique.json', 'utf8'));
    const cas = { format: 'plan-facade-reelle', version: 1, nom: 'Synthèse 02 · enduit', statut: 'brouillon', source: 'fumee', largeurM: largeur, hauteurM: scene.verite.hauteur,
      photos: [{ fichier: 'photo-1', coins: coins[0] }], ouvertures: scene.verite.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })), ia: [run],
      images: ['data:image/png;base64,' + photo.toString('base64')] };
    let appels = 0;
    await page.route(/\/admin\//, (route) => {
      const u = new URL(route.request().url());
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/claude/messages')) { appels++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); }
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/calibration-cas')) return json({ cas: [{ id: 'cas-02', nom: cas.nom, statut: 'brouillon', photos: 1, ouvertures: cas.ouvertures.length, updatedAt: '2026-10-29T10:00:00Z' }] });
      if (u.pathname.endsWith('/admin/calibration-cas/cas-02')) return json(cas);
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const finRejeu = () => page.waitForFunction(() => document.querySelector('[data-controle="calibration.rejouer"]')?.textContent === 'Rejouer' && !!document.querySelector('.calFrise'), null, { timeout: 90000 });
    await page.goto(BASE + '/?admin&ecran=calibration');
    await etape('ouvrir le cas', () => page.locator('[data-controle="calibration.ouvrirCas"]').first().click({ timeout: 20000 }));
    await etape('rejouer', () => page.locator('[data-controle="calibration.rejouer"]').click({ timeout: 10000 }));
    await etape('fin du rejeu', finRejeu);
    const entete = ((await page.locator('[data-controle="calibration.choisirRun"] option').first().textContent()) || '').trim();
    await etape('mode IA', () => page.locator('[data-controle="calibration.modeIa"]').click({ timeout: 5000 }));
    await etape('fin du rejeu IA', finRejeu);
    await page.waitForTimeout(300);
    await etape('segment Mur', () => page.locator('.barreFacade button[data-etape="calage"]').click({ timeout: 5000 }));
    await etape('E4 ouverte', () => page.locator('.calEtapeOuverte .calMurIa').waitFor({ timeout: 10000 }));
    const resume4 = (await page.locator('.calEtapeOuverte .calResume').textContent()) || '';
    const note = (await page.locator('.calEtapeOuverte > .calNote').last().textContent()) || '';
    if (process.env.FUMEE_CAPTURE_F2_E4) await page.locator('.calEtapeOuverte figure').first().screenshot({ path: process.env.FUMEE_CAPTURE_F2_E4 });
    const debords = [await deborde()];
    await etape('E7', () => page.locator('.calFrise button[data-etape="ouvertures"]').click({ timeout: 5000 }));
    await etape('E7 ouverte', () => page.locator('.calEtapeOuverte .calBoiteIa').first().waitFor({ timeout: 10000 }));
    const resume7 = (await page.locator('.calEtapeOuverte .calResume').textContent()) || '';
    const cochees = await page.locator('.calEtapeOuverte .calBoiteIa.cochee').count(), seules = await page.locator('.calEtapeOuverte .calBoiteIa.seule').count();
    // La boite dont le vitrage est dit : la premiere cochee qui a des carreaux lus (une fenetre a petits bois de la scene).
    await page.locator('.calEtapeOuverte .calBoiteIa.cochee').first().dispatchEvent('click');
    await page.waitForTimeout(200);
    const traits = await page.locator('.calEtapeOuverte .calCarreau').count();
    const vitrage = ((await page.locator('.calEtapeOuverte .calTexteIa').textContent().catch(() => '')) || '').trim();
    if (process.env.FUMEE_CAPTURE_F2_E7) await page.locator('.calEtapeOuverte figure').first().screenshot({ path: process.env.FUMEE_CAPTURE_F2_E7 });
    debords.push(await deborde());
    await page.unroute(/\/admin\//);
    const ok = /^réponse synthétique \(pas de Claude\), 2026-10-29, une passe, synthetique, prompt v1, schéma v1, 0,0012 \$$/.test(entete)
      && /IA \(réponse synthétique .*\) : ses angles posent le mur x de \d+ à \d+ .*(accord|divergent)/.test(resume4) && /IA : réponse synthétique.*règles [0-9a-f]{8}/.test(note)
      && /ouvertures? vues? par Claude : \d+ retrouvées? par la détection, 1 seule, proposée décochée/.test(resume7) && cochees >= 3 && seules === 1 && vitrage.length > 5
      && appels === 0 && !debords.some(Boolean);
    return { ok, mesure: `réponse rejouée « ${entete} » ; É4 « ${(resume4.match(/IA \(.*$/) || ['PAS d’IA'])[0].slice(0, 160)} » ; note « ${note.slice(-90)} » ; É7 « ${(resume7.match(/\d+ ouvertures? vues? par Claude.*$/) || ['PAS de boîtes'])[0]} », ${cochees} cochée(s), ${seules} seule(s) ; vitrage « ${vitrage} » (${traits} trait(s)) ; appels réseau ${appels} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  103: async (page, f) => {
    // L'escalade d'une facade, a la demande (decision du proprietaire du 29 octobre 2026 : « trois lectures, et une escalade a la
    // demande »), dans Admin › Calibrer la detection : le cas de la scene 02 et sa reponse enregistree SYNTHETIQUE (pas Claude) ;
    // « Rejouer », « IA (réponse enregistrée) », puis le bouton de la commande `facade.escalader`. Le serveur est simule : `etat` dit
    // le modele de l'escalade et ses prix, `admin/claude/messages` rend une lecture SYNTHETIQUE qui voit de la pierre la ou le vote
    // voit de l'enduit. On mesure : le libelle du bouton (modele et cout annonce), UNE requete envoyee (usage `escalade`, la requete
    // en usage `facade`), l'E4 qui dit ce que l'escalade a tranche, le bouton grise ensuite (une seule escalade), rien ne deborde.
    const { vues: [photo], coins, largeur } = photosScene('02-enduit-uni-face');
    const scene = JSON.parse(readFileSync('tests/fixtures/facades/02-enduit-uni-face.json', 'utf8'));
    const run = JSON.parse(readFileSync('tests/fixtures/facades-ia/02-synthetique.json', 'utf8'));
    const cas = { format: 'plan-facade-reelle', version: 1, nom: 'Synthèse 02 · enduit', statut: 'brouillon', source: 'fumee', largeurM: largeur, hauteurM: scene.verite.hauteur,
      photos: [{ fichier: 'photo-1', coins: coins[0] }], ouvertures: scene.verite.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })), ia: [run],
      images: ['data:image/png;base64,' + photo.toString('base64')] };
    const sortie = { ...run.sorties[0], surface: { ...run.sorties[0].surface, principale: 'pierre' } };
    const demandes = [];
    await page.route(/\/admin\//, (route) => {
      const u = new URL(route.request().url());
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/claude/messages')) {
        const d = route.request().postDataJSON();
        demandes.push(d);
        return json({ modele: 'claude-sonnet-5-5', prompt: 2, schema: 2, resultats: d.requetes.map((q) => ({ id: q.id, statut: 'reussi', passe: 1, usage: 'escalade', sortie, erreur: null, cout: 0.0261, tokens: { entree: 4200, ecritureCache: 0, lectureCache: 0, sortie: 900 } })) });
      }
      if (u.pathname.endsWith('/admin/claude/etat')) return json({ actif: true, prompt: 9, schema: 5, organisation: null, admin: true, escaladeFacade: { modele: 'claude-sonnet-5-5', prix: { entree: 3, sortie: 15 } } });
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/calibration-cas')) return json({ cas: [{ id: 'cas-02', nom: cas.nom, statut: 'brouillon', photos: 1, ouvertures: cas.ouvertures.length, updatedAt: '2026-10-29T10:00:00Z' }] });
      if (u.pathname.endsWith('/admin/calibration-cas/cas-02')) return json(cas);
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const finRejeu = () => page.waitForFunction(() => document.querySelector('[data-controle="calibration.rejouer"]')?.textContent === 'Rejouer' && !!document.querySelector('.calFrise'), null, { timeout: 90000 });
    const bouton = page.locator('[data-commande="facade.escalader"]');
    await page.goto(BASE + '/?admin&ecran=calibration');
    await etape('ouvrir le cas', () => page.locator('[data-controle="calibration.ouvrirCas"]').first().click({ timeout: 20000 }));
    await etape('rejouer', () => page.locator('[data-controle="calibration.rejouer"]').click({ timeout: 10000 }));
    await etape('fin du rejeu', finRejeu);
    await etape('mode IA', () => page.locator('[data-controle="calibration.modeIa"]').click({ timeout: 5000 }));
    await etape('fin du rejeu IA', finRejeu);
    await etape('bouton', () => bouton.waitFor({ timeout: 10000 }));
    const avant = ((await bouton.textContent()) || '').trim();
    const debords = [await deborde()];
    if (process.env.FUMEE_CAPTURE_F3_ESCALADE) await bouton.locator('xpath=..').screenshot({ path: process.env.FUMEE_CAPTURE_F3_ESCALADE.replace('{classe}', f.nom) });
    await etape('escalader', () => bouton.click({ timeout: 10000 }));
    await etape('escalade enregistree', () => page.waitForFunction(() => /Escalade enregistrée/.test(document.body.textContent || '') && document.querySelector('[data-controle="calibration.rejouer"]')?.textContent === 'Rejouer', null, { timeout: 90000 }));
    await etape('segment Mur', () => page.locator('.barreFacade button[data-etape="calage"]').click({ timeout: 5000 }));
    await etape('E4 ouverte', () => page.locator('.calEtapeOuverte .calResume').waitFor({ timeout: 10000 }));
    const resume4 = (await page.locator('.calEtapeOuverte .calResume').textContent()) || '';
    const apres = ((await bouton.textContent()) || '').trim();
    const grise = await bouton.isDisabled();
    debords.push(await deborde());
    await page.unroute(/\/admin\//);
    const d = demandes[0];
    const ok = /^Escalader vers claude-sonnet-5-5 \(≈ 0,\d{4} \$\)$/.test(avant) && demandes.length === 1 && d?.usage === 'escalade' && d?.requetes?.length === 1 && d.requetes[0]?.usage === 'facade'
      && /Escalade \(claude-sonnet-5-5\) : elle l’emporte sur le parement/.test(resume4) && apres === 'Escaladée (claude-sonnet-5-5)' && grise && !debords.some(Boolean);
    return { ok, mesure: `bouton « ${avant} » ; ${demandes.length} demande(s), usage ${d?.usage}, requête ${d?.requetes?.map((q) => q.usage).join('/')} ; É4 « ${(resume4.match(/Escalade \(.*?\.(?= |$)/) || ['PAS d’escalade'])[0]} » ; ensuite « ${apres} »${grise ? ', grisé' : ', ACTIF'} ; débordement ${debords.map((x) => (x ? 'OUI' : 'non')).join('/')}` };
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
    // Une case cochee peut etre dans un niveau replie (l'ecran est un accordeon) : on l'ouvre d'abord.
    for (let i = 0; i < 10 && (await cochees.count()); i++) {
      await ouvrirSesNiveaux(page, cochees.first());
      await toucher(cochees.first()); await page.waitForTimeout(300);
    }
    await page.waitForTimeout(2500);
    const d3 = await lireDeuxVues(page);
    await cocherLigne(page, 'Matériau des murs de Maison');
    await page.waitForTimeout(2500);
    const d4 = await lireDeuxVues(page);
    const pendant = await etatAudite(page);
    // « Avant » seul ferme les deux vues, « Les deux » les rouvre.
    await toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Avant' }));
    await page.waitForTimeout(800);
    const seule = await page.locator('.etiquetteDeuxVues').count();
    await toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Les deux' }));
    await page.waitForTimeout(1500);
    const rouvertes = await page.locator('.etiquetteDeuxVues').count();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.auditPropositions')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const e = (x) => (x ? x.ecart.toFixed(1) : '—');
    // Les murs recoches se mesurent contre le bruit des vues identiques (tout decoche) : au telephone, chaque vue fait 390 x 215
    // et la maison y couvre moins de pixels qu'en vues de 408 x 458 et plus, l'ecart moyen est donc plus petit (0,8 contre 1,7).
    const ok = presse === 'Les deux' && etiquettes.join(',') === 'Avant,Après' && !!d1 && d1.vues.sens === sensAttendu && !recouvre
      && d1.ecart > 1.5 && !!d2 && d2.ecart > 1.5 && tourne > 2 && !!d3 && d3.ecart < 0.5 && !!d4 && d4.ecart > d3.ecart + 0.5
      && pendant === avant && seule === 0 && rouvertes === 2 && !deborde;
    return { ok, mesure: `« ${presse} » ; étiquettes ${etiquettes.join(', ') || 'AUCUNE'} ; vues ${d1 ? d1.vues.sens + ' ' + d1.vues.avant.l + '×' + d1.vues.avant.h : 'ABSENTES'} (attendu ${sensAttendu}) ; ${recouvre ? 'SOUS L’ÉCRAN' : 'à côté de l’écran'} ; écart avant/après ${e(d1)} ; après glisser « Après » bouge de ${tourne.toFixed(1)}, écart ${e(d2)} ; tout décoché ${e(d3)} ; murs recochés ${e(d4)} ; projet ${pendant === avant ? 'intact' : 'MODIFIÉ'} ; « Avant » : ${seule} étiquette(s), « Les deux » : ${rouvertes} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  104: async (page, f) => {
    // Le diagnostic de forme d'une facade et sa proposition de toit, sur le bon corps (lot F4, MD/spec-facade-calage-audit.md §5 bis,
    // §5 ter, E8). La maison devient un corps a deux pans, faitage parallele a la facade sud (son gabarit y est un rectangle), et une
    // aile au nord ; la photo de la facade sud est celle de la scene 22 du banc (8 x 5,2 m, un pignon decentre). L'audit la mesure par
    // l'orchestrateur ; l'E5 bis dit la proposition ; dans l'avant/apres, sa ligne « Toit de Maison, corps 1 » arrive DECOCHEE (decision
    // 10) ; cochee et validee, le moteur pose le pignon sur le corps 1 seul, ses hauteurs (faitage, egouts) inchangees ; Ctrl+Z defait.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.key === 'maison');
      const p = (x, y) => ({ x, y });
      o.pts = [p(-8, -20), p(0, -20), p(0, -11), p(-4, -11), p(-4, -6), p(-8, -6)];
      o.vertexNames = ['A', 'B', 'C', 'D', 'E', 'F']; o.segmentNames = ['', '', '', '', '', '']; o.frozenVertices = o.pts.map(() => false);
      const b = (o.batiment ??= {});
      delete b.facades; delete b.volumesToit; delete b.egoutChoisi;
      o.elevation = 5.2;
      b.toit = { forme: 'deux-pans', hauteur: 3.6, angleFaitage: 0, source: 'saisie' };
      const corps = { pts: [p(-8, -20), p(0, -20), p(0, -11), p(-8, -11)], posFaitage: 4.5, faitage: 8.8, egouts: [5.2, 5.2], pignons: [], ecart: 0.1 };
      const aile = { pts: [p(-8, -11), p(-4, -11), p(-4, -6), p(-8, -6)], posFaitage: 2, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0.1 };
      b.corpsToit = [corps, aile];
      // Une mesure LiDAR sous le contour (le moteur des toits la demande) : les pans des deux corps, tous les 50 cm.
      const z = [];
      for (let j = 0; j < 29; j++) for (let i = 0; i < 17; i++) {
        const x = -8 + i * 0.5, y = -6 - j * 0.5;
        z.push(y <= -11 && x <= 0 ? 8.8 - (3.6 * Math.abs(y + 15.5)) / 4.5 : y > -11 && x <= -4 ? 6 - Math.abs(x + 6) : null);
      }
      b.toitMesure = { pas: 0.5, x0: -8, y0: -6, nx: 17, ny: 29, z, egout: 5.2, faite: 8.8, source: 'lidar' };
      window.__plan.toucher('maison');
      window.__plan.etat().measures.length = 0;
    });
    // Les corps de la maison, en JSON aux cles triees : l'annulation rend les memes corps, pas forcement dans le meme ordre de cles.
    const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
    const corps = async () => canon(await page.evaluate(() => window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit ?? []));
    const avant = await corps();
    const { vues: [photo] } = photosScene('22-pignon-decentre-pierre');
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_F4) await page.screenshot({ path: process.env.FUMEE_CAPTURE_F4 + '-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label^="Photographier : Façade sud"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 180000 }));
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    // Le segment « Forme » (V2) : l'E5 bis dit sa proposition sous la barre.
    await etape('segment Forme', () => page.locator('.dialogueAuditParcelle .facadeAudit button[data-etape="diagnostic"]').click({ timeout: 10000 }));
    const forme = ((await page.locator('.dialogueAuditParcelle .barreFacadeLigne').first().textContent()) || '').trim();
    const lignes = await page.locator('.dialogueAuditParcelle .ligneEtapeAudit').allTextContents();
    await capture('liste');
    await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 90000 }).catch(() => {});
    const objet = 'Toit de Maison, corps 1 (vu sur la façade sud';
    await page.locator('.ligneProposition', { hasText: objet }).first().waitFor({ state: 'attached', timeout: 60000 }).catch(() => {});
    const ligne = await ligneProposition(page, objet);
    await capture('propositions');
    await etape('voir', () => toucher(page.locator('.ligneProposition', { hasText: objet }).first().locator('[data-controle="auditParcelle.voirLigne"]')));
    await etape('apres', () => toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Après' })));
    await page.waitForTimeout(1500);
    await capture('apres');
    const pendant = await corps();
    await etape('cocher', () => cocherLigne(page, objet));
    await etape('valider', () => toucher(page.locator('[data-controle="auditParcelle.valider"]')));
    await page.waitForTimeout(1500);
    const ecrit = JSON.parse(await corps());
    const av = JSON.parse(avant);
    const c0 = ecrit[0] ?? {};
    const pignons = (c0.pignons ?? []).filter((x) => x.pan === 0);
    const hauteurs = c0.faitage === av[0].faitage && JSON.stringify(c0.egouts) === JSON.stringify(av[0].egouts) && JSON.stringify(c0.pts) === JSON.stringify(av[0].pts);
    const aile = JSON.stringify(ecrit[1]) === JSON.stringify(av[1]);
    const fermee = (await page.locator('.auditPropositions').count()) === 0;
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    await page.waitForTimeout(1500);
    const annule = await corps();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const ok = /Forme/.test(forme) && !!ligne && !ligne.cochee && /un pignon de plus/.test(ligne.texte) && /Une forme de toit lue sur la photo se confirme toujours/.test(ligne.texte)
      && pendant === avant && pignons.length === 1 && pignons[0].faitage === av[0].faitage && hauteurs && aile && fermee && annule === avant && !deborde;
    return { ok, mesure: `sous la barre : « ${forme.slice(0, 90)} » ; lignes : ${lignes.map((l) => '« ' + l.slice(0, 50) + ' »').join(', ') || 'aucune'} ; ligne ${ligne ? (ligne.cochee ? 'COCHÉE' : 'décochée') + ' « ' + ligne.texte.slice(0, 140) + ' »' : 'ABSENTE'} ; aperçu ${pendant === avant ? 'sans toucher le projet' : 'PROJET MODIFIÉ'} ; validé : ${pignons.length} pignon(s) sur le pan sud du corps 1 (${pignons.map((x) => x.debut + '–' + x.fin + ' m').join(', ')}), hauteurs ${hauteurs ? 'inchangées' : 'MODIFIÉES'}, aile ${aile ? 'inchangée' : 'MODIFIÉE'}, propositions ${fermee ? 'fermées' : 'ENCORE OUVERTES'} ; Ctrl+Z ${annule === avant ? 'défait tout' : 'RESTE'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  105: async (page, f) => {
    // La validation d'une facade (V4, lot F5, MD/spec-facade-calage-audit.md §4 E9, §3.2, §3.3) : l'audit, « Photographier » la facade
    // de la maison (la scene 02 du banc), le calcul par l'orchestrateur ; la facade depliee de la liste dit son bilan (E9, a confirmer)
    // et porte « Valider la façade ». Le toucher ecrit la Facade dans le projet, en un pas d'historique : ses dimensions, sa forme, la
    // pose de sa texture, ses ouvertures numerotees et verifiees ; l'E9 est faite, le bouton part. La 3D pose chaque ouverture dans un
    // groupe nomme par son identifiant ; l'inspecteur dit la Facade et les ouvertures verifiees. Ctrl+Z defait la validation.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const { vues: [photo] } = photosScene('02-enduit-uni-face');
    const releve = () => page.evaluate(() => { const o = window.__plan.etat().objects.find((x) => x.key === 'maison'); return JSON.parse(JSON.stringify(o?.batiment?.facades ?? [])); });
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_F5) await page.screenshot({ path: process.env.FUMEE_CAPTURE_F5 + '-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 120000 }));
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    const barre = '.dialogueAuditParcelle .facadeAudit';
    await etape('bouton V4', () => page.locator(barre + ' button[data-commande="facade.valider"]').waitFor({ timeout: 30000 }));
    const e9 = async () => page.locator(barre + ' .barreFacade ol > li').last().evaluate((l) => l.className.replace('barreFacadeSegment', '').replace('courant', '').trim());
    const avantE9 = await e9();
    // Le segment « Façade » (V4) : son bilan sous la barre (la seconde ligne dit le resultat de l'etape ouverte).
    await etape('segment Facade', () => page.locator(barre + ' button[data-etape="validation"]').click({ timeout: 10000 }));
    const bilan = ((await page.locator(barre + ' .barreFacade').first().textContent()) || '').replace(/^[\s\S]*?(Façade : )/, '$1').trim();
    const avant = await releve();
    await capture('bilan');
    const debords = [await deborde()];
    await etape('valider', () => toucher(page.locator(barre + ' button[data-commande="facade.valider"]')));
    await page.waitForTimeout(1500);
    const apres = await releve();
    const r = apres.find((x) => x.cote === (avant[0]?.cote ?? x.cote)) ?? apres[0] ?? {};
    const ids = (r.ouvertures ?? []).map((o) => o.id);
    const verifiees = (r.ouvertures ?? []).every((o) => typeof o.verifieeLe === 'string');
    const apresE9 = await e9();
    const boutonParti = (await page.locator(barre + ' button[data-commande="facade.valider"]').count()) === 0;
    debords.push(await deborde());
    await capture('validee');
    // La 3D lit la facade objet : chaque ouverture est un groupe nomme par son identifiant (la scene se rebatit apres l'ecriture).
    await page.waitForTimeout(1500);
    const groupes = await page.evaluate(() => { const n = []; window.__plan.scene3d()?.scene?.traverse((o) => { if (/^ouverture:/.test(o.name)) n.push(o.name); }); return n; });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // L'inspecteur lit la Facade : la ligne du mur dit ses dimensions, sa texture calee, et ses ouvertures verifiees.
    await selectionner(page, "o.key === 'maison'");
    await inspecteur(page);
    await ouvrirSection(page, 'releve');
    const section = ((await page.locator('#zoneInspecteur details[data-section="releve"]').first().textContent().catch(() => '')) || '');
    const inspecte = /texture à \d+ px\/m/.test(section) && /toutes vérifiées/.test(section);
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    await page.waitForTimeout(800);
    const annule = await releve();
    const ok = avantE9 === 'a-confirmer' && /Façade.*Mur de .*\(V4\)/.test(bilan) && !avant.some((x) => x.dimensions) && !!r.dimensions && !!r.forme && !!r.textureCalee
      && ids.length > 0 && ids.every((id, i) => id === 'o' + (i + 1)) && verifiees && apresE9 === 'ok' && boutonParti && groupes.length === ids.length
      && inspecte && JSON.stringify(annule) === JSON.stringify(avant) && !debords.some(Boolean);
    return { ok, mesure: `E9 ${avantE9} → ${apresE9} ; bilan « ${bilan.slice(0, 110)} » ; écrit : dimensions ${r.dimensions ? r.dimensions.largeurM + ' × ' + r.dimensions.egoutM + ' m (' + r.dimensions.source + ')' : 'ABSENTES'}, forme ${r.forme ? r.forme.source : 'ABSENTE'}, texture ${r.textureCalee ? Math.round(r.textureCalee.pxParM) + ' px/m' : 'ABSENTE'}, ouvertures ${ids.join(', ') || 'AUCUNE'} ${verifiees ? 'vérifiées' : 'NON VÉRIFIÉES'} ; bouton ${boutonParti ? 'parti' : 'ENCORE LÀ'} ; 3D : ${groupes.length} groupe(s) ; inspecteur ${inspecte ? 'dit la Façade' : 'MUET « ' + section.slice(0, 120) + ' »'} ; Ctrl+Z ${JSON.stringify(annule) === JSON.stringify(avant) ? 'défait la validation' : 'RESTE'} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  106: async (page, f) => {
    // Une cheminee proposee d'apres la photo, confirmee dans l'avant/apres, posee par le moteur sur le bon corps (lot F7,
    // MD/spec-facade-calage-audit.md §5 bis « une bosse etroite », §5 quater, E8). La maison devient un corps a deux pans, faitage
    // parallele a la facade sud (un mur gouttereau : son gabarit est un rectangle), faitage a 6,8 m, egouts a 5,8 m, et une aile au
    // nord ; la photo de la facade sud est celle de la scene 02 du banc (10 x 5,8 m), ou l'on peint une souche de l'enduit du mur qui
    // monte de l'egout a 2 m au-dessus, au tiers gauche. L'audit la mesure ; l'E5 bis dit « une cheminée » ; la ligne « Toit de Maison,
    // corps 1 » qui la propose arrive DECOCHEE (decision 10) ; cochee et validee, le moteur pose une souche sur le faitage du corps 1,
    // et lui seul ; rien d'autre du toit ne bouge ; la 3D la dessine ; Ctrl+Z defait.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.key === 'maison');
      const p = (x, y) => ({ x, y });
      o.pts = [p(-10, -20), p(0, -20), p(0, -12), p(-5, -12), p(-5, -7), p(-10, -7)];
      o.vertexNames = ['A', 'B', 'C', 'D', 'E', 'F']; o.segmentNames = ['', '', '', '', '', '']; o.frozenVertices = o.pts.map(() => false);
      const b = (o.batiment ??= {});
      delete b.facades; delete b.volumesToit; delete b.egoutChoisi; delete b.toitFige;
      o.elevation = 5.8;
      b.toit = { forme: 'deux-pans', hauteur: 1, angleFaitage: 0, source: 'lidar' };
      const corps = { pts: [p(-10, -20), p(0, -20), p(0, -12), p(-10, -12)], posFaitage: 4, faitage: 6.8, egouts: [5.8, 5.8], pignons: [], ecart: 0.1 };
      const aile = { pts: [p(-10, -12), p(-5, -12), p(-5, -7), p(-10, -7)], posFaitage: 2.5, faitage: 5, egouts: [3.5, 3.5], pignons: [], ecart: 0.1 };
      b.corpsToit = [corps, aile];
      const z = [];
      for (let j = 0; j < 27; j++) for (let i = 0; i < 21; i++) {
        const x = -10 + i * 0.5, y = -7 - j * 0.5;
        z.push(y <= -12 ? 6.8 - Math.abs(y + 16) / 4 : x <= -5 ? 5 - (1.5 * Math.abs(x + 7.5)) / 2.5 : null);
      }
      b.toitMesure = { pas: 0.5, x0: -10, y0: -7, nx: 21, ny: 27, z, egout: 5.8, faite: 6.8, source: 'lidar' };
      window.__plan.toucher('maison');
      window.__plan.etat().measures.length = 0;
    });
    const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
    const corps = async () => canon(await page.evaluate(() => window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit ?? []));
    const avant = await corps();
    // La souche peinte sur la photo de la scene 02 : de la teinte de l'enduit, 0,5 m de large, de l'egout a 2 m au-dessus, a 3 m du bout gauche.
    const { vues: [brute], coins: [c4] } = photosScene('02-enduit-uni-face');
    const photo = Buffer.from(await page.evaluate(async ({ b64, c }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const pxParM = (c[1].x - c[0].x) / 10, mur = x.getImageData(Math.round(c[0].x + 3.2 * pxParM), Math.round(c[0].y + 2.5 * pxParM), 1, 1).data;
      x.fillStyle = `rgb(${mur[0]},${mur[1]},${mur[2]})`;
      x.fillRect(Math.round(c[0].x + 2.75 * pxParM), Math.round(c[0].y - 2 * pxParM), Math.round(0.5 * pxParM), Math.round(2 * pxParM) + 2);
      return cv.toDataURL('image/png').split(',')[1];
    }, { b64: brute.toString('base64'), c: c4 }), 'base64');
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_F7) await page.screenshot({ path: process.env.FUMEE_CAPTURE_F7 + '-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label^="Photographier : Façade sud"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 180000 }));
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    await etape('segment Forme', () => page.locator('.dialogueAuditParcelle .facadeAudit button[data-etape="diagnostic"]').click({ timeout: 10000 }));
    // La seconde ligne sous la barre dit le resultat de l'etape ouverte : la proposition de l'E5 bis.
    const forme = ((await page.locator('.dialogueAuditParcelle .facadeAudit .barreFacade').first().textContent()) || '').replace(/^[\s\S]*?(Forme : )/, '$1').trim();
    await capture('liste');
    await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 90000 }).catch(() => {});
    const texte = 'une cheminée à ';
    await page.locator('.ligneProposition', { hasText: texte }).first().waitFor({ state: 'attached', timeout: 60000 }).catch(() => {});
    const ligne = await ligneProposition(page, texte);
    await capture('propositions');
    await etape('voir', () => toucher(page.locator('.ligneProposition', { hasText: texte }).first().locator('[data-controle="auditParcelle.voirLigne"]')));
    await etape('apres', () => toucher(page.locator('button[data-controle="auditParcelle.avantApres"]', { hasText: 'Après' })));
    await page.waitForTimeout(1500);
    await capture('apres');
    const pendant = await corps();
    await etape('cocher', () => cocherLigne(page, texte));
    await etape('valider', () => toucher(page.locator('[data-controle="auditParcelle.valider"]')));
    await page.waitForTimeout(1500);
    const ecrit = JSON.parse(await corps());
    const av = JSON.parse(avant);
    const souches = ecrit[0]?.cheminees ?? [];
    const s0 = souches[0];
    // Sur le faitage du corps 1 (y = -16), au tiers gauche de la facade (x de -10 a 0, la souche peinte a 3 m du bout gauche).
    const placee = souches.length === 1 && s0.position === 'faitage' && s0.source === 'observation' && Math.abs(s0.y + 16) < 0.05 && s0.x > -8 && s0.x < -5;
    const reste = canon({ ...ecrit[0], cheminees: undefined }) === canon({ ...av[0], cheminees: undefined }) && canon(ecrit[1]) === canon(av[1]);
    await page.waitForTimeout(1500);
    const dessinees = await page.evaluate(() => { let n = 0; window.__plan.scene3d()?.scene?.traverse((o) => { if (o.name === 'cheminee-souche') n++; }); return n; });
    const fermee = (await page.locator('.auditPropositions').count()) === 0;
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    await page.waitForTimeout(1500);
    const annule = await corps();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const ok = /Proposition \(à confirmer\) : corps 1, long pan : une cheminée/.test(forme) && !!ligne && !ligne.cochee && /Toit de Maison, corps 1/.test(ligne.texte) && /Un élément du toit lu sur la photo se confirme toujours/.test(ligne.texte)
      && pendant === avant && placee && reste && dessinees >= 1 && fermee && annule === avant && !deborde;
    const dit = forme.match(/Proposition \(à confirmer\) : [^.]*\./)?.[0] ?? forme.slice(0, 110);
    return { ok, mesure: `sous la barre : « ${dit} » ; ligne ${ligne ? (ligne.cochee ? 'COCHÉE' : 'décochée') + ' « ' + ligne.texte.slice(0, 150) + ' »' : 'ABSENTE'} ; aperçu ${pendant === avant ? 'sans toucher le projet' : 'PROJET MODIFIÉ'} ; validé : ${souches.length} souche(s) sur le corps 1${s0 ? ' (' + s0.position + ', x ' + s0.x + ', y ' + s0.y + ', ' + s0.source + ')' : ''}, le reste du toit ${reste ? 'inchangé' : 'MODIFIÉ'}, 3D : ${dessinees} souche(s) dessinée(s), propositions ${fermee ? 'fermées' : 'ENCORE OUVERTES'} ; Ctrl+Z ${annule === avant ? 'défait tout' : 'RESTE'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  112: async (page, f) => {
    // Le parcours complet d'une facade, de l'inspecteur a l'editeur (lot F6, MD/spec-facade-calage-audit.md §6) : la photo d'un mur
    // ne se prend plus que dans l'audit. « Photographier » sur la ligne d'un mur de l'inspecteur ouvre l'audit sur l'ecran de prise,
    // la facade choisie ; une photo (la scene 02 du banc), le calcul, « Valider la façade » (V4) depuis la liste ; l'audit ferme,
    // « Modifier » sur la meme ligne ouvre l'editeur du releve : ni camera ni champ fichier, l'elevation et ses ouvertures, la
    // precision de ses cotes. On retire une ouverture, on en ajoute une, on rend une ouverture non verifiee ; « Valider la façade »
    // ecrit l'edition en un pas (corrections tracees, identifiant pour la nouvelle) ; un Ctrl+Z la defait, un second la validation.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const { vues: [photo] } = photosScene('02-enduit-uni-face');
    // Le releve en texte, cles triees : un pas d'historique rendu remet les memes valeurs, pas forcement dans le meme ordre.
    const releves = () => page.evaluate(() => { const trie = (v) => (Array.isArray(v) ? v.map(trie) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, trie(v[k])])) : v); return JSON.stringify(trie(window.__plan.etat().objects.find((x) => x.key === 'maison')?.batiment?.facades ?? [])); });
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle, .auditPrise, .releve')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_F6) await page.screenshot({ path: process.env.FUMEE_CAPTURE_F6 + '-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    const avantTout = await releves();
    await selectionner(page, "o.key === 'maison'");
    await inspecteur(page);
    await ouvrirSection(page, 'releve');
    const nonReleve = (await page.locator('#zoneInspecteur button[title^="Corriger les ouvertures de la façade"]').count()) === 0;
    const photographier = page.locator('#zoneInspecteur button[title^="Photographier la façade"]').first();
    const mur = ((await photographier.getAttribute('title')) || '').replace(/^Photographier la façade (\S+).*$/, '$1');
    await etape('photographier depuis l inspecteur', () => photographier.click({ timeout: 10000 }));
    await etape('ecran de prise', () => page.locator('.auditPrise').waitFor({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    const titrePrise = ((await page.locator('.auditPrise .titreParcours').first().textContent()) || '').trim();
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 120000 }));
    const debords = [await deborde()];
    await capture('prise');
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    const barre = '.dialogueAuditParcelle .facadeAudit';
    await etape('valider V4', () => toucher(page.locator(barre + ' button[data-commande="facade.valider"]')));
    await page.waitForTimeout(1500);
    const valide = await releves();
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // L'audit ferme laisse la Vue 3D ouverte : on revient au plan, ou vit l'inspecteur.
    await etape('retour au plan', () => toucher(page.locator('[data-commande="vue.plan"]').first()));
    await selectionner(page, "o.key === 'maison'");
    await inspecteur(page);
    await ouvrirSection(page, 'releve');
    await etape('modifier', () => page.locator('#zoneInspecteur button[title="Corriger les ouvertures de la façade ' + mur + '"]').first().click({ timeout: 10000 }));
    await etape('editeur', () => page.locator('.releve[role="dialog"]').waitFor({ timeout: 30000 }));
    const titre = await page.locator('.releve[role="dialog"]').getAttribute('aria-label');
    const sansCapture = (await page.locator('.releve input[type="file"], .releve video, [data-controle="releve.importerPhoto"], [data-controle="releve.analyser"]').count()) === 0;
    const precision = ((await page.locator('.releve .releveNote', { hasText: 'Cotes précises' }).first().textContent({ timeout: 2000 }).catch(() => '')) || '').trim();
    const cadres = page.locator('.releve g.releveOuverture:not(.decochee) rect');
    const n = await cadres.count();
    await capture('editeur');
    debords.push(await deborde());
    // Retirer la premiere ouverture ; rendre la suivante non verifiee ; en ajouter une au milieu.
    await etape('retirer', async () => { await cadres.first().click({ force: true }); await page.locator('[data-controle="releve.retirerOuverture"]').click({ timeout: 5000 }); });
    await etape('verifier', async () => { await cadres.first().click({ force: true }); await page.locator('input[data-controle="releve.verifierOuverture"]').click({ timeout: 5000 }); });
    const fiche = ((await page.locator('.releve .releveFiche').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
    await etape('ajouter', () => page.locator('[data-controle="releve.ajouterOuverture"]').click({ timeout: 5000 }));
    debords.push(await deborde());
    await capture('edite');
    await etape('valider l edition', () => page.locator('[data-controle="releve.valider"]').click({ timeout: 5000 }));
    await page.waitForTimeout(800);
    const ferme = (await page.locator('.releve[role="dialog"]').count()) === 0;
    const edite = JSON.parse(await releves());
    const r = edite.find((x) => x.dimensions) ?? edite[0] ?? {};
    const ouv = r.ouvertures ?? [];
    const ajoutee = ouv.find((o) => o.source === 'ajoutee');
    const gestes = (r.corrections ?? []).map((c) => c.geste);
    await page.evaluate(() => window.__plan.executer('objet.annuler')); await page.waitForTimeout(800);
    const unPas = (await releves()) === valide;
    await page.evaluate(() => window.__plan.executer('objet.annuler')); await page.waitForTimeout(800);
    const deuxPas = (await releves()) === avantTout;
    const ok = nonReleve && /\(choisie\)/.test(titrePrise) && valide !== avantTout && /^Façade \S+ · /.test(titre || '') && sansCapture && /^Cotes précises/.test(precision) && n > 0
      && ferme && ouv.length === n && !!ajoutee && /^o\d+$/.test(ajoutee.id ?? '') && ouv.filter((o) => !o.verifieeLe).length >= 2 && gestes.includes('retrait') && gestes.includes('ajout')
      && unPas && deuxPas && !debords.some(Boolean);
    return { ok, mesure: `inspecteur : ${nonReleve ? 'pas de « Modifier » avant la photo' : '« Modifier » DÉJÀ LÀ'}, « Photographier » (façade ${mur}) → « ${titrePrise.slice(0, 60)} » ; V4 ${valide !== avantTout ? 'écrite' : 'RIEN'} ; éditeur « ${titre} », ${sansCapture ? 'sans capture' : 'AVEC CAPTURE'}, « ${precision.slice(0, 40)}… », ${n} ouverture(s) ; fiche « ${fiche.slice(0, 70)} » ; écrit : ${ouv.length} ouverture(s), ajoutée ${ajoutee ? ajoutee.id : 'ABSENTE'}, gestes ${gestes.join('/') || 'AUCUN'} ; Ctrl+Z ${unPas ? 'défait l’édition' : 'NE DÉFAIT PAS l’édition'}, puis ${deuxPas ? 'la validation' : 'PAS la validation'} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  113: async (page, f) => {
    // Deux vues du meme mur, dans l'audit (lot F6, ce que faisait le releve en « vues du mur entier » : lots L13 et G20) : la scene 19
    // du banc, une haie haute devant la fenetre de gauche du rez sur les deux vues, de face puis de biais. Les deux photos rangees sur
    // la meme facade se redressent et s'assemblent (l'E3 de la barre, la fusion), « Valider la façade » ecrit le releve avec le calage
    // des deux vues ; l'editeur s'ouvre sur sa texture fondue.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const { vues: [face, biais] } = photosScene('19-vues-haie-haute-baie-cachee');
    const releves = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects.find((x) => x.key === 'maison')?.batiment?.facades ?? [])));
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle, .auditPrise, .releve')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    const fini = () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 180000 });
    await etape('photo de face', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: face }));
    await etape('calcul 1', fini);
    await etape('photo de biais', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'biais.png', mimeType: 'image/png', buffer: biais }));
    await page.waitForFunction(() => /2 photos/.test(document.querySelector('.auditPrise .titreParcours')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await etape('calcul 2', fini);
    const debords = [await deborde()];
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    const barre = '.dialogueAuditParcelle .facadeAudit';
    await etape('barre', () => page.locator(barre + ' .barreFacade').waitFor({ timeout: 30000 }));
    const image = await page.locator(barre + ' .barreFacade ol > li').nth(1).evaluate((l) => ({ etat: l.className.replace('barreFacadeSegment', '').replace('courant', '').trim(), texte: l.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '' }));
    const vignettes = await page.locator('.dialogueAuditParcelle .photosAudit li').count();
    debords.push(await deborde());
    await etape('valider V4', () => toucher(page.locator(barre + ' button[data-commande="facade.valider"]')));
    await page.waitForTimeout(1500);
    const r = (await releves()).find((x) => x.dimensions) ?? {};
    const calees = (r.calage?.photos ?? []).map((p) => p.pxParMSource);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await etape('retour au plan', () => toucher(page.locator('[data-commande="vue.plan"]').first()));
    await selectionner(page, "o.key === 'maison'");
    await inspecteur(page);
    await ouvrirSection(page, 'releve');
    await etape('modifier', () => page.locator('#zoneInspecteur button[title^="Corriger les ouvertures de la façade"]').first().click({ timeout: 10000 }));
    await etape('editeur', () => page.locator('.releve[role="dialog"]').waitFor({ timeout: 30000 }));
    const texture = await page.locator('.releve svg.releveElevation image').getAttribute('href').catch(() => null);
    debords.push(await deborde());
    await page.locator('[data-controle="releve.annuler"]').click({ timeout: 5000 });
    const ok = vignettes === 2 && image.etat === 'ok' && calees.length === 2 && calees.every((p) => p > 0) && !!texture && texture.startsWith('data:image/jpeg') && !debords.some(Boolean);
    return { ok, mesure: `${vignettes} photo(s) sur la façade ; Image : ${image.etat} (« ${image.texte} ») ; écrit : calage de ${calees.length} vue(s) (${calees.join(', ')} px/m) ; éditeur : texture ${texture ? 'fondue' : 'ABSENTE'} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  114: async (page, f) => {
    // « Créer un cas depuis cette façade » (lot F6, MD/spec-facade-calage-audit.md §7.1) : la calibration ne prend plus de photos,
    // elle lit les facades de l'audit. En admin des demos (`?demofile=1`, routes `admin/session`, `admin/demos` et
    // `admin/calibration-cas` simulees), l'audit, une photo de la facade de la maison (la scene 02 du banc), la facade depliee de la
    // liste porte « Créer un cas depuis cette façade » ; le toucher range un cas sur le serveur (ses photos, ses dimensions du plan, son
    // nom) ; Admin › Calibrer la détection le liste, l'ouvre, et le rejoue par l'enchainement de la facade. L'ecran de calibration n'a
    // plus de champ photo ni de « Nouveau cas ».
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const { vues: [photo] } = photosScene('02-enduit-uni-face');
    const objets = await page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects)));
    const cas = new Map();
    await page.route(/\/admin\/(session|demos|calibration|calibration-cas)(\/|$|\?)/, async (route) => {
      const u = new URL(route.request().url()), m = route.request().method();
      const json = (corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      if (u.pathname.endsWith('/admin/session')) return json({});
      if (u.pathname.endsWith('/admin/demos')) return json({ demos: [{ id: '1', name: 'Démonstration' }] });
      if (u.pathname.endsWith('/admin/demos/1')) return json({ meta: { id: '1', name: 'Démonstration', schemaVersion: 1 }, objects: objets, measures: [] });
      if (u.pathname.endsWith('/admin/calibration')) return json(null);
      if (u.pathname.endsWith('/admin/calibration-cas')) return json({ cas: [...cas.entries()].map(([id, c]) => ({ id, nom: c.nom, statut: c.statut, photos: c.photos.length, ouvertures: c.ouvertures.length, updatedAt: '2026-10-29T10:00:00Z' })) });
      const id = decodeURIComponent(u.pathname.split('/').pop());
      if (m === 'PUT') { cas.set(id, JSON.parse(route.request().postData() || '{}')); return json({ ok: true }); }
      if (cas.has(id)) return json(cas.get(id));
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto(BASE + '/?demofile=1');
    await page.waitForSelector('#stage svg', { timeout: 30000 });
    await page.waitForTimeout(500);
    const garder = page.getByRole('button', { name: 'Garder tel quel' });
    if (await garder.count()) { await garder.click(); await page.waitForTimeout(150); }
    await noterToasts(page);
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await page.locator('.rangementAudit').waitFor({ timeout: 10000 }).catch(() => {});
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    const bouton = page.locator('.dialogueAuditParcelle .facadeAudit button[data-commande="facade.creerCas"]').first();
    await etape('creer un cas', () => bouton.click({ timeout: 30000 }));
    for (let i = 0; i < 60 && !cas.size; i++) await page.waitForTimeout(500);
    const [id, c] = [...cas.entries()][0] ?? [null, null];
    const toast = await toastVu(page, '^Cas de calibration créé');
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.goto(BASE + '/?admin&ecran=calibration');
    await page.locator('[data-controle="calibration.ouvrirCas"]').first().waitFor({ timeout: 20000 }).catch(() => {});
    // La liste des cas tient dans l'ecran : un nom de cas tire de l'audit (son IDU) ne l'elargit pas.
    const debordeCal = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    await etape('ouvrir le cas', () => page.locator('[data-controle="calibration.ouvrirCas"]').first().click({ timeout: 20000 }));
    const sansPhoto = (await page.locator('input[type="file"][accept^="image"], [data-controle="calibration.photo"], [data-controle="calibration.nouveauCas"]').count()) === 0;
    await etape('rejouer', () => page.locator('[data-controle="calibration.rejouer"]').click({ timeout: 10000 }));
    await etape('fin du rejeu', () => page.waitForFunction(() => document.querySelector('[data-controle="calibration.rejouer"]')?.textContent === 'Rejouer' && !!document.querySelector('.calFrise'), null, { timeout: 90000 }));
    const frise = await page.locator('.calFrise > li').count();
    const ok = !!c && /^cas-/.test(id) && c.format === 'plan-facade-reelle' && c.images?.length === 1 && c.photos?.length === 1 && c.largeurM > 0 && /^Maison · façade /.test(c.nom)
      && /Ouvrez-le dans Admin › Calibrer la détection/.test(toast) && sansPhoto && frise === 9 && !deborde && !debordeCal;
    return { ok, mesure: `cas ${id ?? 'ABSENT'} : « ${c?.nom ?? ''} », ${c?.images?.length ?? 0} photo(s), ${c?.largeurM ?? '?'} × ${c?.hauteurM ?? '?'} m ; « ${toast.slice(0, 80)} » ; calibration : ${sansPhoto ? 'ni champ photo ni « Nouveau cas »' : 'CHAMP PHOTO'}, rejeu ${frise} étapes ; débordement ${deborde ? 'OUI' : 'non'}/${debordeCal ? 'OUI' : 'non'}` };
  },
  108: async (page, f) => {
    // Les carreaux d'une facade validee en 3D (lot F8, MD/spec-facade-calage-audit.md §3.3, §9 bis F8). La facade nord de la maison
    // de la demonstration recoit une Facade validee, sans photo, dont les ouvertures portent `details.carreaux` comme la fenetre
    // d'AE 101 sud (deux vantaux d'un carreau sur trois, petits bois fins, une imposte a quatre carreaux), plus une baie sans petits
    // bois et une porte d'un vantail. La Vue 3D pose dans le groupe de chaque ouverture qui dit des barres sa maille de carreaux :
    // a plat en Econome, en relief (la maille a plat cachee, gardee pour l'export) aux autres niveaux. La porte, d'un seul vantail
    // sans grille, n'en recoit pas.
    await page.evaluate(() => {
      const m = window.__plan.etat().objects.find((x) => x.key === 'maison');
      const [a, b] = m.pts;
      const L = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 100) / 100;
      const ae101 = { vantaux: 2, grille: { colonnes: 1, rangees: 3 }, petitsBois: 'fins', imposte: { hauteurM: 0.35, grille: { colonnes: 4, rangees: 1 } }, vitrage: 'clair', source: 'ia' };
      const fenetre = (id, x, y, carreaux) => ({ type: 'fenetre', x, y, l: 1.2, h: 1.4, id, verifieeLe: '2026-10-29', source: 'claude', details: { carreaux } });
      const ouvertures = [
        fenetre('o1', 1, 1, ae101), fenetre('o2', 3.4, 1, ae101), fenetre('o3', 1, 3.6, ae101), fenetre('o4', 3.4, 3.6, ae101),
        fenetre('o5', 5.8, 3.6, { vantaux: 2, petitsBois: 'aucun', vitrage: 'teinte', source: 'ia' }),
        { type: 'porte', x: 6, y: 0, l: 1, h: 2.2, id: 'o6', verifieeLe: '2026-10-29', details: { carreaux: { vantaux: 1, source: 'ia' } } },
      ];
      (m.batiment ??= {}).facades = [{ cote: 0, largeur: L, hauteur: 6, texture: null, ouvertures, distance: null, sourceDistance: null, releveLe: '2026-10-29',
        dimensions: { largeurM: L, egoutM: 6, source: 'saisie' } }];
      window.__plan.toucher('maison');
    });
    const vue = await POINTS[22](page);
    if (!vue.ok) return { ok: vue.ok, mesure: 'vue 3D préalable : ' + vue.mesure };
    await page.waitForFunction(() => { let n = 0; window.__plan.scene3d()?.scene?.traverse((o) => { if (/^releve-carreaux/.test(o.name)) n++; }); return n > 0; }, null, { timeout: 30000 }).catch(() => {});
    const lu = await page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const groupes = [];
      sc?.scene?.traverse((o) => {
        if (!/^ouverture:/.test(o.name)) return;
        const m = (nom) => o.children.find((c) => c.name === nom);
        const tri = (x) => (x?.geometry?.index ? x.geometry.index.count / 3 : 0);
        const plat = m('releve-carreaux'), relief = m('releve-carreaux-relief');
        groupes.push({ id: o.userData.ouverture, plat: tri(plat), platVisible: !!plat?.visible, exportSeulement: !!plat?.userData?.exportSeulement, relief: tri(relief), reliefVisible: !!relief?.visible });
      });
      // La camera devant la facade nord, a mi-hauteur : la Box3 des carreaux donne le milieu, la normale vient du plan.
      const boite = new window.THREE.Box3();
      sc?.scene?.traverse((o) => { if (/^releve-carreaux/.test(o.name)) boite.expandByObject(o); });
      if (!boite.isEmpty()) {
        const c = boite.getCenter(new window.THREE.Vector3());
        const m = window.__plan.etat().objects.find((x) => x.key === 'maison');
        const [a, b] = m.pts;
        const aire = m.pts.reduce((s, p, i) => { const q = m.pts[(i + 1) % m.pts.length]; return s + p.x * q.y - q.x * p.y; }, 0);
        const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy), sgn = aire > 0 ? 1 : -1;
        const nx = (sgn * dy) / n, nz = (sgn * dx) / n;
        sc.camera.position.set(c.x + nx * 7, c.y + 1.5, c.z + nz * 7);
        sc.controls.target.set(c.x, c.y, c.z);
        sc.controls.update?.();
      }
      return groupes.sort((x, y) => x.id.localeCompare(y.id));
    });
    // Le niveau de la Vue 3D est celui de l'appareil (detecte, ou pose par FUMEE_QUALITE_3D) : on le lit, sans le supposer.
    const qualite = await page.evaluate(() => document.querySelector('[data-controle="vue3d.qualite"]')?.value || (() => { try { return localStorage.getItem('plan.qualite3d'); } catch { return null; } })())
      || (lu.some((g) => g.relief) ? 'normale ou soignée (détectée)' : 'econome (détectée)');
    await image3dStable(page, 3000);
    if (process.env.FUMEE_CAPTURE_F8) await page.locator('#terrasse3dCanvasHost canvas').screenshot({ path: `${process.env.FUMEE_CAPTURE_F8}-${qualite}-${f.nom}.png`, timeout: 120000 }).catch((e) => console.error('capture F8 : ' + e.message.split('\n')[0]));
    const econome = qualite.startsWith('econome');
    // Neuf barres pour la fenetre d'AE 101 (18 triangles a plat, 90 en relief), une pour la baie a deux vantaux sans petits bois.
    const attendu = { o1: 9, o2: 9, o3: 9, o4: 9, o5: 1, o6: 0 };
    const justes = lu.length === 6 && lu.every((g) => g.plat === 2 * attendu[g.id]
      && (attendu[g.id] === 0 ? g.relief === 0 : econome ? g.platVisible && g.relief === 0 : !g.platVisible && g.exportSeulement && g.relief === 10 * attendu[g.id] && g.reliefVisible));
    return { ok: justes, mesure: `${qualite} ; ${lu.length} ouverture(s) : ` + lu.map((g) => `${g.id} ${g.plat / 2} barre(s)${g.relief ? ' en relief' : g.plat ? ' à plat' : ''}`).join(', ') };
  },
  110: async (page, f) => {
    // Une plate-bande, sa vegetation basse dessinee par defaut en 3D (lot L3) : la demonstration recoit une plate-bande de fleurs avec
    // un mini-arbre, au sud de la maison ; ses onze massifs d'avant restent des blocs (aucune plante : la demonstration et son .glb ne
    // bougent pas). L'inspecteur montre sa section Plantation ; la Vue 3D pose, pour elle seule, la maille de l'ecran (densite du
    // niveau de qualite, hors export) et celle du .glb (densite de reference, invisible), et son mini-arbre.
    const libre = await coinLibreDeLaParcelle(page);
    if (!libre) return { ok: false, mesure: 'aucun coin libre dans la parcelle de la démonstration' };
    const cree = await page.evaluate((libre) => {
      const objets = window.__plan.etat().objects;
      const pts = libre.coins;
      const o = { key: 'pb-fumee', type: 'polygon', name: 'Plate-bande', fill: '#7a5a3a', fillOpacity: 1, stroke: '#4a3520', pts, vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)),
        frozenVertices: pts.map(() => false), showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false, constrained: false, fonction: 'massif', matiere: '', priority: 2, locked: false,
        elevation: 0.12, plantation: { type: 'fleurs', forme: 'plate-bande', source: 'main', miniArbre: { espece: 'erable-japon', hauteurM: 1.8 } } };
      objets.push(o);
      window.__plan.dessinerObjet(o);
      window.__plan.toucher('pb-fumee');
      return { massifsAvant: objets.filter((x) => x.fonction === 'massif' && !x.plantation).length };
    }, libre);
    await page.evaluate(() => window.__plan.selectionnerCle('pb-fumee'));
    await inspecteur(page);
    await ouvrirSection(page, 'massif');
    const section = await page.locator('#zoneInspecteur [data-section="massif"]').count();
    await page.evaluate(() => window.__plan.ouvrirFeuille(null));
    const vue = await POINTS[22](page);
    if (!vue.ok) return { ok: vue.ok, mesure: 'vue 3D préalable : ' + vue.mesure };
    await page.waitForFunction(() => { let n = 0; window.__plan.scene3d()?.scene?.traverse((o) => { if (o.name === 'jardin-plantes') n++; }); return n > 0; }, null, { timeout: 30000 }).catch(() => {});
    const lu = await page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const groupes = [];
      let arbres = 0;
      sc?.scene?.traverse((o) => {
        if (o.name === 'arbre' && o.parent?.name === 'jardin-mini-arbre') arbres++;
        if (o.name !== 'jardin-plantes') return;
        const n = (nom) => o.children.find((c) => c.name === nom)?.count ?? 0;
        groupes.push({ ecran: !!o.userData.horsExport, glb: !!o.userData.exportSeulement, visible: o.visible, feuillage: n('jardin-feuillage'), fleurs: n('jardin-fleurs') });
      });
      // La camera au-dessus de la plate-bande, en biais : on voit les plantes.
      const b = new window.THREE.Box3();
      sc?.scene?.traverse((o) => { if (o.name === 'jardin-plantes' && o.userData.horsExport) b.expandByObject(o); });
      if (!b.isEmpty()) {
        const c = b.getCenter(new window.THREE.Vector3());
        sc.camera.position.set(c.x + 1.8, c.y + 2.2, c.z + 2.6);
        sc.controls.target.set(c.x, c.y, c.z);
        sc.controls.update?.();
      }
      return { groupes, arbres };
    });
    const qualite = await page.evaluate(() => document.querySelector('[data-controle="vue3d.qualite"]')?.value || (() => { try { return localStorage.getItem('plan.qualite3d'); } catch { return null; } })()) || 'détectée';
    await image3dStable(page, 3000);
    if (process.env.FUMEE_CAPTURE_L3) await page.locator('#terrasse3dCanvasHost canvas').screenshot({ path: `${process.env.FUMEE_CAPTURE_L3}-plate-bande-${f.nom}.png`, timeout: 120000 }).catch((e) => console.error('capture L3 : ' + e.message.split('\n')[0]));
    const ecran = lu.groupes.find((g) => g.ecran), glb = lu.groupes.find((g) => g.glb);
    // 3 m² de fleurs : la densite de reference au .glb (POUSSES de three/jardin3d.ts), moins en Econome, plus en Soignee.
    const ok = section === 1 && lu.groupes.length === 2 && !!ecran && !!glb && ecran.visible && !glb.visible && glb.feuillage === 18 && glb.fleurs === 30 && ecran.feuillage > 0 && ecran.fleurs > 0 && lu.arbres === 1;
    return { ok, mesure: `section Plantation ${section ? 'montrée' : 'ABSENTE'} ; ${lu.groupes.length} groupe(s) de plantes (${cree.massifsAvant} massifs d'avant sans plantes) ; écran ${ecran ? ecran.feuillage + ' plantes, ' + ecran.fleurs + ' fleurs' : 'ABSENT'} (${qualite}) ; .glb ${glb ? glb.feuillage + ' plantes, ' + glb.fleurs + ' fleurs, ' + (glb.visible ? 'VISIBLE' : 'caché') : 'ABSENT'} ; mini-arbre ${lu.arbres}` };
  },
  111: async (page, f) => {
    // Un regard (lot L3) : un equipement de nature `regard`, pose dans un coin libre de la parcelle, un carre de 60 cm sur le plan,
    // une plaque au ras du sol en 3D. L'inspecteur dit sa nature.
    const libre = await coinLibreDeLaParcelle(page);
    if (!libre) return { ok: false, mesure: 'aucun coin libre dans la parcelle de la démonstration' };
    await page.evaluate((c) => {
      const objets = window.__plan.etat().objects;
      const pts = [{ x: c.x - 0.3, y: c.y - 0.3 }, { x: c.x + 0.3, y: c.y - 0.3 }, { x: c.x + 0.3, y: c.y + 0.3 }, { x: c.x - 0.3, y: c.y + 0.3 }];
      const o = { key: 'regard-fumee', type: 'polygon', name: 'Regard', fill: '#7b7f84', fillOpacity: 1, stroke: '#33363a', pts, vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)),
        frozenVertices: pts.map(() => false), showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false, constrained: false, fonction: 'equipement', matiere: '', priority: 2, locked: false,
        elevation: 0.02, nature: 'regard' };
      objets.push(o);
      window.__plan.dessinerObjet(o);
      window.__plan.toucher('regard-fumee');
      window.__plan.rendre();
    }, libre.centre);
    const surLePlan = await page.evaluate(() => { const e = document.querySelector('[data-role="obj"][data-key="regard-fumee"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.width, h: r.height }; });
    await page.evaluate(() => window.__plan.selectionnerCle('regard-fumee'));
    await inspecteur(page);
    await ouvrirSection(page, 'equipement');
    // Une liste au bureau, une commande segmentee au doigt : la nature se lit sur la liste, ou sur le choix actif.
    const nature = await page.evaluate(() => {
      const d = document.querySelector('#zoneInspecteur [data-section="equipement"]');
      const sel = d?.querySelector('select');
      if (sel) return sel.value;
      const actif = d?.querySelector('[aria-pressed="true"], [aria-checked="true"], .actif');
      return actif ? (/regard/i.test(actif.textContent || '') ? 'regard' : actif.textContent) : null;
    });
    await page.evaluate(() => window.__plan.ouvrirFeuille(null));
    const vue = await POINTS[22](page);
    if (!vue.ok) return { ok: vue.ok, mesure: 'vue 3D préalable : ' + vue.mesure };
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene?.getObjectByName('regard-plaque'), null, { timeout: 30000 }).catch(() => {});
    const lu = await page.evaluate(() => {
      const sc = window.__plan.scene3d();
      const plaque = sc?.scene?.getObjectByName('regard-plaque'), cadre = sc?.scene?.getObjectByName('regard-cadre');
      if (!plaque || !cadre) return null;
      const b = new window.THREE.Box3().setFromObject(cadre).union(new window.THREE.Box3().setFromObject(plaque));
      const c = b.getCenter(new window.THREE.Vector3());
      sc.camera.position.set(c.x + 1.2, c.y + 1.4, c.z + 1.6);
      sc.controls.target.set(c.x, c.y, c.z);
      sc.controls.update?.();
      return { epaisseur: Math.round((b.max.y - b.min.y) * 1000) / 1000, cote: Math.round((b.max.x - b.min.x) * 100) / 100 };
    });
    await image3dStable(page, 3000);
    if (process.env.FUMEE_CAPTURE_L3) await page.locator('#terrasse3dCanvasHost canvas').screenshot({ path: `${process.env.FUMEE_CAPTURE_L3}-regard-${f.nom}.png`, timeout: 120000 }).catch((e) => console.error('capture L3 : ' + e.message.split('\n')[0]));
    const ok = !!surLePlan && surLePlan.l > 0 && Math.abs(surLePlan.l - surLePlan.h) < 2 && nature === 'regard' && !!lu && lu.epaisseur <= 0.04 && lu.cote === 0.6;
    return { ok, mesure: `plan ${surLePlan ? Math.round(surLePlan.l) + '×' + Math.round(surLePlan.h) + ' px' : 'ABSENT'} ; nature « ${nature ?? 'ABSENTE'} » ; 3D ${lu ? 'plaque de ' + lu.cote + ' m, ' + Math.round(lu.epaisseur * 1000) / 10 + ' cm d’épaisseur' : 'ABSENTE'}` };
  },
  115: async (page, f) => {
    // La lecture du jardin dans l'audit (lot L3), contre une API simulee : une tuile d'orthophoto posee sous la parcelle (l'image de
    // synthese du depot, tests/fixtures/jardin-ia/), l'accord, le batch part avec la requete du jardin (usage `jardin`, l'orthophoto
    // recadree puis le texte) ; sa reponse SYNTHETIQUE propose une plate-bande et un regard, DECOCHES. Cochee, la plate-bande se
    // montre dans « Après » seulement ; validee, elle entre dans le plan avec ses plantes, et ne se propose plus.
    const SORTIE = { confiance: 'moyenne', objets: [
      { genre: 'plate-bande', points: [{ x: 0.44, y: 0.47 }, { x: 0.56, y: 0.47 }, { x: 0.56, y: 0.53 }, { x: 0.44, y: 0.53 }], etendue: 0, arbre: { genre: 'sans-objet', taille: 'indetermine', persistant: 'indetermine' }, nature: 'fleurs', indices: [{ image: 1, vu: 'bande de terre fleurie' }], certitude: 'moyenne' },
      { genre: 'regard', points: [{ x: 0.6, y: 0.62 }], etendue: 0, arbre: { genre: 'sans-objet', taille: 'indetermine', persistant: 'indetermine' }, nature: 'sans-objet', indices: [{ image: 1, vu: 'petit carré gris' }], certitude: 'faible' },
    ] };
    // La plate-bande se place dans un coin libre de la parcelle de la demonstration (aucun objet dessous : un massif deja la la
    // ferait ecarter comme doublon), dans le cadrage que l'audit donnera a l'image (render/imagesAnalyse.ts, `dessinerOrthoJardin`).
    const libre = await coinLibreDeLaParcelle(page);
    if (libre) SORTIE.objets[0].points = libre.coins.map((c) => ({ x: Math.round(((c.x - libre.cadrage.xMin) / libre.cadrage.cote) * 1000) / 1000, y: Math.round((1 - (c.y - libre.cadrage.yMin) / libre.cadrage.cote) * 1000) / 1000 }));
    const serveur = await simulerAnalyse(page, { jardin: SORTIE });
    const tuile = 'data:image/jpeg;base64,' + readFileSync(new URL('../tests/fixtures/jardin-ia/jardin-test.jpg', import.meta.url)).toString('base64');
    const posee = await page.evaluate(async (dataUri) => {
      const { ortho } = await import('/src/render/ortho.ts');
      const p = window.__plan.etat().objects.find((x) => x.key === 'parcelle');
      const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
      const cote = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 20;
      ortho.tuiles.push({ z: 19, x: 0, y: 0, dataUri, xMin: Math.min(...xs) - 10, yMin: Math.min(...ys) - 10, largeur: cote, hauteur: cote });
      return ortho.tuiles.length;
    }, tuile);
    await captureJusquAuxPropositions(page);
    await notesToasts(page);
    await page.locator('[data-controle="auditParcelle.accordAnalyse"]').click({ timeout: 30000 });
    await page.locator('.ligneProposition', { hasText: 'Plate-bande' }).first().waitFor({ state: 'attached', timeout: 60000 }).catch(() => {});
    const d = serveur.demandes[0];
    const requete = d?.requetes.find((r) => r.usage === 'jardin');
    const avecImage = !!requete && requete.contenu[0]?.type === 'image' && requete.contenu.some((b) => b.type === 'text' && /couvre .* m de côté/.test(b.text));
    const ligne = await ligneProposition(page, 'Plate-bande');
    const regard = await ligneProposition(page, 'Regard');
    if (!ligne) {
      const diag = await page.evaluate(async () => { const { ortho } = await import('/src/render/ortho.ts'); return { tuiles: ortho.tuiles.length, etat: document.querySelector('.etatAnalyse')?.textContent ?? '', lignes: [...document.querySelectorAll('.ligneProposition')].map((l) => (l.textContent || '').slice(0, 50)) }; });
      return { ok: false, mesure: `aucune ligne « Plate-bande » ; requêtes ${d ? d.requetes.map((r) => r.usage ?? 'analyse').join(',') : 'AUCUNE'} ; tuiles ${diag.tuiles} ; « ${diag.etat.slice(0, 120)} » ; lignes : ${diag.lignes.join(' | ')}` };
    }
    const objetsAvant = await page.evaluate(() => window.__plan.etat().objects.length);
    await cocherLigne(page, 'Plate-bande');
    await page.waitForTimeout(1500);
    const apercu = await page.evaluate(() => {
      let neufs = 0;
      window.__plan.scene3d()?.scene?.traverse((o) => { if (o.name === 'jardin-plantes' && o.userData.horsExport && o.layers.mask === 4) neufs++; });
      return { neufs, objets: window.__plan.etat().objects.length };
    });
    if (process.env.FUMEE_CAPTURE_L3) await page.screenshot({ path: `${process.env.FUMEE_CAPTURE_L3}-avant-apres-${f.nom}.png` }).catch(() => {});
    await toucher(page.locator('[data-controle="auditParcelle.valider"]'));
    await page.waitForTimeout(1000);
    const apres = await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.fonction === 'massif' && x.plantation?.forme === 'plate-bande');
      return { cle: o?.key ?? null, contenu: o?.plantation?.type ?? null, objets: window.__plan.etat().objects.length };
    });
    const encore = await ligneProposition(page, 'Plate-bande');
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const ok = posee > 0 && avecImage && !!ligne && !ligne.cochee && !!regard && !regard.cochee && apercu.objets === objetsAvant && apercu.neufs >= 1
      && !!apres.cle && /^jardin-plate-bande-/.test(apres.cle) && apres.contenu === 'fleurs' && apres.objets === objetsAvant + 1 && !encore && !deborde;
    return { ok, mesure: `requête du jardin ${requete ? (avecImage ? 'partie (orthophoto + texte)' : 'SANS image ou texte') : 'ABSENTE'} ; ligne plate-bande ${ligne ? (ligne.cochee ? 'COCHÉE' : 'décochée') : 'ABSENTE'}, regard ${regard ? (regard.cochee ? 'COCHÉ' : 'décoché') : 'ABSENT'} ; aperçu « Après » ${apercu.neufs} groupe(s) de plantes, plan ${apercu.objets === objetsAvant ? 'intact' : 'MODIFIÉ'} ; validée : ${apres.cle ?? 'RIEN'} (${apres.contenu ?? '-'}), ${apres.objets - objetsAvant} objet(s) ajouté(s) ; ${encore ? 'ENCORE proposée' : 'plus proposée'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  116: async (page, f) => {
    // La facade enrichie (lot L1, MD/spec-lecture-ia-elargie.md §5.1), contre une API simulee : la facade de la maison photographiee
    // (la scene 02 du banc), l'accord, le batch part avec le run de la facade ; sa reponse SYNTHETIQUE (pas Claude) voit des
    // menuiseries en bois vert, des garde-corps en fer forge noir aux baies d'etage, un bandeau, un store, une fissure. La facade
    // depliee le dit (« Lu par Claude », « Modénature lue », et le signal sans case) ; « Valider la façade » ecrit menuiseries,
    // garde-corps, modenature, store et signal dans la Facade ; la 3D dessine la modenature et les garde-corps lus ; Ctrl+Z defait.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const scene = JSON.parse(readFileSync('tests/fixtures/facades/02-enduit-uni-face.json', 'utf8'));
    const { largeur: L } = scene.verite;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    // La chaine pose le mur de la photo sur celui de la maison (8 x 6 m) : ses hauteurs y valent 0,855 fois celles de la scene (le releve
    // les met a 0,78 et 3,25 m pour 0,9 et 3,8 m). Les parts du run sont celles du mur que l'audit lui montre, en hauteurs d'egout (6 m).
    const H = 6 / 0.855;
    // Le run (la lecture d'avant L1) et la lecture enrichie, deux requetes sur la meme image (decision du 30 octobre 2026).
    const boite = (o) => ({ u0: r3(o.x / L), u1: r3((o.x + o.l) / L), v0: r3(o.y / H), v1: r3((o.y + o.h) / H) });
    const SORTIE = {
      calage: { angles: { gauche: 'indetermine', droite: 'indetermine' }, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [],
      surface: { principale: 'enduit', zones: [], confiance: 'forte' },
      ouvertures: scene.verite.ouvertures.map((o) => ({ type: o.type, ...boite(o), niveau: o.y > 2 ? 1 : 0, travee: 'indetermine', confiance: 'forte',
        details: { volets: 'indetermine', allege: 'indetermine', forme: 'rect' },
        carreaux: { vantaux: 'indetermine', colonnes: 'indetermine', rangees: 'indetermine', petitsBois: 'indetermine', imposte: 'indetermine', vitrage: 'indetermine' } })),
      confiance: 'forte',
    };
    const ENRICHIE = {
      baies: scene.verite.ouvertures.map((o) => ({ ...boite(o), menuiserie: 'bois', couleurMenuiserie: 'vert', couleurVolets: 'sans-objet',
        ...(o.y > 2 ? { gardeCorps: 'fer-forge', hautGardeCorps: r3((o.y + 1) / H), couleurGardeCorps: 'noir' } : { gardeCorps: 'sans-objet', hautGardeCorps: -1, couleurGardeCorps: 'indetermine' }) })),
      saillies: [], decroches: [],
      modenature: { egout: 'aucune', rangsGenoise: -1, bandeaux: [r3(3.3 / H)], chaines: 'aucune', encadrements: 'indetermine', soubassement: 0, parementSoubassement: 'indetermine', descentes: [] },
      appendices: [{ nature: 'store', u0: 0.1, u1: 0.3, v0: 0.4, v1: 0.45, marches: -1, confiance: 'moyenne' }],
      etat: [{ nature: 'fissure', u0: 0.62, u1: 0.64, v0: 0.1, v1: 0.4, confiance: 'moyenne' }],
    };
    // Le toit lu (lot L2), la troisieme requete : rien de vu sur le toit. Sans reponse, son echec ajouterait un second signal (celui de la
    // lecture du toit) a celui de la fissure, que ce point compte seul.
    const TOIT = { toit: { couverture: 'indetermine', pose: 'indetermine', debord: 'indetermine', faitage: 'indetermine', gouttiere: 'indetermine', confiance: 'faible' }, elements: [] };
    const serveur = await simulerAnalyse(page, { facade: SORTIE, enrichie: ENRICHIE, toit: TOIT });
    const { vues: [photo] } = photosScene('02-enduit-uni-face');
    const releve = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects.find((x) => x.key === 'maison')?.batiment?.facades ?? [])));
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_L1) await page.screenshot({ path: process.env.FUMEE_CAPTURE_L1 + '-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 120000 }));
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 90000 }).catch(() => {});
    await etape('accord', () => toucher(page.locator('[data-controle="auditParcelle.accordAnalyse"]').first()));
    for (let i = 0; i < 120 && !serveur.demandes.some((d) => d.requetes?.some((q) => q.usage === 'facade')); i++) await page.waitForTimeout(500);
    const runs = serveur.demandes.flatMap((d) => d.requetes ?? []).filter((q) => q.usage === 'facade').length;
    const enrichies = serveur.demandes.flatMap((d) => d.requetes ?? []).filter((q) => q.usage === 'facade-enrichie').length;
    const toits = serveur.demandes.flatMap((d) => d.requetes ?? []).filter((q) => q.usage === 'facade-toit').length;
    await page.waitForTimeout(4000);
    await etape('retour liste', () => toucher(page.locator('.auditPropositions [data-controle="auditParcelle.liste"]').first()));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    const barre = '.dialogueAuditParcelle .facadeAudit';
    await page.locator(barre + ' .lectureClaude').waitFor({ timeout: 60000 }).catch(() => {});
    const lignes = await page.locator(barre + ' .lectureClaude .detailPhoto').allTextContents();
    const signal = await page.locator(barre + ' .lectureClaude .signalClaude').count();
    await capture('lecture');
    const debords = [await deborde()];
    const avant = await releve();
    await etape('valider', () => toucher(page.locator(barre + ' button[data-commande="facade.valider"]')));
    await page.waitForTimeout(2000);
    const r = (await releve())[0] ?? {};
    const ouv = r.ouvertures ?? [];
    const menuiseries = ouv.filter((o) => o.details?.menuiserie?.materiau === 'bois').length;
    const gardes = ouv.filter((o) => o.details?.gardeCorps?.type === 'fer-forge').length;
    debords.push(await deborde());
    await page.waitForTimeout(1500);
    const mailles = await page.evaluate(() => { const n = []; window.__plan.scene3d()?.scene?.traverse((o) => { if (o.name === 'releve-modenature' || o.name === 'batiment-details-ouvertures') n.push(o.name + ':' + (Array.isArray(o.material) ? o.material.length : 1)); }); return n; });
    await capture('validee');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    await page.waitForTimeout(800);
    const annule = await releve();
    const modenature3d = mailles.some((m) => m.startsWith('releve-modenature'));
    const ok = runs >= 3 && enrichies >= 3 && lignes.some((l) => /^Lu par Claude : menuiseries en bois/.test(l) && /garde-corps en fer forgé/.test(l)) && lignes.some((l) => /^Modénature lue : 1 bandeau, 1 store/.test(l))
      && signal === 1 && lignes.some((l) => /^Signalé par Claude, à vérifier : une fissure/.test(l))
      && menuiseries >= 3 && gardes >= 2 && r.modenature?.bandeauxM?.length === 1 && r.appendices?.[0]?.nature === 'store' && r.etat?.[0]?.nature === 'fissure'
      && modenature3d && JSON.stringify(annule) === JSON.stringify(avant) && !debords.some(Boolean);
    return { ok, mesure: `${runs} passe(s) du run, ${enrichies} de la lecture enrichie et ${toits} du toit lu envoyée(s) ; lignes : ${lignes.map((l) => '« ' + l.slice(0, 70) + ' »').join(', ') || 'AUCUNE'} ; signal ${signal ? 'sans case' : 'ABSENT'} ; validée : ${menuiseries} menuiserie(s) en bois, ${gardes} garde-corps en fer forgé, bandeau ${r.modenature?.bandeauxM?.join(', ') ?? 'ABSENT'} m, store ${r.appendices?.length ? 'écrit' : 'ABSENT'}, état ${r.etat?.length ? 'signalé' : 'ABSENT'} ; 3D ${mailles.join(', ') || 'RIEN'} ; Ctrl+Z ${JSON.stringify(annule) === JSON.stringify(avant) ? 'défait la validation' : 'RESTE'} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  117: async (page, f) => {
    // Une saillie lue sur la facade, proposee, acceptee, posee par le moteur (lot L1, MD/spec-lecture-ia-elargie.md §4.2, §5.1), contre
    // une API simulee : la maison du point 104 (un corps a deux pans, une aile, une mesure LiDAR), la photo de la scene 22 ; la reponse
    // SYNTHETIQUE du run voit un bow-window sur la facade sud. La ligne « Toit de Maison, corps 1 » qui le propose arrive DECOCHEE ;
    // cochee et validee, le moteur ajoute un corps de bow-window apres les autres (aucun ne bouge), la 3D le dessine ; Ctrl+Z defait.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.key === 'maison');
      const p = (x, y) => ({ x, y });
      o.pts = [p(-8, -20), p(0, -20), p(0, -11), p(-4, -11), p(-4, -6), p(-8, -6)];
      o.vertexNames = ['A', 'B', 'C', 'D', 'E', 'F']; o.segmentNames = ['', '', '', '', '', '']; o.frozenVertices = o.pts.map(() => false);
      const b = (o.batiment ??= {});
      delete b.facades; delete b.volumesToit; delete b.egoutChoisi;
      o.elevation = 5.2;
      b.toit = { forme: 'deux-pans', hauteur: 3.6, angleFaitage: 0, source: 'saisie' };
      b.corpsToit = [{ pts: [p(-8, -20), p(0, -20), p(0, -11), p(-8, -11)], posFaitage: 4.5, faitage: 8.8, egouts: [5.2, 5.2], pignons: [], ecart: 0.1 },
        { pts: [p(-8, -11), p(-4, -11), p(-4, -6), p(-8, -6)], posFaitage: 2, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0.1 }];
      const z = [];
      for (let j = 0; j < 29; j++) for (let i = 0; i < 17; i++) {
        const x = -8 + i * 0.5, y = -6 - j * 0.5;
        z.push(y <= -11 && x <= 0 ? 8.8 - (3.6 * Math.abs(y + 15.5)) / 4.5 : y > -11 && x <= -4 ? 6 - Math.abs(x + 6) : null);
      }
      b.toitMesure = { pas: 0.5, x0: -8, y0: -6, nx: 17, ny: 29, z, egout: 5.2, faite: 8.8, source: 'lidar' };
      window.__plan.toucher('maison');
      window.__plan.etat().measures.length = 0;
    });
    const SORTIE = {
      calage: { angles: { gauche: 'indetermine', droite: 'indetermine' }, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [],
      surface: { principale: 'pierre', zones: [], confiance: 'forte' }, ouvertures: [], confiance: 'forte',
    };
    // Le bow-window vient de la lecture enrichie (la seconde requete sur la meme image, lot L1).
    const ENRICHIE = {
      baies: [], saillies: [{ genre: 'bow-window', u0: 0.3, u1: 0.62, forme: 'pans', niveau: 'rdc', toit: 'pan', haut: 0.5, couverture: 'sans-objet', confiance: 'forte' }],
      decroches: [], modenature: { egout: 'indetermine', rangsGenoise: -1, bandeaux: [], chaines: 'indetermine', encadrements: 'indetermine', soubassement: -1, parementSoubassement: 'indetermine', descentes: [] },
      appendices: [], etat: [],
    };
    const serveur = await simulerAnalyse(page, { facade: SORTIE, enrichie: ENRICHIE });
    // Les corps aux cles triees : l'annulation rend les memes corps, pas forcement dans le meme ordre de cles (comme le point 104).
    const canon = (v) => JSON.parse(JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)));
    const corps = async () => canon(await page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit ?? []))));
    const avant = await corps();
    const { vues: [photo] } = photosScene('22-pignon-decentre-pierre');
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_L1) await page.screenshot({ path: process.env.FUMEE_CAPTURE_L1 + '-saillie-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label^="Photographier : Façade sud"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 180000 }));
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('lancer', () => toucher(page.locator('[data-controle="auditParcelle.lancer"]')));
    await page.locator('.auditPropositions').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const d = document.querySelector('.auditPropositions .detailPhoto'); return !!d && !/^Mesure des façades/.test(d.textContent || ''); }, null, { timeout: 90000 }).catch(() => {});
    await etape('accord', () => toucher(page.locator('[data-controle="auditParcelle.accordAnalyse"]').first()));
    const texte = 'bow-window';
    await page.locator('.ligneProposition', { hasText: texte }).first().waitFor({ state: 'attached', timeout: 90000 }).catch(() => {});
    const runs = serveur.demandes.flatMap((d) => d.requetes ?? []).filter((q) => q.usage === 'facade').length;
    const enrichies = serveur.demandes.flatMap((d) => d.requetes ?? []).filter((q) => q.usage === 'facade-enrichie').length;
    const ligne = await ligneProposition(page, texte);
    await capture('propositions');
    const pendant = await corps();
    if (ligne) {
      await etape('cocher', () => cocherLigne(page, texte));
      await etape('valider', () => toucher(page.locator('[data-controle="auditParcelle.valider"]')));
      await page.waitForTimeout(1500);
    }
    const ecrit = await corps();
    const bow = ecrit[avant.length];
    const intacts = JSON.stringify(ecrit.slice(0, avant.length)) === JSON.stringify(avant);
    await page.waitForTimeout(1500);
    const dessine = await page.evaluate(() => { let n = 0; window.__plan.scene3d()?.scene?.traverse((o) => { if (/saillie|bow/i.test(o.name)) n++; }); return n; });
    await capture('apres');
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    await page.waitForTimeout(1500);
    const annule = await corps();
    const deborde = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width);
    const ok = runs >= 3 && enrichies >= 3 && !!ligne && !ligne.cochee && /posée par le moteur des toits/.test(ligne.texte) && /profondeur par défaut/.test(ligne.texte) && JSON.stringify(pendant) === JSON.stringify(avant)
      && ecrit.length === avant.length + 1 && bow?.saillie?.genre === 'bow-window' && bow.saillie.hote === 0 && intacts && JSON.stringify(annule) === JSON.stringify(avant) && !deborde;
    return { ok, mesure: `${runs} passe(s) du run ; ligne ${ligne ? (ligne.cochee ? 'COCHÉE' : 'décochée') + ' « ' + ligne.texte.slice(0, 150) + ' »' : 'ABSENTE'} ; aperçu ${JSON.stringify(pendant) === JSON.stringify(avant) ? 'sans toucher le projet' : 'PROJET MODIFIÉ'} ; validée : ${ecrit.length - avant.length} corps ajouté(s)${bow?.saillie ? ' (' + bow.saillie.genre + ', hôte ' + (bow.saillie.hote + 1) + ', ' + bow.saillie.largeurM + ' × ' + bow.saillie.profondeurM + ' m)' : ''}, corps d’avant ${intacts ? 'intacts' : 'MODIFIÉS'} ; 3D ${dessine} maille(s) de saillie ; Ctrl+Z ${JSON.stringify(annule) === JSON.stringify(avant) ? 'défait tout' : 'RESTE'} ; débordement ${deborde ? 'OUI' : 'non'}` };
  },
  // 118 et 119 : le toit lu sur une facade (lot L2) : une couverture en ecaille lue et dessinee ; une fenetre de toit posee par le moteur.
  118: (page, f) => jouerToitLu(page, f, 'couverture'),
  119: (page, f) => jouerToitLu(page, f, 'fenetre'),
  102: async (page, f) => {
    // L'audit de la parcelle, une facade calculee par l'orchestrateur, en mode discret (MD/spec-facade-calage-audit.md §4 ter.3,
    // §4 ter.5, §6, lot F3). « Photographier » la facade de la maison, une photo de synthese (la scene 02 du banc : un enduit uni,
    // ses baies) : des la photo, la barre de progression de la calibration se pose en tete de l'ecran de prise et avance. Puis la
    // liste : la facade depliee porte la meme barre, et dessous, en mode discret, seulement ce qui doute (avec son geste) et la ligne
    // du mur ; seuls les points de validation et ce qui doute s'ouvrent ; toucher le segment « Mur » dit son resultat sous la barre ;
    // « Rejouer la façade » rejoue l'orchestrateur. Rien n'entre dans le projet ; rien ne deborde.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const avant = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    const { vues: [photo] } = photosScene('02-enduit-uni-face');
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditParcelle, .auditPrise')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const capture = async (quoi) => { if (process.env.FUMEE_CAPTURE_F3) await page.screenshot({ path: process.env.FUMEE_CAPTURE_F3 + '-' + f.nom + '-' + quoi + '.png' }).catch(() => {}); };
    await etape('ouvrir', () => ouvrirAuditParcelle(page));
    await etape('photographier', () => page.locator('button[data-controle="auditParcelle.photographierFacade"][aria-label$="de Maison"]').first().click({ timeout: 30000 }));
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 }).catch(() => {});
    await etape('photo', () => page.locator('input[data-controle="auditParcelle.photo"]').setInputFiles({ name: 'facade.png', mimeType: 'image/png', buffer: photo }));
    await etape('barre a la prise', () => page.locator('.auditPrise .facadeAudit .barreFacade').waitFor({ timeout: 30000 }));
    // La barre est en tete de l'ecran de prise, sous le titre ; elle avance etape par etape, puis l'enchainement finit.
    const enTete = await page.evaluate(() => { const c = document.querySelector('.auditPrise'), b = c?.querySelector('.facadeAudit'); return !!c && !!b && b.previousElementSibling === c.querySelector('.enteteCarteAudit'); });
    await etape('calcul fini', () => page.waitForFunction(() => /Enchaînement (terminé|arrêté)/.test(document.querySelector('.auditPrise .barreFacadeLigne')?.textContent || ''), null, { timeout: 120000 }));
    const prise = await page.locator('.auditPrise .barreFacade ol > li').evaluateAll((ls) => ls.map((l) => l.className.replace('barreFacadeSegment', '').replace('courant', '').trim()));
    const ruban = await page.locator('.auditPrise .barreFacadeRuban').evaluate((r) => getComputedStyle(r).display !== 'none' ? r.textContent : '');
    const debords = [await deborde()];
    await capture('prise');
    await etape('liste', () => toucher(page.locator('[data-controle="auditParcelle.liste"]')));
    await etape('deplier', () => page.locator('button[data-controle="auditParcelle.voirFacade"]:not([disabled])').first().click({ timeout: 30000 }));
    await etape('barre de la liste', () => page.locator('.dialogueAuditParcelle .facadeAudit .barreFacade').waitFor({ timeout: 30000 }));
    const segments = await page.locator('.dialogueAuditParcelle .facadeAudit .barreFacade ol > li').evaluateAll((ls) => ls.map((l) => ({ etat: l.className.replace('barreFacadeSegment', '').replace('courant', '').trim(), texte: l.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '', bouton: !!l.querySelector('button') })));
    const lignes = await page.locator('.dialogueAuditParcelle .ligneEtapeAudit').allTextContents();
    // Ouvrable dans l'audit : un point de validation, ou ce qui doute ; jamais une etape cachee qui a reussi.
    const ouvrablesJustes = segments.every((x) => x.bouton === (/point de validation/.test(x.texte) || x.etat === 'echec' || x.etat === 'a-confirmer'));
    debords.push(await deborde());
    await capture('liste');
    await etape('segment Mur', () => page.locator('.dialogueAuditParcelle .facadeAudit button[data-etape="calage"]').click({ timeout: 10000 }));
    const sousLaBarre = ((await page.locator('.dialogueAuditParcelle .barreFacadeLigne').first().textContent()) || '').trim();
    await etape('rejouer', () => page.locator('[data-controle="auditParcelle.rejouerFacade"]').click({ timeout: 10000 }));
    await etape('rejeu fini', () => page.waitForFunction(() => document.querySelector('[data-controle="auditParcelle.rejouerFacade"]')?.textContent === 'Rejouer la façade', null, { timeout: 120000 }));
    const apresRejeu = await page.locator('.dialogueAuditParcelle .facadeAudit .barreFacade ol > li').count();
    debords.push(await deborde());
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const projet = await page.evaluate(() => JSON.stringify(window.__plan.etat().objects));
    const etats = (l) => l.map((e) => e || '?').join(' ');
    const ok = enTete && prise.length === 8 && prise[0] === 'ok' && segments.length === 8 && segments.every((x) => /^Étape \d sur 8, /.test(x.texte))
      && ouvrablesJustes && lignes.some((l) => /Mur posé|Calage du mur/.test(l)) && /^Mur : calage du mur, /.test(sousLaBarre) && apresRejeu === 8
      && (f.nom !== 'compact' || /\d sur 8 · /.test(ruban)) && projet === avant && !debords.some(Boolean);
    return { ok, mesure: `prise : barre ${enTete ? 'en tête' : 'PAS en tête'} (${etats(prise)})${ruban ? ', ruban « ' + ruban + ' »' : ''} ; liste : ${etats(segments.map((x) => x.etat))}, ouvrables ${segments.filter((x) => x.bouton).length}/8 ${ouvrablesJustes ? '(points de validation et doutes)' : '(FAUX)'} ; lignes : ${lignes.map((l) => '« ' + l.slice(0, 60) + ' »').join(', ') || 'AUCUNE'} ; Mur ouvert : « ${sousLaBarre.slice(0, 50)} » ; rejeu : ${apresRejeu} segments ; projet ${projet === avant ? 'inchangé' : 'MODIFIÉ'} ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
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
    // Rejouer est un appel facture : il se confirme sur la carte avant de partir (DetailAudit.tsx), et rien ne part sans.
    let confirmation = false;
    if (rejouable) {
      await rejouer.click({ timeout: 30000 });
      await page.waitForTimeout(300);
      confirmation = (await page.locator('.confirmationAuditRecu').count()) > 0 && !s.demande;
      await page.locator('[data-controle="auditsParcelle.confirmerRejeu"]').click({ timeout: 30000 }).catch(() => {});
    }
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
    const ok = confirmation && consultation === 'Avant et après : l’audit reçu' && /Validée/.test(decisionConsultee) && sansValider && deuxVues && projetIntact && retourne
      && titre === 'Audits' && sections.length === 2 && /1 proposition .* 1 validée/.test(conclusion) && vignettes >= 1 && /Validée/.test(decision) && rejouable
      && d?.usage === 'rejeu' && d?.depot === ID && d?.modele === 'claude-sonnet-5-5' && d?.requetes?.length === 3 && images >= 1
      && lignes.length === 2 && /Rejeu/.test(lignes[1] ?? '') && /Claude Sonnet 5\.5/.test(lignes[1] ?? '') && !/En cours/.test(lignes[1] ?? '')
      && /Vous regardez une maison/.test(trace) && /Deux pans/.test(trace) && imageTrace >= 1 && !debordeDetail && !debordeTrace;
    return { ok, mesure: `« ${titre} », sections ${sections.join(' / ')} ; conclusion « ${conclusion.slice(0, 70)} » ; ${vignettes} vignette(s), décision « ${decision.slice(0, 50)} » ; rejeu ${rejouable ? 'actif' : 'GRISÉ (' + raison.slice(0, 80) + ')'}${confirmation ? ', confirmé' : ', SANS confirmation'} ; demande ${d ? d.usage + ', ' + d.modele + ', ' + d.requetes.length + ' requêtes, ' + images + ' image(s), depot ' + d.depot : 'AUCUNE'} ; comparaison ${lignes.length} ligne(s) « ${(lignes[1] ?? '').slice(0, 60)} » ; trace ${/Vous regardez/.test(trace) ? 'entrant' : 'SANS entrant'}, ${/Deux pans/.test(trace) ? 'sortant brut' : 'SANS sortant'}, ${imageTrace} image(s) ; avant/après : « ${consultation} », ${decisionConsultee || 'SANS décision'}, ${sansValider ? 'lecture seule' : 'ÉDITABLE'}, ${deuxVues ? 'deux vues' : 'PAS de deux vues'}, projet ${projetIntact ? 'intact' : 'MODIFIÉ'}, ${retourne ? 'retour aux audits' : 'PAS de retour'} ; débordement ${debordeDetail || debordeTrace ? 'OUI' : 'non'}` };
  },
  109: async (page, f) => {
    // Les donnees d'analyse (lot L0, MD/spec-lecture-ia-elargie.md 4.8), routes `admin/…` simulees : Admin › Audits, « Exporter les
    // données d'analyse » d'une periode et d'un usage, en CSV (un tableur francais : BOM, `;`, une ligne par requete et par
    // proposition, aucune photo) puis en JSON (tel que le serveur le rend) ; puis, sur l'analyse d'une facade gardee avec l'audit,
    // « Rejouer cette façade depuis son image » : la requete gardee repart par la route du rejeu, sans que la page envoie d'image.
    const objets = await page.evaluate(() => JSON.parse(JSON.stringify(window.__plan.etat().objects)));
    const parcelle = objets.find((o) => o.cadastre && typeof o.cadastre.idu === 'string');
    const idu = parcelle?.cadastre?.idu ?? '';
    const ID = '20261029-090000-0000beef', TRACE = '20261029-091000-claude-haiku-5-5-aaaa', SHA = 'a'.repeat(64);
    const ligneRequete = (requete, usage) => ({ nature: 'requete', trace: TRACE, lot: 'immediat', audit: ID, organisation: 'admin', idu, adresse: '=2 allée des Limites', t: '2026-10-29T09:10:00Z',
      finLe: '2026-10-29T09:10:05Z', idBatch: null, requete, batiment: 'facade', facade: null, passe: 1, usage, usageRequete: 'facade', modele: 'claude-haiku-5-5', prompt: 2, schema: 2, essai: false,
      statut: 'reussi', arret: 'end_turn', erreur: null, tokens: { entree: 3000, sortie: 900 }, cout: 0.0015, refusFormat: null, empreintes: [SHA], octets: 4, reponse: 'b'.repeat(64), trouve: null,
      sortie: { confiance: 'moyenne', forme: { silhouette: 'un-sommet', bout: 'pignon' }, ouvertures: [{}, {}] }, texte: '{"confiance":"moyenne"}' });
    const donnees = { format: 'plan-donnees-analyse', version: 1, genereLe: '2026-10-29T11:00:00Z', du: '2026-10-01', au: '2026-10-29', filtres: { modele: null, usage: 'facade' },
      requetes: [ligneRequete('facade-p1', 'facade'), ligneRequete('escalade-p1', 'escalade')],
      propositions: [{ nature: 'proposition', audit: ID, organisation: 'admin', idu, adresse: null, t: '2026-10-29T09:00:00Z', proposition: 'p1', objet: 'Façade sud de Maison', batiment: 'maison', facade: 0,
        effet: 'ouvertures', source: 'claude', avant: '4', apres: '6', confiance: 0.9, reserve: null, decision: 'refusee', moteur: null, accordClaude: 'claude-seul' }] };
    const resume = { id: TRACE, audit: ID, nature: 'immediat', etat: 'termine', creeLe: '2026-10-29T09:10:00Z', finLe: '2026-10-29T09:10:05Z', idBatch: null, organisation: 'admin', usage: 'facade',
      modele: 'claude-haiku-5-5', effort: 'low', prompt: 2, schema: 2, versions: {}, requetes: 3, images: 3, facades: 1, resultats: [], cout: 0.0045, tokens: null };
    const s = { exports: [], rejeu: null };
    await page.route(/\/admin\/(session|demos|audits|claude)/, async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, json = (corps, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });
      if (p.endsWith('/admin/session')) return json({});
      if (p.endsWith('/admin/demos')) return json({ demos: [{ id: '1', name: 'Démonstration' }] });
      if (p.endsWith('/admin/demos/1')) return json({ meta: { id: '1', name: 'Démonstration', schemaVersion: 1 }, objects: objets, measures: [] });
      if (p.endsWith('/admin/audits')) return json({ audits: [{ id: ID, recuLe: '2026-10-29T09:00:00Z', organisation: 'admin', nature: 'parcelle', idu, adresse: null, dossier: null, taille: 2048, marque: 'sauvegarde', photos: 1, phase: 'analyse', debut: '2026-10-29T08:00:00.000Z', propositions: { total: 1, claude: 1, mesures: 0, validees: 0, refusees: 1, enAttente: 0 } }] });
      if (p.endsWith('/admin/audits/' + ID)) return json({ format: 'plan-audit-parcelle', version: 1, parcelle: { idu, adresse: null, origine: null }, code: { version: '5.0.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-29T08:00:00.000Z', finCapture: '2026-10-29T08:30:00.000Z', ecritLe: '2026-10-29T09:00:00.000Z', batiments: [], cloture: { photos: [] }, portail: { photos: [] }, propositions: [], decisions: [] });
      if (p.endsWith('/admin/audits/' + ID + '/analyses')) return json({ analyses: [resume] });
      if (p.endsWith('/admin/audits/' + ID + '/analyses/' + TRACE)) {
        return json({ audit: ID, resume, sortant: null, entrant: { max_tokens: 16000, effort: 'low', usages: {}, requetes: [1, 2, 3].map((n) => ({ id: 'facade-p' + n, passe: n, usage: 'facade', modele: 'claude-haiku-5-5', facades: n === 1 ? 1 : 0, images: 1,
          contenu: [{ type: 'image', media_type: 'image/jpeg', image: SHA + '.jpg', octets: 4 }, { type: 'text', text: 'Façade : sud de Maison.' }] })) } });
      }
      if (p.includes('/admin/audits/' + ID + '/images/')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('/9j/', 'base64') });
      if (p.endsWith('/admin/claude/etat')) return json({ actif: true, modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'], prompt: 9, schema: 9, organisation: 'admin', admin: true });
      if (p.endsWith('/admin/claude/donnees-analyse')) { s.exports.push(Object.fromEntries(u.searchParams)); return json(donnees); }
      if (p.endsWith('/admin/claude/rejouer') && req.method() === 'POST') {
        s.rejeu = JSON.parse(req.postData() || '{}');
        return json({ modele: 'claude-haiku-5-5', prompt: 2, schema: 2, trace: '20261029-120000-claude-haiku-5-5-bbbb', source: TRACE, resultats: [1, 2, 3].map((n) => ({ id: 'rejeu-p' + n, statut: 'reussi', passe: n, sortie: {}, erreur: null, cout: 0.0015 })) });
      }
      return json({ error: { code: 'NOT_FOUND', message: 'route simulée absente : ' + p } }, 404);
    });
    await page.goto(BASE + '/?demofile=1');
    await page.waitForSelector('#stage svg', { timeout: 30000 });
    await page.waitForTimeout(500);
    const garder = page.getByRole('button', { name: 'Garder tel quel' });
    if (await garder.count()) { await garder.click(); await page.waitForTimeout(150); }
    await page.evaluate(() => window.__plan.executer('admin.auditsParcelle'));
    await page.locator('.carteAuditRecu').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.locator('.exportDonneesAnalyse summary').click({ timeout: 30000 });
    await page.locator('[data-controle="auditsParcelle.exportDu"]').fill('2026-10-01');
    await page.locator('[data-controle="auditsParcelle.exportAu"]').fill('2026-10-29');
    await page.locator('[data-controle="auditsParcelle.exportUsage"]').selectOption('facade');
    const debordeExport = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditsParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const csvTexte = (await telechargerOctets(page, () => page.locator('[data-controle="auditsParcelle.exporterDonneesCsv"]').click(), 20000)).toString('utf8');
    const lignes = csvTexte.replace(/^﻿/, '').trimEnd().split('\r\n');
    const entetes = (lignes[0] ?? '').split(';');
    const jsonTexte = (await telechargerOctets(page, () => page.locator('[data-controle="auditsParcelle.exporterDonneesJson"]').click(), 20000)).toString('utf8');
    let lu = null;
    try { lu = JSON.parse(jsonTexte); } catch { /* lu reste null : le point le dit */ }
    // Le rejeu d'une facade depuis son image gardee, sur l'analyse ouverte de l'audit.
    await page.locator('.carteAuditRecu [data-controle="auditsParcelle.details"]').first().click({ timeout: 30000 });
    await page.locator('.tableComparaison [data-controle="auditsParcelle.voirAnalyse"]').first().click({ timeout: 30000 }).catch(() => {});
    await page.locator('.traceAudit').waitFor({ timeout: 30000 }).catch(() => {});
    const boutons = await page.locator('[data-controle="auditsParcelle.rejouerFacade"]').count();
    await page.locator('.traceAudit details.blocTrace summary').first().click({ timeout: 15000 }).catch(() => {});
    await page.locator('[data-controle="auditsParcelle.rejouerFacade"]').first().click({ timeout: 15000 }).catch(() => {});
    for (let i = 0; i < 40 && !s.rejeu; i++) await page.waitForTimeout(250);
    const debordeTrace = await page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || [...document.querySelectorAll('.dialogueAuditsParcelle')].some((d) => d.scrollWidth > d.clientWidth + 1), f.width);
    const filtre = s.exports[0] ?? {};
    const ok = csvTexte.startsWith('﻿') && entetes[0] === 'Nature' && lignes.length === 4 && /^requête;/.test(lignes[1] ?? '') && /^proposition;/.test(lignes[3] ?? '')
      && entetes.includes('sortie.forme.silhouette') && !csvTexte.includes('"confiance":"moyenne"') && /'=2 allée/.test(csvTexte)
      && lu?.format === 'plan-donnees-analyse' && lu?.requetes?.length === 2 && filtre.du === '2026-10-01' && filtre.au === '2026-10-29' && filtre.usage === 'facade'
      && boutons === 1 && s.rejeu?.audit === ID && s.rejeu?.trace === TRACE && s.rejeu?.requete === 'facade-p1' && s.rejeu?.passes === 3 && !('contenu' in (s.rejeu ?? {}))
      && !debordeExport && !debordeTrace;
    return { ok, mesure: `export : ${s.exports.length} demande(s) (du ${filtre.du ?? '?'} au ${filtre.au ?? '?'}, usage ${filtre.usage ?? 'tous'}) ; CSV ${csvTexte.startsWith('﻿') ? 'avec BOM' : 'SANS BOM'}, ${lignes.length - 1} ligne(s), ${entetes.length} colonnes ; JSON ${lu?.format ?? 'ILLISIBLE'} ; rejeu : ${boutons} bouton(s), ${s.rejeu ? 'demande ' + s.rejeu.requete + ' ×' + s.rejeu.passes + ' (audit ' + (s.rejeu.audit === ID ? 'nommé' : 'ABSENT') + ')' : 'AUCUNE demande'} ; débordement ${debordeExport || debordeTrace ? 'OUI' : 'non'}` };
  },
  93: async (page, f) => {
    // Admin › Règles (`?admin&ecran=regles`, MD/architecture.md §5.2.4) : les neuf sujets du depot, le
    // prompt livre a l'octet, puis une edition qui se voit tout de suite dans le prompt (une ligne change,
    // version 10), le brouillon enregistre sur le serveur (simule : enregistrer, relire, retirer), l'onglet
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
    // Le brouillon sur le serveur : enregistre (version 10, prompt edite), dit, puis retire.
    const etatServeur = async () => ((await page.locator('p[role="status"]').first().textContent()) || '').replace(/\s+/g, ' ');
    const avantServeur = await etatServeur();
    await page.getByRole('button', { name: 'Enregistrer sur le serveur', exact: true }).click();
    await page.waitForFunction(() => /prompt version 10/.test(document.querySelector('p[role="status"]')?.textContent || ''), null, { timeout: 10000 });
    const apresEnregistrement = await etatServeur();
    const gardeAuServeur = !!surServeur && surServeur.prompt === 10 && surServeur.prompt_texte.includes('vu sur le versant sud') && Array.isArray(surServeur.etat?.liste);
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
    const ok = sujets === 9 && /9 \/ 9/.test(avant[0] || '') && /Identique/.test(avant[4] || '') && (promptLivre || '').includes('# Rôle') && (promptLivre || '').includes('Lire les pignons')
      && /1 ligne change/.test(apresEdition[4] || '') && /version 10/.test(apresEdition[4] || '') && (promptEdite || '').includes('vu sur le versant sud')
      && /Aucun brouillon sur le serveur/.test(avantServeur) && /prompt version 10.*\?regles=local/.test(apresEnregistrement) && gardeAuServeur && retire
      && /1 ligne change/.test(fichierToits) && /L’empreinte passe de/.test(fichierToits) && new RegExp('LECTURES_TOITS.*version: ' + versionLectureSuivante() + '.*formes: ').test(ligneVersion) && faitsListes && donneesRevenues
      && sansCheminees && avecNouveau === true && dansSchema === true && /^Bon /.test(controle.trim())
      && apresRechargement === 10 && /9 \/ 9/.test(revenu[0] || '') && /Identique/.test(revenu[4] || '') && stocke === null
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
      && cas.length === 3 && cas.some((t) => /lu deux-pans/.test(t)) && claude === nombreAttributsClaude();
    return { ok, mesure: `tuiles « ${tuiles.slice(0, 3).join(' | ')} » ; formes ${formes.join(', ')} (façades ${facades}) ; régions ${regions.join(', ')} ; problèmes ${problemes.join(', ')} ; ${cas.length} cas ; Claude ${claude} attributs ; débordement ${debords.map((d) => (d ? 'OUI' : 'non')).join('/')}` };
  },
  95: async (page, f) => {
    // Admin › « De l'IGN a ma maison » (`?admin&ecran=chaine`) : le schema des sept etapes, les vingt-neuf vignettes 3D (toutes les formes
    // du catalogue et toutes les lucarnes : gambrel, demi-croupe, papillon, coyau, berceau, tourelles, meuniere, rampante...), le filtre par mode qui attenue le reste, un lien vers l'ecran des regles,
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
    const lecture = ((await page.locator('.chaineLecture').textContent()) || '').replace(/\s+/g, ' ');
    const seuils = await page.locator('.chaineSeuils li').count();
    const lues = await page.locator('.chaineLu').count();
    const perimees = await page.locator('ul.chaineErreur li').count();
    const sans = !(await deborde());
    const formesVoulues = ['Gambrel', 'Demi-croupe', 'Lucarne meunière', 'Lucarne rampante', 'Papillon', 'Coyau', 'Berceau', 'Carène', 'Conique', 'Dôme', 'Impériale', 'Shed', 'Œil-de-bœuf', 'Outeau', 'Lanterneau'].every((m) => nomsVignettes.includes('Vue 3D : ' + m));
    const ok = etapes === 7 && vignettes >= 29 && formesVoulues && polygones > 400 && lienRegles >= 1 && attenuees > 0 && apres === 0 && cibleExiste && sans && /Lu en direct des fichiers : prompt v\d+/.test(lecture) && seuils > 5 && lues > 5 && perimees === 0;
    return { ok, mesure: `${etapes} étapes ; ${vignettes} vignettes 3D, ${polygones} facettes ; les formes du catalogue et les lucarnes ${formesVoulues ? 'présentes' : 'ABSENTES'} ; ${lienRegles} lien(s) vers l’écran des règles ; filtre « Manuel » : ${attenuees} ligne(s) atténuée(s), « Tout » : ${apres} ; renvoi ${cibleExiste ? 'vers sa cible' : 'CASSÉ'} ; « ${lecture.slice(0, 60)}… », ${seuils} seuil(s) lus, ${lues} ligne(s) venues des données, ${perimees} ligne(s) périmée(s) ; débordement ${sans ? 'non' : 'OUI'}` };
  },
  97: async (page, f) => {
    // Mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md) : « Modifier la toiture » sur la maison, un panneau avec ses vues et son catalogue, un
    // panneau solaire pose sur le toit, « Valider » : l'element est la, une seule etape d'historique, un Ctrl+Z le retire ; rien ne deborde.
    await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.key === 'maison');
      o.pts = [{ x: -8, y: -20 }, { x: 2, y: -20 }, { x: 2, y: -14 }, { x: -8, y: -14 }];
      const b = (o.batiment ??= {});
      delete b.facades; delete b.corpsToit; delete b.volumesToit; delete b.toitMesure;
      // Les listes par sommet suivent le contour : quatre sommets, quatre entrees (sinon l'inspecteur lit au-dela).
      o.vertexNames = ['A', 'B', 'C', 'D']; o.segmentNames = ['', '', '', '']; o.frozenVertices = [false, false, false, false];
      o.elevation = 4; b.toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' };
      window.__plan.toucher('maison');
      window.__plan.etat().measures.length = 0;
      window.__plan.selectionnerCle('maison');
    });
    await page.evaluate(() => window.__plan.executer('vue.3d'));
    await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 40000 });
    await image3dStable(page, 3000);
    const aucunAvant = (await page.locator('.panneauToit').count()) === 0;
    await page.locator('#terrasse3dModifierToit').click({ timeout: 30000 });
    await page.locator('.panneauToit').waitFor({ timeout: 20000 });
    const vues = await page.locator('.panneauToit [data-commande^="toit.vue"], .panneauToit [data-commande="toit.isolerCorps"]').count();
    const onglets = await page.locator('.toitOnglet').count();
    await page.locator('.toitOnglet', { hasText: 'Sur le toit' }).click();
    await page.locator('[data-piece="sur:solaire"]').click({ timeout: 30000 });
    await page.waitForFunction(() => !!window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit?.[0]?.elementsToit?.length, null, { timeout: 60000 });
    const pastilles = await page.locator('.puceToit').count();
    // De face, la poignee « Hauteur à l'égout » du corps (le panneau pose l'a cree) : tiree vers le haut, le corps monte, l'elevation
    // suit et se dit choisie. Le panneau pose est d'abord lache (choisi, il montrerait ses propres poignees), la facade se choisit sur
    // le plan des facades, replie ou non (au telephone, il est un bouton).
    await page.evaluate(() => window.__plan.executer('toit.selection'));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('polygon.corpsNav[data-corps="0"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__plan.executer('toit.vueFacade'));
    await page.waitForTimeout(1200);
    const maisonToit = () => page.evaluate(() => { const o = window.__plan.etat().objects.find((x) => x.key === 'maison'); const c = o.batiment?.corpsToit?.[0]; return { e: c ? Math.min(...c.egouts) : null, elevation: o.elevation, choisi: o.batiment?.egoutChoisi ?? null }; });
    const poigneeEgout = page.locator('[data-poignee="egout"] .pointPoignee');
    const nEgout = await poigneeEgout.count();
    const avantEgout = await maisonToit();
    const boite = nEgout ? await poigneeEgout.first().boundingBox() : null;
    if (boite) await glisser(page, { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2 }, 0, -40);
    const apresEgout = await maisonToit();
    const egoutTire = nEgout === 1 && avantEgout.e !== null && apresEgout.e > avantEgout.e + 0.1 && Math.abs(apresEgout.elevation - apresEgout.e) < 1e-6 && apresEgout.choisi === 'saisie';
    const historiqueAvant = await page.evaluate(() => window.__plan.magasin().peutAnnuler);
    await page.locator('[data-commande="toit.valider"]').click({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.panneauToit').length === 0, null, { timeout: 30000 });
    const historiqueApres = await page.evaluate(() => window.__plan.magasin().peutAnnuler);
    await page.evaluate(() => window.__plan.executer('objet.annuler'));
    const retire = await page.evaluate(() => { const o = window.__plan.etat().objects.find((x) => x.key === 'maison'); return !o.batiment?.corpsToit?.length && o.elevation === 4 && !o.batiment?.egoutChoisi; });
    const sans = !(await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width));
    const ok = aucunAvant && vues === 4 && onglets === 4 && egoutTire && pastilles >= 1 && !historiqueAvant && historiqueApres && retire && sans;
    return { ok, mesure: `panneau absent avant : ${aucunAvant}, ${vues} vues, ${onglets} onglets ; poignée de l’égout : ${nEgout}, égout ${avantEgout.e} → ${apresEgout.e} m, élévation ${apresEgout.elevation} (${apresEgout.choisi ?? 'non choisie'}) ; ${pastilles} pastille(s) ; historique ${historiqueAvant} → ${historiqueApres} ; un Ctrl+Z ${retire ? 'retire tout' : 'LAISSE le toit ou la hauteur'} ; débordement ${sans ? 'non' : 'OUI'}` };
  },
  98: async (page, f) => {
    // Mode Toit : le geste n'agit que sur le corps choisi. Une aile posee contre la maison, puis choisie (pastille) : sa silhouette se
    // trace sur la scene ; une cheminee posee va sur elle seule. Vue de dessus, la poignee qui deplace le corps est un carre a fleches,
    // distinct des poignees rondes qui l'etirent ; rien ne deborde.
    await page.evaluate(() => {
      const o = window.__plan.etat().objects.find((x) => x.key === 'maison');
      o.pts = [{ x: -8, y: -20 }, { x: 2, y: -20 }, { x: 2, y: -14 }, { x: -8, y: -14 }];
      const b = (o.batiment ??= {});
      delete b.facades; delete b.corpsToit; delete b.volumesToit; delete b.toitMesure;
      o.vertexNames = ['A', 'B', 'C', 'D']; o.segmentNames = ['', '', '', '']; o.frozenVertices = [false, false, false, false];
      o.elevation = 4; b.toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' };
      window.__plan.toucher('maison');
      window.__plan.etat().measures.length = 0;
      window.__plan.selectionnerCle('maison');
    });
    await page.evaluate(() => window.__plan.executer('vue.3d'));
    await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 40000 });
    await image3dStable(page, 3000);
    await page.locator('#terrasse3dModifierToit').click({ timeout: 30000 });
    await page.locator('.panneauToit').waitFor({ timeout: 20000 });
    const corps = () => page.evaluate(() => window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit ?? []);
    await page.locator('.toitOnglet', { hasText: 'Corps' }).click();
    await page.locator('[data-piece="corps:aile"]').click({ timeout: 30000 });
    await page.waitForFunction(() => (window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit?.length ?? 0) >= 2, null, { timeout: 60000 });
    const rang = (await corps()).length - 1;
    await page.locator('.puceToit[data-type="corps"][data-rang="' + rang + '"]').click({ timeout: 30000 });
    await page.evaluate(() => window.__plan.executer('toit.vueLibre'));
    await page.waitForTimeout(800);
    const silhouette = await page.locator('.silhouetteCorpsToit .trait').count();
    // Les poignees et la bulle suivent la silhouette : le faitage dit est celui de l'aile choisie, pas celui de la maison.
    const faitageAile = ((await corps())[rang]?.faitage ?? 0).toFixed(2).replace('.', ',') + ' m';
    const faitageDit = ((await page.locator('.cotesToit [data-cote="h"]').first().textContent({ timeout: 5000 }).catch(() => '')) || '').trim();
    const surLAile = faitageDit === faitageAile && (await page.locator('[data-poignee="egout"]').count()) === 1;
    const indice = (await page.locator('.panneauToit .indiceToit').allTextContents()).join(' ');
    await page.locator('.toitOnglet', { hasText: 'Sur le toit' }).click();
    await page.locator('[data-piece="sur:cheminee"]').click({ timeout: 30000 });
    await page.waitForFunction((r) => !!window.__plan.etat().objects.find((x) => x.key === 'maison').batiment?.corpsToit?.[r]?.cheminees?.length, rang, { timeout: 60000 });
    const apres = await corps();
    const surLeChoisi = (apres[rang]?.cheminees?.length ?? 0) === 1 && apres.filter((c, k) => k !== rang && c.cheminees?.length).length === 0;
    await page.locator('.puceToit[data-type="corps"][data-rang="' + rang + '"]').click({ timeout: 30000 });
    await page.evaluate(() => window.__plan.executer('toit.vueDessus'));
    await page.waitForTimeout(1200);
    const deplacer = await page.locator('.poigneeToit.deplacer rect.pointPoignee').count();
    const rondes = await page.locator('.poigneeToit:not(.deplacer) circle.pointPoignee').count();
    const sans = !(await page.evaluate((l) => document.documentElement.scrollWidth > l + 1, f.width));
    const ok = silhouette === 1 && surLAile && /seulement/.test(indice) && surLeChoisi && deplacer === 1 && rondes >= 1 && sans;
    return { ok, mesure: `silhouette du corps choisi : ${silhouette} trait(s) ; poignées ${surLAile ? 'sur lui' : 'AILLEURS'} (faîtage dit ${faitageDit || '—'}, le sien ${faitageAile}) ; indice « ${indice.slice(0, 70)} » ; cheminée ${surLeChoisi ? 'sur le corps choisi seul' : 'AILLEURS'} ; poignées de dessus : ${deplacer} de déplacement (carré), ${rondes} ronde(s) ; débordement ${sans ? 'non' : 'OUI'}` };
  },
  96: async (page, f) => {
    // Admin › Principes (`?admin&ecran=principes`) : un sommaire par famille qui mene a chaque principe, trois angles par principe
    // (processus, actions, coulisses), le choix d'un angle qui masque les autres, la recherche qui filtre, un lien vers l'ecran des regles ; rien ne deborde.
    await page.route(/\/admin\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(BASE + '/?admin&ecran=principes');
    await page.waitForSelector('.princFiche', { timeout: 20000 });
    const deborde = () => page.evaluate((l) => document.documentElement.scrollWidth > l + 1 || window.innerWidth > l + 1, f.width);
    const fiches = await page.locator('article.princFiche').count();
    const liens = await page.locator('.princSommaire a').count();
    const angles = await page.locator('section[data-angle]').count();
    const lienRegles = await page.locator('a.princEcran[href="?admin&ecran=regles"]').count();
    const cible = await page.locator('.princSommaire a').first().getAttribute('href');
    const cibleExiste = !!cible && (await page.locator('[id="' + cible.slice(1) + '"]').count()) > 0;
    await page.getByRole('button', { name: 'Coulisses', exact: true }).click();
    const seules = await page.locator('section[data-angle="coulisses"]').count();
    const autres = await page.locator('section[data-angle="processus"], section[data-angle="actions"]').count();
    await page.getByRole('button', { name: 'Tout', exact: true }).click();
    await page.getByLabel('Chercher un principe').fill('poids');
    const filtres = await page.locator('article.princFiche').count();
    await page.getByLabel('Chercher un principe').fill('xyzzy');
    const aucun = await page.locator('article.princFiche').count();
    await page.getByLabel('Chercher un principe').fill('');
    const sans = !(await deborde());
    const ok = fiches >= 12 && liens === fiches && angles === 3 * fiches && lienRegles >= 1 && cibleExiste && seules === fiches && autres === 0 && filtres > 0 && filtres < fiches && aucun === 0 && sans;
    return { ok, mesure: `${fiches} principes, ${liens} liens de sommaire, ${angles} angles ; ${lienRegles} lien(s) vers les règles, ancre ${cibleExiste ? 'trouvée' : 'CASSÉE'} ; angle « Coulisses » : ${seules} bloc(s), ${autres} autre(s) ; recherche « poids » : ${filtres} principe(s), « xyzzy » : ${aucun} ; débordement ${sans ? 'non' : 'OUI'}` };
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
    const lu = () => page.evaluate((k) => window.__plan.etat().objects.find((o) => o.bdtopo?.cleabs === k)?.batiment?.toitLidarLu ?? null, cle);
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
  99: async (page) => {
    // Le fichier du projet : Fichier › « Exporter le projet (JSON) », un sommet de la terrasse tire,
    // puis Fichier › « Importer un projet (JSON) » de ce meme fichier (« Remplacer le plan actuel »,
    // coche par defaut). Le plan doit revenir a l'identique : memes objets, memes sommets, memes cotes.
    const etape = async (nom, g) => { try { return await g(); } catch (e) { throw new Error(nom + ' : ' + e.message.split('\n')[0]); } };
    const empreinte = (e) => JSON.stringify({ objets: e.objects.map((o) => [o.key, o.name, o.pts]), cotes: e.measures.length });
    const depart = await lireEtat(page);
    const octets = await etape('exporter', () => telechargerOctets(page, () => entreeFichier(page, 'fichier.exporterJson'), 20000));
    const fichier = JSON.parse(octets.toString('utf8'));
    await selectionner(page, TERRASSE);
    const terr = objet(await lireEtat(page), (o) => o.name === 'Terrasse');
    const i = terr.pts.findIndex((_, k) => !(terr.frozenVertices || [])[k]);
    await glisser(page, await centreDe(page, `[data-role="point"][data-key="${terr.key}"][data-index="${i}"]`), 30, 20);
    const modifie = await lireEtat(page);
    const [choix] = await etape('importer', () => Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), entreeFichier(page, 'fichier.importerJson')]));
    await choix.setFiles({ name: 'projet.json', mimeType: 'application/json', buffer: octets });
    const attendu = empreinte(depart);
    await page.waitForFunction((a) => {
      const e = window.__plan.etat();
      return JSON.stringify({ objets: e.objects.map((o) => [o.key, o.name, o.pts]), cotes: e.measures.length }) === a;
    }, attendu, { timeout: 20000 }).catch(() => {});
    const rouvert = await lireEtat(page);
    const avantModif = empreinte(modifie) !== attendu;
    const revenu = empreinte(rouvert) === attendu;
    const ok = Array.isArray(fichier.objects) && fichier.objects.length === depart.objects.length && avantModif && revenu;
    return { ok, mesure: `exporté : ${octets.length} octets, ${Array.isArray(fichier.objects) ? fichier.objects.length : '?'} objets (plan : ${depart.objects.length}) ; sommet ${i} tiré : plan ${avantModif ? 'modifié' : 'INCHANGÉ'} ; rouvert : ${revenu ? 'identique au fichier' : 'DIFFÉRENT (' + rouvert.objects.length + ' objets)'}` };
  },
  120: async (page, f) => {
    // La lecture du reglement de la zone par Claude (lot L4) : le point 15 (import par adresse, zonage du GPU, reseau temoin), puis
    // « Lire le règlement de la zone avec Claude ». Le PDF du reglement est servi par l'extrait public du depot
    // (tests/fixtures/plu/chatou-ul-extrait.pdf) : le vrai reglement de la parcelle temoin pese des megaoctets et ne se range pas en
    // donnees temoin. `admin/claude/messages` rend une lecture SYNTHETIQUE (pas Claude) : deux regles, dont une qui ne se mesure pas.
    // On coche les deux, on lit la conformite, on annule une validation, et le projet exporte porte le reglement au schema 8.
    const imp = await POINTS[15](page, f);
    if (!imp.ok) return { ok: imp.ok, mesure: 'zonage préalable : ' + imp.mesure };
    // Le projet cree par l'import est au schema 5 : Plan pose a l'ouverture la question « Mettre à jour le modèle ? », qui arrive
    // quand elle veut et, ouverte, retient Ctrl+Z. On la laisse « tel quel » (le schema s'ecrira de lui-meme au 8 avec le reglement).
    const garderTelQuel = async () => {
      const b = page.getByRole('button', { name: 'Garder tel quel' });
      if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(200); }
    };
    await page.getByRole('button', { name: 'Garder tel quel' }).waitFor({ timeout: 5000 }).catch(() => {});
    await garderTelQuel();
    const pdf = readFileSync(new URL('../tests/fixtures/plu/chatou-ul-extrait.pdf', import.meta.url));
    await page.route(/^https:\/\/data\.geopf\.fr\/annexes\/gpu\/documents\//, (route) => route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: pdf }));
    const recues = [];
    const SORTIE = { zone: { libelle: 'psmv', trouvee: 'oui' }, regles: [
      { grandeur: 'emprise-max', valeur: 30, unite: 'pourcent', termes: [], condition: '', article: 'UL 9.2', citation: 'Dans le secteur ULp, l’emprise au sol ne doit pas excéder 30% de la superficie totale du terrain.', page: 2, confiance: 'forte' },
      { grandeur: 'couleurs', valeur: 'indetermine', unite: 'aucune', termes: [], condition: '', article: 'UL 11.4', citation: 'Les couleurs des façades seront choisies dans le nuancier communal.', page: 3, confiance: 'moyenne' },
    ], remarques: 'Lecture synthétique de la fumée.' };
    await page.route(/\/admin\/claude\/messages$/, async (route) => {
      const d = JSON.parse(route.request().postData() || 'null');
      recues.push(d);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1,
        resultats: [{ id: 'plu', statut: 'reussi', passe: 1, usage: 'plu', sortie: SORTIE, brut: JSON.stringify(SORTIE), erreur: null, cout: 0.0042, synthetique: true }] }) });
    });
    if (await classe(page) === 'compact') await feuille(page, 'resultats');
    await page.evaluate(() => window.__plan.ouvrirResultats('plu'));
    await page.locator('[data-commande="plu.lireReglement"]').waitFor({ timeout: 15000 });
    await page.evaluate(() => window.__plan.executer('plu.lireReglement'));
    await page.waitForFunction(() => !!window.__plan.etat().objects.find((o) => o.key === 'parcelle')?.reglementPlu, null, { timeout: 60000 }).catch(() => {});
    const lu = objet(await lireEtat(page), (o) => o.key === 'parcelle')?.reglementPlu;
    if (!lu) return { ok: false, mesure: 'aucun règlement rangé sur la parcelle ; ' + recues.length + ' demande(s) à Claude' };
    const demande = recues[0];
    const document = demande?.requetes?.[0]?.contenu?.find((b) => b.type === 'document');
    const proposes = lu.faits.filter((x) => x.statut === 'propose').length;
    const avantValidation = await page.locator('#pluConformite').innerText();
    // Cocher les deux regles, comme la personne, une fois comparees au texte.
    for (const id of ['f1', 'f2']) {
      await page.locator(`[data-fait="${id}"] input[type="checkbox"]`).evaluate((e) => e.click());
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => document.querySelectorAll('#pluConformite .pluVerdict').length >= 2, null, { timeout: 10000 }).catch(() => {});
    const verdicts = await page.locator('#pluConformite .pluVerdict').evaluateAll((l) => l.map((e) => e.getAttribute('data-etat') + ' : ' + e.textContent.slice(0, 90)));
    const bilan = await page.locator('#pluBilan').innerText().catch(() => '');
    const source = await page.locator('#pluSourceLecture').innerText().catch(() => '');
    // L'article et la citation restent mot pour mot (le tiroir ecrit les decimales a la francaise partout ailleurs).
    const article = await page.locator('[data-fait="f1"] .texteVerbatim').last().innerText().catch(() => '');
    // `FUMEE_CAPTURE_L4=<prefixe>` : l'onglet, regles cochees et conformite en vue, une image par classe et theme.
    if (process.env.FUMEE_CAPTURE_L4) {
      await page.locator('#pluFaits, .pluFaits').first().evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {});
      await page.screenshot({ path: process.env.FUMEE_CAPTURE_L4 + '-' + f.nom + '.png' }).catch(() => {});
    }
    // Ctrl+Z defait la derniere validation.
    await page.waitForTimeout(300);
    await garderTelQuel();
    // La relecture des toits en tache de fond (apres l'import) peut ecrire entre-temps dans l'historique : on annule jusqu'a trois
    // fois, et la mesure dit combien il en a fallu ; la premiere regle doit rester validee.
    const statuts = () => page.evaluate(() => window.__plan.etat().objects.find((o) => o.key === 'parcelle')?.reglementPlu?.faits.map((x) => x.statut).join(','));
    let annulations = 0;
    while (annulations < 3 && (await statuts()) === 'valide,valide') {
      annulations++;
      await page.evaluate(() => window.__plan.executer('objet.annuler'));
      await page.waitForTimeout(300);
    }
    const apresAnnuler = objet(await lireEtat(page), (o) => o.key === 'parcelle')?.reglementPlu?.faits.map((x) => x.statut).join(',');
    // Rien ne deborde de l'onglet.
    const deborde = await page.evaluate(() => {
      const p = document.getElementById('panelPlu');
      if (!p || p.scrollWidth <= p.clientWidth + 1) return '';
      // Ce qui depasse : l'element le plus profond dont le bord droit sort de l'onglet.
      const droite = p.getBoundingClientRect().right + 1;
      const hors = [...p.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > droite && ![...e.children].some((c) => c.getBoundingClientRect().right > droite));
      return hors.slice(0, 3).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '') + ' « ' + (e.textContent || '').slice(0, 40) + ' »').join(', ') || 'onglet';
    });
    const fichier = JSON.parse(await telecharger(page, () => page.evaluate(() => window.__plan.executer('fichier.exporterJson'))));
    const porteur = fichier.objects.find((o) => o.reglementPlu);
    const ok = !!document && demande.usage === 'plu' && document.source.media_type === 'application/pdf' && proposes === 2 && /Aucune règle retenue/.test(avantValidation)
      && verdicts.some((v) => v.startsWith('a-verifier')) && verdicts.some((v) => /^(ecart|conforme) : .*Emprise au sol/.test(v)) && /synthétique/.test(source)
      && apresAnnuler === 'valide,propose' && article === 'UL 9.2' && !deborde && !!porteur && fichier.meta?.schemaVersion === 8;
    return { ok, mesure: `${recues.length} demande(s) usage ${demande?.usage}, PDF ${document ? Math.round(document.source.data.length * 3 / 4 / 1024) + ' Ko' : 'ABSENT'} ; `
      + `${lu.faits.length} règle(s), ${proposes} proposée(s) décochée(s) ; cochées : « ${bilan} » ; ${verdicts.join(' | ')} ; article « ${article} » ; source « ${source.replace(/\s+/g, ' ').slice(0, 120)} » ; `
      + `Ctrl+Z ×${annulations} → ${apresAnnuler} ; ${deborde ? 'DÉBORDE (' + deborde + ')' : 'rien ne déborde'} ; exporté au schéma ${fichier.meta?.schemaVersion}, reglementPlu ${porteur ? 'présent' : 'ABSENT'}` };
  }
};

/** Quels points se jouent dans quelle classe : les 25 d'origine partout, ceux du mobile au telephone, les garde-fous (49 a 53), l'audit de la parcelle (60, 61) et la suite. */
function pointsPour(nomClasse) {
  const base = [...Array(25).keys()].map((i) => i + 1);
  const mobile = nomClasse === 'compact' ? [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39] : [];
  // Les garde-fous de l'inspecteur partout ; la decouverte une fois, elle parcourt deja les trois classes.
  // 57 : le tableau de bord de la consommation de Claude ; 60 et 61 : l'audit de la parcelle, liste et prise (lot L9) ;
  // 62 et 63 : ses propositions, l'apercu avant / apres, la validation et Ctrl+Z (lot L11).
  // 73 : l'essai des faits des toits (lot L20) ; 64 : le batiment verifie sur place protege de l'actualisation (lot L12).
  // (54, 58, 59, 65, 67, 68, 71, 80, 81, 82 : la capture du releve de facade, partie dans l'audit au lot F6 ; voir 112 a 114.)
  // 69 et 70 : l'analyse par Claude, accord et propositions (lot L17).
  // 74 et 75 : le fichier de l'audit de parcelle, partage et import (lot L21).
  // 76 et 77 : l'ecran Admin › Conformité, indicateurs et mesure rangee (lot G3).
  // 84 : la vue a hauteur d'homme de « Photographier en marchant », qui suit la boussole ; facades rouge et vertes, facade touchee.
  // 85 : la sauvegarde de l'audit de parcelle sur le serveur, et Admin › Audits qui la rouvre (§15).
  // 86 : Admin › Audits : donnees, conclusion, analyses cote a cote, rejeu par modele et son detail (§15.4, §15.5).
  // 88 : la vue epuree et la vue d'ensemble de l'audit de parcelle ; les propositions laissent voir la maison.
  // 89 : le trait renforce de la facade, de pres.
  // 90 : l'avant et l'apres des propositions en deux vues de la Vue 3D, synchronisees.
  // 91 et 92 : les arbres d'EZ-tree en instances, et Admin › Arbres.
  // 93 : Admin › Regles : les sujets de l'audit, le prompt et le schema recalcules en direct.
  // 95 : Admin › « De l'IGN a ma maison » : le schema de bout en bout et les vignettes 3D des formes de toit. 96 : Admin › Principes.
  // 97 et 98 : le mode Toit, son panneau, et le corps choisi (seule cible des gestes, silhouette tracee, poignee de deplacement).
  // 99 : le fichier du projet, exporte en JSON puis rouvert par le menu Fichier.
  // 66 : retoucher la forme d'un objet de l'IGN, apres l'avertissement ; la case « Reprendre la version de l'IGN » ensuite.
  // 100 : Admin › Calibrer la detection, le rejeu d'un cas par l'enchainement de la facade : la barre de progression et la frise (lot F0).
  // 101 : son mode « IA », une reponse enregistree du run de la facade rejouee sans reseau (lot F2).
  // 102 : l'audit de la parcelle, une facade calculee par l'orchestrateur en mode discret, avec la meme barre (lot F3).
  // 103 : l'escalade d'une facade a la demande, dans la calibration (decision du 29 octobre 2026).
  // 104 : le diagnostic de forme d'une facade, sa proposition de toit sur le bon corps, confirmee dans l'avant/apres (lot F4).
  // 105 : la validation d'une facade (V4) : sa Facade ecrite dans le projet, lue par la 3D et l'inspecteur (lot F5).
  // 106 : une cheminee lue sur la photo, proposee decochee, posee par le moteur sur le bon corps une fois cochee (lot F7).
  // 108 : les carreaux d'une facade validee dessines dans les fenetres de la Vue 3D (lot F8).
  // 109 : les donnees d'analyse : l'export a travers les audits (CSV, JSON) et le rejeu d'une facade depuis son image gardee (lot L0).
  // 112 : le parcours complet d'une facade, de « Photographier » dans l'inspecteur a l'editeur du releve (lot F6) ;
  // 113 : deux vues du meme mur fondues dans l'audit ; 114 : « Créer un cas depuis cette façade », lu par la calibration (lot F6).
  // 120 : la lecture du reglement de la zone du PLU par Claude, ses regles validees et la conformite du projet (lot L4).
  // 110, 111 et 115 : le jardin (lot L3) : la plate-bande et sa vegetation en 3D, le regard, la lecture du jardin acceptee dans l'avant/apres.
  // 116 et 117 : la facade enrichie (lot L1) : menuiseries, garde-corps, modenature, store et signal lus, valides et dessines ; un
  // bow-window lu, propose decoche, pose par le moteur des toits.
  // 118 et 119 : le toit lu sur une facade (lot L2) : une couverture en ecaille lue et dessinee ; une fenetre de toit posee par le moteur.
  const gardeFous = [49, 50, 51, 52, ...(nomClasse === 'large' ? [53] : []), 57, 60, 61, 62, 63, 64, 66, 69, 70, 73, 74, 75, 76, 77, 84, 85, 86, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120];
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
  // Le niveau de la Vue 3D est une preference de l'appareil, lue dans le navigateur (app/ecouteurs/vue3d.ts).
  const qualite = process.env.FUMEE_QUALITE_3D;
  if (qualite) await page.addInitScript((q) => { try { localStorage.setItem('plan.qualite3d', q); } catch { /* stockage absent : niveau detecte */ } }, qualite);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  // Un objet que le plan n'a pas redessine alors qu'il avait change (render/pipeline.ts, cle de version) : un chemin d'ecriture
  // qui ne touche pas son objet (core/controleurObjets.ts). Le serveur de developpement le dit dans la console.
  page.on('console', (m) => { if (m.type() === 'error' && m.text().startsWith('[cle de version]')) erreurs.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  // Un point qui ne conclut pas dans le delai echoue sous son nom : sans cela, une attente sans fin
  // ne se lisait qu'a la coupure du job, sans dire quel point pendait ni ou.
  const delai = Number(process.env.FUMEE_DELAI_POINT) * 1000;
  let minuteur;
  const borne = delai > 0
    ? new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error(`délai dépassé : le point n'a pas conclu en ${delai / 1000} s`)), delai); })
    : null;
  let r;
  try {
    const partie = (async () => { await ouvrirDemo(page); return POINTS[n](page, f); })();
    // Apres le delai, la partie abandonnee echoue a la fermeture du contexte : rien ne l'attend plus.
    partie.catch(() => {});
    r = await (borne ? Promise.race([partie, borne]) : partie);
  } catch (e) {
    r = { ok: false, mesure: (/^délai dépassé/.test(e.message) ? '' : 'erreur du script : ') + e.message.split('\n')[0].slice(0, 160) };
  } finally {
    clearTimeout(minuteur);
  }
  const bruit = erreurs.filter((m) => !/bibliotheque 3D/.test(m));
  if (bruit.length && r.ok) r = { ok: false, mesure: r.mesure + ' ; erreur de page : ' + bruit[0].slice(0, 120) };
  if (r.ok === false && process.env.FUMEE_CAPTURES) {
    mkdirSync(process.env.FUMEE_CAPTURES, { recursive: true });
    await page.screenshot({ path: join(process.env.FUMEE_CAPTURES, `${f.nom}-${theme}-${n}.png`), timeout: 15000 }).catch(() => {});
  }
  await contexte.close().catch(() => {});
  return r;
}

const ligne = (r) => `${r.classe.padEnd(7)} ${r.theme.padEnd(5)} ${String(r.n).padStart(2)} ${r.ok === true ? 'OK  ' : r.ok === false ? 'ÉCHEC' : '—   '} ${String(r.secondes).padStart(3)} s  ${r.mesure}`;

/**
 * `FUMEE_PARALLELE` parties a la fois (par defaut, une par tranche de quatre coeurs, entre 1 et 4) :
 * le serveur Vite et le navigateur sans carte graphique se partagent les coeurs. Sur quatre coeurs,
 * deux parties a la fois ne raccourcissaient pas le passage et rendaient instables les points aux
 * longues attentes (62, 70, qui passent joues seuls). Chaque ligne s'ecrit quand sa partie
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
      const t0 = Date.now();
      const r = await jouer(navigateur, net, p);
      resultats[i] = { classe: p.f.nom, theme: p.theme, n: p.n, ...r, secondes: Math.round((Date.now() - t0) / 1000) };
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
