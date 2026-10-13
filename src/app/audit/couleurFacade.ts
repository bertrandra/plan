// La couleur de la facade sur les photos d'un cas (MD/spec-audit.md §6.2, §18.4).
//
// Chaque photo jointe a un cas est lue en tache de fond, sans bloquer la marche : le mur du batiment
// devant la prise de vue (§6.1), puis sa couleur, par la geometrie de la prise de vue
// (render/couleurPhotoAudit.ts). Quand la lecture ne conclut pas, ou que la direction vient du sens
// de la marche (qui ne dit pas ou pointait le telephone), la fiche demande de toucher la facade.
//
// Ce qui est lu se range dans le cas (`lectures.facades`) : une verite terrain, pas une correction.
// L'etat d'une lecture en cours ne se garde pas : il vit le temps de la promenade.

import { lireFacadeSurPhoto, teinteAuToucher, pixelsDePhoto } from '../../render/couleurPhotoAudit.js';
import type { Pixels } from '../../render/couleurMurPhoto.js';
import type { Obstacle } from '../../geometry/ligneDeVue.js';
import type { Facade } from '../../facade/geometrie.js';
import type { LectureFacade, PhotoCas } from '../../model/audit.js';
import type { PtBrut } from '../../model/types.js';
import type { Promenade } from './promenade.js';

/** Pourquoi la fiche demande de toucher la facade. */
export type RaisonToucher = 'marche' | 'ambigu' | 'bord';
/** Pourquoi la photo ne donne pas de couleur : elle reste une photo. */
export type RaisonSansMur = 'position' | 'direction' | 'mur' | 'image';

/** Ou en est la couleur d'une photo. */
export type EtatCouleurPhoto =
  | { etat: 'lecture' }
  | { etat: 'lue'; lecture: LectureFacade; orientation: string | null }
  | { etat: 'toucher'; cote: number; orientation: string; raison: RaisonToucher }
  | { etat: 'sansMur'; raison: RaisonSansMur };

export interface DependancesCouleur {
  promenade: Promenade;
  /** Les facades du batiment, pour nommer le mur d'une lecture. */
  facades: (cle: string) => readonly Facade[];
  /** La facade du batiment devant la prise de vue (§6.1), le cap departageant ; null si aucune. */
  devant: (cle: string, position: PtBrut, cap: number | null) => Facade | null;
  /** Les limites de parcelle, ou se tiennent les clotures. */
  limites: () => readonly Obstacle[];
  pixels?: (base64: string) => Promise<Pixels | null>;
}

export interface CouleursPhotos {
  etat(cle: string, photo: PhotoCas): EtatCouleurPhoto | null;
  /** Lit la couleur de la facade sur cette photo du cas, en tache de fond. */
  lire(cle: string, photo: PhotoCas): Promise<void>;
  /** Le doigt pose sur la photo, en part de sa largeur et de sa hauteur (0 a 1) ; vrai si la teinte est lue. */
  toucher(cle: string, photo: PhotoCas, x: number, y: number): Promise<boolean>;
  abonner(f: () => void): () => void;
}

