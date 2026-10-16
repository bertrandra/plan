// Les propositions que decide le moteur de reconciliation (MD/spec-reconciliation.md, lot R4) : pour chaque attribut dont
// plusieurs sources parlent, un arbitrage (facade/regles/reconciliation.ts) qui dit la valeur retenue, si la decision est
// automatique ou a prendre, et pourquoi ; et la proposition qui l'ecrit dans le projet, avec tous les constats en dessous.
//
// Aujourd'hui : la hauteur a l'egout (IGN, LiDAR, photo de facade) et la toiture (forme, bouts et sens du faitage : LiDAR,
// silhouette des facades vue par la photo et par Claude, ce que la personne a vu). La toiture est recalculee par le moteur des
// toits sur la mesure LiDAR (`corpsSousContrainte`) avec les valeurs retenues : une decision n'ecrit jamais une forme de sa main.
// Le materiau des murs et la couverture gardent les lignes d'avant (valeur notee sur place contre Claude, D21).

import { arbitrerTout, direValeur, type Arbitrage, type Constat, type Groupe } from '../../../facade/regles/reconciliation.js';
import { RECONCILIATION, type IdAttribut, type ReglesReconciliation } from '../../../regles/reconciliation.js';
import { coherents, corpsSousObservation, dire, direBouts, ecartPrincipal, FORMES_LUES, metres } from '../../regles/sujets/formeToit.js';
import { cibleBatiment, constatsDuBatiment } from './constats.js';
import { hauteurDe, type ArbitrageProposition, type GroupeArbitrage, type Proposition } from '../../../regles/decisions.js';
import { ECART_HAUTEUR_MIN_M, type EntreesPropositions } from './propositions.js';
import type { BoutFait, ObservationFait } from '../../../regles/toits/faits.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import type { FormeToitSimple, ObjetPlan } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';

/** Le vote des passes de Claude, par batiment (cle) ; absent : Claude n'a rien dit de ce batiment. */
export type VotesBatiments = Readonly<Record<string, VoteAnalyse | undefined>>;

const fr = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');
const libelleSource = (r: ReglesReconciliation, s: string): string => r.sources[s as keyof ReglesReconciliation['sources']]?.libelle ?? s;

/** Un arbitrage, tel que la proposition le garde (un fichier d'audit le rejoue sans le moteur). */
export function resumeArbitrage(a: Arbitrage, regles: ReglesReconciliation = RECONCILIATION): ArbitrageProposition {
  const { accord, libelle } = regles.attributs[a.attribut];
  const groupes: GroupeArbitrage[] = a.groupes.map((g: Groupe) => ({
    valeur: direValeur(g.valeur, accord), score: Math.round(g.score * 100) / 100, retenu: g === a.retenu,
    lignes: g.lignes.map((l) => ({ source: l.constat.source, libelle: libelleSource(regles, l.constat.source), valeur: direValeur(l.constat.valeur, accord), confiance: l.constat.confiance === null ? null : Math.round(l.constat.confiance * 100) / 100, score: Math.round(l.score * 100) / 100, ...(l.constat.regle ? { regle: l.constat.regle } : {}) })),
  }));
  return { attribut: a.attribut, libelle, decision: a.decision === 'auto' ? 'auto' : 'manuelle', raison: a.raison, avant: direValeur(a.projet.valeur, accord), groupes, regles: a.regles };
}

/** Les indices des constats du groupe retenu : les photos et les phrases qui ont fait dire cela. */
const indicesDuRetenu = (a: Arbitrage): NonNullable<Constat['indices']>[number][] => (a.retenu?.lignes ?? []).flatMap((l) => [...(l.constat.indices ?? [])]);
const sourcesDuRetenu = (a: Arbitrage, regles: ReglesReconciliation): string => (a.retenu?.sources ?? []).map((s) => libelleSource(regles, s)).join(' et ');

/** La hauteur a l'egout : une proposition quand les sources s'accordent sur autre chose que ce qu'a le projet. */
function propositionHauteur(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  if (!a || a.decision === 'rien' || !a.retenu || typeof a.retenu.valeur !== 'number') return null;
  const actuelle = hauteurDe(o), v = Math.round(a.retenu.valeur * 100) / 100;
  if (Math.abs(v - actuelle) < ECART_HAUTEUR_MIN_M) return null;
  const arbitrage = resumeArbitrage(a, regles);
  return {
    id: b.cle + ':hauteur', cible: { type: 'batiment', cle: b.cle }, objet: 'Hauteur à l’égout de ' + b.nom, source: 'arbitrage',
    avant: fr(actuelle) + ' m', apres: fr(v) + ' m, ' + sourcesDuRetenu(a, regles), indices: indicesDuRetenu(a), confiance: null,
    // Sans attributs IGN, la hauteur a ete saisie a la main : elle n'est pas remplacee en silence.
    remplaceChoix: a.projet.choisi ? 'hauteur saisie, ' + fr(actuelle) + ' m' : null,
    reserve: a.decision === 'manuelle' && !a.projet.choisi ? a.raison : null,
    effet: { type: 'hauteur', hauteurM: v }, arbitrages: [arbitrage],
  };
}

