// Le banc de facades : rejoue le corpus sur la detection et l'analyse telles qu'elles sont, et ecrit
// le tableau (MD/spec-facades-calage-detection.md §14, lot L5 du plan de mise en oeuvre).
//
// Pour chaque scene :
// - **elevation** : `detecterOuvertures` sur l'elevation parfaite (vue de face, a l'echelle) - ce que
//   vaut la detection seule, sans erreur de calage ;
// - **photo** : `analyseMur.ts::analyserLeMur` sur la photo, avec les coins vrais - la chaine de production (audit, releve,
//   calibration) : la photo redressee entiere et son assemblage, la hauteur mesuree, le mur pose par ses coins, la detection ;
// - **calage** : les coins que propose le releve (`calage.ts::coinsDuReleve`, ou le cadre a 12 %
//   sans distance) compares aux coins vrais, et la hauteur retenue par l'analyse comparee a la
//   vraie ; puis le calage grossier de l'audit (`calage.ts::calageGrossier`) depuis la prise de vue,
//   avec des capteurs exacts, puis avec les erreurs typiques d'un telephone (`CAPTEURS_BANC`), et la
//   part des coins vrais qui tombent dans leur zone de recherche ;
// - **fusion de plusieurs vues** (lot L13) : pour une scene qui porte d'autres vues du mur entier,
//   `analyserLeMur` sur toutes les vues (coins vrais, decales de quelques pixels sur les vues de plus : l'assemblage pose le mur, la
//   fusion en compose l'image),
//   comparee a la chaine du releve sur la seule vue principale ; et la part du mur cache sur la vue
//   principale que la fusion rend au mur ;
// - **calage fin** (lot L7) : `calageFin.ts` sur la photo, depuis la prise du releve (distance, cap et
//   attitude typiques) puis depuis celle de l'audit (GPS, boussole, attitude typiques) : coins trouves
//   sur les aretes, ou repli sur les coins predits ; erreur de chacun, sa source, la note, l'azimut corrige.
// Rien n'est modifie dans la detection : le banc mesure, il ne regle pas.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detecterOuvertures, type OuvertureDetectee } from '../../../src/facade/detection.js';
import { coinsProposes, type ResultatAnalyse } from '../../../src/facade/analyse.js';
import { analyserLeMur } from '../../../src/facade/analyseMur.js';
import type { BilanVue } from '../../../src/facade/fusion.js';
import { coinsDuReleve, biaisDepuisCap, calageGrossier, type PriseDeVue, type ZoneRecherche } from '../../../src/facade/calage.js';
import { focalePx as focaleParDefaut } from '../../../src/facade/cadrage.js';
import { calageFin, calageFinDuReleve, type CalageFin, type SourceCoin } from '../../../src/facade/calageFin.js';
import type { Image, P2 } from '../../../src/facade/homographie.js';
import { corrigerDistorsion, corrigerPoint, distordrePoint, estimerDistorsion, focale35DePixels, grandAngleACorriger, type PhotoCorrigee } from '../../../src/facade/distorsion.js';
import { peindreElevation, murSeul, photographier, stenope, coinsStenope, coinsVrais, cacheDepuis, redresser, detailsVrais, type SceneFacade, type PriseCamera, type PriseCoins } from './synthese.js';
import { mesurerDetection, mesurerDetails, cumulerDetails, mediane, erreurCoinsCm, ATTRIBUTS_DETAILS, type MesureDetection, type MesureDetails } from './mesure.js';

export const DOSSIER_CORPUS = fileURLToPath(new URL('../../fixtures/facades', import.meta.url));

/** Les scenes du corpus, dans l'ordre des noms de fichiers. */
export function chargerCorpus(dossier = DOSSIER_CORPUS): SceneFacade[] {
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')) as SceneFacade);
}

export interface ResultatScene {
  nom: string;
  difficultes: string[];
  elevation: MesureDetection;
  photo: MesureDetection | null;
  /** Hauteur retenue par l'analyse moins la vraie, en cm. */
  hauteurCm: number | null;
  /** La hauteur a-t-elle ete mesuree sur la photo (sinon : l'estimation d'entree) ? */
  hauteurMesuree: boolean | null;
  /** Erreur des quatre coins proposes par le releve, en cm sur le mur. */
  coinsCm: number[] | null;
  /** Erreur des coins predits par le calage grossier, capteurs exacts. */
  coinsExactsCm: number[] | null;
  /** Erreur des coins predits par le calage grossier, capteurs typiques (`CAPTEURS_BANC`). */
  coinsBruitesCm: number[] | null;
  /** Coins vrais dans leur zone de recherche (capteurs typiques), sur quatre. */
  coinsDansZone: number | null;
  /** Le calage fin (lot L7), depuis la prise du releve puis depuis celle de l'audit. */
  fin: { releve: FinScene | null; audit: FinScene | null };
  /** La distorsion du grand-angle (lot L8), pour une prise sous 20 mm ou dont l'objectif deforme. */
  distorsion: DistorsionScene | null;
  /** La fusion de plusieurs vues (lot L13), pour une scene qui en porte. */
  vues: VuesScene | null;
  /**
   * La justesse des details des ouvertures retrouvees (lot G17) : sur l'elevation parfaite, sur la
   * chaine du releve, et apres la fusion des vues s'il y en a.
   */
  details: { elevation: MesureDetails; photo: MesureDetails | null; fusion: MesureDetails | null };
  ms: number;
  /**
   * Ce qui a ete detecte, pour les images de controle du script. `image` est l'image analysee (corrigee
   * de la distorsion s'il y a lieu) ; `coinsImage`, les coins vrais dans cette image.
   */
  detail: { elevation: OuvertureDetectee[]; photo: OuvertureDetectee[] | null; image: Image | null; coinsImage: P2[] | null; redressee: Image | null; coinsProposes: P2[] | null; coinsPredits: P2[] | null; zones: ZoneRecherche[] | null; fin: CalageFin | null; fusion?: DetailFusion | null; releve?: DetailReleve | null };
}

/** Ce que la chaine du releve a rendu, au-dela des ouvertures cochees : ce que le renfort de Claude reprend (lot L18). */
export interface DetailReleve {
  devinees: OuvertureDetectee[];
  pxParM: number;
  hauteur: number;
  hauteurMesuree: boolean;
  grille: ResultatAnalyse['grille'];
}

