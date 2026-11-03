// De la photo au releve : l'enchainement complet, sans navigateur (spec-releve-facade §6 a §8).
//
// Entree : une photo, les quatre coins du mur designes dessus, la largeur du mur. Sortie : la hauteur
// du mur a l'egout, mesuree sur la photo ; l'elevation redressee a l'echelle (la future texture), les
// ouvertures trouvees, et ce que la silhouette au-dessus de l'egout dit du toit - pour un pignon, le
// triangle au-dessus du mur. Le dialogue n'a plus qu'a afficher et laisser corriger.
//
// **Seule la largeur est connue** : elle se lit sur le plan. La hauteur du cadastre n'est qu'une
// estimation (le batiment est extrude a cette valeur par defaut) ; c'est la photo qui la mesure. Les
// quatre coins sont l'image d'un rectangle, dont la perspective fixe les proportions quand la focale
// est connue (`rapportRectangle`) : la largeur les met a l'echelle, la hauteur en decoule.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, redresser, resolutionTexture, rapportRectangle, type Image, type P2 } from './vision/homographie.js';
import { detecterFacade, type DetectionFacade, type OptionsDetection, type OuvertureDetectee } from './detection/detection.js';
import { profilSilhouette, classerProfil, toitDepuisEstimation, effacerCiel, type ToitEstime } from './toits/toit.js';
import { coinsEnglobants, mesurerPartieBasse, egoutEn, enListe, ouverturesDansLeMur, partieHaute, type Decrochement, type PartiesDuMur } from './profil.js';
import { silhouetteLue } from './vision/mosaiqueFuites.js';
import type { GrilleFacade, PtBrut, Toit, PartieBasse } from '../model/types.js';

export interface EntreeAnalyse {
  photo: Image;
  /** Coins du mur sur la photo : haut gauche, haut droit, bas droit, bas gauche (egout en haut). */
  coins: P2[];
  /** Largeur du mur, lue sur le plan : c'est elle qui met la photo a l'echelle. */
  largeur: number;
  /**
   * Hauteur a l'egout estimee (celle du cadastre). Avec la focale, la photo la mesure et cette valeur
   * ne sert que de repli, si les coins ne se pretent pas a la mesure ; sans focale, elle est prise
   * telle quelle.
   */
  hauteur: number;
  /** Focale de la photo, en pixels : c'est elle qui permet de mesurer la hauteur. */
  focalePx?: number | null;
  /** Contour du batiment et cote photographie : pour orienter le toit. */
  contour: PtBrut[];
  cote: number;
  /** Distance de prise de vue, si connue : corrige la fuite d'un toit vu de l'egout. */
  distance: number | null;
  /** Mur a deux hauteurs d'egout : le decrochement pose sur la photo (facade/profil.ts). */
  decrochement?: Decrochement | null;
  /**
   * La silhouette du haut du mur, en parts du mur (silhouetteEnPartsDuMur) : `u` de 0 a 1 le long du mur, `v` la hauteur en part de
   * celle a l'egout (1 a l'egout). Quand elle a une forme (un pignon, une rampe), c'est elle qui dit le toit, plutot que la bande.
   */
  silhouette?: { u: number; v: number }[] | null;
}

