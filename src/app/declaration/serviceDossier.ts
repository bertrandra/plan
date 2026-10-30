// Le dossier de declaration prealable, vu du dialogue de la declaration (lot L5 de la lecture IA elargie, §5.4) : les textes des pieces,
// les photographies DP7 et DP8, et la relecture avant l'export.
//
// Chaque ecriture du projet (un brouillon range, un texte valide ou retire, une photo choisie ou retiree) est un pas d'annulation et
// marque le projet modifie, sur la parcelle du projet, comme la declaration elle-meme. Ce que la personne tape et n'a pas encore
// valide (l'edition) reste dans ce service : il n'entre dans le projet qu'a la validation, qui seule fait foi pour l'export.

import { descriptionCalculee, ouvragesDeclares } from '../../export/cerfa13703.js';
import { empreinteFaits, faitsDuDossier, texteDesFaits } from '../../export/faitsDossier.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { longueurMax, LIBELLES_PIECES_TEXTE, photoDe, texteDe, type DossierProjet, type PhotoDossier, type PiecePhoto, type PieceTexte, type TexteDossier } from '../../regles/textes/dossier.js';
import { redigerTexte, type ContexteRedaction } from './redactionTexte.js';
import type { PhotoAudit, PhotoChoisie } from './photosDossier.js';
import type { PointRelecture } from '../../export/typesRelecture.js';
import type { ObjetPlan } from '../../model/types.js';

export interface ContexteDossier {
  etat: { objects: ObjetPlan[]; lectureSeule?: boolean };
  pushHistory: (...objets: object[]) => void;
  markDirty: (...objets: object[]) => void;
  /** Previent l'ecran que le dossier a change (magasin.notifier). */
  notifier: () => void;
  toast: (message: string) => void;
  maintenant: () => Date;
  /** Le client de Claude et l'identite du projet ; absent, pas de redaction. */
  redaction?: ContexteRedaction;
  ramenerEnJpeg: (image: string) => Promise<PhotoChoisie>;
  photosDeLAudit: (idu: string | null) => Promise<PhotoAudit[]>;
  /** La relecture du dossier tel qu'il partirait maintenant (export/dossierMairie.ts::relireAvantExport, charge a la demande). */
  relire: (objets: ObjetPlan[]) => Promise<PointRelecture[]>;
}

/** L'etat d'un texte, pour l'ecran. */
export interface EtatTexte {
  piece: PieceTexte;
  texte: TexteDossier | undefined;
  /** Le brouillon a ete redige sur un projet qui a change depuis. */
  perime: boolean;
  /** Le projet a change depuis la validation du texte. */
  valideDate: boolean;
  /** Ce que la zone de texte montre : l'edition en cours, sinon le texte valide, le brouillon, ou la description calculee. */
  edition: string;
  longueurMax: number;
  enCours: boolean;
}

export interface ServiceDossier {
  parcelle(): ObjetPlan | undefined;
  /** La redaction par Claude est-elle joignable (connecte a l'organisation, ou administrateur) ? */
  redactionPossible(): boolean;
  enCours(): boolean;
  etatTexte(piece: PieceTexte): EtatTexte;
  editer(piece: PieceTexte, texte: string): void;
  /** Les faits du projet, tels qu'ils partiraient a Claude (le brouillon se montre a cote d'eux). */
  faits(): string;
  rediger(piece: PieceTexte): Promise<void>;
  valider(piece: PieceTexte): void;
  retirer(piece: PieceTexte): void;
  photo(piece: PiecePhoto): PhotoDossier | undefined;
  /** `valeur` : `DP7:audit:<rang>` (la photo de ce rang parmi celles de l'audit de la parcelle). */
  choisirPhoto(valeur: string): Promise<void>;
  retirerPhoto(piece: PiecePhoto): void;
  photosDeLAudit(): Promise<PhotoAudit[]>;
  relire(): Promise<PointRelecture[]>;
}

const estPiece = (v: string): v is PieceTexte => v === 'description' || v === 'notice' || v === 'insertion';
export const pieceTexte = (v: string | undefined): PieceTexte | null => (v && estPiece(v) ? v : null);
export const piecePhoto = (v: string | undefined): PiecePhoto | null => { const p = (v ?? '').split(':')[0]; return p === 'DP7' || p === 'DP8' ? p : null; };

