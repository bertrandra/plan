// Les propositions de Claude (MD/spec-audit.md §13.2, §14 ; lot L17) : ce que le vote de ses trois
// passes (model/analyseClaude.ts) propose de changer dans le projet, dans la meme structure que les
// propositions des mesures (regles/decisions.ts), source `claude`, avec ses indices (quelle image,
// ce qu'il y a vu) et sa confiance (la part des passes d'accord).
//
// Ce qui se propose, parce que le projet sait l'ecrire, vit dans le registre des sujets
// (app/regles/sujets/ : couverture, cheminees, toiture-terrasse, materiau et teinte des murs, forme du toit) ;
// ce module les enchaine, et porte le renfort des facades, les details des ouvertures et les ecarts. Les
// lucarnes s'arbitrent (arbitrages.ts) ; les elements, le profil, le decor restent des observations, montrees
// a part sans rien ecrire (observationsClaude.ts).
//
// Une proposition de Claude arrive decochee tant que son taux d'accord n'est pas mesure a 95 %
// (spec-regles-toits §14.2, point 5), ou quand elle contredit un indice LiDAR (point 4).

import { contradictionsLidar, indicesLidar, reserveConfiance, type FacadeVotee, type Vote, type VoteAnalyse } from '../../../model/analyseClaude.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { EtiquetteImage, RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { DetailsOuverture, ObjetPlan, OuvertureFacade, ReleveFacade, TypeOuverture } from '../../../model/types.js';
import { bilanVide, texteBilan } from '../../../facade/renfortRecalage.js';
import { avecGrille } from '../../../facade/verification.js';
import { SUJETS } from '../../regles/sujets/index.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';
import { indicesDe, pluriel } from '../../regles/sujets/contrat.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import { etiquetteFacade, type LigneBatiment } from './liste.js';

// Ce que ce module garde de la facade publique d'avant le registre des sujets (app/regles/sujets/).
export { couvertureDuVocabulaire } from '../../regles/sujets/couverture.js';
export { materiauDesFacades } from '../../regles/sujets/facades.js';
export { indicesDe } from '../../regles/sujets/contrat.js';

/** Les reponses lues pour un batiment, et les etiquettes des images qu'il a recues. */
export interface ReponsesBatiment {
  reponses: unknown[];
  etiquettes: EtiquetteImage[];
  /** La reponse du modele plus fin qui a departage les passes en desaccord (D20), si l'escalade a eu lieu pour ce batiment. */
  escalade?: unknown;
}

// Les ecarts de Claude (sujet « transverse ») : ils se disent en observation, et l'ecran des propositions les relit ici.
export { ecartsDuVote, ecartsEnClair, type EcartClaude } from '../../regles/sujets/transverse.js';

/** Les propositions de Claude pour un batiment : vote des passes lues, controle croise, puis chaque attribut. */
export function propositionsClaudeDuBatiment(o: ObjetPlan, b: LigneBatiment, r: ReponsesBatiment): Proposition[] {
  const reponses = passesLues(r.reponses);
  if (!reponses.length) return [];
  const v = voterAnalyse(reponses, r.escalade);
  const contra = [...contradictionsLidar(v, indicesLidar(o.toitMesure, o.corpsToit)), ...v.contradictions.map((c) => c.observation + ' (' + c.indiceLidar + ')')];
  // Claude dit lui-meme douter : chacune de ses lignes le dit aussi.
  const doute = reserveConfiance(v.confiance);
  const out: Proposition[] = [];
  for (const s of SUJETS) {
    const p = s.proposer?.({ o, b, v, et: r.etiquettes, contra });
    if (p) out.push(doute ? { ...p, reserve: p.reserve ? p.reserve + ' ' + doute : doute } : p);
  }
  return out;
}

/** Le vote des passes de Claude, par batiment : ce que l'arbitrage des sources lit de lui (arbitrages.ts). */
export function votesDesBatiments(parBatiment: Record<string, ReponsesBatiment>): Record<string, VoteAnalyse> {
  const out: Record<string, VoteAnalyse> = {};
  for (const [cle, r] of Object.entries(parBatiment)) { const reponses = passesLues(r.reponses); if (reponses.length) out[cle] = voterAnalyse(reponses, r.escalade); }
  return out;
}

/** Toutes les propositions de Claude, batiment par batiment, dans l'ordre de la liste de controle. */
export function propositionsDeClaude(objets: readonly ObjetPlan[], batiments: readonly LigneBatiment[], parBatiment: Record<string, ReponsesBatiment>): Proposition[] {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  return batiments.flatMap((b) => {
    const o = parCle.get(b.cle), r = parBatiment[b.cle];
    return o && r ? propositionsClaudeDuBatiment(o, b, r) : [];
  });
}