export interface ResultatAnalyse {
  /** Hauteur du mur a l'egout (l'egout le plus haut d'un mur en L), en metres. */
  hauteur: number;
  /** La hauteur a-t-elle ete mesuree sur la photo, ou est-ce l'estimation d'entree ? */
  hauteurMesuree: boolean;
  /** Le mur seul, du sol a l'egout (la vignette du mur, ses aretes) ; la detection, elle, lit la facade entiere (`facade`). */
  elevation: Image;
  /**
   * La facade entiere redressee (fusionnee quand plusieurs vues se fondent), dans le cadre de la texture (le mur et la bande au-dessus
   * de l'egout, le sol en bas), avant que le ciel n'y soit repeint : ce que la detection lit et ce que l'ecran montre. `vu` : les pixels
   * vus ; `dedans` : la silhouette du mur (son gabarit, pignons compris), la seule zone ou la detection cherche. Le cadre est la boite
   * de la silhouette entiere, plus une marge (`cadreDeLaSilhouette`) : un pignon voisin qui prolonge la facade y est lu. `x0Px` : les
   * colonnes a gauche du bout gauche du mur ; les cotes des ouvertures restent celles du mur (x depuis son bout gauche).
   */
  facade: { image: Image; vu: Uint8Array; dedans: Uint8Array; x0Px: number };
  /**
   * La texture : le mur et la bande au-dessus de l'egout, dans le meme plan. Un pignon est dans ce
   * plan, il y est donc a l'echelle, et la 3D le plaque sur le triangle du pignon.
   */
  texture: Image;
  /** Hauteur couverte par la texture depuis le sol, en metres. */
  hauteurTexture: number;
  pxParM: number;
  /** Part du mur vue sur la photo. */
  couverture: number;
  ouvertures: OuvertureDetectee[];
  /**
   * Les baies devinees par la structure (MD/spec-facades-calage-detection.md §10.5) dont la confiance
   * est faible : proposees en pointille, decochees. Les devinees sures sont dans `ouvertures`.
   */
  devinees: OuvertureDetectee[];
  /**
   * La silhouette mesuree au-dessus de l'egout (facade/toits/toit.ts::profilSilhouette) : la hauteur du bati, en metres, colonne par
   * colonne, de `x0M` a `x1M` le long du mur ; null quand le toit est hors cadre. L'ecran des etapes de la calibration la montre.
   */
  profilToit?: { x0M: number; x1M: number; hauteurs: number[] } | null;
  /**
   * Le haut du mur lu sur l'image (la matiere du mur, comme l'E6 de la calibration : mosaiqueFuites.ts::silhouetteLue), jamais le
   * gabarit : `u` de 0 a 1 le long du mur, `v` en hauteurs d'egout depuis le sol. Le diagnostic de forme de l'audit le compare au
   * gabarit (lot F4, facade/regles/facades/diagnosticForme.ts). Null quand il ne se lit pas (moins de la moitie des colonnes).
   */
  hautLu?: { u: number; v: number }[] | null;
  /** La structure des ouvertures proposees (niveaux, travees, spec §10) ; `null` sans ouverture. */
  grille: GrilleFacade | null;
  /** Le toit que dit la silhouette du mur (le gabarit du plan et du LiDAR), sinon la bande : ce qui dessine le toit propose. */
  toitEstime: ToitEstime | null;
  /**
   * Le toit lu sur la photo seule, par la bande au-dessus de l'egout ; null quand elle est hors cadre. Jamais le gabarit : c'est
   * l'avis de la photo que l'audit arbitre contre le LiDAR (app/audit/parcelle/constats.ts).
   */
  toitLu: ToitEstime | null;
  toitPropose: Toit | null;
  /**
   * Les parties basses du mur, de gauche a droite (model/partiesBasses.ts) : une pour un mur en L, une a chaque bout pour une partie
   * haute au milieu ; vide pour un mur rectangulaire.
   */
  partiesBasses: PartieBasse[];
}

/** Au-dela, une hauteur « mesuree » trahit des coins mal places : on garde l'estimation. */
export const HAUTEUR_MIN = 1,
  HAUTEUR_MAX = 60;

/**
 * Hauteur d'un mur de `largeur` metres dont `coins` (haut gauche, haut droit, bas droit, bas gauche)
 * sont les coins sur une photo de `largeurPx` x `hauteurPx`, prise a la focale `focale` (pixels,
 * point principal au centre). `null` si les coins ne permettent pas la mesure.
 */
export function mesurerHauteur(coins: readonly P2[], largeur: number, focale: number, largeurPx: number, hauteurPx: number): number | null {
  if (!(largeur > 0) || !(focale > 0)) return null;
  const r = rapportRectangle(coins, focale, largeurPx / 2, hauteurPx / 2);
  if (!r) return null;
  const h = largeur / r;
  return h >= HAUTEUR_MIN && h <= HAUTEUR_MAX ? Math.round(h * 100) / 100 : null;
}

/** Hauteur de la bande analysee au-dessus de l'egout : de quoi contenir un pignon raide. */
export function hauteurBande(largeur: number): number {
  return Math.min(8, Math.max(3, 0.6 * largeur));
}

