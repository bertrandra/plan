// Le programme livre, ouvert dans un navigateur (AD-10) : la fumee pilote le serveur de developpement par `window.__plan`, que le
// build de production ne porte pas ; ce script ouvre le vrai `dist/` et le parcourt comme une personne, au clic.
//
//   BACKPROD_API_URL=http://plateforme.test npx vite preview --port 5300 --strictPort   # en arriere-plan, apres `npm run build`
//   NODE_PATH=$(npm root -g) node scripts/essayer-paquet.mjs http://localhost:5300
//
// Il dit, a chaque etape, les morceaux `assets/plan-*.js` telecharges depuis la precedente, et echoue a la premiere erreur de la
// page (exception non rattrapee, morceau introuvable) : c'est la que se voit un `import()` casse par le decoupage.
import { createRequire } from 'node:module';
import { simulerPlateforme } from './captures.mjs';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const base = process.argv[2] || 'http://localhost:5300';
// La taille d'un morceau se lit sur le disque (le serveur de previsualisation n'annonce pas toujours sa longueur).
//
// jsDelivr est coupe (etape 5.2 de la feuille de route) : three.js, ses exemples, EZ-tree et pdf-lib viennent de
// `assets/vendor/` de la livraison. Une requete vers le CDN est refusee et comptee ; une bibliotheque qui n'y serait que la
// casse l'etape qui l'appelle.
const dist = resolve(process.argv[3] || 'dist');
const taille = (f) => { try { return statSync(resolve(dist, 'assets', f)).size; } catch { return 0; } };
const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } });
const erreurs = [], recus = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|plateforme\.test/.test(m.text())) erreurs.push(m.text()); });
page.on('response', (r) => { const m = /\/assets\/(plan-[0-9a-f]+\.(?:js|css)|vendor\/.+)$/.exec(r.url()); if (m) recus.push({ f: m[1], o: taille(m[1]), statut: r.status() }); });
const coupees = [];
await page.route(/cdn\.jsdelivr\.net/, (r) => { coupees.push(r.request().url()); return r.abort(); });
let vus = 0;
const etape = async (nom) => {
  const nouveaux = recus.slice(vus);
  vus = recus.length;
  const ko = nouveaux.filter((r) => r.statut >= 400);
  const ko8 = (nouveaux.reduce((t, r) => t + r.o, 0) / 1024).toFixed(0);
  const vendor = nouveaux.filter((r) => r.f.startsWith('vendor/')).length;
  console.log(`${nom.padEnd(28)} ${String(nouveaux.length).padStart(3)} fichier(s)${vendor ? ' dont ' + vendor + ' de vendor/' : ''}, ${ko8.padStart(5)} Ko${ko.length ? ' — EN ERREUR : ' + ko.map((r) => r.f).join(', ') : ''}`);
  if (ko.length || erreurs.length) { console.error('erreurs : ' + erreurs.join(' | ')); await navigateur.close(); process.exit(1); }
};

await simulerPlateforme(page);
await page.addInitScript(() => { window.__sansToitsFond = true; });
await page.goto(base + '/');
const boutonDemo = page.getByRole('button', { name: /d[ée]monstration/i });
await boutonDemo.waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await etape('ouverture');
// Le jeu de demonstration se lit au clic (AD-10).
await boutonDemo.click();
await page.waitForSelector('#stage svg');
await page.waitForTimeout(800);
await etape('démonstration');

await page.getByRole('button', { name: 'Vue 3D', exact: true }).first().click();
await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
await etape('Vue 3D');

await page.getByRole('button', { name: 'Plan', exact: true }).first().click();
await page.waitForTimeout(800);
await etape('retour au plan');

// Le PDF du plan (menu Exporter) : le module des PDF se charge au premier export (AD-10), et le fichier part.
await page.locator('details#menuExporter > summary').click();
const [telechargement] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#exportPdfBtn').click()]);
await page.waitForTimeout(500);
await etape('export PDF (' + telechargement.suggestedFilename() + ')');
await page.keyboard.press('Escape');

// L'audit de la parcelle (menu Fichier) : ses ecrans et sa session se chargent a l'ouverture (AD-10).
await page.locator('details.menu > summary', { hasText: 'Fichier' }).first().click();
await page.locator('[data-commande="audit.parcelle"]').first().click({ timeout: 15000 });
await page.locator('.dialogueVoile .titreParcours').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await etape('audit de la parcelle');
await page.keyboard.press('Escape');

const total = recus.reduce((t, r) => t + r.o, 0);
console.log(`essayer-paquet : ${recus.length} fichier(s) reçus, ${(total / 1024).toFixed(0)} Ko, aucune erreur de la page ; jsDelivr coupé (${coupees.length} requête(s) refusée(s))`);
await navigateur.close();
