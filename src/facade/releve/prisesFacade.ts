// Les entrees d'une facade, une seule forme pour l'audit et la calibration (CLAUDE.md, « Calibration et audit : un seul processus ») :
// le cote du contour, ses photos avec leur prise de vue (GPS, boussole, EXIF), les corrections de la personne (reperes, mur pose a la
// main, echelle). L'audit les prend sur place (app/audit/parcelle/mesures.ts) ; la calibration les relit d'un cas enregistre
// (enchainement.ts::entreesDuCas). Les deux passent ensuite par les memes etapes (enchainement.ts::derouler) : ici ne se decide que
// d'ou viennent les entrees, jamais ce qu'on en fait.

import { CHAMP_GRAND_COTE_DEFAUT } from '../vision/cadrage.js';
import { projecteurLocal } from '../../geo/projection.js';
import { objectifsEnchainement, type Objectifs } from '../regles/facades/enchainement.js';
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

/** D'ou vient la position d'une photo : le GPS du telephone a la prise, sinon celui que l'appareil a ecrit dans l'EXIF. */
type ProvenancePosition = 'telephone' | 'exif';

/** La position d'une photo dans le repere du plan, sa precision, le cap de sa visee (null : inconnu) et sa provenance. */
interface PositionPhoto {
  x: number;
  y: number;
  precisionM: number | null;
  capDeg: number | null;
  provenance: ProvenancePosition;
}

/** L'origine du repere du plan (le calage du cadastre), en degres : ce qui projette un GPS dans le plan. */
interface OriginePlan { lat: number; lon: number }

/** La position d'une photo et, quand le GPS de l'EXIF n'a pas servi en entier (ignore, ou son cap), pourquoi, en clair. */
interface PositionDite { position: PositionPhoto | null; note: string | null }

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const metres = (v: number) => String(Math.round(v)).replace('.', ',');

/** La distance d'un point au segment du mur (pas a sa droite) : une position loin au bout du mur en est loin. */
function distanceAuSegment(f: Facade, p: PtBrut): number {
  const dx = f.droite.x - f.gauche.x, dy = f.droite.y - f.gauche.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - f.gauche.x) * dx + (p.y - f.gauche.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (f.gauche.x + t * dx), p.y - (f.gauche.y + t * dy));
}

/**
 * La position d'une photo, une seule regle pour l'audit et la calibration (decision du proprietaire, 7 novembre 2026) : celle du
 * telephone quand la photo en a une, telle quelle (rien ne change pour elle) ; sinon le GPS de son EXIF, projete dans le repere du plan
 * comme le telephone l'est (app/ecouteurs/positionGps.ts::positionDansLePlan, la meme projection depuis l'origine du cadastre).
 *
 * Le GPS de l'EXIF est moins sur : l'appareil n'en dit pas la precision, elle est supposee (`precisionExifM`) ; il est ignore, et la
 * raison dite, sans origine du plan, derriere le mur (dans le batiment) ou a plus de `distanceExifMaxM` du mur. Son cap ne sert que
 * rapporte au nord vrai (`T`) : un cap magnetique ne se corrige pas sans la declinaison du lieu et du jour, et un nord non dit ne se
 * devine pas ; il est alors ignore, et dit.
 */
