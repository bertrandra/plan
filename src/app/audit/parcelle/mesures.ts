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
// Toutes les photos d'une facade sont redressees (verticales sous SEUIL_VERTICALES_DEG, sinon repli sur les coins
// calcules, sinon echec dit avec son motif) ; a partir de deux photos redressees, elles sont fusionnees (facade/fusion.ts :
// ORB + RANSAC, criteres nommes dans facade/recalageOrb.ts). Aucune photo n'est jamais supprimee : une photo qui ne se
// fusionne pas reste seule, redressee. Les originaux sont immuables ; les corrections manuelles (coins, echelle) priment
// sur le calcul et ne sont jamais ecrasees par un rejeu.

import { CHAMP_GRAND_COTE_DEFAUT } from '../../../facade/cadrage.js';
import { versOuvertureFacade } from '../../../facade/verification.js';
import { detecterSegments } from '../../../facade/segments.js';
import { focaleDeLaPhotoParFuites } from '../../../facade/redressementFuites.js';
import { coinsSurLaVerticale, fuiteVerticaleDesSegments } from '../../../facade/verticales.js';
import { lireFacadeSurPhoto, pixelsDePhoto } from '../../../render/couleurPhotoAudit.js';
import { analyserSerie, calageDeSerie, releveDuMur } from '../../../zones/releve/analyse.js';
import { appliquerResultat, coinsDePrise, entreeRecherche, type EntreeRecherche, type Morceau, type Resultat, type ResultatRecherche } from '../../../zones/releve/serie.js';
import { quadrilatereSain, reporterCoins } from '../../../zones/releve/coinsAuto.js';
import type { SourceCoin } from '../../../facade/calageFin.js';
import type { Pixels } from '../../../render/couleurMurPhoto.js';
import type { Obstacle } from '../../../geometry/ligneDeVue.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { Image, P2 } from '../../../facade/homographie.js';
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


/** Au-dela, les verticales du mur redresse ne sont plus verticales : on essaie les coins calcules, puis on le dit. */
export const SEUIL_VERTICALES_DEG = 0.5;
/** Les segments pris pour des verticales : a moins de cet angle de la verticale. */
const ANGLE_VERTICALE_MAX_DEG = 12;
/** Il faut au moins ce nombre de verticales lues pour oser une mesure. */
const VERTICALES_MIN = 2;

/**
 * L'ecart des verticales a la verticale sur le mur redresse, en degres (valeur absolue de la mediane ponderee par la
 * longueur) ; null quand le mur n'offre pas assez de lignes verticales pour le dire (mur lisse : on ne conclut pas).
 */
export function verticaliteDeg(elevation: Image): number | null {
  const lignes: { ecart: number; poids: number }[] = [];
  for (const s of detecterSegments(elevation)) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    // L'angle a la verticale, signe, ramene dans ]-90 ; 90].
    let a = (Math.atan2(dx, Math.abs(dy)) * 180) / Math.PI;
    if (dy < 0) a = -a;
    if (Math.abs(a) <= ANGLE_VERTICALE_MAX_DEG) lignes.push({ ecart: a, poids: s.longueur });
  }
  if (lignes.length < VERTICALES_MIN) return null;
  lignes.sort((p, q) => p.ecart - q.ecart);
  const total = lignes.reduce((t, l) => t + l.poids, 0);
  let cumul = 0;
  for (const l of lignes) { cumul += l.poids; if (cumul >= total / 2) return Math.round(Math.abs(l.ecart) * 100) / 100; }
  return null;
}

/** Une photo prete pour l'analyse : ses coins, d'ou ils viennent, et son morceau. */
interface PhotoPreparee {
  rang: number;
  morceau: Morceau;
  coins: BilanPhotoRedressement['coins'];
}

/** Les coins d'une photo reportes depuis une autre photo du mur par l'assemblage, et s'ils comptent pour trouves. */
interface CoinsSerie { coins: readonly P2[]; lu: boolean }

