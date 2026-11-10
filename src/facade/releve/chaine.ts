// La chaine des photos d'un mur, une seule pour tous (MD/spec-facades-calage-detection.md) : l'audit de la parcelle et la calibration
// redressent, fusionnent et cotent par elle, par le meme orchestrateur (facade/releve/enchainement.ts::derouler), avec les memes
// options : la calibration rejoue ce que fait l'audit (CLAUDE.md, « Calibration et audit : un seul processus »). Depuis le lot F6, les
// photos d'une facade ne se prennent plus que dans l'audit. Sans React : testable seule. Depuis le lot D (7 novembre 2026), elle se
// fait en quatre temps, un par etape de l'orchestrateur (champsDesPhotos E3, coinsDesPhotos E4, vuesDesPhotos E5, assemblerLesPhotos
// E6, analyserLeMurPose E7).
//
// Chaque photo est redressee : coins poses au doigt, sinon trouves sur les aretes (calage fin, distorsion du grand-angle), sinon
// reportes d'une autre photo du mur ou lus sur l'assemblage des vues, sinon predits par la prise de vue. Des verticales qui
// penchent font essayer les coins predits, puis les cotes ramenes sur le point de fuite des verticales. A partir de deux photos
// redressees, elles sont fusionnees. Rien ne se perd : une photo qui doute reste, avec son motif, et sert faute de mieux.

import { CHAMP_GRAND_COTE_DEFAUT } from '../vision/cadrage.js';
import { detecterSegments } from '../vision/segments.js';
import { focaleDeLaPhotoParFuites } from '../vision/redressementFuites.js';
import { coinsSurLaVerticale, fuiteVerticaleDesSegments } from '../vision/verticales.js';
import type { ResultatFusion } from '../fusion.js';
import type { SourceCoin } from '../calage/calageFin.js';
import type { Facade } from '../../geometry/cotesVusDeDehors.js';
import { redresser, resolutionTexture, type Image, type P2 } from '../vision/homographie.js';
import type { BilanPhotoRedressement, BilanRedressement, CorrectionRedressement, PoseDuMurCherche } from '../../model/auditParcelle.js';
import type { ObjetPolygone } from '../../model/types.js';
import { analyserSerie } from './analyseSerie.js';
import { objectifsEnchainement } from '../regles/facades/enchainement.js';
import { appliquerResultat, coinsDePrise, entreeRecherche, type EntreeRecherche, type Morceau, type ResultatRecherche } from './serie.js';
import { coinsAutoDeSerie, quadrilatereSain, reporterCoins } from './coinsAuto.js';
import { gabaritSurLaPhoto, type GabaritMur } from '../gabaritMur.js';
import { assemblerLesVues, vuesDeLAssemblageDites, type VuesAssemblees } from '../analyseMur.js';
import type { RedressementFuites } from '../vision/redressementFuites.js';
import type { Prise } from './prise.js';

/**
 * La version de la chaine : elle monte quand un changement de la chaine change les coins, les redressements ou la fusion qu'elle
 * rend. Un audit la garde avec ses mesures (app/audit/parcelle/mesures.ts) : rejoue plus tard, on sait de quelle chaine venaient
 * les images d'origine, et ce qui a change. 11 (2 novembre 2026) : la calibration rejoue la chaine de l'audit (un seul processus) ;
 * un cas, un mur vrai ou une reponse de Claude enregistres sous la 10 ont ete poses sur l'image de l'ancien chemin de la calibration.
 * 12 (2 novembre 2026) : le cadre que lit la detection est la boite de la silhouette entiere et sa marge (analyse.ts::cadreDeLaSilhouette).
 * 13 (2 novembre 2026) : le calage fin ne prend plus pour l'egout une horizontale que les deux cotes du mur depassent (les linteaux d'un
 * etage sous un pignon) ni la droite qui joint des hauts de cotes a des hauteurs differentes (une rampe) : les coins d'un pignon changent.
 * 14 (7 novembre 2026, lot D) : la chaine se fait etape par etape (E3 a E7, ci-dessous) et un mur tire a la main se pose a l'E7 sans
 * refaire les vues ni l'assemblage : memes coins, memes images, mais ce qu'un rejeu garde (le groupe Image) a change de forme.
 * 15 (10 novembre 2026) : les boites des ouvertures viennent d'un vote entre trois detecteurs (detection/baies/) et non plus de la seule
 * lecture des taches : memes coins et memes images, mais les ouvertures proposees changent.
 */
export const VERSION_CHAINE_FACADES = 15;

/** Au-dela, les verticales du mur redresse ne sont plus verticales : on essaie les coins calcules, puis on le dit (un reglage, lu a chaque appel). */
const seuilVerticalesDeg = (): number => objectifsEnchainement()['facades.enchainement.verticalesMaxDeg'];
/** Les segments pris pour des verticales : a moins de cet angle de la verticale. */
const ANGLE_VERTICALE_MAX_DEG = 12;
/** Il faut au moins ce nombre de verticales lues pour oser une mesure. */
const VERTICALES_MIN = 2;