/**
 * La marge du cadre de la facade autour de la boite de sa silhouette, de chaque cote, en part de la largeur du mur : 3 %. Plus que les
 * 2 % auxquels un bout du mur se juge juste (`facades.enchainement.calageEcartMaxPart`), pour qu'un bout pose a cette erreur pres garde
 * le bord de sa silhouette dans le cadre ; assez peu pour ne pas prendre le mur d'un voisin (25 cm sur un mur de 8 m). La detection n'y
 * cherche rien (hors de la silhouette) : la marge donne aux aretes du bord de quoi se lire, et a l'ecran de quoi voir le bord.
 */
export const MARGE_CADRE = 0.03;

/** Le cadre de la facade au-dela du mur : les colonnes a gauche et a droite de ses bouts, et la bande au-dessus de l'egout. */
export interface CadreFacade { gauchePx: number; droitePx: number; E: number }

/**
 * Le cadre que lit la detection (decision du proprietaire, 2 novembre 2026) : la boite de la silhouette entiere (le mur, et le pignon
 * d'un corps voisin qui deborde de ses bouts, `u` hors de 0 a 1), plus `MARGE_CADRE` de chaque cote ; au-dessus, la bande d'avant
 * (`hauteurBande`), ou le haut de la silhouette plus la marge s'il depasse. Des colonnes entieres, a l'echelle `pxParM`. Sans
 * silhouette : le rectangle du mur, avec sa marge.
 */
export function cadreDeLaSilhouette(largeurM: number, hauteurM: number, silhouette: readonly { u: number; v: number }[] | null | undefined, pxParM: number): CadreFacade {
  const us = [0, 1, ...(silhouette ?? []).map((p) => p.u)], vs = [1, ...(silhouette ?? []).map((p) => p.v)];
  const marge = MARGE_CADRE * largeurM;
  const gauche = (0 - Math.min(...us)) * largeurM + marge, droite = (Math.max(...us) - 1) * largeurM + marge;
  return { gauchePx: Math.max(0, Math.round(gauche * pxParM)), droitePx: Math.max(0, Math.round(droite * pxParM)), E: Math.max(hauteurBande(largeurM), (Math.max(...vs) - 1) * hauteurM + marge) };
}

/** Le cadre du mur seul (un mur en L, une photo sans assemblage) : ni colonne de plus, la bande d'avant. */
export const cadreDuMur = (largeurM: number): CadreFacade => ({ gauchePx: 0, droitePx: 0, E: hauteurBande(largeurM) });

/**
 * Le quadrilatere a redresser pour le cadre elargi : celui du mur et de sa bande (`etendus`, rendu sur `largeurPx` x `hauteurPx`),
 * prolonge de colonnes entieres a gauche et a droite par la meme homographie. Rogne au mur, le cadre elargi rend la texture d'avant,
 * sur la meme grille de pixels.
 */
export function etendreAuCadre(etendus: readonly P2[], largeurPx: number, hauteurPx: number, c: CadreFacade): P2[] {
  if (!c.gauchePx && !c.droitePx) return [...etendus];
  const h = homographie([{ x: 0, y: 0 }, { x: largeurPx, y: 0 }, { x: largeurPx, y: hauteurPx }, { x: 0, y: hauteurPx }], etendus);
  if (!h) return [...etendus];
  return [{ x: -c.gauchePx, y: 0 }, { x: largeurPx + c.droitePx, y: 0 }, { x: largeurPx + c.droitePx, y: hauteurPx }, { x: -c.gauchePx, y: hauteurPx }].map((q) => appliquer(h, q));
}

/** Les lignes `y0` a `y1` d'une image (et de son masque). */
function rogner(img: Image, vu: Uint8Array, y0: number, y1: number): { image: Image; vu: Uint8Array } {
  const L = img.largeur;
  return {
    image: { largeur: L, hauteur: y1 - y0, donnees: img.donnees.slice(y0 * L * 4, y1 * L * 4) },
    vu: vu.slice(y0 * L, y1 * L),
  };
}

/** Teinte mediane, canal par canal, des pixels vus. */
export function teinteMediane(img: Image, vu: Uint8Array): number[] {
  const canaux: number[][] = [[], [], []];
  // Un pixel sur quatre suffit a une mediane et divise le tri par seize.
  for (let i = 0; i < vu.length; i += 4) {
    if (!vu[i]) continue;
    for (let k = 0; k < 3; k++) au(canaux, k).push((img.donnees[i * 4 + k] ?? 0));
  }
  return canaux.map((c) => (c.length ? au(c.sort((a, b) => a - b), Math.floor(c.length / 2)) : 200));
}