/** Le morceau d'une photo : coins de la correction manuelle s'il y en a, sinon ceux reportes d'une autre photo, sinon predits puis cherches sur les aretes. */
async function preparerPhoto(rang: number, photo: PhotoCas, img: Pixels, f: Facade, d: DependancesMesures, correction: CorrectionRedressement | undefined, predits: boolean, serie: CoinsSerie | null = null): Promise<PhotoPreparee> {
  const image = versImage(img);
  const prise = priseDeLaPhoto(photo, image, f, photo.prise?.sourceFocale === 'exif' ? null : champDesFuites(image));
  // Les coins predits tels quels : ramenes au bord du cadre (ce que fait l'ecran pour le doigt), ils ne seraient plus le mur, et
  // le redressement deformerait la photo au lieu de la redresser (un mur de 7 m photographie a 4 m deborde de l'image).
  const depart: Morceau = { prise, coins: coinsDePrise(prise, f.largeur, f.hauteur, false, f.azimut, false), recherche: true };
  if (correction?.coins && correction.coins.length === 4) {
    return { rang, coins: 'main', morceau: { ...depart, coins: correction.coins.map((c) => ({ x: c.x, y: c.y })), sources: ['doigt', 'doigt', 'doigt', 'doigt'], recherche: false } };
  }
  // Les coins reportes d'une autre photo du mur, ou ils ont ete poses au doigt, par l'assemblage des vues redressees
  // (zones/releve/coinsAuto.ts::reporterCoins) : comptes trouves.
  if (serie) return { rang, coins: serie.lu ? 'trouve' : 'predit', morceau: { ...depart, coins: serie.coins.map((c) => ({ x: c.x, y: c.y })), ...(serie.lu ? { sources: ['trouve', 'trouve', 'trouve', 'trouve'] as SourceCoin[] } : {}), recherche: false } };
  if (predits) return { rang, coins: 'predit', morceau: { ...depart, recherche: false } };
  const entree = entreeRecherche(prise, f.largeur, f.hauteur, false, f.azimut);
  const r = entree ? await d.chercherCoins(entree).catch(() => null) : null;
  // La photo corrigee de la distorsion n'a pas besoin d'URL ici : on ne l'affiche pas.
  const m = r ? appliquerResultat(depart, r, r.distorsion ? 'corrigee' : null) : { ...depart, recherche: false };
  return { rang, morceau: m, coins: m.sources?.includes('trouve') ? 'trouve' : 'predit' };
}

/** Le champ du grand cote de la photo (degres) que donnent ses points de fuite, quand ils le disent ; null sinon. */
function champDesFuites(image: Image): number | null {
  const f = focaleDeLaPhotoParFuites(detecterSegments(image), image.largeur, image.hauteur);
  return f === null ? null : (2 * Math.atan(Math.max(image.largeur, image.hauteur) / 2 / f) * 180) / Math.PI;
}

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

/** L'essai d'une photo dont les coins sont ramenes sur ses verticales (facade/verticales.ts) ; null si elle n'en offre pas assez. */
function surLesVerticales(p: PhotoPreparee, f: Facade, bat: Pick<ObjetPolygone, 'pts'>) {
  const img = p.morceau.prise.photo.image;
  const fuite = fuiteVerticaleDesSegments(detecterSegments(img), img.largeur, img.hauteur);
  const coins = fuite ? coinsSurLaVerticale(p.morceau.coins, fuite.point) : null;
  if (!coins) return null;
  const q: PhotoPreparee = { ...p, morceau: { ...p.morceau, coins } };
  const a = analyserSerie([q.morceau], f, f.hauteur, bat as ObjetPolygone);
  return a ? { p: q, a, vert: verticaliteDeg(a.r.texture) } : null;
}

