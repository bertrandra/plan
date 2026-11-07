// L'orchestrateur de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 ter.4) : les etapes E1 a E14 dans l'ordre du
// tableau, l'etat de chacune (son objectif atteint ou non, regles/facades/enchainement.json), ses actions typees (code, Claude, la
// personne, la mesure contre la verite : model/etapeFacade.ts), et ce que chacune rend a la suivante. Pur, sans React ni DOM.
//
// Le groupe Image (E3 Objectif, E4 Coins du mur, E5 Redressement, E6 Assemblage) ne calcule qu'une fois : la chaine
// (chaine.ts::redresserEtFusionner) est appelee dans son premier pas, et les suivants relisent ce qu'elle a rendu (decision du
// proprietaire, 7 novembre 2026 : des etapes de plus, aucun calcul deplace). Rejouer depuis l'une d'elles rejoue donc depuis E3.
// L'appel a Claude n'est jamais fait ici (l'audit : analyseClaude.ts ; la calibration : « Rappeler Claude ») : l'E8 rejoue la reponse
// enregistree (`ia`), et se dit sautee en mode deterministe.
//
// CALIBRATION ET AUDIT : LE MEME CODE ET LA MEME ORCHESTRATION ; L'AUDIT N'EN CACHE QU'UNE PART (decision du proprietaire,
// 2 novembre 2026). `derouler` est l'entree unique des deux : la calibration est la vue entiere du processus, l'audit le meme
// processus dont la personne voit moins. L'audit ne calcule rien autrement : un resultat de calibration prouve ce que fera l'audit.
// Les memes fonctions redressent (chaine.ts::redresserEtFusionner), reportent le mur, assemblent et fondent les vues
// (analyseMur.ts::analyserLeMur), posent le gabarit, lisent le haut du mur, analysent et detectent, dans le meme cadre. Ce qui
// differe, et nulle part ailleurs :
// - d'ou viennent les entrees (`EntreesFacade.prises`, prisesFacade.ts) : les photos prises sur place avec leur prise de vue et les
//   corrections de la personne (l'audit, app/audit/parcelle/mesures.ts), ou un cas enregistre (`entreesDuCas`) ;
// - les mesures qui demandent la verite, faites seulement quand un cas en a une, en lecture seule (`verite`) ;
// - la fin (`vue`) : l'audit attend la validation V4, qui ecrit la Facade ; la calibration n'ecrit rien dans un projet ;
// - ce qui se montre (`vue`, et les ecrans) : la calibration montre chaque etape et ses images, l'audit en cache une part.
// Ce que la calibration ajoute (la mesure contre la verite, la reponse enregistree de Claude rejouee, la texture sans ombres) LIT les
// sorties communes et ne les change jamais : `tests/unit/facade/releve/uneOrchestration.test.ts` le prouve, etape par etape.

import type { HautMasque } from '../analyse.js';
import { descentesRetrouvees } from '../regles/facades/modenature.js';
import { ETAPES_FACADE, actionDe, etapeFacade, libelleEtape, type ActionEtape, type ChoixSource, type ForcageSource, type ElementAction, type FamilleClaude, type SourceElement, type ValeurElement, FAMILLES_CLAUDE, type EtatAffiche, type EtatEtape, type IdEtape, type TypeAction } from '../../model/etapeFacade.js';
import { EMPREINTE_OBJECTIFS, objectifsEnchainement, type Objectifs } from '../regles/facades/enchainement.js';
import { GABARIT_RECTANGLE, echelleDuGabarit, gabaritALEchelle, gabaritSurLaPhoto, pointesDuGabarit, rectDesCoins, type GabaritMur } from '../gabaritMur.js';
import { murSousLeSol } from '../vision/mosaiqueFuites.js';
import { murSurLesPhotos, vuesDeLAssemblage, type AssemblageDuMur, type RetourVersLaPhoto } from '../analyseMur.js';
import type { RedressementFuites } from '../vision/redressementFuites.js';
import type { Image, P2 } from '../vision/homographie.js';
import { libelleSilhouette } from '../../model/silhouetteFacade.js';
import { sansOmbres } from '../vision/sansOmbres.js';
import type { ResultatFusion } from '../fusion.js';
import type { OuvertureDetectee } from '../detection/detection.js';
import { egoutControle, expliquer, expliqueLaPhoto, seuilsDuCalage, type Explication } from './calageAncres.js';
import { detecterSegments } from '../vision/segments.js';
import { redresserEtFusionner, VERSION_CHAINE_FACADES, type ResultatChaine } from './chaine.js';
import { avisFusion, releveDeLaSerie, type ReleveDeLaSerie } from './analyseSerie.js';
import { hautDeLImage, imageDuRunAvecLaBande, type ImageDuRun } from './imageDuRun.js';
import { rechercher, type EntreeRecherche, type Morceau, type ResultatRecherche } from './serie.js';
import { MOTIF_ILLISIBLE, prisesDeLaFacade, type PrisesFacade } from './prisesFacade.js';
import type { Facade } from '../../geometry/cotesVusDeDehors.js';
import { estLeMurConfirme, sontRelues, type BilanPhotoRedressement, type BilanRedressement, type CorrectionRedressement, type PoseDuMurCherche } from '../../model/auditParcelle.js';
import type { PrisePhoto } from '../../model/audit.js';
import { juger, type AnalyseDuMur, type CasPrepare, type CasReel, type OuvertureVraie, type ToitVraiCorps } from '../corpusReel.js';
import { type ObservationsFacade, type RunEnregistre } from '../../regles/facades/observations.js';
import { accorderOuvertures, avisDesPointes, ecartDesPoses, EMPREINTE_IA, reglagesIa, poseDeLIa, poseDeLIaSurLeMur, observationsDuRun, texteAccord, type AccordIa, type RectIa } from '../regles/facades/ia.js';
import { cartesAretes } from '../detection/recalageIa.js';
import { etapeDiagnostic, etapeToit, type ToitDeLaFacade } from './etapesForme.js';
import type { DiagnosticForme } from '../regles/facades/diagnosticForme.js';
import { bilanDeLaFacade, texteBilan, type BilanFacade } from './bilanFacade.js';
import { partagerSousLesVoisins, texteDuPartage, type FacadeVoisine, type PartageOuvertures } from './murVoisin.js';
import type { OuvertureFacade } from '../../model/types.js';
import { nomFacade } from '../../geometry/cotesVusDeDehors.js';
import { lectureSelonLesChoix, lireChoix, lireForcages, ouverturesSelonLesChoix, poseSelonLesChoix, sourceDe } from './choixSources.js';

/** Ce qui entre dans l'enchainement : les dimensions et le gabarit du plan (E1), les photos et ce qui les accompagne (E2). */
export interface EntreesFacade {
  largeurM: number;
  hauteurM: number;
  gabarit: GabaritMur;
  /** Les photos, leurs prises de vue, les corrections de la personne, le cote du contour : pris sur place, ou relus d'un cas. */
  prises: PrisesFacade;
  /** Les corps du toit qui font le gabarit, et le mur de la facade (lot F4) : le diagnostic de forme se fait corps par corps. */
  toit?: ToitDeLaFacade | null;
  /**
   * Les facades deja relevees des autres cotes du batiment (l'audit les lit dans le projet) : une ouverture lue sous le pignon d'un corps
   * voisin va sur celle du mur qui la porte (murVoisin.ts). Absentes (un cas de calibration) : aucune, elle reste sur ce mur.
   */
  voisines?: readonly FacadeVoisine[];
  /**
   * Les choix de source de la personne, element par element (`ChoixSource`, lot C2) : l'element choisi remplace la valeur du moteur pour
   * les etapes qui le consomment (choixSources.ts). Absents : la source que retient le moteur, rien ne change. Seule la calibration en
   * passe aujourd'hui (decision du proprietaire, 7 novembre 2026 : « pas encore » dans l'audit) ; le processus est le meme.
   */
  choix?: readonly ChoixSource[];
  /** Les forcages de Claude (une etape, ou toutes) : Claude pour chaque element vise qu'il a lu, un choix par element l'emportant. */
  forcages?: readonly ForcageSource[];
}

/** La verite d'un cas de calibration, pour la mesure de chaque etape (§7.3). */
interface VeriteFacade {
  /** Le mur vrai sur l'assemblage, en pixels (bouts, et l'egout et le sol quand on les connait). */
  calage?: CasReel['calageVrai'];
  /** Les ouvertures vraies, en metres. */
  ouvertures?: readonly OuvertureVraie[];
  /** La vraie forme du toit, corps par corps : la verite du diagnostic de forme (E10). */
  toit?: readonly ToitVraiCorps[];
}

/** D'ou viennent les coins d'une photo : trouves, devines (a verifier), poses a la main, ou lus apres un redressement par les reperes. */
export type OrigineCoins = 'trouves' | 'devines' | 'main' | 'reperes';

interface OptionsEnchainement {
  /**
   * Ce que la personne voit, et comment le processus finit ; jamais ce qu'il calcule. `calibration` : la vue entiere, et rien ne
   * s'ecrit. `audit` : le meme processus, dont l'ecran cache une part ; la facade attend la validation V4, qui l'ecrit dans le projet.
   * Seuls l'etat et le texte de l'E14 en dependent.
   */
  vue: 'audit' | 'calibration';
  /** Le calage fin d'une photo (un worker a l'ecran, en direct ailleurs). */
  chercherCoins: (e: EntreeRecherche) => Promise<ResultatRecherche>;
  /** Calculer aussi ce qui ne sert qu'a montrer (la texture sans ombres) : l'ecran de la calibration, pas la mesure. */
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
   * Une reponse de Claude au run de cette facade, enregistree avec le cas, rejouee sans reseau ni cout (§7.2) : ce que l'audit fait
   * apres son run, rejoue a l'E8 (l'accord de ses angles, ses pointes, ses boites) et lu par le diagnostic (E10). Sa pose se mesure contre le mur
   * retenu, sans le changer. Absente : le mode deterministe.
   */
  ia?: RunEnregistre | null;
  /**
   * Interne : ce rejeu pose le mur sur la pose que la personne a choisie pour les angles (lot C2, Claude ou ses valeurs), en mur pose a
   * la main ; `derouler` le pose lui-meme, une seule fois. Absent : le mur du calcul.
   */
  poseChoisie?: 'claude' | 'manuel';
}

/** Ce que l'E7 dit d'un mur pose sur les angles choisis par la personne (lot C2). */
const POSE_CHOISIE = { claude: 'Mur posé sur les angles de Claude (votre choix).', manuel: 'Mur posé sur vos angles (votre choix).' } as const;

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

/** Ce que la chaine rend d'une facade : le releve du mur (ou rien), la photo qui le porte, le bilan du redressement, les photos redressees. */
interface SortieAudit {
  mesure: (ReleveDeLaSerie & { rangReleve: number }) | null;
  redressement: BilanRedressement;
  redressees: PhotoRedresseeDeLAudit[];
  /** L'image du run de Claude : la photo du releve redressee jusqu'au haut de la facade (lot F7), null sans releve. */
  imageRun: ImageDuRun | null;
  /** L'assemblage de deux photos ou plus et le mur pose dessus : ce que montre « Ajuster l'égout et le sol » ; null avec une photo. */
  assemblage: AssemblageAAjuster | null;
  /** Par photo de l'image prise pour la suite (une ou plusieurs), le chemin de cette image a la photo : un mur cale dessus y revient. */
  retours: (RetourVersLaPhoto & { rang: number })[];
}

/** Ce que le rejeu tire de la reponse de Claude (mode « IA »). */
interface IaDuRejeu {
  run: RunEnregistre;
  /** La reponse lue (la passe, ou le vote de trois) ; null : aucune passe lisible. */
  reponse: ObservationsFacade | null;
  /** E8 : la pose de ses deux angles sur l'image prise pour la suite (pixels), et son ecart a la pose retenue, en part de la largeur. */
  pose: RectIa | null;
  ecart: number | null;
  /** E8 : ses boites accordees avec la detection (lues a l'E12). */
  accord: AccordIa | null;
  /** E8 : les descentes d'eau pluviale qu'il voit et que la detection retrouve (une verticale a leur place), en part du mur (lot L1). */
  descentes?: number[];
}

/** Les sorties des etapes : chacune ne lit que celles d'avant. */
interface SortiesFacade {
  /** E1 : le rapport hauteur sur largeur du plan, et les pointes que le gabarit attend (au-dessus de l'egout). */
  preparation: { rapport: number; pointes: { u: number; v: number }[] } | null;
  /** E5 : par rang de photo, la photo redressee entiere (tournee de face par le mur retenu, sans coupe ni echelle) ; null : rien. */
  vues: (RedressementFuites | null)[] | null;
  /**
   * E7 : les coins retenus sur chaque photo (par rang) et leur origine, ce qui doute, le mur pose sur l'image prise pour la suite
   * (l'assemblage, une photo seule comprise), et ce que ce mur explique de cette image, juge sur la silhouette du gabarit qu'il pose
   * (calageAncres.ts). `echelleGabarit` : la pose du gabarit sur ce mur, son bas sur le sol et a l'echelle de la largeur, en hauteurs du
   * mur trouve (gabaritMur.ts::echelleDuGabarit ; 1 sans mur pose) : ce que les etapes suivantes et les images posent de lui.
   */
  calage: { photos: { coins: P2[]; origine: OrigineCoins | null }[]; message: string | null; pose: AssemblageDuMur | null; explication?: Explication; echelleGabarit?: number } | null;
  /** E9 : le haut du mur lu, pose sur l'image prise pour la suite par les coins du mur (pixels). */
  silhouette: { points: P2[]; masques?: P2[][] } | null;
  /**
   * E9 : le haut lu ramene au mur (u de 0 a 1, v en hauteurs d'egout), que le diagnostic compare au gabarit ; E10 : le diagnostic
   * de forme, corps par corps (propositions de toit, alertes de hauteur).
   */
  forme: { lue: { u: number; v: number }[] | null; diagnostic: DiagnosticForme | null; masque?: HautMasque | null } | null;
  /** E3 a E12 : l'analyse du mur (faite par la chaine, au groupe Image). */
  analyse: AnalyseDuMur | null;
  /** E11 : la texture sans les ombres de la photo (`illustrer`). */
  sansOmbres: Image | null;
  /** E8 a E14 : ce que la reponse de Claude donne au rejeu (mode « IA ») ; null en mode deterministe. */
  ia: IaDuRejeu | null;
  /** E3 a E12 : ce que la chaine a rendu, et le releve du mur qui en sort. */
  audit: SortieAudit | null;
  /** E14 : le bilan de la facade, la Facade que la validation V4 ecrira (lot F5). */
  facade: BilanFacade | null;
  /**
   * E12, seulement quand les choix de la personne changent les ouvertures (lot C2) : le releve et la liste du moteur d'avant les choix, d'ou
   * un rejeu repart (le releve et l'accord, eux, portent les ouvertures choisies, que V3 relit et V4 ecrit). Absent : aucun choix n'a joue.
   */
  moteur?: { releve: NonNullable<SortieAudit['mesure']>['releve']; ouvertures: readonly OuvertureFacade[] };
}