export function analyserReleve(e: EntreeAnalyse): ResultatAnalyse | null {
  // Un mur en L se redresse sur son rectangle englobant, dont le coin cache se construit ; le
  // decrochement, ramene dans le plan du mur, donne la partie basse.
  let partie: PartieBasse | null = null;
  if (e.decrochement) {
    const englobants = coinsEnglobants(e.coins, e.decrochement);
    if (!englobants) return null;
    e = { ...e, coins: englobants };
  }
  // La hauteur du mur (du rectangle englobant, pour un L) se mesure sur la photo ; l'estimation
  // d'entree ne sert que de repli.
  const mesuree = e.focalePx ? mesurerHauteur(e.coins, e.largeur, e.focalePx, e.photo.largeur, e.photo.hauteur) : null;
  if (mesuree) e = { ...e, hauteur: mesuree };
  if (e.decrochement) {
    partie = mesurerPartieBasse(e.coins, e.decrochement, e.largeur, e.hauteur);
  }
  // Elevation (x depuis la gauche, y depuis l'egout vers le bas) -> photo.
  const H = homographie(
    [
      { x: 0, y: 0 },
      { x: e.largeur, y: 0 },
      { x: e.largeur, y: e.hauteur },
      { x: 0, y: e.hauteur },
    ],
    e.coins,
  );
  if (!H) return null;
  // Un seul redressement, du sol jusqu'a la bande au-dessus de l'egout : meme homographie, prolongee
  // vers le haut dans le plan du mur. Un pignon est dans ce plan, il se lit donc juste ; un long pan
  // fuit, la correction s'en charge.
  // Le cadre de la facade (cadreDeLaSilhouette), comme l'assemblage et la fusion ; un mur en L garde le rectangle de son mur.
  const sil = partie ? null : e.silhouette;
  const E = partie ? hauteurBande(e.largeur) : cadreDeLaSilhouette(e.largeur, e.hauteur, sil, 1).E;
  const pxParM = resolutionTexture(e.largeur, e.hauteur + E);
  const cadre = partie ? cadreDuMur(e.largeur) : cadreDeLaSilhouette(e.largeur, e.hauteur, sil, pxParM);
  const Lpx = Math.max(1, Math.round(e.largeur * pxParM));
  const coinsEtendus = etendreAuCadre([
    { x: 0, y: -E },
    { x: e.largeur, y: -E },
    { x: e.largeur, y: e.hauteur },
    { x: 0, y: e.hauteur },
  ].map((q) => appliquer(H, q)), Lpx, Math.max(1, Math.round((e.hauteur + E) * pxParM)), cadre);
  const r = redresser(e.photo, coinsEtendus, (Lpx + cadre.gauchePx + cadre.droitePx) / pxParM, e.hauteur + E, pxParM);
  if (!r) return null;
  return finaliserReleve(r.image, r.vu, E, pxParM, e, partie, !!mesuree, cadre);
}

/** Ce que le releve exige du mur, quelle que soit la facon dont l'elevation a ete obtenue. */
export type MurDuReleve = Pick<EntreeAnalyse, 'hauteur' | 'contour' | 'cote' | 'distance' | 'silhouette'>;

/**
 * La suite commune a une photo et a plusieurs : l'elevation etendue (le mur, et la bande de `E`
 * metres au-dessus de l'egout) a `pxParM`, et son masque de pixels vus, donnent les ouvertures, le
 * toit propose et la texture, dont le ciel au-dessus de l'egout est repeint a la teinte du mur.
 */
/** Les colonnes `x0` a `x1` d'une image (et de son masque). */
function colonnes(img: Image, vu: Uint8Array, x0: number, x1: number): { image: Image; vu: Uint8Array } {
  const L = img.largeur,
    l = Math.max(1, x1 - x0);
  const donnees = new Uint8ClampedArray(l * img.hauteur * 4),
    v = new Uint8Array(l * img.hauteur);
  for (let y = 0; y < img.hauteur; y++) {
    donnees.set(img.donnees.subarray((y * L + x0) * 4, (y * L + x0 + l) * 4), y * l * 4);
    v.set(vu.subarray(y * L + x0, y * L + x0 + l), y * l);
  }
  return { image: { largeur: l, hauteur: img.hauteur, donnees }, vu: v };
}

