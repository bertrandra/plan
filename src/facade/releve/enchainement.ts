// L'orchestrateur de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 ter.4) : les etapes E0 a E9 dans l'ordre du
// tableau, l'etat de chacune (son objectif atteint ou non, regles/facades/enchainement.json), et ce que chacune rend a la suivante.
// Pur, sans React ni DOM. Il APPELLE la chaine existante (vuesDeFace, mosaiqueDesVues, murSurLAssemblage, redresserEtFusionner,
// analyserLeMur, fondreLesVues) sans la modifier (decision 16) : un rejeu donne les memes images et les memes cotes qu'avant.
//
// La calibration est son premier consommateur (lot F0) : l'editeur d'un cas rejoue un cas etape par etape, la mesure prepare les
// cas valides. L'audit le suit (lot F3) : ses photos, avec leur prise de vue, passent par le mode `audit`, et le releve du mur sort
// de l'orchestrateur ; le releve (F6) l'appellera a son tour. Aucun ne reordonne les etapes lui-meme (§8 bis.1).

import { ETAPES_FACADE, etapeFacade, type EtatAffiche, type IdEtape } from '../../model/etapeFacade.js';
import { EMPREINTE_OBJECTIFS, objectifsEnchainement, type Objectifs } from '../regles/facades/enchainement.js';
import { GABARIT_RECTANGLE, gabaritSurLaPhoto, pointesDuGabarit, type GabaritMur } from '../gabaritMur.js';
import { analyserLAssemblage, analyserLeMur, fondreLesVues, murSurLesPhotos, type AssemblageDuMur, type MurAnalyse, type PhotoDuMur, type RetourVersLaPhoto } from '../analyseMur.js';
import { inverser, type RedressementFuites } from '../vision/redressementFuites.js';
import { silhouetteLue, vuesDeFace, type ResultatMosaique } from '../vision/mosaiqueFuites.js';
import { appliquerSimilitude } from '../vision/ransac.js';
import { appliquer, type Image, type P2 } from '../vision/homographie.js';
import { libelleSilhouette } from '../../model/silhouetteFacade.js';
import { sansOmbres } from '../vision/sansOmbres.js';
import type { ResultatFusion } from '../fusion.js';
import type { OuvertureDetectee } from '../detection/detection.js';
import { mosaiqueDeLaSerie, murDeLaSerie, type CoinsDeSerie } from './coinsAuto.js';
import { expliquer, expliqueLaPhoto, seuilsDuCalage, type Explication, type MurCale } from './calageAncres.js';
import { detecterSegments } from '../vision/segments.js';
import { priseSansCapteurs, redresserEtFusionner, VERSION_CHAINE_FACADES, type PhotoARedresser, type ResultatChaine } from './chaine.js';
import { avisFusion, releveDeLaSerie, type ReleveDeLaSerie } from './analyseSerie.js';
import { hautDeLImage, imageDuRunAvecLaBande, type ImageDuRun } from './imageDuRun.js';
import type { EntreeRecherche, Morceau, ResultatRecherche } from './serie.js';
import type { Facade } from '../../geometry/cotesVusDeDehors.js';
import type { BilanPhotoRedressement, BilanRedressement, CorrectionRedressement } from '../../model/auditParcelle.js';
import type { PtBrut } from '../../model/types.js';
import { redresserParReperes } from '../vision/redressementFuites.js';
import { juger, type AnalyseDuMur, type CasPrepare, type CasReel, type OuvertureVraie, type ToitVraiCorps } from '../corpusReel.js';
import { type ObservationsFacade, type RunEnregistre } from '../../regles/facades/observations.js';
import { accorderOuvertures, avisDesPointes, decisionColombage, ecartDesPoses, EMPREINTE_IA, poseDeLIa, observationsDuRun, texteAccord, type AccordIa, type RectIa } from '../regles/facades/ia.js';
import { cartesAretes } from '../detection/recalageIa.js';
import { etapeDiagnostic, etapeToit, hautEnPartsDuMur, type ToitDeLaFacade } from './etapesForme.js';
import type { DiagnosticForme } from '../regles/facades/diagnosticForme.js';
import { bilanDeLaFacade, texteBilan, type BilanFacade } from './bilanFacade.js';
import { versOuvertureFacade } from '../detection/verification.js';
import type { SilhouetteFacade } from '../../model/silhouetteFacade.js';

/** Une photo du mur : l'image, les coins du mur dessus (cherches, poses a la main, ou ceux d'un cas), ses reperes et sa focale. */
interface PhotoDeFacade {
  image: Image;
  coins: P2[];
  /** Quatre reperes poses a la main (un rectangle du mur) : ils redressent la photo entiere. */
  reperes: P2[] | null;
  focalePx: number | null;
  /** Le mur pose (ou ajuste) a la main sur cette photo : il l'emporte, il ne se cherche pas, et se reporte sur les autres. */
  murALaMain: boolean;
}

/** Ce qui entre dans l'enchainement : les dimensions et le gabarit du plan (E0), les photos (E1). */
export interface EntreesFacade {
  largeurM: number;
  hauteurM: number;
  gabarit: GabaritMur;
  photos: readonly PhotoDeFacade[];
  /** Les corps du toit qui font le gabarit, et le mur de la facade (lot F4) : le diagnostic de forme se fait corps par corps. */
  toit?: ToitDeLaFacade | null;
}

/** La verite d'un cas de calibration, pour la mesure de chaque etape (§7.3). */
interface VeriteFacade {
  /** Le mur vrai sur l'assemblage, en pixels (bouts, et l'egout et le sol quand on les connait). */
  calage?: CasReel['calageVrai'];
  /** Les ouvertures vraies, en metres. */
  ouvertures?: readonly OuvertureVraie[];
  /** La vraie forme du toit, corps par corps : la verite du diagnostic de forme (E5 bis). */
  toit?: readonly ToitVraiCorps[];
}

/** D'ou viennent les coins d'une photo : trouves, devines (a verifier), poses a la main, ou lus apres un redressement par les reperes. */
export type OrigineCoins = 'trouves' | 'devines' | 'main' | 'reperes';

interface OptionsEnchainement {
  /**
   * `chercher` : les coins de chaque photo se cherchent par la chaine de l'audit et du releve (calage fin, sinon le mur lu sur
   * l'assemblage), sauf un mur pose a la main. `garder` : les coins donnes, tels quels.
   */
  coins: 'chercher' | 'garder';
  /**
   * L'image prise pour la suite. `assemblage` : l'assemblage montre par la calibration (E2 et E3 se calculent ici, le mur y est pose
   * par les coins de la premiere photo assemblee). `chaine` : celle que rend analyserLeMur (la mesure des cas, le banc), qui
   * redresse et assemble en un appel : E2 a E4 se lisent alors sur ce qu'elle rend. `audit` : les photos de l'audit avec leur prise
   * de vue (`audit`), redressees, reportees, assemblees et analysees par la chaine de l'audit (redresserEtFusionner) ; E2 a E7 se
   * lisent sur ce qu'elle rend, et le releve du mur en sort (`sorties.audit`).
   */
  image: 'assemblage' | 'chaine' | 'audit';
  /** Les photos de l'audit et ce qui les accompagne ; requis pour `image: 'audit'`. */
  audit?: PrisesAudit;
  /** Le calage fin d'une photo (un worker a l'ecran, en direct ailleurs) ; requis pour `coins: 'chercher'`. */
  chercherCoins?: (e: EntreeRecherche) => Promise<ResultatRecherche>;
  /** La hauteur est celle du plan (un cas tire d'un audit) : elle fixe les proportions du mur cherche sur l'assemblage. */
  hauteurDuPlan?: boolean;
  /** La premiere photo seule (la mesure « une photo » du corpus reel). */
  premiereSeule?: boolean;
  /** Calculer aussi ce qui ne sert qu'a montrer (la texture sans ombres) : l'ecran, pas la mesure. */
  illustrer?: boolean;
  verite?: VeriteFacade;
  objectifs?: Partial<Objectifs>;
  /** Rejouer depuis cette etape, avec les sorties des precedentes prises dans `precedent`. */
  depuis?: IdEtape;
  precedent?: Enchainement;
  /** A chaque etape commencee (`en-cours`) puis finie (son etat et ce qu'elle a donne) : la barre de progression avance. */
  surEtape?: (id: IdEtape, etat: EtatAffiche, resume?: string) => void;
  /** Rendre la main au navigateur entre deux etapes (le calcul est long sur un telephone). */
  rendreLaMain?: () => Promise<void>;
  /** Vrai : la personne a demande d'arreter ; les etapes restantes restent a venir. */
  arrete?: () => boolean;
  /**
   * Le mode « IA » du rejeu (§7.2) : une reponse de Claude au run de cette facade, enregistree avec le cas, rejouee sans reseau ni
   * cout. Ses angles sont une pose candidate de l'E4, ses pointes s'y comparent au gabarit, ses boites s'accordent avec la detection a
   * l'E7. Absente : le mode deterministe. Elle ne se rejoue que sur l'assemblage de l'editeur (`image: 'assemblage'`), celui qu'elle a vu.
   */
  ia?: RunEnregistre | null;
}