/** Une etape calculee : son etat, ce qu'elle a donne en une phrase, et sa mesure contre la verite quand le cas en a une. */
export interface EtapeCalculee {
  id: IdEtape;
  etat: EtatAffiche;
  resume: string;
  verite: { texte: string; juste: boolean } | null;
  /** Les actions de l'etape (son contrat, model/etapeFacade.ts), leur etat et ce qu'elles ont lu et rendu : `derouler` seul les rend. */
  actions: ActionEtape[];
  /**
   * Le doute vient du mur (decision du proprietaire, 3 novembre 2026) : l'etape a atteint son objectif, mais sur un mur que l'E7 laisse
   * a confirmer ; elle est a confirmer elle aussi, « depend du mur a confirmer (E7) ». Le mur confirme (V1), elle retrouve son verdict.
   */
  herite?: 'calage';
}

/**
 * Les etapes qui lisent le mur pose au calage : la lecture de Claude (ses angles se jugent contre lui), la silhouette entre ses bouts,
 * la forme, la texture et les ouvertures sur lui, la suite.
 */
const DEPENDENT_DU_MUR: readonly IdEtape[] = ['lectureIa', 'silhouette', 'diagnostic', 'texture', 'ouvertures', 'toit', 'validation'];

/**
 * Le doute herite du mur : une etape qui depend du mur et a atteint son objectif est a confirmer tant que l'E7 l'est (ou echoue). Son
 * propre verdict reste dans son resume ; une etape qui doutait deja, ou sautee, garde le sien.
 */
function avecLeDouteDuMur(id: IdEtape, r: Resultat, etapes: readonly EtapeCalculee[]): Resultat {
  const mur = etapes.find((x) => x.id === 'calage')?.etat;
  if (!DEPENDENT_DU_MUR.includes(id) || r.etat !== 'ok' || (mur !== 'a-confirmer' && mur !== 'echec')) return r;
  return { ...r, etat: 'a-confirmer', resume: r.resume + ` Dépend du mur à confirmer (${libelleEtape('calage')}).`, herite: 'calage' };
}

/** Un rejeu : l'etat de chaque etape, leurs sorties, et les versions qui les ont donnees (§7.2). */
export interface Enchainement {
  etapes: EtapeCalculee[];
  sorties: SortiesFacade;
  versions: { chaine: number; objectifs: string; ia?: string };
}

const SORTIES_VIDES: SortiesFacade = { preparation: null, vues: null, calage: null, silhouette: null, forme: null, analyse: null, sansOmbres: null, ia: null, audit: null, facade: null };

/** Ce que la reponse rejouee a dit, garde le temps du rejeu pour les actions de l'E8 (ce n'est pas une sortie : rien ne la relit). */
interface LectureDeLE8 { angles: string | null; pointes: string; image: 'imageRun' | 'assemblage' }

interface Contexte {
  e: EntreesFacade; o: OptionsEnchainement; obj: Objectifs; s: SortiesFacade; lecture?: LectureDeLE8;
  /** Ce que l'E7 a lu des angles de Claude dans ce rejeu (la reponse `run`) : l'E8 le reprend tel quel, sans le refaire. */
  angles?: { run: RunEnregistre; avis: ReturnType<typeof avisDeLIa> | null };
}
/** Ce qu'un pas rend : l'etat, le resume, la verite ; ses actions se lisent ensuite sur les sorties (`ACTIONS`). */
type Resultat = Omit<EtapeCalculee, 'id' | 'actions'>;
type Pas = (c: Contexte) => Promise<Resultat> | Resultat;

const pc = (x: number) => String(Math.round(x * 1000) / 10).replace('.', ',') + ' %';
const dec = (x: number, n = 2) => String(Math.round(x * 10 ** n) / 10 ** n).replace('.', ',');
const sans = (resume: string): Resultat => ({ etat: 'saute', resume, verite: null });
const attend = (quoi: string): Resultat => ({ etat: 'a-venir', resume: 'Attend ' + quoi + '.', verite: null });

/** Le mur pose (haut gauche, haut droit, bas droit, bas gauche) ramene a ses bouts, son egout et son sol. */
const rectDeLaPose = rectDesCoins;

/** Le nombre de photos de la facade, lisibles ou non : les rangs vont de 0 a ce nombre moins un. */
const nombreDePhotos = (p: PrisesFacade): number => Math.max(0, ...[...p.photos, ...p.illisibles].map((x) => x.rang + 1));

const preparation: Pas = ({ e, s }) => {
  const rapport = e.hauteurM / e.largeurM, pointes = pointesDuGabarit(e.gabarit);
  s.preparation = { rapport, pointes };
  const forme = e.gabarit.length <= 2 ? 'un rectangle (aucun corps lu)' : pointes.length ? `${pointes.length} pointe${pointes.length > 1 ? 's' : ''} (u ${pointes.map((p) => dec(p.u)).join(', ')}, à ${pointes.map((p) => dec(p.v, 1)).join(', ')} fois l’égout)` : 'un haut sans pointe';
  return { etat: 'ok', resume: `Mur de ${dec(e.largeurM)} × ${dec(e.hauteurM)} m (rapport ${dec(rapport, 3)}), gabarit : ${forme}.`, verite: null };
};

const prises: Pas = ({ e, obj }) => {
  // L'objectif compte les prises lisibles (le contrat : « une photo du mur entier, prise lisible ») ; une photo illisible a bien ete
  // prise, elle se dit ici et son echec au redressement.
  const lisibles = e.prises.photos.length, illisibles = e.prises.illisibles.length, n = lisibles + illisibles;
  if (!n) return { etat: 'echec', resume: 'Aucune photo : prenez ou choisissez une photo du mur entier.', verite: null };
  const dont = illisibles ? ` (dont ${illisibles} illisible${illisibles > 1 ? 's' : ''})` : '';
  return lisibles >= obj['facades.enchainement.photosMin']
    ? { etat: 'ok', resume: `${n} photo${n > 1 ? 's' : ''} du mur${dont}.`, verite: null }
    : { etat: 'a-confirmer', resume: `${n} photo${n > 1 ? 's' : ''} du mur, aucune lisible : reprenez une photo du mur entier.`, verite: null };
};

/** L'etat d'une part : objectif atteint, en partie, ou rien. */
const selonLaPart = (fait: number, total: number, objectif: number): EtatAffiche => (total > 0 && fait / total >= objectif ? 'ok' : fait > 0 ? 'a-confirmer' : 'echec');

const virgule = (v: number) => String(v).replace('.', ',');

/** « Photo 2 : redressée automatiquement (verticales à 0,2°) », ou son motif d'echec. */
function textePhoto(p: BilanPhotoRedressement): string {
  const nom = 'Photo ' + (p.rang + 1) + ' : ';
  if (p.statut === 'echec') return nom + 'échec, ' + (p.motif ?? 'redressement impossible') + ' (la photo est gardée)';
  const verticales = p.verticaliteDeg === null ? '' : ' (verticales à ' + virgule(p.verticaliteDeg) + '°)';
  if (p.statut === 'manuelle') return nom + 'redressée avec vos points' + verticales;
  return nom + 'redressée automatiquement' + verticales;
}

/** La focale equivalente 24 x 36 d'un champ du grand cote (le grand cote d'un 24 x 36 fait 36 mm), arrondie au millimetre. */
const focale35 = (champDeg: number) => Math.round(18 / Math.tan((champDeg * Math.PI) / 360));

/**
 * Ce que l'E3 dit de l'objectif d'une photo (demande du proprietaire, 4 novembre 2026) : l'EXIF lu, ou, faute d'EXIF, le champ que la
 * chaine a pris (lu sur les points de fuite, note pour l'appareil, ou suppose). Sans EXIF, un avertissement : le redressement par les
 * points de fuite peut etre faux. Une photo redressee par les reperes de la personne n'en a pas (les reperes ne dependent pas de la
 * focale) : juste l'information. `court` : le mot de la vignette. Null sans objectif dit (un bilan d'avant, une image illisible).
 */
export function objectifDeLaPhoto(p: Pick<BilanPhotoRedressement, 'objectif'>, parReperes: boolean): { court: string; texte: string; alerte: boolean } | null {
  const o = p.objectif;
  if (!o) return null;
  if (o.source === 'exif') return { court: 'Avec EXIF', texte: `Avec EXIF (focale ${focale35(o.champDeg)} mm éq.).`, alerte: false };
  const champ = virgule(o.champDeg) + '°';
  const prise = o.source === 'fuites' ? `champ lu sur ses points de fuite (${champ})` : o.source === 'appareil' ? `champ noté pour cet appareil (${champ})` : `focale supposée (${champ})`;
  if (parReperes) return { court: 'Sans EXIF', texte: `Sans EXIF : ${prise} ; redressée par vos repères, qui ne dépendent pas de la focale.`, alerte: false };
  return { court: 'Sans EXIF', texte: `Sans EXIF : ${prise}. Le redressement par les points de fuite peut être faux ; posez quatre repères.`, alerte: true };
}

/**
 * Chaque photo redressee seule, **entiere**, comme l'assemblage la prend (analyseMur.ts::vuesDeLAssemblage) : par ses reperes, sinon
 * par ses points de fuite, sinon par les coins du mur retenu ; sans etre coupee au mur ni mise a son echelle. Sur l'image que la chaine
 * a lue (corrigee de la distorsion du grand-angle s'il y a lieu). Une photo sans essai n'en a pas. Par rang.
 */
function vuesRedressees(c: ResultatChaine, n: number): (RedressementFuites | null)[] {
  const out: (RedressementFuites | null)[] = Array.from({ length: n }, () => null);
  const essais = c.faits.flatMap((x) => (x.essai ? [{ rang: x.bilan.rang, m: x.essai.p.morceau }] : []));
  const vues = vuesDeLAssemblage(essais.map(({ m }) => ({ photo: m.prise.photo.image, coins: m.coins, reperes: m.reperes ?? null })));
  essais.forEach(({ rang }, k) => { out[rang] = vues[k] ?? null; });
  return out;
}

/** D'ou viennent les coins retenus sur chaque photo, par rang, et les coins eux-memes. */
function coinsRetenus(c: ResultatChaine, a: PrisesFacade, n: number): { coins: P2[]; origine: OrigineCoins | null }[] {
  const parRang = new Map(c.redressement.photos.map((b) => [b.rang, b]));
  return Array.from({ length: n }, (_, k) => {
    const b = parRang.get(k), cor = a.corrections[String(k)];
    const origine: OrigineCoins | null = !b ? null : b.coins === 'main' ? 'main' : cor?.reperes?.length === 4 ? 'reperes' : b.coins === 'trouve' && b.statut !== 'echec' ? 'trouves' : 'devines';
    return { coins: b?.coinsPx?.length === 4 ? b.coinsPx.map((q) => ({ x: q.x, y: q.y })) : [], origine };
  });
}

/**
 * L'image du run de Claude dans l'audit (lot F7) : la photo qui porte le releve, redressee dans le plan du mur du sol jusqu'au haut de
 * la facade (le gabarit, le faitage des corps), pour que Claude y lise les pointes, la forme et les elements du toit.
 */
function imageRunDeLAudit(e: EntreesFacade, a: PrisesFacade, retenue: NonNullable<ReturnType<typeof analyseRetenue>>): ImageDuRun | null {
  const ref = a.photos.find((p) => p.rang === retenue.rang)?.image;
  const m = retenue.morceaux.find((x) => x.prise.photo.image === ref) ?? retenue.morceaux[0];
  if (!m) return null;
  const H = retenue.a.r.hauteur;
  const faitages = (e.toit?.corps ?? []).map((c) => c.faitage);
  const hautV = Math.max(1, ...(e.gabarit ?? []).map((p) => p.v));
  return imageDuRunAvecLaBande(m, a.facade.largeur, H, hautDeLImage(H, hautV, faitages.length ? Math.max(...faitages) : null), a.jpeg);
}

/**
 * Par photo de l'image que la chaine a prise pour la suite (son assemblage, une photo seule comprise), le chemin de cette image a la
 * photo, avec son rang. Une photo que la chaine a lue corrigee de la distorsion du grand-angle n'y revient pas : ses coins seraient
 * dans l'image corrigee, la correction les lirait sur la photo d'origine.
 */
function retoursParRang(c: ResultatChaine, a: PrisesFacade, retenue: NonNullable<ReturnType<typeof analyseRetenue>>): (RetourVersLaPhoto & { rang: number })[] {
  const asm = retenue.a.assemblage;
  if (!asm) return [];
  return retenue.morceaux.flatMap((m, k) => {
    const r = asm.retours[k], rang = c.faits.find((x) => x.essai?.p.morceau === m)?.bilan.rang;
    const brute = rang === undefined ? undefined : a.photos.find((p) => p.rang === rang)?.image;
    return r && rang !== undefined && brute === m.prise.photo.image ? [{ ...r, rang }] : [];
  });
}

/**
 * L'assemblage que la chaine a pris pour la suite, quand deux photos ou plus y sont : le mur s'ajuste a la main sur lui, et non sur
 * une photo seule (CLAUDE.md, « Silhouette d'une façade »).
 */
function assemblageAAjuster(a: PrisesFacade, retenue: NonNullable<ReturnType<typeof analyseRetenue>>, retours: (RetourVersLaPhoto & { rang: number })[]): AssemblageAAjuster | null {
  const asm = retenue.a.assemblage;
  if (retenue.assemblage !== 'vues' || !asm) return null;
  return retours.length >= 2 ? { url: a.jpeg(asm.image), largeur: asm.image.largeur, hauteur: asm.image.hauteur, coins: asm.coins.map((p) => ({ x: p.x, y: p.y })), retours } : null;
}

