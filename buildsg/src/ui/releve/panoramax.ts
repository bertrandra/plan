// Les photos de rue dans le navigateur (MD/spec-releve-facade.md §4.3) : telecharger l'image
// choisie et en faire une photo du releve - telle quelle si elle est plate, recadree vers le mur
// si c'est un panoramique.
//
// Un panoramique de Panoramax fait souvent 8 000 pixels de large : lire ses pixels en entier
// couterait 130 Mo. On n'en decoupe que la bande utile (le champ vise, l'horizon, une marge), a
// pleine definition, dans un canevas, et c'est elle que facade/panorama.ts recadre.

import { chargerUrl, imageDuCanevas, versJpeg, lireFichier, type Photo } from './camera.js';
import { fenetreUtile, recadrerEquirectangulaire, type FenetreEquirect } from '../../facade/panorama.js';
import type { Image } from '../../facade/homographie.js';
import type { CandidatRue } from '../../geo/panoramax.js';

/** Champ de la photo plate tiree d'un panoramique : celui d'un objectif de telephone ordinaire. */
export const CHAMP_RECADRAGE = 65;
/** Plus grand cote de la photo recadree. */
const RECADRAGE_MAX_PX = 2000;

/** Telecharge une image (CORS : les serveurs Panoramax le permettent) ; `blob:` pour l'afficher et la lire. */
export async function telechargerImage(url: string, fetchFn: typeof fetch = fetch): Promise<Blob> {
  const r = await fetchFn(url, { mode: 'cors' });
  if (!r.ok) throw new Error('La photo n’a pas pu être téléchargée (HTTP ' + r.status + ').');
  return r.blob();
}

/** Un morceau du panoramique a copier dans la bande : source (sx, sy, sw, sh), destination dx. */
export interface MorceauBande { sx: number; sy: number; sw: number; sh: number; dx: number }

/** La bande d'un panoramique qui couvre `fenetre`, a pleine definition ; les caps au-dela du bord droit reprennent a la colonne 0. */
export function bandeEquirectangulaire(img: { naturalWidth: number; naturalHeight: number }, azimutCentre: number, fenetre: FenetreEquirect): { largeur: number; hauteur: number; morceaux: MorceauBande[] } {
  const W = img.naturalWidth, H = img.naturalHeight;
  const colonne = (az: number) => ((((az - azimutCentre + 180) % 360) + 360) % 360) / 360 * W;
  const ligne = (el: number) => ((90 - el) / 180) * H;
  const y0 = Math.floor(ligne(fenetre.elevationHaut)), y1 = Math.ceil(ligne(fenetre.elevationBas));
  const x0 = Math.floor(colonne(fenetre.azimutGauche));
  const largeur = Math.ceil(((fenetre.azimutDroit - fenetre.azimutGauche) / 360) * W);
  const hauteur = y1 - y0;
  const morceaux: MorceauBande[] = x0 + largeur <= W
    ? [{ sx: x0, sy: y0, sw: largeur, sh: hauteur, dx: 0 }]
    : [{ sx: x0, sy: y0, sw: W - x0, sh: hauteur, dx: 0 }, { sx: 0, sy: y0, sw: largeur - (W - x0), sh: hauteur, dx: W - x0 }];
  return { largeur, hauteur, morceaux };
}

/** La taille de la photo plate : la definition du panoramique, sans l'agrandir ni depasser le plafond. */
export function tailleRecadrage(largeurPanoramique: number, champ = CHAMP_RECADRAGE): { largeur: number; hauteur: number } {
  const l = Math.max(400, Math.min(RECADRAGE_MAX_PX, Math.round((largeurPanoramique * champ) / 360)));
  return { largeur: l, hauteur: Math.round((l * 3) / 4) };
}

/** Recadre un panoramique charge vers `cap`. */
export function recadrerPanoramique(img: HTMLImageElement, azimutCentre: number, cap: number, champ = CHAMP_RECADRAGE): Image {
  const { largeur, hauteur } = tailleRecadrage(img.naturalWidth, champ);
  const fenetre = fenetreUtile(cap, champ, largeur, hauteur);
  const b = bandeEquirectangulaire(img, azimutCentre, fenetre);
  const bande = document.createElement('canvas');
  bande.width = Math.max(1, b.largeur);
  bande.height = Math.max(1, b.hauteur);
  const ctx = bande.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Le navigateur n’a pas pu ouvrir un canevas pour le panoramique.');
  for (const m of b.morceaux) ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, m.dx, 0, m.sw, m.sh);
  return recadrerEquirectangulaire(imageDuCanevas(bande), fenetre, cap, champ, largeur, hauteur);
}

/** Une photo plate du releve a partir d'une image brute. */
export function photoDepuisImage(image: Image, champ: number | null): Photo {
  return { image, url: versJpeg(image, 0.9), champ, focalePx: null };
}

/**
 * La photo du releve pour une photo de rue : plate, elle est lue telle quelle, son champ (grand cote)
 * deduit de celui que le serveur annonce ; panoramique, elle est recadree vers le mur.
 */
export async function photoDeRue(c: CandidatRue, fetchFn: typeof fetch = fetch): Promise<Photo> {
  const blob = await telechargerImage(c.photo.hd, fetchFn);
  if (!c.photo.panoramique) {
    const p = await lireFichier(blob);
    return { ...p, champ: p.champ ?? champGrandCote(c.photo.champ, p.image.largeur, p.image.hauteur) };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await chargerUrl(url);
    return photoDepuisImage(recadrerPanoramique(img, c.photo.azimut ?? 0, c.cap), CHAMP_RECADRAGE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Le champ du grand cote quand le serveur donne le champ horizontal d'une image qui peut etre en portrait. */
export function champGrandCote(champHorizontal: number, largeur: number, hauteur: number): number {
  if (largeur >= hauteur) return champHorizontal;
  return (2 * Math.atan((hauteur / largeur) * Math.tan((champHorizontal * Math.PI) / 360)) * 180) / Math.PI;
}
