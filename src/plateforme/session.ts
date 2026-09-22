// La session de la personne, telle que la plateforme la donne (spec-connexion-plateforme §3).
//
// Etape 1 : ce module sait ouvrir, reprendre, renouveler et fermer une session, et appeler une
// operation du contrat avec le bon en-tete. **Aucun ecran n'en depend encore.** La porte, elle,
// est l'etape 2.
//
// ---------------------------------------------------------------------------------------------
// Les quatre regles que ce module fait tenir
// ---------------------------------------------------------------------------------------------
//
// **1. Le jeton ne quitte jamais la memoire.** Ni `localStorage`, ni cookie ecrit par Plan, ni
// URL. Ce qui survit a un rechargement, c'est le cookie de rafraichissement de la plateforme, qui
// appartient a la plateforme et que Plan ne voit jamais.
//
// **2. Un `401` donne droit a un renouvellement et un seul.** Une boucle de renouvellement sur une
// session morte fait un deni de service contre sa propre plateforme. Apres l'echec, la session est
// close et l'appelant est prevenu une fois.
//
// **3. Le renouvellement anticipe de soixante secondes.** `expires_in` est une duree, pas une date :
// on la convertit tout de suite, sinon une page laissee ouverte pendant la marge repart sur un
// jeton perime.
//
// **4. Rien de tout cela ne decide de ce qu'une personne a le droit de faire.** Un jeton valide dit
// qui vous etes, pas ce que vous tenez. Cela, c'est `/me/context`, et c'est le module voisin.

import { OPERATIONS, type IdOperation } from './contrat.js';
import { BACKPROD_PRODUCT_CODE, adresse } from './config.js';

/** Ce que la plateforme rend a l'ouverture d'une session. */
export interface Jeton {
  valeur: string;
  /** Instant d'expiration, en millisecondes epoch. Converti des la reponse (regle 3). */
  expireA: number;
}

/** L'enveloppe d'erreur de la plateforme. Toute defaillance a cette forme, quelle qu'en soit la cause. */
export interface ErreurPlateforme {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string;
  statut: number;
}

export class EchecPlateforme extends Error {
  constructor(readonly erreur: ErreurPlateforme) {
    super(erreur.code + ' : ' + erreur.message);
    this.name = 'EchecPlateforme';
  }
}

/** Ce qu'une session a besoin d'emprunter, pour rester testable sans navigateur ni horloge. */
export interface ContexteSession {
  fetch: typeof fetch;
  maintenant: () => number;
  /** Programme le renouvellement. Rend de quoi l'annuler. */
  planifier: (quand: number, quoi: () => void) => () => void;
  /** Appele une fois quand la session tombe et qu'on ne peut pas la reprendre. */
  surPerte: () => void;
}

/** Marge avant expiration : on renouvelle pendant que le jeton courant vaut encore (regle 3). */
export const MARGE_RENOUVELLEMENT_MS = 60_000;

export interface Session {
  /** Le jeton courant, ou rien. Rendu pour les tests et pour l'en-tete : personne ne le range. */
  jeton(): Jeton | null;
  ouverte(): boolean;
  /** `POST /auth/token`. La plateforme pose son cookie ; Plan garde le jeton en memoire. */
  ouvrir(email: string, motDePasse: string): Promise<void>;
  /** `POST /auth/refresh`. Sans corps : la preuve est le cookie. `false` quand personne n'est connecte. */
  reprendre(): Promise<boolean>;
  /** `POST /auth/sign-out` — `204`, sans corps. Il n'y a pas de « se deconnecter de Plan seulement ». */
  fermer(): Promise<void>;
  /** Appelle une operation du contrat. Un `401` vaut un renouvellement et un seul (regle 2). */
  appeler<T>(id: IdOperation, options?: OptionsAppel): Promise<T>;
}

export interface OptionsAppel {
  /** Les trous `{nom}` du chemin. */
  params?: Record<string, string>;
  /** Le corps JSON, s'il y en a un. */
  corps?: unknown;
  /** La chaine de requete. */
  requete?: Record<string, string | number>;
  /** Le locataire, quand la personne en tient plusieurs. */
  locataire?: string;
}

