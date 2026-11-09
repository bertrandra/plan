// La sequence des photos d'un cas de calibration : en ajouter (importees), en retirer, les ordonner (demande du proprietaire, 9 novembre
// 2026 : « Dans calibration je peux uploader des photos. Supprimer, ajouter, ordonner la séquence des photos. »). Pur, sans DOM.
//
// L'ordre compte pour la chaine : la premiere photo dont la focale le permet mesure la hauteur, la mosaique et l'assemblage prennent les
// photos dans cet ordre (facade/analyseMur.ts). Chaque photo emporte avec elle ce qui est a elle (son image, ses coins, ses reperes, son
// mur pose a la main, sa prise de vue, son optique) ; ce qui designe les photos par leur rang suit, ou ne vaut plus :
// - le mur confirme (V1) suit un deplacement ; une photo retiree le rend a confirmer de nouveau, comme dans l'audit
//   (app/audit/parcelle/capture.ts::retirerPhotoFacade), qui retire aussi les ouvertures relues (V3) ;
// - la verite de l'E7 (`calageVrai`) est posee en pixels de l'assemblage, que toute retouche de la sequence change : elle ne vaut plus
//   (celle d'un etalon se recalcule a chaque rejeu, depuis ses coins vrais, qui suivent les photos : `suivreListe`).
// Les reponses de Claude restent : celle lue sur un autre assemblage le dit d'elle-meme au rejeu (enchainement.ts, sa taille).

import type { CasStocke, PhotoReelle } from './corpusReel.js';
import type { PhotoCas } from '../model/audit.js';
import { PHOTOS_PAR_FACADE_MAX } from '../model/auditParcelle.js';

/** Le nombre de photos d'un cas : celui d'une facade de l'audit, et ce que le serveur garde (deploy/admin.php, 1 a 8). */
export const PHOTOS_PAR_CAS_MAX = PHOTOS_PAR_FACADE_MAX;

/** Le cas apres un geste sur ses photos, et, pour chaque rang nouveau, le rang qu'avait la photo (null : une photo ajoutee). */
export interface SuiteDesPhotos { cas: CasStocke; ordre: (number | null)[] }

/** Le cas aux photos prises dans cet ordre (des rangs d'avant) : images et photos ensemble, le mur confirme renumerote. */
function reordonner(cas: CasStocke, ordre: readonly number[]): CasStocke {
  const suite: CasStocke = { ...cas, images: ordre.map((k) => cas.images[k] as string), photos: ordre.map((k) => cas.photos[k] as PhotoReelle) };
  delete suite.calageVrai;
  if (cas.murConfirme) {
    const coins = cas.murConfirme.coins.flatMap((c) => { const r = ordre.indexOf(c.rang); return r < 0 ? [] : [{ ...c, rang: r }]; }).sort((a, b) => a.rang - b.rang);
    suite.murConfirme = { ...cas.murConfirme, coins };
  }
  return suite;
}

/** Retirer la photo de rang `k` : le mur confirme et les ouvertures relues sont a refaire, comme dans l'audit. */
export function sansLaPhoto(cas: CasStocke, k: number): SuiteDesPhotos {
  if (k < 0 || k >= cas.photos.length) return { cas, ordre: cas.photos.map((_, i) => i) };
  const ordre = cas.photos.map((_, i) => i).filter((i) => i !== k);
  const suite = reordonner(cas, ordre);
  delete suite.murConfirme; delete suite.ouverturesRelues;
  return { cas: suite, ordre };
}

/** Deplacer la photo de rang `de` au rang `vers` (les autres glissent d'un cran) : la meme sequence, dans un autre ordre. */
export function photoDeplacee(cas: CasStocke, de: number, vers: number): SuiteDesPhotos {
  const n = cas.photos.length, identite = cas.photos.map((_, i) => i);
  if (de < 0 || de >= n || vers < 0 || vers >= n || de === vers) return { cas, ordre: identite };
  const ordre = identite.filter((i) => i !== de);
  ordre.splice(vers, 0, de);
  return { cas: reordonner(cas, ordre), ordre };
}

/** Une photo importee, prete a entrer dans un cas : son image (l'adresse du JPEG reduit) et sa photo (son optique, sa prise s'il y en a). */
export interface PhotoImportee { image: string; photo: PhotoReelle }

/**
 * Une photo preparee comme dans l'audit (app/audit/photo.ts::preparerPhoto : reduite a 1 280 px, l'EXIF lu avant la reduction et range
 * dans l'optique, toujours) devient une photo de cas : son optique et sa prise gardees, des coins provisoires (le cadre a 12 % des
 * bords, comme les reperes par defaut) que le rejeu remplace par ceux qu'il trouve ; ils ne sont pas une entree (pas a la main).
 */
export function photoImportee(p: PhotoCas, fichier: string): PhotoImportee {
  const l = p.optique?.reduite.largeurPx ?? 1000, h = p.optique?.reduite.hauteurPx ?? 1000;
  const coins = [{ x: l * 0.12, y: h * 0.12 }, { x: l * 0.88, y: h * 0.12 }, { x: l * 0.88, y: h * 0.88 }, { x: l * 0.12, y: h * 0.88 }];
  return {
    image: 'data:' + p.type + ';base64,' + p.base64,
    photo: {
      fichier, coins,
      ...(p.prise ? { prise: JSON.parse(JSON.stringify(p.prise)) as NonNullable<PhotoCas['prise']> } : {}),
      ...(p.optique ? { optique: JSON.parse(JSON.stringify(p.optique)) as NonNullable<PhotoCas['optique']> } : {}),
    },
  };
}

/** Un nom de fichier libre dans le cas pour une photo importee (`import-1`, `import-2`…) : les noms restent uniques. */
export function nomLibre(cas: Pick<CasStocke, 'photos'>, deja: readonly string[] = []): string {
  const pris = new Set([...cas.photos.map((p) => p.fichier), ...deja]);
  let k = 1;
  while (pris.has('import-' + k)) k++;
  return 'import-' + k;
}

/** Ajouter des photos importees a la fin de la sequence, dans la limite du cas ; rend aussi celles qui n'y entrent pas. */
export function avecLesPhotos(cas: CasStocke, ajouts: readonly PhotoImportee[]): SuiteDesPhotos & { refusees: number } {
  const place = Math.max(0, PHOTOS_PAR_CAS_MAX - cas.photos.length), pris = ajouts.slice(0, place);
  const ordre = [...cas.photos.map((_, i): number | null => i), ...pris.map(() => null)];
  if (!pris.length) return { cas, ordre, refusees: ajouts.length };
  const suite: CasStocke = { ...cas, images: [...cas.images, ...pris.map((a) => a.image)], photos: [...cas.photos, ...pris.map((a) => a.photo)] };
  delete suite.calageVrai;
  return { cas: suite, ordre, refusees: ajouts.length - pris.length };
}

/** Ce qui est range par rang (dimensions, origine des coins) suit les photos ; une photo ajoutee n'a rien. */
export function suivreLesRangs<T>(r: Readonly<Record<number, T>>, ordre: readonly (number | null)[]): Record<number, T> {
  return Object.fromEntries(ordre.flatMap((avant, k): [number, T][] => (avant !== null && r[avant] !== undefined ? [[k, r[avant] as T]] : [])));
}

/** Une liste par photo (les coins vrais d'un etalon) suit les photos ; une photo ajoutee prend `defaut`. */
export function suivreListe<T>(l: readonly T[], ordre: readonly (number | null)[], defaut: T): T[] {
  return ordre.map((avant) => (avant !== null && avant < l.length ? l[avant] as T : defaut));
}