/**
 * Les photos de l'audit (lot F3) : chacune avec sa prise de vue (GPS, boussole, EXIF), le cote du contour qu'elles montrent, les
 * corrections de la personne (reperes, mur pose a la main, echelle), et celles qui ne se lisent pas. Les photos brutes et les
 * corrections sont la source ; tout ce qui en sort est derive, et se rejoue.
 */
interface PrisesAudit {
  /** Le cote du contour, a la largeur corrigee par la personne s'il y a lieu, et a la hauteur du mur sous le toit. */
  facade: Facade;
  contour: readonly PtBrut[];
  /** Les photos lisibles, la premiere avec une prise de vue d'abord (l'ordre du redressement). */
  photos: readonly PhotoARedresser[];
  /** Les photos illisibles : leur echec, dit avec son motif. */
  illisibles: readonly BilanPhotoRedressement[];
  corrections: Readonly<Record<string, CorrectionRedressement>>;
  /** Une image en JPEG (`data:`) : le canevas du navigateur. */
  jpeg: (img: Image) => string;
}

/** Une photo de l'audit redressee seule, entiere : son rang parmi les photos de la facade, et l'image en JPEG. */
interface PhotoRedresseeDeLAudit { rang: number; image: string }

/**
 * L'assemblage de plusieurs photos tel que la reprise a la main le montre (« Ajuster l'égout et le sol », MD/spec-facade-calage-audit.md
 * §4 ter.2) : l'image prise pour la suite, le mur que la chaine y a pose (en pixels de l'assemblage), et, pour chaque photo assemblee
 * (son rang parmi les photos de la facade), le chemin de l'assemblage a la photo. Un mur tire dessus revient sur toutes par lui.
 */
export interface AssemblageAAjuster {
  /** L'adresse de l'image (JPEG `data:` dans l'audit). */
  url: string;
  largeur: number;
  hauteur: number;
  coins: P2[];
  retours: (RetourVersLaPhoto & { rang: number })[];
}

/** Le mur tire sur l'assemblage, ramene sur chaque photo assemblee : par rang, les coins du mur sur la photo. */
export function murAjusteSurLesPhotos(a: Pick<AssemblageAAjuster, 'retours'>, coins: readonly P2[]): Map<number, P2[]> {
  const parPhoto = murSurLesPhotos(a.retours, coins);
  return new Map(a.retours.flatMap((r, k) => { const c = parPhoto[k]; return c ? [[r.rang, c] as [number, P2[]]] : []; }));
}

/** Ce que l'audit garde de l'enchainement : le releve du mur (ou rien), la photo qui le porte, le bilan du redressement, les photos redressees. */
interface SortieAudit {
  mesure: (ReleveDeLaSerie & { rangReleve: number }) | null;
  redressement: BilanRedressement;
  redressees: PhotoRedresseeDeLAudit[];
  /** L'image du run de Claude : la photo du releve redressee jusqu'au haut de la facade (lot F7), null sans releve. */
  imageRun: ImageDuRun | null;
  /** L'assemblage de deux photos ou plus et le mur pose dessus : ce que montre « Ajuster l'égout et le sol » ; null avec une photo. */
  assemblage: AssemblageAAjuster | null;
}

/** Ce que le rejeu tire de la reponse de Claude (mode « IA »). */
interface IaDuRejeu {
  run: RunEnregistre;
  /** La reponse lue (la passe, ou le vote de trois) ; null : aucune passe lisible. */
  reponse: ObservationsFacade | null;
  /** E4 : la pose de ses deux angles sur l'assemblage (pixels), et son ecart a la pose retenue, en part de la largeur. */
  pose: RectIa | null;
  ecart: number | null;
  /** E7 : ses boites accordees avec la detection. */
  accord: AccordIa | null;
}

/** Les sorties des etapes : chacune ne lit que celles d'avant. */
interface SortiesFacade {
  /** E0 : le rapport hauteur sur largeur du plan, et les pointes que le gabarit attend (au-dessus de l'egout). */
  preparation: { rapport: number; pointes: { u: number; v: number }[] } | null;
  /** E2 : chaque photo redressee entiere (null : elle ne se redresse pas). Mode `assemblage` seulement. */
  vues: (RedressementFuites | null)[] | null;
  /** E3 : l'assemblage des vues. Mode `assemblage` seulement. */
  mosaique: ResultatMosaique | null;
  /** E4 : le mur cherche sur l'assemblage (et reporte sur chaque photo). Mode `assemblage` seulement. */
  serie: CoinsDeSerie | null;
  /**
   * E4 : les coins retenus sur chaque photo et leur origine, ce qui doute, le mur pose sur l'assemblage pris pour la suite, et ce que
   * ce mur explique de la photo sans le toit (calageAncres.ts).
   */
  calage: { photos: { coins: P2[]; origine: OrigineCoins | null }[]; message: string | null; pose: AssemblageDuMur | null; explication?: Explication } | null;
  /** E5 : le haut du mur lu sur l'image, en pixels de l'assemblage pris, et sa forme. */
  silhouette: { points: P2[]; forme: 'droite' | 'pignon' | 'rampe' } | null;
  /**
   * E5 : le haut lu ramene au mur (u de 0 a 1, v en hauteurs d'egout), que le diagnostic compare au gabarit ; E5 bis : le diagnostic
   * de forme, corps par corps (propositions de toit, alertes de hauteur).
   */
  forme: { lue: { u: number; v: number }[] | null; diagnostic: DiagnosticForme | null } | null;
  /** E6, E7 : l'analyse du mur. */
  analyse: AnalyseDuMur | null;
  /** E6 : la texture sans les ombres de la photo (`illustrer`). */
  sansOmbres: Image | null;
  /** E4, E5, E7 : ce que la reponse de Claude donne au rejeu (mode « IA ») ; null en mode deterministe. */
  ia: IaDuRejeu | null;
  /** E2 a E7 du mode `audit` : ce que la chaine de l'audit a rendu, et le releve du mur qui en sort. */
  audit: SortieAudit | null;
  /** E9 : le bilan de la facade, la Facade que la validation V4 ecrira (lot F5). */
  facade: BilanFacade | null;
}

/** Une etape calculee : son etat, ce qu'elle a donne en une phrase, et sa mesure contre la verite quand le cas en a une. */
export interface EtapeCalculee {
  id: IdEtape;
  etat: EtatAffiche;
  resume: string;
  verite: { texte: string; juste: boolean } | null;
}

/** Un rejeu : l'etat de chaque etape, leurs sorties, et les versions qui les ont donnees (§7.2). */
export interface Enchainement {
  etapes: EtapeCalculee[];
  sorties: SortiesFacade;
  versions: { chaine: number; objectifs: string; ia?: string };
}

const SORTIES_VIDES: SortiesFacade = { preparation: null, vues: null, mosaique: null, serie: null, calage: null, silhouette: null, forme: null, analyse: null, sansOmbres: null, ia: null, audit: null, facade: null };

interface Contexte { e: EntreesFacade; o: OptionsEnchainement; obj: Objectifs; s: SortiesFacade }
type Pas = (c: Contexte) => Promise<Omit<EtapeCalculee, 'id'>> | Omit<EtapeCalculee, 'id'>;

const pc = (x: number) => String(Math.round(x * 1000) / 10).replace('.', ',') + ' %';
const dec = (x: number, n = 2) => String(Math.round(x * 10 ** n) / 10 ** n).replace('.', ',');
const sans = (resume: string): Omit<EtapeCalculee, 'id'> => ({ etat: 'saute', resume, verite: null });
const attend = (quoi: string): Omit<EtapeCalculee, 'id'> => ({ etat: 'a-venir', resume: 'Attend ' + quoi + '.', verite: null });

/** Le mur pose (haut gauche, haut droit, bas droit, bas gauche) ramene a ses bouts, son egout et son sol. */
function rectDeLaPose(coins: readonly P2[]): { x0: number; x1: number; y0: number; y1: number } {
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  return { x0: (hg.x + bg.x) / 2, x1: (hd.x + bd.x) / 2, y0: (hg.y + hd.y) / 2, y1: (bd.y + bg.y) / 2 };
}

const preparation: Pas = ({ e, s }) => {
  const rapport = e.hauteurM / e.largeurM, pointes = pointesDuGabarit(e.gabarit);
  s.preparation = { rapport, pointes };
  const forme = e.gabarit.length <= 2 ? 'un rectangle (aucun corps lu)' : pointes.length ? `${pointes.length} pointe${pointes.length > 1 ? 's' : ''} (u ${pointes.map((p) => dec(p.u)).join(', ')}, à ${pointes.map((p) => dec(p.v, 1)).join(', ')} fois l’égout)` : 'un haut sans pointe';
  return { etat: 'ok', resume: `Mur de ${dec(e.largeurM)} × ${dec(e.hauteurM)} m (rapport ${dec(rapport, 3)}), gabarit : ${forme}.`, verite: null };
};