/**
 * La silhouette du haut du mur (sur la photo) en parts du mur : la photo ramenee au rectangle du mur par ses coins (haut gauche, haut
 * droit, bas droit, bas gauche), `u` de 0 a 1 le long du mur, `v` la hauteur en part de celle a l'egout. Sans echelle : la hauteur du mur
 * peut encore etre mesuree ensuite. Null sans silhouette ou sans coins.
 */
export function silhouetteEnPartsDuMur(coins: readonly P2[], silhouette: readonly P2[] | null | undefined): { u: number; v: number }[] | null {
  if (!silhouette || silhouette.length < 2 || coins.length !== 4) return null;
  const versMur = homographie(coins, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
  return versMur ? silhouette.map((p) => { const q = appliquer(versMur, p); return { u: q.x, v: q.y }; }) : null;
}

/**
 * La silhouette du mur dans le cadre de la texture (`largeurPx` x `hauteurPx`, l'egout a la rangee `egoutPx`, le sol en bas) : 1 sous le
 * haut de la facade, 0 au-dessus (le ciel, le toit qu'on voit derriere). `silhouette` en parts du mur (`u` de 0 a 1, `v` en hauteurs
 * d'egout) ; hors de ses bouts, la hauteur de son bout le plus proche. Sans silhouette, le rectangle du mur : tout sous l'egout.
 */
export function silhouetteDansLeCadre(largeurPx: number, hauteurPx: number, egoutPx: number, silhouette: readonly { u: number; v: number }[] | null | undefined, cadre: Pick<CadreFacade, 'gauchePx' | 'droitePx'> = { gauchePx: 0, droitePx: 0 }): Uint8Array {
  const dedans = new Uint8Array(largeurPx * hauteurPx);
  const pts = silhouette && silhouette.length >= 2 ? [...silhouette].sort((a, b) => a.u - b.u) : null;
  const murPx = hauteurPx - egoutPx;
  // Le mur entre ses bouts, dans le cadre : `u` de 0 a 1. Dans la marge du cadre, hors des bouts de la silhouette, rien n'est du mur.
  const g = cadre.gauchePx, l = Math.max(1, largeurPx - g - cadre.droitePx), marge = g > 0 || cadre.droitePx > 0;
  const uMin = pts ? Math.min(0, au(pts, 0).u) : 0, uMax = pts ? Math.max(1, au(pts, pts.length - 1).u) : 1;
  for (let x = 0; x < largeurPx; x++) {
    const u = (x + 0.5 - g) / l;
    if (marge && (u < uMin || u > uMax)) continue;
    // La rangee du haut de la facade dans cette colonne : l'egout, decale de ce dont la silhouette monte (un pignon) ou descend (un
    // corps plus bas), arrondi comme la rangee de l'egout pour qu'un rectangle tombe pile sur elle.
    const v = pts ? hauteurSurLaSilhouette(pts, u) : 1;
    const haut = Math.max(0, Math.min(hauteurPx, egoutPx - Math.round((v - 1) * murPx)));
    for (let y = haut; y < hauteurPx; y++) dedans[y * largeurPx + x] = 1;
  }
  return dedans;
}

/** La hauteur (en hauteurs d'egout) d'une silhouette triee par `u`, en `u` ; hors de ses bouts, celle du bout le plus proche. */
function hauteurSurLaSilhouette(pts: readonly { u: number; v: number }[], u: number): number {
  const a0 = au(pts, 0), b0 = au(pts, pts.length - 1);
  if (u <= a0.u) return a0.v;
  if (u >= b0.u) return b0.v;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = au(pts, i), b = au(pts, i + 1);
    if (u >= a.u && u <= b.u) return a.v + ((b.v - a.v) * (u - a.u)) / Math.max(1e-9, b.u - a.u);
  }
  return b0.v;
}

/**
 * Une baie dont moins de cette part de la boite tombe dans la silhouette n'est pas du mur : le ciel au-dessus d'un rampant, le toit, le
 * mur d'un voisin a cote du pignon. La moitie : une lucarne de pignon serree sous les rampants reste, une devinee posee dans le ciel
 * (la structure complete un niveau de pignon sur toute la largeur) part.
 */
const PART_DANS_LA_SILHOUETTE = 0.5;