function positionDeLaPhoto(photo: { prise?: PrisePhoto | null; optique?: OptiquePhoto | null }, facade: Facade, origine: OriginePlan | null, reglages: Partial<Objectifs> = {}): PositionDite {
  const p = photo.prise;
  if (p) return { position: { x: p.x, y: p.y, precisionM: p.precisionM, capDeg: p.sourceAzimut === 'boussole' ? p.azimutDeg : null, provenance: 'telephone' }, note: null };
  const g = photo.optique?.exif?.gps;
  if (!g || !fini(g.lat) || !fini(g.lon)) return { position: null, note: null };
  if (!origine) return { position: null, note: 'GPS de l’EXIF non utilisé : le plan n’est pas calé sur le cadastre' };
  const obj = objectifsEnchainement(reglages);
  const q = projecteurLocal(origine.lat, origine.lon).versMetres(g.lon, g.lat);
  const devant = (q.x - facade.gauche.x) * facade.normale.x + (q.y - facade.gauche.y) * facade.normale.y;
  const d = distanceAuSegment(facade, q), max = obj['facades.enchainement.distanceExifMaxM'];
  if (!(devant > 0)) return { position: null, note: 'GPS de l’EXIF ignoré : derrière le mur' };
  if (d > max) return { position: null, note: `GPS de l’EXIF ignoré : à ${metres(d)} m du mur (au-delà de ${metres(max)} m)` };
  const capT = g.capDeg !== null && fini(g.capDeg) && g.nordCap === 'T';
  const noteCap = g.capDeg === null || capT ? null : g.nordCap === 'M' ? 'cap de l’EXIF ignoré (nord magnétique)' : 'cap de l’EXIF ignoré (nord non dit)';
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    position: { x: r(q.x), y: r(q.y), precisionM: obj['facades.enchainement.precisionExifM'], capDeg: capT ? (((g.capDeg as number) % 360) + 360) % 360 : null, provenance: 'exif' },
    note: noteCap,
  };
}

/** La position du telephone seule : une photo lue sans origine du plan (un appelant d'avant), comme avant le GPS de l'EXIF. */
const duTelephone = (photo: { prise?: PrisePhoto | null }): PositionPhoto | null => {
  const p = photo.prise;
  return p ? { x: p.x, y: p.y, precisionM: p.precisionM, capDeg: p.sourceAzimut === 'boussole' ? p.azimutDeg : null, provenance: 'telephone' } : null;
};

/**
 * La prise du releve d'apres la photo de l'audit : sa position (celle du telephone, sinon celle de l'EXIF : positionDeLaPhoto) donne la
 * distance au mur (a la precision du GPS), la boussole le cap, l'EXIF le champ de l'objectif.
 * Le cap du sens de la marche ne dit pas ou visait le telephone : il n'est pas repris.
 *
 * L'attitude n'est pas reprise non plus : elle est lue au retour de l'appareil photo, telephone baisse vers l'ecran, pas au
 * declenchement. Sur l'audit d'AE 101 (18 octobre), elle valait -17 a -48 degres pour des photos prises vers le haut : le calage,
 * qui ne lui laisse que 3 degres de marge, cherchait les coins la ou le mur n'etait pas. Inconnue, elle se lit sur la photo (le
 * point de fuite des verticales, calageFin.ts), dans une marge de 20 degres.
 */