/** Le redressement d'une photo seule : son analyse, sa verticalite, le repli sur les coins calcules, son statut. */
async function redresserPhoto(rang: number, photo: PhotoCas, img: Pixels, f: Facade, bat: Pick<ObjetPolygone, 'pts'>, d: DependancesMesures, correction: CorrectionRedressement | undefined, serie: CoinsSerie | null = null) {
  const analyser = async (predits: boolean, s: CoinsSerie | null = null) => {
    const p = await preparerPhoto(rang, photo, img, f, d, correction, predits, s);
    const a = analyserSerie([p.morceau], f, f.hauteur, bat as ObjetPolygone);
    return a ? { p, a, vert: verticaliteDeg(a.r.texture) } : null;
  };
  // Les coins trouves sur les aretes de la photo (le mur entier y est, au centimetre) d'abord ; sinon ceux reportes de la photo
  // du mur posee au doigt ; sinon les coins predits.
  let essai = await analyser(false).catch(() => null);
  const aretes = essai?.p.coins === 'trouve' && quadrilatereSain(essai.p.morceau.coins, essai.p.morceau.prise.photo.image);
  if (serie && !correction?.coins && !aretes) {
    const parSerie = await analyser(false, serie).catch(() => null);
    if (parSerie) essai = parSerie;
  }
  if (!essai) return { bilan: { rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'la photo ne montre pas le mur : coins introuvables ou image illisible' } satisfies BilanPhotoRedressement, essai: null };
  const manuelle = essai.p.coins === 'main';
  // Des verticales qui penchent : les points calcules d'apres la prise de vue valent parfois mieux que ceux cherches sur les aretes.
  if (!manuelle && essai.vert !== null && essai.vert > SEUIL_VERTICALES_DEG) {
    const repli = await analyser(true).catch(() => null);
    if (repli && repli.vert !== null && repli.vert < essai.vert) essai = repli;
  }
  // Toujours penchees : les cotes du quadrilatere ramenes sur le point de fuite des verticales lues sur la photo.
  if (!manuelle && essai.vert !== null && essai.vert > SEUIL_VERTICALES_DEG) {
    const droit = surLesVerticales(essai.p, f, bat);
    if (droit && droit.vert !== null && droit.vert < essai.vert) essai = droit;
  }
  const ok = manuelle || essai.vert === null || essai.vert <= SEUIL_VERTICALES_DEG;
  const bilan: BilanPhotoRedressement = {
    rang, statut: manuelle ? 'manuelle' : ok ? 'auto' : 'echec', verticaliteDeg: essai.vert, coins: essai.p.coins,
    coinsPx: essai.p.morceau.coins.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })),
    ...(ok ? {} : { motif: 'verticales à ' + String(essai.vert).replace('.', ',') + '° (au-delà de ' + String(SEUIL_VERTICALES_DEG).replace('.', ',') + '°) : placez les quatre coins à la main' }),
  };
  return { bilan, essai };
}

type Redressee = Awaited<ReturnType<typeof redresserPhoto>>;

/**
 * Remplace, dans `faits` et `bilans`, les photos aux coins predits par celles aux coins reportes de la photo ou le mur a ete pose au
 * doigt. Pas d'une photo ou il est « trouve » sur les aretes : sur AE 101 (octobre 2026), un mur trouve sur une photo prise de loin
 * s'arretait a un poteau du pan de bois, et le report le recopiait sur l'autre photo (fusionnee, mais sans ses fenetres).
 */
async function reporterLeMur(photos: readonly PhotoCas[], images: (i: number) => Promise<Pixels | null>, f: Facade, bat: Pick<ObjetPolygone, 'pts'>, d: DependancesMesures, corrections: Readonly<Record<string, CorrectionRedressement>>, faits: Redressee[], bilans: BilanPhotoRedressement[]): Promise<void> {
  const source = faits.find((x) => x.essai && x.bilan.coins === 'main');
  const aReporter = faits.filter((x) => x.bilan.coins === 'predit' && !corrections[String(x.bilan.rang)]?.coins);
  if (!source?.essai || !aReporter.length) return;
  try {
    const pixels = await Promise.all(photos.map((_, i) => images(i)));
    const lisibles = pixels.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const k0 = lisibles.indexOf(source.bilan.rang);
    if (k0 < 0) return;
    const portes = reporterCoins(lisibles.map((i) => versImage(pixels[i] as Pixels)), k0, source.essai.p.morceau.coins);
    for (const x of aReporter) {
      const k = lisibles.indexOf(x.bilan.rang), coins = portes[k];
      const img = pixels[x.bilan.rang];
      if (!coins || !img) continue;
      const r = await redresserPhoto(x.bilan.rang, photos[x.bilan.rang] as PhotoCas, img, f, bat, d, undefined, { coins, lu: true }).catch(() => null);
      if (!r?.essai || r.bilan.statut === 'echec') continue;
      faits[faits.indexOf(x)] = r;
      bilans[bilans.findIndex((b) => b.rang === x.bilan.rang)] = r.bilan;
    }
  } catch { /* l'assemblage n'a pas pu se faire : chaque photo garde ses coins */ }
}