const prises: Pas = ({ e, o, obj }) => {
  // Dans l'audit, une photo illisible a bien ete prise : son echec se dit au redressement.
  const n = o.image === 'audit' && o.audit ? o.audit.photos.length + o.audit.illisibles.length : e.photos.length;
  return n >= obj['facades.enchainement.photosMin']
    ? { etat: 'ok', resume: `${n} photo${n > 1 ? 's' : ''} du mur.`, verite: null }
    : { etat: 'echec', resume: 'Aucune photo : prenez ou choisissez une photo du mur entier.', verite: null };
};

/** L'etat d'une part : objectif atteint, en partie, ou rien. */
const selonLaPart = (fait: number, total: number, objectif: number): EtatAffiche => (total > 0 && fait / total >= objectif ? 'ok' : fait > 0 ? 'a-confirmer' : 'echec');

const redressement: Pas = async (c) => {
  const { e, o, s, obj } = c;
  if (o.image === 'audit') return redressementDeLAudit(c);
  if (!e.photos.length) return attend('une photo');
  if (o.image === 'chaine') {
    // La chaine redresse, assemble et analyse en un appel (analyserLeMur) : E2 a E4 se lisent sur ce qu'elle rend.
    s.analyse = analyserLeMurDuCas(e, null, !!o.premiereSeule);
    const vues = s.analyse?.assemblage?.vues ?? [];
    const non = vues.filter((v) => v.motif === MOTIF_NON_REDRESSEE).length;
    if (!vues.length) return { etat: s.analyse ? 'saute' : 'echec', resume: s.analyse ? 'Les photos sont redressées par leurs coins, sans assemblage.' : 'Rien ne se redresse.', verite: null };
    return { etat: selonLaPart(vues.length - non, vues.length, obj['facades.enchainement.redresseesMinPart']), resume: `${vues.length - non} photo${vues.length - non > 1 ? 's' : ''} redressée${vues.length - non > 1 ? 's' : ''} sur ${vues.length}.`, verite: null };
  }
  s.vues = vuesDeFace(e.photos.map((p) => p.image), e.photos.map((p) => p.reperes));
  const n = s.vues.filter(Boolean).length, total = s.vues.length;
  const lesquelles = s.vues.map((v, k) => (v ? null : k + 1)).filter((k): k is number => k !== null);
  return { etat: selonLaPart(n, total, obj['facades.enchainement.redresseesMinPart']), resume: `${n} photo${n > 1 ? 's' : ''} redressée${n > 1 ? 's' : ''} entière${n > 1 ? 's' : ''} sur ${total}` + (lesquelles.length ? ` ; la photo ${lesquelles.join(', ')} ne se redresse pas : posez quatre repères.` : '.'), verite: null };
};

const MOTIF_NON_REDRESSEE = 'pas assez de verticales pour redresser la photo';

// ------------------------------------------------------------------------------------------------
// Le mode `audit` (lot F3) : la chaine de l'audit, telle qu'elle a toujours mesure ses facades
// ------------------------------------------------------------------------------------------------

const virgule = (v: number) => String(v).replace('.', ',');

/** « Photo 2 : redressée automatiquement (verticales à 0,2°) », ou son motif d'echec. */
function textePhoto(p: BilanPhotoRedressement): string {
  const nom = 'Photo ' + (p.rang + 1) + ' : ';
  if (p.statut === 'echec') return nom + 'échec, ' + (p.motif ?? 'redressement impossible') + ' (la photo est gardée)';
  const verticales = p.verticaliteDeg === null ? '' : ' (verticales à ' + virgule(p.verticaliteDeg) + '°)';
  if (p.statut === 'manuelle') return nom + 'redressée avec vos points' + verticales;
  return nom + 'redressée automatiquement' + (p.coins === 'predit' ? ', coins calculés' : '') + verticales;
}

/**
 * Chaque photo redressee seule, **entiere** : tournee de face par le rectangle du mur que la chaine a retenu (ses coins, lus ou poses),
 * sans etre coupee a ce mur ni mise a son echelle (redresserParReperes). Sur l'image que la chaine a lue (corrigee de la distorsion
 * du grand-angle s'il y a lieu). Une photo sans essai n'en a pas.
 */
function photosRedressees(c: ResultatChaine, jpeg: (img: Image) => string): PhotoRedresseeDeLAudit[] {
  const out: PhotoRedresseeDeLAudit[] = [];
  for (const x of c.faits) {
    const m = x.essai?.p.morceau;
    if (!m) continue;
    const r = redresserParReperes(m.prise.photo.image, m.coins, m.prise.photo.focalePx);
    if (r) out.push({ rang: x.bilan.rang, image: jpeg(r.image) });
  }
  return out.sort((a, b) => a.rang - b.rang);
}

/**
 * L'image du run de Claude dans l'audit (lot F7) : la photo qui porte le releve, redressee dans le plan du mur du sol jusqu'au haut de
 * la facade (le gabarit, le faitage des corps), pour que Claude y lise les pointes, la forme et les elements du toit.
 */
function imageRunDeLAudit(e: EntreesFacade, a: PrisesAudit, retenue: NonNullable<ReturnType<typeof analyseRetenue>>): ImageDuRun | null {
  const ref = a.photos.find((p) => p.rang === retenue.rang)?.image;
  const m = retenue.morceaux.find((x) => x.prise.photo.image === ref) ?? retenue.morceaux[0];
  if (!m) return null;
  const H = retenue.a.r.hauteur;
  const faitages = (e.toit?.corps ?? []).map((c) => c.faitage);
  const hautV = Math.max(1, ...(e.gabarit ?? []).map((p) => p.v));
  return imageDuRunAvecLaBande(m, a.facade.largeur, H, hautDeLImage(H, hautV, faitages.length ? Math.max(...faitages) : null), a.jpeg);
}

/**
 * L'assemblage que la chaine a pris pour la suite, quand deux photos ou plus y sont : le mur s'ajuste a la main sur lui, et non sur
 * une photo seule (CLAUDE.md, « Silhouette d'une façade »). Une photo que la chaine a lue corrigee de la distorsion du grand-angle n'y
 * revient pas : ses coins seraient dans l'image corrigee, la correction les lirait sur la photo d'origine.
 */
function assemblageAAjusterDeLAudit(c: ResultatChaine, a: PrisesAudit, retenue: NonNullable<ReturnType<typeof analyseRetenue>>): AssemblageAAjuster | null {
  const asm = retenue.a.assemblage;
  if (retenue.assemblage !== 'vues' || !asm) return null;
  const retours = retenue.morceaux.flatMap((m, k) => {
    const r = asm.retours[k], rang = c.faits.find((x) => x.essai?.p.morceau === m)?.bilan.rang;
    const brute = rang === undefined ? undefined : a.photos.find((p) => p.rang === rang)?.image;
    return r && rang !== undefined && brute === m.prise.photo.image ? [{ ...r, rang }] : [];
  });
  return retours.length >= 2 ? { url: a.jpeg(asm.image), largeur: asm.image.largeur, hauteur: asm.image.hauteur, coins: asm.coins.map((p) => ({ x: p.x, y: p.y })), retours } : null;
}

/** L'analyse que la chaine a retenue (la fusion, sinon la photo seule), ses morceaux, la photo qui porte le releve. */
function analyseRetenue(c: ResultatChaine): { a: NonNullable<ResultatChaine['seule']>['a']; morceaux: Morceau[]; rang: number; assemblage: 'morceaux' | 'vues' } | null {
  if (c.fusion) return { a: c.fusion.a, morceaux: c.fusion.morceaux, rang: c.fusion.rangReference, assemblage: 'vues' };
  const essai = c.seule?.photo.essai;
  return c.seule && essai ? { a: c.seule.a, morceaux: [essai.p.morceau], rang: c.seule.photo.bilan.rang, assemblage: 'morceaux' } : null;
}

/**
 * E2 de l'audit : la chaine de l'audit redresse chaque photo (coins poses au doigt, sinon trouves sur les aretes, sinon reportes,
 * sinon predits par la prise de vue), reporte le mur, assemble et analyse en un appel. Le releve du mur s'ecrit ici, sur l'analyse
 * qu'elle a retenue ; les etapes suivantes se lisent sur ce qu'elle a rendu.
 */
