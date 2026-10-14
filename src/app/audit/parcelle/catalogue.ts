// Admin › « Audits de parcelle » (MD/spec-audit.md §15) : le catalogue des audits recus sur le
// serveur de Plan (`GET admin/audits`), sauvegardes de capture et partages pour le corpus. Pour
// chacun : l'ouvrir dans le projet ouvert (meme parcelle), le telecharger tel qu'il est arrive, ou le
// retirer du serveur.
//
// L'ecran (zones/parcours/AuditsParcelle.tsx) est un parcours de Z8 et non un ecran plein page comme
// la Conformite : « Ouvrir dans ce projet » demande le projet ouvert dessous. Le retrait se confirme
// dans l'ecran meme, sur la ligne : une question de Z8 s'ouvrirait sous le parcours.

import { nomFichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { ClientAudits, FicheAudit } from '../../../io/auditsServeur.js';

export interface DependancesCatalogue {
  /** Le client des routes `admin/audits` ; null sans session admin. */
  client: () => ClientAudits | null;
  /** La parcelle du projet ouvert (IDU, ou point de calage), null sans parcelle cadastrale. */
  iduProjet: () => string | null;
  /** Pourquoi ce projet ne peut rien recevoir (lecture seule), null s'il peut. */
  refusEcriture: () => string | null;
  /** Reprend le fichier dans la session de cette parcelle, par le chemin de l'import (commande.ts). */
  ouvrir: (texte: string, fiche: FicheAudit) => void;
  telecharger: (nom: string, texte: string) => void;
  signaler: (message: string) => void;
}

export interface EtatCatalogue {
  chargement: boolean;
  audits: FicheAudit[] | null;
  erreur: string | null;
  /** L'audit dont la ligne travaille (lecture, retrait) ; une seule a la fois. */
  enCours: string | null;
  /** L'audit dont le retrait attend sa confirmation. */
  aConfirmer: string | null;
}

export interface CatalogueAudits {
  etat(): EtatCatalogue;
  relire(): Promise<void>;
  /** Pourquoi cet audit ne s'ouvre pas dans ce projet ; null s'il s'y ouvre. */
  raisonOuvrir(a: FicheAudit): string | null;
  ouvrir(a: FicheAudit): Promise<void>;
  telecharger(a: FicheAudit): Promise<void>;
  /** Premiere touche : la ligne demande confirmation ; `confirmer` retire, `garder` renonce. */
  demanderRetrait(a: FicheAudit): void;
  confirmerRetrait(): Promise<void>;
  garder(): void;
  abonner(f: () => void): () => void;
}

const message = (e: unknown) => (e as Error).message || String(e);

export function creerCatalogue(d: DependancesCatalogue): CatalogueAudits {
  const abonnes = new Set<() => void>();
  let etat: EtatCatalogue = { chargement: false, audits: null, erreur: null, enCours: null, aConfirmer: null };
  const poser = (x: Partial<EtatCatalogue>) => { etat = { ...etat, ...x }; abonnes.forEach((f) => f()); };

  async function lire(a: FicheAudit): Promise<string | null> {
    const client = d.client();
    if (!client) { d.signaler('La session admin a expiré : rechargez la page pour retaper le mot de passe.'); return null; }
    poser({ enCours: a.id });
    try { return await client.lire(a.id); } catch (e) { d.signaler(message(e)); return null; } finally { poser({ enCours: null }); }
  }

  const catalogue: CatalogueAudits = {
    etat: () => etat,
    async relire() {
      const client = d.client();
      if (!client) { poser({ erreur: 'La session admin a expiré : rechargez la page pour retaper le mot de passe.' }); return; }
      poser({ chargement: true, erreur: null });
      try { poser({ chargement: false, audits: await client.lister() }); } catch (e) { poser({ chargement: false, erreur: message(e) }); }
    },
    raisonOuvrir(a) {
      const refus = d.refusEcriture();
      if (refus) return refus;
      const idu = d.iduProjet();
      if (!idu) return 'Ce projet n’a pas de parcelle cadastrale : importez d’abord la parcelle depuis son adresse.';
      if (a.idu !== idu) return 'Ce projet est sur la parcelle ' + idu + ' : ouvrez le projet de la parcelle ' + a.idu + '.';
      return null;
    },
    async ouvrir(a) {
      const raison = catalogue.raisonOuvrir(a);
      if (raison) { d.signaler(raison); return; }
      const texte = await lire(a);
      if (texte !== null) d.ouvrir(texte, a);
    },
    async telecharger(a) {
      const texte = await lire(a);
      if (texte === null) return;
      // Le nom du fichier de l'audit (celui du partage du telephone), au jour de sa reception ; le
      // texte part tel qu'il est arrive, sans etre relu : il se rejoue a l'octet pres.
      const recu = new Date(a.recuLe);
      d.telecharger(nomFichierAuditParcelle(Number.isNaN(recu.getTime()) ? new Date() : recu, a.idu), texte);
    },
    demanderRetrait(a) { poser({ aConfirmer: a.id }); },
    garder() { poser({ aConfirmer: null }); },
    async confirmerRetrait() {
      const id = etat.aConfirmer, client = d.client();
      if (!id) return;
      if (!client) { poser({ aConfirmer: null }); d.signaler('La session admin a expiré : rechargez la page pour retaper le mot de passe.'); return; }
      poser({ enCours: id, aConfirmer: null });
      try {
        // L'administrateur retire sans secret : sa session suffit.
        await client.retirer(id, '');
        poser({ audits: (etat.audits ?? []).filter((x) => x.id !== id) });
        d.signaler('Audit retiré du serveur de Plan.');
      } catch (e) {
        d.signaler(message(e));
      } finally {
        poser({ enCours: null });
      }
    },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
  return catalogue;
}