/**
 * L'ecart des verticales a la verticale sur le mur redresse, en degres (valeur absolue de la mediane ponderee par la
 * longueur) ; null quand le mur n'offre pas assez de lignes verticales pour le dire (mur lisse : on ne conclut pas).
 */
function verticaliteDeg(elevation: Image): number | null {
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

/** Le champ du grand cote de la photo (degres) que donnent ses points de fuite, quand ils le disent ; null sinon. */
function champDesFuites(image: Image): number | null {
  const f = focaleDeLaPhotoParFuites(detecterSegments(image), image.largeur, image.hauteur);
  return f === null ? null : (2 * Math.atan(Math.max(image.largeur, image.hauteur) / 2 / f) * 180) / Math.PI;
}

/** E3 : le champ lu sur les points de fuite d'une photo sans EXIF (null : l'EXIF le donne, ou ses points de fuite ne le disent pas). */
function champDeLaPhoto(e: Pick<PhotoARedresser, 'image' | 'champConnu'>): number | null {
  return e.champConnu ? null : champDesFuites(e.image);
}

/** L'objectif d'une photo tel que la chaine le prend : le champ de l'EXIF, sinon celui lu sur ses points de fuite, sinon le defaut. */
export function objectifDe(e: PhotoARedresser, champLu: number | null): NonNullable<BilanPhotoRedressement['objectif']> {
  const champ = e.prise(champLu).champ;
  // Sans EXIF, la prise prend le champ lu sur la photo, sinon celui note pour l'appareil, sinon celui d'un telephone (prisesFacade.ts).
  const source = e.champConnu ? 'exif' : champLu !== null && Math.abs(champ - champLu) < 1e-9 ? 'fuites' : Math.abs(champ - CHAMP_GRAND_COTE_DEFAUT) < 1e-9 ? 'defaut' : 'appareil';
  return { source, champDeg: Math.round(champ * 10) / 10 };
}

/** Une photo a redresser : son rang, son image, et sa prise de vue (le champ lu sur la photo la complete quand l'EXIF manque). */
export interface PhotoARedresser {
  rang: number;
  image: Image;
  /** La prise de vue, avec le champ lu sur les points de fuite de la photo (null quand ils ne le disent pas). */
  prise: (champLu: number | null) => Prise;
  /** Le champ de l'objectif est-il connu (EXIF) ? Sinon, il se lit sur la photo. */
  champConnu: boolean;
}

/** Ce que la chaine demande au navigateur : le calage fin (un worker a l'ecran, en direct ailleurs). */
export interface OutilsChaine {
  chercherCoins: (e: EntreeRecherche) => Promise<ResultatRecherche>;
  /**
   * Le gabarit du mur (facade/gabaritMur.ts) : la silhouette que donnent le plan et le LiDAR, une forme fixe posee sur l'image. Il ne
   * cale pas le mur (il vient du toit, que la photo met en question) : il devient la silhouette de chaque photo, posee par ses coins
   * une fois le mur cale. Absent : la silhouette se lit sur la photo (le releve).
   */
  gabarit?: GabaritMur | null;
}

/** Une photo prete pour l'analyse : ses coins, d'ou ils viennent, et son morceau. */
interface PhotoPreparee {
  rang: number;
  morceau: Morceau;
  coins: BilanPhotoRedressement['coins'];
}

/** Les coins d'une photo reportes depuis une autre photo du mur par l'assemblage, et s'ils comptent pour trouves. */
interface CoinsSerie {
  coins: readonly P2[];
  lu: boolean;
  /** Le mur lu sur l'assemblage d'une photo redressee par ses reperes : il l'emporte sur les coins trouves sur ses aretes. */
  prime?: boolean;
  /** La pose que l'arbitre a retenue sur l'assemblage des reperes (calageAncres.ts) ; absente pour un mur reporte d'une autre photo. */
  pose?: PoseDuMurCherche;
}

type Analyse = NonNullable<ReturnType<typeof analyserSerie>>;

/**
 * Le redressement d'une photo : son bilan, et l'essai retenu (coins, verticalite) ; null quand rien ne se redresse. Les essais
 * se jugent sur une elevation reduite (verticaliteDesCoins) : l'analyse, seule couteuse, ne se fait que sur la photo retenue.
 */
export interface PhotoRedressee {
  bilan: BilanPhotoRedressement;
  essai: { p: PhotoPreparee; vert: number | null } | null;
}

/** Le morceau d'une photo : coins de la correction manuelle s'il y en a, sinon ceux reportes d'une autre photo, sinon predits puis cherches sur les aretes. */
async function preparerPhoto(e: PhotoARedresser, f: Facade, o: OutilsChaine, correction: CorrectionRedressement | undefined, predits: boolean, serie: CoinsSerie | null, champLu: number | null): Promise<PhotoPreparee> {
  const { rang } = e;
  const prise = e.prise(champLu);
  // Les coins predits tels quels : ramenes au bord du cadre (ce que fait l'ecran pour le doigt), ils ne seraient plus le mur, et
  // le redressement deformerait la photo au lieu de la redresser (un mur de 7 m photographie a 4 m deborde de l'image).
  const depart: Morceau = { prise, coins: coinsDePrise(prise, f.largeur, f.hauteur, f.azimut), recherche: true };
  if (correction?.coins && correction.coins.length === 4) {
    return { rang, coins: 'main', morceau: { ...depart, coins: correction.coins.map((c) => ({ x: c.x, y: c.y })), sources: ['doigt', 'doigt', 'doigt', 'doigt'], recherche: false } };
  }
  // Les coins reportes d'une autre photo du mur, ou lus sur l'assemblage des vues redressees (facade/releve/coinsAuto.ts) :
  // comptes trouves quand le mur y a ete lu.
  if (serie) return { rang, coins: serie.lu ? 'trouve' : 'predit', morceau: { ...depart, coins: serie.coins.map((c) => ({ x: c.x, y: c.y })), ...(serie.lu ? { sources: ['trouve', 'trouve', 'trouve', 'trouve'] as SourceCoin[] } : {}), recherche: false } };
  if (predits) return { rang, coins: 'predit', morceau: { ...depart, recherche: false } };
  const entree = entreeRecherche(prise, f.largeur, f.hauteur, f.azimut);
  const r = await o.chercherCoins(entree).catch(() => null);
  // La photo corrigee de la distorsion n'a pas besoin d'URL ici : on ne l'affiche pas.
  const m = r ? appliquerResultat(depart, r, r.distorsion ? 'corrigee' : null) : { ...depart, recherche: false };
  return { rang, morceau: m, coins: m.sources?.includes('trouve') ? 'trouve' : 'predit' };
}

/** Les coins d'un morceau ramenes sur ses verticales (facade/vision/verticales.ts) ; null s'il n'en offre pas assez. */
function coinsSurLesVerticales(m: Morceau): P2[] | null {
  const img = m.prise.photo.image;
  const fuite = fuiteVerticaleDesSegments(detecterSegments(img), img.largeur, img.hauteur);
  return fuite ? coinsSurLaVerticale(m.coins, fuite.point) : null;
}

/** Le redressement d'une photo seule : son analyse, sa verticalite, le repli sur les coins calcules, son statut. */
export async function redresserPhoto(e: PhotoARedresser, f: Facade, o: OutilsChaine, correction: CorrectionRedressement | undefined, serie: CoinsSerie | null = null, champ?: number | null): Promise<PhotoRedressee> {
  const { rang } = e;
  // Le champ lu sur les points de fuite quand l'EXIF manque : lu une fois pour tous les essais (le meme a chaque lecture), et dit au
  // bilan avec sa source, pour que l'E3 (l'objectif) dise la focale que la chaine a prise. Lu a l'E3 (champDeLaPhoto), il est donne.
  const champLu = champ !== undefined ? champ : champDeLaPhoto(e);
  const objectif = objectifDe(e, champLu);
  const juger = (p: PhotoPreparee) => quadrilatereSain(p.morceau.coins, { largeur: 0, hauteur: 0 }) ? { p, vert: verticaliteDesCoins(p.morceau.prise.photo.image, p.morceau.coins, f.largeur, f.hauteur) } : null;
  const analyser = async (predits: boolean, s: CoinsSerie | null = null) => juger(await preparerPhoto(e, f, o, correction, predits, s, champLu));
  // Les coins trouves sur les aretes de la photo (le mur entier y est, au centimetre) d'abord ; sinon ceux reportes de la photo
  // du mur posee au doigt ; sinon les coins predits.
  // Une photo redressee par les reperes de la personne : le mur lu sur l'assemblage, d'abord.
  const parReperes = serie?.prime ? await analyser(false, serie).catch(() => null) : null;
  let essai = parReperes ?? await analyser(false).catch(() => null);
  const aretes = essai?.p.coins === 'trouve' && quadrilatereSain(essai.p.morceau.coins, essai.p.morceau.prise.photo.image);
  if (serie && !parReperes && !correction?.coins && !aretes) {
    const parSerie = await analyser(false, serie).catch(() => null);
    if (parSerie) essai = parSerie;
  }
  // Des coins trouves qui ne forment pas un mur : les coins predits, plutot que rien.
  if (!essai && !correction?.coins) essai = await analyser(true).catch(() => null);
  if (!essai) return { bilan: { rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'la photo ne montre pas le mur : coins introuvables ou image illisible', objectif }, essai: null };
  // Des coins poses au doigt, ou la photo redressee par les reperes de la personne : son redressement ne se discute pas. Le mur que
  // l'assemblage des reperes y a trouve, lui, garde le verdict de l'arbitre (`murCherche`) : l'E7 le juge comme un mur trouve.
  const parSesReperes = !!parReperes && essai === parReperes;
  const manuelle = essai.p.coins === 'main' || parSesReperes;
  // Des verticales qui penchent : les points calcules d'apres la prise de vue valent parfois mieux que ceux cherches sur les aretes.
  if (!manuelle && essai.vert !== null && essai.vert > seuilVerticalesDeg()) {
    const repli = await analyser(true).catch(() => null);
    if (repli && repli.vert !== null && repli.vert < essai.vert) essai = repli;
  }
  // Toujours penchees : les cotes du quadrilatere ramenes sur le point de fuite des verticales lues sur la photo.
  if (!manuelle && essai.vert !== null && essai.vert > seuilVerticalesDeg()) {
    const coins = coinsSurLesVerticales(essai.p.morceau);
    const droit = coins ? juger({ ...essai.p, morceau: { ...essai.p.morceau, coins } }) : null;
    if (droit && droit.vert !== null && droit.vert < essai.vert) essai = droit;
  }
  const ok = manuelle || essai.vert === null || essai.vert <= seuilVerticalesDeg();
  const bilan: BilanPhotoRedressement = {
    rang, statut: manuelle ? 'manuelle' : ok ? 'auto' : 'echec', verticaliteDeg: essai.vert, coins: essai.p.coins,
    coinsPx: essai.p.morceau.coins.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })),
    ...(parSesReperes && serie?.pose ? { murCherche: { pose: serie.pose, lu: serie.lu } } : {}),
    ...(ok ? {} : { motif: 'verticales à ' + String(essai.vert).replace('.', ',') + '° (au-delà de ' + String(seuilVerticalesDeg()).replace('.', ',') + '°) : placez les quatre coins à la main' }),
    objectif,
  };
  return { bilan, essai };
}

