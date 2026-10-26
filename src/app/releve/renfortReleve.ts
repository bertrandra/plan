// Le bouton « Demander de l'aide » du releve de facade (MD/spec-facades-calage-detection.md §12 bis,
// « Quand », lot L18) : un appel immediat a Claude, propose seulement quand l'algorithme leve un
// signal, a l'etape des coins ou a la verification.
//
// Ce module prepare les deux images (la photo et sa grille de reperes, l'elevation graduee et ses
// ouvertures numerotees) et le texte, envoie les trois passes par la route immediate du serveur
// (io/analyseClaude.ts), et rend le vote. Ce que Plan en fait (recalage des graines sur l'image) est
// pur : facade/detection/renfortRecalage.ts, applique par zones/releve/aide.ts.
//
// Les photos ne partent qu'avec l'accord de la personne (decision D2) : le meme accord par projet que
// l'analyse de l'audit (io/accordAnalyse.ts), donne ici d'un geste, avec la case « partager » cochee
// par defaut (decision D7).

import { EchecAnalyse, type BlocAnalyse, type ClientAnalyse, type MotifAnalyse, type RequeteAnalyse } from '../../io/analyseClaude.js';
import { PASSES_RENFORT, estReponseRenfort, texteRenfort, voterRenfort, type SituationRenfort, type VoteRenfort } from '../../facade/detection/renfort.js';
import { canevasDe, dessinerElevationRenfort, dessinerPhotoRenfort } from '../../render/imagesRenfort.js';
import type { AnalyseDuNavigateur } from '../audit/parcelle/analyseNavigateur.js';
import type { Image, P2 } from '../../facade/vision/homographie.js';
import type { AccordAnalyse } from '../../model/auditParcelle.js';
import type { GrilleFacade, OuvertureFacade } from '../../model/types.js';

export interface ImageRenfort { base64: string; mediaType: 'image/jpeg' | 'image/png' }

/** Qui dessine les deux images : le navigateur (render/imagesRenfort.ts), ou un simulacre dans les tests. */
export interface FabriqueImagesRenfort {
  photo(photo: Image, coins: readonly P2[], coinsTrouves: boolean): ImageRenfort | null;
  /** `cache` : le masque d'occlusion d'une fusion (1 : cache sur toutes les vues), aux dimensions de l'elevation ; hachure sur l'image. */
  elevation(elevation: Image, largeurM: number, hauteurM: number, ouvertures: readonly OuvertureFacade[], cache?: Uint8Array | null): ImageRenfort | null;
}

/** Ce que le releve sait au moment de demander. */
export interface DemandeAide {
  photo: Image;
  coins: readonly P2[];
  coinsTrouves: boolean;
  /** L'elevation redressee, a la verification ; null a l'etape des coins. */
  elevation: Image | null;
  /**
   * Le masque d'occlusion de l'elevation quand elle vient de plusieurs vues (lot G20) : hachure sur
   * l'image 2, ou le prompt (deploy/prompt-renfort.md) dit de ne rien inventer.
   */
  cache?: Uint8Array | null;
  largeurM: number;
  hauteurM: number;
  hauteurMesuree: boolean;
  ouvertures: readonly OuvertureFacade[];
  grille: GrilleFacade | null;
  signaux: readonly SituationRenfort[];
  /** « sud », « nord-est »… */
  etiquette: string;
}

export type ReponseAide = { vote: VoteRenfort } | { erreur: string };

export interface AideClaudeReleve {
  /** Le serveur de l'analyse est-il joignable pour cette personne (plateforme ou administrateur) ? */
  disponible(): boolean;
  /** L'accord d'envoyer les photos est-il donne pour ce projet ? */
  accordDonne(): boolean;
  /** Donne l'accord pour ce projet (le geste de la personne). */
  accorder(): void;
  demander(d: DemandeAide): Promise<ReponseAide>;
}

export interface ContexteAide {
  client: () => ClientAnalyse | null;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null };
  memoire: { lire(): AccordAnalyse | null; ecrire(a: AccordAnalyse | null): void };
  images: FabriqueImagesRenfort;
  maintenant: () => Date;
}

const MESSAGES: Record<MotifAnalyse, string> = {
  reseau: 'Le serveur de l’analyse ne répond pas : réessayez plus tard, ou placez les coins et les ouvertures au doigt.',
  refuse: 'L’aide de Claude n’est pas ouverte à ce compte.',
  plafond: 'Le plafond de l’analyse est atteint pour aujourd’hui ou ce mois-ci.',
  nonConfigure: 'L’aide de Claude n’est pas configurée sur ce serveur.',
  pasPret: 'Claude n’a pas encore répondu.',
  introuvable: 'Le serveur ne retrouve pas cette demande.',
  serveur: 'Le serveur de l’analyse a répondu de travers.',
};

/**
 * Le contenu d'une requete du renfort : la photo et sa grille (image 1), l'elevation graduee
 * (image 2, s'il y en a une), puis le texte. Les trois passes recoivent exactement ce contenu.
 */
