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
import type { Proposition } from '../regles/decisions.js';
import type { OuvertureFacade } from './types.js';

/** La version de la capture ecrite : une capture d'une version inconnue n'est pas reprise. */
export const VERSION_CAPTURE_PARCELLE = 1;

/** Les photos d'une facade, au plus : de face, de gauche a droite, de biais, plus un gros plan du parement. */
export const PHOTOS_PAR_FACADE_MAX = 8;
/** Les photos du toit d'un batiment, de la cloture ou du portail, au plus. */
export const PHOTOS_PAR_LIGNE_MAX = 8;

/** `capture` : sur place ; `analyse` : la capture est terminee, l'analyse (§13) la reprendra. */
export type PhaseAuditParcelle = 'capture' | 'analyse';

/**
 * Ce que la personne a corrige a la main sur le redressement d'une photo de facade : les quatre coins du mur
 * (hg, hd, bd, bg, en pixels de la photo) et/ou l'echelle (la largeur reelle du mur, en metres). Une correction
 * l'emporte toujours sur le calcul automatique, et un rejeu ne l'efface jamais : l'original est immuable, seul le
 * derive (la photo redressee, la fusion) se recalcule.
 */
export interface CorrectionRedressement {
  coins?: { x: number; y: number }[];
  echelleLargeurM?: number;
}

export type StatutRedressement = 'auto' | 'manuelle' | 'echec';
export type StatutFusionFacade = 'sans' | 'fusionnee' | 'partielle' | 'independantes';

/** Le redressement d'une photo : comment il s'est fait, la verticalite mesuree apres coup, et pourquoi il a echoue. */
export interface BilanPhotoRedressement {
  rang: number;
  statut: StatutRedressement;
  /** Ecart des verticales a la verticale, en degres, sur la photo redressee ; null quand aucune ligne n'a pu etre lue. */
  verticaliteDeg: number | null;
  /** Les coins viennent du calage fin sur les aretes (`trouve`), des points calcules (`predit`) ou de la main. */
  coins: 'trouve' | 'predit' | 'main';
  /** Les quatre coins du mur (hg, hd, bd, bg) en pixels de la photo, tels que le redressement les a utilises : de quoi partir pour les corriger. */
  coinsPx?: { x: number; y: number }[];
  /** Pourquoi `echec` ; absent sinon. */
  motif?: string;
}

/** Le redressement et la fusion des photos d'une facade, ce que le bouton « Rejouer » recalcule. Derive : jamais source de verite. */
export interface BilanRedressement {
  photos: BilanPhotoRedressement[];
  fusion: StatutFusionFacade;
  /** Les rangs des photos assemblees dans l'image fusionnee ; vide sans fusion. */
  fusionnees: number[];
  /** Pourquoi les autres photos restent seules (ou pourquoi aucune fusion n'a eu lieu) ; absent sinon. */
  motifFusion?: string;
}

export interface FacadeCapturee<P = PhotoCas> {
  photos: P[];
  /** Les corrections manuelles du redressement, par rang de photo dans `photos` (le rang en texte). */
  corrections?: Record<string, CorrectionRedressement>;
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
  /**
   * Chaque validation des propositions (§14, lot L11) : ce qui a ete accepte et refuse, par
   * identifiant de proposition. Une proposition refusee est une information (§15) : le fichier de
   * l'audit la gardera. Absent tant que rien n'est valide.
   */
  decisions?: DecisionAudit[];
  /**
   * Le partage pour le corpus (§15, decision D7) : « Partager cet audit pour améliorer Plan ».
   * Absent : la case de l'accord de l'analyse s'il a ete donne, sinon cochee (decision de
   * l'utilisateur, 13 octobre) ; rien n'est encore parti. Il reste sur l'appareil : le fichier de
   * l'audit ne le recopie pas, le secret de retrait non plus.
   */
  partage?: PartageCorpus;
  /**
   * La sauvegarde sur le serveur de Plan pendant la capture (§15) : le depot que chaque envoi
   * remplace, et quand il est parti. Absente tant que rien n'est parti. Comme le partage, elle reste
   * sur l'appareil : le fichier de l'audit ne la recopie pas, le secret de retrait non plus. Un
   * secret vide : le depot a ete rouvert par l'administrateur, sa session suffit a le remplacer.
   */
  sauvegarde?: EnvoiCorpus | null;
  /**
   * L'analyse par Claude (§13.2, lot L17) : l'accord de l'utilisateur, le batch en cours et ses
   * resultats. Absente tant que la question n'a pas ete posee. Elle vit dans la capture pour
   * survivre a un rechargement (brouillon) et pour le fichier de l'audit (§15).
   */
  analyse?: AnalyseCapture;
}

/** L'accord d'envoyer les photos a l'analyse (decision D2) : une fois par projet, revocable. */
export interface AccordAnalyse {
  t: string;
  /** « Partager cet audit pour améliorer Plan » (decision D7, cochee par defaut) : lu par le fichier de l'audit (lot L21). */
  partage: boolean;
}

/** Le batch envoye : son identifiant chez le serveur, quand, et quelles requetes (une par batiment et par passe). */
export interface BatchAnalyse {
  id: string;
  creeLe: string;
  /** Ce qui a ete envoye : les photos de la capture a ce moment-la ; un changement relance l'analyse. */
  signature: string;
  /**
   * L'identifiant de requete -> la cle du batiment et la passe ; pour le renfort d'une facade
   * (MD/spec-facades-calage-detection.md §12 bis, lot L18), aussi son cote et l'usage.
   */
  requetes: Record<string, { cle: string; passe: number; cote?: number; usage?: 'renfort' }>;
  /** Les etiquettes des images envoyees, par batiment, dans l'ordre : les indices de Claude s'y referent. */
  etiquettes: Record<string, EtiquetteImage[]>;
}

