// « La maison se voit-elle ? », cote ecran (vueDegagee.ts) : la version reduite d'un panoramique (celle que la liste et l'apercu
// montrent deja, 2048 px), lue une fois, et pour chaque vue la zone du batiment. Une photo a la fois, en tache de fond
// (fileLectures.ts) : rien ne bloque l'ecran, rien ne se telecharge en rafale, et tout s'arrete quand la liste change.

import { useSyncExternalStore } from 'react';
import { vueDuPanoramique } from '../../equirect.js';
import { CADRE_VUE } from '../../facadesVues.js';
import { FileDeLectures, type Tache } from '../../fileLectures.js';
import { bitmap, liberer, pixels, reduire } from '../../images.js';
import type { PhotoRue, VueAExtraire } from '../../panoramax.js';
import { HAUTEUR_LUE, LARGEUR_LUE, lireLaZone, reduireDeMoitie, type Lecture } from '../../vueDegagee.js';
import { panoGarde, type Pano } from './panoramiques.js';

export interface PhotoALire { photo: PhotoRue; vues: readonly VueAExtraire[] }

/** La cle d'une vue : sa photo et son cap, au degre. */
export const cleDeLecture = (photo: string, cap: number): string => photo + '|' + Math.round(cap);
/** La cle d'une photo a lire : elle et les caps de ses vues (une vue tournee autrement se relit). */
export const cleDePhoto = (p: PhotoALire): string => p.photo.id + '|' + p.vues.map((v) => Math.round(v.cap)).join(',');

async function lirePano(url: string, signal: AbortSignal): Promise<Pano> {
  // La meme adresse que l'image de la liste (lue en CORS) : le cache du navigateur la rend sans la retelecharger.
  const r = await fetch(url, { mode: 'cors', signal });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const b = await bitmap(await r.blob());
  const c = reduire(b, 2048);
  try { return pixels(c); } finally { liberer(c); b.close(); }
}

async function lire(p: PhotoALire, signal: AbortSignal): Promise<Map<string, Lecture>> {
  const pano = panoGarde(p.photo.id) ?? await lirePano(p.photo.sd ?? p.photo.hd, signal);
  const out = new Map<string, Lecture>();
  for (const v of p.vues) {
    if (!v.zone) continue;
    // Au double puis reduit de moitie, comme les temoins sur lesquels le seuil est cale.
    const vue = reduireDeMoitie(vueDuPanoramique(pano, { capCentre: p.photo.azimut ?? 0, cap: v.cap, tangage: CADRE_VUE.tangage, champ: CADRE_VUE.champ, largeur: 2 * LARGEUR_LUE, hauteur: 2 * HAUTEUR_LUE }));
    out.set(cleDeLecture(p.photo.id, v.cap), lireLaZone(vue, v.zone));
  }
  return out;
}

const FILE = new FileDeLectures<PhotoALire, Map<string, Lecture>>(lire);

/** Les photos a lire maintenant, les mieux placees d'abord (toute la file, pas un ajout). */
export const demanderLesLectures = (photos: readonly PhotoALire[]): void => FILE.demander(photos.map((p): Tache<PhotoALire> => ({ cle: cleDePhoto(p), charge: p })));

/** La lecture d'une vue : `undefined` tant qu'elle n'est pas faite (ou si elle a echoue : la vue garde alors sa note). */
export const lectureDe = (p: PhotoALire, cap: number): Lecture | undefined => FILE.resultat(cleDePhoto(p))?.get(cleDeLecture(p.photo.id, cap));
/** La photo attend-elle encore sa lecture ? Faux une fois lue, ou si sa lecture a echoue. */
export const lectureAttendue = (p: PhotoALire): boolean => FILE.resultat(cleDePhoto(p)) === undefined;

/** Change a chaque lecture faite : un composant qui la lit se redessine. */
export const useVersionDesLectures = (): number => useSyncExternalStore(FILE.abonner, () => FILE.version);