/** L'analyse que la chaine a retenue (la fusion, sinon la photo seule), ses morceaux, la photo qui porte le releve. */
function analyseRetenue(c: ResultatChaine): { a: NonNullable<ResultatChaine['seule']>['a']; morceaux: Morceau[]; rang: number; assemblage: 'morceaux' | 'vues' } | null {
  if (c.fusion) return { a: c.fusion.a, morceaux: c.fusion.morceaux, rang: c.fusion.rangReference, assemblage: 'vues' };
  const essai = c.seule?.photo.essai;
  return c.seule && essai ? { a: c.seule.a, morceaux: [essai.p.morceau], rang: c.seule.photo.bilan.rang, assemblage: 'morceaux' } : null;
}

const resumeFusion = (f: ResultatFusion): NonNullable<AnalyseDuMur['fusion']> => ({ statut: f.statut, vues: f.vues, masque: f.masque, reference: f.reference, occlusion: f.occlusion });

/** Ce que la personne peut faire d'une photo qui ne se redresse pas : des reperes, sauf sur une image qui ne se lit pas. */
function conseilDesEchecs(echecs: readonly BilanPhotoRedressement[]): string {
  const illisibles = echecs.filter((p) => p.motif === MOTIF_ILLISIBLE).map((p) => p.rang + 1), autres = echecs.length - illisibles.length;
  const nums = illisibles.length > 1 ? 'les photos ' + illisibles.join(', ') : 'la photo ' + illisibles.join('');
  return (illisibles.length ? `L’image ne se lit pas : retirez ou reprenez ${nums}.` : '') + (illisibles.length && autres ? ' ' : '') + (autres ? 'Posez quatre repères sur la photo qui ne se redresse pas.' : '');
}

/**
 * Le calcul du groupe Image, fait une fois, dans son premier pas (E3) : la chaine lit le champ de chaque photo, pose ses coins (poses au
 * doigt, sinon trouves sur les aretes, sinon reportes, sinon predits par la prise de vue), redresse chaque photo, reporte le mur, assemble
 * et analyse en un appel. Le releve du mur s'ecrit ici, sur l'analyse qu'elle a retenue ; les etapes suivantes (E4 a E6 comprises) se
 * lisent sur ce qu'elle a rendu.
 */
async function chaineDuGroupeImage({ e, o, s }: Contexte): Promise<void> {
  const a = e.prises;
  const c = await redresserEtFusionner(a.photos, a.facade, { pts: [...a.contour] }, { chercherCoins: o.chercherCoins, gabarit: e.gabarit }, a.corrections, a.illisibles);
  const retenue = analyseRetenue(c);
  const n = nombreDePhotos(a);
  // L'assemblage s'encode d'abord : les photos redressees puis l'image du run restent encodees dans l'ordre d'avant.
  const retours = retenue ? retoursParRang(c, a, retenue) : [];
  const assemblage = retenue ? assemblageAAjuster(a, retenue, retours) : null;
  s.vues = vuesRedressees(c, n);
  const redressees = s.vues.flatMap((v, rang) => (v ? [{ rang, image: a.jpeg(v.image) }] : []));
  s.audit = {
    mesure: retenue ? { ...releveDeLaSerie(retenue.a, retenue.morceaux, a.facade, a.jpeg, retenue.assemblage), rangReleve: retenue.rang } : null,
    redressement: c.redressement, redressees,
    imageRun: retenue ? imageRunDeLAudit(e, a, retenue) : null,
    assemblage, retours,
  };
  // Un releve neuf : ce que des choix d'un rejeu precedent avaient change ne vaut plus pour lui.
  delete s.moteur;
  const pose = retenue?.a.assemblage ?? null;
  s.calage = { photos: coinsRetenus(c, a, n), message: null, pose, echelleGabarit: pose ? echelleDuGabarit(e.hauteurM / e.largeurM, rectDesCoins(pose.coins)) : 1 };
  if (retenue) {
    const { r, fusion } = retenue.a;
    s.analyse = { elevation: r.elevation, facade: r.facade, pxParM: r.pxParM, texture: r.texture, hauteurTexture: r.hauteurTexture, profilToit: r.profilToit ?? null, toitEstime: r.toitEstime, ouvertures: r.ouvertures, devinees: r.devinees, fusion: fusion ? resumeFusion(fusion) : null, assemblage: retenue.a.assemblage ?? null };
  }
}

/** Les photos redressees ou non : l'objectif de l'E5 (chaque photo redressee), juge sur le bilan de la chaine. */
function etatDuRedressement(b: BilanRedressement, obj: Objectifs): EtatAffiche {
  const faites = b.photos.filter((p) => p.statut !== 'echec').length;
  return selonLaPart(faites, b.photos.length, obj['facades.enchainement.redresseesMinPart']);
}

/** Les reperes de la personne redressent-ils cette photo (ils ne dependent pas de la focale) ? */
const parReperes = (a: PrisesFacade, rang: number): boolean => (a.corrections[String(rang)]?.reperes?.length ?? 0) === 4;

/**
 * E3 : le champ de chaque photo, celui que la chaine a pris (l'EXIF lu, sinon les points de fuite, sinon l'appareil, sinon suppose ;
 * demande du proprietaire, 4 novembre 2026). Le calcul de tout le groupe Image se fait ici, une fois. Une photo sans EXIF le dit ; elle
 * ne met l'etape a confirmer que si le redressement n'atteint pas son objectif (la focale supposee peut en etre la cause) : une photo sans
 * EXIF bien redressee ne demande rien, comme avant que l'objectif ait son etape.
 */
const objectif: Pas = async (c) => {
  await chaineDuGroupeImage(c);
  const { e, s, obj } = c;
  const b = s.audit?.redressement;
  if (!b?.photos.length) return attend('une photo');
  const dits = b.photos.map((p) => ({ p, d: objectifDeLaPhoto(p, parReperes(e.prises, p.rang)) }));
  const alertes = dits.filter((x) => x.d?.alerte);
  const etat: EtatAffiche = alertes.length && etatDuRedressement(b, obj) !== 'ok' ? 'a-confirmer' : 'ok';
  // L'optique rangee avec la photo (lot A : l'EXIF garde a la reduction, meme sans position du telephone) : d'ou vient sa focale.
  const optique = (rang: number) => { const o = e.prises.optiques?.find((x) => x.rang === rang)?.optique; return o ? ` Optique rangée : ${o.focale35} mm éq. (${MOTS_FOCALE[o.sourceFocale]})${o.modeleAppareil ? ', ' + o.modeleAppareil : ''}.` : ''; };
  return { etat, resume: dits.map(({ p, d }) => 'Photo ' + (p.rang + 1) + ' : ' + (d ? d.texte.charAt(0).toLowerCase() + d.texte.slice(1) : 'objectif non dit (un bilan d’avant).') + optique(p.rang)).join(' '), verite: null };
};

const MOTS_FOCALE = { exif: 'EXIF', appareil: 'noté pour l’appareil', defaut: 'supposée' } as const;

const ORIGINES: Readonly<Record<OrigineCoins, string>> = { trouves: 'trouvés sur la photo', devines: 'prédits par la prise de vue', main: 'posés à la main', reperes: 'lus après vos repères' };

/**
 * E4 : les coins du mur retenus sur chaque photo et leur origine (posees au doigt, trouves, reportes, predits), tels que la chaine les a
 * rendus. Cette etape ne juge pas le mur (le calage le juge) : sans coin du tout elle echoue, sinon elle dit d'ou ils viennent.
 */
const coins: Pas = ({ s }) => {
  const photos = s.calage?.photos ?? [];
  if (!s.audit?.redressement.photos.length) return attend('une photo');
  const avec = photos.map((p, rang) => ({ ...p, rang })).filter((p) => p.origine && p.coins.length === 4);
  if (!avec.length) return { etat: 'echec', resume: 'Aucune photo n’a ses quatre coins : posez quatre repères sur une photo, puis rejouez.', verite: null };
  return { etat: 'ok', resume: avec.map((p) => `Photo ${p.rang + 1} : coins ${ORIGINES[p.origine as OrigineCoins]}`).join(' ; ') + '.', verite: null };
};

/** E5 : chaque photo redressee entiere (par ses reperes, ses points de fuite, sinon les coins du mur retenu), relue sur le bilan de la chaine. */
const redressement: Pas = ({ s, obj }) => {
  const b = s.audit?.redressement;
  const photos = b?.photos ?? [], faites = photos.filter((p) => p.statut !== 'echec').length;
  if (!b || !photos.length) return attend('une photo');
  const echecs = photos.filter((p) => p.statut === 'echec');
  const etat = etatDuRedressement(b, obj);
  return { etat, resume: `${faites} photo${faites > 1 ? 's' : ''} redressée${faites > 1 ? 's' : ''} sur ${photos.length}` + (echecs.length ? ' : ' + echecs.map(textePhoto).join(' ; ') + '. ' + conseilDesEchecs(echecs) : ' : ' + photos.map(textePhoto).join(' ; ') + '.'), verite: null };
};

/** E6 : les photos redressees assemblees (ou fusionnees), partiellement, ou chacune seule ; une photo seule n'a rien a assembler. */
const assemblage: Pas = ({ s, obj }) => {
  const b = s.audit?.redressement;
  if (!b) return attend('une photo redressée');
  const rangs = (l: readonly number[]) => l.map((r) => r + 1).join(', ');
  const motif = b.motifFusion ? ' (' + b.motifFusion + ')' : '';
  const reprendre = ' Reprenez la façade avec des chevauchements entre les photos : un tiers de mur en commun.';
  const n = b.photos.length;
  // L'assemblage (la mosaique des photos redressees, qui pose le mur) se dit ici ; la fusion des vues (le recalage, les occultations), a la
  // texture. Sans assemblage, la chaine les a fondues directement : c'est bien une fusion.
  const asm = !!s.calage?.pose;
  if (b.fusion === 'fusionnee') return { etat: 'ok', resume: asm ? `Assemblée : ${b.fusionnees.length} photos dans une même image.` : `Fusionnée : ${b.fusionnees.length} photos en une image.`, verite: null };
  if (b.fusion === 'partielle') {
    const seules = b.photos.filter((p) => !b.fusionnees.includes(p.rang)).map((p) => p.rang);
    return { etat: selonLaPart(b.fusionnees.length, n, obj['facades.enchainement.assembleesMinPart']), resume: `${asm ? 'Assemblage' : 'Fusion'} partiel${asm ? '' : 'le'} : photos ${rangs(b.fusionnees)} assemblées, ${seules.length > 1 ? 'photos' : 'photo'} ${rangs(seules)} hors de l’assemblage${motif}.` + reprendre, verite: null };
  }
  if (b.fusion === 'independantes') return { etat: 'echec', resume: `Photos indépendantes : ${asm ? 'aucun assemblage' : 'aucune fusion'}${motif}.` + reprendre, verite: null };
  if (n > 1) return { etat: b.photos.some((p) => p.statut !== 'echec') ? 'a-confirmer' : 'echec', resume: `Photos redressées seules${motif}.` + reprendre, verite: null };
  return sans('Une photo seule : rien à assembler.');
};

/** L'ecart du mur pose au mur vrai, en part de la largeur vraie : chaque bord, et le pire. Une verite posee sur une autre chaine le dit. */
function ecartAuVrai(pose: { x0: number; x1: number; y0: number; y1: number }, vrai: NonNullable<VeriteFacade['calage']>, seuil: number): { texte: string; juste: boolean } {
  const w = vrai.x1 - vrai.x0;
  const bords: [string, number | undefined, number][] = [['bout gauche', vrai.x0, pose.x0], ['bout droit', vrai.x1, pose.x1], ['égout', vrai.egout, pose.y0], ['sol', vrai.sol, pose.y1]];
  const ecarts = bords.filter((b): b is [string, number, number] => b[1] !== undefined).map(([nom, v, p]) => ({ nom, e: Math.abs(p - v) / w }));
  const pire = Math.max(...ecarts.map((x) => x.e));
  // Le mur vrai est en pixels de l'assemblage de la chaine qui l'a vu poser : une autre version a pu rendre une autre image.
  const autre = vrai.versionChaine !== VERSION_CHAINE_FACADES ? ` (vérité posée sur l’assemblage de la chaîne ${vrai.versionChaine}, celle-ci est la ${VERSION_CHAINE_FACADES} : à reposer si l’image a changé)` : '';
  return { texte: `Contre la vérité (mur de ${Math.round(w)} px, x de ${Math.round(vrai.x0)} à ${Math.round(vrai.x1)})${autre} : ` + ecarts.map((x) => x.nom + ' à ' + pc(x.e)).join(', ') + (pire > seuil ? ` : faux (au-delà de ${pc(seuil)}).` : ' : juste.'), juste: pire <= seuil };
}

/**
 * Ce qu'une pose explique de l'image prise pour la suite, jugee sur la silhouette du gabarit qu'elle pose (les angles a ses bouts,
 * l'egout tout le long) : le score, et s'il passe le test. Le gabarit juge la pose, il ne l'a pas cherchee (calageAncres.ts).
 */
function explicationDe(pose: AssemblageDuMur, e: EntreesFacade): Explication {
  return expliquer(pose, detecterSegments(pose.image), rectDeLaPose(pose.coins), e.hauteurM / e.largeurM, pose, e.gabarit);
}

const sc = (x: number) => dec(x, 2);

/**
 * Le controle de l'egout trouve par le gabarit, en clair (decision du proprietaire, 4 novembre 2026) : le gabarit se pose sur le sol, a
 * l'echelle de la largeur, et son egout tombe ou cette echelle le met ; l'ecart a l'egout trouve, en centimetres sur le mur et en part
 * de la largeur. Vide sans gabarit juge ou sans proportions du plan.
 */
