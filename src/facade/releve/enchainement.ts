// L'orchestrateur de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 ter.4) : les etapes E0 a E9 dans l'ordre du
// tableau, l'etat de chacune (son objectif atteint ou non, regles/facades/enchainement.json), et ce que chacune rend a la suivante.
// Pur, sans React ni DOM. Il APPELLE la chaine existante (vuesDeFace, mosaiqueDesVues, murSurLAssemblage, redresserEtFusionner,
// analyserLeMur, fondreLesVues) sans la modifier (decision 16) : un rejeu donne les memes images et les memes cotes qu'avant.
//
// La calibration est son premier consommateur (lot F0) : l'editeur d'un cas rejoue un cas etape par etape, la mesure prepare les
// cas valides. L'audit (F3) et le releve (F6) l'appelleront a leur tour ; aucun ne reordonne les etapes lui-meme (§8 bis.1).

import { ETAPES_FACADE, etapeFacade, type EtatAffiche, type IdEtape } from '../../model/etapeFacade.js';
import { EMPREINTE_OBJECTIFS, objectifsEnchainement, type Objectifs } from '../regles/facades/enchainement.js';
import { GABARIT_RECTANGLE, gabaritSurLaPhoto, type GabaritMur } from '../gabaritMur.js';
import { analyserLAssemblage, analyserLeMur, fondreLesVues, type AssemblageDuMur, type MurAnalyse, type PhotoDuMur } from '../analyseMur.js';
import { inverser, type RedressementFuites } from '../vision/redressementFuites.js';
import { silhouetteLue, vuesDeFace, type ResultatMosaique } from '../vision/mosaiqueFuites.js';
import { appliquerSimilitude, inverse } from '../vision/ransac.js';
import { appliquer, type Image, type P2 } from '../vision/homographie.js';
import { sansOmbres } from '../vision/sansOmbres.js';
import type { ResultatFusion } from '../fusion.js';
import { mosaiqueDeLaSerie, murDeLaSerie, type CoinsDeSerie } from './coinsAuto.js';
import { priseSansCapteurs, redresserEtFusionner, VERSION_CHAINE_FACADES } from './chaine.js';
import { avisFusion } from './analyseSerie.js';
import type { EntreeRecherche, ResultatRecherche } from './serie.js';
import type { Facade } from '../../geometry/cotesVusDeDehors.js';
import type { CorrectionRedressement } from '../../model/auditParcelle.js';
import { juger, type AnalyseDuMur, type CasPrepare, type CasReel, type OuvertureVraie } from '../corpusReel.js';

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
}

/** La verite d'un cas de calibration, pour la mesure de chaque etape (§7.3). */
interface VeriteFacade {
  /** Le mur vrai sur l'assemblage, en pixels (bouts, et l'egout et le sol quand on les connait). */
  calage?: CasReel['calageVrai'];
  /** Les ouvertures vraies, en metres. */
  ouvertures?: readonly OuvertureVraie[];
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
   * redresse et assemble en un appel : E2 a E4 se lisent alors sur ce qu'elle rend.
   */
  image: 'assemblage' | 'chaine';
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
  /** E4 : les coins retenus sur chaque photo et leur origine, ce qui doute, et le mur pose sur l'assemblage pris pour la suite. */
  calage: { photos: { coins: P2[]; origine: OrigineCoins | null }[]; message: string | null; pose: AssemblageDuMur | null } | null;
  /** E5 : le haut du mur lu sur l'image, en pixels de l'assemblage pris, et sa forme. */
  silhouette: { points: P2[]; forme: 'droite' | 'pignon' | 'rampe' } | null;
  /** E6, E7 : l'analyse du mur. */
  analyse: AnalyseDuMur | null;
  /** E6 : la texture sans les ombres de la photo (`illustrer`). */
  sansOmbres: Image | null;
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
  versions: { chaine: number; objectifs: string };
}

const SORTIES_VIDES: SortiesFacade = { preparation: null, vues: null, mosaique: null, serie: null, calage: null, silhouette: null, analyse: null, sansOmbres: null };

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

/** Les sommets du gabarit au-dessus de l'egout, plus hauts que leurs voisins : les pointes que la photo devrait montrer. */
function pointesDuGabarit(g: GabaritMur): { u: number; v: number }[] {
  return g.filter((p, i) => p.v > 1 + 1e-6 && p.v >= (g[i - 1]?.v ?? 0) && p.v >= (g[i + 1]?.v ?? 0)).map((p) => ({ u: p.u, v: p.v }));
}

