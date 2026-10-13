// L'audit de la parcelle du projet, phase 1 : la capture (MD/spec-audit.md §11, §12).
//
// Ce que la visite ramene, batiment par batiment : les photos rangees sur chaque facade, celles qui
// sont inaccessibles, « Ce que je vois » du toit, des cheminees, de la terrasse et des materiaux ;
// puis la cloture cote rue et le portail. Rien de cela n'entre dans le projet a cette phase : la
// capture vit dans le brouillon local (io/brouillonAudit.ts) jusqu'a la validation des propositions
// (§14, lot suivant).
//
// Les facades se designent par le rang de leur cote dans le contour (`Facade.cote`), comme un
// releve : c'est ce qui les rattache a leur mur.

import type { PhotoCas } from './audit.js';
import type { CeQueJeVois } from './ceQueJeVois.js';

/** La version de la capture ecrite : une capture d'une version inconnue n'est pas reprise. */
export const VERSION_CAPTURE_PARCELLE = 1;

/** Les photos d'une facade, au plus : de face, de gauche a droite, de biais, plus un gros plan du parement. */
export const PHOTOS_PAR_FACADE_MAX = 8;
/** Les photos du toit d'un batiment, de la cloture ou du portail, au plus. */
export const PHOTOS_PAR_LIGNE_MAX = 4;

/** `capture` : sur place ; `analyse` : la capture est terminee, l'analyse (§13) la reprendra. */
export type PhaseAuditParcelle = 'capture' | 'analyse';

export interface FacadeCapturee<P = PhotoCas> {
  photos: P[];
  /**
   * Marquee a la main : `true` inaccessible (cote voisin, cachee), `false` accessible malgre ce que
   * la liste supposait (le mur d'un mitoyen vu depuis le jardin). Absente : ce que la liste suppose.
   */
  inaccessible?: boolean;
}

export interface BatimentCapture<P = PhotoCas> {
  /** Par rang du cote dans le contour. */
  facades: Record<string, FacadeCapturee<P>>;
  vu: CeQueJeVois;
  /** Les photos du toit prises depuis la rue : rangees sur le batiment, pas sur une facade (§12.2). */
  photos: P[];
}

export type TypeCloture = 'mur' | 'grillage' | 'palissade' | 'haie';
export const TYPES_CLOTURE: readonly { code: TypeCloture; libelle: string }[] = [
  { code: 'mur', libelle: 'Mur' },
  { code: 'grillage', libelle: 'Grillage' },
  { code: 'palissade', libelle: 'Palissade' },
  { code: 'haie', libelle: 'Haie' },
];

export interface ClotureCapturee<P = PhotoCas> {
  type?: TypeCloture;
  hauteurM?: number;
  soubassement?: boolean;
  photos: P[];
}

export type NaturePortail = 'portail' | 'portillon' | 'aucun';
export const NATURES_PORTAIL: readonly { code: NaturePortail; libelle: string }[] = [
  { code: 'portail', libelle: 'Portail' },
  { code: 'portillon', libelle: 'Portillon' },
  { code: 'aucun', libelle: 'Aucun' },
];
/** Ou est le portail le long de la limite, vu de la rue. */
export type PositionPortail = 'gauche' | 'centre' | 'droite';
export const POSITIONS_PORTAIL: readonly { code: PositionPortail; libelle: string }[] = [
  { code: 'gauche', libelle: 'À gauche' },
  { code: 'centre', libelle: 'Au milieu' },
  { code: 'droite', libelle: 'À droite' },
];

export interface PortailCapture<P = PhotoCas> {
  nature?: NaturePortail;
  position?: PositionPortail;
  largeurM?: number;
  photos: P[];
}

/** `P` : une photo, ou ce qui la remplace dans le brouillon (sa cle). */
export interface CaptureParcelle<P = PhotoCas> {
  version: typeof VERSION_CAPTURE_PARCELLE;
  /** `parcelle-<idu>` : une capture par parcelle sur l'appareil. */
  id: string;
  /** Le debut de la visite, ISO : « Reprendre l'audit du … » le nomme. */
  debut: string;
  idu: string | null;
  phase: PhaseAuditParcelle;
  /** Quand « Lancer l'analyse » a termine la capture, ISO ; null pendant la capture. */
  finCapture: string | null;
  /** Par cle du batiment dans le plan. */
  batiments: Record<string, BatimentCapture<P>>;
  cloture: ClotureCapturee<P>;
  portail: PortailCapture<P>;
}

/** L'identifiant de la capture d'une parcelle : la meme parcelle retrouve son brouillon. */
export const idCaptureParcelle = (idu: string): string => 'parcelle-' + idu;

export function captureVide(idu: string, debut: Date = new Date()): CaptureParcelle {
  return {
    version: VERSION_CAPTURE_PARCELLE, id: idCaptureParcelle(idu), debut: debut.toISOString(), idu,
    phase: 'capture', finCapture: null, batiments: {}, cloture: { photos: [] }, portail: { photos: [] },
  };
}

export const batimentVide = (): BatimentCapture => ({ facades: {}, vu: {}, photos: [] });

/** Une capture relue (brouillon) est-elle une capture que ce code sait reprendre. */
export function estCaptureParcelle(v: unknown): v is CaptureParcelle {
  const c = v as Partial<CaptureParcelle> | null;
  return !!c && typeof c === 'object' && c.version === VERSION_CAPTURE_PARCELLE && typeof c.id === 'string'
    && typeof c.debut === 'string' && !Number.isNaN(Date.parse(c.debut)) && !!c.batiments && typeof c.batiments === 'object'
    && !!c.cloture && Array.isArray(c.cloture.photos) && !!c.portail && Array.isArray(c.portail.photos);
}

/** Toutes les photos d'une capture, dans un ordre stable : facades, toit, cloture, portail. */
export function photosDeLaCapture(c: CaptureParcelle): PhotoCas[] {
  const out: PhotoCas[] = [];
  for (const b of Object.values(c.batiments)) {
    for (const f of Object.values(b.facades)) out.push(...f.photos);
    out.push(...b.photos);
  }
  out.push(...c.cloture.photos, ...c.portail.photos);
  return out;
}

/**
 * Applique `f` a chaque liste de photos de la capture, et rend une copie : c'est ainsi que le
 * brouillon range les photos a part (leur contenu remplace par une cle) et les rend a la reprise.
 */
export function transformerPhotos<A, B>(c: CaptureParcelle<A>, f: (photos: A[]) => B[]): CaptureParcelle<B> {
  const batiments: Record<string, BatimentCapture<B>> = {};
  for (const [cle, b] of Object.entries(c.batiments)) {
    const facades: Record<string, FacadeCapturee<B>> = {};
    for (const [cote, fa] of Object.entries(b.facades)) facades[cote] = { ...fa, photos: f(fa.photos) };
    batiments[cle] = { facades, vu: JSON.parse(JSON.stringify(b.vu)) as CeQueJeVois, photos: f(b.photos) };
  }
  return { ...c, batiments, cloture: { ...c.cloture, photos: f(c.cloture.photos) }, portail: { ...c.portail, photos: f(c.portail.photos) } };
}
