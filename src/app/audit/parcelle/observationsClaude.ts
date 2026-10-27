// Ce que Claude a vu sans que le projet sache l'ecrire (MD/spec-audit.md §13.2, §14.2) : la forme du
// toit, les pignons et les croupes aux bouts du faitage, les lucarnes, les elements du toit, les
// ouvertures manquees ou en trop sur chaque facade, les ecarts au modele, et ce que le renfort des
// facades a fait de leurs ouvertures, par type.
//
// Ce ne sont pas des propositions : rien ne s'y coche, rien ne s'ecrit dans le projet. Avant ce
// module, le vote les calculait puis les jetait, et l'ecran annoncait « prêtes » sur une liste vide
// (essai d'AE 101 sur telephone : « il ne trouve rien »). Les lignes se lisent batiment par batiment,
// chacune avec ou Claude l'a vu (l'image citee) et la part des passes d'accord quand un vote la donne.

import { nomFacade } from '../../../facade/geometrie.js';
import type { IndiceAnalyse, ReponseAnalyse, VoteAnalyse } from '../../../model/analyseClaude.js';
import { ouverturesPointillees, typesEnClair, type ReponsesBatiment } from './propositionsClaude.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';
import { observerSujets } from '../../regles/sujets/observations.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import type { EtiquetteImage, RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { ObjetPlan, OuvertureFacade } from '../../../model/types.js';
import { etiquetteFacade, type LigneBatiment } from './liste.js';
import { formeDesCorps } from '../../../model/formeToit.js';
import { observationDesSilhouettes } from '../../../facade/regles/toits/silhouettes.js';
import { libelleSilhouette } from '../../../model/silhouetteFacade.js';
import { direBouts, murs } from '../../regles/sujets/formeToit.js';
import type { BoutsVus, CeQueJeVois, FormeVue } from '../../../model/ceQueJeVois.js';

export interface ObservationClaude {
  id: string;
  /** La phrase, prete a montrer. */
  texte: string;
  /** Ou Claude l'a vu : « photo de la façade sud de Maison », « orthophoto »… sans doublon. */
  ou: string[];
  /** La part des passes d'accord ; null quand la ligne ne vient pas d'un vote (un ecart, le renfort). */
  accord: number | null;
  /**
   * Ce que « Je confirme » note dans « Ce que je vois » (la capture, pas le projet) : l'observation de Claude devient celle de la personne,
   * qui l'emporte sur lui dans l'arbitrage et que le moteur des toits relit ensuite sur la mesure. Absent : rien a confirmer ici.
   */
  confirmer?: Partial<CeQueJeVois>;
  /** Pourquoi la confirmation ne redessinera pas le toit, quand on le sait d'avance (pas de mesure LiDAR). */
  raison?: string;
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
  const lignes = observerSujets({ o, v, reponses }).map((l): ObservationClaude => ({ id: b.cle + ':obs:' + l.sujet, texte: l.texte, ou: lieuxDe(l.indices, et), accord: l.accord, ...(confirmationDuVote(l.sujet, v) ? { confirmer: confirmationDuVote(l.sujet, v) as Partial<CeQueJeVois> } : {}) }));
  const sil = observationSilhouettes(o, b, v, et);
  const out = [...lignes, ...(sil ? [sil] : [])];
  // Sans mesure LiDAR, la confirmation est gardee avec l'audit mais le toit ne se redessine pas : le dire avant, pas apres.
  return o.batiment?.toitMesure ? out : out.map((l) => (l.confirmer ? { ...l, raison: 'Ce toit n’a pas de mesure LiDAR : confirmer garde votre observation avec l’audit, mais le toit ne se redessine pas.' } : l));
}

const FORMES_CONFIRMABLES: ReadonlySet<string> = new Set<FormeVue>(['plat', 'appentis', 'deux-pans', 'croupes', 'pavillon', 'demi-croupe', 'mansart']);
const boutsVus = (g: string, d: string): BoutsVus | null => (g === 'pignon' && d === 'pignon' ? 'pignons' : g === 'croupe' && d === 'croupe' ? 'croupes' : (g === 'pignon' && d === 'croupe') || (g === 'croupe' && d === 'pignon') ? 'pignon-croupe' : null);