/** Ce que la fusion de plusieurs vues (lot L13) fait d'une scene. */
export interface VuesScene {
  /** Nombre de vues fondues, la principale comprise. */
  vues: number;
  /** La chaine du releve sur la seule vue principale, puis la fusion de toutes. */
  une: MesureDetection;
  fusion: MesureDetection | null;
  /** Part du mur cachee sur la vue principale (verite du generateur). */
  cache: number;
  /** Parmi ces pixels caches, ceux qui montrent le mur : sur la vue principale seule, puis apres la fusion. */
  renduUne: number;
  renduFusion: number;
  /** Part du mur restee cachee sur toutes les vues, selon la fusion (masque d'occlusion). */
  masque: number;
  bilans: BilanVue[];
  ms: number;
}

/** Pour les images de controle : l'elevation fondue, son masque d'occlusion et ses ouvertures. */
export interface DetailFusion {
  elevation: Image;
  occlusion: Uint8Array;
  ouvertures: OuvertureDetectee[];
}

/** La chaine du releve et le calage fin d'une scene, sur une image donnee (corrigee ou non). */
export interface ChaineScene {
  photo: MesureDetection | null;
  hauteurCm: number | null;
  /** Erreur des quatre coins rendus par le calage fin du releve, en cm sur le mur. */
  coinsFinCm: number[] | null;
}

/** Ce que la correction de la distorsion (lot L8) fait d'une scene, et la chaine avant et apres. */
export interface DistorsionScene {
  /** La focale equivalente que connait l'application, en mm. */
  focale35: number | null;
  /** Le coefficient de l'objectif (forme polynomiale du generateur) et celui estime (forme division). */
  kVrai: number;
  kEstime: number;
  corrigee: boolean;
  aretes: number;
  /** Ecart des aretes presque verticales a leur droite, en px : sur la photo, puis sur l'image corrigee. */
  residuAvantPx: number | null;
  residuApresPx: number | null;
  avant: ChaineScene;
  apres: ChaineScene;
}

/** Ce que le calage fin rend sur une scene. */
export interface FinScene {
  /** Erreur des quatre coins rendus, en cm sur le mur. */
  coinsCm: number[];
  sources: SourceCoin[];
  note: number;
  trouve: boolean;
  /** Azimut rendu moins le vrai, en degres ; `null` si la boussole n'a pas ete corrigee. */
  azimutErreurDeg: number | null;
  /** Coins vrais dans la zone de recherche de leur coin. */
  dansZone: number;
  ms: number;
}

/**
 * Les erreurs typiques des capteurs d'un telephone, appliquees a chaque scene : la boussole se trompe
 * de 5 degres, le GPS de 2 m (et annonce 5 m), l'accelerometre d'un degre. Le signe et la direction
 * changent d'une scene a l'autre (par la graine), sans tirage : le banc reste reproductible. Les
 * bornes des zones de recherche (15 degres, la precision annoncee, 3 degres) les couvrent.
 */
export const CAPTEURS_BANC = { azimutDeg: 5, positionM: 2, precisionM: 5, attitudeDeg: 1 };

/** Ce que les capteurs disent d'une prise camera : position, cap, attitude, avec ou sans erreur. */
export interface CapteursSimules {
  x: number;
  y: number;
  capDeg: number;
  inclinaisonDeg: number;
  roulisDeg: number;
}

const DEG = 180 / Math.PI;

/**
 * Les capteurs d'une prise camera, dans le repere du generateur : le mur de (0, 0) a (largeur, 0), la
 * rue vers -Y (la facade regarde au sud, azimut 180). Exacts, ou avec les erreurs de `CAPTEURS_BANC`.
 */
export function capteursSimules(s: SceneFacade, p: PriseCamera, bruites: boolean): CapteursSimules {
  const st = stenope(p, s.verite.largeur);
  const vrais = {
    x: st.C[0],
    y: st.C[1],
    capDeg: (Math.atan2(st.avant[0], st.avant[1]) * DEG + 360) % 360,
    inclinaisonDeg: p.tangage ?? 0,
    roulisDeg: p.roulis ?? 0,
  };
  if (!bruites) return vrais;
  const signe = s.synthese.graine % 2 ? -1 : 1;
  const dir = (s.synthese.graine * 77 * Math.PI) / 180;
  const k = CAPTEURS_BANC;
  return {
    x: vrais.x + k.positionM * Math.cos(dir),
    y: vrais.y + k.positionM * Math.sin(dir),
    capDeg: vrais.capDeg + signe * k.azimutDeg,
    // L'attitude se lit au degre : arrondie comme `shell/boussole.ts::attitudeDepuisOrientation`.
    inclinaisonDeg: Math.round(vrais.inclinaisonDeg + signe * k.attitudeDeg),
    roulisDeg: Math.round(vrais.roulisDeg - signe * k.attitudeDeg),
  };
}

const ecartSigne = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const dansZone = (q: P2, z: ZoneRecherche) => q.x >= z.x0 && q.x <= z.x1 && q.y >= z.y0 && q.y <= z.y1;
const QUATRE_INFINIS = [Infinity, Infinity, Infinity, Infinity];

/** Ce que la photo d'une scene donne, sur l'image analysee : chaine du releve, calages, et leur detail. */
type MesurePhoto = Pick<ResultatScene, 'photo' | 'hauteurCm' | 'hauteurMesuree' | 'coinsCm' | 'coinsExactsCm' | 'coinsBruitesCm' | 'coinsDansZone' | 'fin'> & {
  detail: Omit<ResultatScene['detail'], 'elevation'>;
};

/**
 * Rejoue la photo d'une scene. `prep` : la photo corrigee de la distorsion (lot L8), comme le releve
 * l'analyse ; `null` pour la photo telle que l'objectif l'a prise. Les coins vrais sont ramenes dans
 * l'image analysee ; l'erreur d'un coin rendu se mesure sur le stenope vrai (la correction estimee
 * defaite, puis la distorsion vraie de l'objectif retiree), donc sans faveur pour la correction.
 */