/** Le grand cote du mur redresse pour juger ses verticales a l'ecran : de quoi lire les aretes, sans payer une analyse. */
const COTE_VERTICALES_PX = 512;

/** La verticalite du mur redresse entre ces coins, sur une elevation reduite (verticaliteDeg) ; null sans redressement ni lignes. */
export function verticaliteDesCoins(image: Image, coins: readonly P2[], largeurM: number, hauteurM: number): number | null {
  if (!quadrilatereSain(coins, { largeur: 0, hauteur: 0 })) return null;
  const r = redresser(image, coins, largeurM, hauteurM, resolutionTexture(largeurM, hauteurM, COTE_VERTICALES_PX));
  return r ? verticaliteDeg(r.image) : null;
}

/**
 * Remplace les photos aux coins predits par celles aux coins reportes de la photo ou le mur a ete pose au doigt. Pas d'une photo
 * ou il est « trouve » sur les aretes : sur AE 101 (octobre 2026), un mur trouve sur une photo prise de loin s'arretait a un poteau
 * du pan de bois, et le report le recopiait sur l'autre photo (fusionnee, mais sans ses fenetres).
 * Sans photo posee au doigt, le mur n'est pas lu sur l'assemblage des vues : un mur lu de loin sur l'assemblage s'arretait a un poteau
 * du pan de bois (AE 101), et ses coins comptes trouves poseraient le releve tout seul (point 62 de la fumee). Seuls des reperes poses
 * a la main font chercher le mur sur l'assemblage (ci-dessous).
 */
