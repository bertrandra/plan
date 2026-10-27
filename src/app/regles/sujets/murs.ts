// Sujet « murs » : la teinte des murs que Claude voit sur les photos (attribut couleurMurs : la couleur des
// murs en 3D), et leur decor (colombages, chainages, bandeaux), que le projet ne sait pas dessiner : il se dit
// en observation. Deux champs simples, votes sans code propre (`VoteAnalyse.simples`).
//
// La couleur lue sur les pixels de vos photos (app/audit/parcelle/propositions.ts) est plus juste qu'une
// famille de teinte : quand elle se propose, la ligne de Claude s'efface (validation.ts).

import { TEINTES_MURS, couleurMursRetenue, teinteDe } from '../../../model/couleurMur.js';
import type { Vote } from '../../../model/analyseClaude.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, type EntreeObservation, type EntreeSujet, type LigneObservation, type Sujet } from './contrat.js';

const DECORS: Record<string, string> = { colombages: 'colombages', 'chainages-brique': 'chaînages et encadrements en brique', bandeaux: 'bandeaux entre les niveaux', mixte: 'décors de plusieurs sortes' };

function propositionTeinte({ o, b, v, et }: EntreeSujet): Proposition | null {
  const vote = v.simples.teinteMurs as Vote<string> | undefined;
  const teinte = TEINTES_MURS.find((t) => t.code === vote?.valeur);
  if (!vote || !teinte) return null;
  const retenue = couleurMursRetenue(o);
  // La couleur du projet est deja de cette famille : rien de neuf a proposer.
  if (retenue && teinteDe(retenue.couleur) === teinte.code) return null;
  const source = o.batiment?.couleurMurs?.source;
  return deClaude({
    id: b.cle + ':claude:couleurMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Murs de ' + b.nom,
    avant: retenue ? retenue.couleur + (retenue.source === 'photo' ? ' (photo)' : ' (matériau)') : 'couleur du plan',
    apres: teinte.couleur + ' (' + teinte.libelle + '), teinte vue par Claude',
    effet: { type: 'couleurMurs', couleur: teinte.couleur },
  }, 'couleurMurs', vote, et, [], source === 'materiau' ? 'couleur du matériau' : source === 'plan' ? 'couleur du plan' : null);
}

function observationsMurs({ v }: EntreeObservation): LigneObservation[] {
  const decor = v.simples.decorMurs as Vote<string> | undefined;
  const texte = decor ? DECORS[decor.valeur] : undefined;
  return decor && texte ? [{ sujet: 'decorMurs', texte: 'Décor des murs : ' + texte, indices: decor.indices, accord: decor.accord }] : [];
}

export const murs: Sujet = { id: 'murs', attribut: 'couleurMurs', effet: 'couleurMurs', proposer: propositionTeinte, observer: observationsMurs };