/**
 * Les ouvertures de la facade entiere (decision de l'utilisateur, 2 novembre 2026 : le mur de la detection est la facade complete
 * redressee, pignons compris, qui peuvent porter des ouvertures) : `image` est le cadre de la texture (le sol en bas), `vu` ses pixels
 * vus (null : tout), `dedans` la silhouette (silhouetteDansLeCadre). La detection lit le cadre du haut de la silhouette au sol, ne
 * cherche que dans la silhouette, et ne garde que les baies qui y tombent ; leurs cotes restent celles du mur (x depuis la gauche, y
 * depuis le sol), au-dessus de l'egout pour une baie de pignon. Sous un rectangle, c'est exactement la detection d'avant, du sol a
 * l'egout.
 */
export function detecterDansLaSilhouette(image: Image, vu: Uint8Array | null, dedans: Uint8Array, pxParM: number, options: OptionsDetection = {}, x0Px = 0): DetectionFacade {
  const L = image.largeur, H = image.hauteur;
  let haut = H;
  for (let i = 0; i < dedans.length; i++) if (dedans[i]) { haut = Math.floor(i / L); break; }
  if (haut >= H) return { ouvertures: [], devinees: [], grille: null, symetrique: false };
  const crop = { largeur: L, hauteur: H - haut, donnees: image.donnees.slice(haut * L * 4) };
  const zone = dedans.subarray(haut * L);
  // Sans masque des pixels vus et sans rien hors de la silhouette, la detection garde son entree d'avant (pas de masque).
  const plein = !vu && zone.every((v) => v === 1);
  const masque = plein ? null : zone.map((d, i) => (d && (vu ? (vu[haut * L + i] ?? 0) : 1) ? 1 : 0));
  const d = detecterFacade(crop, pxParM, masque, options);
  const part = (o: OuvertureDetectee): number => {
    const x0 = Math.max(0, Math.floor(o.x * pxParM)), x1 = Math.min(L, Math.ceil((o.x + o.l) * pxParM));
    const y0 = Math.max(0, Math.floor(H - (o.y + o.h) * pxParM)), y1 = Math.min(H, Math.ceil(H - o.y * pxParM));
    let n = 0, tot = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { tot++; n += dedans[y * L + x] ?? 0; }
    return tot ? n / tot : 0;
  };
  const dans = (o: OuvertureDetectee) => part(o) >= PART_DANS_LA_SILHOUETTE;
  if (!x0Px) return { ...d, ouvertures: d.ouvertures.filter(dans), devinees: d.devinees.filter(dans) };
  // Les cotes du mur : x depuis son bout gauche, et non depuis le bord du cadre.
  // Au centimetre, comme toutes les cotes de la detection.
  const dx = x0Px / pxParM, cm = (v: number) => Math.round(v * 100) / 100;
  const auMur = (o: OuvertureDetectee): OuvertureDetectee => ({ ...o, x: cm(o.x - dx) });
  const grille = d.grille ? { ...d.grille, travees: d.grille.travees.map((t) => ({ ...t, xM: cm(t.xM - dx) })) } : null;
  return { ...d, grille, ouvertures: d.ouvertures.filter(dans).map(auMur), devinees: d.devinees.filter(dans).map(auMur) };
}

/** Au-dessous de cette hauteur au-dessus de l'egout (m), la silhouette du mur est plate : le toit se lit sur la bande. */
const RELIEF_SILHOUETTE_M = 0.3;

/**
 * Le profil du toit que dit la silhouette du haut du mur : sa hauteur au-dessus de l'egout sur `colonnes` colonnes, de `x0M` a `x1M`.
 * Null quand elle est plate (un mur gouttereau : le toit qu'on voit est derriere, la bande le lit) ou trop courte.
 */