async function redressementDeLAudit({ e, o, s, obj }: Contexte): Promise<Omit<EtapeCalculee, 'id'>> {
  const a = o.audit;
  if (!a) throw new Error('Le mode audit demande les photos de l’audit (audit).');
  const chercher = o.chercherCoins;
  if (!chercher) throw new Error('Le mode audit demande le calage fin (chercherCoins).');
  const c = await redresserEtFusionner(a.photos, a.facade, { pts: [...a.contour] }, { chercherCoins: chercher, gabarit: e.gabarit }, a.corrections, a.illisibles);
  const retenue = analyseRetenue(c);
  // L'assemblage s'encode d'abord : les photos redressees puis l'image du run restent encodees dans l'ordre d'avant.
  const assemblage = retenue ? assemblageAAjusterDeLAudit(c, a, retenue) : null;
  s.audit = {
    mesure: retenue ? { ...releveDeLaSerie(retenue.a, retenue.morceaux, a.facade, a.jpeg, retenue.assemblage), rangReleve: retenue.rang } : null,
    redressement: c.redressement, redressees: photosRedressees(c, a.jpeg),
    imageRun: retenue ? imageRunDeLAudit(e, a, retenue) : null,
    assemblage,
  };
  if (retenue) {
    const { r, fusion } = retenue.a;
    s.analyse = { elevation: r.elevation, pxParM: r.pxParM, texture: r.texture, hauteurTexture: r.hauteurTexture, profilToit: r.profilToit ?? null, toitEstime: r.toitEstime, ouvertures: r.ouvertures, devinees: r.devinees, fusion: fusion ? resumeFusion(fusion) : null, assemblage: retenue.a.assemblage ?? null };
  }
  const photos = c.redressement.photos, faites = photos.filter((p) => p.statut !== 'echec').length;
  if (!photos.length) return attend('une photo');
  const echecs = photos.filter((p) => p.statut === 'echec');
  const etat = selonLaPart(faites, photos.length, obj['facades.enchainement.redresseesMinPart']);
  return { etat, resume: `${faites} photo${faites > 1 ? 's' : ''} redressée${faites > 1 ? 's' : ''} sur ${photos.length}` + (echecs.length ? ' : ' + echecs.map(textePhoto).join(' ; ') + '. Posez quatre repères sur la photo qui ne se redresse pas.' : ' : ' + photos.map(textePhoto).join(' ; ') + '.'), verite: null };
}

/** E3 de l'audit : les photos redressees assemblees (ou fusionnees), partiellement, ou chacune seule ; une photo seule n'a rien a assembler. */
function assemblageDeLAudit(b: BilanRedressement, obj: Objectifs): Omit<EtapeCalculee, 'id'> {
  const rangs = (l: readonly number[]) => l.map((r) => r + 1).join(', ');
  const motif = b.motifFusion ? ' (' + b.motifFusion + ')' : '';
  const reprendre = ' Reprenez la façade avec des chevauchements entre les photos : un tiers de mur en commun.';
  const n = b.photos.length;
  if (b.fusion === 'fusionnee') return { etat: 'ok', resume: `Fusionnée : ${b.fusionnees.length} photos assemblées en une image.`, verite: null };
  if (b.fusion === 'partielle') {
    const seules = b.photos.filter((p) => !b.fusionnees.includes(p.rang)).map((p) => p.rang);
    return { etat: selonLaPart(b.fusionnees.length, n, obj['facades.enchainement.assembleesMinPart']), resume: `Fusion partielle : photos ${rangs(b.fusionnees)} assemblées, ${seules.length > 1 ? 'photos' : 'photo'} ${rangs(seules)} hors de l’assemblage${motif}.` + reprendre, verite: null };
  }
  if (b.fusion === 'independantes') return { etat: 'echec', resume: `Photos indépendantes : aucune fusion${motif}.` + reprendre, verite: null };
  if (n > 1) return { etat: b.photos.some((p) => p.statut !== 'echec') ? 'a-confirmer' : 'echec', resume: `Photos redressées seules${motif}.` + reprendre, verite: null };
  return sans('Une photo seule : rien à assembler.');
}

/** E4 de l'audit : d'ou viennent les coins du mur retenus (poses a la main, trouves sur la photo, sinon predits par la prise de vue). */
function calageDeLAudit({ e, s, obj }: Contexte): Omit<EtapeCalculee, 'id'> {
  const m = s.audit?.mesure, b = s.audit?.redressement;
  if (!m || !b) return { etat: 'echec', resume: 'La photo ne montre pas le mur : coins introuvables. Posez quatre repères sur une photo, puis rejouez.', verite: null };
  const pose = s.analyse?.assemblage ?? null;
  s.calage = { photos: [], message: null, pose };
  const main = b.photos.some((p) => p.coins === 'main' || p.statut === 'manuelle');
  const note = m.confiance !== null ? ` (note du calage fin ${dec(m.confiance)})` : '';
  const origine = main ? 'Mur posé à la main.' : m.coinsTrouves ? `Coins du mur trouvés sur la photo${note}.` : 'Coins du mur prédits par la prise de vue, à vérifier : posez quatre repères, ou tirez les angles, l’égout et le sol.';
  const hauteur = m.hauteurM !== null ? ` Hauteur à l’égout mesurée : ${dec(m.hauteurM)} m.` : '';
  // Sur l'assemblage de plusieurs vues, la pose se juge comme ailleurs : ce qu'elle explique de l'image sans le toit (calageAncres.ts).
  if (pose) {
    const ex = explicationDe(pose, e), passe = expliqueLaPhoto(ex, seuilsDuCalage(obj));
    s.calage.explication = ex;
    const etat: EtatAffiche = main ? 'ok' : !m.coinsTrouves || !passe ? 'a-confirmer' : 'ok';
    return { etat, resume: origine + hauteur + ` Sur l’assemblage : ${px(rectDeLaPose(pose.coins))}, ` + (passe ? `expliqué sans le toit (score ${sc(ex.score)}).` : `qui n’explique pas la photo sans le toit (score ${sc(ex.score)}, angles ${sc(ex.angles[0])} et ${sc(ex.angles[1])}) : à confirmer.`), verite: null };
  }
  return { etat: main || m.coinsTrouves ? 'ok' : 'a-confirmer', resume: origine + hauteur, verite: null };
}

/** E5 de l'audit : la ligne du haut du mur lue sur la photo (jamais le gabarit) ; hors cadre, la suite garde le gabarit. */
function silhouetteDeLAudit(s: SortiesFacade): Omit<EtapeCalculee, 'id'> {
  const m = s.audit?.mesure;
  if (!m) return attend('le mur posé (É4)');
  s.forme = { lue: m.hautLu, diagnostic: null };
  if (m.silhouette === 'indetermine') return { etat: 'a-confirmer', resume: 'Le haut du mur ne se lit pas sur la photo (hors cadre) : la suite garde le gabarit du plan.', verite: null };
  return { etat: 'ok', resume: `Le haut lu sur la photo : ${libelleSilhouette(m.silhouette)}.`, verite: null };
}

const assemblage: Pas = ({ e, o, s, obj }) => {
  if (o.image === 'audit') return s.audit ? assemblageDeLAudit(s.audit.redressement, obj) : attend('une photo redressée');
  if (o.image === 'chaine') {
    const vues = s.analyse?.assemblage?.vues;
    if (!vues) return sans('Pas d’assemblage : le mur est lu par la fusion des photos entre leurs coins.');
    return etatDesVues(vues, obj);
  }
  if (!s.vues?.some(Boolean)) return attend('une photo redressée');
  s.mosaique = mosaiqueDeLaSerie(s.vues);
  if (!s.mosaique) return { etat: 'echec', resume: 'Les vues ne s’assemblent pas.', verite: null };
  const motif = new Map(s.mosaique.groupes.aPart.map((a) => [a.vue, a.motif]));
  const rangs = s.vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  // Les rangs de la mosaique sont ceux des vues redressees : une photo non redressee n'y entre pas.
  return etatDesVues(e.photos.map((_, i) => { const k = rangs.indexOf(i); return k < 0 ? { assemblee: false, motif: MOTIF_NON_REDRESSEE } : motif.has(k) ? { assemblee: false, motif: motif.get(k) ?? null } : { assemblee: true, motif: null }; }), obj);
};

function etatDesVues(vues: readonly { assemblee: boolean; motif: string | null }[], obj: Objectifs): Omit<EtapeCalculee, 'id'> {
  const n = vues.filter((v) => v.assemblee).length;
  const k = vues.findIndex((v) => !v.assemblee);
  const resume = `${n} vue${n > 1 ? 's' : ''} assemblée${n > 1 ? 's' : ''} sur ${vues.length}` + (k >= 0 ? ` ; la photo ${k + 1} reste hors de l’assemblage : ${vues[k]?.motif ?? 'elle ne se recale sur aucune autre'}. Prenez-en une autre en gardant un tiers de mur en commun.` : '.');
  return { etat: selonLaPart(n, vues.length, obj['facades.enchainement.assembleesMinPart']), resume, verite: null };
}

/** Le mur sur l'assemblage pris pour la suite : les coins de la premiere photo assemblee qui en a, ramenes dessus ; sinon le mur cherche. */
function poseSurLAssemblage(sr: CoinsDeSerie, photos: readonly { coins: readonly P2[] }[]): AssemblageDuMur {
  const { image, vu, places, mur } = sr.assemblage;
  let coins: P2[] | null = null;
  for (let i = 0; i < sr.vues.length && !coins; i++) {
    const v = sr.vues[i], place = places[i], c = photos[i]?.coins, inv = v ? inverser(v.versPhoto) : null;
    if (v && place && inv && c?.length === 4) coins = c.map((q) => appliquerSimilitude(place, appliquer(inv, q)));
  }
  const motif = new Map(sr.aPart.map((x) => [x.vue, x.motif]));
  return {
    image, vu, coins: coins ?? [{ x: mur.x0, y: mur.y0 }, { x: mur.x1, y: mur.y0 }, { x: mur.x1, y: mur.y1 }, { x: mur.x0, y: mur.y1 }],
    vues: sr.vues.map((_, i) => (motif.has(i) ? { assemblee: false, motif: motif.get(i) ?? null } : { assemblee: true, motif: null })),
    retours: retoursDeLaSerie(sr),
  };
}