export function creerSession(ctx: ContexteSession): Session {
  let jeton: Jeton | null = null;
  let annulerRenouvellement: (() => void) | null = null;
  let perteSignalee = false;

  function poser(reponse: { access_token: string; expires_in: number }): void {
    jeton = { valeur: reponse.access_token, expireA: ctx.maintenant() + reponse.expires_in * 1000 };
    perteSignalee = false;
    programmer();
  }

  function oublier(): void {
    jeton = null;
    if (annulerRenouvellement) { annulerRenouvellement(); annulerRenouvellement = null; }
  }

  function perdre(): void {
    oublier();
    if (!perteSignalee) { perteSignalee = true; ctx.surPerte(); }
  }

  function programmer(): void {
    if (annulerRenouvellement) annulerRenouvellement();
    if (!jeton) { annulerRenouvellement = null; return; }
    const dans = Math.max(0, jeton.expireA - ctx.maintenant() - MARGE_RENOUVELLEMENT_MS);
    annulerRenouvellement = ctx.planifier(dans, () => { void reprendre(); });
  }

  /** Lit l'enveloppe d'erreur, ou en fabrique une : une reponse illisible reste une defaillance nommee. */
  async function echec(r: Response): Promise<EchecPlateforme> {
    let corps: unknown = null;
    try { corps = await r.json(); } catch { /* une passerelle peut rendre du HTML */ }
    // `json()` peut aussi resoudre sur `null` ou sur autre chose qu'un objet : le chemin d'erreur
    // est justement celui qu'on ne veut pas voir tomber, puisqu'il ne sert que quand ca va mal.
    const enveloppe = (corps && typeof corps === 'object' ? corps as { error?: unknown } : {}).error;
    const e = (enveloppe && typeof enveloppe === 'object' ? enveloppe : {}) as Partial<ErreurPlateforme> & { request_id?: string };
    return new EchecPlateforme({
      code: e.code || 'REPONSE_ILLISIBLE',
      message: e.message || 'La plateforme a repondu ' + r.status + ' sans enveloppe.',
      details: (e.details as Record<string, unknown>) || {},
      requestId: (e.requestId as string) || (e as { request_id?: string }).request_id || '',
      statut: r.status
    });
  }

  async function ouvrir(email: string, motDePasse: string): Promise<void> {
    const r = await ctx.fetch(adresse(OPERATIONS.signIn.chemin), {
      method: 'POST',
      credentials: 'include',
      // `X-Product` n'est declare par le contrat sur aucune des deux routes d'authentification, mais
      // les deux decrivent un comportement qui en depend : le code produit devient la seconde
      // audience du jeton. On l'envoie donc a la main (spec §14.7).
      headers: { 'Content-Type': 'application/json', 'X-Product': BACKPROD_PRODUCT_CODE },
      body: JSON.stringify({ email, password: motDePasse })
    });
    if (!r.ok) throw await echec(r);
    poser((await r.json()) as { access_token: string; expires_in: number });
  }

  async function reprendre(): Promise<boolean> {
    const r = await ctx.fetch(adresse(OPERATIONS.refreshSession.chemin), {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Product': BACKPROD_PRODUCT_CODE }
    });
    if (r.status === 401) { perdre(); return false; }
    if (!r.ok) throw await echec(r);
    poser((await r.json()) as { access_token: string; expires_in: number });
    return true;
  }

  async function fermer(): Promise<void> {
    try {
      await ctx.fetch(adresse(OPERATIONS.signOut.chemin), {
        method: 'POST', credentials: 'include', headers: { 'X-Product': BACKPROD_PRODUCT_CODE }
      });
    } finally {
      // Meme si la plateforme n'a pas repondu, Plan oublie : garder un jeton qu'on vient de
      // demander a revoquer ne rend service a personne.
      oublier();
    }
  }

  async function envoyer(id: IdOperation, options: OptionsAppel): Promise<Response> {
    const op = OPERATIONS[id];
    const requete = options.requete
      ? '?' + new URLSearchParams(Object.entries(options.requete).map(([k, v]) => [k, String(v)])).toString()
      : '';
    const entetes: Record<string, string> = { 'X-Product': BACKPROD_PRODUCT_CODE };
    if (jeton) entetes['Authorization'] = 'Bearer ' + jeton.valeur;
    if (options.locataire) entetes['X-Tenant'] = options.locataire;
    if (options.corps !== undefined) entetes['Content-Type'] = 'application/json';
    return ctx.fetch(adresse(op.chemin, options.params) + requete, {
      method: op.methode,
      credentials: 'include',
      headers: entetes,
      ...(options.corps !== undefined ? { body: JSON.stringify(options.corps) } : {})
    });
  }

  async function appeler<T>(id: IdOperation, options: OptionsAppel = {}): Promise<T> {
    let r = await envoyer(id, options);
    if (r.status === 401) {
      // Un renouvellement, un reessai, puis on s'arrete (regle 2).
      const repris = await reprendre().catch(() => false);
      if (!repris) { perdre(); throw await echec(r); }
      r = await envoyer(id, options);
      if (r.status === 401) { perdre(); throw await echec(r); }
    }
    if (!r.ok) throw await echec(r);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  return {
    jeton: () => jeton,
    ouverte: () => jeton !== null && jeton.expireA > ctx.maintenant(),
    ouvrir, reprendre, fermer, appeler
  };
}
