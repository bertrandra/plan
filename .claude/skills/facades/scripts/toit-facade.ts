// Le toit que dit une facade (facade/analyse.ts::finaliserReleve) : par la bande au-dessus de l'egout (avant), et par la silhouette du
// haut du mur quand elle a une forme (silhouetteEnPartsDuMur, lue entre les coins vrais par mosaiqueFuites.ts::silhouetteSurLaPhoto).
//
//   npx tsx .claude/skills/facades/scripts/toit-facade.ts [mots]
//
// Pour chaque scene a prise par camera : la forme et la hauteur retenues, et la verite du generateur (un pignon : deux pans, faitage
// perpendiculaire au mur, a sa hauteur ; une rampe : un appentis ; une bande de tuiles : deux pans parallele, sans hauteur vraie).
import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { coinsVrais, photographier, type PriseCamera } from '../../../../tests/banc/facades/synthese.ts';
import { analyserReleve, silhouetteEnPartsDuMur } from '../../../../src/facade/analyse.ts';
import { silhouetteSurLaPhoto } from '../../../../src/facade/mosaiqueFuites.ts';

const mots = process.argv.slice(2);
const fr = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
const dit = (t: { forme: string; faitage: string; hauteur: number } | null) => (t ? `${t.forme}${t.forme === 'deux-pans' ? ' (' + t.faitage + ')' : ''}, ${fr(t.hauteur)} m` : '—');
const lignes = ['| Scène | Vrai | Par la bande | Par la silhouette |', '|---|---|---|---|'];
let justesAvant = 0, justesApres = 0, pignons = 0;
for (const s of chargerCorpus()) {
  if (mots.length && !mots.some((m) => s.nom.includes(m))) continue;
  const p = s.synthese.prise;
  if (p.type !== 'camera') continue;
  const ph = photographier(s, 100, p as PriseCamera), coins = coinsVrais(s, p as PriseCamera);
  if (!ph || !coins) continue;
  const pg = s.synthese.mur.pignon ?? 0, sommet = s.synthese.mur.pignonSommet ?? 0.5;
  const vrai = pg ? (sommet >= 1 || sommet <= 0 ? { forme: 'appentis', faitage: 'parallele', hauteur: pg } : { forme: 'deux-pans', faitage: 'perpendiculaire', hauteur: pg }) : null;
  const base = { photo: ph.image, coins, largeur: s.verite.largeur, hauteur: s.verite.hauteur, focalePx: ph.focalePx, contour: [{ x: 0, y: 0 }, { x: s.verite.largeur, y: 0 }, { x: s.verite.largeur, y: 8 }, { x: 0, y: 8 }], cote: 0, distance: null };
  const avant = analyserReleve(base)?.toitEstime ?? null;
  const sil = silhouetteSurLaPhoto(ph.image, coins, ph.focalePx);
  const apres = analyserReleve({ ...base, silhouette: silhouetteEnPartsDuMur(coins, sil) })?.toitEstime ?? null;
  const juste = (t: typeof avant) => !!t && !!vrai && t.forme === vrai.forme && (t.forme !== 'deux-pans' || t.faitage === vrai.faitage) && Math.abs(t.hauteur - vrai.hauteur) <= 0.1 * vrai.hauteur;
  if (vrai) { pignons++; if (juste(avant)) justesAvant++; if (juste(apres)) justesApres++; }
  lignes.push(`| ${s.nom} | ${vrai ? dit(vrai) : 'bande de tuiles'} | ${dit(avant)} | ${dit(apres)} |`);
}
lignes.push(`| **Pignons justes** (forme, hauteur à 10 %) | ${pignons} | ${justesAvant}/${pignons} | ${justesApres}/${pignons} |`);
console.log(lignes.join('\n'));