function texteEgoutDuGabarit(ex: Explication, largeurM: number, seuil: number | null): string {
  const d = ex.ecartEgout;
  if (d === null || d === undefined) return '';
  const cm = Math.round(Math.abs(d) * largeurM * 100);
  const loin = seuil !== null && Math.abs(d) > seuil;
  const ou = cm === 0 ? 'sur l’égout trouvé' : `${cm} cm ${d > 0 ? 'sous' : 'au-dessus de'} l’égout trouvé (${pc(Math.abs(d))} de la largeur${loin ? `, au-delà de ${pc(seuil)}` : ''})`;
  return ` Gabarit posé sur le sol, à l’échelle de la largeur : son égout ${ou}` + (loin ? ' : l’égout trouvé, ou la hauteur du plan, est à confirmer.' : '.');
}
const px = (r: { x0: number; x1: number }) => `x de ${Math.round(r.x0)} à ${Math.round(r.x1)} (${Math.round(r.x1 - r.x0)} px)`;

/** Ce que l'arbitre a retenu sur l'assemblage des reperes, en clair (calageAncres.ts::calerParLesAncres). */
const POSE_CHERCHEE: Readonly<Record<PoseDuMurCherche, string>> = {
  'aretes': '',
  'mieux-expliquee': ' : une autre pose que celle des arêtes l’explique mieux',
  'plan-seul': ' : aucune pose des arêtes ne l’explique, celle du plan seul est supposée',
};

/**
 * E7 : d'ou viennent les coins du mur retenus (tires a la main, cherches sur l'assemblage des reperes, trouves sur la photo, sinon
 * predits par la prise de vue), et, sur l'image prise pour la suite, ce que le mur pose explique, juge sur sa silhouette. La verite et
 * la pose de Claude s'y mesurent sans rien changer.
 * Seul un mur tire a la main (des coins poses) est « a la main » : quatre reperes ne font que redresser la photo, le mur qu'on y cherche
 * ensuite est juge comme un mur trouve sans geste, verdict de l'arbitre compris (decision du proprietaire, 3 novembre 2026). Et un mur
 * tire a la main que sa silhouette n'explique pas est a confirmer, sa raison dite, jamais fait.
 */
const calage: Pas = (c) => {
  const { e, s } = c;
  const m = s.audit?.mesure, b = s.audit?.redressement;
  if (!b?.photos.length) return attend('une photo');
  if (!m) return { etat: 'echec', resume: 'La photo ne montre pas le mur : coins introuvables. Posez quatre repères sur une photo, puis rejouez.', verite: null };
  lireLesAngles(c);
  const juge = calageJuge(c);
  // Le mur confirme par la personne (V1) : tant que la chaine retient ce mur, l'E7 est « confirme par vous », sa propre note dite.
  const conf = e.prises.murConfirme;
  if (!conf) return juge;
  const confirme = estLeMurConfirme(conf, (s.calage?.photos ?? []).map((p, rang) => ({ rang, coins: p.coins })));
  if (!confirme) return { ...juge, resume: `Le mur confirmé ${jourEnClair(conf.le)} n’est plus celui que la chaîne retient (une photo, des repères ou un mur tiré ont changé) : à confirmer de nouveau. ` + juge.resume };
  // Ce que la silhouette en dit reste ecrit, comme une note : elle ne remet plus le mur en doute.
  const note = juge.resume.replace(', à vérifier : posez quatre repères, ou tirez les angles, l’égout et le sol.', '.').replace(' : à confirmer.', ' : noté, le mur reste celui que vous avez confirmé.');
  return { ...juge, etat: 'confirme', resume: `Mur confirmé par vous ${jourEnClair(conf.le)}. ` + note };
};

/**
 * Les angles de Claude contre le mur retenu, lus par l'E7 elle-meme sur la reponse rejouee (`o.ia`), sans attendre l'E8 : l'accord de
 * ses deux angles (une mesure, jamais candidate) que l'E7 montre a cote du calcul, et la base de « prendre la pose de Claude ». L'E8 le
 * reprend pour sa vue d'ensemble. Sans reponse, il n'y a pas de lecture de Claude.
 */
function lireLesAngles(c: Contexte): void {
  const { o, s, obj } = c;
  if (!o.ia) { s.ia = null; return; }
  const pose = s.calage?.pose ?? null, r = pose ? rectDeLaPose(pose.coins) : null;
  const avis = r && pose ? avisDeLIa(o.ia, pose, r, s.preparation?.pointes ?? [], obj['facades.enchainement.calageEcartMaxPart'], cadreDuRun(o.ia, s.audit?.imageRun ?? null)) : null;
  c.angles = { run: o.ia, avis };
  s.ia = avis?.sortie ?? { run: o.ia, reponse: observationsDuRun(o.ia), pose: null, ecart: null, accord: null };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « le 3 novembre 2026 », d'apres une date ISO (le jour seul : l'heure ne dit rien ici). */
function jourEnClair(iso: string): string {
  const [a, mo, j] = iso.slice(0, 10).split('-').map(Number);
  return a && mo && j ? `le ${j} ${MOIS[mo - 1]} ${a}` : '';
}

