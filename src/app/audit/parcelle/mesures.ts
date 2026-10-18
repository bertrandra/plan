// Les mesures de l'audit de la parcelle, dans le telephone (MD/spec-audit.md §13.1) : pour chaque
// facade photographiee, ce que Plan sait mesurer sans serveur, de facon deterministe.
//
// - Le releve de la facade : la photo calee (coins predits par la prise de vue, lot L6, puis cherches
//   sur les aretes, lots L7 et L8), redressee, ses ouvertures detectees : la chaine du releve
//   (zones/releve/), reprise telle quelle, sans geste.
// - La hauteur a l'egout, mesuree par la perspective : elle ne compte que si les coins ont ete trouves
//   sur la photo ; des coins predits d'apres la hauteur connue rendraient cette hauteur.
// - La couleur du mur (lot L3) : lue sur chaque photo prise avec la boussole ; on garde la lecture
//   qui a le plus de points.
//
// Toutes les photos d'une facade sont redressees par la chaine de tous (zones/releve/chaine.ts, celle du releve et de la
// calibration : verticales sous SEUIL_VERTICALES_DEG, sinon repli sur les coins calcules, sinon echec dit avec son motif) ; a
// partir de deux photos redressees, elles sont fusionnees (facade/fusion.ts :
// ORB + RANSAC, criteres nommes dans facade/recalageOrb.ts). Aucune photo n'est jamais supprimee : une photo qui ne se
// fusionne pas reste seule, redressee. Les originaux sont immuables ; les corrections manuelles (coins, echelle) priment
// sur le calcul et ne sont jamais ecrasees par un rejeu.

