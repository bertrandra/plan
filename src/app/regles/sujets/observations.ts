// Les observations de Claude, par le registre : chaque sujet de l'audit, dans l'ordre du prompt, dit ce
// qu'il a vu comme il le sait (`Sujet.observer`) ; un sujet qui n'a pas de module, ou pas d'`observer`,
// mais dont le champ est simple (`{ indices, valeur }`, `{ indices, nombre }`), se dit d'apres sa description.
// Rien de ce qu'il rend n'ecrit dans le projet.

import type { DescriptionSujet } from '../../../regles/sujets/description.js';
import { DESCRIPTIONS_SUJETS } from '../../../regles/sujets/liste.js';
import { champsSimples } from '../../../regles/sujets/vote.js';
import { SUJETS } from './index.js';
import type { EntreeObservation, LigneObservation, Sujet } from './contrat.js';

/** Les lignes d'un sujet que le registre ne sait pas dire : son champ simple, « <Libelle> : <valeur> ». */
function observationGenerique(d: DescriptionSujet, { v }: EntreeObservation): LigneObservation[] {
  return champsSimples([d]).flatMap((c) => {
    const vote = v.simples[c.nom];
    if (!vote || vote.valeur === 'indetermine' || (typeof vote.valeur === 'number' && vote.valeur <= 0)) return [];
    return [{ sujet: c.nom, texte: d.libelle + ' vu : ' + (typeof vote.valeur === 'number' ? vote.valeur : vote.valeur.replace(/-/g, ' ')), indices: vote.indices, accord: vote.accord }];
  });
}

/** Toutes les lignes d'observation du vote d'un batiment, sujet par sujet. */
export function observerSujets(e: EntreeObservation, descriptions: readonly DescriptionSujet[] = DESCRIPTIONS_SUJETS, sujets: readonly Sujet[] = SUJETS): LigneObservation[] {
  return descriptions.flatMap((d) => {
    const s = sujets.find((x) => x.id === d.id);
    return s?.observer ? s.observer(e) : observationGenerique(d, e);
  });
}
