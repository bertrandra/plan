// Les entrees d'une facade, une seule forme pour l'audit et la calibration (CLAUDE.md, « Calibration et audit : un seul processus ») :
// le cote du contour, ses photos avec leur prise de vue (GPS, boussole, EXIF), les corrections de la personne (reperes, mur pose a la
// main, echelle). L'audit les prend sur place (app/audit/parcelle/mesures.ts) ; la calibration les relit d'un cas enregistre
// (enchainement.ts::entreesDuCas). Les deux passent ensuite par les memes etapes (enchainement.ts::derouler) : ici ne se decide que
// d'ou viennent les entrees, jamais ce qu'on en fait.

import { CHAMP_GRAND_COTE_DEFAUT } from '../vision/cadrage.js';
import type { Facade } from '../../geometry/cotesVusDeDehors.js';
import type { Image } from '../vision/homographie.js';
import type { OptiquePhoto, PhotoCas, PrisePhoto } from '../../model/audit.js';
import type { BilanPhotoRedressement, CorrectionRedressement, MurConfirme, OuverturesRelues } from '../../model/auditParcelle.js';
import type { PtBrut } from '../../model/types.js';
import type { PhotoARedresser } from './chaine.js';
import type { Prise } from './prise.js';

/** La distance de la prise de vue au mur, perpendiculairement, en metres. */
export function distanceAuMur(f: Facade, p: PtBrut): number {
  const dx = f.droite.x - f.gauche.x, dy = f.droite.y - f.gauche.y;
  const l = Math.hypot(dx, dy);
  if (!(l > 0)) return Math.hypot(p.x - f.gauche.x, p.y - f.gauche.y);
  return Math.abs(dx * (p.y - f.gauche.y) - dy * (p.x - f.gauche.x)) / l;
}

/**
 * L'objectif d'une photo : celui que porte sa prise (l'optique y est recopiee a la prise) ; sans prise, celui de son optique quand il vient
 * de l'EXIF de la photo (le meme champ qu'avec GPS) ; sinon rien, et le champ se lit sur ses points de fuite, comme avant l'optique. Une
 * photo sans prise et sans EXIF est souvent importee d'un autre appareil : la focale apprise pour ce telephone ne lui est pas prise.
 */
function objectifRange(photo: { prise?: PrisePhoto | null; optique?: OptiquePhoto | null }): Pick<PrisePhoto, 'champDeg' | 'sourceFocale'> {
  const p = photo.prise, o = photo.optique;
  if (p && (p.sourceFocale != null || p.champDeg != null)) return { champDeg: p.champDeg ?? null, sourceFocale: p.sourceFocale ?? null };
  if (o && o.sourceFocale === 'exif' && Number.isFinite(o.champDeg) && o.champDeg > 0) return { champDeg: o.champDeg, sourceFocale: 'exif' };
  return { champDeg: p?.champDeg ?? null, sourceFocale: p?.sourceFocale ?? null };
}

/**
 * La prise du releve d'apres la photo de l'audit : sa position donne la distance au mur (a la
 * precision du GPS), la boussole le cap, l'EXIF le champ de l'objectif.
 * Le cap du sens de la marche ne dit pas ou visait le telephone : il n'est pas repris.
 *
 * L'attitude n'est pas reprise non plus : elle est lue au retour de l'appareil photo, telephone baisse vers l'ecran, pas au
 * declenchement. Sur l'audit d'AE 101 (18 octobre), elle valait -17 a -48 degres pour des photos prises vers le haut : le calage,
 * qui ne lui laisse que 3 degres de marge, cherchait les coins la ou le mur n'etait pas. Inconnue, elle se lit sur la photo (le
 * point de fuite des verticales, calageFin.ts), dans une marge de 20 degres.
 */
export function priseDeLaPhoto(photo: { prise?: PrisePhoto | null; optique?: OptiquePhoto | null }, image: Image, facade: Facade, champLu: number | null = null): Prise {
  const p = photo.prise ?? undefined;
  const o = objectifRange(photo);
  const distance = p ? distanceAuMur(facade, p) : 0;
  // Un GPS de telephone se trompe de 3 a 8 m : a cette distance du mur, il ne dit pas ou se tenait la personne (AE 101 : 2,7 m
  // pour un pignon vu en entier, a 7 m). La distance ne sert que si elle depasse deux fois la precision ; sinon le cadrage la
  // suppose (le mur sur les sept dixiemes de la photo), avec sa marge.
  const fiable = distance > 0.5 && p?.precisionM != null && distance > 2 * p.precisionM;
  // Sans EXIF, le champ note est celui d'un telephone : celui que donnent les points de fuite de la photo l'emporte (AE 101 : des
  // photos a l'ultra grand-angle, deux fois plus larges que le champ suppose ; l'inclinaison lue sur les verticales en depend).
  // L'objectif est celui de la prise ou, sans prise, celui de l'optique rangee avec la photo : le meme EXIF dans les deux cas.
  const champ = o.sourceFocale === 'defaut' || o.champDeg == null ? (champLu ?? o.champDeg ?? null) : o.champDeg;
  return {
    photo: { image, url: '', champ, focalePx: null },
    mesure: fiable ? { distance: Math.round(distance * 100) / 100, source: 'gps' } : null,
    champ: champ ?? CHAMP_GRAND_COTE_DEFAUT,
    cap: p?.sourceAzimut === 'boussole' ? p.azimutDeg : null,
    attitude: null,
  };
}

