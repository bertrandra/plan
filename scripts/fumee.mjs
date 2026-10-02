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
import { readFileSync, writeFileSync } from 'node:fs';
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
async function selectionner(page, pred) {
  await page.evaluate((src) => {
    const f = new Function('o', 'return ' + src);
    const o = window.__plan.etat().objects.find(f);
    window.__plan.selectionnerCle(o ? o.key : null);
  }, pred);
  await page.waitForTimeout(150);
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
    await page.waitForTimeout(5000);
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
    await date.fill('2026-06-21'); await page.waitForTimeout(150);
    const ete = await page.evaluate(() => document.querySelector('#stage > svg').innerHTML);
    await date.fill('2026-12-21'); await page.waitForTimeout(150);
    const hiver = await page.evaluate(() => document.querySelector('#stage > svg').innerHTML);
    await date.fill('2026-06-21'); await page.waitForTimeout(150);
    const ete2 = await page.evaluate(() => document.querySelector('#stage > svg').innerHTML);
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
    const noms = ['Polygone', 'Rectangle', 'Chemin', 'Cercle', 'Parasol', 'Point de vue'];
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
    // Un curseur ne se « remplit » pas : on le deplace au clavier, comme au doigt on le glisse.
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
      const regler = (v) => page.evaluate((v) => { const c = document.getElementById('vue3dHeure'); c.value = String(v); c.dispatchEvent(new Event('input', { bubbles: true })); }, v);
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
    let nommesParCle = 0;
    const voir = (n) => { if (n.genre === 'champ' && n.nom === n.cle) nommesParCle++; (n.enfants || []).forEach(voir); };
    voir(branche('inspecteur'));
    const ok = ecran.horsRegistre === '0' && ecran.classes === 'bureau, tablette, téléphone' && ecarts === '0' && sansDroits === '0' && Number(sansAnnulation) <= 1 && nommesParCle === 0;
    return { ok, mesure: `classes : ${ecran.classes} ; hors registre ${ecran.horsRegistre} (${ecran.rattaches} rattachés) ; écarts de zone ${ecarts} ; écritures sans droits ${sansDroits}, sans annulation ${sansAnnulation} ; champs nommés par leur clé ${nommesParCle}` };
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
    await page.locator('[data-controle="releve.valider"]').first().click({ timeout: 30000 });
    await page.waitForTimeout(500);
    const ecrit = await page.evaluate(() => window.__plan.etat().objects.filter((o) => o.facades && o.facades.length).map((o) => ({ nom: o.name, ouvertures: o.facades.map((f) => f.ouvertures.length) })));
    await annuler(page);
    const retour = (await facades()) === avant;
    const ouvertures = ecrit[0]?.ouvertures?.[0] ?? 0;
    return { ok: ecrit.length === 1 && ouvertures >= 2 && retour, mesure: `relevé écrit : ${ecrit.map((e) => e.nom + ' ' + e.ouvertures.join('/') + ' ouverture(s)').join(', ') || 'RIEN'} ; un Ctrl+Z : ${retour ? 'retiré d’un coup' : 'PAS retiré'}` };
  }
};

/** Quels points se jouent dans quelle classe : les 25 d'origine partout, ceux du mobile au telephone, les garde-fous et le releve sans camera (49 a 54). */
function pointsPour(nomClasse) {
  const base = [...Array(25).keys()].map((i) => i + 1);
  const mobile = nomClasse === 'compact' ? [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39] : [];
  // Les garde-fous de l'inspecteur partout ; la decouverte une fois, elle parcourt deja les trois classes.
  const gardeFous = [49, 50, 51, 52, 54, ...(nomClasse === 'large' ? [53] : [])];
  const tous = [...base, ...mobile, ...(nomClasse === 'compact' ? [40] : []), ...gardeFous];
  return choisis.length ? tous.filter((n) => choisis.includes(n)) : tous;
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
