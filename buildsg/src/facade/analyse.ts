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
import { homographie, appliquer, redresser, resolutionTexture, rapportRectangle, type Image, type P2 } from './homographie.js';
import { detecterOuvertures, type OuvertureDetectee } from './detection.js';
import { profilSilhouette, classerProfil, toitDepuisEstimation, effacerCiel, type ToitEstime } from './toit.js';
import { coinsEnglobants, mesurerPartieBasse, egoutEn, ouverturesDansLeMur, type Decrochement } from './profil.js';
import type { PtBrut, Toit, PartieBasse } from '../model/types.js';

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
}

export interface ResultatAnalyse {
  /** Hauteur du mur a l'egout (l'egout le plus haut d'un mur en L), en metres. */
  hauteur: number;
  /** La hauteur a-t-elle ete mesuree sur la photo, ou est-ce l'estimation d'entree ? */
  hauteurMesuree: boolean;
  /** Le mur seul, du sol a l'egout : ce que la detection a lu. */
  elevation: Image;
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
  toitEstime: ToitEstime | null;
  toitPropose: Toit | null;
  /** La partie basse d'un mur en L, mesuree sur la photo ; `null` pour un mur rectangulaire. */
  partieBasse: PartieBasse | null;
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
  const E = hauteurBande(e.largeur);
  const coinsEtendus = [
    { x: 0, y: -E },
    { x: e.largeur, y: -E },
    { x: e.largeur, y: e.hauteur },
    { x: 0, y: e.hauteur },
  ].map((q) => appliquer(H, q));
  const pxParM = resolutionTexture(e.largeur, e.hauteur + E);
  const r = redresser(e.photo, coinsEtendus, e.largeur, e.hauteur + E, pxParM);
  if (!r) return null;
  return finaliserReleve(r.image, r.vu, E, pxParM, e, partie, !!mesuree);
}

/** Ce que le releve exige du mur, quelle que soit la facon dont l'elevation a ete obtenue. */
export type MurDuReleve = Pick<EntreeAnalyse, 'hauteur' | 'contour' | 'cote' | 'distance'>;

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

export function finaliserReleve(texture: Image, vu: Uint8Array, E: number, pxParM: number, e: MurDuReleve, partie: PartieBasse | null = null, hauteurMesuree = false): ResultatAnalyse {
  const r = { image: texture, vu };
  const egout = Math.round(E * pxParM);
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
  const ouvertures = ouverturesDansLeMur(detecterOuvertures(mur.image, pxParM, mur.vu), e.hauteur, partie);
  // Le toit se lit au-dessus de la partie haute seulement : au-dessus de la partie basse, la bande
  // montre le mur de la partie haute, pas une silhouette de toit.
  const haute = partie ? (partie.debut > 0 ? [0, partie.debut] : [partie.fin, texture.largeur / pxParM]) : null;
  const bandeToit = haute ? colonnes(bande.image, bande.vu, Math.round(au(haute, 0) * pxParM), Math.round(au(haute, 1) * pxParM)) : bande;
  const vusBande = bandeToit.vu.reduce((s, v) => s + v, 0);

  // Moins d'un tiers de la bande vu : le toit est hors cadre, on ne propose rien plutot que de
  // conclure a un toit plat.
  let toitEstime: ToitEstime | null = null;
  let toitPropose: Toit | null = null;
  if (vusBande >= 0.33 * bandeToit.vu.length) {
    toitEstime = classerProfil(profilSilhouette(bandeToit.image, pxParM, 60, bandeToit.vu));
    toitPropose = toitDepuisEstimation(e.contour, e.cote, toitEstime, e.hauteur, e.distance);
  }
  // La teinte du mur (mediane de ce qui en a ete vu) remplace le ciel au-dessus de l'egout.
  effacerCiel(r.image, egout, teinteMediane(mur.image, mur.vu), r.vu);
  return {
    hauteur: e.hauteur,
    hauteurMesuree,
    elevation: mur.image,
    texture: r.image,
    hauteurTexture: e.hauteur + egout / pxParM,
    pxParM,
    couverture: vusMur / Math.max(1, pixelsMur),
    ouvertures,
    toitEstime,
    toitPropose,
    partieBasse: partie,
  };
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