/** Les entrees d'une facade, pretes pour l'enchainement : ce que l'audit prend sur place et ce qu'un cas de calibration relit. */
export interface PrisesFacade {
  /** Le cote du contour, a la largeur corrigee par la personne s'il y a lieu, et a la hauteur du mur sous le toit. */
  facade: Facade;
  contour: readonly PtBrut[];
  /** Les photos lisibles, la premiere avec une prise de vue d'abord (l'ordre du redressement). */
  photos: readonly PhotoARedresser[];
  /** Les photos illisibles : leur echec, dit avec son motif. */
  illisibles: readonly BilanPhotoRedressement[];
  corrections: Readonly<Record<string, CorrectionRedressement>>;
  /** Le mur que la personne a confirme au point V1 (« Confirmer le mur ») ; null : rien de confirme. */
  murConfirme: MurConfirme | null;
  /** Les ouvertures que la personne a relues au point V3 (« Relire les ouvertures ») ; null : pas encore relues. */
  ouverturesRelues: OuverturesRelues | null;
  /** Une image en JPEG (`data:`) : le canevas du navigateur ; une chaine vide hors navigateur (la mesure, le banc). */
  jpeg: (img: Image) => string;
}

/** Le motif d'une photo dont l'image ne se decode pas : l'E3 le reconnait pour conseiller de la reprendre, pas d'y poser des reperes. */
export const MOTIF_ILLISIBLE = 'image illisible';

/**
 * Une photo de la facade, a son rang : son image decodee (null : illisible), sa prise de vue (null : importee, ou sans position du
 * telephone) et son optique (absente d'une photo d'avant elle).
 */
interface PhotoDeLaFacade { rang: number; image: Image | null; prise: PrisePhoto | null; optique?: OptiquePhoto | null }

/** Ce que la chaine lit d'une photo rangee : sa prise et son optique. */
export const lecturePhoto = (p: Pick<PhotoCas, 'prise' | 'optique'> | undefined): Pick<PhotoDeLaFacade, 'prise' | 'optique'> => ({ prise: p?.prise ?? null, optique: p?.optique ?? null });

/**
 * Les entrees de l'enchainement d'une facade : l'echelle corrigee a la main (la premiere donnee l'emporte, pour toutes les photos du
 * mur), les photos dans l'ordre du redressement (celles qui ont une prise de vue d'abord, puis par rang), une photo illisible dite avec
 * son motif, la prise de chacune (priseDeLaPhoto).
 */
export function prisesDeLaFacade(d: { facade: Facade; contour: readonly PtBrut[]; photos: readonly PhotoDeLaFacade[]; corrections: Readonly<Record<string, CorrectionRedressement>>; murConfirme?: MurConfirme | null | undefined; ouverturesRelues?: OuverturesRelues | null | undefined; jpeg: (img: Image) => string }): PrisesFacade {
  const { corrections } = d;
  const largeurM = Object.keys(corrections).map(Number).sort((a, b) => a - b).map((k) => corrections[String(k)]?.echelleLargeurM).find((v) => typeof v === 'number' && v > 0);
  const facade: Facade = largeurM ? { ...d.facade, largeur: largeurM } : d.facade;
  const ordre = [...d.photos].sort((a, b) => Number(!a.prise) - Number(!b.prise) || a.rang - b.rang);
  const photos: PhotoARedresser[] = [];
  const illisibles: BilanPhotoRedressement[] = [];
  for (const p of ordre) {
    const image = p.image;
    if (!image) { illisibles.push({ rang: p.rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: MOTIF_ILLISIBLE }); continue; }
    photos.push({ rang: p.rang, image, prise: (champLu) => priseDeLaPhoto(p, image, facade, champLu), champConnu: objectifRange(p).sourceFocale === 'exif' });
  }
  return { facade, contour: d.contour, photos, illisibles, corrections, murConfirme: d.murConfirme ?? null, ouverturesRelues: d.ouverturesRelues ?? null, jpeg: d.jpeg };
}
