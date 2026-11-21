// Le photomontage : poser le projet de la Vue 3D sur une photo du jardin (demande du proprietaire, 20 novembre 2026).
//
// Ce module ne connait ni three ni le DOM : il dit ou poser la camera pour qu'elle voie le jardin comme l'appareil qui a pris la
// photo. Trois choses se lisent parfois dans l'EXIF (facade/vision/exif.ts) : la position (GPS), la direction (boussole) et la
// focale equivalente 24x36. Chacune peut manquer, et le GPS d'un telephone se trompe de plusieurs metres : ce calage est un point
// de depart, que la personne ajuste ensuite a la main (`ajusterPose`). Rien de ceci ne s'enregistre dans le projet : c'est un etat
// de session (pas de changement de schema).
//
// Le repere est celui du plan : x vers l'est, y vers le nord, en metres ; un cap se compte depuis le nord, dans le sens horaire.

import { projecteurLocal } from '../geo/projection.js';
import type { ExifPhoto } from '../model/audit.js';
import type { PtBrut } from '../model/types.js';

/** La hauteur des yeux de qui tient l'appareil, au-dessus du sol. */
export const OEIL_PHOTO_M = 1.6;
/** Le plus grand cote de la photo ramenee, comme les photos du dossier (app/declaration/photosDossier.ts). */
export const COTE_MAX_PHOTO = 2048;
/**
 * Au-dela, la position de l'EXIF n'est pas celle d'une photo du jardin (une photo prise ailleurs, un GPS perdu) : on photographie
 * souvent depuis la rue ou de chez un voisin, jamais de si loin.
 */
export const DISTANCE_MAX_GPS_M = 150;
/** Sans focale lue : l'objectif principal d'un telephone, 26 mm en equivalent 24x36. */
export const FOCALE_DEFAUT_35 = 26;
/** La diagonale du 24x36, en millimetres : une focale « equivalente » se rapporte a elle, quel que soit le format de la photo. */
const DIAGONALE_35 = Math.hypot(36, 24);

export const BORNES_POSE = { hauteurMin: 0.3, hauteurMax: 30, inclinaisonMax: 80, champMin: 12, champMax: 100 } as const;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const cap360 = (d: number) => ((d % 360) + 360) % 360;

/** Largeur et hauteur d'une image, en pixels. */
export interface Taille { l: number; h: number }

/** La camera du photomontage : ou elle est, vers ou elle regarde, ce qu'elle embrasse. */
export interface PosePhoto {
  x: number;
  y: number;
  /** La hauteur de l'objectif au-dessus du sol du projet a cet endroit. */
  hauteurM: number;
  /** La direction du regard, depuis le nord, sens horaire. */
  capDeg: number;
  /** L'inclinaison du regard : positive vers le haut. */
  inclinaisonDeg: number;
  /** Le champ vertical de l'image entiere. */
  champDeg: number;
}

/** Ce que le calage vise : le projet (sa terrasse, a defaut ce qu'il ajoute), et la maison derriere lui si elle est connue. */
export interface CibleProjet {
  centre: PtBrut;
  /** Le rayon du projet autour de son centre. */
  rayon: number;
  /** La hauteur de ce qu'on vise au-dessus du sol (le platelage). */
  hauteurM: number;
  /** Le centre de la maison : la pose par defaut regarde le projet avec elle en fond. */
  maison?: PtBrut | null;
}

/** Pourquoi la position n'a pas ete lue. */
export type SansPosition = 'sansGps' | 'planNonCale' | 'tropLoin';

/** Le calage tire d'une photo : la pose, et d'ou vient chacune de ses parts. */
export interface Calage {
  pose: PosePhoto;
  /** La position vient du GPS de la photo ; sinon pourquoi elle n'en vient pas. */
  position: 'gps' | SansPosition;
  /** La direction vient de la boussole de la photo ; sinon le regard se tourne vers le projet. */
  cap: 'exif' | 'versLeProjet';
  /** La focale lue, en equivalent 24x36 ; null : celle d'un telephone, par defaut. */
  focale35: number | null;
  /** La distance de la position lue au projet, en metres ; null sans position lue. */
  distanceM: number | null;
}