function mesurerPhoto(s: SceneFacade, p: PriseCamera | PriseCoins, photo: { image: Image; focalePx: number | null }, prep: PhotoCorrigee | null): MesurePhoto {
  const v = s.verite;
  const vraisPhoto = v.coins ?? [];
  const image = prep?.image ?? photo.image;
  const W = image.largeur,
    H = image.hauteur;
  const coinsImage = prep ? vraisPhoto.map((q) => corrigerPoint(q, prep.modele)) : vraisPhoto;
  const cam = p.type === 'camera' ? p : null;
  const versStenope = (q: P2): P2 => {
    const o = prep ? distordrePoint(q, prep.modele) : q;
    return cam?.distorsion ? redresser(cam, o) : o;
  };
  const vraisStenope = cam?.distorsion ? (coinsStenope(s) ?? vraisPhoto) : vraisPhoto;
  const erreur = (c: readonly P2[]) => erreurCoinsCm(c.map(versStenope), vraisStenope, v.largeur, v.hauteur);
  const m: MesurePhoto = {
    photo: null,
    hauteurCm: null,
    hauteurMesuree: null,
    coinsCm: null,
    coinsExactsCm: null,
    coinsBruitesCm: null,
    coinsDansZone: null,
    fin: { releve: null, audit: null },
    detail: { photo: null, image, coinsImage, redressee: null, coinsProposes: null, coinsPredits: null, zones: null, fin: null },
  };
  const hauteurEstimee = p.hauteurEstimee ?? v.hauteur;
  // La focale que l'application connaitrait : celle de l'EXIF, ou ses 67 degres par defaut ; l'image
  // corrigee de la distorsion est reduite pour que ses coins tiennent, la focale l'est d'autant.
  const focaleBrute = p.type === 'camera' ? (p.focaleConnue === false ? focaleParDefaut(W, H) : photo.focalePx) : null;
  const focale = focaleBrute !== null ? focaleBrute * (prep?.modele.echelle ?? 1) : null;
  const distance = p.type === 'camera' ? (p.distanceConnue === false ? null : p.distance) : (p.distance ?? null);
  // La chaine de production : `analyserLeMur`, qu'appellent l'audit, le releve et la calibration (une photo : son assemblage).
  const r = analyserLeMur({ largeur: v.largeur, hauteur: hauteurEstimee, contour: CONTOUR(v.largeur), cote: 0, distance }, [{ photo: image, coins: coinsImage, focalePx: focale }], 'vues')?.r ?? null;
  if (r) {
    m.photo = mesurerDetection(v.ouvertures, r.ouvertures);
    m.hauteurCm = Math.round((r.hauteur - v.hauteur) * 100);
    m.hauteurMesuree = r.hauteurMesuree;
    m.detail.photo = r.ouvertures;
    m.detail.redressee = r.elevation;
    m.detail.releve = { devinees: r.devinees, pxParM: r.pxParM, hauteur: r.hauteur, hauteurMesuree: r.hauteurMesuree, grille: r.grille };
  } else {
    m.photo = mesurerDetection(v.ouvertures, []);
  }
  if (p.type === 'camera' && focale) {
    // Le releve : la distance mesuree, le cap et l'attitude au declenchement (capteurs typiques),
    // comme `facade/releve/serie.ts::coinsDePrise` ; sans distance, le cadre a 12 %.
    const lu = capteursSimules(s, p, true);
    const proposes = distance
      ? coinsDuReleve(v.largeur, hauteurEstimee, { largeurPx: W, hauteurPx: H, focalePx: focale, distance, biaisDeg: biaisDepuisCap(lu.capDeg, 180), inclinaisonDeg: lu.inclinaisonDeg, roulisDeg: lu.roulisDeg })
      : coinsProposes(W, H, focale, distance, v.largeur, hauteurEstimee);
    m.detail.coinsProposes = proposes;
    m.coinsCm = erreur(proposes);
    // L'audit : la prise de vue situee projette le mur (calage grossier).
    const mur = { gauche: { x: 0, y: 0 }, droite: { x: v.largeur, y: 0 }, hauteur: hauteurEstimee };
    const prise = (c: CapteursSimules, precisionM: number | null): PriseDeVue => ({
      x: c.x,
      y: c.y,
      precisionM,
      azimutDeg: c.capDeg,
      sourceAzimut: 'boussole',
      inclinaisonDeg: c.inclinaisonDeg,
      roulisDeg: c.roulisDeg,
      focalePx: focale,
      largeurPx: W,
      hauteurPx: H,
      sourceFocale: p.focaleConnue === false ? 'defaut' : 'exif',
    });
    const exact = calageGrossier(mur, prise(capteursSimules(s, p, false), 0));
    m.coinsExactsCm = exact.coins ? erreur(exact.coins) : QUATRE_INFINIS;
    const bruite = calageGrossier(mur, prise(lu, CAPTEURS_BANC.precisionM));
    m.coinsBruitesCm = bruite.coins ? erreur(bruite.coins) : QUATRE_INFINIS;
    m.coinsDansZone = coinsImage.filter((q, i) => {
      const z = bruite.zones[i];
      return !!z && dansZone(q, z);
    }).length;
    m.detail.coinsPredits = bruite.coins;
    m.detail.zones = bruite.zones;
    // Le calage fin : depuis la prise du releve (si la distance est mesuree), puis depuis l'audit.
    const vrai = capteursSimules(s, p, false);
    const finScene = (c: CalageFin, ms: number): FinScene => ({
      coinsCm: c.coins ? erreur(c.coins) : QUATRE_INFINIS,
      sources: c.sources,
      note: Math.round(c.note * 100) / 100,
      trouve: c.trouve,
      azimutErreurDeg: c.azimutCorrige ? Math.round(ecartSigne(c.azimutDeg - vrai.capDeg) * 10) / 10 : null,
      dansZone: coinsImage.filter((q, i) => {
        const z = c.detail.zones[i];
        return !!z && dansZone(q, z);
      }).length,
      ms,
    });
    let t = performance.now();
    let segments = null;
    if (distance) {
      const f = calageFinDuReleve(image, v.largeur, hauteurEstimee, { largeurPx: W, hauteurPx: H, focalePx: focale, distance, biaisDeg: biaisDepuisCap(lu.capDeg, 180), inclinaisonDeg: lu.inclinaisonDeg, roulisDeg: lu.roulisDeg, focaleEstimee: p.focaleConnue === false }, { valeur: distance, precisionM: 0.03 * distance });
      m.fin.releve = finScene(f, Math.round(performance.now() - t));
      m.detail.fin = f;
      segments = f.detail.segments;
    }
    t = performance.now();
    const fa = calageFin({ image, mur, prise: prise(lu, CAPTEURS_BANC.precisionM), ...(segments ? { segments } : {}) });
    m.fin.audit = finScene(fa, Math.round(performance.now() - t));
    if (!m.detail.fin) m.detail.fin = fa;
  }
  return m;
}

