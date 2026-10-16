// Ce que Claude a vu sans que le projet sache l'ecrire (MD/spec-audit.md §13.2, §14.2) : la forme du
// toit, les pignons et les croupes aux bouts du faitage, les lucarnes, les elements du toit, les
// ouvertures manquees ou en trop sur chaque facade, les ecarts au modele, et ce que le renfort des
// facades a fait de leurs ouvertures, par type.
//
// Ce ne sont pas des propositions : rien ne s'y coche, rien ne s'ecrit dans le projet. Avant ce
// module, le vote les calculait puis les jetait, et l'ecran annoncait « prêtes » sur une liste vide
// (essai d'AE 101 sur telephone : « il ne trouve rien »). Les lignes se lisent batiment par batiment,
// chacune avec ou Claude l'a vu (l'image citee) et la part des passes d'accord quand un vote la donne.

import type { IndiceAnalyse, ReponseAnalyse, Vote, VoteAnalyse } from '../../../model/analyseClaude.js';
import { AUTRES_FORMES, FORMES_COURANTES } from '../../../model/ceQueJeVois.js';
import { ecartsDuVote, ouverturesPointillees, typesEnClair, type ReponsesBatiment } from './propositionsClaude.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';
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

const IND = 'indetermine';
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const accorde = (n: number, mot: string) => mot + (n > 1 ? 's' : '');
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Les formes du schema que « Ce que je vois » ne nomme pas. */
const AUTRES_FORMES_SCHEMA: Record<string, string> = {
  coyau: 'Coyau', carene: 'Carène', conique: 'Conique', polygonal: 'Polygonal', fleche: 'Flèche', dome: 'Dôme', imperiale: 'Impériale',
};
export function libelleForme(code: string): string {
  return [...FORMES_COURANTES, ...AUTRES_FORMES].find((f) => f.code === code)?.libelle ?? AUTRES_FORMES_SCHEMA[code] ?? code;
}

const BOUTS: Record<string, [string, string]> = { pignon: ['pignon', 'Pignons'], croupe: ['croupe', 'Croupes'], 'demi-croupe': ['demi-croupe', 'Demi-croupes'], brisis: ['brisis', 'Brisis'] };
const LUCARNES: Record<string, string> = { jacobine: 'jacobine', capucine: 'capucine', 'chien-assis': 'chien-assis', rampante: 'rampante', meuniere: 'meunière', 'oeil-de-boeuf': 'œil-de-bœuf', outeau: 'outeau' };
const PANS: Record<string, string> = { rue: 'côté rue', arriere: 'côté jardin', cote: 'sur le côté', plusieurs: 'sur plusieurs pans' };
const ELEMENTS: Record<string, string> = {
  'fenetre-de-toit': 'fenêtre de toit', 'chassis-eclairage': 'châssis d’éclairage', verriere: 'verrière', coyau: 'coyau',
  acrotere: 'acrotère', 'garde-corps': 'garde-corps', lanterneau: 'lanterneau', 'pignon-a-redents': 'pignon à redents',
};
const VOLETS: Record<string, string> = { battants: 'volets battants', roulants: 'volets roulants', persiennes: 'persiennes', mixte: 'volets de plusieurs sortes', aucun: 'sans volets' };
const FORMES_BAIES: Record<string, string> = { cintree: 'baies cintrées', 'oeil-de-boeuf': 'œil-de-bœuf', mixte: 'baies de formes mêlées' };

/** Ou Claude a vu un indice : le debut de l'etiquette de l'image (« photo de la façade sud de Maison »). */
export function lieuxDe(indices: readonly IndiceAnalyse[], etiquettes: readonly EtiquetteImage[]): string[] {
  return [...new Set(indices.map((i) => etiquettes[i.image - 1]?.texte.split(',')[0]?.trim() || 'image ' + i.image))];
}