/** Les motifs, en clair, de ce qui n'a pas ete fusionne. */
const motifFusion = (motifs: readonly string[]): string | undefined => {
  const uniques = [...new Set(motifs.filter((m) => !!m))];
  return uniques.length ? uniques.join(' ; ') : undefined;
};

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

  // 1. Le redressement de chaque photo, l'une apres l'autre (la premiere avec une prise de vue d'abord).
  const ordre = photos.map((_, i) => i).sort((a, b) => Number(!photos[a]?.prise) - Number(!photos[b]?.prise) || a - b);
  const faits: Awaited<ReturnType<typeof redresserPhoto>>[] = [];
  const bilans: BilanPhotoRedressement[] = [];
  for (const i of ordre) {
    const photo = photos[i] as PhotoCas;
    const img = await images(i);
    if (!img) { bilans.push({ rang: i, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'image illisible' }); continue; }
    const r = await redresserPhoto(i, photo, img, fm, bat, d, corrections[String(i)]).catch(() => null);
    if (!r) { bilans.push({ rang: i, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'redressement impossible' }); continue; }
    faits.push(r);
    bilans.push(r.bilan);
  }
  // 1 bis. Le mur pose au doigt sur une photo, reporte sur celles qui n'en ont que des coins predits, par l'assemblage de leurs
  // vues redressees : toutes montrent alors le meme mur, et se croisent a la fusion. Quatre coins poses une fois pour toutes.
  await reporterLeMur(photos, images, fm, bat, d, corrections, faits, bilans);
  bilans.sort((a, b) => a.rang - b.rang);
  const bilan = (fusion: BilanRedressement['fusion'], fusionnees: number[], motif?: string): BilanRedressement => ({ photos: bilans, fusion, fusionnees, ...(motif ? { motifFusion: motif } : {}) });

  // 2. La photo qui sert au releve seule : la premiere redressee sans echec, sinon la premiere analysee (jamais rien de perdu).
  const seule = faits.find((x) => x.bilan.statut !== 'echec' && x.essai) ?? faits.find((x) => x.essai);
  if (!seule || !seule.essai) return { ...vide, couleur, redressement: bilan('sans', [], faits.length ? undefined : 'aucune photo n’a pu être redressée') };
  const utilisables = faits.filter((x) => x.bilan.statut !== 'echec' && x.essai);
  const essaiSeul = seule.essai;
  const unique = () => ({ ...vide, ...releveDeLAnalyse(essaiSeul.a, [essaiSeul.p.morceau], fm, d, 'morceaux'), rangReleve: seule.bilan.rang, couleur });
  if (utilisables.length < 2) {
    const motif = photos.length > 1 ? 'moins de deux photos redressées : pas de fusion' : undefined;
    return { ...unique(), redressement: bilan('sans', [], motif) };
  }

  // 3. La fusion (ORB + RANSAC) des photos redressees ; sinon chacune reste seule.
  const morceaux = utilisables.map((x) => (x.essai as NonNullable<typeof x.essai>).p.morceau);
  const fusion = analyserSerie(morceaux, fm, fm.hauteur, bat as ObjetPolygone, 'vues');
  const res = fusion?.fusion;
  if (!fusion || !res || (res.statut !== 'fusionnee' && res.statut !== 'partielle')) {
    const motifs = res ? res.vues.map((v) => v.motif ?? '') : ['la fusion n’a pas pu s’appliquer'];
    return { ...unique(), redressement: bilan('independantes', [], motifFusion(motifs) ?? 'les photos ne se recoupent pas assez') };
  }
  const rangDe = (k: number) => (utilisables[k] as typeof utilisables[number]).bilan.rang;
  const fusionnees = res.groupe.map(rangDe).sort((a, b) => a - b);
  const autres = res.independantes.map((k) => (res.vues[k]?.motif ?? ''));
  return {
    ...vide, ...releveDeLAnalyse(fusion, morceaux, fm, d, 'vues'), rangReleve: rangDe(res.reference), couleur,
    redressement: bilan(res.statut === 'fusionnee' ? 'fusionnee' : 'partielle', fusionnees, res.statut === 'partielle' ? motifFusion(autres) : undefined),
  };
}