/**
 * Les coins du mur sur chaque photo, par la chaine de l'audit et du releve (releve/chaine.ts) : un mur pose a la main est garde et se
 * reporte, les autres sont trouves sur les aretes ou lus sur l'assemblage des vues, sinon devines. Une photo n'a ni GPS ni boussole :
 * son champ vient de l'EXIF, sinon de ses points de fuite.
 */
async function chercherLesCoins(e: EntreesFacade, o: OptionsEnchainement): Promise<NonNullable<SortiesFacade['calage']>> {
  const L = e.largeurM, H = e.hauteurM;
  const f: Facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
  const entrees = e.photos.map((p, k) => ({ rang: k, image: p.image, prise: priseSansCapteurs(p.image, p.focalePx), champConnu: p.focalePx != null }));
  const corrections: Record<string, CorrectionRedressement> = {};
  e.photos.forEach((p, k) => { if (p.reperes || p.murALaMain) corrections[String(k)] = { ...(p.reperes ? { reperes: p.reperes } : {}), ...(p.murALaMain ? { coins: p.coins } : {}) }; });
  const chercher = o.chercherCoins;
  if (!chercher) throw new Error('Chercher les coins demande le calage fin (chercherCoins).');
  const c = await redresserEtFusionner(entrees, f, { pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }] }, { chercherCoins: chercher, hauteurDuPlan: !!o.hauteurDuPlan, lireSurLAssemblage: true, coinsSeuls: true, gabarit: e.gabarit }, corrections);
  const parRang = new Map(c.redressement.photos.map((b) => [b.rang, b]));
  const photos = e.photos.map((p, k) => {
    const b = parRang.get(k), px = b?.coinsPx;
    const origine: OrigineCoins | null = !b ? null : b.coins === 'main' ? 'main' : p.reperes ? 'reperes' : b.coins === 'trouve' && b.statut !== 'echec' ? 'trouves' : 'devines';
    return { coins: px?.length === 4 && !p.murALaMain ? px : p.coins, origine };
  });
  const doutes = c.redressement.photos.filter((b) => b.statut === 'echec' && b.motif);
  return { photos, message: doutes.length ? doutes.map((b) => 'Photo ' + (b.rang + 1) + ' : ' + b.motif + '.').join(' ') : null, pose: null };
}

/** L'ecart du mur pose au mur vrai, en part de la largeur vraie : chaque bord, et le pire. */
function ecartAuVrai(pose: { x0: number; x1: number; y0: number; y1: number }, vrai: NonNullable<VeriteFacade['calage']>, seuil: number): { texte: string; juste: boolean } {
  const w = vrai.x1 - vrai.x0;
  const bords: [string, number | undefined, number][] = [['bout gauche', vrai.x0, pose.x0], ['bout droit', vrai.x1, pose.x1], ['égout', vrai.egout, pose.y0], ['sol', vrai.sol, pose.y1]];
  const ecarts = bords.filter((b): b is [string, number, number] => b[1] !== undefined).map(([nom, v, p]) => ({ nom, e: Math.abs(p - v) / w }));
  const pire = Math.max(...ecarts.map((x) => x.e));
  return { texte: `Contre la vérité (mur de ${Math.round(w)} px, x de ${Math.round(vrai.x0)} à ${Math.round(vrai.x1)}) : ` + ecarts.map((x) => x.nom + ' à ' + pc(x.e)).join(', ') + (pire > seuil ? ` : faux (au-delà de ${pc(seuil)}).` : ' : juste.'), juste: pire <= seuil };
}

/** Ce qu'une pose explique de l'image prise pour la suite, sans le toit : le score, et s'il passe le test. */
function explicationDe(pose: AssemblageDuMur, e: EntreesFacade): Explication {
  return expliquer(pose, detecterSegments(pose.image), rectDeLaPose(pose.coins), e.hauteurM / e.largeurM);
}

const sc = (x: number) => dec(x, 2);
const px = (r: { x0: number; x1: number }) => `x de ${Math.round(r.x0)} à ${Math.round(r.x1)} (${Math.round(r.x1 - r.x0)} px)`;

/**
 * Ce que l'arbitre du calage a retenu (§5), en une phrase, et l'etat qu'il donne a l'E4 : la pose des aretes qui explique la photo
 * (l'etat suit alors ce qui a ete lu ou suppose), une autre qui l'explique mieux (les deux chemins divergent : a confirmer), ou aucune
 * (la pose du plan seul, supposee : echec, la personne pose les angles).
 */
function arbitrage(mur: MurCale): { etat: EtatAffiche | null; texte: string } {
  const c = mur.calage, ex = c.explication;
  const seuil = `seuil ${sc(c.seuils.score)}, angles ${sc(c.seuils.angle)}`;
  if (c.retenue === 'plan-seul') return { etat: 'echec', texte: `Aucune pose n’explique la photo sans le toit (${seuil})` + (c.aretes ? ` : celle des arêtes, ${px(c.aretes)}, n’a que ${sc(c.aretes.score)}` : '') + `. Le mur est supposé : la pose du plan seul, centrée, ${px(mur)}. Posez les deux angles, l’égout et le sol.` };
  if (c.retenue === 'mieux-expliquee' && c.aretes) {
    const w = mur.x1 - mur.x0, ecart = Math.max(Math.abs(c.aretes.x0 - mur.x0), Math.abs(c.aretes.x1 - mur.x1)) / w;
    return { etat: 'a-confirmer', texte: `La pose des arêtes, ${px(c.aretes)}, n’explique pas la photo sans le toit (score ${sc(c.aretes.score)} ; ${seuil}) ; retenue : celle qui l’explique, ${px(mur)}, score ${sc(ex.score)}, ses bouts à ${pc(ecart)} de la largeur des premiers : à confirmer.` };
  }
  return { etat: null, texte: `Mur cherché sur l’assemblage : ${px(mur)}, expliqué sans le toit (score ${sc(ex.score)}, angles ${sc(ex.angles[0])} et ${sc(ex.angles[1])})` };
}

const calage: Pas = async (c) => {
  const { e, o, s, obj } = c;
  if (o.image === 'audit') return calageDeLAudit(c);
  if (!e.photos.length) return attend('une photo');
  const seuils = seuilsDuCalage(obj);
  if (o.image === 'chaine') {
    const pose = s.analyse?.assemblage ?? null;
    s.calage = { photos: e.photos.map((p) => ({ coins: p.coins, origine: p.murALaMain ? 'main' : null })), message: null, pose };
    if (!pose) return sans('Le mur est posé par les coins du cas sur chaque photo, sans assemblage.');
    const r = rectDeLaPose(pose.coins), ex = explicationDe(pose, e), passe = expliqueLaPhoto(ex, seuils);
    s.calage.explication = ex;
    return { etat: passe ? 'ok' : 'a-confirmer', resume: `Mur posé par les coins du cas : ${px(r)} sur l’assemblage ; ` + (passe ? `il explique la photo sans le toit (score ${sc(ex.score)}).` : `il n’explique pas la photo sans le toit (score ${sc(ex.score)}, angles ${sc(ex.angles[0])} et ${sc(ex.angles[1])}) : à confirmer.`), verite: o.verite?.calage ? ecartAuVrai(r, o.verite.calage, obj['facades.enchainement.calageEcartMaxPart']) : null };
  }
  // Le mode « IA » : les deux angles de Claude, ramenes sur cet assemblage, sont une pose candidate de plus pour l'arbitre.
  // Le moteur decide des observations de Claude (facade/regles/facades/ia.ts) : sa pose candidate, et ses zones de colombage, ou une
  // pose des aretes qui tient dedans suit les bois, pas les angles du mur. L'arbitre lit ces decisions, pas la reponse.
  const reponse = o.ia ? observationsDuRun(o.ia) : null;
  const poseIa = reponse && s.mosaique ? poseDeLIa(reponse, s.mosaique.image) : null;
  const colombage = reponse && poseIa && s.mosaique ? decisionColombage(reponse, poseIa, s.mosaique.image) : null;
  s.serie = s.vues && s.mosaique ? murDeLaSerie(s.vues, s.mosaique, e.largeurM, e.hauteurM, seuils, poseIa ? { ...poseIa, egout: true, pied: true, cotes: true } : null, colombage) : null;
  s.calage = o.coins === 'chercher' ? await chercherLesCoins(e, o) : { photos: e.photos.map((p) => ({ coins: p.coins, origine: p.murALaMain ? 'main' : p.reperes ? 'reperes' : null })), message: null, pose: null };
  s.calage.pose = s.serie ? poseSurLAssemblage(s.serie, s.calage.photos) : null;
  const mur = s.serie?.assemblage.mur;
  if (!mur || !s.calage.pose) return { etat: 'echec', resume: 'Aucun mur sur l’assemblage : posez quatre repères, puis rejouez.' + (s.calage.message ? ' ' + s.calage.message : ''), verite: null };
  const r = rectDeLaPose(s.calage.pose.coins);
  const ex = explicationDe(s.calage.pose, e);
  s.calage.explication = ex;
  const a = arbitrage(mur);
  const supposes = [mur.egout ? '' : 'l’égout', mur.pied ? '' : 'le sol', mur.cotes ? '' : 'les bouts'].filter(Boolean);
  const devines = s.calage.photos.map((p, k) => (p.origine === 'devines' ? k + 1 : 0)).filter(Boolean);
  // Un mur pose a la main l'emporte : ce que la recherche en dit reste ecrit, il ne se discute pas. Les coins gardes d'un cas (un
  // rejeu, §9 bis interpretation 5) se jugent comme une pose : s'ils n'expliquent pas la photo, l'etape est a confirmer.
  const main = s.calage.photos.some((p) => p.origine === 'main');
  const retenueExplique = expliqueLaPhoto(ex, seuils);
  const resume = (main ? 'Mur posé à la main. ' : '') + a.texte + (a.etat === null ? (supposes.length ? `, ${supposes.join(', ')} supposé${supposes.length > 1 ? 's' : ''}` : ', égout, sol et bouts trouvés') + '.' : '')
    + ` Mur retenu : ${px(r)}, score ${sc(ex.score)}` + (retenueExplique ? '.' : ' : il n’explique pas la photo sans le toit.') + (devines.length ? ` Coins devinés sur la photo ${devines.join(', ')}, à vérifier.` : '') + (s.calage.message ? ' ' + s.calage.message : '');
  const auMieux: EtatAffiche = a.etat ?? (supposes.length || devines.length || !retenueExplique ? 'a-confirmer' : 'ok');
  // Les deux chemins divergent (la pose de Claude a plus de l'ecart admis de la pose retenue) : la personne confirme (§5, point 3).
  const ia = o.ia ? avisDeLIa(o.ia, reponse, poseIa, r, mur, s.preparation?.pointes ?? [], obj['facades.enchainement.calageEcartMaxPart']) : null;
  s.ia = ia?.sortie ?? null;
  const etat: EtatAffiche = main ? 'ok' : (auMieux === 'ok' && !retenueExplique) || (auMieux === 'ok' && ia?.diverge) ? 'a-confirmer' : auMieux;
  return { etat, resume: resume + (ia ? ' ' + ia.texte : ''), verite: o.verite?.calage ? ecartAuVrai(r, o.verite.calage, obj['facades.enchainement.calageEcartMaxPart']) : null };
};

