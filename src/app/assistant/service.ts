// L'assistant en langue naturelle (lot L6 de MD/spec-lecture-ia-elargie.md §3.4, §4.7, §5.5) : la demande, la liste, « Appliquer ».
//
//   1. la demande part avec le catalogue genere a l'instant (app/assistant/catalogue.ts), par l'appel immediat du serveur (usage
//      `assistant`, deploy/analyse.php) : le serveur choisit le prompt, le schema et le modele, journalise le cout et garde la trace ;
//   2. la reponse devient une liste d'etapes (app/assistant/etapes.ts), relue contre le catalogue a chaque fois que l'ecran la montre :
//      une etape que le registre refuse est grisee avec sa raison ;
//   3. « Appliquer » execute les etapes utilisables (app/assistant/appliquer.ts), en une etape d'historique.
//
// Rien ne s'enregistre dans le projet (§4.7) : la demande et la reponse vont au journal et a la trace du serveur, la liste appliquee
// devient une etape d'historique. Ce module ne touche ni au DOM ni au projet : ce qu'il lit et ce qu'il fait lui sont donnes.

import { construireCatalogue, texteCatalogue, texteDemande, type Catalogue, type SourceCatalogue } from './catalogue.js';
import { lireReponse, resoudre, type EtapeProposee, type ReponseAssistant } from './etapes.js';
import { appliquerEtapes, type ContexteApplication, type ResultatApplication } from './appliquer.js';
import type { ClientAnalyse, BlocAnalyse } from '../../io/analyseClaude.js';

/** Une demande ne depasse pas quelques phrases : au-dela, ce n'est plus une demande (et le cout suit la longueur). */
export const DEMANDE_MAX = 1000;

export interface ContexteAssistant {
  /** Le client des routes de Claude ; null hors plateforme et hors admin (l'envoi est alors grise, avec sa raison). */
  client: () => ClientAnalyse | null;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null };
  source: () => SourceCatalogue;
  application: ContexteApplication;
}

export type StatutAssistant = 'saisie' | 'envoi' | 'liste' | 'erreur';

export interface EtatAssistant {
  statut: StatutAssistant;
  demande: string;
  /** La reponse lue (le contrat), gardee pour etre relue contre le catalogue de chaque instant. */
  reponse: ReponseAssistant | null;
  /** La phrase d'un echec (reseau, refus du serveur, reponse illisible, application refusee). */
  erreur: string | null;
  /** Ce que la demande a coute ($), ou null ; `synthetique` : une reponse de simulation (fumee), pas de Claude. */
  cout: number | null;
  synthetique: boolean;
}

/** Les deux blocs de la requete : le catalogue (mis en cache par le serveur), puis la demande. */
export function contenuDemande(cat: Catalogue, demande: string): BlocAnalyse[] {
  return [{ type: 'text', text: texteCatalogue(cat) }, { type: 'text', text: texteDemande(demande) }];
}

export interface ServiceAssistant {
  etat(): EtatAssistant;
  abonner(f: () => void): () => void;
  saisir(demande: string): void;
  /** Peut-on envoyer ? La raison sinon (null : rien a dire, la demande est vide ou part deja). */
  envoiPossible(): { ok: true } | { ok: false; raison: string | null };
  envoyer(): Promise<void>;
  /** La liste, relue contre le catalogue de maintenant. */
  etapes(): EtapeProposee[];
  appliquer(): ResultatApplication;
  /** Une nouvelle demande : la liste et l'erreur s'effacent, la demande reste a corriger. */
  recommencer(): void;
}

const VIDE: EtatAssistant = { statut: 'saisie', demande: '', reponse: null, erreur: null, cout: null, synthetique: false };

export function creerServiceAssistant(ctx: ContexteAssistant): ServiceAssistant {
  let etat: EtatAssistant = VIDE;
  // Ce que chaque bascule devait faire quand la liste est arrivee (vrai : afficher) : si la personne l'a deja basculee entre-temps,
  // l'etape est faite, et Appliquer ne la defait pas.
  let bascules = new Map<number, boolean>();
  const abonnes = new Set<() => void>();
  const poser = (e: Partial<EtatAssistant>) => { etat = { ...etat, ...e }; abonnes.forEach((f) => f()); };
  const catalogue = () => construireCatalogue(ctx.source());

  const service: ServiceAssistant = {
    etat: () => etat,
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
    saisir(demande) { poser({ demande: demande.slice(0, DEMANDE_MAX) }); },
    envoiPossible() {
      if (etat.statut === 'envoi' || !etat.demande.trim()) return { ok: false, raison: null };
      if (!ctx.client()) return { ok: false, raison: 'L’assistant passe par le serveur de Plan : connectez-vous à votre organisation.' };
      return { ok: true };
    },
    async envoyer() {
      const client = ctx.client();
      if (!service.envoiPossible().ok || !client) return;
      const cat = catalogue();
      poser({ statut: 'envoi', reponse: null, erreur: null, cout: null, synthetique: false });
      try {
        const lu = await client.immediat({
          ...ctx.identite(), audit: 'assistant', usage: 'assistant',
          requetes: [{ id: 'assistant', passe: 1, facades: 0, contenu: contenuDemande(cat, etat.demande) }]
        });
        const x = lu.resultats[0];
        if (!x || x.statut !== 'reussi' || !x.sortie) {
          poser({ statut: 'erreur', erreur: 'Claude n’a pas rendu de liste utilisable' + (x?.erreur?.message ? ' (' + x.erreur.message + ')' : '') + '. Reformulez, ou réessayez plus tard.' });
          return;
        }
        const reponse = lireReponse(x.sortie);
        bascules = new Map(resoudre(reponse, cat).flatMap((e, i) => (e.afficher === undefined ? [] : [[i, e.afficher] as [number, boolean]])));
        poser({ statut: 'liste', reponse, cout: typeof x.cout === 'number' ? x.cout : null, synthetique: x.synthetique === true });
      } catch (e) {
        poser({ statut: 'erreur', erreur: (e as Error)?.message || 'La demande n’a pas abouti.' });
      }
    },
    etapes() {
      if (!etat.reponse) return [];
      const cat = catalogue();
      return resoudre(etat.reponse, cat).map((e, i) => {
        const voulu = bascules.get(i);
        // Une bascule deja dans l'etat voulu : rien a faire, et la refaire la defairait.
        return voulu !== undefined && e.afficher !== voulu && !e.refus ? { ...e, refus: 'Déjà fait : ' + (voulu ? 'affichée' : 'masquée') + '.' } : e;
      });
    },
    appliquer() {
      const r = appliquerEtapes(service.etapes(), ctx.application);
      if (r.ok) poser({ ...VIDE });
      else poser({ erreur: r.raison });
      return r;
    },
    recommencer() { bascules = new Map(); poser({ statut: 'saisie', reponse: null, erreur: null, cout: null, synthetique: false }); }
  };
  return service;
}