/** Le mur, peint sans obstacle a la resolution d'une elevation : ce que la fusion devrait rendre. */
function murSansObstacle(s: SceneFacade, elev: Image): { image: Image; px: number } {
  const px = elev.largeur / s.verite.largeur;
  return { image: murSeul(s, peindreElevation(s, px, false), px), px };
}

/**
 * La part du mur cachee depuis la prise `p` (verite du generateur), et, parmi ces pixels, ceux que
 * l'elevation `elev` montre comme le mur : a moins de 30 niveaux en moyenne du mur peint sans obstacle.
 * Un pixel sur trois dans chaque sens suffit.
 */
function renduAuMur(s: SceneFacade, p: PriseCamera, elev: Image): { cache: number; rendu: number } {
  const { image: mur, px } = murSansObstacle(s, elev);
  const H = s.verite.hauteur;
  let total = 0,
    caches = 0,
    rendus = 0;
  for (let y = 1; y < Math.min(elev.hauteur, mur.hauteur); y += 3)
    for (let x = 1; x < Math.min(elev.largeur, mur.largeur); x += 3) {
      total++;
      if (!cacheDepuis(s, p, (x + 0.5) / px, H - (y + 0.5) / px)) continue;
      caches++;
      const i = (y * elev.largeur + x) * 4,
        j = (y * mur.largeur + x) * 4;
      let e = 0;
      for (let c = 0; c < 3; c++) e += Math.abs((elev.donnees[i + c] ?? 0) - (mur.donnees[j + c] ?? 0));
      if (e / 3 < 30) rendus++;
    }
  return { cache: total ? caches / total : 0, rendu: caches ? rendus / caches : 1 };
}

/**
 * La fusion des vues d'une scene (lot L13) : la vue principale et les autres vues du mur entier,
 * chacune avec ses coins vrais, decales de `decalageCoins` pixels pour les vues de plus.
 */
function mesurerVues(s: SceneFacade, p: PriseCamera, photo: { image: Image; focalePx: number | null }, px: number, une: MesureDetection, redressee: Image | null): { vues: VuesScene; detail: DetailFusion | null } {
  const t0 = performance.now();
  const v = s.verite;
  const autres = (s.synthese.vues ?? []).flatMap((q) => {
    const ph = photographier(s, px, q);
    const c = coinsVrais(s, q);
    if (!ph || !c) return [];
    const [dx, dy] = q.decalageCoins ?? [0, 0];
    return [{ photo: ph.image, coins: c.map((k) => ({ x: k.x + dx, y: k.y + dy })), focalePx: p.focaleConnue === false ? null : ph.focalePx }];
  });
  const principale = { photo: photo.image, coins: v.coins ?? [], focalePx: p.focaleConnue === false ? null : photo.focalePx };
  // La chaine de production : l'assemblage pose le mur, la fusion des vues en compose l'image (analyseMur.ts::fondreLesVues).
  const a = analyserLeMur({ largeur: v.largeur, hauteur: p.hauteurEstimee ?? v.hauteur, contour: CONTOUR(v.largeur), cote: 0, distance: p.distanceConnue === false ? null : p.distance }, [principale, ...autres], 'vues');
  const f = a ? { elevation: a.r.elevation, ouvertures: a.r.ouvertures, masque: a.fusion?.masque ?? 0, vues: a.fusion?.vues ?? [], occlusion: a.fusion?.occlusion ?? new Uint8Array(0) } : null;
  const avant = redressee ? renduAuMur(s, p, redressee) : { cache: 0, rendu: 0 };
  const apres = f ? renduAuMur(s, p, f.elevation) : { cache: avant.cache, rendu: 0 };
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    vues: {
      vues: 1 + autres.length,
      une,
      fusion: f ? mesurerDetection(v.ouvertures, f.ouvertures) : null,
      cache: r3(avant.cache),
      renduUne: r3(avant.rendu),
      renduFusion: r3(apres.rendu),
      masque: f?.masque ?? 0,
      bilans: f?.vues ?? [],
      ms: Math.round(performance.now() - t0),
    },
    detail: f ? { elevation: f.elevation, occlusion: f.occlusion, ouvertures: f.ouvertures } : null,
  };
}

const chaine = (m: MesurePhoto): ChaineScene => ({ photo: m.photo, hauteurCm: m.hauteurCm, coinsFinCm: m.fin.releve?.coinsCm ?? null });

/** Rejoue une scene. */
/** Le batiment d'un mur du banc : un rectangle de 6 m de profondeur derriere lui. */
const CONTOUR = (L: number) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }];