const pluriel = (n: number, s: string, p = s + 's') => n + ' ' + (n > 1 ? p : s);

/** L'appel de Claude en quelques mots : quand, combien de passes, les versions, ce qu'il a coute. */
export function enteteDuRun(run: RunEnregistre): string {
  const cout = (c: number | null) => (c === null ? 'coût inconnu' : dec(c, 4) + ' $');
  const passes = run.passes === 1 ? 'une passe' : (run.passes === 2 ? 'deux' : 'trois') + ' passes votées';
  const esc = run.escalade ? `, escaladée (${run.escalade.modele}, ${cout(run.escalade.cout)})` : '';
  return `${run.synthetique ? 'réponse synthétique (pas de Claude)' : 'Claude'}, ${run.le.slice(0, 10)}, ${passes}, ${run.modele}, prompt v${run.prompt}, schéma v${run.schema}, ${cout(run.cout)}${esc}`;
}

/** Ce que la regle des pointes decide, en clair : une pointe en plus ou en moins (un diagnostic de toit, F4), une hauteur signalee. */
function pointesDeLIa(obs: ObservationsFacade, attendues: readonly { u: number; v: number }[]): string {
  const avis = avisDesPointes(obs, attendues);
  if (!avis.length) return '';
  const dits = avis.flatMap((a) => (a.avis === 'en-plus' ? [`une pointe à u ${dec(a.u)} que le plan n’a pas`]
    : a.avis === 'manquante' ? [`la pointe que le plan attend à u ${dec(a.u)} n’est pas vue`]
      : a.avis === 'hauteur' ? [`la pointe à u ${dec(a.u)} vue à ${dec(a.vue ?? 0, 1)} fois l’égout, le plan la met à ${dec(a.attendue ?? 0, 1)} : la hauteur du LiDAR est gardée`] : []));
  const vues = obs.calage.pointes.length;
  return ` ${pluriel(vues, 'pointe vue', 'pointes vues')}` + (dits.length ? ' : ' + dits.join(' ; ') + '.' : ', aux places du plan.');
}

/**
 * Ce que la reponse de Claude dit du calage (E4) : sa pose contre la pose retenue (accord sous l'ecart admis, sinon divergence), ce
 * que l'arbitre en a fait, et ses pointes contre le gabarit.
 */
function avisDeLIa(run: RunEnregistre, reponse: ObservationsFacade | null, pose: RectIa | null, retenue: RectIa, mur: MurCale, attendues: readonly { u: number; v: number }[], seuil: number): { sortie: IaDuRejeu; texte: string; diverge: boolean } {
  const ecart = pose ? ecartDesPoses(pose, retenue) : null;
  const sortie: IaDuRejeu = { run, reponse, pose, ecart, accord: null };
  const tete = `IA (${enteteDuRun(run)}) : `;
  if (!reponse) return { sortie, texte: tete + 'aucune passe lisible.', diverge: false };
  const pointes = pointesDeLIa(reponse, attendues) + escaladeDeLIa(reponse);
  if (!pose || ecart === null) return { sortie, texte: tete + 'Claude ne situe pas les deux angles du mur.' + pointes, diverge: false };
  const diverge = ecart > seuil;
  const retenueIa = mur.calage.ia?.retenue ? ' ; l’arbitre retient sa pose' : '';
  return { sortie, diverge, texte: tete + `ses angles posent le mur ${px(pose)}, à ${pc(ecart)} de la largeur du mur retenu : ` + (diverge ? 'les deux chemins divergent, à confirmer' : 'accord') + retenueIa + '.' + pointes + surfaceDeLIa(reponse, mur) };
}

/** Ce que l'escalade a tranche contre le vote des passes (la regle de l'escalade, facade/regles/facades/ia.ts), en clair. */
function escaladeDeLIa(r: ObservationsFacade): string {
  if (!r.escalade) return '';
  const t = r.escalade.tranche;
  return ` Escalade (${r.escalade.modele}) : ` + (t.length ? `elle l’emporte sur ${t.join(', ')}.` : 'elle s’accorde avec le vote des passes.');
}

/** Le parement que Claude lit, et ce que ses zones de colombage ont ecarte : les poses dont les bouts suivaient les bois. */
function surfaceDeLIa(r: ObservationsFacade, mur: MurCale): string {
  const zones = r.surface.zones.map((z) => `${z.type} de u ${dec(z.u0)} à ${dec(z.u1)}, v ${dec(z.v0, 1)} à ${dec(z.v1, 1)}`);
  const c = mur.calage.colombage;
  const ecartees = c?.ecartees.length ? ` ${pluriel(c.ecartees.length, 'pose des arêtes écartée', 'poses des arêtes écartées')} (${c.ecartees.map((p) => px(p)).join(' ; ')}) : ${c.ecartees.length > 1 ? 'elles tiennent' : 'elle tient'} dans le colombage, ses bouts suivent les bois et non les angles du mur ; la teinte du mur se lit hors du colombage.` : '';
  return ` Parement : ${r.surface.principale}` + (zones.length ? ` ; zones : ${zones.join(', ')}` : '') + '.' + ecartees;
}

const silhouette: Pas = ({ o, s }) => {
  if (o.image === 'audit') return silhouetteDeLAudit(s);
  const pose = s.calage?.pose;
  if (!pose) return attend('le mur posé (É4)');
  const lue = silhouetteLue(pose, rectDeLaPose(pose.coins));
  if (!lue) return { etat: 'a-confirmer', resume: 'Le haut du mur ne se lit pas à la teinte (moins de la moitié des colonnes) : la suite garde le gabarit.', verite: null };
  s.silhouette = { points: lue.silhouette, forme: lue.forme };
  s.forme = { lue: hautEnPartsDuMur(lue.silhouette, rectDeLaPose(pose.coins)), diagnostic: null };
  const mot = { droite: 'une ligne droite', pignon: 'un pignon (une ou plusieurs pointes)', rampe: 'une rampe' }[lue.forme];
  return { etat: 'ok', resume: `Le haut lu sur l’image : ${mot}, ${lue.silhouette.length} sommets.` + formeDeLIa(s.ia?.reponse ?? null), verite: null };
};

const MOTS_ELEMENT = { cheminee: 'une cheminée', lucarne: 'une lucarne' } as const;

/** Ce que Claude lit du haut (E5) : le mot, le bout, les elements du toit, les appentis et les corps qu'il voit. */
function formeDeLIa(r: ObservationsFacade | null): string {
  if (!r) return '';
  const vus = [
    ...r.elements.map((x) => `${MOTS_ELEMENT[x.element]} à u ${dec(x.u)}`),
    ...r.calage.appentis.map((x) => `un appentis de u ${dec(x.debut)} à ${dec(x.fin)}`),
    ...r.calage.corps.map((x) => `un autre volume de u ${dec(x.debut)} à ${dec(x.fin)}`),
  ];
  return ` Claude lit : ${r.forme.silhouette === 'indetermine' ? 'un haut qu’il ne lit pas' : libelleSilhouette(r.forme.silhouette)}, bout ${r.forme.bout}` + (vus.length ? ` ; ${vus.join(', ')}` : '') + '.';
}