function profilDeLaSilhouette(s: readonly { u: number; v: number }[], hauteur: number, largeurM: number, colonnes = 60): { x0M: number; x1M: number; hauteurs: number[] } | null {
  const pts = [...s].sort((a, b) => a.u - b.u);
  if (pts.length < 2 || !((pts[pts.length - 1] as { u: number }).u - (pts[0] as { u: number }).u > 0.5)) return null;
  const en = (u: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as { u: number; v: number }, b = pts[i + 1] as { u: number; v: number };
      if (u >= a.u && u <= b.u) return a.v + ((b.v - a.v) * (u - a.u)) / Math.max(1e-9, b.u - a.u);
    }
    return u < (pts[0] as { u: number }).u ? (pts[0] as { v: number }).v : (pts[pts.length - 1] as { v: number }).v;
  };
  const hauteurs = Array.from({ length: colonnes }, (_, k) => Math.max(0, (en((k + 0.5) / colonnes) - 1) * hauteur));
  return Math.max(...hauteurs) >= RELIEF_SILHOUETTE_M ? { x0M: 0, x1M: largeurM, hauteurs } : null;
}

/**
 * La suite commune des analyses, sur le cadre redresse (`cadreDeLaSilhouette` : le mur et ses colonnes de plus, la bande au-dessus de
 * l'egout) : la detection lit le cadre entier, dans la silhouette ; la texture, l'elevation, le toit et tout ce qui s'ecrit restent ceux
 * du mur, entre ses bouts.
 */
export function finaliserReleve(cadreImage: Image, cadreVu: Uint8Array, E: number, pxParM: number, e: MurDuReleve, partie: PartiesDuMur = null, hauteurMesuree = false, cadre: Pick<CadreFacade, 'gauchePx' | 'droitePx'> = { gauchePx: 0, droitePx: 0 }): ResultatAnalyse {
  const egout = Math.round(E * pxParM);
  const parties = enListe(partie);
  // La detection lit la facade entiere, dans sa silhouette (le gabarit, pignons compris, et un pignon voisin qui deborde des bouts) : un
  // pignon peut porter une baie. Un mur en L garde son rectangle (le haut de sa partie basse se dit par la partie, pas par la silhouette).
  const dedans = silhouetteDansLeCadre(cadreImage.largeur, cadreImage.hauteur, egout, parties.length ? null : e.silhouette, cadre);
  const facade = { image: { largeur: cadreImage.largeur, hauteur: cadreImage.hauteur, donnees: cadreImage.donnees.slice() }, vu: cadreVu, dedans, x0Px: cadre.gauchePx };
  const detection = detecterDansLaSilhouette(cadreImage, cadreVu, dedans, pxParM, {}, cadre.gauchePx);
  // Le mur, entre ses bouts : la texture, l'elevation, le toit.
  const avecMarge = cadre.gauchePx > 0 || cadre.droitePx > 0;
  const r = avecMarge ? colonnes(cadreImage, cadreVu, cadre.gauchePx, cadreImage.largeur - cadre.droitePx) : { image: cadreImage, vu: cadreVu };
  const texture = r.image;
  const mur = rogner(r.image, r.vu, egout, r.image.hauteur);
  const bande = rogner(r.image, r.vu, 0, egout);
  // La couverture ne compte que le mur : sur un mur en L, pas le vide au-dessus de la partie basse.
  let vusMur = 0,
    pixelsMur = 0;
  for (let y = 0; y < mur.image.hauteur; y++) {
    const hauteurPx = (mur.image.hauteur - y) / pxParM;
    for (let x = 0; x < mur.image.largeur; x++) {
      if (hauteurPx > egoutEn(x / pxParM, e.hauteur, partie)) continue;
      pixelsMur++;
      vusMur += mur.vu[y * mur.image.largeur + x] ?? 0;
    }
  }
  const ouvertures = ouverturesDansLeMur(detection.ouvertures, e.hauteur, partie);
  const devinees = ouverturesDansLeMur(detection.devinees, e.hauteur, partie);
  // Le toit se lit au-dessus de la partie haute seulement : au-dessus de la partie basse, la bande
  // montre le mur de la partie haute, pas une silhouette de toit.
  const haute = partieHaute(texture.largeur / pxParM, parties);
  const bandeToit = haute ? colonnes(bande.image, bande.vu, Math.round(au(haute, 0) * pxParM), Math.round(au(haute, 1) * pxParM)) : bande;
  const vusBande = bandeToit.vu.reduce((s, v) => s + v, 0);

  // Moins d'un tiers de la bande vu : le toit est hors cadre, on ne propose rien plutot que de
  // conclure a un toit plat. La bande est la seule lecture du toit qui vienne de la photo : c'est elle que l'audit compte comme
  // l'avis de la photo (toitLu), meme quand le gabarit dessine le toit.
  let toitLu: ToitEstime | null = null;
  let profilBande: ResultatAnalyse['profilToit'] = null;
  if (vusBande >= 0.33 * bandeToit.vu.length) {
    const hauteurs = profilSilhouette(bandeToit.image, pxParM, 60, bandeToit.vu);
    profilBande = { x0M: haute ? au(haute, 0) : 0, x1M: haute ? au(haute, 1) : texture.largeur / pxParM, hauteurs };
    toitLu = classerProfil(hauteurs);
  }
  // La silhouette du haut du mur, quand elle a une forme (un pignon, une rampe, un trapeze de croupe vu de face), dit le toit : forme
  // et hauteur, dans le plan du mur, donc a l'echelle. Plate (un mur gouttereau), elle ne dit rien du toit qu'on voit derriere : la
  // bande au-dessus de l'egout le lit. Un mur en L garde la bande (sa partie haute seule porte le toit).
  const parLaSilhouette = !parties.length && e.silhouette ? profilDeLaSilhouette(e.silhouette, e.hauteur, texture.largeur / pxParM) : null;
  const profilToit = parLaSilhouette ?? profilBande;
  const toitEstime = parLaSilhouette ? classerProfil(parLaSilhouette.hauteurs) : toitLu;
  const toitPropose = toitEstime ? toitDepuisEstimation(e.contour, e.cote, toitEstime, e.hauteur, e.distance) : null;
  // Le haut du mur lu a la matiere du mur, avant que le ciel ne soit repeint (lot F4) : une lecture, rien ne change de la texture.
  const hautLu = lireLeHaut(r, egout);
  // La teinte du mur (mediane de ce qui en a ete vu) remplace le ciel au-dessus de l'egout.
  effacerCiel(r.image, egout, teinteMediane(mur.image, mur.vu), r.vu);
  return {
    hauteur: e.hauteur,
    hauteurMesuree,
    elevation: mur.image,
    facade,
    texture: r.image,
    hauteurTexture: e.hauteur + egout / pxParM,
    pxParM,
    couverture: vusMur / Math.max(1, pixelsMur),
    ouvertures,
    devinees,
    grille: detection.grille,
    toitEstime,
    toitLu,
    toitPropose,
    profilToit,
    hautLu,
    partiesBasses: [...parties],
  };
}