export function rejouerScene(s: SceneFacade): ResultatScene {
  const t0 = performance.now();
  const px = s.synthese.pxParM ?? 100;
  const v = s.verite;
  const elev = murSeul(s, peindreElevation(s, px, true), px);
  const detElev = detecterOuvertures(elev, px);
  const res: ResultatScene = {
    nom: s.nom,
    difficultes: s.difficultes,
    elevation: mesurerDetection(v.ouvertures, detElev),
    photo: null,
    hauteurCm: null,
    hauteurMesuree: null,
    coinsCm: null,
    coinsExactsCm: null,
    coinsBruitesCm: null,
    coinsDansZone: null,
    fin: { releve: null, audit: null },
    distorsion: null,
    vues: null,
    details: { elevation: mesurerDetails([], []), photo: null, fusion: null },
    ms: 0,
    detail: { elevation: detElev, photo: null, image: null, coinsImage: null, redressee: null, coinsProposes: null, coinsPredits: null, zones: null, fin: null },
  };
  const p = s.synthese.prise;
  const photo = photographier(s, px);
  if (p && photo && v.coins) {
    const W = photo.image.largeur,
      H = photo.image.hauteur;
    // La preparation (lot L8), comme le releve la fait : sous 20 mm de focale equivalente connue (celle
    // de l'EXIF, ou les 67 degres par defaut sans elle), la distorsion est estimee et corrigee.
    const focale35 = p.type === 'camera' ? (p.focaleConnue === false ? focale35DePixels(focaleParDefaut(W, H), W, H) : p.focale35) : null;
    const examinee = grandAngleACorriger(focale35);
    const estimation = examinee ? estimerDistorsion(photo.image) : null;
    const prep = estimation ? corrigerDistorsion(photo.image, focale35, { estimation }) : null;
    const apres = mesurerPhoto(s, p, photo, prep);
    const { detail, ...chiffres } = apres;
    Object.assign(res, chiffres);
    res.detail = { ...res.detail, ...detail };
    const kVrai = p.type === 'camera' ? (p.distorsion ?? 0) : 0;
    if (examinee || kVrai) {
      const avant = prep ? mesurerPhoto(s, p, photo, null) : apres;
      res.distorsion = {
        focale35,
        kVrai,
        kEstime: estimation ? Math.round(estimation.k1Brut * 1000) / 1000 : 0,
        corrigee: !!prep,
        aretes: estimation?.aretes ?? 0,
        residuAvantPx: estimation?.residuAvantPx ?? null,
        // Mesure independante : les aretes detectees a nouveau, sur l'image corrigee.
        residuApresPx: prep ? estimerDistorsion(prep.image).residuAvantPx : (estimation?.residuAvantPx ?? null),
        avant: chaine(avant),
        apres: chaine(apres),
      };
    }
    if (p.type === 'camera' && s.synthese.vues?.length && res.photo) {
      const f = mesurerVues(s, p, photo, px, res.photo, res.detail.redressee);
      res.vues = f.vues;
      res.detail.fusion = f.detail;
    }
  }
  // La verite des details (lot G17) : ce que le rendu et les balcons de la scene en disent.
  const vraies = v.ouvertures.map((o) => ({ ...o, details: detailsVrais(s, o) }));
  res.details = {
    elevation: mesurerDetails(vraies, detElev),
    photo: res.detail.photo ? mesurerDetails(vraies, res.detail.photo) : null,
    fusion: res.detail.fusion ? mesurerDetails(vraies, res.detail.fusion.ouvertures) : null,
  };
  res.ms = Math.round(performance.now() - t0);
  return res;
}

export interface SyntheseMode {
  facades: number;
  vraies: number;
  trouvees: number;
  vp: number;
  precision: number | null;
  rappel: number | null;
  cotesMedianeCm: number | null;
  typesJustes: number;
  correctionsParFacade: number;
}

function synthetiser(mesures: MesureDetection[]): SyntheseMode {
  const vraies = mesures.reduce((s, m) => s + m.vraies, 0),
    trouvees = mesures.reduce((s, m) => s + m.trouvees, 0),
    vp = mesures.reduce((s, m) => s + m.vp, 0);
  return {
    facades: mesures.length,
    vraies,
    trouvees,
    vp,
    precision: trouvees ? vp / trouvees : null,
    rappel: vraies ? vp / vraies : null,
    cotesMedianeCm: mediane(mesures.flatMap((m) => m.cotes)),
    typesJustes: mesures.reduce((s, m) => s + m.typesJustes, 0),
    correctionsParFacade: mesures.length ? mesures.reduce((s, m) => s + m.corrections, 0) / mesures.length : 0,
  };
}

/** Un coin propose a moins de 10 cm de sa place n'a pas besoin du doigt (spec §14 : « trouve sans geste »). */
export const COIN_JUSTE_CM = 10;

export interface ResultatBanc {
  scenes: ResultatScene[];
  elevation: SyntheseMode;
  photo: SyntheseMode;
  calage: {
    coins: number;
    coinsJustes: number;
    coinsMedianeCm: number | null;
    hauteurMedianeCm: number | null;
    exactsJustes: number;
    exactsMedianeCm: number | null;
    bruitesJustes: number;
    bruitesMedianeCm: number | null;
    dansZone: number;
  };
  fin: { releve: SyntheseFin; audit: SyntheseFin };
  vues: SyntheseVues;
  /** Les details des ouvertures retrouvees, cumules sur le corpus (lot G17). */
  details: { elevation: MesureDetails; photo: MesureDetails; fusion: MesureDetails };
}

/** La fusion de plusieurs vues sur les scenes qui en portent (lot L13). */
export interface SyntheseVues {
  scenes: number;
  une: SyntheseMode;
  fusion: SyntheseMode;
  /** Moyenne, sur les scenes, de la part du mur cache sur la vue principale qui montre le mur. */
  renduUne: number | null;
  renduFusion: number | null;
}

function synthetiserVues(v: VuesScene[]): SyntheseVues {
  const moyenne = (f: (x: VuesScene) => number) => (v.length ? v.reduce((s, x) => s + f(x), 0) / v.length : null);
  return { scenes: v.length, une: synthetiser(v.map((x) => x.une)), fusion: synthetiser(v.flatMap((x) => (x.fusion ? [x.fusion] : []))), renduUne: moyenne((x) => x.renduUne), renduFusion: moyenne((x) => x.renduFusion) };
}

/** Le calage fin sur tout le corpus. */
export interface SyntheseFin {
  coins: number;
  /** Coins a 10 cm au plus de leur place : ceux qui se passent du doigt. */
  justes: number;
  /** Coins rendus comme trouves sur la photo (pleins dans l'editeur). */
  trouves: number;
  /** Parmi eux, ceux qui sont justes : un coin plein faux couterait plus cher qu'un pointille. */
  trouvesJustes: number;
  medianeCm: number | null;
  /** Mediane de l'erreur absolue de l'azimut corrige, en degres, et nombre de prises corrigees. */
  azimutMedianDeg: number | null;
  azimutsCorriges: number;
  dansZone: number;
}

function synthetiserFin(f: FinScene[]): SyntheseFin {
  const coins = f.flatMap((x) => x.coinsCm);
  const paires = f.flatMap((x) => x.coinsCm.map((c, i) => ({ c, s: x.sources[i] })));
  const az = f.flatMap((x) => (x.azimutErreurDeg === null ? [] : [Math.abs(x.azimutErreurDeg)]));
  return {
    coins: coins.length,
    justes: coins.filter((c) => c <= COIN_JUSTE_CM).length,
    trouves: paires.filter((x) => x.s === 'trouve').length,
    trouvesJustes: paires.filter((x) => x.s === 'trouve' && x.c <= COIN_JUSTE_CM).length,
    medianeCm: medianeCoins(coins),
    azimutMedianDeg: mediane(az),
    azimutsCorriges: az.length,
    dansZone: f.reduce((n, x) => n + x.dansZone, 0),
  };
}

