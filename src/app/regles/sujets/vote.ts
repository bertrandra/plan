// Le vote des passes tel que l'audit le lit : les champs a la main (model/analyseClaude.ts) et ceux que
// les descriptions de sujets declarent (regles/sujets/vote.ts), calcules une fois depuis le registre.

import { estReponseAnalyse, voter, type ReponseAnalyse, type VoteAnalyse } from '../../../model/analyseClaude.js';
import { DESCRIPTIONS_SUJETS } from '../../../regles/sujets/liste.js';
import { champsSimples } from '../../../regles/sujets/vote.js';

/** Les champs simples des sujets du depot. */
export const CHAMPS_SIMPLES = champsSimples(DESCRIPTIONS_SUJETS);

/** Les passes lues d'un lot de sorties de Claude : celles qui ont la forme du schema. */
export const passesLues = (sorties: readonly unknown[]): ReponseAnalyse[] => sorties.filter((x): x is ReponseAnalyse => estReponseAnalyse(x, CHAMPS_SIMPLES));

/**
 * Trois passes (ou moins) deviennent un seul avis par attribut, champs des sujets compris. `escalade` : la reponse du
 * modele plus fin qui departage les attributs sans unanimite (D20) ; une reponse illisible est ignoree.
 */
export const voterAnalyse = (reponses: readonly ReponseAnalyse[], escalade: unknown = null): VoteAnalyse =>
  voter(reponses, CHAMPS_SIMPLES, passesLues([escalade])[0] ?? null);
