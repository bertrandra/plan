// La photo jointe a un cas (MD/spec-audit.md §5) : prise avec l'appareil, reduite a 1 280 px de
// large en JPEG, environ 300 Ko, puis gardee en base64 dans le fichier de la promenade.
//
// La focale et le modele d'appareil se lisent dans l'EXIF du fichier d'origine, avant la reduction
// qui l'efface. Quand l'EXIF manque (iOS en retire une partie selon les reglages), la focale retenue
// pour ce modele lors d'une photo precedente sert ; sinon le champ par defaut du releve, annonce
// comme une estimation.

import type { PhotoCas, PrisePhoto } from '../../model/audit.js';
import { lireExif, champDepuisFocale35, focale35DepuisChamp, type ExifPhoto } from '../../facade/vision/exif.js';
import { CHAMP_GRAND_COTE_DEFAUT } from '../../facade/vision/cadrage.js';

/** La largeur (ou hauteur) maxi de l'image reduite. */
export const COTE_PHOTO_MAX_PX = 1280;
/** Le poids vise ; la qualite JPEG descend jusqu'a l'atteindre. */
export const OCTETS_PHOTO_MAX = 300 * 1024;
/** L'EXIF tient dans le segment APP1, au debut du fichier, 64 Ko au plus : inutile de tout relire. */
const OCTETS_EXIF_MAX = 128 * 1024;

/** Les dimensions reduites d'une image, proportions gardees. */
export function dimensionsReduites(l: number, h: number, max = COTE_PHOTO_MAX_PX): { l: number; h: number } {
  const k = Math.min(1, max / Math.max(l, h));
  return { l: Math.round(l * k), h: Math.round(h * k) };
}

/** Le poids en octets d'une chaine base64. */
export const octetsBase64 = (b64: string): number => Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** L'optique d'une photo, telle qu'elle se range dans sa prise de vue. */
export type OptiquePhoto = Required<Pick<PrisePhoto, 'focale35' | 'champDeg' | 'sourceFocale' | 'modeleAppareil'>>;

/** Les focales apprises, par modele d'appareil. */
export interface MemoireFocales {
  lire(modele: string | null): number | null;
  retenir(modele: string, focale35: number): void;
}

/** La cle de la focale apprise en dernier, pour une photo sans modele : sur ce navigateur, c'est ce telephone. */
const DERNIERE = '';
const CLE_STOCKAGE = 'plan.audit.focales';

/**
 * Les focales apprises, gardees dans le navigateur : une commodite, pas une donnee du projet. Le
 * stockage peut manquer (navigation privee, site bloque) : alors on n'apprend rien, sans erreur.
 */
export function memoireFocalesLocale(stockage: Pick<Storage, 'getItem' | 'setItem'> | null = stockageLocal()): MemoireFocales {
  const lireTout = (): Record<string, number> => {
    try {
      const t = stockage?.getItem(CLE_STOCKAGE);
      const v = t ? (JSON.parse(t) as unknown) : null;
      return v && typeof v === 'object' ? (v as Record<string, number>) : {};
    } catch { return {}; }
  };
  return {
    lire(modele) {
      const f = lireTout()[modele ?? DERNIERE];
      return typeof f === 'number' && Number.isFinite(f) && f > 0 ? f : null;
    },
    retenir(modele, focale35) {
      try { stockage?.setItem(CLE_STOCKAGE, JSON.stringify({ ...lireTout(), [modele]: focale35, [DERNIERE]: focale35 })); } catch { /* rien a apprendre */ }
    },
  };
}

function stockageLocal(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

const auDixieme = (v: number) => Math.round(v * 10) / 10;

/**
 * La focale retenue pour une photo : celle de son EXIF (et on l'apprend pour ce modele), sinon celle
 * apprise pour ce modele, sinon le champ par defaut du releve (67 degres sur le grand cote).
 */
export function optiqueDeLaPhoto(exif: ExifPhoto, memoire: MemoireFocales): OptiquePhoto {
  const modeleAppareil = exif.modele;
  if (exif.focale35 !== null) {
    if (modeleAppareil) memoire.retenir(modeleAppareil, exif.focale35);
    return { focale35: exif.focale35, champDeg: auDixieme(champDepuisFocale35(exif.focale35)), sourceFocale: 'exif', modeleAppareil };
  }
  const apprise = memoire.lire(modeleAppareil);
  if (apprise !== null) return { focale35: apprise, champDeg: auDixieme(champDepuisFocale35(apprise)), sourceFocale: 'appareil', modeleAppareil };
  return { focale35: auDixieme(focale35DepuisChamp(CHAMP_GRAND_COTE_DEFAUT)), champDeg: CHAMP_GRAND_COTE_DEFAUT, sourceFocale: 'defaut', modeleAppareil };
}

/** L'EXIF du fichier d'origine ; un fichier illisible n'a pas d'EXIF. */
export async function lireExifFichier(fichier: Blob): Promise<ExifPhoto> {
  try { return lireExif(await fichier.slice(0, OCTETS_EXIF_MAX).arrayBuffer()); } catch { return { focale35: null, modele: null }; }
}

/** Une photo reduite, et la taille de sa source. */
export interface PhotoReduite extends PhotoCas {
  source: { largeurPx: number; hauteurPx: number };
}

/** Reduit un fichier image (l'appareil photo du telephone) en JPEG d'environ 300 Ko. */
export async function reduirePhoto(fichier: Blob): Promise<PhotoReduite> {
  const image = await createImageBitmap(fichier);
  const source = { largeurPx: image.width, hauteurPx: image.height };
  const { l, h } = dimensionsReduites(image.width, image.height);
  const toile = document.createElement('canvas');
  toile.width = l; toile.height = h;
  const g = toile.getContext('2d');
  if (!g) throw new Error('canevas indisponible');
  g.drawImage(image, 0, 0, l, h);
  image.close?.();
  let base64 = '';
  for (let q = 0.85; q >= 0.4; q -= 0.1) {
    base64 = toile.toDataURL('image/jpeg', q).split(',')[1] ?? '';
    if (octetsBase64(base64) <= OCTETS_PHOTO_MAX) break;
  }
  return { type: 'image/jpeg', base64, source };
}

/**
 * La photo d'un cas, complete : l'optique lue sur le fichier d'origine, puis la reduction. `prise`
 * (position, cap, attitude) a ete relevee au retour de l'appareil photo ; sans position connue, la
 * photo n'a pas de prise de vue.
 */
export async function preparerPhoto(fichier: Blob, prise: PrisePhoto | null, memoire: MemoireFocales = memoireFocalesLocale()): Promise<PhotoCas> {
  const optique = optiqueDeLaPhoto(await lireExifFichier(fichier), memoire);
  const { source, ...photo } = await reduirePhoto(fichier);
  // La taille de la source se garde avec la prise : la reduction l'efface, comme l'EXIF.
  return prise ? { ...photo, prise: { ...prise, ...optique, largeurSourcePx: source.largeurPx, hauteurSourcePx: source.hauteurPx } } : photo;
}
