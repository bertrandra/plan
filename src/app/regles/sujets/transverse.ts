// Sujet « transverse » : ce qui ne tient a aucun sujet - les ecarts de Claude au modele, et les ouvertures
// manquees ou en trop de chaque facade. Observation seule ; l'ecran des propositions y rattache les images.

import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import { majuscule, pluriel, type EntreeObservation, type LigneObservation, type Sujet } from './contrat.js';

/** Un ecart en clair, et la facade qu'il concerne (null pour un ecart du toit ou du batiment). */
export interface EcartClaude { texte: string; facade: string | null }

/** Les ecarts du vote, chacun avec sa facade : l'ecran des propositions y rattache les images de la facade. */
export function ecartsDuVote(v: VoteAnalyse): EcartClaude[] {
  const out: EcartClaude[] = v.ecarts.map((e) => ({ texte: e.sujet + ' : ' + e.observe + (e.modele ? ' (le modèle dit : ' + e.modele + ')' : ''), facade: null }));
  for (const f of v.facades) {
    const m = f.manquees.valeur, t = f.enTrop.valeur;
    const dire = (texte: string) => out.push({ texte: 'façade ' + f.facade + ' : ' + texte, facade: f.facade });
    if (typeof m === 'number' && m > 0) dire(pluriel(m, 'ouverture') + ' non détectée' + (m > 1 ? 's' : '') + ' par Plan');
    if (typeof t === 'number' && t > 0) dire(pluriel(t, 'ouverture') + ' détectée' + (t > 1 ? 's' : '') + ' en trop');
    f.ecarts.forEach(dire);
  }
  return out;
}

/** Ce que Claude a releve sans que le projet sache l'ecrire : les ecarts, en clair. */
export function ecartsEnClair(v: VoteAnalyse): string[] {
  return ecartsDuVote(v).map((e) => e.texte);
}

/** Les ecarts au modele et les ouvertures manquees ou en trop, rattaches aux images de leur facade. */
function observationsEcarts({ v, reponses }: EntreeObservation): LigneObservation[] {
  return ecartsDuVote(v).map((e, k) => ({
    sujet: 'ecart:' + k,
    texte: majuscule(e.texte),
    indices: e.facade === null ? [] : reponses.flatMap((r) => r.facades.filter((x) => x.facade === e.facade).flatMap((x) => x.indices)),
    accord: null,
  }));
}

export const transverse: Sujet = { id: 'transverse', observer: observationsEcarts };
