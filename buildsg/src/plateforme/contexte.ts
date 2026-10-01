// Ce que la personne tient, tel que la plateforme le dit (spec-connexion-plateforme §3.4).
//
// Etape 2 : Plan lit `/me/context` une fois par jeton et le garde en memoire jusqu'a
// `token_expires_at`, jamais plus loin et jamais sur le disque. Une adhesion retiree sur la
// plateforme est donc honoree dans l'heure — la duree du jeton, pas une duree que Plan choisit.
//
// ---------------------------------------------------------------------------------------------
// Ce que l'etape 2 a appris en le branchant
// ---------------------------------------------------------------------------------------------
//
// **Il n'existe pas de capacite `plan.access`.** Le §5.4 de `plan-service.md` et le §4.1 de la
// specification en supposaient une ; le catalogue de la plateforme n'en porte pas. Ce qui vaut
// acces, c'est que `/me/context` reponde : un `403 NO_TENANT_ACCESS` ou un `404 PRODUCT_NOT_FOUND`
// dit que ce compte ne tient pas Plan, et un `200` dit qu'il le tient. C'est plus simple et c'est
// la plateforme qui decide, ce qui etait le but.
//
// **Les capacites sont les codes des fonctions acquises, quota ou booleen confondus.** Sur le
// monde de demonstration : `exports`, `max_projects`, `plan.documents`, `users`, `white_label`.
// Plan n'en gate aucune en 2.0.0 ; il en lit les quotas pour les montrer (§7).

import type { Session } from './session.js';
import type { ReponseShowMyContext } from './contrat.js';

export type Contexte = ReponseShowMyContext;

/** Pourquoi la porte reste fermee, quand elle reste fermee. */
export type Fermeture =
  /** Personne n'est connecte : le formulaire. */
  | { raison: 'anonyme' }
  /** Connecte, mais ce compte ne tient Plan sur aucun locataire. */
  | { raison: 'sansPlan'; code: string; message: string; requestId: string }
  /** La plateforme n'a pas repondu comme elle le devrait : on le dit, avec son identifiant. */
  | { raison: 'panne'; code: string; message: string; requestId: string };

export interface ServiceContexte {
  /** Le contexte courant, ou rien. Jamais persiste. */
  courant(): Contexte | null;
  /** Lit `/me/context` si le cache est vide ou perime. */
  charger(): Promise<Contexte>;
  oublier(): void;
  /** La permission est-elle accordee a cette personne ? */
  aPermission(code: string): boolean;
  /** L'organisation a-t-elle achete cette fonction ? */
  aCapacite(code: string): boolean;
  /** Ce qu'il reste d'un quota, ou rien quand la fonction n'en est pas un. */
  quota(feature: string): { limite: number | null; illimite: boolean; utilise: number | null; reste: number | null } | null;
}

export function creerContexte(session: Session, maintenant: () => number = () => Date.now()): ServiceContexte {
  let cache: Contexte | null = null;
  let valideJusqua = 0;

  function memoriser(c: Contexte): void {
    cache = c;
    // `token_expires_at` peut etre nul, « ce qu'un produit traite comme : ne pas mettre en cache ».
    valideJusqua = c.token_expires_at ? Date.parse(c.token_expires_at) : 0;
  }

  return {
    courant: () => (cache && valideJusqua > maintenant() ? cache : null),
    async charger() {
      if (cache && valideJusqua > maintenant()) return cache;
      const c = await session.appeler<Contexte>('showMyContext');
      memoriser(c);
      return c;
    },
    oublier() { cache = null; valideJusqua = 0; },
    aPermission: (code) => !!cache?.permissions.includes(code),
    aCapacite: (code) => !!cache?.capabilities.includes(code),
    quota(feature) {
      const u = cache?.usage.find((x) => x.feature === feature);
      if (!u) return null;
      return { limite: u.limit, illimite: u.unlimited, utilise: u.used, reste: u.remaining };
    }
  };
}

/** Traduit une defaillance de `/me/context` en raison de fermeture, par son code et jamais par son message. */
export function fermetureDe(erreur: { code: string; message: string; requestId: string; statut: number }): Fermeture {
  if (erreur.statut === 401 || erreur.code === 'UNAUTHENTICATED') return { raison: 'anonyme' };
  if (erreur.code === 'NO_TENANT_ACCESS' || erreur.code === 'PRODUCT_NOT_FOUND') {
    return { raison: 'sansPlan', code: erreur.code, message: erreur.message, requestId: erreur.requestId };
  }
  return { raison: 'panne', code: erreur.code, message: erreur.message, requestId: erreur.requestId };
}
