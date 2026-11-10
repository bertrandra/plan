// Les propositions de Claude (MD/spec-audit.md §13.2, §14 ; lot L17) : ce que le vote de ses trois
// passes (model/analyseClaude.ts) propose de changer dans le projet, dans la meme structure que les
// propositions des mesures (regles/decisions.ts), source `claude`, avec ses indices (quelle image,
// ce qu'il y a vu) et sa confiance (la part des passes d'accord).
//
// Ce qui se propose, parce que le projet sait l'ecrire, vit dans le registre des sujets
// (app/regles/sujets/ : couverture, cheminees, toiture-terrasse, materiau et teinte des murs, forme du toit) ;
// ce module les enchaine, et porte l'accord du run des facades, les details des ouvertures et les ecarts. Les
// lucarnes s'arbitrent (arbitrages.ts) ; les elements, le profil, le decor restent des observations, montrees
// a part sans rien ecrire (observationsClaude.ts).
//
// Une proposition de Claude arrive decochee tant que son taux d'accord n'est pas mesure a 95 %
// (spec-regles-toits §14.2, point 5), ou quand elle contredit un indice LiDAR (point 4).

import { nomFacade } from '../../../geometry/cotesVusDeDehors.js';
import { contradictionsLidar, indicesLidar, reserveConfiance, type VoteAnalyse } from '../../../model/analyseClaude.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { AccordFacadeCapture, EtiquetteImage } from '../../../model/auditParcelle.js';
import type { ObjetPlan, OuvertureFacade, ReleveFacade, TypeOuverture } from '../../../model/types.js';
import { texteAccord, type BilanAccord } from '../../../facade/regles/facades/ia.js';
import { avecGrille } from '../../../facade/detection/verification.js';
import { SUJETS } from '../../regles/sujets/index.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';
import { indicesDe, majuscule, pluriel } from '../../regles/sujets/contrat.js';
import { completerDetails } from '../../../model/ouverturesVues.js';
import { detailsDeLaFacade } from '../../regles/sujets/facades.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import { etiquetteFacade, type LigneBatiment } from './liste.js';

// Ce que ce module garde de la facade publique d'avant le registre des sujets (app/regles/sujets/).
export { couvertureDuVocabulaire } from '../../regles/sujets/couverture.js';
export { detailsDeLaFacade, materiauDesFacades } from '../../regles/sujets/facades.js';
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
  const contra = [...contradictionsLidar(v, indicesLidar(o.batiment?.toitMesure, o.batiment?.corpsToit)), ...v.contradictions.map((c) => c.observation + ' (' + c.indiceLidar + ')')];
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
const RESERVE_ACCORD = 'Taux d’accord de Claude non encore mesuré sur le relevé des façades : vérifiez ses ouvertures sur la photo.';
/** Les ouvertures que Claude voit sans que les contours de la photo les soutiennent : jamais cochees d'office. */
export const RESERVE_POINTILLE = 'Vue par Claude, non confirmée sur la photo : vérifiez-la avant de la garder.';
/** Quand la ligne du releve accorde existe aussi : dire que celle-ci la contient, pour que cocher les deux ne surprenne pas. */
const AVEC_L_ACCORD = ' Cochée, cette ligne comprend aussi les ouvertures de la ligne « avec l’aide de Claude ».';

/** Les compteurs de l'accord d'une facade, tels que le moteur les rend (facade/regles/facades/ia.ts). */
const bilanDe = (rf: AccordFacadeCapture): BilanAccord => ({ boites: 0, retrouvees: 0, devineesConfirmees: 0, seules: 0, ecartees: 0, detailsAjoutes: 0, ...rf.bilan });

/** Le bilan d'une facade sans les boites seules (en pointille) : elles ont leur propre ligne ; null si le reste ne change rien. */
function resumeSansPointille(rf: AccordFacadeCapture): string | null {
  const b = bilanDe(rf);
  return b.devineesConfirmees || b.detailsAjoutes ? texteAccord({ ...b, seules: 0 }) : null;
}

/** Le releve mesure, avec ces ouvertures a la place des siennes (la grille se recale dessus). */
export function releveAvecOuvertures(mesure0: ReleveFacade, liste: readonly OuvertureFacade[]): ReleveFacade {
  const { ouvertures, grille } = avecGrille([...liste], mesure0.largeur);
  return { ...mesure0, ouvertures, ...(grille ? { grille } : {}) };
}

/** Les ouvertures que Claude voit seul, en pointille : ses boites que la detection ne retrouve pas. */
export const ouverturesPointillees = (rf: AccordFacadeCapture): OuvertureFacade[] => rf.decochees.filter((o) => o.source === 'claude');

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

/** « 4 fenêtres, 1 porte ; volets sur 3 » : ce que le releve compte, types et volets lus, en clair. */
export function ouverturesEnClair(ouvertures: readonly Pick<OuvertureFacade, 'type' | 'details'>[]): string {
  const volets = ouvertures.filter((o) => o.details?.volets && o.details.volets !== 'aucun').length;
  return typesEnClair(ouvertures) + (volets ? ' ; volets sur ' + volets : '');
}