/** L'E7 sans la confirmation de la personne : son propre verdict. */
const calageJuge = ({ e, o, s, obj }: Contexte): Resultat => {
  const m = s.audit?.mesure as NonNullable<NonNullable<SortiesFacade['audit']>['mesure']>, b = s.audit?.redressement as BilanRedressement;
  const pose = s.calage?.pose ?? null;
  const main = b.photos.some((p) => p.coins === 'main');
  const cherche = main ? undefined : b.photos.find((p) => p.murCherche)?.murCherche;
  // Le mur des reperes que l'arbitre n'a pas lu (egout ou pied supposes) ou qu'il a pose d'apres le plan seul : il doute.
  const chercheDoute = !!cherche && (cherche.pose === 'plan-seul' || !cherche.lu);
  const note = m.confiance !== null ? ` (note du calage fin ${dec(m.confiance)})` : '';
  const origine = main ? (o.poseChoisie ? POSE_CHOISIE[o.poseChoisie] : 'Mur posé à la main.')
    : cherche ? 'Mur cherché sur l’assemblage de vos repères' + POSE_CHERCHEE[cherche.pose] + (cherche.lu ? '.' : ', égout ou sol supposé.')
    : m.coinsTrouves ? `Coins du mur trouvés sur la photo${note}.` : 'Coins du mur prédits par la prise de vue, à vérifier : posez quatre repères, ou tirez les angles, l’égout et le sol.';
  const hauteur = m.hauteurM !== null ? ` Hauteur à l’égout mesurée : ${dec(m.hauteurM)} m.` : '';
  const r = pose ? rectDeLaPose(pose.coins) : null;
  const verite = r && o.verite?.calage ? ecartAuVrai(r, o.verite.calage, obj['facades.enchainement.calageEcartMaxPart']) : null;
  // L'image prise pour la suite se juge sur la silhouette que la pose y pose (calageAncres.ts) : un egout faux sous un pignon, ou un bout
  // que le pignon d'un corps voisin prolonge, ne se voient qu'ainsi.
  if (pose && r && s.calage) {
    const ex = explicationDe(pose, e), passe = expliqueLaPhoto(ex, seuilsDuCalage(obj));
    s.calage.explication = ex;
    // Le sol pose dans le mur (l'appui des fenetres, un bandeau) : la matiere du mur continue sous lui, le pied est plus bas. Le score
    // d'explication n'y suffit pas (le sol y pese peu) : etalon 00, une photo sans EXIF au teleobjectif, sol a 13 % de la largeur.
    const sous = murSousLeSol(pose, r);
    const solDansLeMur = sous !== null && sous > obj['facades.enchainement.murSousLeSolMax'];
    // Le controle de l'egout trouve par le gabarit pose sur le sol, a l'echelle de la largeur (decision du proprietaire, 4 novembre 2026).
    const seuils = seuilsDuCalage(obj), controle = egoutControle(ex, seuils);
    const etat: EtatAffiche = !passe || !controle || solDansLeMur || (!main && (!m.coinsTrouves || chercheDoute)) ? 'a-confirmer' : 'ok';
    const sol = solDansLeMur ? ` Mais le mur continue sous le sol posé (${pc(sous)} de la bande sous lui) : le pied est plus bas, tirez le sol.` : '';
    return { etat, resume: origine + hauteur + ` Sur l’assemblage : ${px(r)}, ` + (passe ? `expliqué par sa silhouette (score ${sc(ex.score)}).` : `que sa silhouette n’explique pas (score ${sc(ex.score)}, angles ${sc(ex.angles[0])} et ${sc(ex.angles[1])}, égout ${sc(ex.egout)}) : à confirmer.`) + texteEgoutDuGabarit(ex, e.largeurM, seuils.ecartEgout ?? null) + sol, verite };
  }
  return { etat: main || (m.coinsTrouves && !chercheDoute) ? 'ok' : 'a-confirmer', resume: origine + hauteur, verite };
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
 * Le cadre de l'image qu'un run a lue, quand c'est celle du run de l'audit (le mur cadre, ImageDuRun) : la meme taille que l'image du
 * run que cette mesure prepare. Sinon l'assemblage (« Rappeler Claude » de la calibration). Une propriete du run, pas de la vue : la
 * calibration et l'audit le lisent pareil.
 */
function cadreDuRun(run: RunEnregistre, image: ImageDuRun | null): { egoutPart: number } | null {
  return image && run.image.largeur === image.largeur && run.image.hauteur === image.hauteur ? { egoutPart: image.egoutPart } : null;
}

/**
 * Ce que la reponse de Claude dit du mur retenu (E8) : sa pose contre la pose retenue (accord sous l'ecart admis, sinon divergence), et ses
 * pointes contre le gabarit. Une mesure : la pose retenue ne change pas, ni l'etat de l'etape (l'audit ne pose pas le mur par Claude).
 */
function avisDeLIa(run: RunEnregistre, image: AssemblageDuMur, retenue: RectIa, attendues: readonly { u: number; v: number }[], seuil: number, cadre: { egoutPart: number } | null): { sortie: IaDuRejeu; texte: string; angles: string | null; pointes: string } {
  const reponse = observationsDuRun(run);
  // Lue sur l'image du run de l'audit, la pose de Claude revient par les coins du mur qu'elle cadrait ; sinon, en parts de l'assemblage.
  const pose = !reponse ? null : cadre ? poseDeLIaSurLeMur(reponse, image.coins, cadre.egoutPart) : poseDeLIa(reponse, image.image);
  const ecart = pose ? ecartDesPoses(pose, retenue) : null;
  const sortie: IaDuRejeu = { run, reponse, pose, ecart, accord: null };
  // Une reponse enregistree sous une autre version de la chaine a lu une autre image : ses angles se mesurent, mais c'est dit.
  // Et une reponse lue sur un autre assemblage que celui de ce rejeu (une photo retiree, des reperes poses depuis) : sa taille le dit.
  const autreImage = !cadre && (run.image.largeur !== image.image.largeur || run.image.hauteur !== image.image.hauteur)
    ? `, lue sur un autre assemblage (${run.image.largeur} × ${run.image.hauteur} px ; celui de ce rejeu : ${image.image.largeur} × ${image.image.hauteur} px)` : '';
  const autre = (run.chaine !== VERSION_CHAINE_FACADES ? `, lue sur l’image de la chaîne ${run.chaine} (celle-ci est la ${VERSION_CHAINE_FACADES})` : '') + autreImage;
  const tete = `IA (${enteteDuRun(run)}${autre}) : `;
  if (!reponse) return { sortie, texte: tete + 'aucune passe lisible.', angles: null, pointes: '' };
  const pointes = pointesDeLIa(reponse, attendues) + escaladeDeLIa(reponse);
  if (!pose || ecart === null) return { sortie, texte: tete + 'Claude ne situe pas les deux angles du mur.' + pointes + surfaceDeLIa(reponse), angles: 'Claude ne situe pas les deux angles du mur.', pointes };
  const diverge = ecart > seuil;
  const angles = `ses angles posent le mur ${px(pose)}, à ${pc(ecart)} de la largeur du mur retenu : ` + (diverge ? 'les deux chemins divergent, à vérifier' : 'accord') + '.';
  return { sortie, texte: tete + angles + pointes + surfaceDeLIa(reponse), angles, pointes };
}

/** Ce que l'escalade a tranche contre le vote des passes (la regle de l'escalade, facade/regles/facades/ia.ts), en clair. */
function escaladeDeLIa(r: ObservationsFacade): string {
  if (!r.escalade) return '';
  const t = r.escalade.tranche;
  return ` Escalade (${r.escalade.modele}) : ` + (t.length ? `elle l’emporte sur ${t.join(', ')}.` : 'elle s’accorde avec le vote des passes.');
}

/** Le parement que Claude lit, et ses zones (colombage, bardage...). */
function surfaceDeLIa(r: ObservationsFacade): string {
  const zones = r.surface.zones.map((z) => `${z.type} de u ${dec(z.u0)} à ${dec(z.u1)}, v ${dec(z.v0, 1)} à ${dec(z.v1, 1)}`);
  return ` Parement : ${r.surface.principale}` + (zones.length ? ` ; zones : ${zones.join(', ')}` : '') + '.';
}

/**
 * E9 : la ligne du haut du mur lue sur la photo (jamais le gabarit). L'etat se juge sur cette ligne, celle que l'E10 lit (`hautLu`, lue
 * sur au moins `silhouetteColonnesMin` des colonnes) ; le mot de la bande au-dessus de l'egout n'est qu'une information. Sans elle, la
 * suite garde le gabarit du plan.
 */
const silhouette: Pas = ({ e, s, obj }) => {
  const m = s.audit?.mesure;
  if (!m) return attend(`le mur posé (${libelleEtape('calage')})`);
  s.forme = { lue: m.hautLu, diagnostic: null, masque: m.hautMasque };
  // Le haut lu, pose sur l'image prise pour la suite par les coins du mur (il est en parts du mur, comme le gabarit).
  const pose = s.calage?.pose, points = pose && m.hautLu?.length ? gabaritSurLaPhoto(m.hautLu, pose.coins) : null;
  // Les troncons ou le feuillage cache le haut : des bandes, du dessous de l'egout au-dessus du gabarit, que l'illustration grise.
  const plafond = Math.max(1, ...e.gabarit.map((p) => p.v)) + 0.3;
  const masques = pose ? (m.hautMasque?.troncons ?? []).flatMap((t) => { const q = gabaritSurLaPhoto([{ u: t.u0, v: 0.9 }, { u: t.u1, v: 0.9 }, { u: t.u1, v: plafond }, { u: t.u0, v: plafond }], pose.coins); return q ? [q] : []; }) : [];
  s.silhouette = points || masques.length ? { points: points ?? [], ...(masques.length ? { masques } : {}) } : null;
  const part = Math.round(obj['facades.enchainement.silhouetteColonnesMin'] * 100);
  // Le haut cache par un arbre (4 novembre 2026) : ses colonnes ne sont pas lues, le gabarit du plan y est garde (E10, le bilan).
  const vert = m.hautMasque ? ` Haut masqué par la végétation sur ${Math.round(m.hautMasque.part * 100)} % des colonnes${m.hautLu?.length ? ' : le gabarit du plan y est gardé' : ''}.` : '';
  if (!m.hautLu?.length) return { etat: 'a-confirmer', resume: `Le haut du mur se lit sur moins de ${part} % des colonnes (hors cadre, caché) : la suite garde le gabarit du plan.` + vert, verite: null };
  const mot = m.silhouette === 'indetermine' ? 'sans forme reconnue au-dessus de l’égout' : libelleSilhouette(m.silhouette);
  return { etat: 'ok', resume: `Le haut lu sur la photo (${m.hautLu.length} points) : ${mot}.` + vert, verite: null };
};

const MOTS_ELEMENT = { cheminee: 'une cheminée', lucarne: 'une lucarne' } as const;

/** Ce que Claude lit du haut (dit a l'E8) : le mot, le bout, les elements du toit, les appentis et les corps qu'il voit. */
function formeDeLIa(r: ObservationsFacade | null): string {
  if (!r) return '';
  const vus = [
    ...r.elements.map((x) => `${MOTS_ELEMENT[x.element]} à u ${dec(x.u)}`),
    ...r.calage.appentis.map((x) => `un appentis de u ${dec(x.debut)} à ${dec(x.fin)}`),
    ...r.calage.corps.map((x) => `un autre volume de u ${dec(x.debut)} à ${dec(x.fin)}`),
  ];
  return ` Claude lit : ${r.forme.silhouette === 'indetermine' ? 'un haut qu’il ne lit pas' : libelleSilhouette(r.forme.silhouette)}, bout ${r.forme.bout}` + (vus.length ? ` ; ${vus.join(', ')}` : '') + '.';
}

/** E11 : la texture du mur (et la bande au-dessus de l'egout) a l'echelle du plan ; la texture sans ombres, pour l'ecran seulement. */
const texture: Pas = ({ e, o, s }) => {
  if (!e.prises.photos.length) return attend('une photo');
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

/** Le partage des ouvertures du releve entre ce mur et les murs voisins (murVoisin.ts), sur les entrees ; null sans releve. */
function partageDuReleve(e: EntreesFacade, ouvertures: readonly OuvertureFacade[] | undefined): PartageOuvertures | null {
  return ouvertures ? partagerSousLesVoisins(e.prises.facade, e.prises.contour, ouvertures, e.voisines ?? []) : null;
}

/** Le nom d'un cote du contour dans une phrase : « sud (côté 3) ». */
const nomDuCote = (e: EntreesFacade) => (cote: number): string => nomFacade(e.prises.facade.orientation, cote);

/**
 * Les choix de la personne poses sur les ouvertures (lot C2) : le releve et l'accord portent alors les ouvertures choisies (ce que V3
 * relit, V4 ecrit, l'E14 compte), la liste du moteur gardee a part pour le rejeu suivant (`moteur`). Sans choix, rien ne bouge ; un choix
 * retire rend la liste du moteur. Rend les cles des elements dont le choix a change une ouverture.
 */
function ouverturesChoisies(e: EntreesFacade, s: SortiesFacade): string[] {
  const m = s.audit?.mesure;
  if (!m || !s.audit) return [];
  const releve = s.moteur?.releve ?? m.releve, accord = s.ia?.accord ?? null;
  const base = s.moteur?.ouvertures ?? accord?.ouvertures ?? releve.ouvertures;
  const r = ouverturesSelonLesChoix(e, accord, s.ia?.reponse ?? null, base, releve.ouvertures, m.devinees ?? s.analyse?.devinees ?? []);
  if (!r) {
    if (s.moteur) { s.audit = { ...s.audit, mesure: { ...m, releve }, }; if (s.ia?.accord) s.ia = { ...s.ia, accord: { ...s.ia.accord, ouvertures: [...base] } }; delete s.moteur; }
    return [];
  }
  s.moteur = { releve, ouvertures: base };
  s.audit = { ...s.audit, mesure: { ...m, releve: { ...releve, ouvertures: r.ouvertures } } };
  if (s.ia?.accord) s.ia = { ...s.ia, accord: { ...s.ia.accord, ouvertures: r.ouvertures } };
  return r.changees;
}

const ouvertures: Pas = ({ e, o, s, obj }) => {
  const a = s.analyse;
  if (!a) return attend(`le mur redressé (${libelleEtape('redressement')})`);
  const choisies = ouverturesChoisies(e, s);
  const n = a.ouvertures.length, d = a.devinees.length;
  // L'accord des boites de Claude est fait a l'E8 (la lecture de Claude) : les ouvertures qu'il coche se lisent ici, sans le redire.
  const accord = s.ia?.accord ?? null;
  // Les ouvertures sous le pignon d'un corps voisin : sur la facade du mur qui les porte, sinon gardees ici (murVoisin.ts).
  const partage = partageDuReleve(e, s.ia?.accord?.ouvertures ?? s.audit?.mesure?.releve.ouvertures);
  const voisin = partage ? texteDuPartage(partage, nomDuCote(e)) : '';
  const detecte = `${n} ouverture${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''}` + (d ? `, ${d} devinée${d > 1 ? 's' : ''} par la structure, à confirmer.` : ', aucune devinée.') + (voisin ? ' ' + voisin.charAt(0).toUpperCase() + voisin.slice(1) : '');
  // V3 (decision du proprietaire, 3 novembre 2026) : les ouvertures trouvees se relisent toujours avant V4 ; l'E12 n'est faite qu'apres
  // ce regard, tant que la detection rend celles que la personne a relues (au centimetre).
  const relues = e.prises.ouverturesRelues, detectees = s.audit?.mesure?.releve.ouvertures ?? [];
  const relu = !!relues && sontRelues(relues, detectees);
  const propre: EtatAffiche = d || accord?.bilan.seules ? 'a-confirmer' : 'ok';
  const etat: EtatAffiche = relu ? 'ok' : propre === 'ok' ? 'a-confirmer' : propre;
  const k = relues?.ouvertures.length ?? 0;
  const vosChoix = choisies.length ? ` Vos choix (Calcul, Claude, Manuel) changent ${pluriel(choisies.length, 'ouverture')} ; les ${detectees.length} sont à relire (V3).` : '';
  const resume = relu ? `Ouvertures relues par vous ${jourEnClair(relues.le)} : ${k} gardée${k > 1 ? 's' : ''}. La détection : ` + detecte + vosChoix
    : (relues ? `Les ouvertures relues ${jourEnClair(relues.le)} ne sont plus celles que la détection trouve : à relire. ` : '') + detecte + vosChoix + ' Relisez-les (V3) : vérifiez, ajoutez ou retirez, avant de valider la façade.';
  const vraies = o.verite?.ouvertures;
  if (!vraies?.length) return { etat, resume, verite: null };
  const m = contreLaVerite(vraies, a.ouvertures);
  const juste = m.rappel >= obj['facades.enchainement.rappelMin'] && m.precision >= obj['facades.enchainement.precisionMin'] && m.cotes !== null && m.cotes <= obj['facades.enchainement.cotesMaxM'] * 100;
  return { etat, resume, verite: { texte: `Contre la vérité (${vraies.length} ouvertures) : rappel ${pc(m.rappel)}, précision ${pc(m.precision)}, cotes ${cotesCm(m.cotes)} (médiane)` + (juste ? ' : objectifs atteints.' : ' : objectifs non atteints.'), juste } };
};

const cotesCm = (c: number | null) => (c === null ? '—' : dec(c, 1) + ' cm');

/** L'image qu'un run a lue, en clair : la ligne de l'exception acceptee (CLAUDE.md, « Rappeler Claude »), dite et jamais corrigee. */
const IMAGE_LUE = {
  imageRun: 'Image lue : celle du run de l’audit (la photo du relevé redressée jusqu’au haut de la façade).',
  assemblage: 'Image lue : l’assemblage (« Rappeler Claude » de la calibration ; l’audit envoie l’image du run : l’exception acceptée, les références du plancher de lecture 5.1.0 ont été lues sur l’assemblage).',
} as const;

/**
 * E8, la lecture de Claude : la reponse enregistree rejouee, sans reseau ni cout (l'appel est fait hors de l'orchestrateur : l'audit
 * apres sa mesure, la calibration par « Rappeler Claude »). L'accord de ses deux angles avec la pose retenue, dans le cadre de l'image
 * qu'il a lue ; ses pointes contre le gabarit ; ses boites accordees avec la detection (une boite seule reste decochee) ; les descentes
 * qu'une verticale confirme. Une mesure : la pose retenue ne change pas, ni l'etat du calage. Sans reponse : sautee, mode deterministe.
 */
const lectureIa: Pas = (c) => {
  const { e, o, s, obj } = c;
  // Sans reponse (le mode deterministe, choisi par un rejeu repris depuis ici) : plus rien de Claude dans ce rejeu.
  if (!o.ia) { s.ia = null; return sans('Mode déterministe : aucune réponse de Claude à rejouer.'); }
  const m = s.audit?.mesure, b = s.audit?.redressement;
  if (!b?.photos.length) return attend('une photo');
  if (!m) return attend(`le mur posé (${libelleEtape('calage')})`);
  const seuil = obj['facades.enchainement.calageEcartMaxPart'];
  const cadre = cadreDuRun(o.ia, s.audit?.imageRun ?? null);
  // Les angles, l'E7 les a lus dans ce rejeu ; un rejeu repris depuis ici (une autre reponse) les relit sur le mur de l'E7, sans lui.
  if (c.angles?.run !== o.ia) lireLesAngles(c);
  const ia = c.angles?.avis ?? null;
  if (!s.ia) s.ia = { run: o.ia, reponse: observationsDuRun(o.ia), pose: null, ecart: null, accord: null };
  // Ses boites accordees avec les ouvertures du releve que V4 ecrira, sur les aretes de l'elevation (decision 4 du proprietaire,
  // 3 novembre 2026 : une seule orchestration). Les descentes qu'il voit ne valent que la ou une verticale les confirme.
  const a = s.analyse, reponse = s.ia.reponse, rel = s.audit?.mesure;
  // Le releve du moteur, d'avant les choix de la personne d'un rejeu precedent (l'E12 les repose sur l'accord refait ici).
  const releve = s.moteur?.releve ?? rel?.releve;
  if (s.moteur && s.audit?.mesure) { s.audit = { ...s.audit, mesure: { ...s.audit.mesure, releve: s.moteur.releve } }; delete s.moteur; }
  if (a) {
    const cartes = reponse ? cartesAretes(a.elevation, a.pxParM) : null;
    const accord = reponse ? accorderOuvertures({ ouvertures: releve?.ouvertures ?? a.ouvertures, decochees: rel?.devinees ?? a.devinees, observations: reponse, cartes, largeurM: releve?.largeur ?? e.largeurM, hauteurM: releve?.hauteur ?? e.hauteurM }) : null;
    s.ia = { ...s.ia, accord, descentes: reponse ? descentesRetrouvees(reponse.modenature?.descentes ?? [], cartes, releve?.largeur ?? e.largeurM) : [] };
  }
  const image = cadre ? 'imageRun' : 'assemblage';
  c.lecture = { angles: ia?.angles ?? null, pointes: ia?.pointes ?? '', image };
  const accord = s.ia.accord ?? null;
  const tete = ia?.texte ?? `IA (${enteteDuRun(o.ia)}) : ` + (reponse ? 'Claude ne situe pas les deux angles du mur.' : 'aucune passe lisible.');
  const boites = accord ? ' ' + (texteAccord(accord.bilan) ?? 'Claude ne voit aucune ouverture') + '.' : '';
  // Le mur pose sur les angles choisis (lot C2) : la lecture a ete faite sur l'image d'avant cette pose ; elle est perimee, et le dit.
  const perimee = o.poseChoisie ? ' Le mur est posé sur les angles choisis : cette lecture a été faite sur l’image d’avant, elle est périmée ; rappelez Claude pour la refaire.' : '';
  const resume = tete + formeDeLIa(reponse) + boites + ' ' + IMAGE_LUE[image] + perimee;
  const diverge = s.ia.ecart !== null && s.ia.ecart > seuil;
  // A confirmer : aucune passe lisible, ou ses angles et le mur retenu divergent (deux chemins), ou la lecture perimee. Des angles qu'il ne situe pas ne disent rien.
  const etat: EtatAffiche = !reponse || diverge || perimee ? 'a-confirmer' : 'ok';
  // Les boites de Claude se mesurent aussi : toutes, puis les cochees (celles que la detection retrouve) ; c'est la mesure x1 contre x3.
  const vraies = o.verite?.ouvertures;
  if (!vraies?.length || !accord) return { etat, resume, verite: null };
  const toutes = contreLaVerite(vraies, accord.boites.map((x) => ({ ...x.ouverture, confiance: 1 }))), cochees = accord.boites.filter((x) => x.cochee);
  const precisionCochees = cochees.length ? contreLaVerite(vraies, cochees.map((x) => ({ ...x.ouverture, confiance: 1 }))).precision : 0;
  const juste = toutes.rappel >= obj['facades.enchainement.rappelMin'] && toutes.precision >= obj['facades.enchainement.precisionMin'];
  return { etat, resume, verite: { texte: `Boîtes de Claude contre la vérité (${vraies.length} ouvertures) : rappel ${pc(toutes.rappel)}, précision ${pc(toutes.precision)}, cotes ${cotesCm(toutes.cotes)} ; cochées (${cochees.length}) : précision ${pc(precisionCochees)}.`, juste } };
};

/**
 * E14, la validation (lot F5) : le bilan de la facade, la Facade que la validation V4 ecrira (ses dimensions, sa forme, la pose de sa
 * texture, ses ouvertures avec leur identifiant), le meme pour les deux. La seule difference de sortie est ici : l'audit attend la
 * personne (V4), la calibration montre le bilan sans rien ecrire.
 */
const validation: Pas = ({ e, o, s }) => {
  const m = s.audit?.mesure;
  if (!m) return attend(`le relevé du mur (${etapeFacade('texture').numero}, ${etapeFacade('ouvertures').numero})`);
  // Apres un run de Claude (le mode « IA », ce que l'audit fait apres le sien) : ses pointes, et les ouvertures accordees.
  // Les ouvertures sous le pignon d'un corps voisin qui vont sur la facade de ce mur quittent celle-ci ; V4 les y ecrit (murVoisin.ts).
  // Les ouvertures relues par la personne (V3), tant qu'elles valent pour cette detection : ce que V4 ecrira.
  const relues = e.prises.ouverturesRelues && sontRelues(e.prises.ouverturesRelues, m.releve.ouvertures) ? e.prises.ouverturesRelues.ouvertures : null;
  const partage = partageDuReleve(e, relues ?? s.ia?.accord?.ouvertures ?? m.releve.ouvertures);
  s.facade = bilanDeLaFacade({
    largeurM: e.largeurM, hauteurM: e.hauteurM, gabarit: e.gabarit, diagnostic: s.forme?.diagnostic ?? null, hautLu: hautLuAuPlan(s), masques: s.forme?.masque?.troncons ?? [],
    silhouette: m.silhouette, textureCalee: m.textureCalee, ouvertures: partage?.surLeMur ?? relues ?? m.releve.ouvertures, ecartLargeur: m.ecartLargeur, hauteurMesureeM: m.hauteurM,
    ...(s.ia?.reponse ? { pointesIa: lectureSelonLesChoix(e, s.ia.reponse, s.preparation?.pointes ?? []).reponse?.calage.pointes ?? s.ia.reponse.calage.pointes } : {}),
  });
  const ajoutes = partage?.ajouts.reduce((k, a) => k + a.ouvertures.length, 0) ?? 0;
  const voisin = ajoutes ? ` Et ${ajoutes} ouverture${ajoutes > 1 ? 's' : ''} sur la façade ${partage?.ajouts.map((a) => nomDuCote(e)(a.cote)).join(', ')}, dans le même pas.` : '';
  if (o.vue === 'audit') return { etat: 'a-confirmer', resume: texteBilan(s.facade) + voisin + ' Validez la façade pour l’écrire dans le projet (V4).', verite: null };
  return sans('Bilan : ' + texteBilan(s.facade) + voisin + ' La calibration n’écrit pas de façade : elle se valide dans l’audit (V4).');
};

/**
 * Le haut lu (E9, en hauteurs du mur trouve) ramene aux hauteurs du gabarit, celles du plan : le gabarit se pose sur le sol a l'echelle
 * de la largeur (`echelleGabarit`), si bien que le diagnostic (E10) et le bilan comparent le haut lu au gabarit pose, et non tendu entre
 * l'egout et le sol trouves.
 */
const hautLuAuPlan = (s: SortiesFacade): { u: number; v: number }[] | null => {
  const lue = s.forme?.lue;
  return lue ? [...gabaritALEchelle(lue, 1 / (s.calage?.echelleGabarit ?? 1))] : null;
};

const PAS: Record<IdEtape, Pas> = {
  preparation, prises, objectif, coins, redressement, assemblage, calage, lectureIa, silhouette,
  diagnostic: ({ e, o, s }) => {
    // La lecture de Claude selon les choix de la personne (lot C2) : sans choix, la reponse telle quelle.
    const l = lectureSelonLesChoix(e, s.ia?.reponse ?? null, s.preparation?.pointes ?? []);
    const r = etapeDiagnostic(e.toit ?? null, e.hauteurM, hautLuAuPlan(s), l.reponse, o.objectifs, o.verite?.toit, s.forme?.masque?.troncons ?? [], l.pris);
    s.forme = { lue: s.forme?.lue ?? null, diagnostic: r.diagnostic, masque: s.forme?.masque ?? null };
    return r.etape;
  },
  texture, ouvertures,
  toit: ({ s }) => etapeToit(s.forme?.diagnostic ?? null),
  validation,
};

/**
 * D'ou repart un rejeu demande depuis une etape : les etapes du groupe Image qui ne font que relire la chaine (E4, E5) repartent de son
 * premier pas (E3), ou elle est appelee ; sinon, de l'etape demandee.
 */
function departDuRejeu(id: IdEtape): IdEtape {
  return id === 'coins' || id === 'redressement' || id === 'assemblage' ? 'objectif' : id;
}

/** Une action d'une etape : son contrat (model/etapeFacade.ts), son etat, et ce qu'elle a dit, lu et rendu. */
function act(etape: IdEtape, id: string, etat: EtatEtape, plus: Omit<Partial<ActionEtape>, 'id' | 'libelle' | 'type' | 'etat'> = {}, type?: TypeAction): ActionEtape {
  return { ...actionDe(etape, id, type), etat, ...plus };
}

/** L'etat d'une etape, comme celui d'une action : ce qui n'a pas ete fait est saute. */
const etatFini = (e: EtatAffiche): EtatEtape => (e === 'a-venir' || e === 'en-cours' ? 'saute' : e);
const fait = (oui: boolean): EtatEtape => (oui ? 'ok' : 'saute');

/** L'image que la reponse rejouee a lue (une propriete du run, cadreDuRun) ; null sans reponse. */
function imageLue(o: OptionsEnchainement, s: SortiesFacade): 'imageRun' | 'assemblage' | null {
  return o.ia ? (cadreDuRun(o.ia, s.audit?.imageRun ?? null) ? 'imageRun' : 'assemblage') : null;
}

/** La part de la reponse rejouee que concerne une etape : l'appel du run, rejoue, et l'image qu'il a lue. */
const partDuRun = (c: Contexte) => ({ appel: 'run' as const, rejouee: !!c.o.ia, image: imageLue(c.o, c.s) });

/** Un element lu par Claude : sa cle stable, sa famille, les etapes qui le consomment, ses trois valeurs, la source retenue, le choix lu. */
function deClaude(c: Contexte, cle: string, famille: FamilleClaude, e: Omit<ElementAction, 'cle' | 'famille' | 'consommePar' | 'valeurs' | 'retenue' | 'choisie'>, calcul: ValeurElement | null, claude: ValeurElement | null, retenue: SourceElement | null): ElementAction {
  // La meme lecture que celle qui s'applique au calcul (choixSources.ts) : ce que l'ecran dit est ce que le moteur a fait.
  const { choisie, forcee, sansClaude, source: sourceLue } = sourceDe(c.e, cle, famille, claude !== null, retenue), f = FAMILLES_CLAUDE[famille];
  return { ...e, cle, famille, consommePar: f.consommePar, valeurs: { calcul, claude, manuel: choisie?.source === 'manuel' ? choisie.valeur ?? null : null }, retenue, choisie, forcee, sourceLue, ...(sansClaude ? { sansClaude } : {}) };
}

/** E7 : les deux angles du mur selon Claude, contre le mur retenu (accord, divergence), tels que l'E8 les a mesures ; jamais candidats. */
function anglesDeClaude(c: Contexte): ActionEtape {
  const ia = c.s.ia, seuil = c.obj['facades.enchainement.calageEcartMaxPart'];
  if (!ia?.reponse) return act('calage', 'angles', 'saute', { claude: partDuRun(c) });
  const statut = ia.ecart === null || !ia.pose ? 'non-situe' : ia.ecart > seuil ? 'divergent' : 'accord';
  // Le mur retenu (le calcul, en pixels de l'image prise pour la suite) : la pose de Claude n'est jamais candidate, le calcul reste.
  const pose = c.s.calage?.pose, retenu = pose?.coins.length === 4 ? rectDeLaPose(pose.coins) : null;
  return act('calage', 'angles', statut === 'divergent' ? 'a-confirmer' : statut === 'accord' ? 'ok' : 'saute', {
    claude: partDuRun(c), avant: { image: 'pose' }, apres: { image: 'ia', valeurs: { ecart: ia.ecart } },
    elements: [deClaude(c, 'angles', 'angles', { genre: 'pose', statut, type: 'angles', rect: null, details: ia.pose ? { x0: ia.pose.x0, x1: ia.pose.x1, y0: ia.pose.y0, y1: ia.pose.y1, ecart: ia.ecart } : {}, vers: null },
      retenu ? { x0: retenu.x0, x1: retenu.x1, y0: retenu.y0, y1: retenu.y1 } : null, ia.pose ? { x0: ia.pose.x0, x1: ia.pose.x1, y0: ia.pose.y0, y1: ia.pose.y1 } : null, 'calcul')],
  });
}

/** E9 : le haut selon Claude : le mot, le bout, ses pointes jugees contre le gabarit (la regle des pointes), ses appentis et autres volumes. */
function formeDeClaude(c: Contexte): ActionEtape {
  const r = c.s.ia?.reponse;
  if (!r) return act('silhouette', 'forme', 'saute', { claude: partDuRun(c) });
  const pointes = avisDesPointes(r, c.s.preparation?.pointes ?? []);
  const etendue = (famille: 'appentis' | 'corps') => (x: { debut: number; fin: number }, k: number): ElementAction =>
    deClaude(c, famille + ':' + k, famille, { genre: 'etendue', statut: 'lu', type: famille, rect: null, details: { u0: x.debut, u1: x.fin }, vers: null }, null, { u0: x.debut, u1: x.fin }, null);
  // Une pointe vue a la place d'une attendue garde la hauteur du LiDAR (le calcul) ; une pointe en plus ne pose rien (le diagnostic la
  // lit) ; une attendue que Claude ne voit pas reste celle du plan. Les vues sont dans l'ordre de la reponse, les manquantes apres.
  let vue = 0, manquante = 0;
  const elements: ElementAction[] = [
    deClaude(c, 'forme', 'forme', { genre: 'forme', statut: 'lu', type: r.forme.silhouette, rect: null, details: { bout: r.forme.bout }, vers: null }, null, { silhouette: r.forme.silhouette, bout: r.forme.bout }, null),
    ...pointes.map((p): ElementAction => {
      const cle = p.avis === 'manquante' ? 'pointe-attendue:' + manquante++ : 'pointe:' + vue++;
      const calcul = p.attendue !== null && p.attendue !== undefined ? { u: p.u, v: p.attendue } : null, claude = p.vue !== null && p.vue !== undefined ? { u: p.u, v: p.vue } : null;
      return deClaude(c, cle, 'pointe', { genre: 'pointe', statut: p.avis, type: 'pointe', rect: null, details: { u: p.u, vue: p.vue ?? null, attendue: p.attendue ?? null }, vers: null }, calcul, claude, p.avis === 'en-plus' ? 'claude' : 'calcul');
    }),
    ...r.calage.appentis.map(etendue('appentis')), ...r.calage.corps.map(etendue('corps')),
  ];
  return act('silhouette', 'forme', pointes.some((p) => p.avis !== 'accord') ? 'a-confirmer' : 'ok', { claude: partDuRun(c), avant: { image: 'pose' }, apres: { image: 'ia' }, elements });
}

/** E10 : les elements du toit que Claude voit, retenus quand le diagnostic en propose un a sa place (sa provenance le dit), sinon ecartes. */
function elementsDeClaude(c: Contexte): ActionEtape {
  const r = c.s.ia?.reponse;
  if (!r) return act('diagnostic', 'elements', 'saute', { claude: partDuRun(c) });
  const props = c.s.forme?.diagnostic?.elements ?? [], pres = reglagesIa()['facades.ia.pointeEcartU'];
  const elements = r.elements.map((x, i): ElementAction => {
    const k = props.findIndex((p) => p.provenance !== 'deterministe' && p.element === x.element && x.u >= p.u0 - pres && x.u <= p.u1 + pres);
    const p = k >= 0 ? props[k] : undefined;
    return deClaude(c, 'element-toit:' + i, 'element-toit', { genre: 'element', statut: k >= 0 ? 'retenu' : 'ecarte', type: x.element, rect: null, details: { u: x.u, confiance: x.confiance }, vers: k >= 0 ? k : null },
      p ? { element: p.element, u: p.u, u0: p.u0, u1: p.u1 } : null, { element: x.element, u: x.u }, p ? (p.provenance === 'ia' ? 'claude' : 'calcul') : null);
  });
  return act('diagnostic', 'elements', !elements.length ? 'saute' : 'ok', { claude: partDuRun(c), avant: { image: 'pose' }, apres: { image: 'forme' }, elements });
}

/** E11 : le parement et ses zones (qui ne sont jamais candidates de l'arbitre), et ce qui cache le mur, selon Claude : des lectures. */
function surfaceEtCacheDeClaude(c: Contexte): ActionEtape[] {
  const r = c.s.ia?.reponse;
  if (!r) return [act('texture', 'surface', 'saute', { claude: partDuRun(c) }), act('texture', 'cache', 'saute', { claude: partDuRun(c) })];
  const surface: ElementAction[] = [
    deClaude(c, 'parement', 'parement', { genre: 'parement', statut: 'lu', type: r.surface.principale, rect: null, details: { confiance: r.surface.confiance }, vers: null }, null, { principale: r.surface.principale }, null),
    ...r.surface.zones.map((z, k): ElementAction => deClaude(c, 'zone:' + k, 'zone', { genre: 'zone', statut: 'lu', type: z.type, rect: null, details: { u0: z.u0, u1: z.u1, v0: z.v0, v1: z.v1 }, vers: null }, null, { type: z.type, u0: z.u0, u1: z.u1, v0: z.v0, v1: z.v1 }, null)),
  ];
  const cache = r.calage.cache.map((x, k): ElementAction => deClaude(c, 'cache:' + k, 'cache', { genre: 'cache', statut: 'lu', type: x.quoi, rect: null, details: { u0: x.debut, u1: x.fin }, vers: null }, null, { quoi: x.quoi, u0: x.debut, u1: x.fin }, null));
  return [
    act('texture', 'surface', 'ok', { claude: partDuRun(c), apres: { image: 'texture' }, elements: surface }),
    act('texture', 'cache', cache.length ? 'ok' : 'saute', { claude: partDuRun(c), apres: { image: 'ia' }, elements: cache }),
  ];
}

/**
 * Les actions de chaque etape, lues sur les sorties que son pas vient d'ecrire (aucun calcul ici : des comptes et des references
 * d'images deja faites, `ImagesEtapes`). Une etape qui attend n'a pas d'action.
 */
const ACTIONS: Record<IdEtape, (r: Resultat, c: Contexte) => ActionEtape[]> = {
  preparation: (r, { e, s }) => [act('preparation', 'gabarit', etatFini(r.etat), { avant: { valeurs: { largeurM: e.largeurM, hauteurM: e.hauteurM, pointsDuGabarit: e.gabarit.length } }, apres: { valeurs: { rapport: s.preparation?.rapport ?? null, pointes: s.preparation?.pointes.length ?? 0 } } })],
  prises: (r, { e }) => {
    const n = e.prises.photos.length + e.prises.illisibles.length;
    return [act('prises', 'prendre', etatFini(r.etat), { manuel: { geste: etapeFacade('prises').optionManuelle ?? '', fait: n > 0 }, apres: { image: 'photos', valeurs: { photos: n, illisibles: e.prises.illisibles.length } } })];
  },
  objectif: (r, { e, s }) => {
    const photos = s.audit?.redressement.photos ?? [], compte = (src: string) => photos.filter((p) => p.objectif?.source === src).length;
    // L'optique de chaque photo qui en a une : la focale retenue, son champ, sa source, l'appareil (une lecture, la prise l'a deja lue).
    const elements: ElementAction[] = (e.prises.optiques ?? []).map(({ rang, optique: o }) => ({ genre: 'optique', statut: 'lu', type: o.sourceFocale, rect: null,
      details: { photo: rang + 1, focale35: o.focale35, champDeg: o.champDeg, sourceFocale: o.sourceFocale, appareil: o.modeleAppareil, largeurPx: o.source.largeurPx, hauteurPx: o.source.hauteurPx }, vers: null }));
    return [act('objectif', 'champ', etatFini(r.etat), { texte: r.resume, avant: { image: 'photos' }, apres: { valeurs: { exif: compte('exif'), fuites: compte('fuites'), appareil: compte('appareil'), suppose: compte('defaut'), parReperes: photos.filter((p) => parReperes(e.prises, p.rang)).length } }, ...(elements.length ? { elements } : {}) })];
  },
  coins: (r, { s }) => {
    const o = (s.calage?.photos ?? []).map((p) => p.origine), compte = (x: OrigineCoins) => o.filter((y) => y === x).length;
    const main = compte('main') > 0;
    return [
      act('coins', 'coins', etatFini(r.etat), { avant: { image: 'photos' }, apres: { valeurs: { trouves: compte('trouves'), predits: compte('devines'), main: compte('main'), reperes: compte('reperes') } } }),
      act('coins', 'poser', fait(main), { manuel: { geste: etapeFacade('coins').optionManuelle ?? '', fait: main } }),
    ];
  },
  redressement: (r, { e, s }) => {
    const b = s.audit?.redressement, reperes = (b?.photos ?? []).some((p) => parReperes(e.prises, p.rang));
    return [
      act('redressement', 'redresser', etatFini(r.etat), { avant: { image: 'photos' }, apres: { image: 'vues', valeurs: { redressees: b?.photos.filter((p) => p.statut !== 'echec').length ?? 0, photos: b?.photos.length ?? 0 } } }),
      act('redressement', 'reperes', fait(reperes), { manuel: { geste: etapeFacade('redressement').optionManuelle ?? '', fait: reperes } }),
    ];
  },
  assemblage: (r, { s }) => [
    act('assemblage', 'assembler', etatFini(r.etat), { avant: { image: 'vues' }, apres: { image: 'assemblage', valeurs: { fusion: s.audit?.redressement.fusion ?? null, assemblees: s.audit?.redressement.fusionnees.length ?? 0 } } }),
    // Une photo retiree n'est plus une entree : le processus ne voit pas qu'elle l'a ete.
    act('assemblage', 'retirer', 'saute', { manuel: { geste: etapeFacade('assemblage').optionManuelle ?? '', fait: null } }),
  ],
  calage: (r, c) => {
    const { e, s, obj } = c;
    const m = s.audit?.mesure, b = s.audit?.redressement, main = !!b?.photos.some((p) => p.coins === 'main'), ex = s.calage?.explication;
    const cherche: EtatEtape = !m ? (b?.photos.length ? 'echec' : 'saute') : main ? 'saute' : m.coinsTrouves ? 'ok' : 'a-confirmer';
    const passe = ex ? expliqueLaPhoto(ex, seuilsDuCalage(obj)) : null;
    return [
      act('calage', 'chercher', cherche, { avant: { image: 'assemblage' }, apres: { image: 'pose', valeurs: { coinsTrouves: m?.coinsTrouves ?? false, hauteurM: m?.hauteurM ?? null } } }),
      act('calage', 'juger', ex ? (passe ? 'ok' : 'a-confirmer') : 'saute', { apres: { image: 'pose', valeurs: ex ? { score: ex.score, angleGauche: ex.angles[0], angleDroit: ex.angles[1], egout: ex.egout, ecartEgout: ex.ecartEgout ?? null } : {} } }),
      anglesDeClaude(c),
      act('calage', 'tirer', fait(main), { manuel: { geste: etapeFacade('calage').optionManuelle ?? '', fait: main } }),
      act('calage', 'confirmer', r.etat === 'confirme' ? 'confirme' : e.prises.murConfirme ? 'a-confirmer' : 'saute', { manuel: { geste: 'confirmer le mur retenu (V1)', fait: r.etat === 'confirme' } }),
    ];
  },
  lectureIa: (r, { o, s, obj, lecture }) => {
    const run = o.ia ?? null, reponse = s.ia?.reponse ?? null, accord = s.ia?.accord ?? null;
    const image = imageLue(o, s);
    const claude = (appel: 'run' | 'enrichie' | 'toit') => ({ appel, rejouee: !!run, image });
    const lecture2 = (l: RunEnregistre['enrichie'], appel: 'enrichie' | 'toit') => act('lectureIa', appel, !l ? 'saute' : l.erreur ? 'echec' : 'ok', { claude: claude(appel), ...(l ? { texte: l.erreur ?? `${l.modele}, prompt v${l.prompt}, ${pluriel(l.sorties.length, 'passe lisible', 'passes lisibles')}` } : {}) });
    if (!run) return [act('lectureIa', 'run', 'saute', { claude: claude('run'), texte: r.resume }), lecture2(undefined, 'enrichie'), lecture2(undefined, 'toit'), ...['angles', 'pointes', 'boites'].map((id) => act('lectureIa', id, 'saute'))];
    return [
      act('lectureIa', 'run', reponse ? 'ok' : 'echec', { claude: claude('run'), texte: enteteDuRun(run) + '. ' + (image ? IMAGE_LUE[image] : '') }),
      lecture2(run.enrichie, 'enrichie'), lecture2(run.toit, 'toit'),
      act('lectureIa', 'angles', !reponse || s.ia?.ecart === null || s.ia?.ecart === undefined ? 'saute' : s.ia.ecart > obj['facades.enchainement.calageEcartMaxPart'] ? 'a-confirmer' : 'ok', { ...(lecture?.angles ? { texte: lecture.angles } : {}), avant: { image: 'pose' }, apres: { image: 'ia', valeurs: { ecart: s.ia?.ecart ?? null } } }),
      act('lectureIa', 'pointes', reponse ? 'ok' : 'saute', { ...(lecture?.pointes ? { texte: lecture.pointes.trim() } : {}), apres: { image: 'ia', valeurs: { vues: reponse?.calage.pointes.length ?? 0 } } }),
      act('lectureIa', 'boites', !accord ? 'saute' : accord.bilan.seules ? 'a-confirmer' : 'ok', { ...(accord ? { texte: (texteAccord(accord.bilan) ?? 'Claude ne voit aucune ouverture') + '.' } : {}), avant: { image: 'facade' }, apres: { image: 'ia', valeurs: accord ? { boites: accord.bilan.boites, retrouvees: accord.bilan.retrouvees, seules: accord.bilan.seules } : {} } }),
    ];
  },
  silhouette: (r, c) => [act('silhouette', 'lire', etatFini(r.etat), { avant: { image: 'pose' }, apres: { image: 'pose', valeurs: { points: c.s.audit?.mesure?.hautLu?.length ?? 0, masquee: c.s.forme?.masque?.part ?? 0 } } }), formeDeClaude(c)],
  diagnostic: (r, c) => {
    const { s } = c;
    const n = (s.forme?.diagnostic?.propositions.length ?? 0) + (s.forme?.diagnostic?.elements.length ?? 0);
    return [
      act('diagnostic', 'diagnostiquer', etatFini(r.etat), { avant: { image: 'pose' }, apres: { image: 'forme', valeurs: { propositions: n } } }),
      elementsDeClaude(c),
    ];
  },
  texture: (r, c) => [
    act('texture', 'texture', etatFini(r.etat), { avant: { image: 'pose' }, apres: { image: 'texture', valeurs: { pxParM: c.s.analyse?.pxParM ?? null, fusion: c.s.analyse?.fusion?.statut ?? null } } }),
    ...surfaceEtCacheDeClaude(c),
    act('texture', 'sansOmbres', fait(!!c.s.sansOmbres), { apres: { image: 'texture' } }, 'code'),
    act('texture', 'activerSansOmbres', 'saute', { manuel: { geste: etapeFacade('texture').optionManuelle ?? '', fait: null } }),
  ],
  ouvertures: (_r, c) => {
    const { e, o, s } = c;
    const a = s.analyse, rel = s.audit?.mesure, relues = e.prises.ouverturesRelues, relu = !!relues && sontRelues(relues, rel?.releve.ouvertures ?? []);
    const partage = a ? partageDuReleve(e, s.ia?.accord?.ouvertures ?? rel?.releve.ouvertures) : null, voisins = partage?.ajouts.reduce((k, x) => k + x.ouvertures.length, 0) ?? 0;
    // Les ouvertures calculees, celles que l'accord de l'E8 a lues (le releve, sinon l'analyse), et les boites de Claude telles que la
    // decision du moteur les a rangees (facade/regles/facades/ia.ts) : une lecture, rien n'est recalcule.
    const calculees = rel?.releve.ouvertures ?? a?.ouvertures ?? [], devinees = rel?.devinees ?? a?.devinees ?? [];
    const accord = s.ia?.accord ?? null;
    const confirmees = new Set((accord?.boites ?? []).filter((x) => x.avec === 'detectee' && x.vers !== null).map((x) => x.vers));
    const rect = (x: { x: number; y: number; l: number; h: number }) => ({ x: x.x, y: x.y, l: x.l, h: x.h });
    const detailsDe = (d: OuvertureFacade['details']): Record<string, string> => Object.fromEntries(Object.entries(d ?? {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    const elementsCalcules: ElementAction[] = [
      ...calculees.map((x, k): ElementAction => ({ genre: 'ouverture', statut: !accord ? 'absente' : confirmees.has(k) ? 'confirmee' : 'absente', type: x.type, rect: rect(x), details: detailsDe(x.details) })),
      ...devinees.map((x): ElementAction => ({ genre: 'ouverture', statut: 'devinee', type: x.type, rect: rect(x), details: detailsDe(x.details) })),
    ];
    const STATUT = { detectee: 'retrouvee', devinee: 'devinee-confirmee' } as const;
    // La cle d'une boite : son rang dans la lecture de Claude (la reponse votee), stable d'un rejeu a l'autre de la meme reponse.
    const lues = s.ia?.reponse?.ouvertures ?? [], cleDe = (ia: object) => 'ouverture:' + lues.indexOf(ia as never);
    const place = (x: { type: string; x: number; y: number; l: number; h: number }) => ({ type: x.type, x: x.x, y: x.y, l: x.l, h: x.h });
    // La source retenue : la detection garde sa place quand elle retrouve une boite (Claude n'apporte que ses details) ; une devinee
    // confirmee reste la devinee ; une boite seule est proposee, decochee (personne ne la retient tant qu'on ne la coche pas).
    const boites: ElementAction[] = accord ? [
      ...accord.boites.map((x): ElementAction => {
        const vers = x.vers === null ? undefined : x.avec === 'detectee' ? calculees[x.vers] : (rel?.devinees ?? a?.devinees ?? [])[x.vers];
        return deClaude(c, cleDe(x.ia), 'ouverture', { genre: 'boite', statut: x.avec ? STATUT[x.avec] : 'proposee', type: x.ia.type, rect: rect(x.ouverture), details: { ...x.ia.details, confiance: x.ia.confiance }, carreaux: x.ia.carreaux as Readonly<Record<string, unknown>> | null, vers: x.vers },
          vers ? place(vers) : null, place(x.ouverture), x.avec ? 'calcul' : null);
      }),
      ...accord.ecartees.map((x): ElementAction => deClaude(c, cleDe(x), 'ouverture', { genre: 'boite', statut: 'ecartee', type: x.type, rect: null, details: { ...x.details, confiance: x.confiance }, carreaux: x.carreaux as Readonly<Record<string, unknown>> | null, vers: null },
        null, { type: x.type, u0: x.u0, u1: x.u1, v0: x.v0, v1: x.v1 }, null)),
    ] : [];
    const image = imageLue(o, s);
    return [
      act('ouvertures', 'detecter', a ? 'ok' : 'saute', { avant: { image: 'facade' }, apres: { image: 'facade', valeurs: { trouvees: calculees.length, devinees: devinees.length } }, elements: elementsCalcules }),
      act('ouvertures', 'boites', !accord ? 'saute' : accord.bilan.seules ? 'a-confirmer' : 'ok', { claude: { appel: 'run', rejouee: !!o.ia, image },
        ...(accord ? { texte: (texteAccord(accord.bilan) ?? 'Claude ne voit aucune ouverture') + '.' } : {}), avant: { image: 'facade' },
        apres: { image: 'ia', valeurs: accord ? { boites: accord.bilan.boites, retrouvees: accord.bilan.retrouvees, devineesConfirmees: accord.bilan.devineesConfirmees, proposees: accord.bilan.seules, ecartees: accord.bilan.ecartees } : {} }, elements: boites }),
      act('ouvertures', 'voisins', fait(voisins > 0), { apres: { valeurs: { versLesVoisins: voisins } } }),
      act('ouvertures', 'relire', !a ? 'saute' : relu ? 'ok' : 'a-confirmer', { manuel: { geste: 'ajuster une ouverture calculée, prendre ou ajuster une boîte de Claude, en ajouter une, en retirer (V3)', fait: relu },
        ...(relues ? { apres: { valeurs: { gardees: relues.ouvertures.length, le: relues.le.slice(0, 10) } } } : {}) }),
    ];
  },
  toit: (r, { s }) => [act('toit', 'cocher', etatFini(r.etat), { manuel: { geste: (etapeFacade('toit').optionManuelle ?? '') + ' (V2)', fait: null }, apres: { valeurs: { propositions: (s.forme?.diagnostic?.propositions.length ?? 0) + (s.forme?.diagnostic?.elements.length ?? 0) } } })],
  validation: (_r, { o, s }) => [
    act('validation', 'bilan', fait(!!s.facade), { apres: { valeurs: { ouvertures: s.facade?.ouvertures.length ?? 0 } } }),
    // La calibration n'ecrit rien : V4 ne s'y fait pas ; dans l'audit, la personne valide apres le rejeu (facadeValidee.ts).
    act('validation', 'valider', o.vue === 'audit' && s.facade ? 'a-confirmer' : 'saute', { manuel: { geste: 'valider la façade (V4), ou ' + (etapeFacade('validation').optionManuelle ?? ''), fait: o.vue === 'audit' ? false : null } }),
  ],
};

/**
 * Les actions d'une etape calculee : celles de son contrat, puis la mesure contre la verite quand le cas en a une (en lecture seule :
 * elle ne change ni l'etat ni le resume, ni une sortie).
 */
function actionsDeLEtape(id: IdEtape, r: Resultat, c: Contexte): ActionEtape[] {
  if (r.etat === 'a-venir' || r.etat === 'en-cours') return [];
  const actions = ACTIONS[id](r, c);
  return r.verite ? [...actions, act(id, 'verite', r.verite.juste ? 'ok' : 'echec', { texte: r.verite.texte }, 'mesure')] : actions;
}

/**
 * Deroule l'enchainement d'une facade, etape par etape, et rend l'etat et les sorties de chacune : l'entree unique de l'audit et de la
 * calibration. Ne rejette jamais une etape qui doute : elle le dit (a confirmer, echec) et la suite continue sur ce qui reste (plutot un
 * resultat que rien). `depuis` reprend les sorties des etapes d'avant dans `precedent`.
 */
export async function derouler(e: EntreesFacade, o: OptionsEnchainement): Promise<Enchainement> {
  const obj = objectifsEnchainement(o.objectifs);
  const debut = o.depuis && o.precedent ? ETAPES_FACADE.findIndex((x) => x.id === departDuRejeu(o.depuis as IdEtape)) : 0;
  const c: Contexte = { e, o, obj, s: debut > 0 && o.precedent ? { ...o.precedent.sorties } : { ...SORTIES_VIDES } };
  const etapes: EtapeCalculee[] = [];
  const k0 = (id: IdEtape) => ETAPES_FACADE.findIndex((x) => x.id === id);
  for (const [k, def] of ETAPES_FACADE.entries()) {
    const avant = k < debut ? o.precedent?.etapes.find((x) => x.id === def.id) : undefined;
    if (avant) { etapes.push(avant); continue; }
    if (o.arrete?.()) { etapes.push({ id: def.id, etat: 'a-venir', resume: 'Arrêté avant cette étape.', verite: null, actions: [] }); continue; }
    o.surEtape?.(def.id, 'en-cours');
    await o.rendreLaMain?.();
    const r = avecLeDouteDuMur(def.id, await PAS[def.id](c), etapes);
    etapes.push({ id: def.id, ...r, actions: [] });
    o.surEtape?.(def.id, r.etat, r.resume);
  }
  // Les actions se lisent une fois le rejeu fini : le calage montre les angles de Claude, qu'il lit lui-meme (relus par l'E8 quand un
  // rejeu repris depuis elle change de reponse). Une etape
  // reprise d'un rejeu precedent garde les siennes (le calage les relit si l'E8 a ete refaite). Elles ne changent rien au calcul.
  const refaite = (id: IdEtape) => k0(id) >= debut || (id === 'calage' && k0('lectureIa') >= debut);
  const avecActions = etapes.map((x) => (refaite(x.id) ? { ...x, actions: actionsDeLEtape(x.id, x, c) } : x));
  // Les angles du mur pris de Claude, ou poses par la personne (lot C2) : ils deviennent le mur pose a la main sur chaque photo de
  // l'image prise pour la suite (une entree de la chaine, comme un mur tire), et le cas se rejoue entier une fois ; sans ce choix, rien.
  const choisie = o.poseChoisie ? null : poseSelonLesChoix(e, c.s.ia?.pose ?? null);
  const retours = c.s.audit?.retours ?? [];
  if (choisie && c.s.calage?.pose && retours.length) {
    const r = choisie.rect, coins = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
    const corrections = { ...e.prises.corrections };
    for (const [rang, cs] of murAjusteSurLesPhotos({ retours }, coins)) corrections[String(rang)] = { ...corrections[String(rang)], coins: cs };
    const reste = { ...o, poseChoisie: choisie.source };
    delete reste.depuis; delete reste.precedent;
    return derouler({ ...e, prises: { ...e.prises, corrections } }, reste);
  }
  return { etapes: avecActions, sorties: c.s, versions: { chaine: VERSION_CHAINE_FACADES, objectifs: EMPREINTE_OBJECTIFS, ...(o.ia ? { ia: EMPREINTE_IA } : {}) } };
}

/** L'etape calculee d'un rejeu. */
export function etapeDe(r: Enchainement, id: IdEtape): EtapeCalculee {
  return r.etapes.find((x) => x.id === id) ?? { id, etat: 'a-venir', resume: libelleEtape(id) + ' : pas encore calculée.', verite: null, actions: [] };
}

// ------------------------------------------------------------------------------------------------
// Un cas de calibration dans l'enchainement : la premiere des deux differences (d'ou viennent les entrees)
// ------------------------------------------------------------------------------------------------

/** Les reperes d'une photo d'un cas, s'ils sont quatre. */
export const reperesDe = (p: CasReel['photos'][number] | undefined): P2[] | null => (p?.reperes?.length === 4 ? p.reperes : null);

/** Ce que la personne avait pose sur les photos d'un cas : son mur ajuste a la main, ses reperes. */
export const originesDuCas = (cas: CasReel): Record<number, OrigineCoins> =>
  Object.fromEntries(cas.photos.flatMap((p, k): [number, OrigineCoins][] => (p.murALaMain ? [[k, 'main']] : reperesDe(p) ? [[k, 'reperes']] : [])));

/** Le cote d'un cas qui n'a pas garde celui de l'audit (un cas d'avant, un cas ecrit a la main) : le mur seul, face au sud. */
function facadeParDefaut(L: number, H: number): Facade {
  return { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
}

/**
 * La prise de vue d'une photo d'un cas : celle de l'audit, gardee avec le cas ; sinon, pour un cas qui ne l'a pas (d'avant, ou ecrit a
 * la main), une photo sans capteurs, comme une photo importee dans l'audit, son champ tire de la focale du cas quand il la donne.
 */
function priseDuCas(p: CasReel['photos'][number], image: Image | null): PrisePhoto | null {
  if (p.prise) return p.prise;
  // Une photo sans position du telephone mais avec son optique : son objectif vient de l'optique (prisesFacade.ts::objectifDeLaPhoto).
  if (p.optique) return null;
  if (!(p.focalePx && p.focalePx > 0) || !image) return null;
  const champDeg = (2 * Math.atan(Math.max(image.largeur, image.hauteur) / 2 / p.focalePx) * 180) / Math.PI;
  return { t: '', x: 0, y: 0, lat: null, lon: null, precisionM: null, azimutDeg: null, sourceAzimut: null, champDeg, sourceFocale: 'exif' };
}

/**
 * Les entrees de l'enchainement pour un cas : ce que l'audit aurait eu sous la main pour cette facade. Ses dimensions et son gabarit du
 * plan, le cote du contour et ses photos avec leur prise de vue (gardes avec le cas tire d'un audit), et les corrections de la personne :
 * ses reperes, et le mur pose a la main. Les autres coins d'un cas ne sont pas une entree : l'audit les cherche, la calibration aussi.
 */
export function entreesDuCas(cas: CasReel, images: readonly (Image | null)[], jpeg: (img: Image) => string = () => ''): EntreesFacade {
  const L = cas.largeurM, H = cas.hauteurM;
  const facade: Facade = cas.facade ? { ...cas.facade, largeur: L, hauteur: H } : facadeParDefaut(L, H);
  const contour = cas.contour?.length ? cas.contour : [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }];
  const corrections: Record<string, CorrectionRedressement> = {};
  cas.photos.forEach((p, k) => {
    const r = reperesDe(p);
    if (r || p.murALaMain) corrections[String(k)] = { ...(r ? { reperes: r } : {}), ...(p.murALaMain ? { coins: p.coins } : {}) };
  });
  const photos = cas.photos.map((p, rang) => { const image = images[rang] ?? null; return { rang, image, prise: priseDuCas(p, image), optique: p.optique ?? null }; });
  return {
    largeurM: L, hauteurM: H, gabarit: cas.gabarit ?? GABARIT_RECTANGLE, ...(cas.toit ? { toit: cas.toit } : {}),
    prises: prisesDeLaFacade({ facade, contour, photos, corrections, murConfirme: cas.murConfirme ?? null, ouverturesRelues: cas.ouverturesRelues ?? null, jpeg }),
    // Les choix et les forcages de la personne (lot C2), gestes du cas comme ses reperes ; absents d'un cas d'avant : rien ne change.
    ...(cas.choix?.length ? { choix: lireChoix(cas.choix) } : {}), ...(cas.forcages?.length ? { forcages: lireForcages(cas.forcages) } : {}),
  };
}

/** La verite d'un cas : son mur vrai sur l'assemblage, ses ouvertures annotees. */
export const veriteDuCas = (cas: CasReel): VeriteFacade => ({ ...(cas.calageVrai ? { calage: cas.calageVrai } : {}), ouvertures: cas.ouvertures, ...(cas.toitVrai ? { toit: cas.toitVrai } : {}) });

/**
 * Le cas apres un rejeu : les coins retenus sur chaque photo (sauf un mur pose a la main, garde), comme memoire de ce que la chaine a vu
 * (les reperes proposes par defaut, le mur a ajuster sur la photo). Ils ne sont pas une entree du rejeu suivant. Des coins retrouves :
 * la silhouette d'un ancien cas (posee sur d'autres coins) ne vaut plus.
 */
export function casApresRejeu<C extends CasReel>(cas: C, r: Enchainement): C {
  const photos = r.sorties.calage?.photos;
  if (!photos) return cas;
  return { ...cas, photos: cas.photos.map((p, k) => { const q = photos[k]; if (!q || q.coins.length !== 4 || p.murALaMain || q.coins === p.coins) return p; const n = { ...p, coins: q.coins }; delete n.silhouette; return n; }) };
}

/**
 * L'option manuelle de l'E7 : le mur pose a la main sur l'image prise pour la suite (ses coins), ramene sur chaque photo de cette image
 * (image -> vue de face -> photo) et pose comme un mur ajuste a la main. Les autres photos gardent leurs coins.
 */
export function casCaleALaMain<C extends CasReel>(cas: C, r: Enchainement, coins: readonly P2[]): C {
  const retours = r.sorties.audit?.retours;
  return retours?.length ? casAvecLeMur(cas, murAjusteSurLesPhotos({ retours }, coins)) : cas;
}

/**
 * « Revenir au mur cherché » (calibration, revue des etapes) : le cas sans le mur pose a la main sur cette photo, ni sur les photos de
 * l'assemblage qu'elle partage (le mur tire sur l'assemblage s'y etait pose d'un coup), comme « Revenir à l'automatique » dans l'audit
 * retire le mur tire de toutes. Leurs coins restent ceux du dernier rejeu (un point de depart, pas une entree) : la chaine cherche le
 * mur de nouveau. Les reperes restent, ils ont leur propre retrait.
 */
export function casSansLeMur<C extends CasReel>(cas: C, rang: number, r: Enchainement | null): C {
  const rangs = new Set([rang, ...(r?.sorties.audit?.retours ?? []).map((x) => x.rang)]);
  return { ...cas, photos: cas.photos.map((p, i) => { if (!rangs.has(i) || !p.murALaMain) return p; const q = { ...p }; delete q.murALaMain; delete q.silhouette; return q; }) };
}

/** Le cas avec le mur pose a la main sur ces photos (par rang, ses coins) : la silhouette d'avant, posee sur d'autres coins, s'en va. */
export function casAvecLeMur<C extends CasReel>(cas: C, parPhoto: ReadonlyMap<number, readonly P2[]>): C {
  return { ...cas, photos: cas.photos.map((p, i) => { const c = parPhoto.get(i); if (!c) return p; const q = { ...p, coins: c.map((x) => ({ ...x })), murALaMain: true }; delete q.silhouette; return q; }) };
}

/**
 * L'assemblage du rejeu tel que « Ajuster l'égout et le sol » le montre : celui de l'audit, le meme geste. Null avec moins de deux
 * photos assemblees : la photo seule suffit.
 */
export function assemblageDuRejeu(r: Enchainement): AssemblageAAjuster | null {
  return r.sorties.audit?.assemblage ?? null;
}

/**
 * Un cas prepare pour la mesure (la descente des reglages, le corpus reel) : rejoue par l'enchainement, comme dans l'audit, avec sa
 * verite. `premiereSeule` : la premiere photo seule (la mesure « une photo »). `prepare` est null quand rien ne se redresse.
 */
export async function preparerPourLaMesure(cas: CasReel, images: readonly Image[], premiereSeule = false, chercherCoins: (e: EntreeRecherche) => Promise<ResultatRecherche> = async (q) => rechercher(q)): Promise<{ r: Enchainement; prepare: CasPrepare | null }> {
  const c = premiereSeule ? { ...cas, photos: cas.photos.slice(0, 1) } : cas;
  const r = await derouler(entreesDuCas(c, premiereSeule ? images.slice(0, 1) : images), { vue: 'calibration', chercherCoins, verite: veriteDuCas(cas) });
  return { r, prepare: r.sorties.analyse ? { cas, ...r.sorties.analyse } : null };
}