import { CHAMP_GRAND_COTE_DEFAUT } from '../../../facade/cadrage.js';
import { versOuvertureFacade } from '../../../facade/verification.js';
import { lireFacadeSurPhoto, pixelsDePhoto } from '../../../render/couleurPhotoAudit.js';
import { analyserSerie, calageDeSerie, releveDuMur } from '../../../zones/releve/analyse.js';
import { type EntreeRecherche, type Morceau, type Resultat, type ResultatRecherche } from '../../../zones/releve/serie.js';
import { redresserEtFusionner, type PhotoARedresser } from '../../../zones/releve/chaine.js';
import type { Pixels } from '../../../render/couleurMurPhoto.js';
import type { Obstacle } from '../../../geometry/ligneDeVue.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { Image } from '../../../facade/homographie.js';
import type { Prise } from '../../../zones/releve/capteurs.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { BilanPhotoRedressement, BilanRedressement, CorrectionRedressement } from '../../../model/auditParcelle.js';
import type { SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { silhouetteDeEstimation } from '../../../facade/regles/toits/silhouettes.js';
import type { ObjetPolygone, OuvertureFacade, PtBrut, ReleveFacade } from '../../../model/types.js';

/** La cle d'une mesure : le batiment et le cote du mur (`cle#cote`). */
export const cleMesure = (cle: string, cote: number): string => cle + '#' + cote;

/** Ce que les mesures ont tire des photos d'une facade. */
export interface MesureFacade {
  cle: string;
  cote: number;
  /** Le releve, a la hauteur mesuree (ou estimee) ; null si la photo n'a pas pu s'analyser. */
  releve: ReleveFacade | null;
  /** La photo du releve, par son rang parmi celles de la facade. */
  rangReleve: number | null;
  /** Les quatre coins ont-ils ete trouves sur la photo (et non seulement predits) ? */
  coinsTrouves: boolean;
  /** La note du calage fin, de 0 a 1 ; null sans calage fin. */
  confiance: number | null;
  /** La hauteur a l'egout mesuree, quand les coins ont ete trouves. */
  hauteurM: number | null;
  /** La couleur du mur, la lecture la plus sure de ses photos. */
  couleur: { couleur: string; pixels: number; rang: number } | null;
  /**
   * Les baies devinees par la structure, laissees en pointille par le releve : le renfort de Claude
   * peut les confirmer (entreesRenfort.ts). Absentes d'une mesure lue dans un fichier d'audit, dont
   * le format ne les porte pas.
   */
  devinees?: OuvertureFacade[];
  /**
   * La ligne du haut du mur sur la photo (pignon, trapeze, rectangle, rampe...), lue par la silhouette au-dessus de l'egout
   * (facade/toit.ts) : de quoi dire les bouts du toit (facade/regles/toits/silhouettes.ts). `indetermine` quand le toit est
   * hors cadre. Absente d'une mesure lue dans un fichier d'audit d'avant elle.
   */
  silhouette?: SilhouetteFacade;
  /**
   * Le redressement de chaque photo (automatique, manuel ou en echec, avec son motif) et la fusion. Derive : le bouton
   * « Rejouer redressement + fusion » le recalcule, les originaux et les corrections manuelles n'y changent jamais.
   */
  redressement?: BilanRedressement;
}

export interface DependancesMesures {
  pixels?: (base64: string) => Promise<Pixels | null>;
  /** Le calage fin (worker du releve, zones/releve/rechercheCoins.ts). */
  chercherCoins: (e: EntreeRecherche) => Promise<ResultatRecherche>;
  /** L'elevation redressee en JPEG (`data:`) : le canevas du navigateur. */
  jpeg: (img: Image) => string;
  /** Les limites de parcelle, ou se tiennent les clotures (lecture de la couleur). */
  limites: () => readonly Obstacle[];
}

/** La distance de la prise de vue au mur, perpendiculairement, en metres. */
export function distanceAuMur(f: Facade, p: PtBrut): number {
  const dx = f.droite.x - f.gauche.x, dy = f.droite.y - f.gauche.y;
  const l = Math.hypot(dx, dy);
  if (!(l > 0)) return Math.hypot(p.x - f.gauche.x, p.y - f.gauche.y);
  return Math.abs(dx * (p.y - f.gauche.y) - dy * (p.x - f.gauche.x)) / l;
}

const versImage = (p: Pixels): Image => ({ largeur: p.largeur, hauteur: p.hauteur, donnees: p.data instanceof Uint8ClampedArray ? p.data : new Uint8ClampedArray(Array.from(p.data)) });

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
export function priseDeLaPhoto(photo: PhotoCas, image: Image, facade: Facade, champLu: number | null = null): Prise {
  const p = photo.prise;
  const distance = p ? distanceAuMur(facade, p) : 0;
  // Un GPS de telephone se trompe de 3 a 8 m : a cette distance du mur, il ne dit pas ou se tenait la personne (AE 101 : 2,7 m
  // pour un pignon vu en entier, a 7 m). La distance ne sert que si elle depasse deux fois la precision ; sinon le cadrage la
  // suppose (le mur sur les sept dixiemes de la photo), avec sa marge.
  const fiable = distance > 0.5 && p?.precisionM != null && distance > 2 * p.precisionM;
  // Sans EXIF, le champ note est celui d'un telephone : celui que donnent les points de fuite de la photo l'emporte (AE 101 : des
  // photos a l'ultra grand-angle, deux fois plus larges que le champ suppose ; l'inclinaison lue sur les verticales en depend).
  const champ = p?.sourceFocale === 'defaut' || p?.champDeg == null ? (champLu ?? p?.champDeg ?? null) : p.champDeg;
  return {
    photo: { image, url: '', champ, focalePx: null },
    mesure: fiable ? { distance: Math.round(distance * 100) / 100, source: 'gps' } : null,
    reperes: null,
    champ: champ ?? CHAMP_GRAND_COTE_DEFAUT,
    photosPrevues: null,
    cap: p?.sourceAzimut === 'boussole' ? p.azimutDeg : null,
    attitude: null,
  };
}

/** La couleur du mur sur chaque photo prise a la boussole ; la lecture qui a le plus de points. */
async function couleurDesPhotos(photos: readonly PhotoCas[], images: (i: number) => Promise<Pixels | null>, f: Facade, d: DependancesMesures): Promise<MesureFacade['couleur']> {
  let meilleure: MesureFacade['couleur'] = null;
  for (let i = 0; i < photos.length; i++) {
    const prise = photos[i]?.prise;
    if (!prise || prise.azimutDeg === null || prise.sourceAzimut !== 'boussole') continue;
    const img = await images(i);
    if (!img) continue;
    const l = lireFacadeSurPhoto(img, prise, { a: f.gauche, b: f.droite, egout: f.hauteur }, d.limites());
    if (l.couleur && (!meilleure || l.pixels > meilleure.pixels)) meilleure = { couleur: l.couleur, pixels: l.pixels, rang: i };
  }
  return meilleure;
}


export { SEUIL_VERTICALES_DEG, verticaliteDeg } from '../../../zones/releve/chaine.js';

type Analyse = NonNullable<ReturnType<typeof analyserSerie>>;

/** Le releve d'une analyse (une photo ou une fusion), tel qu'il s'ecrit pour le mur. */
function releveDeLAnalyse(a: Analyse, morceaux: Morceau[], f: Facade, d: DependancesMesures, assemblage: 'morceaux' | 'vues') {
  const calage = calageDeSerie(morceaux, f.largeur, a.r.hauteur, f.azimut, assemblage);
  const resultat: Resultat = {
    texture: d.jpeg(a.r.texture), hauteurTexture: a.r.hauteurTexture, hauteurMesuree: a.r.hauteurMesuree, couverture: a.r.couverture,
    toitPropose: a.r.toitPropose, avis: a.avis, partieBasse: a.r.partieBasse, calage,
  };
  const ouvertures = a.r.ouvertures.map(versOuvertureFacade);
  const coinsTrouves = morceaux.some((m) => !!m.sources?.includes('trouve'));
  return {
    releve: releveDuMur(f, resultat, ouvertures, Math.round(a.r.hauteur * 100) / 100, au0(morceaux).prise.mesure),
    coinsTrouves,
    devinees: a.r.devinees.map(versOuvertureFacade),
    silhouette: silhouetteDeEstimation(a.r.toitEstime),
    confiance: calage.confiance ?? null,
    hauteurM: coinsTrouves && a.r.hauteurMesuree ? Math.round(a.r.hauteur * 100) / 100 : null,
  };
}
const au0 = (m: readonly Morceau[]): Morceau => m[0] as Morceau;

/**
 * Les mesures d'une facade, depuis ses photos. Ne rejette jamais : une photo illisible ne donne rien.
 * Toutes les photos sont redressees ; deux ou plus, sans echec, sont fusionnees. Aucune n'est supprimee.
 */
export async function mesurerFacade(cle: string, f: Facade, bat: Pick<ObjetPolygone, 'pts'>, photos: readonly PhotoCas[], d: DependancesMesures, corrections: Readonly<Record<string, CorrectionRedressement>> = {}): Promise<MesureFacade> {
  const charger = d.pixels ?? pixelsDePhoto;
  const cache = new Map<number, Promise<Pixels | null>>();
  const images = (i: number) => {
    let p = cache.get(i);
    if (!p) { p = charger(photos[i]?.base64 ?? '').catch(() => null); cache.set(i, p); }
    return p;
  };
  const vide: MesureFacade = { cle, cote: f.cote, releve: null, rangReleve: null, coinsTrouves: false, confiance: null, hauteurM: null, couleur: null };
  const couleur = await couleurDesPhotos(photos, images, f, d).catch(() => null);
  if (!photos.length) return { ...vide, couleur };
  // L'echelle corrigee a la main (la largeur reelle du mur) vaut pour toutes les photos du mur : la premiere donnee l'emporte.
  const largeurM = Object.keys(corrections).map(Number).sort((a, b) => a - b).map((k) => corrections[String(k)]?.echelleLargeurM).find((v) => typeof v === 'number' && v > 0);
  const fm: Facade = largeurM ? { ...f, largeur: largeurM } : f;

  // 1. Le redressement de chaque photo, la premiere avec une prise de vue d'abord, puis la fusion : la chaine de tous
  // (zones/releve/chaine.ts), celle du releve et de la calibration.
  const ordre = photos.map((_, i) => i).sort((a, b) => Number(!photos[a]?.prise) - Number(!photos[b]?.prise) || a - b);
  const entrees: PhotoARedresser[] = [];
  const illisibles: BilanPhotoRedressement[] = [];
  for (const i of ordre) {
    const photo = photos[i] as PhotoCas;
    const img = await images(i);
    if (!img) { illisibles.push({ rang: i, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'image illisible' }); continue; }
    const image = versImage(img);
    entrees.push({ rang: i, image, prise: (champLu) => priseDeLaPhoto(photo, image, fm, champLu), champConnu: photo.prise?.sourceFocale === 'exif' });
  }
  const c = await redresserEtFusionner(entrees, fm, bat, { chercherCoins: d.chercherCoins }, corrections, illisibles);
  if (!c.fusion) {
    const seule = c.seule, essai = seule?.photo.essai;
    if (!seule || !essai) return { ...vide, couleur, redressement: c.redressement };
    return { ...vide, ...releveDeLAnalyse(seule.a, [essai.p.morceau], fm, d, 'morceaux'), rangReleve: seule.photo.bilan.rang, couleur, redressement: c.redressement };
  }
  return { ...vide, ...releveDeLAnalyse(c.fusion.a, c.fusion.morceaux, fm, d, 'vues'), rangReleve: c.fusion.rangReference, couleur, redressement: c.redressement };
}
