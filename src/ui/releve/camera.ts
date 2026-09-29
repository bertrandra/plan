// La camera du telephone et les photos importees, cote navigateur (spec-releve-facade §5).
//
// Tout ce qui touche au DOM pour le releve est ici : ouvrir le flux arriere, en saisir une image a
// pleine definition, lire un fichier choisi, et passer d'un canevas a une `Image` brute que le
// calcul (facade/) sait traiter - et retour, pour encoder la texture en JPEG.

import type { Image } from '../../facade/homographie.js';
import { focale35mm, champDepuisFocale35 } from '../../facade/exif.js';
import { grandAngleParmi, zoomGrandAngle } from '../../facade/objectifs.js';

/** Plus grand cote d'une photo traitee : au-dela, le redressement ne gagne rien et coute. */
export const PHOTO_MAX_PX = 2400;

/** Une photo prete a traiter, et ce qu'on sait de l'objectif. */
export interface Photo {
  image: Image;
  /** L'URL de la photo pour l'afficher (objet blob ou data:). */
  url: string;
  /** Champ du grand cote, en degres, quand on le connait (EXIF, module natif). */
  champ: number | null;
  /** Focale en pixels quand le module natif la donne directement (intrinseques ARKit). */
  focalePx: number | null;
}

export function cameraDisponible(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Quel objectif ouvrir : une camera par son identifiant (iPhone), ou la principale avec un zoom (Android). */
export interface ChoixCamera {
  deviceId?: string | null;
  zoom?: number | null;
}

/** Ce que le telephone offre pour le grand-angle, decouvert apres une premiere ouverture. */
export interface OffreGrandAngle {
  /** Une camera a part (iPhone) : son identifiant. */
  deviceId: string | null;
  /** Un zoom inferieur a 1 sur la camera ouverte (Android). */
  zoom: number | null;
}

type CapacitesZoom = MediaTrackCapabilities & { zoom?: { min?: number; max?: number } };

/**
 * Ouvre la camera arriere dans `video`. On demande la plus grande definition que le telephone
 * accepte : c'est elle qui fixe la finesse de la texture. Avec un identifiant, c'est cette camera-la
 * (le grand-angle d'un iPhone) ; avec un zoom, il est applique a la piste une fois ouverte.
 */
export async function ouvrirCamera(video: HTMLVideoElement, choix: ChoixCamera = {}): Promise<MediaStream> {
  const taille = { width: { ideal: 3840 }, height: { ideal: 2160 } };
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: choix.deviceId ? { deviceId: { exact: choix.deviceId }, ...taille } : { facingMode: { ideal: 'environment' }, ...taille },
  });
  const piste = flux.getVideoTracks()[0];
  if (choix.zoom && piste) {
    // `zoom` n'est pas dans les types du DOM : Chrome Android le connait, Safari l'ignore.
    await piste.applyConstraints({ advanced: [{ zoom: choix.zoom } as MediaTrackConstraintSet] }).catch(() => undefined);
  }
  video.srcObject = flux;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play().catch(() => undefined);
  return flux;
}

/**
 * Ce que le telephone offre pour le grand-angle. A appeler camera ouverte : avant la permission, les
 * noms des cameras sont vides et on ne reconnaitrait rien.
 */
export async function decouvrirGrandAngle(flux: MediaStream): Promise<OffreGrandAngle> {
  const piste = flux.getVideoTracks()[0];
  const capacites = (piste?.getCapabilities?.() ?? {}) as CapacitesZoom;
  let cameras: { deviceId: string; label: string }[] = [];
  try {
    cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    /* sans liste, on garde le zoom */
  }
  return { deviceId: grandAngleParmi(cameras), zoom: zoomGrandAngle(capacites.zoom?.min) };
}

export function fermerCamera(flux: MediaStream | null): void {
  flux?.getTracks().forEach((t) => t.stop());
}

/** Le contexte 2D d'un canevas : sans lui (memoire epuisee, canevas trop grand), rien ne se dessine. */
function contexte2d(c: HTMLCanvasElement, lecturesFrequentes = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: lecturesFrequentes });
  if (!ctx) throw new Error("Le navigateur n'a pas pu ouvrir un canevas de " + c.width + ' x ' + c.height + ' pixels.');
  return ctx;
}

/** Un canevas a la taille voulue, reduit si besoin pour ne pas depasser `PHOTO_MAX_PX`. */
function canevasPour(l: number, h: number): { c: HTMLCanvasElement; k: number } {
  const k = Math.min(1, PHOTO_MAX_PX / Math.max(l, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(l * k));
  c.height = Math.max(1, Math.round(h * k));
  return { c, k };
}

function imageDuCanevas(c: HTMLCanvasElement): Image {
  const ctx = contexte2d(c, true);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { largeur: c.width, hauteur: c.height, donnees: d.data };
}

/** Saisit l'image courante du flux video. */
export function saisir(video: HTMLVideoElement): Photo | null {
  const l = video.videoWidth,
    h = video.videoHeight;
  if (!l || !h) return null;
  const { c } = canevasPour(l, h);
  contexte2d(c).drawImage(video, 0, 0, c.width, c.height);
  return { image: imageDuCanevas(c), url: c.toDataURL('image/jpeg', 0.85), champ: null, focalePx: null };
}

/** Charge une image depuis une URL (fichier, data:) dans un canevas. */
async function chargerUrl(url: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/** Lit une photo choisie dans un fichier : l'orientation EXIF est appliquee par le navigateur. */
export async function lireFichier(fichier: File): Promise<Photo> {
  const tampon = await fichier.arrayBuffer();
  const f35 = focale35mm(tampon);
  const url = URL.createObjectURL(fichier);
  const img = await chargerUrl(url);
  const { c } = canevasPour(img.naturalWidth, img.naturalHeight);
  contexte2d(c).drawImage(img, 0, 0, c.width, c.height);
  return { image: imageDuCanevas(c), url, champ: f35 ? champDepuisFocale35(f35) : null, focalePx: null };
}

/** Une photo livree par le module natif : JPEG en data:, focale en pixels de l'image livree. */
export async function lirePhotoNative(dataUrl: string, focalePx: number | null): Promise<Photo> {
  const img = await chargerUrl(dataUrl);
  const { c, k } = canevasPour(img.naturalWidth, img.naturalHeight);
  contexte2d(c).drawImage(img, 0, 0, c.width, c.height);
  return { image: imageDuCanevas(c), url: dataUrl, champ: null, focalePx: focalePx ? focalePx * k : null };
}

/** Encode une image brute en JPEG. */
export function versJpeg(img: Image, qualite = 0.82): string {
  const c = document.createElement('canvas');
  c.width = img.largeur;
  c.height = img.hauteur;
  const ctx = contexte2d(c);
  const d = ctx.createImageData(img.largeur, img.hauteur);
  d.data.set(img.donnees);
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/jpeg', qualite);
}
