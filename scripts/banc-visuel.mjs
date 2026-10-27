// Le banc visuel de la Vue 3D (MD/roadmap-realisme-3d.md, R0).
//
// Les memes vues d'AE 101 (2 allee des Limites, 78110 Le Vesinet) et de sa rue, a 390 et 1 440 px,
// en clair et en sombre, pour comparer a l'oeil avant et apres chaque etape du realisme ; et le cout
// de la scene, par niveau de qualite : duree de construction et temps d'une image.
//
//   BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 &
//   NODE_PATH=$(npm root -g) node scripts/banc-visuel.mjs [http://localhost:5199] [sortie]
//
// La sortie par defaut est `tests/fixtures/visuel/` : les images de reference et `mesures.json`.
// Pour une etape en cours, ecrire ailleurs (deuxieme argument) et comparer aux references.
//
// Le reseau de l'IGN est rejoue depuis `tests/fixtures/visuel/reseau/` quand il ne repond pas
// (scripts/fumee-reseau.mjs) : la parcelle, ses voisines, la BD TOPO, le LiDAR et l'orthophoto
// d'un passage enregistre. `BANC_RESEAU=temoin|direct|enregistrer` force le mode, comme
// `FUMEE_RESEAU` pour la fumee. `BANC_QUALITES=normale,soignee` limite les niveaux mesures ;
// `BANC_QUALITE_VUES=soignee` rend les images a ce niveau (normale par defaut) ; `BANC_VUES=0` ne fait que les mesures, `BANC_MESURES=0` que les images ; `BANC_ECHELLE=1` coche les
// objets d'echelle (une voiture, une silhouette) avant les vues ; `BANC_CLAUDE=1` ajoute les rendus
// que Claude recoit, un par facade de la maison (la facade entiere, du pied au haut du toit, vue de
// 5 m devant son milieu : three/renduPrise.ts).
//
// Les chiffres viennent d'un Chromium sans carte graphique (rendu logiciel) : ils se comparent entre
// eux, d'une etape a l'autre, pas a un vrai telephone. Le profil « telephone » ajoute un
// ralentissement du processeur (x4), comme les outils de developpement du navigateur.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ouvrirDemo, FORMATS, BASE } from './captures.mjs';
import { choisirModeReseau, reseau, servirThreeLocal } from './fumee-reseau.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const RACINE = new URL('../', import.meta.url).pathname;
const SORTIE = resolve(process.argv[3] || RACINE + 'tests/fixtures/visuel');
const TEMOIN = RACINE + 'tests/fixtures/visuel/reseau/';
const ADRESSE = '2 allée des Limites 78110 Le Vésinet';
const CLASSES = FORMATS.filter((f) => f.nom === 'compact' || f.nom === 'large');
const THEMES = ['light', 'dark'];
const QUALITES = (process.env.BANC_QUALITES || 'econome,normale,soignee').split(',').map((q) => q.trim()).filter(Boolean);

// ---- Le projet AE 101 --------------------------------------------------------------------------

