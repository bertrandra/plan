// La chaine des photos d'un mur, une seule pour tous (MD/spec-facades-calage-detection.md) : l'audit de la parcelle et la calibration
// redressent, fusionnent et cotent par elle, par le meme orchestrateur (facade/releve/enchainement.ts::derouler), avec les memes
// options : la calibration rejoue ce que fait l'audit (CLAUDE.md, « Calibration et audit : un seul processus »). Depuis le lot F6, les
// photos d'une facade ne se prennent plus que dans l'audit. Sans React : testable seule.
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
import type { Prise } from './prise.js';

/**
 * La version de la chaine : elle monte quand un changement de la chaine change les coins, les redressements ou la fusion qu'elle
 * rend. Un audit la garde avec ses mesures (app/audit/parcelle/mesures.ts) : rejoue plus tard, on sait de quelle chaine venaient
 * les images d'origine, et ce qui a change. 11 (2 novembre 2026) : la calibration rejoue la chaine de l'audit (un seul processus) ;
 * un cas, un mur vrai ou une reponse de Claude enregistres sous la 10 ont ete poses sur l'image de l'ancien chemin de la calibration.
 * 12 (2 novembre 2026) : le cadre que lit la detection est la boite de la silhouette entiere et sa marge (analyse.ts::cadreDeLaSilhouette).
 * 13 (2 novembre 2026) : le calage fin ne prend plus pour l'egout une horizontale que les deux cotes du mur depassent (les linteaux d'un
 * etage sous un pignon) ni la droite qui joint des hauts de cotes a des hauteurs differentes (une rampe) : les coins d'un pignon changent.
 */
export const VERSION_CHAINE_FACADES = 13;

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

