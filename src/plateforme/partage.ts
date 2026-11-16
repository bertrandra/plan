// Partager un projet par un lien en lecture seule (ADR-073 de la plateforme, lot 6 du parcours client).
//
// Trois gestes sur la ressource `projects/{id}/shares` de la plateforme : creer un lien, lister ceux du
// projet, en retirer un. Les chemins et les formes viennent du contrat (contrat.ts) : rien n'est ecrit a
// la main ici, sinon la phrase que l'on dit a la personne quand la plateforme refuse.
//
// **Le lien n'est rendu qu'une fois.** La plateforme ne garde que l'empreinte du jeton ; ce module ne
// le range nulle part (ni stockage, ni journal) : il rend l'adresse a l'ecran qui l'affiche, et c'est
// tout. Un lien perdu se retire et se refait.
//
// **La fonction s'appelle `project_sharing`**, un mot de la plateforme et non de Plan (ADR-052) : c'est
// la plateforme qui decide si un lien peut etre fait, et elle le lit sous ce nom.

import { EchecPlateforme, type Session } from './session.js';
import type { CorpsCreateProjectShare, ProjectShare, ReponseCreateProjectShare, ReponseListProjectShares } from './contrat.js';

/** La fonction que l'offre doit vendre pour qu'un lien se cree (ADR-073 §3). */
export const CAPACITE_PARTAGE = 'project_sharing';

/** Les durees proposees, en jours : la plateforme accepte de 1 a 365 (30 par defaut). */
export const DUREES_PARTAGE = [7, 30, 90, 365] as const;
export const DUREE_PARTAGE_DEFAUT = 30;
/** Les longueurs que le contrat admet : au-dela, la plateforme refuse (`400 VALIDATION_FAILED`). */
export const LONGUEUR_NOM_AFFICHE = 80;
export const LONGUEUR_DESTINATAIRE = 120;

export type LienPartage = ProjectShare;

export interface ServicePartagePlateforme {
  lister(projetId: string): Promise<LienPartage[]>;
  creer(projetId: string, options: { jours: number; nomAffiche?: string; destinataire?: string }): Promise<ReponseCreateProjectShare>;
  retirer(projetId: string, lienId: string): Promise<void>;
}

/** Un texte saisi, ou rien : un champ vide ne part pas (la plateforme lit un blanc comme une absence). */
function saisi(t: string | undefined, max: number): string | undefined {
  const v = (t ?? '').trim();
  return v ? v.slice(0, max) : undefined;
}

export function creerServicePartage(session: Session): ServicePartagePlateforme {
  return {
    async lister(projetId) {
      const r = await session.appeler<ReponseListProjectShares>('listProjectShares', { params: { projectId: projetId } });
      return r.shares;
    },
    async creer(projetId, o) {
      const nom = saisi(o.nomAffiche, LONGUEUR_NOM_AFFICHE);
      const pour = saisi(o.destinataire, LONGUEUR_DESTINATAIRE);
      const corps: CorpsCreateProjectShare = {
        expires_in_days: o.jours,
        ...(nom ? { display_name: nom } : {}),
        ...(pour ? { recipient_label: pour } : {})
      };
      return session.appeler<ReponseCreateProjectShare>('createProjectShare', { params: { projectId: projetId }, corps });
    },
    async retirer(projetId, lienId) {
      await session.appeler<void>('revokeProjectShare', { params: { projectId: projetId, shareId: lienId } });
    }
  };
}

/**
 * Ce qu'il faut dire a la personne quand la plateforme refuse, ou ne repond pas : par le code, jamais par
 * le message (il peut changer sans prevenir). Chaque phrase dit quoi faire, et a qui le demander.
 */
export function phraseRefusPartage(e: unknown): string {
  if (!(e instanceof EchecPlateforme)) {
    return 'La plateforme est injoignable : vérifiez votre connexion, puis réessayez. Rien n’a été créé ni retiré.';
  }
  const { code, details, statut, requestId } = e.erreur;
  const ref = requestId ? ' (référence ' + requestId + ')' : '';
  switch (code) {
    case 'SHARE_LIMIT_REACHED': {
      const limite = typeof details.limit === 'number' ? details.limit : 50;
      return 'Ce projet a déjà ' + limite + ' liens actifs, le plus que la plateforme permet. Retirez-en un dans la liste pour en créer un nouveau.';
    }
    case 'ENTITLEMENT_REQUIRED':
      return 'Le partage par lien n’est pas compris dans votre offre. Une offre qui le comprend se choisit sur la plateforme.';
    case 'SUBSCRIPTION_PAST_DUE':
      return 'Une facture de votre abonnement reste impayée : le partage est suspendu jusqu’à son règlement, sur la plateforme.';
    case 'SUBSCRIPTION_REQUIRED':
      return 'Aucun abonnement à Plan ne couvre votre compte : un collègue qui en a un peut vous y donner une place.';
    case 'PERMISSION_DENIED':
      return 'Votre rôle ne permet pas de modifier ce projet. Un administrateur de votre organisation peut vous donner ce droit.';
    case 'SHARE_HAS_NO_VIEWER':
      return 'La plateforme ne connaît pas encore l’adresse de Plan : le lien ne mènerait nulle part. L’exploitant de la plateforme doit la renseigner' + ref + '.';
    case 'VALIDATION_FAILED': {
      const champ = typeof details.field === 'string' ? details.field : null;
      const attendu = typeof details.requirement === 'string' ? details.requirement : null;
      return 'La plateforme a refusé ' + (champ ? 'le champ « ' + champ + ' »' : 'la demande') + (attendu ? ' (' + attendu + ')' : '') + '. Corrigez-le, puis réessayez.';
    }
    default:
      break;
  }
  if (statut === 404) return 'Ce projet ou ce lien est introuvable sur la plateforme (supprimé, ou plus à votre portée). Rechargez la page.';
  if (statut === 429) return 'Trop de demandes en peu de temps : réessayez dans une minute.';
  if (statut === 401) return 'Votre session est terminée : reconnectez-vous, puis réessayez.';
  return 'La plateforme a répondu par une erreur (' + code + ')' + ref + '. Réessayez dans un moment.';
}
