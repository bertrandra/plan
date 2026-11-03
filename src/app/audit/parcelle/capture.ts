// La capture en cours de l'audit de la parcelle (MD/spec-audit.md §12) : chaque geste de la liste de
// controle et de l'ecran de prise l'ecrit ici, et previent ceux qui la suivent (l'ecran, le
// brouillon). Aucun DOM, aucun capteur : le controleur (app/audit/parcelle/controleur.ts) les branche.
//
// Rien de ce qui est note ici n'entre dans le projet : c'est la phase 1 (§11), le projet ne change
// qu'a la validation des propositions (§14).

import {
  batimentVide, captureVide, PHOTOS_PAR_FACADE_MAX, PHOTOS_PAR_LIGNE_MAX,
  type AnalyseCapture, type BatimentCapture, type CorrectionRedressement, type CaptureParcelle, type MurConfirme, type FacadeCapturee, type ClotureCapturee, type DecisionAudit, type EnvoiCorpus, type PartageCorpus, type PortailCapture,
} from '../../../model/auditParcelle.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { CeQueJeVois } from '../../../model/ceQueJeVois.js';
import type { PtBrut } from '../../../model/types.js';
import { creerPileGestes } from '../../../util/pileGestes.js';
import { facadesSurLeContour } from '../../../model/cotesAudit.js';

/** Ce qu'un geste note sur la cloture ou le portail : une cle sans valeur est retiree (on n'affirme que ce que l'on a vu). */
export type Note<T> = { [K in keyof Omit<T, 'photos'>]?: Omit<T, 'photos'>[K] | undefined };

export interface CaptureEnCours {
  lire(): CaptureParcelle;
  /** Change a chaque geste : la liste de controle se recalcule seulement quand il bouge. */
  version(): number;
  /** Une photo de plus sur cette facade ; au-dela du maximum, elle est ignoree (faux). */
  ajouterPhotoFacade(cle: string, cote: number, photo: PhotoCas): boolean;
  retirerPhotoFacade(cle: string, cote: number, rang: number): void;
  /** Une correction manuelle du redressement de cette photo (null : la retire). Elle prime sur le calcul et survit au rejeu. */
  corrigerRedressement(cle: string, cote: number, rang: number, correction: CorrectionRedressement | null): void;
  /**
   * « Confirmer le mur » (V1) : le mur que la chaine a retenu, confirme par la personne (null : la confirmation retiree). Comme une
   * correction, il survit au rejeu ; un mur qui change ensuite n'est plus le mur confirme (model/auditParcelle.ts::estLeMurConfirme).
   */
  confirmerMur(cle: string, cote: number, mur: MurConfirme | null): void;
  /**
   * Un geste de la personne sur une facade avant sa validation (les reperes, le mur tire, l'echelle, « Revenir à l'automatique », la
   * confirmation du mur) : `faire` ecrit dans la capture, et le geste entier devient un pas que Ctrl+Z defait (annulerGeste), sans rien
   * ecrire dans le projet ni le marquer modifie (decision du proprietaire, 3 novembre 2026). Rien n'est empile si rien n'a change.
   */
  geste(cle: string, cote: number, faire: () => void): void;
  /** Defait le dernier geste : la facade qu'il touchait, a rejouer ; null quand il n'y a rien a defaire. */
  annulerGeste(): { cle: string; cote: number } | null;
  /** Refait le dernier geste defait ; null quand il n'y a rien a refaire. */
  retablirGeste(): { cle: string; cote: number } | null;
  peutAnnulerGeste(): boolean;
  peutRetablirGeste(): boolean;
  /** Oublie les gestes a defaire : la validation V4 a ecrit dans le projet, son propre Ctrl+Z prend la suite. */
  oublierGestes(): void;
  /** Inaccessible, ou rendue a la liste : la touche inverse ce que la liste montre. */
  basculerInaccessible(cle: string, cote: number, inaccessibleAvant: boolean): void;
  noterVu(cle: string, vu: CeQueJeVois): void;
  ajouterPhotoBatiment(cle: string, photo: PhotoCas): boolean;
  retirerPhotoBatiment(cle: string, rang: number): void;
  noterCloture(c: Note<ClotureCapturee>): void;
  ajouterPhotoCloture(photo: PhotoCas): boolean;
  retirerPhotoCloture(rang: number): void;
  noterPortail(p: Note<PortailCapture>): void;
  ajouterPhotoPortail(photo: PhotoCas): boolean;
  retirerPhotoPortail(rang: number): void;
  /** « Lancer l'analyse » : la capture est terminee, l'analyse (§13) la reprendra. */
  terminer(): void;
  /** Une seconde visite complete l'audit (§12.3) : la capture reprend. */
  rouvrir(): void;
  /** Remplace la capture (un brouillon repris). */
  remplacer(c: CaptureParcelle): void;
  /**
   * Les facades de chaque batiment suivent leur mur sur son contour d'aujourd'hui (par cle ; model/cotesAudit.ts) : un sommet
   * ajoute ou retire depuis ne les envoie pas au mur voisin. Rend vrai si la capture a change.
   */
  suivreLesContours(contours: ReadonlyMap<string, readonly PtBrut[]>): boolean;
  /** Une validation des propositions (§14) : gardee avec la capture, pour le fichier de l'audit (§15). */
  noterDecision(d: DecisionAudit): void;
  /** La case « Partager cet audit pour améliorer Plan », et ce qui est parti sur le serveur (§15). */
  noterPartage(p: PartageCorpus): void;
  /** La sauvegarde sur le serveur de Plan (§15) : le depot que le prochain envoi remplace, ou null s'il n'y en a plus. */
  noterSauvegarde(s: EnvoiCorpus | null): void;
  /** L'analyse par Claude (§13.2) : ce qui change (accord, batch, resultats, erreur) ; le reste est garde. */
  noterAnalyse(a: Partial<AnalyseCapture>): void;
  abonner(f: () => void): () => void;
}