async function reporterLeMur(entrees: readonly PhotoARedresser[], f: Facade, o: OutilsChaine, corrections: Readonly<Record<string, CorrectionRedressement>>, faits: PhotoRedressee[], champs: readonly (number | null)[]): Promise<void> {
  const aReporter = () => faits.filter((x) => x.bilan.coins === 'predit' && !corrections[String(x.bilan.rang)]?.coins);
  const avecReperes = Object.values(corrections).some((c) => c.reperes?.length === 4);
  if (!aReporter().length && !avecReperes) return;
  const images = entrees.map((e) => e.image);
  const k = (rang: number) => entrees.findIndex((e) => e.rang === rang);
  const remplacer = async (x: PhotoRedressee, coins: P2[] | null | undefined, lu: boolean, prime = false, pose?: PoseDuMurCherche) => {
    const e = entrees[k(x.bilan.rang)];
    if (!coins || !e) return;
    const r = await redresserPhoto(e, f, o, undefined, { coins, lu, prime, ...(pose ? { pose } : {}) }, champs[k(x.bilan.rang)] ?? null).catch(() => null);
    if (r?.essai && r.bilan.statut !== 'echec') faits[faits.indexOf(x)] = r;
  };
  try {
    const reperes = entrees.map((e) => corrections[String(e.rang)]?.reperes ?? null);
    const aReperes = (x: PhotoRedressee) => reperes[k(x.bilan.rang)]?.length === 4 && !corrections[String(x.bilan.rang)]?.coins;
    // Un mur pose (ou ajuste) au doigt sur une photo : il l'emporte sur tout ce qui est lu, et se reporte sur les photos aux coins
    // predits comme sur celles qui n'ont que des reperes.
    const source = faits.find((x) => x.essai && x.bilan.coins === 'main');
    const k0 = source ? k(source.bilan.rang) : -1;
    if (source?.essai && k0 >= 0) {
      const portes = reporterCoins(images, k0, source.essai.p.morceau.coins);
      for (const x of [...faits]) {
        if (x === source) continue;
        if (aReperes(x)) await remplacer(x, portes[k(x.bilan.rang)], true, true);
        else if (aReporter().includes(x)) await remplacer(x, portes[k(x.bilan.rang)], true);
      }
      return;
    }
    // Des reperes poses a la main : chaque photo se redresse d'abord, entiere (par ses reperes, sinon ses points de fuite), les vues
    // s'assemblent, et l'egout, le sol et les bouts du mur se cherchent ensuite sur l'assemblage, aux proportions du plan (largeur de
    // la parcelle, hauteur du LiDAR ou du dessin). Le mur lu l'emporte sur les photos aux reperes, et remplace les coins predits.
    if (reperes.some((r) => r?.length === 4)) {
      const sr = coinsAutoDeSerie(images, f.largeur, f.hauteur, reperes);
      if (!sr) return;
      for (const x of [...faits]) {
        const i = k(x.bilan.rang);
        if (aReperes(x)) await remplacer(x, sr.coins[i], sr.lu, true, sr.assemblage.mur.calage.retenue);
        else if (aReporter().includes(x)) await remplacer(x, sr.coins[i], sr.lu);
      }
    }
  } catch { /* l'assemblage n'a pas pu se faire : chaque photo garde ses coins */ }
}

