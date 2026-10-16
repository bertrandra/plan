// Le partage de l'audit de la parcelle pour le corpus (MD/spec-audit.md §15, decision D7) : la case
// « Partager cet audit pour améliorer Plan », cochee par defaut (decision de l'utilisateur du
// 13 octobre), et revocable.
//
// - Rien ne part avant « Valider » : c'est la validation qui dit ce qui a ete accepte et refuse, ce
//   que le corpus apprend. Puis a chaque validation, le fichier repart et remplace le precedent.
// - Decocher retire du serveur le fichier deja parti (le secret de retrait est garde avec la
//   capture, sur l'appareil) ; un retrait qui echoue laisse la case cochee, pour reessayer.
// - Sans session admin ni jeton de la plateforme, ou sans reseau, rien ne part : la case n'est pas
//   montree, et la capture garde l'accord pour une validation suivante.

import { partageDe, type PartageCorpus } from '../../../model/auditParcelle.js';
import type { ClientAudits } from '../../../io/auditsServeur.js';
import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { CaptureEnCours } from './capture.js';

export interface DependancesCorpus {
  capture: CaptureEnCours;
  /** Le client des routes `admin/audits`, ou null quand personne ne peut envoyer (hors plateforme, hors admin). */
  client: () => ClientAudits | null;
  fichier: () => Promise<FichierAuditParcelle>;
  signaler: (message: string) => void;
  maintenant: () => Date;
  /**
   * La case decochee : ce qui doit suivre l'accord retire (la sauvegarde d'un utilisateur part avec
   * son accord, sauvegarde.ts ; elle est retiree avec lui).
   */
  apresRevocation?: () => void;
}

export interface EtatPartage extends PartageCorpus {
  /** La case se montre : quelqu'un peut envoyer. */
  disponible: boolean;
  /** Un envoi ou un retrait en cours. */
  enCours: boolean;
}

export interface Corpus {
  etat(): EtatPartage;
  basculer(): void;
  /** Apres une validation : envoie le fichier si la case est cochee. */
  envoyer(): Promise<void>;
  abonner(f: () => void): () => void;
}

const jour = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR'); };

/**
 * La phrase sous la case : ce qui partira, ou ce qui est parti. `sauvegarde` : la sauvegarde de
 * l'audit reste sur le serveur quoi qu'il arrive a la case (celle de l'administrateur) ; la phrase
 * ne doit pas promettre alors que rien ne quitte l'appareil.
 */
export function texteDuPartage(e: EtatPartage, sauvegarde = false): string {
  if (e.enCours) return e.accord ? 'Envoi de l’audit au serveur de Plan…' : 'Retrait de l’audit du serveur de Plan…';
  if (e.accord && e.envoi) return 'Partagé le ' + jour(e.envoi.t) + ', photos comprises. Décochez pour le retirer du serveur de Plan.';
  if (sauvegarde) return e.accord
    ? 'À la validation, le fichier de l’audit, photos comprises, est aussi partagé pour améliorer Plan. La sauvegarde de l’audit reste sur le serveur de Plan, pour le reprendre.'
    : 'Rien n’est partagé pour améliorer Plan. La sauvegarde de l’audit reste sur le serveur de Plan, pour le reprendre.';
  if (e.accord) return 'À la validation, le fichier de l’audit, photos comprises, part sur le serveur de Plan. Décochez pour que rien ne quitte cet appareil.';
  return 'Rien ne quitte cet appareil.';
}

export function creerCorpus(d: DependancesCorpus): Corpus {
  const abonnes = new Set<() => void>();
  const publier = () => abonnes.forEach((f) => f());
  let enCours = false;
  const lire = () => partageDe(d.capture.lire());
  const noter = (p: PartageCorpus) => d.capture.noterPartage(p);

  async function retirer(client: ClientAudits, envoi: NonNullable<PartageCorpus['envoi']>): Promise<boolean> {
    try { await client.retirer(envoi.id, envoi.retrait); return true; } catch { return false; }
  }

  async function envoyer(): Promise<void> {
    const client = d.client();
    if (!client || enCours || !lire().accord || !(d.capture.lire().decisions ?? []).length) return;
    enCours = true;
    publier();
    try {
      const precedent = lire().envoi;
      const recu = await client.envoyer(await d.fichier());
      const envoi = { id: recu.id, retrait: recu.retrait, t: d.maintenant().toISOString() };
      // Le fichier precedent est remplace : le corpus ne garde que le dernier etat de l'audit.
      // La case ne se touche pas pendant l'envoi (`basculer` attend) : l'accord est toujours la.
      if (precedent) await retirer(client, precedent);
      noter({ accord: true, envoi });
      d.signaler('Audit partagé pour améliorer Plan : merci.');
    } catch (e) {
      d.signaler('Le partage de l’audit n’a pas abouti (' + ((e as Error).message || String(e)) + ') : il repartira à la prochaine validation.');
    } finally {
      enCours = false;
      publier();
    }
  }

  async function revoquer(): Promise<void> {
    const client = d.client(), envoi = lire().envoi;
    noter({ accord: false, envoi });
    d.apresRevocation?.();
    if (!envoi || !client) return;
    enCours = true;
    publier();
    const ok = await retirer(client, envoi);
    enCours = false;
    if (ok) { noter({ accord: false, envoi: null }); d.signaler('Audit retiré du serveur de Plan.'); }
    else { noter({ accord: true, envoi }); d.signaler('Le retrait de l’audit n’a pas abouti : la case reste cochée, réessayez plus tard.'); }
    publier();
  }

  return {
    etat: () => ({ ...lire(), disponible: d.client() !== null, enCours }),
    basculer() {
      if (enCours) return;
      if (lire().accord) { void revoquer(); return; }
      noter({ accord: true, envoi: lire().envoi });
      // Recochee apres une validation : l'audit part tout de suite, sans attendre la suivante.
      void envoyer();
    },
    envoyer,
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}