export function creerServiceDossier(ctx: ContexteDossier): ServiceDossier {
  const editions = new Map<PieceTexte, string>();
  let enCours: PieceTexte | null = null;
  let audit: { idu: string | null; photos: Promise<PhotoAudit[]> } | null = null;
  const parcelle = () => parcelleDuProjet(ctx.etat.objects);
  const idu = () => { const c = parcelle()?.cadastre as { idu?: unknown } | undefined; return typeof c?.idu === 'string' ? c.idu : null; };

  /** Ecrit le dossier de la parcelle, en un pas d'annulation ; un dossier vide disparait (le fichier garde sa forme d'avant). */
  function ecrire(modifier: (d: DossierProjet) => void): boolean {
    const p = parcelle();
    if (!p || ctx.etat.lectureSeule) return false;
    ctx.pushHistory(p);
    const d: DossierProjet = p.dossier ? JSON.parse(JSON.stringify(p.dossier)) as DossierProjet : { textes: [] };
    modifier(d);
    if (d.photos && !d.photos.length) delete d.photos;
    if (!d.textes.length && !d.photos) delete p.dossier; else p.dossier = d;
    ctx.markDirty(p);
    ctx.notifier();
    return true;
  }
  const texteDans = (d: DossierProjet, piece: PieceTexte): TexteDossier => {
    let t = d.textes.find((x) => x.piece === piece);
    if (!t) { t = { piece }; d.textes.push(t); }
    return t;
  };

  const service: ServiceDossier = {
    parcelle,
    redactionPossible: () => !!ctx.redaction?.client(),
    enCours: () => enCours !== null,
    etatTexte(piece) {
      const t = texteDe(parcelle()?.dossier, piece);
      const faits = t ? empreinteFaits(ctx.etat.objects) : '';
      const calculee = () => { const o = ouvragesDeclares(ctx.etat.objects); return o.length ? descriptionCalculee(o, o.reduce((s, x) => s + x.emprise, 0)) : ''; };
      return {
        piece, texte: t, perime: !!t?.brouillon && t.brouillon.entrees !== faits, valideDate: !!t?.valide?.entrees && t.valide.entrees !== faits,
        edition: editions.get(piece) ?? t?.valide?.texte ?? t?.brouillon?.texte ?? (piece === 'description' ? calculee() : ''),
        longueurMax: longueurMax(piece), enCours: enCours === piece,
      };
    },
    // L'edition ne touche pas au projet : l'ecran qui la tape se redessine seul (zones/parcours/TextesDossier.tsx).
    editer(piece, texte) { editions.set(piece, texte); },
    faits: () => texteDesFaits(faitsDuDossier(ctx.etat.objects)),
    async rediger(piece) {
      if (enCours || !ctx.redaction || !parcelle() || ctx.etat.lectureSeule) return;
      enCours = piece;
      ctx.notifier();
      try {
        const r = await redigerTexte(ctx.etat.objects, piece, ctx.redaction);
        if ('erreur' in r) { ctx.toast(r.erreur); return; }
        if (ecrire((d) => { texteDans(d, piece).brouillon = r.brouillon; })) {
          editions.delete(piece);
          ctx.toast('Brouillon « ' + LIBELLES_PIECES_TEXTE[piece].toLowerCase() + ' » rédigé par Claude : relisez-le, corrigez-le, puis validez-le pour qu’il entre dans le dossier.');
        }
      } catch (e) {
        ctx.toast('Rédaction impossible : ' + ((e as Error).message || String(e)));
      } finally {
        enCours = null;
        ctx.notifier();
      }
    },
    valider(piece) {
      const texte = service.etatTexte(piece).edition.trim();
      if (!texte) { ctx.toast('Le texte est vide : écrivez-le, ou faites-le rédiger par Claude, avant de le valider.'); return; }
      if (texte.length > longueurMax(piece)) { ctx.toast('Le texte fait ' + texte.length + ' caractères ; la pièce en tient ' + longueurMax(piece) + ' : raccourcissez-le avant de le valider.'); return; }
      const entrees = empreinteFaits(ctx.etat.objects), le = ctx.maintenant().toISOString().slice(0, 10);
      if (ecrire((d) => { texteDans(d, piece).valide = { texte, le, entrees }; })) editions.delete(piece);
    },
    retirer(piece) {
      if (!texteDe(parcelle()?.dossier, piece)) return;
      if (ecrire((d) => { d.textes = d.textes.filter((t) => t.piece !== piece); })) editions.delete(piece);
    },
    photo: (piece) => photoDe(parcelle()?.dossier, piece),
    async choisirPhoto(valeur) {
      const piece = piecePhoto(valeur);
      if (!piece || !parcelle() || ctx.etat.lectureSeule) return;
      const rang = /^DP[78]:audit:(\d+)$/.exec(valeur)?.[1];
      if (rang === undefined) return;
      try {
        const a = (await service.photosDeLAudit())[Number(rang)];
        if (!a) return;
        const choisie = await ctx.ramenerEnJpeg(a.image);
        const photo: PhotoDossier = { piece, image: choisie.image, source: 'audit', largeur: choisie.largeur, hauteur: choisie.hauteur, choisieLe: ctx.maintenant().toISOString().slice(0, 10) };
        ecrire((d) => { d.photos = [...(d.photos ?? []).filter((p) => p.piece !== piece), photo].sort((a, b) => a.piece.localeCompare(b.piece)); });
      } catch (e) {
        ctx.toast('Photographie ' + piece + ' : ' + ((e as Error).message || String(e)) + '.');
      }
    },
    retirerPhoto(piece) {
      if (!photoDe(parcelle()?.dossier, piece)) return;
      ecrire((d) => { d.photos = (d.photos ?? []).filter((p) => p.piece !== piece); });
    },
    photosDeLAudit() {
      const i = idu();
      if (!audit || audit.idu !== i) audit = { idu: i, photos: ctx.photosDeLAudit(i).catch(() => []) };
      return audit.photos;
    },
    relire: () => ctx.relire(ctx.etat.objects),
  };
  return service;
}