/** Ce qu'une image envoyee etait : une photo de la capture (et laquelle), ou une image produite par Plan. */
export interface EtiquetteImage {
  texte: string;
  photo?: { cle: string; cote?: number; rang: number };
}

/** Les reponses lues : les passes de chaque batiment, dans la forme du schema (model/analyseClaude.ts). */
export interface ResultatsAnalyse {
  t: string;
  modele: string;
  schema: number;
  prompt: number;
  /** Par cle du batiment, les reponses des passes reussies (les autres sont absentes). */
  parBatiment: Record<string, unknown[]>;
  /**
   * Le renfort de Claude sur chaque facade (lot L18), par `cle#cote` : ses graines deja recalees sur
   * l'elevation de la facade. Calcule une fois par facade, quand sa mesure est prete (le recalage lit
   * l'image du releve) ; jamais note vide.
   */
  renfort?: Record<string, RenfortFacadeCapture>;
  /**
   * Les reponses brutes du renfort, par `cle#cote` (schema-renfort, non verifiees ici) : le recalage
   * demande le releve mesure de la facade, qui n'existe qu'apres les mesures du telephone. A la reprise
   * d'un brouillon, le batch peut etre fini avant elles ; on garde donc les reponses pour recaler
   * chaque facade quand sa mesure arrive, au lieu de noter un renfort vide pour toujours.
   */
  renfortBrut?: Record<string, unknown[]>;
  /**
   * L'escalade (D20) : la reponse du modele plus fin pour chaque batiment dont les passes se desaccordaient, par cle.
   * Presente (meme vide) des que l'escalade a ete tentee : elle ne repart pas a la reprise d'un brouillon.
   */
  escalade?: Record<string, unknown>;
}

/** Ce que le renfort de Claude a fait des ouvertures d'une facade, pret a proposer (F§12 bis). */
export interface RenfortFacadeCapture {
  /** Les passes lues. */
  passes: number;
  /** Les ouvertures proposees cochees, puis celles laissees en pointille (decochees). */
  ouvertures: OuvertureFacade[];
  decochees: OuvertureFacade[];
  /** Les compteurs de facade/renfortRecalage.ts (graines, pleines, rejetees, retirees…). */
  bilan: Record<string, number>;
  /** Le bilan en une phrase ; null si Claude n'a rien change. */
  resume: string | null;
}

export interface AnalyseCapture {
  accord: AccordAnalyse | null;
  /** « Seulement les mesures » : quand on l'a dit ; la question n'est plus posee tant que la capture ne change pas. */
  refus?: string | null;
  batch?: BatchAnalyse | null;
  resultats?: ResultatsAnalyse | null;
  /** Le dernier echec, en clair, pour l'ecran ; null quand tout va bien. */
  erreur?: string | null;
}

/** L'audit tel que le serveur de Plan l'a recu : de quoi le retirer (la case decochee). */
export interface EnvoiCorpus {
  id: string;
  /** Le secret rendu par le serveur a l'envoi : lui seul (ou l'administrateur) retire le fichier. */
  retrait: string;
  /** Quand il est parti, ISO. */
  t: string;
}

export interface PartageCorpus {
  accord: boolean;
  envoi: EnvoiCorpus | null;
}

/** Ce que dit la case quand la capture n'en a rien retenu : cochee, rien d'envoye. */
export const PARTAGE_PAR_DEFAUT: PartageCorpus = Object.freeze({ accord: true, envoi: null }) as PartageCorpus;

/**
 * La case du partage : celle touchee dans l'ecran des propositions, sinon celle de l'accord de
 * l'analyse par Claude (la meme question, posee avec l'accord, lot L17), sinon cochee.
 */
export function partageDe(c: Pick<CaptureParcelle, 'partage' | 'analyse'>): PartageCorpus {
  if (c.partage) return c.partage;
  const accord = c.analyse?.accord;
  return accord ? { accord: accord.partage, envoi: null } : PARTAGE_PAR_DEFAUT;
}

/** Une validation des propositions : quand, ce qui a ete ecrit dans le projet, ce qui a ete refuse. */
export interface DecisionAudit {
  t: string;
  acceptees: string[];
  refusees: string[];
  /** Les batiments marques « vérifié sur place ». */
  verifies: string[];
  /**
   * Les propositions telles qu'elles etaient a cet instant, acceptees et refusees : une fois ecrite,
   * une proposition ne se recalcule plus (l'avant est devenu l'apres), et le fichier de l'audit
   * (§15) doit pourtant dire ce qui a ete propose. Absent d'une validation plus ancienne.
   */
  propositions?: Proposition[];
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

/**
 * Ce que l'analyse par Claude a recu : les photos de la capture, par leur taille et leur prise. Une
 * photo ajoutee ou retiree change la signature, et l'analyse se relance ; une note ne la change pas.
 */
export function signatureAnalyse(c: CaptureParcelle): string {
  const parts: string[] = [];
  for (const [cle, b] of Object.entries(c.batiments).sort(([a], [z]) => a.localeCompare(z))) {
    for (const [cote, f] of Object.entries(b.facades).sort(([a], [z]) => Number(a) - Number(z))) parts.push(cle + '#' + cote + ':' + f.photos.map((p) => p.base64.length + '@' + (p.prise?.t ?? '')).join(','));
    parts.push(cle + '/toit:' + b.photos.map((p) => p.base64.length + '@' + (p.prise?.t ?? '')).join(','));
  }
  return parts.join('|');
}
