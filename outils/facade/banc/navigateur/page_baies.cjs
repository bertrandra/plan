// Le reperage des baies joue dans la page, comme sur un telephone (Chromium, emulation d'iPhone 13) :
// photos importees, fusion, case « Reperer les fenetres et les portes », puis une echelle, puis les
// corrections a la main (le sol suit une porte declaree ou retiree) et l'export des cotes.
// Ecrit dans <dossier de sortie> : resultat.png (l'apercu avec les baies, sans echelle) et cotes.csv.
//
//   NODE_PATH=$(npm root -g) node page_baies.cjs <dossier de sortie> <metres du segment propose> <photo 1> [photo 2 ...]
//
// L'echelle est posee sur le segment que l'editeur propose (40 % de la largeur de l'image, a mi-hauteur) :
// donner sa longueur reelle en metres, a peu pres (5 pour la maison de reference).
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const [S, metres, ...photos] = process.argv.slice(2);
if (!S || !metres || !photos.length) {
  console.error('usage : node page_baies.cjs <dossier de sortie> <metres du segment propose> <photo 1> [photo 2 ...]');
  process.exit(2);
}
(async () => {
  fs.mkdirSync(S, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../../../../facade.html'));
  await page.setInputFiles('#importer', photos);
  await page.waitForFunction((n) => document.querySelectorAll('#photos .etat.bon').length === n, photos.length, { timeout: 120000 });
  await page.click('#fusionner');
  await page.waitForFunction(() => (document.querySelector('#etat-resultat').textContent || '').includes('redressée'), null, { timeout: 180000 });
  const repere = () => page.waitForFunction(() => (document.querySelector('#etat-resultat').textContent || '').match(/repérée|Aucune/), null, { timeout: 180000 });
  const t0 = Date.now();
  await page.check('#ch-ouvertures');
  await repere();
  console.log('repérage sans échelle :', Date.now() - t0, 'ms —', await page.locator('#etat-resultat').innerText());
  await page.locator('#resultat-cadre').screenshot({ path: S + '/resultat.png' });
  // Les clics passent par le DOM : l'editeur est en position fixe et Playwright ferait defiler la page.
  await page.$eval('#mettre-echelle', (x) => x.click());
  await page.waitForSelector('#editeur:not([hidden])');
  await page.fill('#ed-valeur', metres);
  await page.$eval('#ed-valider', (x) => x.click());
  await repere();
  const etat = () =>
    page.evaluate(() => {
      const t = document.querySelector('#liste-ouvertures table');
      if (!t) return { appui: false, lignes: [] };
      const appui = [...t.querySelectorAll('th')].some((x) => x.textContent === 'Appui');
      const lignes = [...t.querySelectorAll('tbody tr')].map((tr) => ({ type: tr.querySelector('select').value, cases: [...tr.querySelectorAll('td')].slice(2, appui ? 6 : 5).map((c) => c.textContent) }));
      return { appui, lignes };
    });
  const choisir = (i, v) =>
    page.evaluate(
      ([i, v]) => {
        const s = document.querySelectorAll('#liste-ouvertures tbody select')[i];
        s.focus();
        s.value = v;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      },
      [i, v],
    );
  let e = await etat();
  console.log('avec échelle : colonne Appui', e.appui, '—', e.lignes.map((l, i) => `${i + 1}:${l.type} ${l.cases.join(' ')}`).join(' | '));
  let echecs = 0;
  const verdict = (ok) => (ok ? 'ok' : (echecs++, 'ECHEC'));
  for (let i = 0; i < e.lignes.length; i++) if (e.lignes[i].type !== 'fenetre') await choisir(i, 'fenetre');
  e = await etat();
  console.log('1. tout en fenêtre -> plus de colonne Appui :', verdict(!e.appui));
  const hauteurs = e.lignes.map((l) => parseInt(l.cases[1], 10));
  const k = hauteurs.indexOf(Math.max(...hauteurs));
  await choisir(k, 'porte');
  e = await etat();
  const focus = await page.evaluate((k) => document.activeElement === document.querySelectorAll('#liste-ouvertures tbody select')[k], k);
  console.log(`2. baie ${k + 1} déclarée porte -> colonne Appui :`, verdict(e.appui), '; choix gardé sous le doigt :', verdict(focus));
  await page.evaluate((k) => document.querySelectorAll('#liste-ouvertures tbody tr')[k].querySelector('.actions-baie button:last-child').click(), k);
  e = await etat();
  console.log('3. porte retirée -> plus de colonne Appui :', verdict(!e.appui), '; lignes :', e.lignes.length);
  await choisir(0, 'porte');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.$eval('#exporter-cotes', (x) => x.click())]);
  await dl.saveAs(S + '/cotes.csv');
  console.log('4. CSV :', fs.readFileSync(S + '/cotes.csv', 'utf8').split('\r\n').slice(0, 2).join(' / '));
  const largeur = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  console.log('5. la page ne déborde pas :', verdict(largeur[0] <= largeur[1]), largeur.join(' / '));
  console.log('6. aucune erreur de script :', verdict(!erreurs.length), erreurs.join(' ; '));
  await b.close();
  process.exit(echecs ? 1 : 0);
})();