const preparation: Pas = ({ e, s }) => {
  const rapport = e.hauteurM / e.largeurM, pointes = pointesDuGabarit(e.gabarit);
  s.preparation = { rapport, pointes };
  const forme = e.gabarit.length <= 2 ? 'un rectangle (aucun corps lu)' : pointes.length ? `${pointes.length} pointe${pointes.length > 1 ? 's' : ''} (u ${pointes.map((p) => dec(p.u)).join(', ')}, à ${pointes.map((p) => dec(p.v, 1)).join(', ')} fois l’égout)` : 'un haut sans pointe';
  return { etat: 'ok', resume: `Mur de ${dec(e.largeurM)} × ${dec(e.hauteurM)} m (rapport ${dec(rapport, 3)}), gabarit : ${forme}.`, verite: null };
};

const prises: Pas = ({ e, obj }) => {
  const n = e.photos.length;
  return n >= obj['facades.enchainement.photosMin']
    ? { etat: 'ok', resume: `${n} photo${n > 1 ? 's' : ''} du mur.`, verite: null }
    : { etat: 'echec', resume: 'Aucune photo : prenez ou choisissez une photo du mur entier.', verite: null };
};

/** L'etat d'une part : objectif atteint, en partie, ou rien. */
const selonLaPart = (fait: number, total: number, objectif: number): EtatAffiche => (total > 0 && fait / total >= objectif ? 'ok' : fait > 0 ? 'a-confirmer' : 'echec');

