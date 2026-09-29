// De la photo au releve : l'enchainement complet, sans navigateur (spec-releve-facade §6 a §8).
//
// Entree : une photo, les quatre coins du mur designes dessus, la taille du mur. Sortie :
// l'elevation redressee a l'echelle (la future texture), les ouvertures trouvees, et ce que la
// silhouette au-dessus de l'egout dit du toit. Le dialogue n'a plus qu'a afficher et laisser
// corriger.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, redresser, resolutionTexture, type Image, type P2 } from './homographie.js';
import { detecterOuvertures, type OuvertureDetectee } from './detection.js';
import { profilSilhouette, classerProfil, toitDepuisEstimation, effacerCiel, type ToitEstime } from './toit.js';
import type { PtBrut, Toit } from '../model/types.js';

export interface EntreeAnalyse {
  photo: Image;
  /** Coins du mur sur la photo : haut gauche, haut droit, bas droit, bas gauche (egout en haut). */
  coins: P2[];
  largeur: number;
  hauteur: number;
  /** Contour du batiment et cote photographie : pour orienter le toit. */
  contour: PtBrut[];
  cote: number;
  /** Distance de prise de vue, si connue : corrige la fuite d'un toit vu de l'egout. */
  distance: number | null;
}

export interface ResultatAnalyse {
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
  const egout = Math.round(E * pxParM);
  const mur = rogner(r.image, r.vu, egout, r.image.hauteur);
  const bande = rogner(r.image, r.vu, 0, egout);
  const vusMur = mur.vu.reduce((s, v) => s + v, 0);
  const vusBande = bande.vu.reduce((s, v) => s + v, 0);
  const ouvertures = detecterOuvertures(mur.image, pxParM, mur.vu);

  // Moins d'un tiers de la bande vu : le toit est hors cadre, on ne propose rien plutot que de
  // conclure a un toit plat.
  let toitEstime: ToitEstime | null = null;
  let toitPropose: Toit | null = null;
  if (vusBande >= 0.33 * bande.vu.length) {
    toitEstime = classerProfil(profilSilhouette(bande.image, pxParM, 60, bande.vu));
    toitPropose = toitDepuisEstimation(e.contour, e.cote, toitEstime, e.hauteur, e.distance);
  }
  // La teinte du mur (mediane de ce qui en a ete vu) remplace le ciel au-dessus de l'egout.
  effacerCiel(r.image, egout, teinteMediane(mur.image, mur.vu), r.vu);
  return {
    elevation: mur.image,
    texture: r.image,
    hauteurTexture: e.hauteur + egout / pxParM,
    pxParM,
    couverture: vusMur / Math.max(1, mur.vu.length),
    ouvertures,
    toitEstime,
    toitPropose,
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