/** Le haut du mur sur l'elevation etendue (l'egout a la rangee `egout`, le sol en bas), en parts du mur ; null s'il ne se lit pas. */
function lireLeHaut(r: { image: Image; vu: Uint8Array }, egout: number): { u: number; v: number }[] | null {
  const L = r.image.largeur, H = r.image.hauteur;
  if (!(H - egout > 0) || !(L > 0)) return null;
  const lue = silhouetteLue(r, { x0: 0, x1: L, y0: egout, y1: H });
  return lue ? lue.silhouette.map((p) => ({ u: Math.round((p.x / L) * 1e4) / 1e4, v: Math.round(((H - p.y) / (H - egout)) * 1e4) / 1e4 })) : null;
}

/**
 * Coins proposes sur la photo, avant que l'utilisateur les ajuste. A distance connue et telephone
 * d'aplomb, le mur se projette en un rectangle : centre horizontalement, le sol a hauteur d'oeil
 * (1,5 m) sous l'horizon, qui passe au milieu de l'image. Sans distance, un cadre a 12 % des bords.
 */
export function coinsProposes(largeurPx: number, hauteurPx: number, focale: number | null, distance: number | null, largeurMur: number, hauteurMur: number, oeil = 1.5): P2[] {
  const cx = largeurPx / 2,
    cy = hauteurPx / 2;
  if (focale && distance && distance > 0) {
    const k = focale / distance;
    const g = cx - (largeurMur / 2) * k,
      d = cx + (largeurMur / 2) * k;
    const bas = cy + oeil * k,
      haut = cy - (hauteurMur - oeil) * k;
    return [
      { x: g, y: haut },
      { x: d, y: haut },
      { x: d, y: bas },
      { x: g, y: bas },
    ];
  }
  const mx = largeurPx * 0.12,
    my = hauteurPx * 0.12;
  return [
    { x: mx, y: my },
    { x: largeurPx - mx, y: my },
    { x: largeurPx - mx, y: hauteurPx - my },
    { x: mx, y: hauteurPx - my },
  ];
}