/** Les motifs, en clair, de ce qui n'a pas ete fusionne. */
const motifFusion = (motifs: readonly string[]): string | undefined => {
  const uniques = [...new Set(motifs.filter((m) => !!m))];
  return uniques.length ? uniques.join(' ; ') : undefined;
};

/** Ce que la chaine rend d'un mur : chaque photo redressee, celle qui sert seule, et la fusion quand elle a lieu. */
export interface ResultatChaine {
  redressement: BilanRedressement;
  /** Toutes les photos redressees, dans l'ordre de leur traitement. */
  faits: PhotoRedressee[];
  /** La photo qui sert au releve seule, et son analyse : la premiere redressee sans echec qui s'analyse, sinon la premiere analysee ; null si aucune. */
  seule: { photo: PhotoRedressee; a: Analyse } | null;
  /** La fusion des photos redressees (complete ou partielle) ; null sinon. */
  fusion: { a: Analyse; res?: ResultatFusion; morceaux: Morceau[]; rangReference: number } | null;
}

// ------------------------------------------------------------------------------------------------
// La chaine en quatre temps, un par etape de l'orchestrateur (enchainement.ts) : chaque etape calcule ce qu'elle montre (lot D,
// decision du proprietaire, 7 novembre 2026). E3 le champ de chaque photo, E4 ses coins (calage fin, replis, report du mur), E5 sa vue de
// face, E6 la mosaique des vues ; l'E7 pose le mur sur elle et analyse le mur pose.
// ------------------------------------------------------------------------------------------------

/** E3 : par photo (dans l'ordre des entrees), le champ lu sur ses points de fuite quand l'EXIF manque. */
export function champsDesPhotos(entrees: readonly PhotoARedresser[]): (number | null)[] {
  return entrees.map(champDeLaPhoto);
}

/** Les coins du mur poses a la main sur chaque photo (ceux des corrections), par rang : le mur tire. */
export function murDesCorrections(corrections: Readonly<Record<string, CorrectionRedressement>>): Record<string, P2[]> {
  return Object.fromEntries(Object.entries(corrections).flatMap(([rang, c]) => (c.coins?.length === 4 ? [[rang, c.coins.map((p) => ({ x: p.x, y: p.y }))]] : [])));
}

const memeMur = (a: Readonly<Record<string, readonly P2[]>>, b: Readonly<Record<string, readonly P2[]>>): boolean => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** E4 : les coins de chaque photo et ce qu'ils redressent, le mur reporte. */
export interface CoinsDesPhotos {
  /** Par entree (dans l'ordre), la photo redressee seule, avant le report du mur ; null : son redressement a echoue. */
  parPhoto: (PhotoRedressee | null)[];
  /** Les photos redressees apres le report du mur, dans l'ordre des entrees (sans les echecs). */
  faits: PhotoRedressee[];
  /** Par photo de `faits` : son morceau lit-il une autre image que la photo d'entree (corrigee de la distorsion du grand-angle) ? */
  corrigees: boolean[];
  /** Les bilans des photos qui n'ont rien donne (illisibles, redressement impossible), dans l'ordre. */
  echecs: BilanPhotoRedressement[];
  /** Le report du mur a-t-il remplace une photo ? */
  reporte: boolean;
  /** Le mur tire (les coins poses a la main des corrections), par rang, tel que ce calcul l'a pris. */
  mur: Record<string, P2[]>;
}

