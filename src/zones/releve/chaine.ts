// La chaine des photos d'un mur, une seule pour tous (MD/spec-facades-calage-detection.md) : l'audit de la parcelle
// (app/audit/parcelle/mesures.ts), le releve de facade (zones/Releve.tsx) et la calibration (zones/EditeurCasCalibration.tsx)
// redressent, fusionnent et cotent par elle. Sans React : testable seule.
//
// Chaque photo est redressee : coins poses au doigt, sinon trouves sur les aretes (calage fin, distorsion du grand-angle), sinon
// reportes d'une autre photo du mur ou lus sur l'assemblage des vues, sinon predits par la prise de vue. Des verticales qui
// penchent font essayer les coins predits, puis les cotes ramenes sur le point de fuite des verticales. A partir de deux photos
// redressees, elles sont fusionnees. Rien ne se perd : une photo qui doute reste, avec son motif, et sert faute de mieux.

import { CHAMP_GRAND_COTE_DEFAUT } from '../../facade/cadrage.js';
import { detecterSegments } from '../../facade/segments.js';
import { focaleDeLaPhotoParFuites } from '../../facade/redressementFuites.js';
import { coinsSurLaVerticale, fuiteVerticaleDesSegments } from '../../facade/verticales.js';
import type { ResultatFusion } from '../../facade/fusion.js';
import type { SourceCoin } from '../../facade/calageFin.js';
import type { Facade } from '../../facade/geometrie.js';
import { redresser, resolutionTexture, type Image, type P2 } from '../../facade/homographie.js';
import type { BilanPhotoRedressement, BilanRedressement, CorrectionRedressement } from '../../model/auditParcelle.js';
import type { ObjetPolygone } from '../../model/types.js';
import { analyserSerie } from './analyse.js';
import { appliquerResultat, coinsDePrise, entreeRecherche, type Assemblage, type EntreeRecherche, type Morceau, type ResultatRecherche } from './serie.js';
import { coinsAutoDeSerie, quadrilatereSain, reporterCoins } from './coinsAuto.js';
import type { Prise } from './capteurs.js';

/**
 * La version de la chaine : elle monte quand un changement de la chaine change les coins, les redressements ou la fusion qu'elle
 * rend. Un audit la garde avec ses mesures (app/audit/parcelle/mesures.ts) : rejoue plus tard, on sait de quelle chaine venaient
 * les images d'origine, et ce qui a change.
 */
export const VERSION_CHAINE_FACADES = 4;

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