/**
 * L'accord du run de chaque facade avec sa detection (MD/spec-facade-calage-audit.md §8, lot F3) : pour chaque facade ou il change
 * quelque chose, le releve mesure avec ses ouvertures accordees (baies devinees confirmees, details ajoutes), source `claude`. Il
 * remplacerait le releve des mesures : il arrive decoche, et coche, il l'emporte (meme facade, meme effet, ecrit apres).
 *
 * Les boites que Claude voit seul (la detection ne les retrouve pas, en pointille) ont leur propre ligne, apres : le releve accorde
 * plus elles, decochee. Elle vient apres et contient tout le releve accorde : cochee seule ou avec la precedente, elle ecrit la meme
 * chose.
 */
export function propositionsAccords(e: EntreesPropositions, accords: Record<string, AccordFacadeCapture>): Proposition[] {
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) for (const f of b.facades) {
    const id = cleMesure(b.cle, f.cote);
    const rf = accords[id], mesure = e.mesures.get(id), mesure0 = mesure?.releve;
    if (!rf?.resume || !mesure0) continue;
    const n0 = mesure0.ouvertures.length;
    const base = {
      cible: { type: 'facade' as const, cle: b.cle, cote: f.cote }, objet: 'Façade ' + nomFacade(f.facade.orientation, f.cote) + ' de ' + b.nom,
      avant: pluriel(n0, 'ouverture') + ' mesurée' + (n0 > 1 ? 's' : '') + ' sur la photo',
      source: 'claude' as const, indices: [], confiance: rf.confiance, remplaceChoix: null,
    };
    const releveAvec = (liste: readonly OuvertureFacade[]): ReleveFacade => releveAvecOuvertures(mesure0, liste);
    const resume = resumeSansPointille(rf);
    // Son nombre d'ouvertures est aussi un constat de l'arbitrage des facades (arbitrages.ts) ; cette ligne garde ce qu'il affine (types, details).
    if (resume) {
      const releve = releveAvec(rf.ouvertures);
      out.push({ ...base, id: id + ':claude:releve', apres: pluriel(releve.ouvertures.length, 'ouverture') + ' avec l’aide de Claude (' + resume + ')', effet: { type: 'releve', releve }, reserve: RESERVE_ACCORD });
    }
    const pointillees = ouverturesPointillees(rf);
    if (pointillees.length) {
      const releve = releveAvec([...rf.ouvertures, ...pointillees]);
      const n = pointillees.length, s = n > 1 ? 's' : '';
      out.push({
        ...base, id: id + ':claude:pointille',
        apres: pluriel(releve.ouvertures.length, 'ouverture') + ', dont ' + typesEnClair(pointillees) + ' en pointillé, vue' + s + ' par Claude, non confirmée' + s + ' sur la photo',
        effet: { type: 'releve', releve }, reserve: RESERVE_POINTILLE + (resume ? AVEC_L_ACCORD : ''),
      });
    }
  }
  return out;
}

/** Les details de Claude valent pour la majorite des ouvertures d'une facade, pas pour chacune : jamais coches d'office. */
export const RESERVE_DETAILS = 'Taux d’accord de Claude non encore mesuré sur les détails des ouvertures, qui valent pour la majorité des ouvertures de la façade : vérifiez-les sur la photo.';

/**
 * Les details des ouvertures que Claude voit sur une facade (volets et leur couleur, coffre, baies cintrees, vitrage, ouvrant,
 * porte d'entree, porte de garage) : une ligne par facade qui a un releve (celui de la mesure, sinon celui du projet). L'effet
 * `detailsOuvertures` les pose a l'ecriture sur le releve tel qu'il est alors (mesure ou accorde, celui qui est coche), sur les
 * ouvertures du type qu'ils concernent et qui ne les ont pas : l'accord du run, qui les donne ouverture par ouverture, l'emporte.
 */
export function propositionsDetails(e: EntreesPropositions, parBatiment: Record<string, ReponsesBatiment>): Proposition[] {
  const out: Proposition[] = [];
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  for (const b of e.liste.batiments) {
    const r = parBatiment[b.cle];
    const reponses = r ? passesLues(r.reponses) : [];
    if (!r || !reponses.length) continue;
    const v = voterAnalyse(reponses, r.escalade);
    for (const f of b.facades) {
      const id = cleMesure(b.cle, f.cote);
      const base = e.mesures.get(id)?.releve ?? parCle.get(b.cle)?.batiment?.facades?.find((x) => x.cote === f.cote) ?? null;
      const fv = v.facades.find((x) => x.facade === etiquetteFacade(b, f));
      if (!base?.ouvertures.length || !fv) continue;
      const { details, votes, textes } = detailsDeLaFacade(fv);
      if (!votes.length) continue;
      const completees = base.ouvertures.filter((o) => completerDetails(o.type, o.details, details)).length;
      if (!completees) continue;
      out.push({
        id: id + ':claude:details', cible: { type: 'facade', cle: b.cle, cote: f.cote }, objet: 'Ouvertures de la façade ' + nomFacade(f.facade.orientation, f.cote) + ' de ' + b.nom,
        avant: pluriel(base.ouvertures.length, 'ouverture') + ' au relevé',
        apres: majuscule(textes.join(', ')) + ', vu par Claude (' + pluriel(completees, 'ouverture') + ' à compléter)',
        source: 'claude', indices: indicesDe(votes.flatMap((x) => x.indices), r.etiquettes), confiance: Math.min(...votes.map((x) => x.accord)), remplaceChoix: null,
        effet: { type: 'detailsOuvertures', cote: f.cote, details }, reserve: RESERVE_DETAILS,
      });
    }
  }
  return out;
}