/** Le taux d'accord de Claude sur le releve des facades n'est pas encore mesure : ses propositions arrivent decochees. */
export const RESERVE_RENFORT = 'Taux d’accord de Claude non encore mesuré sur le relevé des façades : vérifiez ses ouvertures sur la photo.';
/** Les ouvertures que Claude voit sans que les contours de la photo les soutiennent : jamais cochees d'office. */
export const RESERVE_POINTILLE = 'Vue par Claude, non confirmée sur la photo : vérifiez-la avant de la garder.';
/** Quand la ligne du releve renforce existe aussi : dire que celle-ci la contient, pour que cocher les deux ne surprenne pas. */
const AVEC_LE_RENFORT = ' Cochée, cette ligne comprend aussi les ouvertures de la ligne « avec l’aide de Claude ».';

/** Le bilan d'une facade sans les ouvertures en pointille : elles ont leur propre ligne. */
const resumeSansPointille = (rf: RenfortFacadeCapture): string | null => texteBilan({ ...bilanVide(), ...rf.bilan, pointille: 0 });

/** Le releve mesure, avec ces ouvertures a la place des siennes (la grille se recale dessus). */
export function releveAvecOuvertures(mesure0: ReleveFacade, liste: readonly OuvertureFacade[]): ReleveFacade {
  const { ouvertures, grille } = avecGrille([...liste], mesure0.largeur);
  return { ...mesure0, ouvertures, ...(grille ? { grille } : {}) };
}

/** Les ouvertures que Claude ajoute en pointille (graines que les contours ne soutiennent pas assez). */
export const ouverturesPointillees = (rf: RenfortFacadeCapture): OuvertureFacade[] => rf.decochees.filter((o) => o.source === 'claude');

/** Le nom d'un type d'ouverture, au singulier et au pluriel. */
const TYPES_OUVERTURE: Record<TypeOuverture, [string, string]> = {
  fenetre: ['fenêtre', 'fenêtres'], 'porte-fenetre': ['porte-fenêtre', 'portes-fenêtres'], porte: ['porte', 'portes'], garage: ['porte de garage', 'portes de garage'],
};

/** « 1 porte, 2 fenêtres » : les ouvertures par type, en clair. */
export function typesEnClair(ouvertures: readonly Pick<OuvertureFacade, 'type'>[]): string {
  const comptes = new Map<TypeOuverture, number>();
  for (const o of ouvertures) comptes.set(o.type, (comptes.get(o.type) ?? 0) + 1);
  return [...comptes].map(([t, n]) => n + ' ' + TYPES_OUVERTURE[t][n > 1 ? 1 : 0]).join(', ');
}

/**
 * Le renfort de Claude sur les facades (MD/spec-facades-calage-detection.md §12 bis, lot L18) : pour
 * chaque facade ou il a change quelque chose, le releve mesure avec ses ouvertures renforcees (graines
 * recalees sur l'image, retraits, types, details), source `claude`. Il remplacerait le releve des
 * mesures : il arrive decoche, et coche, il l'emporte (meme facade, meme effet, ecrit apres).
 *
 * Les ouvertures que Claude voit mais que la photo ne confirme pas (en pointille) ont leur propre
 * ligne, apres : le releve renforce plus elles, decochee. Elle vient apres et contient tout le
 * releve renforce : cochee seule ou avec la precedente, elle ecrit la meme chose.
 */
export function propositionsRenfort(e: EntreesPropositions, renfort: Record<string, RenfortFacadeCapture>): Proposition[] {
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) for (const f of b.facades) {
    const id = cleMesure(b.cle, f.cote);
    const rf = renfort[id], mesure = e.mesures.get(id), mesure0 = mesure?.releve;
    if (!rf?.resume || !mesure0) continue;
    const n0 = mesure0.ouvertures.length;
    const base = {
      cible: { type: 'facade' as const, cle: b.cle, cote: f.cote }, objet: 'Façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom,
      avant: pluriel(n0, 'ouverture') + ' mesurée' + (n0 > 1 ? 's' : '') + ' sur la photo',
      source: 'claude' as const, indices: [], confiance: rf.passes / 3, remplaceChoix: null,
    };
    const releveAvec = (liste: readonly OuvertureFacade[]): ReleveFacade => releveAvecOuvertures(mesure0, liste);
    const resume = resumeSansPointille(rf);
    // Son nombre d'ouvertures est aussi un constat de l'arbitrage des facades (arbitrages.ts) ; cette ligne garde ce qu'il affine (types, details).
    if (resume) {
      const releve = releveAvec(rf.ouvertures);
      out.push({ ...base, id: id + ':claude:releve', apres: pluriel(releve.ouvertures.length, 'ouverture') + ' avec l’aide de Claude (' + resume + ')', effet: { type: 'releve', releve }, reserve: RESERVE_RENFORT });
    }
    const pointillees = ouverturesPointillees(rf);
    if (pointillees.length) {
      const releve = releveAvec([...rf.ouvertures, ...pointillees]);
      const n = pointillees.length, s = n > 1 ? 's' : '';
      out.push({
        ...base, id: id + ':claude:pointille',
        apres: pluriel(releve.ouvertures.length, 'ouverture') + ', dont ' + typesEnClair(pointillees) + ' en pointillé, vue' + s + ' par Claude, non confirmée' + s + ' sur la photo',
        effet: { type: 'releve', releve }, reserve: RESERVE_POINTILLE + (resume ? AVEC_LE_RENFORT : ''),
      });
    }
  }
  return out;
}