/** Le parcours « Partir d'une adresse » du point 12 de la fumee, puis le voisinage adjacent (13). */
async function importerAe101(page) {
  const avant = await page.evaluate(() => window.__plan.etat().objects.length);
  await page.evaluate(() => window.__plan.executer('projet.depuisAdresse'));
  const boite = page.locator('.dialogueCadastre');
  await boite.waitFor({ timeout: 15000 });
  await boite.locator('input.promptInput').first().fill(ADRESSE);
  await boite.locator('[data-controle="cadastre.suggestion"]').first().waitFor({ timeout: 15000 });
  await boite.locator('input.promptInput').first().press('Enter');
  await page.locator('.dialogueCadastre', { hasText: 'Parcelle trouvee (2/3)' }).waitFor({ timeout: 30000 });
  await boite.getByRole('button', { name: /Parcelles voisines/ }).click();
  await page.locator('.dialogueCadastre', { hasText: 'creation (3/3)' }).waitFor({ timeout: 30000 });
  await boite.getByRole('button', { name: /Creer le projet/ }).click();
  await page.waitForFunction((n) => !document.querySelector('.dialogueCadastre') && !!window.__plan?.etat && window.__plan.etat().objects.length !== n, avant, { timeout: 120000 });
  await page.waitForTimeout(500);
  // Le voisinage donne la rue : sans lui, la maison est seule sur un tapis vert.
  await page.evaluate(() => document.querySelector('[data-commande="projet.actualiserIgn"]').click());
  const ign = page.locator('.dialogueActualisation');
  await ign.waitFor({ timeout: 15000 });
  await ign.locator('[data-controle="actualisation.voisinage"]').check();
  await ign.locator('[data-controle="actualisation.lancer"]').click();
  await page.waitForFunction(() => window.__plan.etat().objects.some((o) => o.voisinage), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const parcelle = await page.evaluate(() => window.__plan.etat().objects.find((o) => o.key === 'parcelle')?.cadastre?.idu);
  if (!/AE0101$/.test(parcelle || '')) throw new Error('la parcelle importée n’est pas AE 101 : ' + parcelle);
}

/** L'image du canevas une fois immobile : trois lectures egales a 200 ms d'ecart, ou `max` ms. */
async function immobile(page, max = 8000) {
  const lire = () => page.evaluate(() => document.querySelector('#terrasse3dCanvasHost canvas')?.toDataURL('image/jpeg', 0.5) ?? '');
  const fin = Date.now() + max;
  let derniere = await lire(), egales = 0;
  while (Date.now() < fin && egales < 2) {
    await page.waitForTimeout(200);
    const i = await lire();
    egales = i && i === derniere ? egales + 1 : 0;
    derniere = i;
  }
}

async function ouvrir3d(page) {
  await page.evaluate(() => window.__plan.executer('vue.3d'));
  await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !!window.__plan.scene3d()?.scene, null, { timeout: 60000 });
  // Les reglages replies et les notifications tues : la scene seule, a toutes les tailles. Le bilan
  // de l'actualisation IGN restait sinon en travers de la premiere vue.
  await page.evaluate(() => window.__plan.ouvrirFeuille(null));
  await page.addStyleTag({ content: '.toast, #zoneNotifications { display: none !important; }' });
  await immobile(page);
}

/**
 * Les points de vue du banc, calcules sur la parcelle importee plutot qu'ecrits en dur : la
 * facade sur rue est le cote de la parcelle qu'aucune voisine ne borde, le jardin le point de la
 * parcelle le plus loin de la maison. En metres du plan ; la 3D a Y en haut et Z vers le sud.
 */
async function pointsDeVue(page) {
  return page.evaluate(() => {
    const e = window.__plan.etat();
    const v = window.__plan.scene3d();
    const parcelle = e.objects.find((o) => o.key === 'parcelle');
    const voisines = e.objects.filter((o) => o.voisinage && o.fonction === 'terrain');
    const dans = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    const centre = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
    const pc = parcelle.pts;
    const cp = centre(pc);
    const maisons = e.objects.filter((o) => o.fonction === 'batiment' && !o.voisinage && o.pts && dans(centre(o.pts), pc));
    const maison = maisons.sort((a, b) => b.pts.length - a.pts.length)[0] || maisons[0];
    const cm = maison ? centre(maison.pts) : cp;
    // Le cote sur rue : le plus long dont le milieu, pousse d'un metre vers l'exterieur, ne tombe
    // dans aucune voisine.
    let rue = null;
    for (let i = 0; i < pc.length; i++) {
      const a = pc[i], b = pc[(i + 1) % pc.length];
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      let n = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l };
      if (Math.hypot(m.x + n.x - cp.x, m.y + n.y - cp.y) < Math.hypot(m.x - cp.x, m.y - cp.y)) n = { x: -n.x, y: -n.y };
      const dehors = { x: m.x + n.x, y: m.y + n.y };
      if (voisines.some((o) => o.pts && dans(dehors, o.pts))) continue;
      if (!rue || l > rue.l) rue = { m, n, l };
    }
    const jardin = pc.reduce((m, p) => (Math.hypot(p.x - cm.x, p.y - cm.y) > Math.hypot(m.x - cm.x, m.y - cm.y) ? p : m), pc[0]);
    const versLocal = (p, h) => ({ x: p.x - v.cen.x, y: h, z: -(p.y - v.cen.y) });
    const vers = (p, de, d) => { const l = Math.hypot(p.x - de.x, p.y - de.y) || 1; return { x: de.x + (p.x - de.x) / l * d, y: de.y + (p.y - de.y) / l * d }; };
    const yeux = 1.65, cible = 3;
    const vues = { aerienne: null };
    if (rue) vues.rue = { pos: versLocal({ x: rue.m.x + rue.n.x * 8, y: rue.m.y + rue.n.y * 8 }, yeux), cible: versLocal(cm, cible) };
    // Du fond du jardin, trois metres en dedans : la cloture n'est pas dans l'oeil, meme sur telephone.
    vues.jardin = { pos: versLocal(vers(cm, jardin, -3), yeux), cible: versLocal(cm, cible) };
    return vues;
  });
}