/** L'objectif d'une photo tel que la chaine le prend : le champ de l'EXIF, sinon celui lu sur ses points de fuite, sinon le defaut. */
function objectifDe(e: PhotoARedresser, champLu: number | null): NonNullable<BilanPhotoRedressement['objectif']> {
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
export async function redresserPhoto(e: PhotoARedresser, f: Facade, o: OutilsChaine, correction: CorrectionRedressement | undefined, serie: CoinsSerie | null = null): Promise<PhotoRedressee> {
  const { rang } = e;
  // Le champ lu sur les points de fuite quand l'EXIF manque : lu une fois pour tous les essais (le meme a chaque lecture), et dit au
  // bilan avec sa source, pour que l'E3 dise la focale que la chaine a prise.
  const champLu = e.champConnu ? null : champDesFuites(e.image);
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
  // l'assemblage des reperes y a trouve, lui, garde le verdict de l'arbitre (`murCherche`) : l'E5 le juge comme un mur trouve.
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
async function reporterLeMur(entrees: readonly PhotoARedresser[], f: Facade, o: OutilsChaine, corrections: Readonly<Record<string, CorrectionRedressement>>, faits: PhotoRedressee[]): Promise<void> {
  const aReporter = () => faits.filter((x) => x.bilan.coins === 'predit' && !corrections[String(x.bilan.rang)]?.coins);
  const avecReperes = Object.values(corrections).some((c) => c.reperes?.length === 4);
  if (!aReporter().length && !avecReperes) return;
  const images = entrees.map((e) => e.image);
  const k = (rang: number) => entrees.findIndex((e) => e.rang === rang);
  const remplacer = async (x: PhotoRedressee, coins: P2[] | null | undefined, lu: boolean, prime = false, pose?: PoseDuMurCherche) => {
    const e = entrees[k(x.bilan.rang)];
    if (!coins || !e) return;
    const r = await redresserPhoto(e, f, o, undefined, { coins, lu, prime, ...(pose ? { pose } : {}) }).catch(() => null);
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

/**
 * Redresse toutes les photos d'un mur, l'une apres l'autre (dans l'ordre donne), reporte le mur sur celles qui doutent, et
 * fusionne celles qui se redressent. Ne rejette jamais : une photo illisible ne donne rien, une fusion impossible laisse la
 * meilleure photo seule.
 */
export async function redresserEtFusionner(entrees: readonly PhotoARedresser[], f: Facade, bat: Pick<ObjetPolygone, 'pts'>, o: OutilsChaine, corrections: Readonly<Record<string, CorrectionRedressement>> = {}, echecs: readonly BilanPhotoRedressement[] = []): Promise<ResultatChaine> {
  const faits: PhotoRedressee[] = [];
  const bilans: BilanPhotoRedressement[] = [...echecs];
  for (const e of entrees) {
    const r = await redresserPhoto(e, f, o, corrections[String(e.rang)]).catch(() => null);
    if (!r) { bilans.push({ rang: e.rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'redressement impossible' }); continue; }
    faits.push(r);
  }
  // Le mur pose au doigt sur une photo (ou lu sur l'assemblage), reporte sur celles qui n'en ont que des coins predits : toutes
  // montrent alors le meme mur, et se croisent a la fusion. Quatre coins poses une fois pour toutes.
  await reporterLeMur(entrees, f, o, corrections, faits);
  bilans.push(...faits.map((x) => x.bilan));
  bilans.sort((a, b) => a.rang - b.rang);
  const total = entrees.length + echecs.length;
  const bilan = (fusion: BilanRedressement['fusion'], fusionnees: number[], motif?: string): BilanRedressement => ({ photos: bilans, fusion, fusionnees, ...(motif ? { motifFusion: motif } : {}) });
  // Les reperes poses a la main redressent la photo entiere avant l'assemblage. La silhouette du haut du mur sur chaque photo, avant
  // l'analyse : le gabarit pose par ses coins (sa forme ne bouge pas, elle ne se lit jamais sur la photo). Sans gabarit, aucune : la
  // bande au-dessus de l'egout lit le toit (facade/analyse.ts).
  for (const x of faits) {
    const m = x.essai?.p.morceau;
    if (!m) continue;
    const c = corrections[String(x.bilan.rang)];
    if (c?.reperes?.length === 4) m.reperes = c.reperes.map((p) => ({ x: p.x, y: p.y }));
    const silhouette = o.gabarit ? gabaritSurLaPhoto(o.gabarit, m.coins) : null;
    if (silhouette) m.silhouette = silhouette;
  }

  // La photo seule : la premiere redressee sans echec qui s'analyse, sinon la premiere qui s'analyse (jamais rien de perdu).
  const candidates = [...faits.filter((x) => x.bilan.statut !== 'echec' && x.essai), ...faits.filter((x) => x.bilan.statut === 'echec' && x.essai)];
  const analyserSeule = (): ResultatChaine['seule'] => {
    for (const x of candidates) {
      const a = analyserSerie([(x.essai as NonNullable<typeof x.essai>).p.morceau], f, f.hauteur, bat as ObjetPolygone);
      if (a) return { photo: x, a };
    }
    return null;
  };
  if (!candidates.length) return { redressement: bilan('sans', [], faits.length ? undefined : 'aucune photo n’a pu être redressée'), faits, seule: null, fusion: null };
  const utilisables = faits.filter((x) => x.bilan.statut !== 'echec' && x.essai);
  if (utilisables.length < 2) return { redressement: bilan('sans', [], total > 1 ? 'moins de deux photos redressées : pas de fusion' : undefined), faits, seule: analyserSeule(), fusion: null };

  // L'assemblage des photos redressees entieres (facade/analyseMur.ts), sinon leur fusion (ORB + RANSAC) ; sinon chacune reste seule.
  const morceaux = utilisables.map((x) => (x.essai as NonNullable<typeof x.essai>).p.morceau);
  const a = analyserSerie(morceaux, f, f.hauteur, bat as ObjetPolygone, 'vues');
  const rangDe = (k: number) => (utilisables[k] as PhotoRedressee).bilan.rang;
  const asm = a?.assemblage;
  if (a && asm) {
    const dedans = asm.vues.map((v, k) => (v.assemblee ? k : -1)).filter((k) => k >= 0);
    if (dedans.length >= 2) {
      const toutes = dedans.length === asm.vues.length;
      return {
        redressement: bilan(toutes ? 'fusionnee' : 'partielle', dedans.map(rangDe).sort((x, y) => x - y), toutes ? undefined : motifFusion(asm.vues.map((v) => v.motif ?? ''))),
        faits, seule: null, fusion: { a, morceaux, rangReference: rangDe(dedans[0] as number) },
      };
    }
    return { redressement: bilan('independantes', [], motifFusion(asm.vues.map((v) => v.motif ?? '')) ?? 'les photos ne se recoupent pas assez'), faits, seule: analyserSeule(), fusion: null };
  }
  const res = a?.fusion;
  if (!a || !res || (res.statut !== 'fusionnee' && res.statut !== 'partielle')) {
    const motifs = res ? res.vues.map((v) => v.motif ?? '') : ['la fusion n’a pas pu s’appliquer'];
    return { redressement: bilan('independantes', [], motifFusion(motifs) ?? 'les photos ne se recoupent pas assez'), faits, seule: analyserSeule(), fusion: null };
  }
  const fusionnees = res.groupe.map(rangDe).sort((x, y) => x - y);
  const autres = res.independantes.map((k) => res.vues[k]?.motif ?? '');
  return {
    redressement: bilan(res.statut === 'fusionnee' ? 'fusionnee' : 'partielle', fusionnees, res.statut === 'partielle' ? motifFusion(autres) : undefined),
    faits, seule: null, fusion: { a, res, morceaux, rangReference: rangDe(res.reference) },
  };
}