const estBout = (m: string): m is BoutFait => m === 'pignon' || m === 'croupe';

/**
 * La toiture : la forme, les bouts et le sens du faitage retenus, relus par le moteur des toits sur la mesure LiDAR. Pas de
 * proposition quand les trois sont ce que le projet a deja, quand la forme retenue n'est pas une que le moteur produit
 * (Mansart, demi-croupe : le dessin les sait, le calcul pas encore), ou quand la mesure ne la porte pas.
 */
function propositionToit(o: ObjetPlan, b: LigneBatiment, parAttribut: (a: IdAttribut) => Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  if (!o.toitMesure || !('pts' in o) || !o.pts || o.pts.length < 3) return null;
  const arbs = (['formeToit', 'boutsToit', 'sensFaitage'] as const).map(parAttribut).filter((a): a is Arbitrage => !!a?.retenu);
  if (!arbs.some((a) => a.decision !== 'rien')) return null;
  const retenu = (id: IdAttribut) => arbs.find((a) => a.attribut === id)?.retenu?.valeur;
  const f = retenu('formeToit'), bt = retenu('boutsToit'), sens = retenu('sensFaitage');
  let forme: FormeToitSimple | undefined = typeof f === 'string' ? FORMES_LUES[f] : undefined;
  if (typeof f === 'string' && f !== 'indetermine' && !forme) return null;
  const mots = Array.isArray(bt) ? (bt as readonly string[]) : null;
  const bouts = mots && mots.length === 2 && estBout(mots[0] as string) && estBout(mots[1] as string) ? ([mots[0], mots[1]] as [BoutFait, BoutFait]) : undefined;
  if (!coherents(forme, bouts)) forme = undefined;
  const observation: ObservationFait = { ...(forme ? { forme: [forme] } : {}), ...(bouts ? { bouts } : {}), ...(typeof sens === 'number' ? { faitage: { par: 'azimut' as const, azimutDeg: sens } } : {}) };
  if (!Object.keys(observation).length) return null;
  const corps = corpsSousObservation({ ...o, pts: o.pts }, observation);
  if (!corps) return null;
  const involves = arbs.filter((a) => a.decision !== 'rien');
  const manuelles = involves.filter((a) => a.decision === 'manuelle');
  const vus = [forme ? dire(corps, undefined) : null, bouts ? direBouts(bouts) : null, typeof sens === 'number' ? 'faîtage à ' + Math.round(sens) + '°' : null].filter(Boolean).join(', ');
  const sources = [...new Set(involves.flatMap((a) => a.retenu?.sources ?? []))].map((s) => libelleSource(regles, s)).join(', ');
  const ecart = 'Écart à la mesure LiDAR avec cette forme : ' + metres(ecartPrincipal(corps)) + (o.corpsToit?.length ? ' (aujourd’hui ' + metres(ecartPrincipal(o.corpsToit)) + ')' : '');
  return {
    id: b.cle + ':toit', cible: { type: 'batiment', cle: b.cle }, objet: 'Forme du toit de ' + b.nom, source: 'arbitrage',
    avant: dire(o.corpsToit, o.toit?.forme), apres: dire(corps, undefined) + ', relue sur la mesure LiDAR (' + vus + ') d’après ' + sources, confiance: null,
    indices: [...involves.flatMap(indicesDuRetenu), { texte: ecart }],
    remplaceChoix: involves.some((a) => a.projet.choisi) ? 'forme du toit saisie' : null,
    reserve: manuelles.length ? manuelles.map((a) => regles.attributs[a.attribut].libelle + ' : ' + a.raison).join(' ') : null,
    effet: { type: 'corpsToit', corps }, arbitrages: involves.map((a) => resumeArbitrage(a, regles)),
  };
}

/** Tous les arbitrages d'un batiment : un par attribut dont une source au moins parle. */
export function arbitragesDuBatiment(e: EntreesPropositions, o: ObjetPlan, b: LigneBatiment, vote: VoteAnalyse | null, regles: ReglesReconciliation = RECONCILIATION): Arbitrage[] {
  const { constats, projet } = constatsDuBatiment({ o, b, mesures: e.mesures, vu: e.capture.batiments[b.cle]?.vu ?? {}, vote });
  return arbitrerTout(constats, projet, regles);
}

/** Les propositions decidees par l'arbitrage des sources, batiment par batiment (hauteur, puis toiture). */
export function propositionsArbitrees(e: EntreesPropositions, votes: VotesBatiments, regles: ReglesReconciliation = RECONCILIATION): Proposition[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) {
    const o = parCle.get(b.cle);
    if (!o) continue;
    const arbitrages = arbitragesDuBatiment(e, o, b, votes[b.cle] ?? null, regles);
    const cible = cibleBatiment(b.cle);
    const parAttribut = (id: IdAttribut) => arbitrages.find((a) => a.cible === cible && a.attribut === id);
    for (const p of [propositionHauteur(o, b, parAttribut('hauteurEgout'), regles), propositionToit(o, b, parAttribut, regles)]) if (p) out.push(p);
  }
  return out;
}
