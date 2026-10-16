// Le contrat d'un SUJET de l'audit : une chose que Claude peut voir et que Plan sait proposer au projet
// (la couverture, les cheminees, la toiture-terrasse, le materiau des murs, la forme du toit...).
//
// Un sujet est un module de ce dossier, enregistre dans `index.ts` : c'est le seul endroit a toucher
// cote proposition pour en ajouter un (MD/architecture.md §5.2.4, « Ajouter un sujet »). Il lit ce
// que le vote des passes a rendu (`VoteAnalyse`), compare au batiment, et rend au plus une proposition
// typee (regles/decisions.ts) : l'effet qu'elle ecrit est applique par le moteur, jamais par le sujet.

import { reserveClaude, type AttributClaude, type IndiceAnalyse, type Vote, type VoteAnalyse } from '../../../model/analyseClaude.js';
import type { IndiceProposition, Proposition, TypeEffet } from '../../../regles/decisions.js';
import type { EtiquetteImage } from '../../../model/auditParcelle.js';
import type { ObjetPlan } from '../../../model/types.js';
import type { LigneBatiment } from '../../audit/parcelle/liste.js';

/** Ce qu'un sujet recoit : le batiment, sa ligne de la liste, le vote des passes, les images, les contradictions LiDAR. */
export interface EntreeSujet {
  o: ObjetPlan;
  b: LigneBatiment;
  v: VoteAnalyse;
  et: readonly EtiquetteImage[];
  contra: readonly string[];
}

export interface Sujet {
  /** L'identifiant de sa description (regles/sujets/descriptions/) : le meme, c'est ce qui les apparie. Son nom a l'ecran est celui de la description. */
  id: string;
  /** L'attribut dont le taux d'accord de Claude se mesure (model/analyseClaude.ts, regles/conformite.ts) ; absent : le sujet ne propose rien. */
  attribut?: AttributClaude;
  /** Ce que sa proposition ecrit dans le projet : le type d'effet que le moteur applique (regles/decisions.ts). */
  effet?: TypeEffet;
  /** Au plus une proposition ; null quand Claude ne dit rien, ou rien de neuf, ou rien que Plan sache ecrire. */
  proposer?(e: EntreeSujet): Proposition | null;
}

export const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/** Les indices d'un vote dans la forme des propositions : la phrase, et la photo quand l'image en etait une. */
export function indicesDe(indices: readonly IndiceAnalyse[], etiquettes: readonly EtiquetteImage[]): IndiceProposition[] {
  return indices.map((i) => {
    const e = etiquettes[i.image - 1];
    const ou = e ? (e.photo ? 'photo ' + (e.photo.rang + 1) + (e.photo.cote !== undefined ? ' de la façade' : ' du toit') : e.texte.split(',')[0] ?? '') : 'image ' + i.image;
    return { texte: i.vu + ' (' + ou + ')', ...(e?.photo ? { photo: e.photo } : {}) };
  });
}

export type Base = Pick<Proposition, 'id' | 'cible' | 'objet' | 'avant' | 'apres' | 'effet'>;

/** Une proposition de Claude : source, indices, confiance (la part des passes d'accord) et sa reserve. */
export function deClaude(base: Base, attribut: AttributClaude, vote: Vote<unknown>, etiquettes: readonly EtiquetteImage[], contradictions: readonly string[], remplaceChoix: string | null = null): Proposition {
  return { ...base, source: 'claude', indices: indicesDe(vote.indices, etiquettes), confiance: vote.accord, remplaceChoix, reserve: reserveClaude(attribut, vote, contradictions) };
}