/** L'analyse d'un mur depuis ses photos : sur l'assemblage pose (fusion des vues, sinon l'assemblage seul), sinon par analyserLeMur. */
function analyserLeMurDuCas(e: EntreesFacade, pose: AssemblageDuMur | null, premiereSeule: boolean): AnalyseDuMur | null {
  const mur: MurAnalyse = { largeur: e.largeurM, hauteur: e.hauteurM, contour: [{ x: 0, y: 0 }, { x: e.largeurM, y: 0 }, { x: e.largeurM, y: 6 }, { x: 0, y: 6 }], cote: 0, distance: null };
  // Le gabarit pose sur chaque photo par ses coins (sa forme ne bouge pas), un rectangle sans gabarit : il dit le toit d'un pignon.
  const choisies = premiereSeule ? e.photos.slice(0, 1) : e.photos;
  const photos: PhotoDuMur[] = choisies.map((p) => ({ photo: p.image, coins: p.coins, focalePx: p.focalePx, silhouette: gabaritSurLaPhoto(e.gabarit, p.coins), reperes: p.reperes }));
  // Plusieurs vues dans l'assemblage pose : il pose le mur, leur fusion en compose l'image (vote, occultations).
  const fondue = pose ? fondreLesVues(mur, photos, pose, e.gabarit) : null;
  const r0 = fondue ?? (pose ? analyserLAssemblage(mur, pose, e.gabarit) : null);
  if (r0) return { elevation: r0.elevation, pxParM: r0.pxParM, texture: r0.texture, hauteurTexture: r0.hauteurTexture, profilToit: r0.profilToit ?? null, toitEstime: r0.toitEstime, ouvertures: r0.ouvertures, devinees: r0.devinees, fusion: fondue ? resumeFusion(fondue) : null, assemblage: pose };
  const a = analyserLeMur(mur, photos, 'vues');
  if (!a) return null;
  const { r, fusion } = a;
  return { elevation: r.elevation, pxParM: r.pxParM, texture: r.texture, hauteurTexture: r.hauteurTexture, profilToit: r.profilToit ?? null, toitEstime: r.toitEstime, ouvertures: r.ouvertures, devinees: r.devinees, fusion: fusion ? resumeFusion(fusion) : null, assemblage: a.assemblage ?? null };
}

const resumeFusion = (f: ResultatFusion): NonNullable<AnalyseDuMur['fusion']> => ({ statut: f.statut, vues: f.vues, masque: f.masque, reference: f.reference, occlusion: f.occlusion });

const texture: Pas = ({ e, o, s }) => {
  if (!e.photos.length) return attend('une photo');
  if (o.image === 'assemblage') s.analyse = analyserLeMurDuCas(e, s.calage?.pose ?? null, !!o.premiereSeule);
  const a = s.analyse;
  if (!a) return { etat: 'echec', resume: 'Le mur ne se redresse pas : posez quatre repères sur une photo, puis rejouez.', verite: null };
  // Les baies de la detection tiennent lieu de celles du releve, que la 3D met de cote pour lire l'eclairage du mur.
  s.sansOmbres = o.illustrer ? sansOmbres(a.texture, a.pxParM, a.ouvertures, e.hauteurM) : null;
  // Ce que la fusion des vues trouve a redire (une vue a part, une part du mur cachee partout) : la texture est a confirmer.
  const avis = a.fusion ? avisFusion(a.fusion) : null;
  const vues = a.fusion ? `, fusion ${a.fusion.statut === 'fusionnee' ? 'de toutes les vues' : a.fusion.statut === 'partielle' ? 'de quelques vues' : 'impossible'}` : '';
  return { etat: avis ? 'a-confirmer' : 'ok', resume: `Texture de ${dec(a.texture.largeur / a.pxParM)} × ${dec(a.hauteurTexture)} m (le mur et la bande au-dessus de l’égout) à ${Math.round(a.pxParM)} px/m${vues}.` + (avis ? ' ' + avis : ''), verite: null };
};

/** Rappel, precision et cotes (mediane, en cm) d'ouvertures contre la verite. */
function contreLaVerite(vraies: readonly OuvertureVraie[], trouvees: readonly OuvertureDetectee[]): { rappel: number; precision: number; cotes: number | null } {
  const j = juger(vraies, trouvees);
  return { rappel: j.vp / vraies.length, precision: trouvees.length ? j.vp / trouvees.length : 0, cotes: [...j.cotes].sort((x, y) => x - y)[Math.floor(j.cotes.length / 2)] ?? null };
}

const ouvertures: Pas = ({ e, o, s, obj }) => {
  const a = s.analyse;
  if (!a) return attend('le mur redressé (É6)');
  const n = a.ouvertures.length, d = a.devinees.length;
  // Le mode « IA » : les boites de Claude, accordees avec la detection ; une boite seule reste decochee, et l'etape est a confirmer.
  const reponse = s.ia?.reponse ?? null;
  const accord = reponse && s.ia ? accorderOuvertures({ ouvertures: a.ouvertures, decochees: a.devinees, observations: reponse, cartes: cartesAretes(a.elevation, a.pxParM), largeurM: e.largeurM, hauteurM: e.hauteurM }) : null;
  if (s.ia) s.ia = { ...s.ia, accord };
  const ditIa = accord ? ' ' + (texteAccord(accord.bilan) ?? 'Claude ne voit aucune ouverture') + '.' : '';
  const resume = `${n} ouverture${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''}` + (d ? `, ${d} devinée${d > 1 ? 's' : ''} par la structure, à confirmer.` : ', aucune devinée.') + ditIa;
  const etat: EtatAffiche = d || accord?.bilan.seules ? 'a-confirmer' : 'ok';
  const vraies = o.verite?.ouvertures;
  if (!vraies?.length) return { etat, resume, verite: null };
  const m = contreLaVerite(vraies, a.ouvertures);
  const juste = m.rappel >= obj['facades.enchainement.rappelMin'] && m.precision >= obj['facades.enchainement.precisionMin'] && m.cotes !== null && m.cotes <= obj['facades.enchainement.cotesMaxM'] * 100;
  const cotes = (c: number | null) => (c === null ? '—' : dec(c, 1) + ' cm');
  // Les boites de Claude se mesurent aussi : toutes, puis les cochees (celles que la detection retrouve) ; c'est la mesure x1 contre x3.
  const ia = accord ? (() => {
    const toutes = contreLaVerite(vraies, accord.boites.map((b) => ({ ...b.ouverture, confiance: 1 }))), cochees = accord.boites.filter((b) => b.cochee);
    return ` Boîtes de Claude : rappel ${pc(toutes.rappel)}, précision ${pc(toutes.precision)}, cotes ${cotes(toutes.cotes)} ; cochées (${cochees.length}) : précision ${pc(cochees.length ? contreLaVerite(vraies, cochees.map((b) => ({ ...b.ouverture, confiance: 1 }))).precision : 0)}.`;
  })() : '';
  return { etat, resume, verite: { texte: `Contre la vérité (${vraies.length} ouvertures) : rappel ${pc(m.rappel)}, précision ${pc(m.precision)}, cotes ${cotes(m.cotes)} (médiane)` + (juste ? ' : objectifs atteints.' : ' : objectifs non atteints.') + ia, juste } };
};

/** Le mot du haut lu a la teinte (E5 de la calibration) dans le vocabulaire de la Facade. */
const MOT_DU_HAUT: Readonly<Record<NonNullable<SortiesFacade['silhouette']>['forme'], SilhouetteFacade>> = { droite: 'ligne-droite', pignon: 'triangle', rampe: 'rampe' };

/**
 * E9, la validation (lot F5) : le bilan de la facade, la Facade que la validation V4 ecrira (ses dimensions, sa forme, la pose de sa
 * texture, ses ouvertures avec leur identifiant). Dans l'audit, elle attend la personne (V4) ; la calibration montre le bilan sans
 * rien ecrire : la facade se valide dans l'audit.
 */
const validation: Pas = ({ e, o, s }) => {
  const base = { largeurM: e.largeurM, hauteurM: e.hauteurM, gabarit: e.gabarit, diagnostic: s.forme?.diagnostic ?? null, hautLu: s.forme?.lue ?? null };
  if (o.image === 'audit') {
    const m = s.audit?.mesure;
    if (!m) return attend('le relevé du mur (É6, É7)');
    s.facade = bilanDeLaFacade({ ...base, silhouette: m.silhouette, textureCalee: m.textureCalee, ouvertures: m.releve.ouvertures, ecartLargeur: m.ecartLargeur, hauteurMesureeM: m.hauteurM });
    return { etat: 'a-confirmer', resume: texteBilan(s.facade) + ' Validez la façade pour l’écrire dans le projet (V4).', verite: null };
  }
  const a = s.analyse;
  if (!a) return attend('le mur redressé (É6)');
  const pose = s.calage?.pose ? rectDeLaPose(s.calage.pose.coins) : null;
  const cadre = pose ? { x0: Math.round(pose.x0), y0: Math.round(pose.y0), x1: Math.round(pose.x1), y1: Math.round(pose.y1) } : null;
  s.facade = bilanDeLaFacade({
    ...base, silhouette: s.silhouette ? MOT_DU_HAUT[s.silhouette.forme] : null, pointesIa: s.ia?.reponse?.calage.pointes ?? null,
    textureCalee: cadre && cadre.x1 > cadre.x0 && cadre.y1 > cadre.y0 ? { pxParM: Math.round(a.pxParM * 10) / 10, cadre } : null,
    ouvertures: s.ia?.accord?.ouvertures ?? a.ouvertures.map(versOuvertureFacade),
  });
  return sans('Bilan : ' + texteBilan(s.facade) + ' La calibration n’écrit pas de façade : elle se valide dans l’audit (V4).');
};