/** Ce que confirmer une ligne du vote note dans « Ce que je vois » : la forme, ou les bouts, que Claude a dits. */
function confirmationDuVote(sujet: string, v: VoteAnalyse): Partial<CeQueJeVois> | null {
  if (sujet === 'forme') return FORMES_CONFIRMABLES.has(v.forme.valeur) ? { forme: v.forme.valeur as FormeVue } : null;
  if (sujet === 'pignons' || sujet === 'bouts') { const x = boutsVus(v.boutGauche.valeur, v.boutDroit.valeur); return x ? { bouts: x } : null; }
  return null;
}

/**
 * Ce que disent de la toiture les silhouettes que Claude a lues au-dessus de l'egout de chaque facade (pignon, trapeze, rampe…),
 * dans le vocabulaire du moteur : les bouts et le sens du faitage. La meme lecture que l'arbitrage, rendue visible : sans elle, des
 * pignons vus sur six murs ne laissaient aucune ligne, et rien a confirmer. Une contradiction entre murs se dit et ne se confirme pas.
 */
function observationSilhouettes(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[]): ObservationClaude | null {
  const parMur = new Map(v.facades.map((f) => [f.facade, f]));
  const plat = !!o.batiment?.corpsToit?.length && formeDesCorps(o.batiment?.corpsToit) === 'plat';
  const lus = observationDesSilhouettes(murs(b, (f) => { const m = parMur.get(etiquetteFacade(b, f)); return { silhouette: m?.silhouette.valeur ?? 'indetermine', bout: m?.bout.valeur ?? 'indetermine' }; }), plat);
  if (!lus?.vus.length) return null;
  const { bouts, faitage, forme } = lus.observation;
  const dit = lus.vus.map((x) => x.nom + ' : ' + libelleSilhouette(x.silhouette) + ' → ' + x.dit).join(' ; ');
  const conclusion = [bouts ? direBouts(bouts) : null, faitage?.par === 'azimut' ? 'faîtage à ' + Math.round(faitage.azimutDeg) + '°' : null, forme?.[0] ? 'toit à un pan' : null].filter(Boolean).join(', ');
  const confirmable = !lus.conflits.length;
  const vubouts = bouts ? boutsVus(bouts[0], bouts[1]) : null;
  const vuForme: FormeVue | null = forme?.[0] === 'appentis' ? 'appentis' : bouts ? (bouts[0] === 'pignon' && bouts[1] === 'pignon' ? 'deux-pans' : bouts.includes('croupe') ? 'croupes' : null) : null;
  const confirmer: Partial<CeQueJeVois> = { ...(vubouts ? { bouts: vubouts } : {}), ...(vuForme ? { forme: vuForme } : {}) };
  const facades = v.facades.filter((f) => f.silhouette.valeur !== 'indetermine' || f.bout.valeur !== 'indetermine');
  const indices = facades.flatMap((f) => [...f.silhouette.indices, ...f.bout.indices]);
  return {
    id: b.cle + ':obs:silhouettes',
    texte: 'Toit lu sur les silhouettes des façades' + (conclusion ? ' (' + conclusion + ')' : '') + ' — ' + dit + (lus.conflits.length ? ' — contradiction : ' + lus.conflits.join(' ; ') : ''),
    ou: lieuxDe(indices, et), accord: facades.length ? Math.min(...facades.map((f) => Math.min(f.silhouette.accord, f.bout.accord))) : null,
    ...(confirmable && Object.keys(confirmer).length ? { confirmer } : {}),
  };
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
  return { id: b.cle + ':obs:renfort:' + cote, texte: 'Façade ' + nomFacade(orientation, cote) + ', relevé revu par Claude : ' + bouts.join(', '), ou: ['photo de la façade ' + nomFacade(orientation, cote) + ' de ' + b.nom], accord: null };
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

/** Le type d'objet d'une observation, d'apres son sujet (`cle:obs:sujet`) : les memes niveaux que l'arbre des propositions. */
export type TypeObservation = 'facades' | 'toit' | 'murs' | 'autres';
export function typeObservation(id: string): TypeObservation {
  const sujet = id.split(':obs:')[1] ?? '';
  if (/^(silhouettes|renfort|elements|ouvertures|facade)/i.test(sujet)) return 'facades';
  if (/^(forme|bouts|faitage|lucarne|cheminee|couverture|terrasse|appentis|toit|hauteurToit)/i.test(sujet)) return 'toit';
  if (/^(decor|mur|couleur|materiau|hauteur)/i.test(sujet)) return 'murs';
  return 'autres';
}