/**
 * Les rendus pour Claude de chaque facade de la maison de la parcelle, comme `analyseClaude.ts` les
 * demande : la prise 5 m devant le milieu du mur, la facade visee entiere. Le haut est le faitage le
 * plus haut des corps de toit lus, sinon le mur majore, comme app/audit/parcelle/liste.ts.
 */
async function rendusClaude(page) {
  return page.evaluate(async () => {
    const mod = await import('/src/three/renduPrise.ts');
    const epurerLeTemps = window.__plan.epurerLeTemps;
    const e = window.__plan.etat();
    const parcelle = e.objects.find((o) => o.key === 'parcelle');
    const dans = (q, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], d = pts[j]; if ((a.y > q.y) !== (d.y > q.y) && q.x < (d.x - a.x) * (q.y - a.y) / (d.y - a.y) + a.x) c = !c; } return c; };
    const centre = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
    const maisons = e.objects.filter((o) => o.fonction === 'batiment' && !o.voisinage && o.pts && dans(centre(o.pts), parcelle.pts));
    const maison = maisons.sort((a, b) => b.pts.length - a.pts.length)[0];
    if (!maison) return [];
    // Comme l'analyse (app/audit/parcelle/entreesAnalyse.ts::gardesDuRendu) : les batiments de la
    // parcelle et le sol ; ni cloture, ni arbres, ni voisins.
    const gardes = new Set([...maisons.map((o) => o.key), 'parcelle', ...e.objects.filter((o) => o.fonction === 'terrain').map((o) => o.key)]);
    const pts = maison.pts, n = pts.length;
    const haut = Math.max(...(maison.batiment?.corpsToit ?? []).map((c) => c.faitage), (maison.elevation ?? 6) * 1.35);
    const sorties = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], d = pts[(i + 1) % n], l = Math.hypot(d.x - a.x, d.y - a.y);
      if (l < 3) continue;
      const mx = (a.x + d.x) / 2, my = (a.y + d.y) / 2;
      let g = a, dr = d, nx = (d.y - a.y) / l, ny = -(d.x - a.x) / l;
      if (dans({ x: mx + nx * 0.3, y: my + ny * 0.3 }, pts)) { g = d; dr = a; nx = -nx; ny = -ny; }
      const prise = { x: mx + nx * 5, y: my + ny * 5, azimutDeg: ((Math.atan2(-nx, -ny) * 180) / Math.PI + 360) % 360, inclinaisonDeg: 0, champDeg: 66 };
      const cible = { gauche: g, droite: dr, hautM: haut };
      const img = epurerLeTemps((cle) => gardes.has(cle), () => mod.rendreDepuisPrise(prise, cible));
      const pose = mod.poseFacadeEntiere(prise, cible);
      if (img) sorties.push({ cote: i, largeurM: Math.round(l * 10) / 10, reculM: pose.reculM, entiere: pose.entiere, inclinaisonDeg: Math.round(pose.inclinaisonDeg), base64: img.base64 });
    }
    return sorties;
  });
}

async function poserCamera(page, vue) {
  if (!vue) return;
  await page.evaluate((vue) => {
    const v = window.__plan.scene3d();
    v.camera.position.set(vue.pos.x, vue.pos.y, vue.pos.z);
    v.controls.target.set(vue.cible.x, vue.cible.y, vue.cible.z);
    v.controls.update();
  }, vue);
  await immobile(page);
}

// ---- Mesures -----------------------------------------------------------------------------------

/**
 * La duree d'une construction de la scene (fermer puis rouvrir la Vue 3D, jusqu'a la scene posee) et
 * le temps d'une image (vingt rendus de suite, chacun attendu jusqu'au bout par une lecture de
 * pixel), sur la vue aerienne.
 */