export function creerCouleursPhotos(d: DependancesCouleur): CouleursPhotos {
  // Par photo, et non par rang : une photo retiree decale les suivantes.
  const etats = new WeakMap<PhotoCas, EtatCouleurPhoto>();
  // Les pixels d'une photo a toucher, pour ne pas la relire a chaque doigt ; oublies une fois lue.
  const images = new WeakMap<PhotoCas, Pixels>();
  const abonnes = new Set<() => void>();
  const signaler = () => abonnes.forEach((f) => f());
  const poser = (photo: PhotoCas, e: EtatCouleurPhoto) => { etats.set(photo, e); signaler(); };
  const charger = d.pixels ?? pixelsDePhoto;
  const orientation = (cle: string, cote: number) => d.facades(cle).find((f) => f.cote === cote)?.orientation ?? null;

  /** Range la lecture dans le cas ; faux si la photo n'y est plus (retiree entre-temps). */
  function ranger(cle: string, photo: PhotoCas, l: Omit<LectureFacade, 'photo'>): boolean {
    const rang = d.promenade.cas(cle)?.constat.photos.indexOf(photo) ?? -1;
    if (rang < 0) return false;
    etats.delete(photo);
    images.delete(photo);
    d.promenade.completer(cle, { lectureFacade: { ...l, photo: rang } });
    signaler();
    return true;
  }

  async function pixels(photo: PhotoCas): Promise<Pixels | null> {
    const deja = images.get(photo);
    if (deja) return deja;
    const img = await charger(photo.base64).catch(() => null);
    if (img) images.set(photo, img);
    return img;
  }

  return {
    etat(cle, photo) {
      const c = d.promenade.cas(cle);
      const rang = c ? c.constat.photos.indexOf(photo) : -1;
      const lecture = rang >= 0 ? c?.lectures?.facades.find((l) => l.photo === rang) : undefined;
      if (lecture) return { etat: 'lue', lecture, orientation: orientation(cle, lecture.cote) };
      return etats.get(photo) ?? null;
    },
    async lire(cle, photo) {
      const prise = photo.prise;
      if (!prise) { poser(photo, { etat: 'sansMur', raison: 'position' }); return; }
      if (prise.azimutDeg === null) { poser(photo, { etat: 'sansMur', raison: 'direction' }); return; }
      const marche = prise.sourceAzimut === 'deplacement';
      // Le sens de la marche ne designe pas le mur vise : a defaut, le plus proche devant lequel on est.
      const f = d.devant(cle, prise, prise.azimutDeg) ?? (marche ? d.devant(cle, prise, null) : null);
      if (!f) { poser(photo, { etat: 'sansMur', raison: 'mur' }); return; }
      if (marche) { poser(photo, { etat: 'toucher', cote: f.cote, orientation: f.orientation, raison: 'marche' }); return; }
      poser(photo, { etat: 'lecture' });
      const img = await pixels(photo);
      if (!img) { poser(photo, { etat: 'sansMur', raison: 'image' }); return; }
      const l = lireFacadeSurPhoto(img, prise, { a: f.gauche, b: f.droite, egout: f.hauteur }, d.limites());
      // Une photo retiree entre-temps ne garde rien.
      if (l.couleur) { ranger(cle, photo, { cote: f.cote, couleur: l.couleur, source: 'automatique', pixels: l.pixels }); return; }
      poser(photo, { etat: 'toucher', cote: f.cote, orientation: f.orientation, raison: 'ambigu' });
    },
    async toucher(cle, photo, x, y) {
      const e = etats.get(photo);
      if (!e || e.etat !== 'toucher') return false;
      const img = await pixels(photo);
      if (!img) { poser(photo, { etat: 'sansMur', raison: 'image' }); return false; }
      const t = teinteAuToucher(img, x * img.largeur, y * img.hauteur);
      if (t) return ranger(cle, photo, { cote: e.cote, couleur: t.couleur, source: 'toucher', pixels: t.pixels });
      poser(photo, { ...e, raison: 'bord' });
      return false;
    },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}

/** Ce que la fiche dit d'une photo sans couleur. */
export const TEXTES_SANS_MUR: Record<RaisonSansMur, string> = {
  position: 'Prise sans position : la couleur de la façade n’est pas lue.',
  direction: 'Sans direction de prise de vue, la couleur de la façade n’est pas lue.',
  mur: 'Aucune façade de ce bâtiment n’est devant la prise de vue (3 à 40 m, de face).',
  image: 'Cette photo n’a pas pu être lue.',
};

/** Pourquoi la fiche demande de toucher la facade. */
export const TEXTES_TOUCHER: Record<RaisonToucher, string> = {
  marche: 'La direction vient du sens de la marche : Plan ne sait pas où visait le téléphone.',
  ambigu: 'La lecture automatique n’a pas conclu : fenêtres, ombre, haie ou voiture devant le mur.',
  bord: 'Ce point ne montre pas une teinte unie : touchez le mur loin des fenêtres et des ombres.',
};
