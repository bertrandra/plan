// Le corpus de facades reelles (tests/fixtures/facades-reel/, tests/banc/facades/reel.ts).
//
//   npx tsx .claude/skills/facades/scripts/reel.ts extraire <audit.json> [dossier]   # brouillons depuis un fichier d'audit
//   NODE_PATH=$(npm root -g) npx tsx .claude/skills/facades/scripts/reel.ts mesurer [dossier] [--json sortie.json]
//
// `extraire` ecrit, pour chaque facade releveee d'un fichier d'audit, la photo (jpg) et un cas `brouillon` : ses quatre
// coins sont ceux du calage, ses ouvertures celles du releve. Un brouillon n'est PAS une verite (c'est ce que Plan avait
// propose, peut-etre retouche) : il faut le relire sur la photo, corriger les ouvertures, puis passer `statut` a `valide`.
// `mesurer` ne compte que les cas `valide` : precision, rappel, cotes, et fiabilite de la confiance, avec et sans le vote
// entre vues. Le decodage du JPEG passe par Chromium (Playwright), faute de decodeur dans Node.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brouillonsDeLAudit, lireCasReel, mesurerCas, tableauReel } from '../../../../tests/banc/facades/reel.ts';
import type { Image } from '../../../../src/facade/homographie.ts';

const DOSSIER = 'tests/fixtures/facades-reel';
const [commande, a1, a2] = process.argv.slice(2);

function extraire(fichier: string, dossier: string): void {
  const base = fichier.split('/').pop()?.replace(/\.json$/, '') ?? 'audit';
  const brouillons = brouillonsDeLAudit(JSON.parse(readFileSync(fichier, 'utf8')), base);
  mkdirSync(dossier, { recursive: true });
  for (const { cas, base64 } of brouillons) {
    writeFileSync(join(dossier, cas.photos[0]?.fichier ?? cas.nom + '.jpg'), Buffer.from(base64, 'base64'));
    writeFileSync(join(dossier, cas.nom + '.json'), JSON.stringify(cas, null, 2) + '\n');
  }
  console.log(`${brouillons.length} brouillon(s) ecrit(s) dans ${dossier} : a relire sur la photo, puis statut -> "valide".`);
}

async function decoder(fichiers: string[]): Promise<Image[]> {
  const { chromium } = await import('playwright');
  const nav = await chromium.launch();
  try {
    const page = await nav.newPage();
    const out: Image[] = [];
    for (const f of fichiers) {
      const b64 = readFileSync(f).toString('base64');
      const r = await page.evaluate(async (d) => {
        const img = new Image();
        await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('image illisible')); img.src = 'data:image/jpeg;base64,' + d; });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d') as CanvasRenderingContext2D; x.drawImage(img, 0, 0);
        return { largeur: c.width, hauteur: c.height, donnees: Array.from(x.getImageData(0, 0, c.width, c.height).data) };
      }, b64);
      out.push({ largeur: r.largeur, hauteur: r.hauteur, donnees: new Uint8ClampedArray(r.donnees) });
    }
    return out;
  } finally { await nav.close(); }
}

async function mesurer(dossier: string, sortie: string | undefined): Promise<void> {
  const cas = readdirSync(dossier).filter((n) => n.endsWith('.json')).map((n) => lireCasReel(JSON.parse(readFileSync(join(dossier, n), 'utf8'))));
  const valides = cas.filter((c) => c.statut === 'valide');
  console.log(`${cas.length} cas, dont ${valides.length} valide(s)${valides.length ? '' : ' : rien a mesurer (relire un brouillon et le passer a "valide")'}.`);
  if (!valides.length) return;
  const avec = [], sans = [];
  for (const c of valides) {
    const images = await decoder(c.photos.map((p) => join(dossier, p.fichier)));
    avec.push(mesurerCas(c, images, true));
    sans.push(mesurerCas(c, images, false));
  }
  const l = [...tableauReel(avec, 'Corpus réel — toutes les photos (fusion + vote entre vues)'), ...tableauReel(sans, 'Corpus réel — première photo seule')];
  console.log(l.join('\n'));
  if (sortie) writeFileSync(sortie, JSON.stringify({ avec, sans }, null, 2));
}

if (commande === 'extraire' && a1) extraire(a1, a2 ?? DOSSIER);
else if (commande === 'mesurer') await mesurer(a1 && !a1.startsWith('--') ? a1 : DOSSIER, process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : undefined);
else { console.error('usage : reel.ts extraire <audit.json> [dossier] | reel.ts mesurer [dossier] [--json sortie.json]'); process.exit(2); }
