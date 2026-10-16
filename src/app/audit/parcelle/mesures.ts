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
// Une photo par facade sert au releve : la premiere qui a sa prise de vue. L'assemblage de plusieurs
// photos d'un meme mur (mosaique, fusion des vues) viendra avec les lots L13 a L15.

import { CHAMP_GRAND_COTE_DEFAUT } from '../../../facade/cadrage.js';
import { versOuvertureFacade } from '../../../facade/verification.js';
import { lireFacadeSurPhoto, pixelsDePhoto } from '../../../render/couleurPhotoAudit.js';
import { analyserSerie, calageDeSerie, releveDuMur } from '../../../zones/releve/analyse.js';
import { appliquerResultat, coinsDePrise, entreeRecherche, type EntreeRecherche, type Morceau, type Resultat, type ResultatRecherche } from '../../../zones/releve/serie.js';
import type { Pixels } from '../../../render/couleurMurPhoto.js';
import type { Obstacle } from '../../../geometry/ligneDeVue.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { Image } from '../../../facade/homographie.js';
import type { Prise } from '../../../zones/releve/capteurs.js';
import type { PhotoCas } from '../../../model/audit.js';
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
 * precision du GPS), la boussole le cap, le telephone son attitude, l'EXIF le champ de l'objectif.
 * Le cap du sens de la marche ne dit pas ou visait le telephone : il n'est pas repris.
 */
export function priseDeLaPhoto(photo: PhotoCas, image: Image, facade: Facade): Prise {
  const p = photo.prise;
  const distance = p ? distanceAuMur(facade, p) : 0;
  const champ = p?.champDeg ?? null;
  return {
    photo: { image, url: '', champ, focalePx: null },
    mesure: distance > 0.5 ? { distance: Math.round(distance * 100) / 100, source: 'gps' } : null,
    reperes: null,
    champ: champ ?? CHAMP_GRAND_COTE_DEFAUT,
    photosPrevues: null,
    cap: p?.sourceAzimut === 'boussole' ? p.azimutDeg : null,
    attitude: typeof p?.inclinaisonDeg === 'number' ? { inclinaisonDeg: p.inclinaisonDeg, roulisDeg: p.roulisDeg ?? null } : null,
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

/** Le releve d'une photo : coins predits puis cherches, analyse, et ce qui s'ecrirait pour le mur. */
async function releveDeLaPhoto(photo: PhotoCas, img: Pixels, f: Facade, bat: Pick<ObjetPolygone, 'pts'>, d: DependancesMesures) {
  const prise = priseDeLaPhoto(photo, versImage(img), f);
  const entree = entreeRecherche(prise, f.largeur, f.hauteur, false, f.azimut);
  const depart: Morceau = { prise, coins: coinsDePrise(prise, f.largeur, f.hauteur, false, f.azimut), recherche: true };
  const r = entree ? await d.chercherCoins(entree).catch(() => null) : null;
  // La photo corrigee de la distorsion n'a pas besoin d'URL ici : on ne l'affiche pas.
  const m = r ? appliquerResultat(depart, r, r.distorsion ? 'corrigee' : null) : { ...depart, recherche: false };
  const a = analyserSerie([m], f, f.hauteur, bat as ObjetPolygone);
  if (!a) return null;
  const calage = calageDeSerie([m], f.largeur, a.r.hauteur, f.azimut);
  const resultat: Resultat = {
    texture: d.jpeg(a.r.texture), hauteurTexture: a.r.hauteurTexture, hauteurMesuree: a.r.hauteurMesuree, couverture: a.r.couverture,
    toitPropose: a.r.toitPropose, avis: a.avis, partieBasse: a.r.partieBasse, calage,
  };
  const ouvertures = a.r.ouvertures.map(versOuvertureFacade);
  const coinsTrouves = !!m.sources?.includes('trouve');
  return {
    releve: releveDuMur(f, resultat, ouvertures, Math.round(a.r.hauteur * 100) / 100, m.prise.mesure),
    coinsTrouves,
    devinees: a.r.devinees.map(versOuvertureFacade),
    silhouette: silhouetteDeEstimation(a.r.toitEstime),
    confiance: calage.confiance ?? null,
    hauteurM: coinsTrouves && a.r.hauteurMesuree ? Math.round(a.r.hauteur * 100) / 100 : null,
  };
}

/** Les mesures d'une facade, depuis ses photos. Ne rejette jamais : une photo illisible ne donne rien. */
export async function mesurerFacade(cle: string, f: Facade, bat: Pick<ObjetPolygone, 'pts'>, photos: readonly PhotoCas[], d: DependancesMesures): Promise<MesureFacade> {
  const charger = d.pixels ?? pixelsDePhoto;
  const cache = new Map<number, Promise<Pixels | null>>();
  const images = (i: number) => {
    let p = cache.get(i);
    if (!p) { p = charger(photos[i]?.base64 ?? '').catch(() => null); cache.set(i, p); }
    return p;
  };
  const vide: MesureFacade = { cle, cote: f.cote, releve: null, rangReleve: null, coinsTrouves: false, confiance: null, hauteurM: null, couleur: null };
  const couleur = await couleurDesPhotos(photos, images, f, d).catch(() => null);
  // La photo du releve : la premiere qui a sa prise de vue, sinon la premiere.
  const rang = Math.max(0, photos.findIndex((p) => !!p.prise));
  const photo = photos[rang];
  const img = photo ? await images(rang) : null;
  if (!photo || !img) return { ...vide, couleur };
  const r = await releveDeLaPhoto(photo, img, f, bat, d).catch(() => null);
  return r ? { ...vide, ...r, rangReleve: rang, couleur } : { ...vide, couleur };
}
