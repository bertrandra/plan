// L'elevation que facade.html produit vraiment dans un navigateur (Chromium, emulation d'iPhone 13),
// a partir de photos : enregistree en PNG sans perte, sans les baies dessinees. C'est l'image a
// annoter (reporter.py) pour faire entrer dans le banc ce que l'utilisateur voit sur son telephone.
//
//   NODE_PATH=$(npm root -g) node page_png.cjs <sortie.png> <photo 1> [photo 2 ...]     (depuis la racine du depot)
const { chromium, devices } = require('playwright');
const path = require('path');
const [sortie, ...photos] = process.argv.slice(2);
if (!sortie || !photos.length) {
  console.error('usage : node page_png.cjs <sortie.png> <photo 1> [photo 2 ...]');
  process.exit(2);
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto('file://' + path.resolve(__dirname, '../../../../facade.html'));
  await page.setInputFiles('#importer', photos);
  await page.waitForFunction((n) => document.querySelectorAll('#photos .etat.bon').length === n, photos.length, { timeout: 120000 });
  await page.click('#fusionner');
  await page.waitForFunction(() => (document.querySelector('#etat-resultat').textContent || '').includes('redressée'), null, { timeout: 180000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.$eval('#enregistrer-png', (x) => x.click())]);
  await dl.saveAs(sortie);
  console.log(await page.locator('#etat-resultat').innerText());
  await b.close();
})();