async function mesurer(page) {
  await page.evaluate(() => window.__plan.executer('vue.plan'));
  await page.waitForTimeout(300);
  const construction = await page.evaluate(async () => {
    const t = performance.now();
    window.__plan.executer('vue.3d');
    while (!window.__plan.scene3d()?.scene) await new Promise((r) => setTimeout(r, 5));
    return performance.now() - t;
  });
  await immobile(page);
  // Le rendu tel que la Vue 3D le fait : par les passes de l'occlusion en Soignee (`rendre`).
  const image = await page.evaluate(() => {
    const sc = window.__plan.scene3d();
    const { renderer, scene, camera } = sc;
    const rendre = () => (sc.rendre ? sc.rendre() : renderer.render(scene, camera));
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    rendre(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const n = 20, t = performance.now();
    for (let i = 0; i < n; i++) { rendre(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t) / n;
  });
  // Les compteurs d'une image simple : apres les passes, ils ne diraient que la derniere.
  const info = await page.evaluate(() => {
    const { renderer, scene, camera } = window.__plan.scene3d();
    renderer.render(scene, camera);
    const r = renderer.info.render;
    return { triangles: r.triangles, appels: r.calls };
  });
  return { constructionMs: Math.round(construction), imageMs: Math.round(image * 10) / 10, imagesParSeconde: Math.round(1000 / image * 10) / 10, ...info };
}

// ---- Le passage --------------------------------------------------------------------------------

async function partie(navigateur, net, f, theme, qualite) {
  const contexte = await navigateur.newContext({
    viewport: { width: f.width, height: f.height }, isMobile: f.mobile, hasTouch: f.mobile,
    deviceScaleFactor: 1, colorScheme: theme
  });
  await net.brancher(contexte);
  const page = await contexte.newPage();
  await servirThreeLocal(page);
  await page.addInitScript((q) => { try { localStorage.setItem('plan.qualite3d', q); } catch { /* rien */ } }, qualite);
  page.on('dialog', (d) => d.accept());
  await ouvrirDemo(page);
  await importerAe101(page);
  if (f.mobile) {
    const cdp = await contexte.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await ouvrir3d(page);
  // Les objets d'echelle (R5), decoches par defaut : `BANC_ECHELLE=1` les montre.
  if (process.env.BANC_ECHELLE === '1') {
    await page.evaluate(() => document.getElementById('terrasse3dEchelle')?.click());
    await page.waitForFunction(() => !!window.__plan.scene3d()?.scene.getObjectByName('objets-echelle'), null, { timeout: 30000 }).catch(() => {});
    await immobile(page);
  }
  return { contexte, page };
}

async function principal() {
  const navigateur = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const net = reseau(await choisirModeReseau(navigateur, process.env.BANC_RESEAU), TEMOIN);
  console.log(`banc visuel d’AE 101 → ${SORTIE} (${net.mode === 'direct' ? 'réseau direct' : net.mode === 'temoin' ? 'réseau rejoué' : 'réseau enregistré'})`);
  mkdirSync(SORTIE, { recursive: true });

  if (process.env.BANC_VUES !== '0') {
    for (const f of CLASSES) for (const theme of THEMES) {
      const { contexte, page } = await partie(navigateur, net, f, theme, process.env.BANC_QUALITE_VUES || 'normale');
      const vues = await pointsDeVue(page);
      for (const [nom, vue] of Object.entries(vues)) {
        await poserCamera(page, vue);
        const fichier = `${nom}-${f.nom}-${theme === 'light' ? 'clair' : 'sombre'}.jpg`;
        await page.screenshot({ path: SORTIE + '/' + fichier, type: 'jpeg', quality: 80 });
        console.log('  ' + fichier);
      }
      if (process.env.BANC_CLAUDE === '1' && f.nom === 'large' && theme === 'light') {
        const rendus = await rendusClaude(page);
        for (const r of rendus) {
          const fichier = `claude-facade${r.cote}.jpg`;
          writeFileSync(SORTIE + '/' + fichier, Buffer.from(r.base64, 'base64'));
          console.log(`  ${fichier} : mur de ${r.largeurM} m, recul ${r.reculM} m, inclinaison ${r.inclinaisonDeg}°, ${r.entiere ? 'entiere' : 'PAS ENTIERE'}`);
        }
      }
      await contexte.close();
    }
  }

  if (process.env.BANC_MESURES !== '0') {
    const mesures = {};
    for (const f of CLASSES) for (const qualite of QUALITES) {
      const { contexte, page } = await partie(navigateur, net, f, 'light', qualite);
      const m = await mesurer(page);
      (mesures[f.nom] ||= {})[qualite] = m;
      console.log(`  ${f.nom.padEnd(7)} ${qualite.padEnd(8)} construction ${m.constructionMs} ms, image ${m.imageMs} ms (${m.imagesParSeconde} i/s), ${m.triangles} triangles, ${m.appels} appels`);
      await contexte.close();
    }
    writeFileSync(SORTIE + '/mesures.json', JSON.stringify({ profil: 'Chromium sans carte graphique (SwiftShader) ; compact = processeur ralenti x4', ...mesures }, null, 1) + '\n');
  }

  await navigateur.close();
  console.log(net.bilan());
}

await principal();