export function contenuRenfort(photo: ImageRenfort, elevation: ImageRenfort | null, texte: string): BlocAnalyse[] {
  const bloc = (i: ImageRenfort): BlocAnalyse => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } });
  const out: BlocAnalyse[] = [bloc(photo), { type: 'text', text: 'Image 1 : la photo de la façade, avec la grille de repères (colonnes et lignes de 0 à 10) et le quadrilatère du mur selon Plan.' }];
  if (elevation) out.push(bloc(elevation), { type: 'text', text: 'Image 2 : l’élévation redressée du mur, graduée en mètres, ouvertures détectées par Plan numérotées.' });
  else out.push({ type: 'text', text: 'Pas d’image 2 : les ouvertures n’ont pas encore été cherchées. Situez seulement les coins ; laissez `ouvertures` et `manquees` vides.' });
  out.push({ type: 'text', text: texte });
  return out;
}

/** Les requetes d'une facade, une par passe : `prefixe-p1` a `prefixe-p3` ; la facade compte sur la premiere. */
export function requetesRenfort(prefixe: string, contenu: BlocAnalyse[], facades = 1): RequeteAnalyse[] {
  return Array.from({ length: PASSES_RENFORT }, (_, i) => ({ id: prefixe + '-p' + (i + 1), passe: (i + 1) as 1 | 2 | 3, usage: 'renfort' as const, facades: i === 0 ? facades : 0, contenu }));
}

/** Les reponses lisibles des passes reussies, dans l'ordre des passes. */
export function reponsesRenfort(resultats: readonly { statut: string; passe: number | null; sortie: unknown }[]): ReturnType<typeof voterRenfort> | null {
  const lues = resultats.filter((r) => r.statut === 'reussi' && estReponseRenfort(r.sortie)).sort((a, b) => (a.passe ?? 0) - (b.passe ?? 0));
  return lues.length ? voterRenfort(lues.map((r) => r.sortie as Parameters<typeof voterRenfort>[0][number])) : null;
}

export function creerAideReleve(ctx: ContexteAide): AideClaudeReleve {
  return {
    disponible: () => !!ctx.client(),
    accordDonne: () => !!ctx.memoire.lire(),
    accorder() { ctx.memoire.ecrire({ t: ctx.maintenant().toISOString(), partage: true }); },
    async demander(d) {
      const client = ctx.client();
      if (!client) return { erreur: MESSAGES.refuse };
      const photo = ctx.images.photo(d.photo, d.coins, d.coinsTrouves);
      if (!photo) return { erreur: 'La photo n’a pas pu être préparée pour Claude.' };
      const elevation = d.elevation ? ctx.images.elevation(d.elevation, d.largeurM, d.hauteurM, d.ouvertures, d.cache ?? null) : null;
      const texte = texteRenfort({ largeurM: d.largeurM, hauteurM: d.hauteurM, hauteurMesuree: d.hauteurMesuree, ouvertures: d.ouvertures, grille: d.grille, signaux: d.signaux, coinsTrouves: d.coinsTrouves, etiquette: d.etiquette });
      const audit = ('releve-' + ctx.maintenant().toISOString().replace(/[^0-9]/g, '').slice(0, 14)).slice(0, 64);
      try {
        const lu = await client.immediat({ ...ctx.identite(), audit, usage: 'renfort', requetes: requetesRenfort('aide', contenuRenfort(photo, elevation, texte)) });
        const vote = reponsesRenfort(lu.resultats);
        if (!vote) return { erreur: 'Claude n’a rendu aucune réponse lisible' + (lu.resultats.find((r) => r.erreur)?.erreur?.message ? ' (' + lu.resultats.find((r) => r.erreur)?.erreur?.message + ')' : '') + '.' };
        return { vote };
      } catch (e) {
        return { erreur: e instanceof EchecAnalyse ? MESSAGES[e.motif] : 'La demande n’a pas pu partir : ' + String((e as Error).message || e) };
      }
    },
  };
}

/** Les images du navigateur : les pixels de la photo et de l'elevation poses sur un canevas, puis dessines. */
export function fabriqueImagesRenfortNavigateur(): FabriqueImagesRenfort {
  return {
    photo(img, coins, trouves) {
      const c = canevasDe(img);
      return c ? dessinerPhotoRenfort(c, img.largeur, img.hauteur, coins, trouves) : null;
    },
    elevation(img, largeurM, hauteurM, ouvertures, cache) {
      const c = canevasDe(img);
      const masque = cache && cache.length === img.largeur * img.hauteur ? { masque: cache, largeur: img.largeur, hauteur: img.hauteur } : null;
      return c ? dessinerElevationRenfort({ source: c, largeurPx: img.largeur, hauteurPx: img.hauteur, largeurM, hauteurM, ouvertures, cache: masque }) : null;
    },
  };
}

/** L'aide du releve dans le navigateur : le client, l'identite et l'accord de l'analyse de l'audit. */
export function aideReleveDuNavigateur(a: Pick<AnalyseDuNavigateur, 'client' | 'identite' | 'memoire'>): AideClaudeReleve {
  return creerAideReleve({ client: () => a.client, identite: () => a.identite(), memoire: a.memoire, images: fabriqueImagesRenfortNavigateur(), maintenant: () => new Date() });
}
