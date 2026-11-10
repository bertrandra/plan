// Les bibliotheques que la page charge a la demande (three.js et ses exemples, EZ-tree, pdf-lib), copiees dans la livraison
// (MD/roadmap-architecture.md, etape 5.2).
//
// Chacune est nommee par son adresse chez jsDelivr dans src/util/integriteCdn.ts, avec son empreinte. Le fichier de la livraison
// est celui de node_modules, a la meme version : les memes octets, donc la meme empreinte. Il se range sous
// `assets/vendor/<paquet>@<version>/<chemin>`, le chemin de jsDelivr apres `npm/` : la page passe de l'un a l'autre en changeant
// la racine (util/integriteCdn.ts, versLocale). Les modules en importent d'autres par des chemins relatifs (`three.module.js`
// importe `./three.core.js`, les passes du compositeur leurs shaders) : ils sont copies aussi, de proche en proche.
//
// Une adresse dont le paquet manque a node_modules, ou n'y est pas a la bonne version, reste au CDN (model-viewer, qui n'est pas
// une dependance). Utilise par vite.config.ts : au build pour copier, en developpement pour servir les memes chemins.

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const RACINE_CDN = 'https://cdn.jsdelivr.net/npm/';
export const DOSSIER_VENDOR = 'assets/vendor/';

/** `npm/<paquet>@<version>/<chemin>` : le paquet (portee comprise), sa version et le chemin dans le paquet. */
function decouper(chemin) {
  const m = /^((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/.exec(chemin);
  return m ? { paquet: m[1], version: m[2], fichier: m[3] } : null;
}

/** Le fichier de node_modules qui porte `<paquet>@<version>/<chemin>`, ou null s'il manque ou n'est pas a cette version. */
export function source(racine, chemin) {
  const d = decouper(chemin);
  if (!d || d.fichier.split('/').includes('..')) return null;
  const dossier = join(racine, 'node_modules', d.paquet);
  const pkg = join(dossier, 'package.json');
  if (!existsSync(pkg) || JSON.parse(readFileSync(pkg, 'utf8')).version !== d.version) return null;
  const f = join(dossier, d.fichier);
  return existsSync(f) ? f : null;
}

/** Les imports relatifs d'un module ES (`from './x.js'`, `import './x.js'`, `import('./x.js')`). */
function importsRelatifs(code) {
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(m[1]);
  return [...out];
}

/**
 * Les fichiers a copier : pour chaque adresse jsDelivr dont le paquet est dans node_modules a la bonne version, son chemin sous
 * `assets/vendor/` et le fichier source, plus ceux qu'il importe par un chemin relatif, de proche en proche.
 */
export function fichiersBibliotheques(racine, adressesCdn) {
  const vus = new Map();
  const file = adressesCdn.filter((u) => u.startsWith(RACINE_CDN)).map((u) => u.slice(RACINE_CDN.length));
  while (file.length) {
    const chemin = file.shift();
    if (vus.has(chemin)) continue;
    const f = source(racine, chemin);
    if (!f) continue;
    vus.set(chemin, f);
    if (!/\.m?js$/.test(chemin)) continue;
    for (const rel of importsRelatifs(readFileSync(f, 'utf8'))) file.push(posix.normalize(posix.join(posix.dirname(chemin), rel)));
  }
  return [...vus].map(([chemin, f]) => ({ chemin: DOSSIER_VENDOR + chemin, source: f }));
}

/** En developpement : sert `/assets/vendor/<paquet>@<version>/<chemin>` depuis node_modules, comme la livraison. */
export function servirBibliotheques(racine) {
  return (req, res, suite) => {
    const url = (req.url || '').split('?')[0];
    const i = url.indexOf('/' + DOSSIER_VENDOR);
    if (i < 0) return suite();
    const f = source(racine, decodeURIComponent(url.slice(i + DOSSIER_VENDOR.length + 1)));
    if (!f) return suite();
    res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(f));
  };
}

