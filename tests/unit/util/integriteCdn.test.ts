import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { INTEGRITE_CDN, empreinteDe, versCdn, versLocale } from '../../../src/util/integriteCdn.js';
import { fichiersBibliotheques } from '../../../deploy/bibliotheques.mjs';
import { URL_THREE, URL_EZ_TREE, urlExemple } from '../../../src/three/bibliotheque.js';
import { MODEL_VIEWER_URL } from '../../../src/three/ar.js';
import { URL_PDF_LIB, URL_PDF_LIB_LOCALE } from '../../../src/export/chargeurPdfLib.js';

// Les empreintes des scripts du CDN (AD-12) : recalculees depuis node_modules quand le paquet y est, completes pour toute adresse
// que le code charge, et posees telles quelles dans la table d'import de index.html.
const racine = resolve(__dirname, '../../..');
const sha384 = (f: string) => 'sha384-' + createHash('sha384').update(readFileSync(f)).digest('base64');
/** Le fichier de node_modules qui correspond a une adresse jsDelivr (`npm/<paquet>@<version>/<chemin>`). */
function local(url: string): string | null {
  const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/.exec(url);
  if (!m) return null;
  const dossier = join(racine, 'node_modules', m[1]!);
  if (!existsSync(join(dossier, 'package.json'))) return null;
  if (JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8')).version !== m[2]) return null;
  const f = join(dossier, m[3]!);
  return existsSync(f) ? f : null;
}
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const c = join(d, n); return statSync(c).isDirectory() ? fichiers(c) : /\.tsx?$/.test(c) ? [c] : []; });

describe('les empreintes des scripts du CDN', () => {
  it('chaque adresse que le code charge a son empreinte', () => {
    const exemples = new Set<string>();
    for (const f of fichiers(join(racine, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/(?:chargerExemple|urlExemple)\('([^']+\.js)'/g)) exemples.add(m[1]!);
    expect(exemples.size).toBeGreaterThan(5);
    for (const u of [URL_THREE, URL_EZ_TREE, MODEL_VIEWER_URL, URL_PDF_LIB, URL_PDF_LIB_LOCALE, ...[...exemples].map(urlExemple)]) expect(empreinteDe(u), u).toMatch(/^sha384-/);
  });
  it('les empreintes valent celles des fichiers de node_modules a la meme version', () => {
    let verifiees = 0;
    for (const [u, h] of Object.entries(INTEGRITE_CDN)) { const f = local(u); if (f) { expect(sha384(f), u).toBe(h); verifiees++; } }
    expect(verifiees).toBeGreaterThanOrEqual(15);
  });
  it('la table d import de index.html porte les empreintes des modules, a leurs deux adresses', () => {
    const m = /<script type="importmap">([^<]+)<\/script>/.exec(readFileSync(join(racine, 'index.html'), 'utf8'));
    const table = JSON.parse(m![1]!) as { integrity: Record<string, string> };
    const copies = new Set(fichiersBibliotheques(racine, Object.keys(INTEGRITE_CDN)).map((f) => './' + f.chemin));
    const attendu: Record<string, string> = {};
    for (const [u, h] of Object.entries(INTEGRITE_CDN)) {
      if (u === URL_PDF_LIB) continue;
      if (copies.has(versLocale(u))) attendu[versLocale(u)] = h;
      attendu[u] = h;
    }
    expect(table.integrity).toEqual(attendu);
  });
});

describe('les bibliotheques copiees dans la livraison (etape 5.2)', () => {
  const copies = fichiersBibliotheques(racine, Object.keys(INTEGRITE_CDN));
  const chemins = copies.map((f) => './' + f.chemin);
  it('portent three.js, ce qu il importe, ses exemples, EZ-tree et pdf-lib ; model-viewer reste au CDN', () => {
    for (const u of [URL_THREE, URL_EZ_TREE, URL_PDF_LIB_LOCALE, urlExemple('controls/OrbitControls.js')]) expect(chemins, u).toContain(u);
    expect(chemins).toContain('./assets/vendor/three@0.186.1/build/three.core.js');
    expect(chemins.some((c) => c.includes('model-viewer'))).toBe(false);
  });
  it('chaque fichier copie qui a une empreinte en a les octets', () => {
    let verifies = 0;
    for (const f of copies) { const h = INTEGRITE_CDN[versCdn('./' + f.chemin)]; if (h) { expect(sha384(f.source), f.chemin).toBe(h); verifies++; } }
    expect(verifies).toBeGreaterThanOrEqual(15);
  });
  it('passe d une adresse a l autre dans les deux sens', () => {
    expect(versCdn('https://plan.exemple/sous/assets/vendor/three@0.186.1/build/three.core.js')).toBe('https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.core.js');
    expect(versCdn(versLocale(URL_PDF_LIB))).toBe(URL_PDF_LIB);
  });
});
