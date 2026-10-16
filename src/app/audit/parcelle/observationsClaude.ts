// Ce que Claude a vu sans que le projet sache l'ecrire (MD/spec-audit.md §13.2, §14.2) : la forme du
// toit, les pignons et les croupes aux bouts du faitage, les lucarnes, les elements du toit, les
// ouvertures manquees ou en trop sur chaque facade, les ecarts au modele, et ce que le renfort des
// facades a fait de leurs ouvertures, par type.
//
// Ce ne sont pas des propositions : rien ne s'y coche, rien ne s'ecrit dans le projet. Avant ce
// module, le vote les calculait puis les jetait, et l'ecran annoncait « prêtes » sur une liste vide
// (essai d'AE 101 sur telephone : « il ne trouve rien »). Les lignes se lisent batiment par batiment,
// chacune avec ou Claude l'a vu (l'image citee) et la part des passes d'accord quand un vote la donne.

import type { IndiceAnalyse, ReponseAnalyse, VoteAnalyse } from '../../../model/analyseClaude.js';
import { ouverturesPointillees, typesEnClair, type ReponsesBatiment } from './propositionsClaude.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';
import { observerSujets } from '../../regles/sujets/observations.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import type { EtiquetteImage, RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { ObjetPlan, OuvertureFacade } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';

export interface ObservationClaude {
  id: string;
  /** La phrase, prete a montrer. */
  texte: string;
  /** Ou Claude l'a vu : « photo de la façade sud de Maison », « orthophoto »… sans doublon. */
  ou: string[];
  /** La part des passes d'accord ; null quand la ligne ne vient pas d'un vote (un ecart, le renfort). */
  accord: number | null;
}

export interface ObservationsBatiment { cle: string; nom: string; observations: ObservationClaude[] }

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const accorde = (n: number, mot: string) => mot + (n > 1 ? 's' : '');

// Le libelle d'une forme de toit vit avec le sujet qui la dit (app/regles/sujets/formeToit.ts).
export { libelleForme } from '../../regles/sujets/formeToit.js';

/** Ou Claude a vu un indice : le debut de l'etiquette de l'image (« photo de la façade sud de Maison »). */
export function lieuxDe(indices: readonly IndiceAnalyse[], etiquettes: readonly EtiquetteImage[]): string[] {
  return [...new Set(indices.map((i) => etiquettes[i.image - 1]?.texte.split(',')[0]?.trim() || 'image ' + i.image))];
}

/** Les lignes tirees du vote des passes sur la maison : chaque sujet du registre dit les siennes (app/regles/sujets/observations.ts). */
function observationsDuVote(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, reponses: readonly ReponseAnalyse[], et: readonly EtiquetteImage[]): ObservationClaude[] {
  return observerSujets({ o, v, reponses }).map((l) => ({ id: b.cle + ':obs:' + l.sujet, texte: l.texte, ou: lieuxDe(l.indices, et), accord: l.accord }));
}

const memeBoite = (a: OuvertureFacade, z: OuvertureFacade) => a.x === z.x && a.y === z.y && a.l === z.l && a.h === z.h;

/** Ce que le renfort a fait des ouvertures d'une facade, par type ; null s'il n'a rien change. */
function observationRenfort(b: LigneBatiment, cote: number, orientation: string, rf: RenfortFacadeCapture, mesurees: readonly OuvertureFacade[]): ObservationClaude | null {
  // Une ouverture `claude` a la place exacte d'une mesuree n'a change que de type : elle n'est pas ajoutee.
  const ajoutees = rf.ouvertures.filter((o) => o.source === 'claude' && !mesurees.some((m) => memeBoite(m, o)));
  const pointillees = ouverturesPointillees(rf);
  const n = (k: string) => rf.bilan[k] ?? 0;
  const bouts: string[] = [];
  if (ajoutees.length) bouts.push(typesEnClair(ajoutees) + ' ' + accorde(ajoutees.length, 'ajoutée'));
  if (pointillees.length) bouts.push(typesEnClair(pointillees) + ' en pointillé, ' + accorde(pointillees.length, 'vue') + ' par Claude, non ' + accorde(pointillees.length, 'confirmée') + ' sur la photo');
  if (n('confirmees')) bouts.push(pluriel(n('confirmees'), 'baie') + ' ' + accorde(n('confirmees'), 'devinée') + ' ' + accorde(n('confirmees'), 'confirmée'));
  if (n('retirees')) bouts.push(pluriel(n('retirees'), 'ouverture') + ' ' + accorde(n('retirees'), 'écartée'));
  if (n('typesCorriges')) bouts.push(pluriel(n('typesCorriges'), 'type') + ' ' + accorde(n('typesCorriges'), 'corrigé'));
  if (n('detailsAjoutes')) bouts.push(pluriel(n('detailsAjoutes'), 'détail') + ' ' + accorde(n('detailsAjoutes'), 'ajouté'));
  if (!bouts.length) return null;
  return { id: b.cle + ':obs:renfort:' + cote, texte: 'Façade ' + orientation.toLowerCase() + ', relevé revu par Claude : ' + bouts.join(', '), ou: ['photo de la façade ' + orientation.toLowerCase() + ' de ' + b.nom], accord: null };
}

/** Les observations d'un batiment : le vote de ses passes, puis le renfort de ses facades. */
export function observationsDuBatiment(o: ObjetPlan, b: LigneBatiment, e: EntreesPropositions, r: ReponsesBatiment | undefined, renfort: Record<string, RenfortFacadeCapture>): ObservationClaude[] {
  const reponses = passesLues(r?.reponses ?? []);
  const out = reponses.length ? observationsDuVote(o, b, voterAnalyse(reponses, r?.escalade), reponses, r?.etiquettes ?? []) : [];
  for (const f of b.facades) {
    const id = cleMesure(b.cle, f.cote), rf = renfort[id];
    const x = rf ? observationRenfort(b, f.cote, f.facade.orientation, rf, e.mesures.get(id)?.releve?.ouvertures ?? []) : null;
    if (x) out.push(x);
  }
  return out;
}

/** Toutes les observations de Claude, batiment par batiment, dans l'ordre de la liste de controle. */
export function observationsDeClaude(e: EntreesPropositions, parBatiment: Record<string, ReponsesBatiment>, renfort: Record<string, RenfortFacadeCapture>): ObservationsBatiment[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  return e.liste.batiments.flatMap((b) => {
    const o = parCle.get(b.cle);
    const observations = o ? observationsDuBatiment(o, b, e, parBatiment[b.cle], renfort) : [];
    return observations.length ? [{ cle: b.cle, nom: b.nom, observations }] : [];
  });
}

/** Combien de lignes d'observation en tout : l'ecran les compte avec les propositions. */
export const nombreObservations = (l: readonly ObservationsBatiment[]): number => l.reduce((s, b) => s + b.observations.length, 0);