export function priseDeLaPhoto(photo: { prise?: PrisePhoto | null; optique?: OptiquePhoto | null }, image: Image, facade: Facade, champLu: number | null = null, position: PositionPhoto | null = duTelephone(photo)): Prise {
  const o = objectifRange(photo);
  const distance = position ? distanceAuMur(facade, position) : 0;
  // Un GPS de telephone se trompe de 3 a 8 m : a cette distance du mur, il ne dit pas ou se tenait la personne (AE 101 : 2,7 m
  // pour un pignon vu en entier, a 7 m). La distance ne sert que si elle depasse deux fois la precision ; sinon le cadrage la
  // suppose (le mur sur les sept dixiemes de la photo), avec sa marge. Une position de l'EXIF porte une precision supposee.
  const fiable = distance > 0.5 && position?.precisionM != null && distance > 2 * position.precisionM;
  // Sans EXIF, le champ note est celui d'un telephone : celui que donnent les points de fuite de la photo l'emporte (AE 101 : des
  // photos a l'ultra grand-angle, deux fois plus larges que le champ suppose ; l'inclinaison lue sur les verticales en depend).
  // L'objectif est celui de la prise ou, sans prise, celui de l'optique rangee avec la photo : le meme EXIF dans les deux cas.
  const champ = o.sourceFocale === 'defaut' || o.champDeg == null ? (champLu ?? o.champDeg ?? null) : o.champDeg;
  return {
    photo: { image, url: '', champ, focalePx: null },
    mesure: fiable ? { distance: Math.round(distance * 100) / 100, source: 'gps' } : null,
    champ: champ ?? CHAMP_GRAND_COTE_DEFAUT,
    cap: position?.capDeg ?? null,
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
  /** L'optique rangee avec chaque photo qui en a une, par rang : l'E3 (l'objectif) la montre ; la prise la lit deja (priseDeLaPhoto). */
  optiques?: readonly { rang: number; optique: OptiquePhoto }[];
  /**
   * D'ou vient la position de chaque photo qui n'a pas celle du telephone mais un GPS dans son EXIF, par rang : `exif` quand il sert,
   * null quand il est ignore ; et pourquoi (la note). L'E2 le dit (texteDesPositions). Absent quand toutes ont la leur, ou aucune GPS.
   */
  positions?: readonly { rang: number; provenance: ProvenancePosition | null; note: string | null }[];
}

/** Le motif d'une photo dont l'image ne se decode pas : l'E5 le reconnait pour conseiller de la reprendre, pas d'y poser des reperes. */
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
export function prisesDeLaFacade(d: { facade: Facade; contour: readonly PtBrut[]; photos: readonly PhotoDeLaFacade[]; corrections: Readonly<Record<string, CorrectionRedressement>>; murConfirme?: MurConfirme | null | undefined; ouverturesRelues?: OuverturesRelues | null | undefined; jpeg: (img: Image) => string; origine?: OriginePlan | null | undefined }): PrisesFacade {
  const { corrections } = d;
  const largeurM = Object.keys(corrections).map(Number).sort((a, b) => a - b).map((k) => corrections[String(k)]?.echelleLargeurM).find((v) => typeof v === 'number' && v > 0);
  const facade: Facade = largeurM ? { ...d.facade, largeur: largeurM } : d.facade;
  // La position de chaque photo, une fois : celle du telephone, sinon celle de l'EXIF (positionDeLaPhoto) ; elle ordonne et situe.
  const dites = new Map(d.photos.map((p) => [p.rang, positionDeLaPhoto(p, facade, d.origine ?? null)]));
  const pos = (rang: number) => dites.get(rang)?.position ?? null;
  const ordre = [...d.photos].sort((a, b) => Number(!pos(a.rang)) - Number(!pos(b.rang)) || a.rang - b.rang);
  const photos: PhotoARedresser[] = [];
  const illisibles: BilanPhotoRedressement[] = [];
  for (const p of ordre) {
    const image = p.image;
    if (!image) { illisibles.push({ rang: p.rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: MOTIF_ILLISIBLE }); continue; }
    photos.push({ rang: p.rang, image, prise: (champLu) => priseDeLaPhoto(p, image, facade, champLu, pos(p.rang)), champConnu: objectifRange(p).sourceFocale === 'exif' });
  }
  const optiques = d.photos.flatMap((p) => (p.optique ? [{ rang: p.rang, optique: p.optique }] : []));
  // Seules les photos dont le GPS de l'EXIF a ete lu se disent : une photo a la position du telephone, ou sans GPS, ne change rien.
  const positions = [...d.photos].sort((a, b) => a.rang - b.rang).flatMap((p) => {
    const x = dites.get(p.rang);
    return x && (x.position?.provenance === 'exif' || x.note) ? [{ rang: p.rang, provenance: x.position?.provenance ?? null, note: x.note }] : [];
  });
  return { facade, contour: d.contour, photos, illisibles, corrections, murConfirme: d.murConfirme ?? null, ouverturesRelues: d.ouverturesRelues ?? null, jpeg: d.jpeg, ...(optiques.length ? { optiques } : {}), ...(positions.length ? { positions } : {}) };
}

/**
 * Ce que l'E2 dit des positions tirees de l'EXIF (« Photo 2 : position tirée de l’EXIF, à 8 m près. ») ; vide quand toutes les photos ont
 * la position du telephone, ou aucune un GPS dans leur EXIF.
 */
export function texteDesPositions(p: Pick<PrisesFacade, 'positions'>, precisionExifM: number = objectifsEnchainement()['facades.enchainement.precisionExifM']): string {
  return (p.positions ?? []).map((x) => {
    const tete = 'Photo ' + (x.rang + 1) + ' : ';
    if (x.provenance === 'exif') return tete + 'position tirée de l’EXIF, à ' + metres(precisionExifM) + ' m près' + (x.note ? ' ; ' + x.note : '') + '.';
    return tete + (x.note ?? '') + '.';
  }).join(' ');
}