const medianeCoins = (c: number[]) => mediane(c.map((e) => (Number.isFinite(e) ? e : 1e6)));

export function rejouerCorpus(scenes: SceneFacade[]): ResultatBanc {
  const res = scenes.map(rejouerScene);
  const coins = res.flatMap((r) => r.coinsCm ?? []);
  const exacts = res.flatMap((r) => r.coinsExactsCm ?? []);
  const bruites = res.flatMap((r) => r.coinsBruitesCm ?? []);
  return {
    scenes: res,
    elevation: synthetiser(res.map((r) => r.elevation)),
    photo: synthetiser(res.flatMap((r) => (r.photo ? [r.photo] : []))),
    calage: {
      coins: coins.length,
      coinsJustes: coins.filter((c) => c <= COIN_JUSTE_CM).length,
      coinsMedianeCm: medianeCoins(coins),
      hauteurMedianeCm: mediane(res.flatMap((r) => (r.hauteurCm === null ? [] : [Math.abs(r.hauteurCm)]))),
      exactsJustes: exacts.filter((c) => c <= COIN_JUSTE_CM).length,
      exactsMedianeCm: medianeCoins(exacts),
      bruitesJustes: bruites.filter((c) => c <= COIN_JUSTE_CM).length,
      bruitesMedianeCm: medianeCoins(bruites),
      dansZone: res.reduce((n, r) => n + (r.coinsDansZone ?? 0), 0),
    },
    fin: {
      releve: synthetiserFin(res.flatMap((r) => (r.fin.releve ? [r.fin.releve] : []))),
      audit: synthetiserFin(res.flatMap((r) => (r.fin.audit ? [r.fin.audit] : []))),
    },
    vues: synthetiserVues(res.flatMap((r) => (r.vues ? [r.vues] : []))),
    details: {
      elevation: cumulerDetails(res.map((r) => r.details.elevation)),
      photo: cumulerDetails(res.flatMap((r) => (r.details.photo ? [r.details.photo] : []))),
      fusion: cumulerDetails(res.flatMap((r) => (r.details.fusion ? [r.details.fusion] : []))),
    },
  };
}

/* ---------------------------------------------------------------------------------------------
 * Le tableau
 * ------------------------------------------------------------------------------------------- */

const pc = (v: number | null) => (v === null ? '—' : Math.round(v * 100) + ' %');
const cm = (v: number | null) => (v === null ? '—' : (Math.round(v * 10) / 10).toLocaleString('fr-FR'));
const coinCm = (v: number) => (Number.isFinite(v) ? String(Math.round(v)) : '∞');

function ligneDetection(nom: string, m: MesureDetection): string {
  return `| ${nom} | ${m.vraies} | ${m.trouvees} | ${m.vp} | ${m.fp} | ${m.fn} | ${pc(m.precision)} | ${pc(m.rappel)} | ${cm(mediane(m.cotes))} | ${m.vp ? m.typesJustes + '/' + m.vp : '—'} | ${m.corrections} |`;
}

const ENTETE_DETECTION = ['| Façade | Vraies | Trouvées | VP | FP | FN | Précision | Rappel | Cotes méd. (cm) | Types justes | Corrections |', '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|'];

function ligneSynthese(s: SyntheseMode): string {
  return `| **Ensemble** (${s.facades}) | ${s.vraies} | ${s.trouvees} | ${s.vp} | ${s.trouvees - s.vp} | ${s.vraies - s.vp} | **${pc(s.precision)}** | **${pc(s.rappel)}** | **${cm(s.cotesMedianeCm)}** | ${s.vp ? s.typesJustes + '/' + s.vp : '—'} | **${cm(s.correctionsParFacade)}** / façade |`;
}

const justes = (c: number[] | null) => (c ? c.filter((e) => e <= COIN_JUSTE_CM).length + '/4' : '—');

const atteint = (ok: boolean) => (ok ? 'atteint' : 'non atteint');

