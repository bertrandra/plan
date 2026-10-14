// Les photos de synthese d'une scene du banc, en PNG : la vue principale puis ses autres vues (lot L13),
// et leurs coins vrais. La fumee les importe dans le releve du navigateur (point 68, lot G17), pour jouer
// sur de vraies prises ce que des dessins au canevas ne savent pas montrer : une occlusion vue de deux
// endroits, que la parallaxe separe du mur.
//
//   npx tsx .claude/skills/facades/scripts/photos.ts <scene> <dossier>
//
// Ecrit <dossier>/vue-0.png, vue-1.png… et <dossier>/coins.json : la largeur et la hauteur du mur, la
// largeur de chaque photo en pixels et ses coins vrais (HG, HD, BD, BG).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { coinsVrais, photographier } from '../../../../tests/banc/facades/synthese.ts';
import { png } from '../../../../tests/banc/facades/png.ts';

const [nom, dossier] = process.argv.slice(2);
if (!nom || !dossier) {
  console.error('usage : photos.ts <scene> <dossier>');
  process.exit(2);
}
const s = chargerCorpus().find((x) => x.nom.includes(nom));
if (!s) {
  console.error('scene introuvable : ' + nom);
  process.exit(2);
}
mkdirSync(dossier, { recursive: true });
const px = s.synthese.pxParM ?? 100;
const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])];
const largeurPx: number[] = [];
const coins = prises.map((p, k) => {
  const ph = photographier(s, px, p);
  if (!ph) throw new Error('vue sans photo : ' + k);
  writeFileSync(join(dossier, `vue-${k}.png`), png(ph.image));
  largeurPx.push(ph.image.largeur);
  return coinsVrais(s, p);
});
writeFileSync(join(dossier, 'coins.json'), JSON.stringify({ scene: s.nom, largeur: s.verite.largeur, hauteur: s.verite.hauteur, largeurPx, coins }, null, 2));
console.log(`${s.nom} : ${prises.length} vue(s) ecrite(s) dans ${dossier}`);
