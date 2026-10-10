// Un village entier, comme un utilisateur le cree : projet depuis une adresse, voisinage etendu,
// import IGN (toits LiDAR, recalage, corps), puis un JSON par batiment (contour recale, BD TOPO,
// corps de l'application, grille MNH relue 1 m plus large) et des captures de la Vue 3D.
//
//   BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort   # en arriere-plan
//   NODE_PATH=$(npm root -g) node .claude/skills/toits/scripts/village.mjs "<adresse>" [rayon] [nom]
//
// Sorties dans $TOITS_DOSSIER (defaut /tmp/toits) : village-<nom>.json, village-<nom>-3d.png et une
// capture par vue. VUES='[["nom", xPlan, yPlan, dx, dy, dz], ...]' vise un point du plan (0 = centre
// de la parcelle) depuis un decalage en metres (dz > 0 : depuis le sud, Three.js a le nord sur -Z).
// SANS_DUMP=1 ne reecrit pas le JSON (captures seules).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { ouvrirDemo } from '../../../../scripts/captures.mjs';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const S = (process.env.TOITS_DOSSIER || '/tmp/toits').replace(/\/?$/, '/');
mkdirSync(S, { recursive: true });
const ADRESSE = process.argv[2] || '12 Avenue du Maréchal Foch 92210 Saint-Cloud';
const RAYON = Number(process.argv[3] || 100);
const navigateur = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('ERREUR PAGE', e.message));
await ouvrirDemo(page);
await page.evaluate(() => window.__plan.executer('projet.depuisAdresse'));
const boite = page.locator('.dialogueCadastre');
await boite.waitFor({ timeout: 15000 });
await boite.locator('input.promptInput').first().fill(ADRESSE);
await page.waitForTimeout(2500);
await boite.locator('input.promptInput').first().press('Enter');
await page.locator('.dialogueCadastre', { hasText: 'Parcelle trouvee (2/3)' }).waitFor({ timeout: 60000 });
await boite.getByRole('button', { name: /Parcelles voisines/ }).click();
await page.locator('.dialogueCadastre', { hasText: 'creation (3/3)' }).waitFor({ timeout: 60000 });
await page.evaluate(() => document.querySelector('[data-controle="cadastre.voisinageEtendu"]').click());
await page.evaluate((r) => { const c = document.querySelector('[data-controle="cadastre.rayon"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, String(r)); c.dispatchEvent(new Event('input', { bubbles: true })); }, RAYON);
await page.waitForFunction(() => /seront ajoutés/.test(document.querySelector('.blocIgn .detailIgn')?.textContent || ''), null, { timeout: 120000 });
console.log(await page.locator('.blocIgn .detailIgn').first().textContent());
const t0 = Date.now();
await boite.getByRole('button', { name: /Creer le projet/ }).click();
await page.waitForFunction(() => !document.querySelector('.dialogueCadastre'), null, { timeout: 240000 });
console.log('creation en', Math.round((Date.now() - t0) / 1000), 's');
await page.waitForTimeout(2000);
const bilan = await page.evaluate(() => {
  const o = window.__plan.etat().objects;
  const bat = o.filter((x) => x.fonction === 'batiment');
  const parc = o.find((x) => x.key === 'parcelle');
  const sources = {}; bat.forEach((b) => { const k = (b.toit?.source || 'aucun') + '/' + (b.toit?.forme || '-'); sources[k] = (sources[k] || 0) + 1; });
  return { objets: o.length, batiments: bat.length, corpsVoisins: bat.filter((b) => !b.bdtopo?.surParcellePrincipale && b.corpsToit?.length).length, mitoyensMesures: bat.filter((b) => !b.bdtopo?.surParcellePrincipale && b.toitMesure).length, pignonsVoisins: bat.reduce((n, b) => n + (b.bdtopo?.surParcellePrincipale ? 0 : (b.corpsToit || []).reduce((m, c) => m + c.pignons.length, 0)), 0), sources };
});
const NOM = process.argv[4] || 'village';
const r = await page.evaluate(async () => {
  const o = window.__plan.etat().objects;
  const parc = o.find((x) => x.key === 'parcelle');
  const c0 = parc.pts.reduce((a, q) => ({ x: a.x + q.x / parc.pts.length, y: a.y + q.y / parc.pts.length }), { x: 0, y: 0 });
  const mnh = await import('/src/geo/mnh.ts');
  const proj = await import('/src/geo/projection.ts');
  const pr = proj.projecteurLocal(parc.cadastre.origineLat, parc.cadastre.origineLon);
  const out = [];
  for (const b of o.filter((x) => x.fonction === 'batiment')) {
    const c = b.pts.reduce((a, q) => ({ x: a.x + q.x / b.pts.length, y: a.y + q.y / b.pts.length }), { x: 0, y: 0 });
    const g = await mnh.lireGrilleSous(b.pts, pr).catch(() => null);
    out.push({ key: b.key, d: Math.round(Math.hypot(c.x - c0.x, c.y - c0.y)), pts: b.pts, bdtopo: b.bdtopo, principal: !!b.bdtopo?.surParcellePrincipale, mesure: !!b.toitMesure, toit: b.toit, corps: b.corpsToit ?? null, grille: g && { ...g, z: g.z.map((v) => (v === null ? null : Math.round(v * 100) / 100)) } });
  }
  return { parcelle: parc.cadastre?.idu, batiments: out };
});
if (!process.env.SANS_DUMP) writeFileSync(S + 'village-' + NOM + '.json', JSON.stringify(r));
console.log('parcelle', r.parcelle, 'batiments', r.batiments.length, 'avec corps', r.batiments.filter((b) => b.corps?.length).length, 'grilles', r.batiments.filter((b) => b.grille).length);
await page.evaluate(() => window.__plan.executer('vue.3d'));
await page.locator('#terrasse3dCanvasHost canvas').waitFor({ timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator('#terrasse3dCanvasHost canvas').screenshot({ path: S + 'village-' + NOM + '-3d.png' });
const VUES = process.env.VUES ? JSON.parse(process.env.VUES) : [['pres-sud', 0, 0, 0, 22, -30], ['pres-ouest', 0, 0, -30, 22, 0], ['pres-nord', 0, 0, 0, 22, 30]];
for (const [nom, px, py, dx, dy, dz] of VUES) {
  await page.evaluate(({ px, py, dx, dy, dz }) => { const o = window.__plan.etat().objects; const parc = o.find((x) => x.key === 'parcelle'); const c0 = parc.pts.reduce((a, q) => ({ x: a.x + q.x / parc.pts.length, y: a.y + q.y / parc.pts.length }), { x: 0, y: 0 }); const tx = px ? px - c0.x : 0, tz = py ? c0.y - py : 0; const s = window.__plan.scene3d(); s.controls.target.set(tx, 6, tz); s.camera.position.set(tx + dx, 6 + dy, tz + dz); s.camera.lookAt(tx, 6, tz); s.controls.update(); }, { px, py, dx, dy, dz });
  await page.waitForTimeout(2500);
  await page.locator('#terrasse3dCanvasHost canvas').screenshot({ path: S + 'village-' + NOM + '-' + nom + '.png' });
}
await navigateur.close();