/** Les bilans de toutes les photos, par rang : les echecs, puis les photos redressees. */
export function bilansDesCoins(c: Pick<CoinsDesPhotos, 'echecs' | 'faits'>): BilanPhotoRedressement[] {
  return [...c.echecs, ...c.faits.map((x) => x.bilan)].sort((a, b) => a.rang - b.rang);
}

/** Les reperes poses a la main sur chaque morceau : ils redressent la photo entiere (l'E5) avant l'assemblage. */
function avecLesReperes(faits: readonly PhotoRedressee[], corrections: Readonly<Record<string, CorrectionRedressement>>): void {
  for (const x of faits) {
    const m = x.essai?.p.morceau, c = corrections[String(x.bilan.rang)];
    if (m && c?.reperes?.length === 4) m.reperes = c.reperes.map((p) => ({ x: p.x, y: p.y }));
  }
}

/**
 * E4 : chaque photo redressee seule, l'une apres l'autre (coins poses au doigt, sinon trouves sur les aretes par le calage fin, sinon
 * reportes, sinon predits), puis le mur pose au doigt (ou lu sur l'assemblage des reperes) reporte sur celles qui doutent.
 */
export async function coinsDesPhotos(entrees: readonly PhotoARedresser[], f: Facade, o: OutilsChaine, corrections: Readonly<Record<string, CorrectionRedressement>> = {}, echecs: readonly BilanPhotoRedressement[] = [], champs: readonly (number | null)[] = champsDesPhotos(entrees)): Promise<CoinsDesPhotos> {
  const parPhoto: (PhotoRedressee | null)[] = [];
  const perdus: BilanPhotoRedressement[] = [...echecs];
  for (const [i, e] of entrees.entries()) {
    const r = await redresserPhoto(e, f, o, corrections[String(e.rang)], null, champs[i] ?? null).catch(() => null);
    parPhoto.push(r);
    if (!r) perdus.push({ rang: e.rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'redressement impossible' });
  }
  const faits = parPhoto.filter((x): x is PhotoRedressee => !!x);
  // Le mur pose au doigt sur une photo (ou lu sur l'assemblage), reporte sur celles qui n'en ont que des coins predits : toutes
  // montrent alors le meme mur, et se croisent a la fusion. Quatre coins poses une fois pour toutes.
  await reporterLeMur(entrees, f, o, corrections, faits, champs);
  avecLesReperes(faits, corrections);
  const image = (x: PhotoRedressee) => entrees.find((e) => e.rang === x.bilan.rang)?.image;
  return {
    parPhoto, faits, echecs: perdus, mur: murDesCorrections(corrections),
    corrigees: faits.map((x) => x.essai?.p.morceau.prise.photo.image !== image(x)),
    reporte: faits.some((x) => !parPhoto.includes(x)),
  };
}

/** E5 : par photo de `faits`, sa vue de face entiere (null sans essai, ou qui ne se redresse pas), et si elle vient des coins du mur. */
export interface VuesDesPhotos {
  parFait: (RedressementFuites | null)[];
  parCoins: boolean[];
}

/**
 * E5 : chaque photo redressee entiere, comme l'assemblage la prend (analyseMur.ts::vuesDeLAssemblage) : par ses reperes, sinon par ses
 * points de fuite, sinon par les coins du mur retenu ; sur l'image que la chaine a lue (corrigee de la distorsion s'il y a lieu).
 */
export function vuesDesPhotos(c: Pick<CoinsDesPhotos, 'faits'>): VuesDesPhotos {
  const avec = c.faits.flatMap((x, k) => (x.essai ? [{ k, m: x.essai.p.morceau }] : []));
  const d = vuesDeLAssemblageDites(avec.map(({ m }) => ({ photo: m.prise.photo.image, coins: m.coins, reperes: m.reperes ?? null })));
  const parFait: (RedressementFuites | null)[] = c.faits.map(() => null), parCoins = c.faits.map(() => false);
  avec.forEach(({ k }, j) => { parFait[k] = d.vues[j] ?? null; parCoins[k] = d.parCoins[j] ?? false; });
  return { parFait, parCoins };
}

/** E6 : les photos qui servent (redressees sans echec), celles qui servent seules faute de mieux, et l'assemblage de leurs vues. */
export interface AssemblageDesPhotos {
  /** Les photos redressees sans echec (indices dans `faits`) : deux ou plus s'assemblent. */
  utilisables: number[];
  /** Les photos qui peuvent servir seules, dans l'ordre ou on les essaie (sans echec d'abord) : indices dans `faits`. */
  candidates: number[];
  /** Deux photos utilisables ou plus : leurs vues et leur mosaique (l'image de l'assemblage, sans le mur). */
  vues: VuesAssemblees | null;
  /** Moins de deux : la vue et la mosaique de la premiere candidate (une photo seule est son propre assemblage), par indice. */
  seule: { k: number; vues: VuesAssemblees } | null;
}