/** Les details de Claude valent pour la majorite des ouvertures d'une facade, pas pour chacune : jamais coches d'office. */
export const RESERVE_DETAILS = 'Taux d’accord de Claude non encore mesuré sur les détails des ouvertures, qui valent pour la majorité des ouvertures de la façade : vérifiez-les sur la photo.';

const VOLETS_CLAUDE: Readonly<Record<string, NonNullable<DetailsOuverture['volets']>>> = { battants: 'battants', roulants: 'roulant', persiennes: 'persiennes', aucun: 'aucun' };
const DIRE_VOLETS: Readonly<Record<NonNullable<DetailsOuverture['volets']>, string>> = { battants: 'volets battants', roulant: 'volets roulants', persiennes: 'persiennes', aucun: 'sans volets' };
/** Les volets et les baies cintrees ne se posent que sur les fenetres et les portes-fenetres : une porte ou un garage n'en ont pas. */
const AVEC_DETAILS: ReadonlySet<TypeOuverture> = new Set(['fenetre', 'porte-fenetre']);

/** Ce que Claude dit des ouvertures d'une facade, dans le vocabulaire des details du releve ; vide quand il ne dit rien d'utilisable. */
export function detailsDeLaFacade(f: FacadeVotee): { details: DetailsOuverture; votes: Vote<string>[] } {
  const details: DetailsOuverture = {};
  const votes: Vote<string>[] = [];
  const volets = VOLETS_CLAUDE[f.volets.valeur];
  // Un coffre au-dessus des baies dit un volet roulant, meme quand les tabliers sont releves.
  if (volets) { details.volets = volets; votes.push(f.volets); } else if (f.coffre.valeur === 'oui' && f.volets.valeur === 'indetermine') { details.volets = 'roulant'; votes.push(f.coffre); }
  if (f.formeOuvertures.valeur === 'cintree') { details.forme = 'cintre'; votes.push(f.formeOuvertures); }
  return { details, votes };
}

/**
 * Les details des ouvertures que Claude voit (volets, coffre, baies cintrees), poses sur le releve mesure d'une facade que le
 * renfort n'a pas touchee (le renfort les donne ouverture par ouverture, et mieux). Seuls les details que la detection n'a pas
 * reconnus sont completes, sur les fenetres et les portes-fenetres. La ligne contient tout le releve mesure : cochee, elle
 * l'emporte sur la ligne de la mesure (meme facade, meme effet, ecrit apres).
 */
export function propositionsDetails(e: EntreesPropositions, parBatiment: Record<string, ReponsesBatiment>): Proposition[] {
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) {
    const r = parBatiment[b.cle];
    const reponses = r ? passesLues(r.reponses) : [];
    if (!r || !reponses.length) continue;
    const v = voterAnalyse(reponses, r.escalade);
    for (const f of b.facades) {
      const id = cleMesure(b.cle, f.cote), mesure0 = e.mesures.get(id)?.releve;
      if (!mesure0?.ouvertures.length || e.renfort?.[id]?.resume) continue;
      const fv = v.facades.find((x) => x.facade === etiquetteFacade(b, f));
      if (!fv) continue;
      const { details, votes } = detailsDeLaFacade(fv);
      if (!votes.length) continue;
      let completees = 0;
      const ouvertures = mesure0.ouvertures.map((o) => {
        if (!AVEC_DETAILS.has(o.type)) return o;
        const ajout = Object.fromEntries(Object.entries(details).filter(([k]) => o.details?.[k as keyof DetailsOuverture] === undefined)) as DetailsOuverture;
        if (!Object.keys(ajout).length) return o;
        completees++;
        return { ...o, details: { ...o.details, ...ajout } };
      });
      if (!completees) continue;
      const dits = [details.volets ? DIRE_VOLETS[details.volets] : null, details.forme === 'cintre' ? 'baies cintrées' : null].filter(Boolean).join(', ');
      out.push({
        id: id + ':claude:details', cible: { type: 'facade', cle: b.cle, cote: f.cote }, objet: 'Façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom,
        avant: pluriel(mesure0.ouvertures.length, 'ouverture') + ' mesurée' + (mesure0.ouvertures.length > 1 ? 's' : '') + ' sur la photo',
        apres: dits + ' sur ' + pluriel(completees, 'ouverture') + ', vu par Claude',
        source: 'claude', indices: indicesDe(votes.flatMap((x) => x.indices), r.etiquettes), confiance: Math.min(...votes.map((x) => x.accord)), remplaceChoix: null,
        effet: { type: 'releve', releve: { ...mesure0, ouvertures } }, reserve: RESERVE_DETAILS,
      });
    }
  }
  return out;
}