/** Le tableau du banc, en Markdown : trois sections, puis les objectifs de la spec (§14). */
export function tableau(b: ResultatBanc): string {
  const l: string[] = [];
  l.push('### Détection seule (élévation parfaite, `detecterOuvertures`)', '', ...ENTETE_DETECTION);
  for (const r of b.scenes) l.push(ligneDetection(r.nom, r.elevation));
  l.push(ligneSynthese(b.elevation), '');
  l.push('### Chaîne de production (photo, coins vrais, `analyserLeMur`)', '', ...ENTETE_DETECTION);
  for (const r of b.scenes) if (r.photo) l.push(ligneDetection(r.nom, r.photo));
  l.push(ligneSynthese(b.photo), '');
  l.push('### Calage (coins proposés par le relevé, hauteur retenue par `analyserLeMur`)', '');
  l.push('`coinsDuReleve` : distance mesurée, cap et attitude au déclenchement (capteurs typiques). Erreur en cm sur le mur : HG, HD, BD, BG.', '');
  l.push('| Façade | Coins proposés (cm) | Coins justes | Hauteur (cm) | Temps (ms) |', '|---|---|--:|--:|--:|');
  for (const r of b.scenes) {
    if (!r.photo) continue;
    const c = r.coinsCm;
    const h = r.hauteurCm === null ? '—' : (r.hauteurCm > 0 ? '+' : '') + r.hauteurCm + (r.hauteurMesuree ? ' (mesurée)' : ' (estimée)');
    l.push(`| ${r.nom} | ${c ? c.map(coinCm).join(', ') : '—'} | ${justes(c)} | ${h} | ${r.ms} |`);
  }
  const k = b.calage;
  l.push(`| **Ensemble** | médiane **${cm(k.coinsMedianeCm)}** | **${k.coinsJustes}/${k.coins}** | médiane **${cm(k.hauteurMedianeCm)}** | |`, '');
  const C = CAPTEURS_BANC;
  l.push("### Calage grossier de l'audit (`calageGrossier`, depuis la prise de vue située)", '');
  l.push(`Capteurs exacts, puis typiques : boussole à ${C.azimutDeg}°, GPS à ${C.positionM} m pour ${C.precisionM} m annoncés, attitude à ${C.attitudeDeg}°. Zone : coins vrais dans leur zone de recherche.`, '');
  l.push('| Façade | Exacts (cm) | Justes | Typiques (cm) | Justes | Dans la zone |', '|---|---|--:|---|--:|--:|');
  for (const r of b.scenes) {
    if (!r.coinsExactsCm) continue;
    l.push(`| ${r.nom} | ${r.coinsExactsCm.map(coinCm).join(', ')} | ${justes(r.coinsExactsCm)} | ${(r.coinsBruitesCm ?? []).map(coinCm).join(', ')} | ${justes(r.coinsBruitesCm)} | ${r.coinsDansZone ?? '—'}/4 |`);
  }
  l.push(`| **Ensemble** | médiane **${cm(k.exactsMedianeCm)}** | **${k.exactsJustes}/${k.coins}** | médiane **${cm(k.bruitesMedianeCm)}** | **${k.bruitesJustes}/${k.coins}** | **${k.dansZone}/${k.coins}** |`, '');
  l.push('### Calage fin (`calageFin`, lot L7 : segments, points de fuite, arêtes)', '');
  l.push("Coins rendus, erreur en cm sur le mur (HG, HD, BD, BG) ; « p » : coin prédit (pointillé dans l'éditeur), sinon trouvé sur la photo. Azimut : erreur de l'azimut corrigé (« — » : boussole gardée).", '');
  l.push('| Façade | Relevé (cm) | Justes | Note | Azimut (°) | Audit (cm) | Justes | Note | Azimut (°) | Temps (ms) |', '|---|---|--:|--:|--:|---|--:|--:|--:|--:|');
  const coinsFin = (f: FinScene | null) => (f ? f.coinsCm.map((c, i) => coinCm(c) + (f.sources[i] === 'trouve' ? '' : ' p')).join(', ') : '—');
  const az = (f: FinScene | null) => (f?.azimutErreurDeg == null ? '—' : (f.azimutErreurDeg > 0 ? '+' : '') + f.azimutErreurDeg.toLocaleString('fr-FR'));
  for (const r of b.scenes) {
    const { releve: fr, audit: fa } = r.fin;
    if (!fr && !fa) continue;
    l.push(`| ${r.nom} | ${coinsFin(fr)} | ${justes(fr?.coinsCm ?? null)} | ${fr ? fr.note.toLocaleString('fr-FR') : '—'} | ${az(fr)} | ${coinsFin(fa)} | ${justes(fa?.coinsCm ?? null)} | ${fa ? fa.note.toLocaleString('fr-FR') : '—'} | ${az(fa)} | ${(fr?.ms ?? 0) + (fa?.ms ?? 0)} |`);
  }
  const ligneFin = (f: SyntheseFin) => `médiane **${cm(f.medianeCm)}** | **${f.justes}/${f.coins}** | ${f.trouvesJustes}/${f.trouves} pleins justes | ${f.azimutsCorriges} corrigés, méd. ${cm(f.azimutMedianDeg)}°`;
  l.push(`| **Ensemble** | ${ligneFin(b.fin.releve)} | ${ligneFin(b.fin.audit)} | |`, '');
  l.push(`Coins vrais dans leur zone de recherche : relevé ${b.fin.releve.dansZone}/${b.fin.releve.coins}, audit ${b.fin.audit.dansZone}/${b.fin.audit.coins}.`, '');
  const dist = b.scenes.filter((r) => r.distorsion);
  if (dist.length) {
    l.push('### Distorsion du grand-angle (lot L8 : sous 20 mm, correction radiale à un coefficient)', '');
    l.push(
      "k : coefficient de l'objectif (forme polynomiale du générateur) et celui estimé sur les arêtes presque verticales (forme division, qui n'est pas la même : les deux ne coïncident pas exactement). Résidu : écart des arêtes verticales à leur droite, en px, sur la photo puis sur l'image corrigée. Chaîne du relevé et calage fin du relevé, sans puis avec la correction.",
      '',
    );
    l.push('| Façade | Focale (mm) | k vrai | k estimé | Corrigée | Arêtes | Résidu (px) | Rappel | Précision | Cotes méd. (cm) | Hauteur (cm) | Coins calage fin (cm) |', '|---|--:|--:|--:|:-:|--:|---|---|---|---|---|---|');
    const fleche = (a: string, c: string) => (a === c ? c : `${a} → ${c}`);
    const px = (v: number | null) => (v === null ? '—' : (Math.round(v * 100) / 100).toLocaleString('fr-FR'));
    const hcm = (v: number | null) => (v === null ? '—' : (v > 0 ? '+' : '') + v);
    const coins = (c: number[] | null) => (c ? c.map(coinCm).join(', ') : '—');
    for (const r of dist) {
      const d = r.distorsion as DistorsionScene;
      const { avant: a, apres: c } = d;
      l.push(
        `| ${r.nom} | ${d.focale35 === null ? '—' : Math.round(d.focale35)} | ${d.kVrai.toLocaleString('fr-FR')} | ${d.kEstime.toLocaleString('fr-FR')} | ${d.corrigee ? 'oui' : 'non'} | ${d.aretes} | ${fleche(px(d.residuAvantPx), px(d.residuApresPx))} | ${fleche(pc(a.photo?.rappel ?? null), pc(c.photo?.rappel ?? null))} | ${fleche(pc(a.photo?.precision ?? null), pc(c.photo?.precision ?? null))} | ${fleche(cm(mediane(a.photo?.cotes ?? [])), cm(mediane(c.photo?.cotes ?? [])))} | ${fleche(hcm(a.hauteurCm), hcm(c.hauteurCm))} | ${fleche(coins(a.coinsFinCm), coins(c.coinsFinCm))} |`,
      );
    }
    l.push('');
  }
  l.push(...tableauVues(b));
  l.push(...tableauDetails(b));
  const p = b.photo;
  // Depuis le lot L7, les coins que propose le releve sont ceux du calage fin.
  const partCoins = b.fin.releve.coins ? b.fin.releve.justes / b.fin.releve.coins : 0;
  l.push('### Objectifs de la première version (spec §14), sur la chaîne du relevé', '');
  l.push('| Critère | Objectif | Mesuré | |', '|---|---|---|---|');
  l.push(`| Coins trouvés sans geste (≤ ${COIN_JUSTE_CM} cm, calage fin du relevé) | 70 % | ${pc(partCoins)} | ${atteint(partCoins >= 0.7)} |`);
  l.push(`| Rappel | ≥ 85 % | ${pc(p.rappel)} | ${atteint((p.rappel ?? 0) >= 0.85)} |`);
  l.push(`| Précision | ≥ 90 % | ${pc(p.precision)} | ${atteint((p.precision ?? 0) >= 0.9)} |`);
  l.push(`| Erreur médiane des cotes | ≤ 5 cm | ${cm(p.cotesMedianeCm)} cm | ${atteint(p.cotesMedianeCm !== null && p.cotesMedianeCm <= 5)} |`);
  l.push(`| Corrections par façade | < 3 | ${cm(p.correctionsParFacade)} | ${atteint(p.correctionsParFacade < 3)} |`);
  return l.join('\n');
}