/** E6 : les vues des photos utilisables assemblees (ORB et RANSAC de similitude, facade/vision/mosaiqueFuites.ts). */
export function assemblerLesPhotos(c: Pick<CoinsDesPhotos, 'faits'>, v: VuesDesPhotos): AssemblageDesPhotos {
  const ks = c.faits.map((_, k) => k);
  const utilisables = ks.filter((k) => c.faits[k]?.bilan.statut !== 'echec' && c.faits[k]?.essai);
  const candidates = [...utilisables, ...ks.filter((k) => c.faits[k]?.bilan.statut === 'echec' && c.faits[k]?.essai)];
  if (utilisables.length >= 2) return { utilisables, candidates, vues: assemblerLesVues(utilisables.map((k) => v.parFait[k] ?? null)), seule: null };
  const k = candidates[0];
  return { utilisables, candidates, vues: null, seule: k === undefined ? null : { k, vues: assemblerLesVues([v.parFait[k] ?? null]) } };
}

/**
 * E7 : le mur pose sur l'assemblage (les coins de la premiere photo assemblee, portes sur la mosaique), le gabarit pose par les coins de
 * chaque photo, puis le mur analyse (redresse a l'echelle du plan, vues fondues, haut lu, detection, texture : analyseMur.ts). Le bilan
 * du redressement dit l'assemblage tel que l'analyse l'a pris.
 */
export function analyserLeMurPose(entrees: readonly PhotoARedresser[], f: Facade, bat: Pick<ObjetPolygone, 'pts'>, o: OutilsChaine, c: CoinsDesPhotos, asm: AssemblageDesPhotos): ResultatChaine {
  // La silhouette du haut du mur sur chaque photo, avant l'analyse : le gabarit pose par ses coins (sa forme ne bouge pas, elle ne se lit
  // jamais sur la photo). Sans gabarit, aucune : la bande au-dessus de l'egout lit le toit (facade/analyse.ts). Sur une copie du morceau :
  // l'E4 garde les siens (un rejeu suivant les reprend).
  const faits = c.faits.map((x): PhotoRedressee => {
    const m = x.essai?.p.morceau, silhouette = m && o.gabarit ? gabaritSurLaPhoto(o.gabarit, m.coins) : null;
    return x.essai && m && silhouette ? { ...x, essai: { ...x.essai, p: { ...x.essai.p, morceau: { ...m, silhouette } } } } : x;
  });
  const bilans = bilansDesCoins({ echecs: c.echecs, faits });
  const total = entrees.length + c.echecs.length - (c.parPhoto.length - c.faits.length);
  const bilan = (fusion: BilanRedressement['fusion'], fusionnees: number[], motif?: string): BilanRedressement => ({ photos: bilans, fusion, fusionnees, ...(motif ? { motifFusion: motif } : {}) });
  const morceauDe = (k: number) => ((faits[k] as PhotoRedressee).essai as NonNullable<PhotoRedressee['essai']>).p.morceau;

  // La photo seule : la premiere redressee sans echec qui s'analyse, sinon la premiere qui s'analyse (jamais rien de perdu).
  const analyserSeule = (): ResultatChaine['seule'] => {
    for (const k of asm.candidates) {
      const a = analyserSerie([morceauDe(k)], f, f.hauteur, bat as ObjetPolygone, 'morceaux', asm.seule?.k === k ? asm.seule.vues : null);
      if (a) return { photo: faits[k] as PhotoRedressee, a };
    }
    return null;
  };
  if (!asm.candidates.length) return { redressement: bilan('sans', [], faits.length ? undefined : 'aucune photo n’a pu être redressée'), faits, seule: null, fusion: null };
  if (asm.utilisables.length < 2) return { redressement: bilan('sans', [], total > 1 ? 'moins de deux photos redressées : pas de fusion' : undefined), faits, seule: analyserSeule(), fusion: null };

  // L'assemblage des photos redressees entieres (facade/analyseMur.ts), sinon leur fusion (ORB + RANSAC) ; sinon chacune reste seule.
  const morceaux = asm.utilisables.map(morceauDe);
  const a = analyserSerie(morceaux, f, f.hauteur, bat as ObjetPolygone, 'vues', asm.vues);
  const rangDe = (j: number) => (faits[asm.utilisables[j] as number] as PhotoRedressee).bilan.rang;
  const am = a?.assemblage;
  if (a && am) {
    const dedans = am.vues.map((v, j) => (v.assemblee ? j : -1)).filter((j) => j >= 0);
    if (dedans.length >= 2) {
      const toutes = dedans.length === am.vues.length;
      return {
        redressement: bilan(toutes ? 'fusionnee' : 'partielle', dedans.map(rangDe).sort((x, y) => x - y), toutes ? undefined : motifFusion(am.vues.map((v) => v.motif ?? ''))),
        faits, seule: null, fusion: { a, morceaux, rangReference: rangDe(dedans[0] as number) },
      };
    }
    return { redressement: bilan('independantes', [], motifFusion(am.vues.map((v) => v.motif ?? '')) ?? 'les photos ne se recoupent pas assez'), faits, seule: analyserSeule(), fusion: null };
  }
  const res = a?.fusion;
  if (!a || !res || (res.statut !== 'fusionnee' && res.statut !== 'partielle')) {
    const motifs = res ? res.vues.map((v) => v.motif ?? '') : ['la fusion n’a pas pu s’appliquer'];
    return { redressement: bilan('independantes', [], motifFusion(motifs) ?? 'les photos ne se recoupent pas assez'), faits, seule: analyserSeule(), fusion: null };
  }
  const fusionnees = res.groupe.map(rangDe).sort((x, y) => x - y);
  const autres = res.independantes.map((j) => res.vues[j]?.motif ?? '');
  return {
    redressement: bilan(res.statut === 'fusionnee' ? 'fusionnee' : 'partielle', fusionnees, res.statut === 'partielle' ? motifFusion(autres) : undefined),
    faits, seule: null, fusion: { a, res, morceaux, rangReference: rangDe(res.reference) },
  };
}