/** Les lignes tirees du vote des passes sur la maison. */
function observationsDuVote(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, reponses: readonly ReponseAnalyse[], et: readonly EtiquetteImage[]): ObservationClaude[] {
  const out: ObservationClaude[] = [];
  const dire = (sujet: string, texte: string, indices: readonly IndiceAnalyse[], accord: number | null) => out.push({ id: b.cle + ':obs:' + sujet, texte, ou: lieuxDe(indices, et), accord });

  if (v.forme.valeur !== IND) {
    const bouts = [v.profil.valeur === 'brise' ? 'profil brisé' : v.profil.valeur === 'courbe' ? 'profil courbe' : null,
      v.faitage.valeur === 'parallele-rue' ? 'faîtage parallèle à la rue' : v.faitage.valeur === 'perpendiculaire-rue' ? 'faîtage perpendiculaire à la rue' : null].filter(Boolean);
    const modele = o.toit?.forme;
    const compare = !modele ? '' : modele === v.forme.valeur ? ', comme le modèle de Plan' : ' ; le modèle de Plan dit : ' + libelleForme(modele).toLowerCase();
    dire('forme', 'Forme du toit vue : ' + libelleForme(v.forme.valeur).toLowerCase() + (bouts.length ? ', ' + bouts.join(', ') : '') + compare, v.forme.indices, v.forme.accord);
  }

  const g = BOUTS[v.boutGauche.valeur], d = BOUTS[v.boutDroit.valeur];
  if (g || d) {
    const indices = [...(g ? v.boutGauche.indices : []), ...(d ? v.boutDroit.indices : [])];
    const accord = Math.min(...[g ? v.boutGauche.accord : 1, d ? v.boutDroit.accord : 1]);
    const texte = g && d && g === d ? g[1] + ' aux deux bouts du faîtage'
      : 'Bouts du faîtage, vus de la rue : ' + [g ? g[0] + ' à gauche' : null, d ? d[0] + ' à droite' : null].filter(Boolean).join(', ');
    dire(g?.[0] === 'pignon' || d?.[0] === 'pignon' ? 'pignons' : 'bouts', texte, indices, accord);
  }

  const n = v.lucarnes.valeur;
  if (typeof n === 'number' && n > 0) {
    // Les types ne se votent pas : ceux de la premiere passe qui donne le nombre retenu.
    const types = [...new Set(reponses.find((r) => r.lucarnes.nombre === n)?.lucarnes.types ?? [])].map((t) => LUCARNES[t]).filter(Boolean);
    const pan = PANS[v.panLucarnes.valeur];
    dire('lucarnes', pluriel(n, 'lucarne') + ' ' + accorde(n, 'vue') + (types.length ? ' (' + types.join(', ') + ')' : '') + (pan ? ', ' + pan : ''), v.lucarnes.indices, v.lucarnes.accord);
  }

  const elements = v.elements.filter((e) => ELEMENTS[e.valeur]);
  if (elements.length) {
    dire('elements', 'Vu aussi : ' + elements.map((e) => ELEMENTS[e.valeur]).join(', '), elements.flatMap((e) => e.indices), Math.min(...elements.map((e) => e.accord)));
  }

  // Les details des ouvertures de chaque facade : volets, balcon, forme des baies.
  for (const f of v.facades) {
    const vus = [[f.volets, VOLETS], [f.balcon, { oui: 'balcon' }], [f.formeOuvertures, FORMES_BAIES]] as [Vote<string>, Record<string, string>][];
    const retenus = vus.filter(([x, table]) => x.valeur !== IND && table[x.valeur]);
    const indices = reponses.flatMap((r) => r.facades.filter((x) => x.facade === f.facade).flatMap((x) => x.indices));
    if (retenus.length) dire('details:' + f.facade, 'Façade ' + f.facade + ' : ' + retenus.map(([x, table]) => table[x.valeur]).join(', '), indices, Math.min(...retenus.map(([x]) => x.accord)));
  }

  // Les ecarts au modele et les ouvertures manquees ou en trop, rattaches aux images de leur facade.
  ecartsDuVote(v).forEach((e, k) => {
    const indices = e.facade === null ? [] : reponses.flatMap((r) => r.facades.filter((x) => x.facade === e.facade).flatMap((x) => x.indices));
    dire('ecart:' + k, majuscule(e.texte), indices, null);
  });
  return out;
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
  const out = reponses.length ? observationsDuVote(o, b, voterAnalyse(reponses), reponses, r?.etiquettes ?? []) : [];
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