/** La section de la fusion de plusieurs vues (lot L13), vide si aucune scene n'en porte. */
function tableauVues(b: ResultatBanc): string[] {
  const scenes = b.scenes.filter((r) => r.vues);
  if (!scenes.length) return [];
  const l: string[] = [];
  l.push('### Fusion de plusieurs vues (lot L13, recalage ORB + RANSAC : similitude recalée et vérifiée par corrélation, occlusions par la parallaxe, composition par qualité)', '');
  l.push(
    "Une vue : la chaîne du relevé sur la seule vue principale ; fusion : `analyserLeMur` sur toutes les vues (coins vrais, décalés de quelques pixels sur les vues de plus ; l’assemblage pose le mur, la fusion en compose l’image). Caché : part du mur que la vue principale ne voit pas (vérité du générateur) ; rendu au mur : parmi ces pixels, ceux que l'élévation montre comme le mur. Masque : part du mur restée cachée sur toutes les vues, selon la fusion. Recalage : décalage trouvé pour chaque vue de plus, en cm (x, y).",
    '',
  );
  l.push('| Façade | Vues | Rappel | Précision | Corrections | Caché | Rendu au mur | Masque | Recalage (cm) | Temps (ms) |', '|---|--:|---|---|---|--:|---|--:|---|--:|');
  const fleche = (a: string, c: string) => (a === c ? c : `${a} → ${c}`);
  const cmv = (x: number) => Math.round(x * 100);
  for (const r of scenes) {
    const v = r.vues as VuesScene;
    const f = v.fusion;
    const recal = v.bilans
      .filter((_, k) => k > 0 || v.bilans.length === 1)
      .map((x) => `${cmv(x.dxM)}, ${cmv(x.dyM)}`)
      .join(' ; ');
    l.push(
      `| ${r.nom} | ${v.vues} | ${fleche(pc(v.une.rappel), pc(f?.rappel ?? null))} | ${fleche(pc(v.une.precision), pc(f?.precision ?? null))} | ${fleche(String(v.une.corrections), f ? String(f.corrections) : '—')} | ${pc(v.cache)} | ${fleche(pc(v.renduUne), pc(v.renduFusion))} | ${pc(v.masque)} | ${recal || '—'} | ${v.ms} |`,
    );
  }
  const s = b.vues;
  l.push(
    `| **Ensemble** (${s.scenes}) | | **${fleche(pc(s.une.rappel), pc(s.fusion.rappel))}** | **${fleche(pc(s.une.precision), pc(s.fusion.precision))}** | **${fleche(cm(s.une.correctionsParFacade), cm(s.fusion.correctionsParFacade))}** / façade | | **${fleche(pc(s.renduUne), pc(s.renduFusion))}** | | | |`,
    '',
  );
  return l;
}

/** Un compte de details : justes sur vrais, et ce qui a ete lu de faux (« 1 faux : cintre »). */
function compteDetail(c: MesureDetails[keyof MesureDetails]): string {
  if (!c.vrais && !c.faux) return '—';
  const faux = c.faux ? ` ; ${c.faux} faux (${[...new Set(c.lusFaux)].join(', ')})` : '';
  return `${c.justes}/${c.vrais}${faux}`;
}

/**
 * La section des details des ouvertures (lot G17) : sur les ouvertures retrouvees, chaque attribut lu
 * (volets, allege, forme) compare a la verite de la scene (`detailsVrais`). Seules les scenes ou il y a
 * un detail, vrai ou lu, ont leur ligne.
 */
function tableauDetails(b: ResultatBanc): string[] {
  const l: string[] = [];
  l.push('### Détails des ouvertures (lot G17 : volets, allège, forme)', '');
  l.push(
    "Pour chaque attribut : lus justes sur vrais, puis les détails lus à tort (là où il n'y a rien, ou un autre). Vérité : le rendu de la scène (volets battants, roulants, persiennes ; un tablier fermé aux neuf dixièmes compte fermé), ses balcons (dalle : balcon ; sans dalle : garde-corps), la forme de ses baies. Une ouverture manquée ne compte pas ici (rappel) ; une détection fausse compte comme faux les détails qu'elle porte.",
    '',
  );
  l.push('| Façade | Élévation : volets | allège | forme | Relevé : volets | allège | forme | Fusion : volets | allège | forme |', '|---|---|---|---|---|---|---|---|---|---|');
  const cellules = (m: MesureDetails | null) => (m ? ATTRIBUTS_DETAILS.map((a) => compteDetail(m[a])) : ['—', '—', '—']);
  const vide = (m: MesureDetails | null) => !m || ATTRIBUTS_DETAILS.every((a) => !m[a].vrais && !m[a].faux);
  for (const r of b.scenes) {
    const d = r.details;
    if (vide(d.elevation) && vide(d.photo) && vide(d.fusion)) continue;
    l.push(`| ${r.nom} | ${[...cellules(d.elevation), ...cellules(d.photo), ...cellules(d.fusion)].join(' | ')} |`);
  }
  const e = b.details;
  l.push(`| **Ensemble** | ${[...cellules(e.elevation), ...cellules(e.photo), ...cellules(e.fusion)].map((c) => '**' + c + '**').join(' | ')} |`, '');
  return l;
}