/**
 * Le mur tire a la main (des coins poses sur une ou plusieurs photos, en general le mur tire sur l'assemblage et ramene sur chacune) sans
 * refaire l'E4 a l'E6 : les photos ou il change se redressent par lui (des coins poses : jamais de calage fin), les autres gardent ce
 * qu'elles avaient, et les vues de face et l'assemblage restent ceux du rejeu precedent. Rend les coins de l'E4 avec ce mur, les memes
 * que si tout avait ete rejoue, ou null quand le mur entre dans l'E4 a l'E6 autrement que par ces photos (alors tout se rejoue depuis
 * l'E4) :
 * - le mur est retire d'une photo (ses coins se cherchent de nouveau : le calage fin) ;
 * - un report du mur : le rejeu precedent a reporte un mur sur une photo, ou celui-ci le reporterait sur une photo qu'il ne couvre pas
 *   (des reperes sans coins, des coins predits) ;
 * - une photo ou il change ne se redresse pas par lui, ou s'etait redressee en echec (elle entrerait dans l'assemblage, ou en sortirait) ;
 * - une photo ou il change a sa vue de face tiree de ses coins (ni reperes, ni points de fuite), ou lue sur l'image corrigee de la
 *   distorsion du grand-angle (le mur pose au doigt se lit sur la photo d'origine).
 */
export async function reporterLeMurTire(entrees: readonly PhotoARedresser[], f: Facade, o: OutilsChaine, corrections: Readonly<Record<string, CorrectionRedressement>>, avant: CoinsDesPhotos, vues: VuesDesPhotos, champs: readonly (number | null)[]): Promise<CoinsDesPhotos | null> {
  const mur = murDesCorrections(corrections);
  if (memeMur(mur, avant.mur)) return avant;
  if (avant.reporte || avant.parPhoto.length !== entrees.length) return null;
  const change = (rang: number) => JSON.stringify(mur[String(rang)] ?? null) !== JSON.stringify(avant.mur[String(rang)] ?? null);
  // Aucune photo hors du mur tire ne recevrait de report (reporterLeMur) : ni reperes sans coins, ni coins predits.
  for (const x of avant.faits) {
    const c = corrections[String(x.bilan.rang)];
    if (mur[String(x.bilan.rang)]) continue;
    if (c?.reperes?.length === 4 || x.bilan.coins === 'predit') return null;
  }
  const parPhoto = [...avant.parPhoto], faits = [...avant.faits], corrigees = [...avant.corrigees];
  for (const [i, e] of entrees.entries()) {
    if (!change(e.rang)) continue;
    const ancien = avant.parPhoto[i], k = ancien ? avant.faits.indexOf(ancien) : -1;
    if (!mur[String(e.rang)] || !ancien?.essai || k < 0 || ancien.bilan.statut === 'echec' || vues.parCoins[k] || avant.corrigees[k]) return null;
    const r = await redresserPhoto(e, f, o, corrections[String(e.rang)], null, champs[i] ?? null).catch(() => null);
    if (!r?.essai || r.bilan.statut === 'echec') return null;
    parPhoto[i] = r; faits[k] = r; corrigees[k] = false;
  }
  avecLesReperes(faits.filter((x) => !avant.faits.includes(x)), corrections);
  return { ...avant, parPhoto, faits, corrigees, mur };
}