/** Une copie avec ces cles posees, et celles sans valeur retirees. */
function fusionner<T extends object>(o: T, x: object): T {
  const suite = { ...o } as Record<string, unknown>;
  for (const [k, v] of Object.entries(x)) { if (v === undefined) delete suite[k]; else suite[k] = v; }
  return suite as T;
}

/** Retire un rang d'une liste, sans toucher l'originale. */
const sans = <T>(liste: readonly T[], rang: number): T[] => liste.filter((_, i) => i !== rang);

/** Ce qu'un geste sur une facade change : ses corrections et le mur confirme (les photos n'en sont pas : elles ne s'annulent pas). */
type GestesDeLaFacade = Pick<FacadeCapturee, 'corrections' | 'murConfirme'>;

export function creerCapture(idu: string, maintenant: () => Date = () => new Date()): CaptureEnCours {
  let capture = captureVide(idu, maintenant());
  let version = 0;
  const abonnes = new Set<() => void>();
  const changer = () => { version++; abonnes.forEach((f) => f()); };
  /** Le batiment de la capture, cree a son premier geste. */
  const batiment = (cle: string): BatimentCapture => (capture.batiments[cle] ??= batimentVide());
  const facade = (cle: string, cote: number) => (batiment(cle).facades[String(cote)] ??= { photos: [] });
  // Les gestes d'une facade, par `cle#cote` : l'etat d'avant chaque geste, pour Ctrl+Z.
  const pile = creerPileGestes<GestesDeLaFacade>();
  const cleFacade = (cle: string, cote: number) => cle + '#' + cote;
  const deCle = (k: string) => ({ cle: k.slice(0, k.lastIndexOf('#')), cote: Number(k.slice(k.lastIndexOf('#') + 1)) });
  const gestesDe = (k: string): GestesDeLaFacade => {
    const { cle, cote } = deCle(k), f = capture.batiments[cle]?.facades[String(cote)];
    return JSON.parse(JSON.stringify({ ...(f?.corrections ? { corrections: f.corrections } : {}), ...(f?.murConfirme ? { murConfirme: f.murConfirme } : {}) })) as GestesDeLaFacade;
  };
  const remettre = (k: string, g: GestesDeLaFacade) => {
    const { cle, cote } = deCle(k), f = facade(cle, cote);
    if (g.corrections) f.corrections = g.corrections; else delete f.corrections;
    if (g.murConfirme) f.murConfirme = g.murConfirme; else delete f.murConfirme;
  };
  /** Defait ou refait : l'etat remis, la facade a rejouer. */
  const bouger = (g: { quoi: string; etat: GestesDeLaFacade } | null) => {
    if (!g) return null;
    remettre(g.quoi, g.etat);
    changer();
    return deCle(g.quoi);
  };

  return {
    lire: () => capture,
    version: () => version,
    ajouterPhotoFacade(cle, cote, photo) {
      const f = facade(cle, cote);
      if (f.photos.length >= PHOTOS_PAR_FACADE_MAX) return false;
      f.photos = [...f.photos, photo];
      // Une photo de plus ou de moins change les rangs et le mur : les gestes d'avant ne se defont plus sur elle.
      pile.vider();
      changer();
      return true;
    },
    retirerPhotoFacade(cle, cote, rang) {
      const f = capture.batiments[cle]?.facades[String(cote)];
      if (!f) return;
      f.photos = sans(f.photos, rang);
      // Les corrections suivent leur photo : celles des rangs suivants descendent d'un cran.
      if (f.corrections) {
        const suite: Record<string, CorrectionRedressement> = {};
        for (const [k, c] of Object.entries(f.corrections)) { const r = Number(k); if (r < rang) suite[k] = c; else if (r > rang) suite[String(r - 1)] = c; }
        if (Object.keys(suite).length) f.corrections = suite; else delete f.corrections;
      }
      // Une photo de moins : le mur confirme etait vu sur elle aussi, et ses rangs ont bouge. Il est a confirmer de nouveau.
      delete f.murConfirme;
      pile.vider();
      changer();
    },
    corrigerRedressement(cle, cote, rang, correction) {
      const f = facade(cle, cote);
      if (rang < 0 || rang >= f.photos.length) return;
      const suite = { ...(f.corrections ?? {}) };
      if (correction && (correction.coins || correction.reperes || correction.echelleLargeurM !== undefined)) suite[String(rang)] = JSON.parse(JSON.stringify(correction)) as CorrectionRedressement;
      else delete suite[String(rang)];
      if (Object.keys(suite).length) f.corrections = suite; else delete f.corrections;
      changer();
    },
    geste(cle, cote, faire) {
      const k = cleFacade(cle, cote), avant = gestesDe(k);
      faire();
      if (JSON.stringify(gestesDe(k)) !== JSON.stringify(avant)) pile.empiler(k, avant);
    },
    annulerGeste: () => bouger(pile.annuler(gestesDe)),
    retablirGeste: () => bouger(pile.retablir(gestesDe)),
    peutAnnulerGeste: () => pile.peutAnnuler(),
    peutRetablirGeste: () => pile.peutRetablir(),
    oublierGestes: () => pile.vider(),
    confirmerMur(cle, cote, mur) {
      const f = facade(cle, cote);
      if (mur && mur.coins.length) f.murConfirme = JSON.parse(JSON.stringify(mur)) as MurConfirme;
      else delete f.murConfirme;
      changer();
    },
    basculerInaccessible(cle, cote, inaccessibleAvant) {
      facade(cle, cote).inaccessible = !inaccessibleAvant;
      changer();
    },
    noterVu(cle, vu) { batiment(cle).vu = JSON.parse(JSON.stringify(vu)) as CeQueJeVois; changer(); },
    ajouterPhotoBatiment(cle, photo) {
      const b = batiment(cle);
      if (b.photos.length >= PHOTOS_PAR_LIGNE_MAX) return false;
      b.photos = [...b.photos, photo];
      changer();
      return true;
    },
    retirerPhotoBatiment(cle, rang) {
      const b = capture.batiments[cle];
      if (!b) return;
      b.photos = sans(b.photos, rang);
      changer();
    },
    noterCloture(c) { capture.cloture = fusionner(capture.cloture, c); changer(); },
    ajouterPhotoCloture(photo) {
      if (capture.cloture.photos.length >= PHOTOS_PAR_LIGNE_MAX) return false;
      capture.cloture = { ...capture.cloture, photos: [...capture.cloture.photos, photo] };
      changer();
      return true;
    },
    retirerPhotoCloture(rang) { capture.cloture = { ...capture.cloture, photos: sans(capture.cloture.photos, rang) }; changer(); },
    noterPortail(p) { capture.portail = fusionner(capture.portail, p); changer(); },
    ajouterPhotoPortail(photo) {
      if (capture.portail.photos.length >= PHOTOS_PAR_LIGNE_MAX) return false;
      capture.portail = { ...capture.portail, photos: [...capture.portail.photos, photo] };
      changer();
      return true;
    },
    retirerPhotoPortail(rang) { capture.portail = { ...capture.portail, photos: sans(capture.portail.photos, rang) }; changer(); },
    terminer() { capture = { ...capture, phase: 'analyse', finCapture: maintenant().toISOString() }; changer(); },
    rouvrir() { capture = { ...capture, phase: 'capture', finCapture: null }; changer(); },
    remplacer(c) { capture = c; pile.vider(); changer(); },
    suivreLesContours(contours) {
      let change = false;
      const batiments = { ...capture.batiments };
      for (const [cle, b] of Object.entries(capture.batiments)) {
        const pts = contours.get(cle);
        // Seul un batiment qui a des facades notees a des rangs a garder.
        if (!pts || pts.length < 3 || !Object.keys(b.facades).length) continue;
        const suite = facadesSurLeContour(b, pts);
        if (suite !== b) { batiments[cle] = suite; change = true; }
      }
      if (change) { capture = { ...capture, batiments }; changer(); }
      return change;
    },
    noterDecision(d) { capture = { ...capture, decisions: [...(capture.decisions ?? []), d] }; changer(); },
    noterPartage(p) { capture = { ...capture, partage: { accord: p.accord, envoi: p.envoi ? { ...p.envoi } : null } }; changer(); },
    noterSauvegarde(e) { capture = { ...capture, sauvegarde: e ? { ...e } : null }; changer(); },
    noterAnalyse(a) { capture = { ...capture, analyse: { accord: null, ...(capture.analyse ?? {}), ...a } }; changer(); },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}
