// Le cas de calibration d'un etalon du catalogue (src/facade/banc/etalons.ts::casDeLEtalon), en JSON, ses photos en PNG `data:` : celui
// qu'Admin › Calibration ouvre sous « Étalons de synthèse ». La fumee le sert comme un cas du serveur (routes `admin/…` simulees) au
// lieu d'ecrire un cas a la main (CLAUDE.md, « chercher avant de creer »).
//
//   npx tsx .claude/skills/facades/scripts/cas.ts <scene> <fichier.json>
//
// Le fichier : `{ cas, coinsVrais }` ; `cas` est un CasStocke (le cas et ses images, dans l'ordre de ses photos).
import { writeFileSync } from 'node:fs';
import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { casDeLEtalon, coinsVraisDesPhotos, photosDeLEtalon } from '../../../../src/facade/banc/etalons.ts';
import { png } from '../../../../tests/banc/facades/png.ts';

const [nom, fichier] = process.argv.slice(2);
if (!nom || !fichier) {
  console.error('usage : cas.ts <scene> <fichier.json>');
  process.exit(2);
}
const s = chargerCorpus().find((x) => x.nom.includes(nom));
if (!s) {
  console.error('scene introuvable : ' + nom);
  process.exit(2);
}
const photos = photosDeLEtalon(s);
const cas = casDeLEtalon(s, photos, photos.map((_, k) => 'photo-' + (k + 1)));
const images = photos.map((p) => 'data:image/png;base64,' + png(p.image).toString('base64'));
writeFileSync(fichier, JSON.stringify({ cas: { ...cas, images }, coinsVrais: coinsVraisDesPhotos(s) }));
console.log(`${s.nom} : cas ecrit dans ${fichier}`);
