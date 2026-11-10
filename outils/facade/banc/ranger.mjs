#!/usr/bin/env node
// Range, une fois, ce que rend UNE version d'un detecteur sur chaque image d'une ou plusieurs
// familles d'images. Les trois detecteurs de baies sont independants et le vote ne regarde pas
// l'image : il se rejoue ensuite sur ces boites (rejouer.mjs) en une seconde, sans relancer les
// detecteurs - de quoi essayer une regle de vote sur des centaines d'images.
//
//   node ranger.mjs <detecteur.ts> <etiquette> <famille>=<dossier> ... [--boites <dossier>]
//
// Ecrit <boites>/<etiquette>/<famille>.json : pour chaque image, son annotation `m`, le resultat `r`
// du detecteur, son temps `ms`. Dossier des boites : --boites, ou node_modules/.cache/facade-banc.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const esbuild = createRequire(RACINE + '/package.json')('esbuild');
const args = process.argv.slice(2);
const i = args.indexOf('--boites');
const BOITES = resolve(i >= 0 ? args.splice(i, 2)[1] : RACINE + '/node_modules/.cache/facade-banc');
const [detecteur, etiquette, ...familles] = args;
if (!detecteur || !etiquette || !familles.length) {
  console.error('usage : node ranger.mjs <detecteur.ts> <etiquette> <famille>=<dossier> ... [--boites <dossier>]');
  process.exit(2);
}

const paquet = resolve(tmpdir(), `detecteur-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [resolve(detecteur)], bundle: true, format: 'esm', platform: 'node', outfile: paquet, logLevel: 'warning', absWorkingDir: RACINE });
const { detecterBaies } = await import(pathToFileURL(paquet).href);
mkdirSync(`${BOITES}/${etiquette}`, { recursive: true });
for (const f of familles) {
  const [famille, dossier] = f.split('=');
  const noms = readdirSync(dossier).filter((n) => n.endsWith('.json') && existsSync(`${dossier}/${n.slice(0, -5)}.rgba`)).map((n) => n.slice(0, -5)).sort();
  const sortie = {};
  let lents = 0;
  for (const nom of noms) {
    const m = JSON.parse(readFileSync(`${dossier}/${nom}.json`, 'utf8'));
    const img = { largeur: m.largeur, hauteur: m.hauteur, donnees: new Uint8ClampedArray(readFileSync(`${dossier}/${nom}.rgba`)) };
    const vu = existsSync(`${dossier}/${nom}.vu`) ? new Uint8Array(readFileSync(`${dossier}/${nom}.vu`)) : null;
    const t0 = performance.now();
    let r = null,
      erreur = null;
    try {
      r = detecterBaies(img, vu, m.pxParM ?? null);
    } catch (x) {
      erreur = String(x?.message ?? x);
    }
    const ms = Math.round(performance.now() - t0);
    // Le budget d'un detecteur seul : 100 ms par megapixel + 500 ms.
    if (ms > (100 * m.largeur * m.hauteur) / 1e6 + 500) lents++;
    sortie[nom] = { m, r, ms, erreur };
  }
  writeFileSync(`${BOITES}/${etiquette}/${famille}.json`, JSON.stringify(sortie));
  console.log(`${etiquette} ${famille} : ${noms.length} images, ${Object.values(sortie).filter((x) => x.erreur).length} erreurs, ${lents} hors budget`);
}