const PAS: Record<IdEtape, Pas> = {
  preparation, prises, redressement, assemblage, calage, silhouette,
  diagnostic: ({ e, o, s }) => {
    const r = etapeDiagnostic(e.toit ?? null, e.hauteurM, s.forme?.lue ?? null, s.ia?.reponse ?? null, o.objectifs, o.verite?.toit);
    s.forme = { lue: s.forme?.lue ?? null, diagnostic: r.diagnostic };
    return r.etape;
  },
  texture, ouvertures,
  toit: ({ s }) => etapeToit(s.forme?.diagnostic ?? null),
  validation,
};

/**
 * Deroule l'enchainement d'une facade, etape par etape, et rend l'etat et les sorties de chacune. Ne rejette jamais une etape qui
 * doute : elle le dit (a confirmer, echec) et la suite continue sur ce qui reste (plutot un resultat que rien). `depuis` reprend les
 * sorties des etapes d'avant dans `precedent`.
 */
export async function derouler(e: EntreesFacade, o: OptionsEnchainement): Promise<Enchainement> {
  const obj = objectifsEnchainement(o.objectifs);
  const debut = o.depuis && o.precedent ? ETAPES_FACADE.findIndex((x) => x.id === o.depuis) : 0;
  const c: Contexte = { e, o, obj, s: debut > 0 && o.precedent ? { ...o.precedent.sorties } : { ...SORTIES_VIDES } };
  const etapes: EtapeCalculee[] = [];
  for (const [k, def] of ETAPES_FACADE.entries()) {
    const avant = k < debut ? o.precedent?.etapes.find((x) => x.id === def.id) : undefined;
    if (avant) { etapes.push(avant); continue; }
    if (o.arrete?.()) { etapes.push({ id: def.id, etat: 'a-venir', resume: 'Arrêté avant cette étape.', verite: null }); continue; }
    o.surEtape?.(def.id, 'en-cours');
    await o.rendreLaMain?.();
    const r = await PAS[def.id](c);
    etapes.push({ id: def.id, ...r });
    o.surEtape?.(def.id, r.etat, r.resume);
  }
  return { etapes, sorties: c.s, versions: { chaine: VERSION_CHAINE_FACADES, objectifs: EMPREINTE_OBJECTIFS, ...(o.ia ? { ia: EMPREINTE_IA } : {}) } };
}

/** L'etape calculee d'un rejeu. */
export function etapeDe(r: Enchainement, id: IdEtape): EtapeCalculee {
  return r.etapes.find((x) => x.id === id) ?? { id, etat: 'a-venir', resume: etapeFacade(id).nom + ' : pas encore calculée.', verite: null };
}

// ------------------------------------------------------------------------------------------------
// Un cas de calibration dans l'enchainement
// ------------------------------------------------------------------------------------------------

/** Les reperes d'une photo d'un cas, s'ils sont quatre. */
export const reperesDe = (p: CasReel['photos'][number] | undefined): P2[] | null => (p?.reperes?.length === 4 ? p.reperes : null);

/** Ce que la personne avait pose sur les photos d'un cas : son mur ajuste a la main, ses reperes. */
export const originesDuCas = (cas: CasReel): Record<number, OrigineCoins> =>
  Object.fromEntries(cas.photos.flatMap((p, k): [number, OrigineCoins][] => (p.murALaMain ? [[k, 'main']] : reperesDe(p) ? [[k, 'reperes']] : [])));

/** Les entrees de l'enchainement pour un cas : ses dimensions, son gabarit (un rectangle sans), ses photos decodees dans l'ordre. */
export function entreesDuCas(cas: CasReel, images: readonly Image[]): EntreesFacade {
  return {
    largeurM: cas.largeurM, hauteurM: cas.hauteurM, gabarit: cas.gabarit ?? GABARIT_RECTANGLE, ...(cas.toit ? { toit: cas.toit } : {}),
    photos: cas.photos.map((p, k) => ({ image: images[k] as Image, coins: p.coins, reperes: reperesDe(p), focalePx: p.focalePx ?? null, murALaMain: !!p.murALaMain })),
  };
}

/** La verite d'un cas : son mur vrai sur l'assemblage, ses ouvertures annotees. */
export const veriteDuCas = (cas: CasReel): VeriteFacade => ({ ...(cas.calageVrai ? { calage: cas.calageVrai } : {}), ouvertures: cas.ouvertures, ...(cas.toitVrai ? { toit: cas.toitVrai } : {}) });

/**
 * Le cas apres un rejeu : les coins retenus sur chaque photo (sauf un mur pose a la main, garde). Des coins retrouves : la silhouette
 * d'avant (posee sur d'autres coins) ne vaut plus, l'enchainement repose le gabarit.
 */
export function casApresRejeu<C extends CasReel>(cas: C, r: Enchainement): C {
  const photos = r.sorties.calage?.photos;
  if (!photos) return cas;
  return { ...cas, photos: cas.photos.map((p, k) => { const q = photos[k]; if (!q || p.murALaMain || q.coins === p.coins) return p; const n = { ...p, coins: q.coins }; delete n.silhouette; return n; }) };
}

/**
 * L'option manuelle de l'E4 : le mur pose a la main sur l'assemblage (ses coins), ramene sur chaque photo assemblee (assemblage ->
 * vue de face -> photo) et pose comme un mur ajuste a la main. Les photos hors de l'assemblage gardent leurs coins.
 */
export function casCaleALaMain<C extends CasReel>(cas: C, r: Enchainement, coins: readonly P2[]): C {
  const sr = r.sorties.serie;
  if (!sr) return cas;
  const parPhoto = murSurLesPhotos(retoursDeLaSerie(sr), coins);
  return { ...cas, photos: cas.photos.map((p, i) => { const c = parPhoto[i]; return c ? { ...p, coins: c, murALaMain: true } : p; }) };
}

/** Le cas avec le mur pose a la main sur ces photos (par rang, ses coins) : la silhouette d'avant, posee sur d'autres coins, s'en va. */
export function casAvecLeMur<C extends CasReel>(cas: C, parPhoto: ReadonlyMap<number, readonly P2[]>): C {
  return { ...cas, photos: cas.photos.map((p, i) => { const c = parPhoto.get(i); if (!c) return p; const q = { ...p, coins: c.map((x) => ({ ...x })), murALaMain: true }; delete q.silhouette; return q; }) };
}

/** Par photo de la serie : le chemin de l'assemblage a la photo (sa place, sa vue de face) ; null hors de l'assemblage. */
function retoursDeLaSerie(sr: CoinsDeSerie): (RetourVersLaPhoto | null)[] {
  return sr.vues.map((v, i) => { const place = sr.assemblage.places[i]; return v && place ? { place, versPhoto: v.versPhoto } : null; });
}

/**
 * L'assemblage du rejeu de la calibration tel que « Ajuster l'égout et le sol » le montre (le meme geste que dans l'audit) : le mur
 * pose sur l'assemblage, et le chemin vers chaque photo assemblee. Null avec moins de deux photos assemblees : la photo seule suffit.
 */
export function assemblageDuRejeu(r: Enchainement, url: (img: Image) => string): AssemblageAAjuster | null {
  const sr = r.sorties.serie, pose = r.sorties.calage?.pose;
  if (!sr || !pose) return null;
  const retours = retoursDeLaSerie(sr).flatMap((x, rang) => (x ? [{ ...x, rang }] : []));
  return retours.length >= 2 ? { url: url(pose.image), largeur: pose.image.largeur, hauteur: pose.image.hauteur, coins: pose.coins.map((p) => ({ x: p.x, y: p.y })), retours } : null;
}

/**
 * Un cas prepare pour la mesure (la descente des reglages, le corpus reel) : ses coins tels quels, l'image de la chaine. `prepare`
 * est null quand rien ne se redresse.
 */
export async function preparerPourLaMesure(cas: CasReel, images: readonly Image[], premiereSeule = false): Promise<{ r: Enchainement; prepare: CasPrepare | null }> {
  const r = await derouler(entreesDuCas(cas, images), { coins: 'garder', image: 'chaine', premiereSeule, verite: veriteDuCas(cas) });
  return { r, prepare: r.sorties.analyse ? { cas, ...r.sorties.analyse } : null };
}
