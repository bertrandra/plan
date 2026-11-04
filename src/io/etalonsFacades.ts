// Les etalons de synthese de l'ecran Admin › Calibration (facade/banc/etalons.ts) : les scenes du banc des facades, lues dans le corpus
// du depot (tests/fixtures/facades/*.json) et rendues dans le navigateur a la demande.
//
// Le corpus reste la seule verite : le paquet porte les descriptions JSON (70 Ko, moins en morceau minifie), jamais d'images. Ce module
// n'est charge que par l'ecran de calibration, lui-meme charge a la demande (main.ts) : la page de Plan n'en porte rien. Le generateur
// (facade/banc/synthese.ts) se charge a son tour quand on liste ou ouvre un etalon.
//
// Les pixels rendus sont gardes tels quels, par adresse : `imageDeLEtalon` les rend a l'editeur au lieu de decoder l'image montree
// (un JPEG, pour l'oeil). La chaine lit donc les memes pixels que le banc, au bit pres.

import type { SceneFacade } from '../facade/banc/synthese.js';
import type { ResumeEtalon } from '../facade/banc/etalons.js';
import type { CasReel } from '../facade/corpusReel.js';
import type { Image, P2 } from '../facade/vision/homographie.js';

// Les scenes du corpus, dans l'ordre de leur nom (00 a 26), comme `chargerCorpus` du banc. Le dossier lecture-5.1.0/ n'est pas une scene.
const fichiers = import.meta.glob('../../tests/fixtures/facades/*.json', { eager: true, import: 'default' });
const scenes: readonly SceneFacade[] = Object.keys(fichiers).sort().map((k) => fichiers[k] as SceneFacade);

/** Les pixels des photos rendues, par l'adresse que l'ecran leur a donnee. */
const pixels = new Map<string, Image>();

const etalons = () => import('../facade/banc/etalons.js');

/** La scene d'un etalon, par son identifiant d'ecran ; null : inconnu. */
export function sceneDeLEtalon(id: string): SceneFacade | null {
  return scenes.find((x) => 'etalon-' + x.nom === id) ?? null;
}

export async function listerEtalons(): Promise<ResumeEtalon[]> {
  const m = await etalons();
  return scenes.map(m.resumeEtalon);
}

/**
 * Rend un etalon : ses photos (les pixels du banc), montrees par `montrer` (une adresse d'image), son cas et ses coins vrais. Leve sur un etalon
 * inconnu ou une scene sans photo.
 */
export async function ouvrirEtalon(id: string, montrer: (img: Image) => string): Promise<{ cas: CasReel & { images: string[] }; coinsVrais: (P2[] | null)[] }> {
  const m = await etalons();
  const s = scenes.find((x) => m.PREFIXE_ETALON + x.nom === id);
  if (!s) throw new Error('Étalon inconnu : ' + id + '.');
  const photos = m.photosDeLEtalon(s);
  if (!photos.length) throw new Error('Cet étalon n’a pas de photo.');
  // Un etalon ouvert a la fois : les pixels du precedent (quelques Mo par photo) sont laches.
  pixels.clear();
  const images = photos.map((p) => { const url = montrer(p.image); pixels.set(url, p.image); return url; });
  // Les coins vrais de chaque photo : la verite de l'E5 se porte avec eux sur l'assemblage de chaque rejeu (etalons.ts::calageVraiDuRejeu).
  return { cas: { ...m.casDeLEtalon(s, photos, images.map((_, k) => 'photo-' + (k + 1))), images }, coinsVrais: m.coinsVraisDesPhotos(s) };
}

/** Les pixels d'une photo d'etalon montree a cette adresse (une copie), ou null : l'adresse n'est pas celle d'un etalon. */
export function imageDeLEtalon(url: string): Image | null {
  const img = pixels.get(url);
  return img ? { largeur: img.largeur, hauteur: img.hauteur, donnees: new Uint8ClampedArray(img.donnees) } : null;
}