/** Le champ du grand cote de la photo (degres) que donnent ses points de fuite, quand ils le disent ; null sinon. */
export function champDesFuites(image: Image): number | null {
  const f = focaleDeLaPhotoParFuites(detecterSegments(image), image.largeur, image.hauteur);
  return f === null ? null : (2 * Math.atan(Math.max(image.largeur, image.hauteur) / 2 / f) * 180) / Math.PI;
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
   * La hauteur du mur est-elle celle du plan (cadastre, LiDAR) ? Elle fixe alors les proportions du mur lu sur l'assemblage
   * des vues ; sinon elles s'y lisent.
   */
  hauteurDuPlan?: boolean;
  /**
   * Vrai : sans photo posee au doigt, le mur se lit sur l'assemblage des vues pour les photos restees aux coins predits (la
   * calibration, dont les photos n'ont pas de prise de vue). L'audit garde les coins de sa prise de vue : un mur lu de loin sur
   * l'assemblage s'arretait a un poteau du pan de bois (AE 101), et ses coins comptes trouves poseraient le releve tout seul.
   */
  lireSurLAssemblage?: boolean;
  /** Vrai : les coins seuls (la calibration redresse ensuite le cas) ; ni analyse de la photo seule, ni fusion. */
  coinsSeuls?: boolean;
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
async function preparerPhoto(e: PhotoARedresser, f: Facade, o: OutilsChaine, correction: CorrectionRedressement | undefined, predits: boolean, serie: CoinsSerie | null = null): Promise<PhotoPreparee> {
  const { rang, image } = e;
  const prise = e.prise(e.champConnu ? null : champDesFuites(image));
  // Les coins predits tels quels : ramenes au bord du cadre (ce que fait l'ecran pour le doigt), ils ne seraient plus le mur, et
  // le redressement deformerait la photo au lieu de la redresser (un mur de 7 m photographie a 4 m deborde de l'image).
  const depart: Morceau = { prise, coins: coinsDePrise(prise, f.largeur, f.hauteur, false, f.azimut, false), recherche: true };
  if (correction?.coins && correction.coins.length === 4) {
    return { rang, coins: 'main', morceau: { ...depart, coins: correction.coins.map((c) => ({ x: c.x, y: c.y })), sources: ['doigt', 'doigt', 'doigt', 'doigt'], recherche: false } };
  }
  // Les coins reportes d'une autre photo du mur, ou lus sur l'assemblage des vues redressees (zones/releve/coinsAuto.ts) :
  // comptes trouves quand le mur y a ete lu.
  if (serie) return { rang, coins: serie.lu ? 'trouve' : 'predit', morceau: { ...depart, coins: serie.coins.map((c) => ({ x: c.x, y: c.y })), ...(serie.lu ? { sources: ['trouve', 'trouve', 'trouve', 'trouve'] as SourceCoin[] } : {}), recherche: false } };
  if (predits) return { rang, coins: 'predit', morceau: { ...depart, recherche: false } };
  const entree = entreeRecherche(prise, f.largeur, f.hauteur, false, f.azimut);
  const r = entree ? await o.chercherCoins(entree).catch(() => null) : null;
  // La photo corrigee de la distorsion n'a pas besoin d'URL ici : on ne l'affiche pas.
  const m = r ? appliquerResultat(depart, r, r.distorsion ? 'corrigee' : null) : { ...depart, recherche: false };
  return { rang, morceau: m, coins: m.sources?.includes('trouve') ? 'trouve' : 'predit' };
}

/** Les coins d'un morceau ramenes sur ses verticales (facade/verticales.ts) ; null s'il n'en offre pas assez. */
function coinsSurLesVerticales(m: Morceau): P2[] | null {
  const img = m.prise.photo.image;
  const fuite = fuiteVerticaleDesSegments(detecterSegments(img), img.largeur, img.hauteur);
  return fuite ? coinsSurLaVerticale(m.coins, fuite.point) : null;
}

/** Le redressement d'une photo seule : son analyse, sa verticalite, le repli sur les coins calcules, son statut. */
export async function redresserPhoto(e: PhotoARedresser, f: Facade, o: OutilsChaine, correction: CorrectionRedressement | undefined, serie: CoinsSerie | null = null): Promise<PhotoRedressee> {
  const { rang } = e;
  const juger = (p: PhotoPreparee) => quadrilatereSain(p.morceau.coins, { largeur: 0, hauteur: 0 }) ? { p, vert: verticaliteDesCoins(p.morceau.prise.photo.image, p.morceau.coins, f.largeur, f.hauteur) } : null;
  const analyser = async (predits: boolean, s: CoinsSerie | null = null) => juger(await preparerPhoto(e, f, o, correction, predits, s));
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
  if (!essai) return { bilan: { rang, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'la photo ne montre pas le mur : coins introuvables ou image illisible' }, essai: null };
  // Des coins poses au doigt, ou le mur lu depuis les reperes de la personne : ils ne se discutent pas.
  const manuelle = essai.p.coins === 'main' || (!!parReperes && essai === parReperes);
  // Des verticales qui penchent : les points calcules d'apres la prise de vue valent parfois mieux que ceux cherches sur les aretes.
  if (!manuelle && essai.vert !== null && essai.vert > SEUIL_VERTICALES_DEG) {
    const repli = await analyser(true).catch(() => null);
    if (repli && repli.vert !== null && repli.vert < essai.vert) essai = repli;
  }
  // Toujours penchees : les cotes du quadrilatere ramenes sur le point de fuite des verticales lues sur la photo.
  if (!manuelle && essai.vert !== null && essai.vert > SEUIL_VERTICALES_DEG) {
    const coins = coinsSurLesVerticales(essai.p.morceau);
    const droit = coins ? juger({ ...essai.p, morceau: { ...essai.p.morceau, coins } }) : null;
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

/** Le grand cote du mur redresse pour juger ses verticales a l'ecran : de quoi lire les aretes, sans payer une analyse. */
const COTE_VERTICALES_PX = 512;

/** La verticalite du mur redresse entre ces coins, sur une elevation reduite (verticaliteDeg) ; null sans redressement ni lignes. */
export function verticaliteDesCoins(image: Image, coins: readonly P2[], largeurM: number, hauteurM: number): number | null {
  if (!quadrilatereSain(coins, { largeur: 0, hauteur: 0 })) return null;
  const r = redresser(image, coins, largeurM, hauteurM, resolutionTexture(largeurM, hauteurM, COTE_VERTICALES_PX));
  return r ? verticaliteDeg(r.image) : null;
}

/**
 * Le morceau d'un releve a l'ecran, avant l'analyse : des verticales qui penchent font essayer les coins predits par la prise,
 * puis les cotes ramenes sur les verticales de la photo ; le moins penche est garde. Le meme repli que pour l'audit
 * (redresserPhoto), sans relancer la recherche des coins deja faite, et juge sur une elevation reduite : l'analyse, la seule
 * couteuse, ne se fait qu'une fois, sur les coins retenus. Des coins poses au doigt ne bougent jamais.
 */
export function morceauRedresse(m: Morceau, f: Facade, hauteur: number): Morceau {
  if (m.sources?.includes('doigt') || m.decrochement) return m;
  const img = m.prise.photo.image;
  const vert = (coins: readonly P2[]) => verticaliteDesCoins(img, coins, f.largeur, hauteur);
  const predit: Morceau = { ...m, coins: coinsDePrise(m.prise, f.largeur, hauteur, false, f.azimut, false), sources: m.coins.map((): SourceCoin => 'predit') };
  // Des coins qui ne forment pas un mur (croises, ecrases) : ceux de la prise de vue, plutot qu'un mur faux.
  if (!quadrilatereSain(m.coins, { largeur: 0, hauteur: 0 })) return predit;
  const v0 = vert(m.coins);
  if (v0 === null || v0 <= SEUIL_VERTICALES_DEG) return m;
  let meilleur = { morceau: m, vert: v0 };
  const vp = vert(predit.coins);
  if (vp !== null && vp < meilleur.vert) meilleur = { morceau: predit, vert: vp };
  if (meilleur.vert > SEUIL_VERTICALES_DEG) {
    const coins = coinsSurLesVerticales(meilleur.morceau);
    const vd = coins ? vert(coins) : null;
    if (coins && vd !== null && vd < meilleur.vert) meilleur = { morceau: { ...meilleur.morceau, coins }, vert: vd };
  }
  return meilleur.morceau;
}

/**
 * L'analyse d'une serie du releve a l'ecran : chaque photo du mur entier passe par le repli des verticales (morceauRedresse) ;
 * des coins qui ne s'analysent pas laissent place a ceux de la prise de vue, plutot que rien. Les coins poses au doigt ne
 * bougent jamais. `retenus` : les morceaux analyses (les memes quand rien n'a change).
 */
export function analyserSansRien(morceaux: Morceau[], f: Facade, hauteur: number, bat: ObjetPolygone, assemblage: Assemblage): { a: Analyse | null; retenus: Morceau[] } {
  const entiers = morceaux.length === 1 || assemblage === 'vues';
  const redresses = entiers ? morceaux.map((m) => morceauRedresse(m, f, hauteur)) : morceaux;
  const retenus = redresses.some((m, k) => m !== morceaux[k]) ? redresses : morceaux;
  const a = analyserSerie(retenus, f, hauteur, bat, assemblage);
  if (a) return { a, retenus };
  const parLaPrise = retenus.map((m) => (m.sources?.includes('doigt') ? m : { ...m, coins: coinsDePrise(m.prise, f.largeur, hauteur, !entiers, f.azimut, false), sources: m.coins.map((): SourceCoin => 'predit') }));
  const b = analyserSerie(parLaPrise, f, hauteur, bat, assemblage);
  return b ? { a: b, retenus: parLaPrise } : { a: null, retenus: morceaux };
}

/**
 * Remplace les photos aux coins predits par celles aux coins reportes de la photo ou le mur a ete pose au doigt. Pas d'une photo
 * ou il est « trouve » sur les aretes : sur AE 101 (octobre 2026), un mur trouve sur une photo prise de loin s'arretait a un poteau
 * du pan de bois, et le report le recopiait sur l'autre photo (fusionnee, mais sans ses fenetres).
 * Sans photo posee au doigt, et quand l'appelant le demande (`lireSurLAssemblage`), le mur se lit sur l'assemblage des vues
 * redressees (coinsAutoDeSerie), pour les seules photos restees aux coins predits.
 */
async function reporterLeMur(entrees: readonly PhotoARedresser[], f: Facade, o: OutilsChaine, corrections: Readonly<Record<string, CorrectionRedressement>>, faits: PhotoRedressee[]): Promise<void> {
  const aReporter = () => faits.filter((x) => x.bilan.coins === 'predit' && !corrections[String(x.bilan.rang)]?.coins);
  const avecReperes = Object.values(corrections).some((c) => c.reperes?.length === 4);
  if (!aReporter().length && !avecReperes) return;
  const images = entrees.map((e) => e.image);
  const k = (rang: number) => entrees.findIndex((e) => e.rang === rang);
  const remplacer = async (x: PhotoRedressee, coins: P2[] | null | undefined, lu: boolean, prime = false) => {
    const e = entrees[k(x.bilan.rang)];
    if (!coins || !e) return;
    const r = await redresserPhoto(e, f, o, undefined, { coins, lu, prime }).catch(() => null);
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
        if (aReperes(x)) await remplacer(x, sr.coins[i], sr.lu, true);
        else if (aReporter().includes(x)) await remplacer(x, sr.coins[i], sr.lu);
      }
      return;
    }
    if (!o.lireSurLAssemblage) return;
    const sr = coinsAutoDeSerie(images, f.largeur, o.hauteurDuPlan ? f.hauteur : null);
    if (!sr) return;
    for (const x of aReporter()) await remplacer(x, sr.coins[k(x.bilan.rang)], sr.lu);
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
  fusion: { a: Analyse; res: ResultatFusion; morceaux: Morceau[]; rangReference: number } | null;
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
  if (o.coinsSeuls) return { redressement: bilan('sans', []), faits, seule: null, fusion: null };

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

  // La fusion (ORB + RANSAC) des photos redressees ; sinon chacune reste seule.
  const morceaux = utilisables.map((x) => (x.essai as NonNullable<typeof x.essai>).p.morceau);
  const a = analyserSerie(morceaux, f, f.hauteur, bat as ObjetPolygone, 'vues');
  const res = a?.fusion;
  if (!a || !res || (res.statut !== 'fusionnee' && res.statut !== 'partielle')) {
    const motifs = res ? res.vues.map((v) => v.motif ?? '') : ['la fusion n’a pas pu s’appliquer'];
    return { redressement: bilan('independantes', [], motifFusion(motifs) ?? 'les photos ne se recoupent pas assez'), faits, seule: analyserSeule(), fusion: null };
  }
  const rangDe = (k: number) => (utilisables[k] as PhotoRedressee).bilan.rang;
  const fusionnees = res.groupe.map(rangDe).sort((x, y) => x - y);
  const autres = res.independantes.map((k) => res.vues[k]?.motif ?? '');
  return {
    redressement: bilan(res.statut === 'fusionnee' ? 'fusionnee' : 'partielle', fusionnees, res.statut === 'partielle' ? motifFusion(autres) : undefined),
    faits, seule: null, fusion: { a, res, morceaux, rangReference: rangDe(res.reference) },
  };
}

/** La prise d'une photo sans capteurs (importee, calibration) : ni GPS, ni boussole, le champ de l'EXIF ou celui lu sur la photo. */
export function priseSansCapteurs(image: Image, focalePx: number | null = null): (champLu: number | null) => Prise {
  return (champLu) => ({ photo: { image, url: '', champ: champLu, focalePx }, mesure: null, reperes: null, champ: champLu ?? CHAMP_GRAND_COTE_DEFAUT, photosPrevues: null });
}