const redressement: Pas = (c) => {
  const { e, o, s, obj } = c;
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

const assemblage: Pas = ({ e, o, s, obj }) => {
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

const calage: Pas = async ({ e, o, s, obj }) => {
  if (!e.photos.length) return attend('une photo');
  if (o.image === 'chaine') {
    const pose = s.analyse?.assemblage ?? null;
    s.calage = { photos: e.photos.map((p) => ({ coins: p.coins, origine: p.murALaMain ? 'main' : null })), message: null, pose };
    if (!pose) return sans('Le mur est posé par les coins du cas sur chaque photo, sans assemblage.');
    const r = rectDeLaPose(pose.coins);
    return { etat: 'ok', resume: `Mur posé par les coins du cas : x de ${Math.round(r.x0)} à ${Math.round(r.x1)} (${Math.round(r.x1 - r.x0)} px) sur l’assemblage.`, verite: o.verite?.calage ? ecartAuVrai(r, o.verite.calage, obj['facades.enchainement.calageEcartMaxPart']) : null };
  }
  s.serie = s.vues && s.mosaique ? murDeLaSerie(s.vues, s.mosaique, e.largeurM, e.hauteurM, e.gabarit) : null;
  s.calage = o.coins === 'chercher' ? await chercherLesCoins(e, o) : { photos: e.photos.map((p) => ({ coins: p.coins, origine: p.murALaMain ? 'main' : p.reperes ? 'reperes' : null })), message: null, pose: null };
  s.calage.pose = s.serie ? poseSurLAssemblage(s.serie, s.calage.photos) : null;
  const mur = s.serie?.assemblage.mur;
  if (!mur || !s.calage.pose) return { etat: 'echec', resume: 'Aucun mur sur l’assemblage : posez quatre repères, puis rejouez.' + (s.calage.message ? ' ' + s.calage.message : ''), verite: null };
  const r = rectDeLaPose(s.calage.pose.coins);
  const supposes = [mur.egout ? '' : 'l’égout', mur.pied ? '' : 'le sol', mur.cotes ? '' : 'les bouts'].filter(Boolean);
  const devines = s.calage.photos.map((p, k) => (p.origine === 'devines' ? k + 1 : 0)).filter(Boolean);
  const resume = `Mur cherché sur l’assemblage : x de ${Math.round(mur.x0)} à ${Math.round(mur.x1)} (${Math.round(mur.x1 - mur.x0)} px)` + (supposes.length ? `, ${supposes.join(', ')} supposé${supposes.length > 1 ? 's' : ''}` : ', égout, sol et bouts trouvés')
    + `. Mur retenu : x de ${Math.round(r.x0)} à ${Math.round(r.x1)} (${Math.round(r.x1 - r.x0)} px).` + (devines.length ? ` Coins devinés sur la photo ${devines.join(', ')}, à vérifier.` : '') + (s.calage.message ? ' ' + s.calage.message : '');
  return { etat: supposes.length || devines.length ? 'a-confirmer' : 'ok', resume, verite: o.verite?.calage ? ecartAuVrai(r, o.verite.calage, obj['facades.enchainement.calageEcartMaxPart']) : null };
};

const silhouette: Pas = ({ s }) => {
  const pose = s.calage?.pose;
  if (!pose) return attend('le mur posé (É4)');
  const lue = silhouetteLue(pose, rectDeLaPose(pose.coins));
  if (!lue) return { etat: 'a-confirmer', resume: 'Le haut du mur ne se lit pas à la teinte (moins de la moitié des colonnes) : la suite garde le gabarit.', verite: null };
  s.silhouette = { points: lue.silhouette, forme: lue.forme };
  const mot = { droite: 'une ligne droite', pignon: 'un pignon (une ou plusieurs pointes)', rampe: 'une rampe' }[lue.forme];
  return { etat: 'ok', resume: `Le haut lu sur l’image : ${mot}, ${lue.silhouette.length} sommets.`, verite: null };
};

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

const ouvertures: Pas = ({ o, s, obj }) => {
  const a = s.analyse;
  if (!a) return attend('le mur redressé (É6)');
  const n = a.ouvertures.length, d = a.devinees.length;
  const resume = `${n} ouverture${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''}` + (d ? `, ${d} devinée${d > 1 ? 's' : ''} par la structure, à confirmer.` : ', aucune devinée.');
  const vraies = o.verite?.ouvertures;
  if (!vraies?.length) return { etat: d ? 'a-confirmer' : 'ok', resume, verite: null };
  const j = juger(vraies, a.ouvertures);
  const rappel = j.vp / vraies.length, precision = n ? j.vp / n : 0;
  const cotes = [...j.cotes].sort((x, y) => x - y)[Math.floor(j.cotes.length / 2)] ?? null;
  const juste = rappel >= obj['facades.enchainement.rappelMin'] && precision >= obj['facades.enchainement.precisionMin'] && cotes !== null && cotes <= obj['facades.enchainement.cotesMaxM'] * 100;
  return { etat: d ? 'a-confirmer' : 'ok', resume, verite: { texte: `Contre la vérité (${vraies.length} ouvertures) : rappel ${pc(rappel)}, précision ${pc(precision)}, cotes ${cotes === null ? '—' : dec(cotes, 1) + ' cm'} (médiane)` + (juste ? ' : objectifs atteints.' : ' : objectifs non atteints.'), juste } };
};

const PAS: Record<IdEtape, Pas> = {
  preparation, prises, redressement, assemblage, calage, silhouette,
  diagnostic: () => sans('Le diagnostic de forme vient avec le lot F4.'),
  texture, ouvertures,
  toit: () => sans('Le toit par le moteur vient avec le lot F4.'),
  validation: () => sans('La validation de la façade vient avec le lot F5 ; la calibration marque le cas « relu sur la photo ».'),
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
  return { etapes, sorties: c.s, versions: { chaine: VERSION_CHAINE_FACADES, objectifs: EMPREINTE_OBJECTIFS } };
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
    largeurM: cas.largeurM, hauteurM: cas.hauteurM, gabarit: cas.gabarit ?? GABARIT_RECTANGLE,
    photos: cas.photos.map((p, k) => ({ image: images[k] as Image, coins: p.coins, reperes: reperesDe(p), focalePx: p.focalePx ?? null, murALaMain: !!p.murALaMain })),
  };
}

/** La verite d'un cas : son mur vrai sur l'assemblage, ses ouvertures annotees. */
export const veriteDuCas = (cas: CasReel): VeriteFacade => ({ ...(cas.calageVrai ? { calage: cas.calageVrai } : {}), ouvertures: cas.ouvertures });

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
  const parPhoto = sr.vues.map((v, i) => {
    const place = sr.assemblage.places[i], inv = place ? inverse(place) : null;
    return v && inv ? coins.map((q) => { const p = appliquer(v.versPhoto, appliquerSimilitude(inv, q)); return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }) : null;
  });
  return { ...cas, photos: cas.photos.map((p, i) => { const c = parPhoto[i]; return c ? { ...p, coins: c, murALaMain: true } : p; }) };
}

/**
 * Un cas prepare pour la mesure (la descente des reglages, le corpus reel) : ses coins tels quels, l'image de la chaine. `prepare`
 * est null quand rien ne se redresse.
 */
export async function preparerPourLaMesure(cas: CasReel, images: readonly Image[], premiereSeule = false): Promise<{ r: Enchainement; prepare: CasPrepare | null }> {
  const r = await derouler(entreesDuCas(cas, images), { coins: 'garder', image: 'chaine', premiereSeule, verite: veriteDuCas(cas) });
  return { r, prepare: r.sorties.analyse ? { cas, ...r.sorties.analyse } : null };
}