/** La taille de la photo ramenee : au plus `max` pixels de cote, sans l'agrandir ni la deformer. */
export function tailleRamenee(l: number, h: number, max: number = COTE_MAX_PHOTO): Taille {
  const k = Math.min(1, max / Math.max(l, h, 1));
  return { l: Math.max(1, Math.round(l * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Le rapport largeur sur hauteur de la zone de rendu : celui de la photo, qu'elle soit en paysage ou en portrait. */
export function rapportDeRendu(photo: Taille): number {
  return photo.l / Math.max(1, photo.h);
}

/**
 * Le champ vertical d'une image de cette taille prise a cette focale equivalente 24x36. L'equivalence se dit sur la diagonale : un
 * telephone photographie en 4/3, pas en 3/2, et la meme focale donne un champ vertical different selon que l'image est en paysage ou
 * en portrait (la hauteur de l'image est alors son grand cote).
 */
export function champVerticalDeg(focale35: number, image: Taille): number {
  const diagonale = Math.hypot(image.l, image.h) || 1;
  return deg(2 * Math.atan((DIAGONALE_35 / 2 / focale35) * (image.h / diagonale)));
}

/** L'inverse : la focale equivalente 24x36 qui donne ce champ vertical a une image de cette taille (pour le dire a l'ecran). */
export function focale35DepuisChamp(champDeg: number, image: Taille): number {
  const diagonale = Math.hypot(image.l, image.h) || 1;
  return (DIAGONALE_35 / 2) * (image.h / diagonale) / Math.tan(rad(champDeg) / 2);
}

/** Une position en degres ramenee aux metres du plan, dont l'origine est celle du calage du cadastre. */
export function positionDansLePlan(origine: { lat: number; lon: number }, p: { lat: number; lon: number }): PtBrut {
  return projecteurLocal(origine.lat, origine.lon).versMetres(p.lon, p.lat);
}

/** Le cap pour regarder de `de` vers `vers` ; null quand les deux points se confondent. */
function capVers(de: PtBrut, vers: PtBrut): number | null {
  const dx = vers.x - de.x, dy = vers.y - de.y;
  return Math.hypot(dx, dy) < 1 ? null : cap360(deg(Math.atan2(dx, dy)));
}

/** L'inclinaison pour viser le projet depuis cette position : jamais plus qu'un regard qui plonge ou monte franchement. */
function inclinaisonVers(p: PtBrut, hauteurM: number, cible: CibleProjet): number {
  const d = Math.max(1, Math.hypot(cible.centre.x - p.x, cible.centre.y - p.y));
  return borner(deg(Math.atan2(cible.hauteurM - hauteurM, d)), -35, 15);
}

/**
 * La pose par defaut, face au projet : a hauteur d'oeil, assez loin pour qu'il tienne dans l'image, la maison en fond si elle est
 * connue (on photographie une terrasse depuis le jardin), sinon depuis le sud. `capDeg` impose la direction du regard.
 */
export function poseParDefaut(cible: CibleProjet, image: Taille, champDeg: number, capDeg: number | null = null): PosePhoto {
  const cap = capDeg ?? (cible.maison ? capVers(cible.centre, cible.maison) : null) ?? 0;
  const demiV = rad(champDeg) / 2, demiH = Math.atan(Math.tan(demiV) * rapportDeRendu(image));
  const recul = borner((Math.max(1, cible.rayon) / Math.tan(Math.min(demiV, demiH))) * 1.15, 4, 40);
  const p = { x: cible.centre.x - Math.sin(rad(cap)) * recul, y: cible.centre.y - Math.cos(rad(cap)) * recul };
  return { ...p, hauteurM: OEIL_PHOTO_M, capDeg: cap, inclinaisonDeg: inclinaisonVers(p, OEIL_PHOTO_M, cible), champDeg };
}

/**
 * Le calage tire de l'EXIF d'une photo. Chaque part se lit si elle y est : la position (GPS, ramenee au plan si celui-ci est cale sur
 * le cadastre, et acceptee hors de la parcelle jusqu'a `DISTANCE_MAX_GPS_M` du projet), la direction (boussole ; sinon le regard se
 * tourne vers le projet), la focale. Sans position, la pose par defaut, face au projet.
 */
export function calerDepuisExif(exif: ExifPhoto | null, origine: { lat: number; lon: number } | null, cible: CibleProjet, image: Taille): Calage {
  const focale35 = exif?.focale35 && exif.focale35 > 0 ? exif.focale35 : null;
  const champDeg = borner(champVerticalDeg(focale35 ?? FOCALE_DEFAUT_35, image), BORNES_POSE.champMin, BORNES_POSE.champMax);
  const gps = exif?.gps ?? null;
  const capLu = gps && gps.capDeg !== null ? cap360(gps.capDeg) : null;
  const sans = (position: SansPosition, distanceM: number | null): Calage =>
    ({ pose: poseParDefaut(cible, image, champDeg, capLu), position, cap: capLu === null ? 'versLeProjet' : 'exif', focale35, distanceM });
  if (!gps) return sans('sansGps', null);
  if (!origine) return sans('planNonCale', null);
  const p = positionDansLePlan(origine, gps);
  const distanceM = Math.hypot(p.x - cible.centre.x, p.y - cible.centre.y);
  if (!(distanceM <= DISTANCE_MAX_GPS_M)) return sans('tropLoin', distanceM);
  const cap = capLu ?? capVers(p, cible.centre) ?? poseParDefaut(cible, image, champDeg).capDeg;
  return {
    pose: { x: p.x, y: p.y, hauteurM: OEIL_PHOTO_M, capDeg: cap, inclinaisonDeg: inclinaisonVers(p, OEIL_PHOTO_M, cible), champDeg },
    position: 'gps', cap: capLu === null ? 'versLeProjet' : 'exif', focale35, distanceM,
  };
}

const metres = (m: number) => (m < 10 ? m.toFixed(1).replace('.', ',') : String(Math.round(m))) + ' m';

/**
 * Ce que le calage a lu et ce qu'il n'a pas lu, en phrases pour l'ecran : la position, la direction, la focale. Jamais « exact » :
 * le GPS d'un telephone se trompe de plusieurs metres et sa boussole de plusieurs degres.
 */
export function phrasesDuCalage(c: Calage): { position: string; cap: string; focale: string } {
  const position = c.position === 'gps'
    ? 'Position lue dans la photo (GPS, à quelques mètres près), à ' + metres(c.distanceM ?? 0) + ' du projet : un point de départ, à ajuster.'
    : c.position === 'tropLoin'
      ? 'La position de la photo est à ' + metres(c.distanceM ?? 0) + ' du projet : trop loin pour une photo du jardin. La vue est posée face au projet, à ajuster.'
      : c.position === 'planNonCale'
        ? 'Ce projet n’est pas calé sur le cadastre : la position de la photo ne peut pas s’y placer. La vue est posée face au projet, à ajuster.'
        : 'La photo ne dit pas d’où elle a été prise (pas de GPS). La vue est posée face au projet, à ajuster.';
  const cap = c.cap === 'exif'
    ? 'Direction lue dans la photo (boussole, à quelques degrés près).'
    : 'Direction non lue : la vue regarde vers le projet.';
  const focale = c.focale35 !== null
    ? 'Focale lue : ' + Math.round(c.focale35) + ' mm.'
    : 'Focale non lue : celle d’un téléphone (' + FOCALE_DEFAUT_35 + ' mm), à régler avec le zoom.';
  return { position, cap, focale };
}

/** Un geste d'ajustement : chaque part s'ajoute a la pose. Avancer et se decaler suivent la direction du regard, au sol. */
export interface GestePhoto {
  avancerM?: number;
  /** Positif : vers la droite du regard. */
  decalerM?: number;
  monterM?: number;
  /** Positif : vers la droite (sens horaire). */
  tournerDeg?: number;
  /** Positif : vers le haut. */
  inclinerDeg?: number;
  /** Multiplie le champ : moins de 1 resserre (zoom avant), plus de 1 elargit. */
  champFois?: number;
}

/** La pose apres un geste, dans ses bornes : la camera reste un photographe, elle ne passe ni sous le sol ni a la verticale. */
export function ajusterPose(p: PosePhoto, g: GestePhoto): PosePhoto {
  const c = rad(p.capDeg), av = g.avancerM ?? 0, lat = g.decalerM ?? 0;
  return {
    x: p.x + Math.sin(c) * av + Math.cos(c) * lat,
    y: p.y + Math.cos(c) * av - Math.sin(c) * lat,
    hauteurM: borner(p.hauteurM + (g.monterM ?? 0), BORNES_POSE.hauteurMin, BORNES_POSE.hauteurMax),
    capDeg: cap360(p.capDeg + (g.tournerDeg ?? 0)),
    inclinaisonDeg: borner(p.inclinaisonDeg + (g.inclinerDeg ?? 0), -BORNES_POSE.inclinaisonMax, BORNES_POSE.inclinaisonMax),
    champDeg: borner(p.champDeg * (g.champFois ?? 1), BORNES_POSE.champMin, BORNES_POSE.champMax),
  };
}

/** La direction du regard d'une pose, unitaire : ses parts vers l'est, vers le nord et vers le haut. */
export function regardDe(p: PosePhoto): { est: number; nord: number; haut: number } {
  const c = rad(p.capDeg), i = rad(p.inclinaisonDeg);
  return { est: Math.sin(c) * Math.cos(i), nord: Math.cos(c) * Math.cos(i), haut: Math.sin(i) };
}

/**
 * Ou tombe l'horizon dans l'image, de 0 (en haut) a 1 (en bas) ; hors de [0, 1] quand il sort du cadre. Sert a verifier a l'oeil que
 * la perspective de la scene s'accorde a celle de la photo, et a le dire a l'ecran.
 */
export function hauteurHorizon(p: PosePhoto): number {
  return 0.5 + Math.tan(rad(p.inclinaisonDeg)) / (2 * Math.tan(rad(p.champDeg) / 2));
}

/** Le pas d'un bouton ou d'une touche : assez fin pour tomber juste, assez grand pour ne pas s'y reprendre vingt fois. */
export const PAS_POSE = { tournerDeg: 2, inclinerDeg: 1, deplacerM: 0.5, monterM: 0.1, champFois: 1.05 } as const;

/**
 * Le geste d'une touche du clavier, ou null : les fleches tournent et inclinent le regard, avec Maj elles deplacent le point de vue
 * (avancer, reculer, se decaler) ; + et - zooment ; Page precedente et Page suivante montent et descendent.
 */
export function gesteDeLaTouche(touche: string, maj: boolean): GestePhoto | null {
  switch (touche) {
    case 'ArrowLeft': return maj ? { decalerM: -PAS_POSE.deplacerM } : { tournerDeg: -PAS_POSE.tournerDeg };
    case 'ArrowRight': return maj ? { decalerM: PAS_POSE.deplacerM } : { tournerDeg: PAS_POSE.tournerDeg };
    case 'ArrowUp': return maj ? { avancerM: PAS_POSE.deplacerM } : { inclinerDeg: PAS_POSE.inclinerDeg };
    case 'ArrowDown': return maj ? { avancerM: -PAS_POSE.deplacerM } : { inclinerDeg: -PAS_POSE.inclinerDeg };
    case '+': case '=': return { champFois: 1 / PAS_POSE.champFois };
    case '-': return { champFois: PAS_POSE.champFois };
    case 'PageUp': return { monterM: PAS_POSE.monterM };
    case 'PageDown': return { monterM: -PAS_POSE.monterM };
    default: return null;
  }
}

/**
 * Le geste d'un glisser sur l'image : le point saisi suit le doigt, donc le regard tourne a l'oppose du glisser. `hauteurPx` est la
 * hauteur de l'image a l'ecran : elle couvre le champ vertical.
 */
export function gesteDuGlisser(dx: number, dy: number, hauteurPx: number, champDeg: number): GestePhoto {
  const k = champDeg / Math.max(1, hauteurPx);
  return { tournerDeg: -dx * k, inclinerDeg: dy * k };
}
