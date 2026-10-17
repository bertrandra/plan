// Les propositions que decide le moteur de reconciliation (MD/spec-reconciliation.md, lot R4) : pour chaque attribut dont
// plusieurs sources parlent, un arbitrage (facade/regles/reconciliation.ts) qui dit la valeur retenue, si la decision est
// automatique ou a prendre, et pourquoi ; et la proposition qui l'ecrit dans le projet, avec tous les constats en dessous.
//
// Aujourd'hui : la hauteur a l'egout (IGN, LiDAR, photo de facade), la hauteur totale d'un batiment sans corps (IGN, LiDAR) et la toiture (forme, bouts et sens du faitage : LiDAR,
// silhouette des facades vue par la photo et par Claude, ce que la personne a vu). La toiture est recalculee par le moteur des
// toits sur la mesure LiDAR (`corpsSousContrainte`) avec les valeurs retenues : une decision n'ecrit jamais une forme de sa main.
// Le materiau des murs et la couverture (fichiers fonciers, Claude, ce que la personne a vu) s'arbitrent de la meme facon : la valeur
// notee sur place l'emporte (poids 30, D21), et une valeur que la personne a choisie dans le projet n'est jamais remplacee en silence.

import { arbitrer, arbitrerTout, direValeur, type Arbitrage, type ChoixArbitrage, type Constat, type Groupe } from '../../../facade/regles/reconciliation.js';
import { RECONCILIATION, type IdAttribut, type ReglesReconciliation } from '../../../regles/reconciliation.js';
import { lireForme } from '../../../facade/lectureFormes.js';
import { coherents, corpsSousObservation, dire, direBouts, ecartPrincipal, FORMES_LUES, libelleForme, metres } from '../../regles/sujets/formeToit.js';
import { cibleBatiment, constatsDuBatiment } from './constats.js';
import { DESCRIPTION_REGLAGES_TOITS, type NomReglageToit } from '../../../regles/toits/reglages.js';
import { DESCRIPTION_SEUILS_FORMES, type NomSeuilForme } from '../../../regles/toits/formes.js';
import { hauteurDe, type ArbitrageProposition, type GroupeArbitrage, type Proposition } from '../../../regles/decisions.js';
import { corpsDesCheminees, ECART_HAUTEUR_MIN_M, souchesSurLeCorps, type EntreesPropositions } from './propositions.js';
import type { BoutFait, ObservationFait } from '../../../regles/toits/faits.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import { libelleSilhouette, type SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { COUVERTURES_VUES, MATERIAUX_MURS_VUS, libelleDe as libelleDeListe, type SoucheVue } from '../../../model/ceQueJeVois.js';
import { pluriel } from '../../regles/sujets/contrat.js';
import { materiauMurs, textureDesMurs } from '../../../model/couleurMur.js';
import type { CouvertureChoisie, FormeToitSimple, ObjetPlan } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';

/** Le vote des passes de Claude, par batiment (cle) ; absent : Claude n'a rien dit de ce batiment. */
export type VotesBatiments = Readonly<Record<string, VoteAnalyse | undefined>>;

const fr = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');
const libelleSource = (r: ReglesReconciliation, s: string): string => r.sources[s as keyof ReglesReconciliation['sources']]?.libelle ?? s;

/**
 * Une regle dite avec sa valeur quand c'est un seuil : `RETRAIT_EGOUT_M = 0,5 m` (regles/toits/reglages.json), `SCORE_AUTO_MIN = 3`
 * (regles/reconciliation.json). Les regles LiDAR font ainsi surface sur la ligne, avec le nombre qui a decide.
 */
export function direRegle(nom: string, regles: ReglesReconciliation = RECONCILIATION): string {
  const toit = (DESCRIPTION_REGLAGES_TOITS[nom as NomReglageToit] ?? DESCRIPTION_SEUILS_FORMES[nom as NomSeuilForme]) as { valeur: number; unite: string } | undefined;
  if (toit) return nom + ' = ' + fr(toit.valeur) + (toit.unite ? ' ' + toit.unite : '');
  const arbitrage = regles.seuils[nom as keyof ReglesReconciliation['seuils']];
  if (arbitrage !== undefined) return nom + ' = ' + fr(arbitrage);
  return nom;
}

/** Les mots d'un attribut, en clair : la forme du toit et la silhouette ont leur libelle, le reste se dit tel quel. */
const libelleDe = (attribut: string): ((mot: string) => string) | undefined =>
  attribut === 'formeToit' ? libelleForme : attribut === 'silhouetteFacade' ? (m) => libelleSilhouette(m as SilhouetteFacade)
    : attribut === 'materiauMurs' ? (m) => libelleDeListe(MATERIAUX_MURS_VUS, m as (typeof MATERIAUX_MURS_VUS)[number]['code'])
    : attribut === 'couverture' ? (m) => libelleDeListe(COUVERTURES_VUES, m as (typeof COUVERTURES_VUES)[number]['code']) : undefined;

/** Un arbitrage, tel que la proposition le garde (un fichier d'audit le rejoue sans le moteur). */
export function resumeArbitrage(a: Arbitrage, regles: ReglesReconciliation = RECONCILIATION): ArbitrageProposition {
  const desc = regles.attributs[a.attribut];
  const { accord, libelle } = desc;
  const mot = libelleDe(a.attribut);
  const groupes: GroupeArbitrage[] = a.groupes.map((g: Groupe) => ({
    valeur: direValeur(g.valeur, accord, mot), score: Math.round(g.score * 100) / 100, retenu: g === a.retenu,
    lignes: g.lignes.map((l) => ({ source: l.constat.source, libelle: libelleSource(regles, l.constat.source), valeur: direValeur(l.constat.valeur, accord, mot), confiance: l.constat.confiance === null ? null : Math.round(l.constat.confiance * 100) / 100, score: Math.round(l.score * 100) / 100, ...(l.constat.regle ? { regle: direRegle(l.constat.regle, regles) } : {}) })),
  }));
  const decision = a.decision;
  return {
    cible: a.cible, attribut: a.attribut, libelle, decision, accord: accord.type, ...('unite' in accord && accord.unite ? { unite: accord.unite } : {}),
    ...(desc.valeurs ? { options: desc.valeurs.map((v) => ({ valeur: JSON.stringify(v), libelle: direValeur(v, accord, mot) })) } : {}),
    ...(a.decision === 'forcee' && a.retenu ? { forcee: direValeur(a.retenu.valeur, accord, mot) } : {}),
    raison: a.raison, avant: direValeur(a.projet.valeur, accord, mot), groupes, regles: a.regles.map((r) => direRegle(r, regles)),
  };
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

/** Ce qui dit d'ou vient la valeur retenue : ce que la personne a vu, ou les sources qui s'accordent. */
const dOu = (a: Arbitrage, regles: ReglesReconciliation, feminin = false): string => {
  const sources = a.retenu?.sources ?? [];
  return sources.length === 1 && sources[0] === 'terrain' ? (feminin ? 'vue sur place' : 'vu sur place') : 'd’après ' + sourcesDuRetenu(a, regles);
};

/** Le materiau des murs : la valeur que les sources retiennent, ecrite comme ce que « Ce que je vois » ecrivait. */
function propositionMateriauMurs(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  if (!a || a.decision === 'rien' || !a.retenu || typeof a.retenu.valeur !== 'string') return null;
  const v = a.retenu.valeur as (typeof MATERIAUX_MURS_VUS)[number]['code'];
  if (!MATERIAUX_MURS_VUS.some((m) => m.code === v)) return null;
  const actuel = textureDesMurs(o as never);
  if (actuel === v) return null;
  const libelle = (m: typeof v) => libelleDeListe(MATERIAUX_MURS_VUS, m);
  const bdtopo = materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs);
  const choisi = o.couleurMurs?.materiau;
  return {
    id: b.cle + ':materiauMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Matériau des murs de ' + b.nom, source: 'arbitrage',
    avant: actuel ? libelle(actuel) + (choisi ? ' (vu sur place)' : bdtopo ? ' (fichiers fonciers)' : '') : o.couleurMurs?.source === 'plan' ? 'couleur du plan, sans texture' : 'non renseigné',
    apres: libelle(v) + ', ' + dOu(a, regles), confiance: null, indices: indicesDuRetenu(a),
    remplaceChoix: choisi ? libelle(choisi) : o.couleurMurs?.source === 'plan' ? 'couleur du plan, sans texture' : null,
    reserve: a.decision === 'manuelle' && !a.projet.choisi ? a.raison : null,
    effet: { type: 'materiauMurs', materiau: v }, arbitrages: [resumeArbitrage(a, regles)],
  };
}

/** La couverture : meme chose. Un batiment sans toit n'a pas de couverture a ecrire. */
function propositionCouverture(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  if (!a || a.decision === 'rien' || !a.retenu || typeof a.retenu.valeur !== 'string' || !o.toit) return null;
  const v = a.retenu.valeur as CouvertureChoisie;
  if (!COUVERTURES_VUES.some((m) => m.code === v)) return null;
  const choisie = o.toit.couverture;
  if (choisie === v) return null;
  const libelle = (m: CouvertureChoisie) => libelleDeListe(COUVERTURES_VUES, m);
  return {
    id: b.cle + ':couverture', cible: { type: 'batiment', cle: b.cle }, objet: 'Couverture de ' + b.nom, source: 'arbitrage',
    avant: choisie ? libelle(choisie) : 'déduite par Plan', apres: libelle(v) + ', ' + dOu(a, regles, true), confiance: null, indices: indicesDuRetenu(a),
    remplaceChoix: choisie ? libelle(choisie).toLowerCase() : null,
    reserve: a.decision === 'manuelle' && !a.projet.choisi ? a.raison : null,
    effet: { type: 'couverture', couverture: v }, arbitrages: [resumeArbitrage(a, regles)],
  };
}

/**
 * La hauteur totale (au faitage) : seulement pour un batiment sans corps, dont le toit n'est qu'une hauteur au-dessus de l'egout ;
 * quand les corps sont lus, c'est eux qui portent le faitage (la toiture est recalculee par le moteur des toits).
 */
function propositionHauteurTotale(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  if (!a || a.decision === 'rien' || !a.retenu || typeof a.retenu.valeur !== 'number' || !o.toit || o.corpsToit?.length) return null;
  const actuelle = hauteurDe(o) + o.toit.hauteur, v = Math.round(a.retenu.valeur * 100) / 100;
  if (Math.abs(v - actuelle) < ECART_HAUTEUR_MIN_M) return null;
  return {
    id: b.cle + ':hauteurTotale', cible: { type: 'batiment', cle: b.cle }, objet: 'Hauteur totale de ' + b.nom, source: 'arbitrage',
    avant: fr(actuelle) + ' m', apres: fr(v) + ' m, ' + sourcesDuRetenu(a, regles), indices: indicesDuRetenu(a), confiance: null,
    remplaceChoix: null, reserve: a.decision === 'manuelle' ? a.raison : null,
    effet: { type: 'hauteurToit', faitageM: v }, arbitrages: [resumeArbitrage(a, regles)],
  };
}

/** Les formes du catalogue que la lecture des formes sait ajuster sur la surface mesuree (facade/lectureFormes.ts). */
const FORMES_AJUSTABLES: ReadonlySet<string> = new Set(['mansart', 'gambrel', 'demi-croupes', 'coyau', 'berceau', 'papillon', 'conique', 'dome', 'imperiale', 'fleche']);

/**
 * Une forme du catalogue retenue par les sources, ajustee sur la mesure LiDAR : si la mesure la porte, le corps qui la dessine est
 * propose. Quand le LiDAR ne l'a pas vue lui-meme (c'est Claude, la photo ou la personne qui la disent), l'ajustement se fait « au
 * mieux » : il ne doit pas etre pire que le corps lu par les formes simples, et la ligne le dit.
 */
function propositionForme(o: ObjetPlan, b: LigneBatiment, arbs: Arbitrage[], forme: string, regles: ReglesReconciliation): Proposition | null {
  if (!o.toitMesure || !o.corpsToit?.length || !('pts' in o) || !o.pts || o.pts.length < 3) return null;
  const a = arbs.find((x) => x.attribut === 'formeToit');
  if (!a?.retenu || a.decision === 'rien') return null;
  const vueParLidar = a.retenu.sources.includes('lidar');
  const lecture = lireForme(o.toitMesure, o.corpsToit, o.pts, forme as never, { souple: !vueParLidar });
  if (!lecture || JSON.stringify(lecture.corps) === JSON.stringify(o.corpsToit)) return null;
  const sources = sourcesDuRetenu(a, regles);
  const manuelles = arbs.filter((x) => x.decision === 'manuelle');
  return {
    id: b.cle + ':toit', cible: { type: 'batiment', cle: b.cle }, objet: 'Forme du toit de ' + b.nom, source: 'arbitrage',
    avant: dire(o.corpsToit, o.toit?.forme), apres: libelleForme(forme).toLowerCase() + ', ajustée sur la mesure LiDAR (' + lecture.dit + ') d’après ' + sources, confiance: null,
    indices: [...indicesDuRetenu(a), { texte: 'Écart à la mesure LiDAR avec cette forme : ' + metres(lecture.ecart) + (vueParLidar ? '' : ' (forme demandée, ajustée au mieux)') }],
    remplaceChoix: a.projet.choisi ? 'forme du toit saisie' : null,
    reserve: manuelles.length ? manuelles.map((x) => regles.attributs[x.attribut].libelle + ' : ' + x.raison).join(' ') : null,
    effet: { type: 'corpsToit', corps: lecture.corps }, arbitrages: arbs.filter((x) => x.decision !== 'rien').map((x) => resumeArbitrage(x, regles)),
  };
}

/**
 * Les cheminees : leur nombre s'arbitre entre ce que la personne a note et ce que Claude voit ; ce qui s'ecrit, ce sont les souches
 * (position, materiau) du constat qui l'emporte, posees sur le plus grand corps en pente. Un nombre force n'a pas de souches : elles
 * sont posees au faitage, comme une souche dont on ne sait que l'existence.
 */
function propositionCheminees(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (!a || a.decision === 'rien' || !a.retenu || typeof a.retenu.valeur !== 'number' || !corps.length) return null;
  const n = Math.max(0, Math.round(a.retenu.valeur));
  const existantes = corps.flatMap((c) => c.cheminees ?? []);
  const i = corpsDesCheminees(corps), c = corps[i];
  if (!c) return null;
  const charge = (a.retenu.lignes[0]?.constat.charge ?? null) as { souches: SoucheVue[]; texte: string } | null;
  const souches = charge?.souches ?? Array.from({ length: n }, () => ({} as SoucheVue));
  const cheminees = souchesSurLeCorps(c, souches.slice(0, n));
  // Rien de neuf : le meme nombre de cheminees, toutes posees par le calcul ou par une autre source, et aucune a ecrire.
  if (n === 0 && !existantes.some((x) => x.source === 'observation')) return null;
  return {
    id: b.cle + ':cheminees', cible: { type: 'batiment', cle: b.cle }, objet: 'Cheminées de ' + b.nom, source: 'arbitrage',
    avant: existantes.length ? pluriel(existantes.length, 'cheminée') : 'aucune cheminée',
    apres: charge?.texte ?? ((n ? pluriel(n, 'cheminée') : 'Aucune cheminée') + (a.decision === 'forcee' ? ', forcée' + (n > 1 ? 's' : '') + ' par vous' : '')),
    confiance: null, indices: indicesDuRetenu(a), remplaceChoix: null,
    reserve: a.decision === 'manuelle' ? a.raison : null,
    effet: { type: 'cheminees', corps: i, cheminees }, arbitrages: [resumeArbitrage(a, regles)],
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
  // Une forme du catalogue (Mansart, papillon, dome...) : le moteur des toits ne la lit pas, la lecture des formes la fit sur la mesure.
  if (typeof f === 'string' && FORMES_AJUSTABLES.has(f)) return propositionForme(o, b, arbs, f, regles);
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

/** Ce que la personne a decide, par `cible|attribut` : un groupe de sources retenu, ou une valeur forcee. */
export type ChoixArbitrages = Readonly<Record<string, ChoixArbitrage | undefined>>;
export const cleChoix = (cible: string, attribut: string): string => cible + '|' + attribut;

/** Tous les arbitrages d'un batiment : un par attribut dont une source au moins parle, avec ce que la personne en a decide. */
export function arbitragesDuBatiment(e: EntreesPropositions, o: ObjetPlan, b: LigneBatiment, vote: VoteAnalyse | null, regles: ReglesReconciliation = RECONCILIATION, choix: ChoixArbitrages = {}): Arbitrage[] {
  const { constats, projet } = constatsDuBatiment({ o, b, mesures: e.mesures, vu: e.capture.batiments[b.cle]?.vu ?? {}, vote });
  const choixDe = (cible: string, attribut: string) => choix[cleChoix(cible, attribut)];
  const faits = arbitrerTout(constats, projet, regles, choixDe);
  // Meme sans source, ces attributs restent proposes a la personne : c'est ainsi qu'elle peut forcer une valeur que personne n'a lue.
  const cible = cibleBatiment(b.cle);
  const muets = ATTRIBUTS_FORCABLES.filter((id) => !faits.some((a) => a.cible === cible && a.attribut === id)).map((id) => arbitrer([], projet(cible, id), id, cible, regles, choixDe(cible, id)));
  return [...faits, ...muets];
}

/** Les attributs d'un batiment qu'une personne peut toujours forcer, meme quand aucune source ne les lit. */
const ATTRIBUTS_FORCABLES: readonly IdAttribut[] = ['hauteurEgout', 'hauteurTotale', 'formeToit', 'materiauMurs', 'couverture', 'cheminees'];

/** Les arbitrages d'un batiment de la liste : de quoi montrer toutes ses sources, et en tirer les propositions. */
export interface ArbitragesBatiment { cle: string; nom: string; arbitrages: Arbitrage[] }

/** Les arbitrages de tous les batiments de la liste de controle. */
export function arbitragesParBatiment(e: EntreesPropositions, votes: VotesBatiments, regles: ReglesReconciliation = RECONCILIATION, choix: ChoixArbitrages = {}): ArbitragesBatiment[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  return e.liste.batiments.flatMap((b) => {
    const o = parCle.get(b.cle);
    return o ? [{ cle: b.cle, nom: b.nom, arbitrages: arbitragesDuBatiment(e, o, b, votes[b.cle] ?? null, regles, choix) }] : [];
  });
}

/** Les propositions que decident ces arbitrages, batiment par batiment (hauteur, puis toiture). */
export function propositionsDesArbitrages(e: EntreesPropositions, parBatiment: readonly ArbitragesBatiment[], regles: ReglesReconciliation = RECONCILIATION): Proposition[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  const out: Proposition[] = [];
  for (const { cle, arbitrages } of parBatiment) {
    const o = parCle.get(cle), b = e.liste.batiments.find((x) => x.cle === cle);
    if (!o || !b) continue;
    const cible = cibleBatiment(cle);
    const parAttribut = (id: IdAttribut) => arbitrages.find((a) => a.cible === cible && a.attribut === id);
    for (const p of [propositionHauteur(o, b, parAttribut('hauteurEgout'), regles), propositionToit(o, b, parAttribut, regles), propositionMateriauMurs(o, b, parAttribut('materiauMurs'), regles), propositionCouverture(o, b, parAttribut('couverture'), regles), propositionHauteurTotale(o, b, parAttribut('hauteurTotale'), regles), propositionCheminees(o, b, parAttribut('cheminees'), regles)]) if (p) out.push(p);
  }
  return out;
}

/** Les propositions decidees par l'arbitrage des sources, de bout en bout (les arbitrages, puis leurs propositions). */
export function propositionsArbitrees(e: EntreesPropositions, votes: VotesBatiments, regles: ReglesReconciliation = RECONCILIATION, choix: ChoixArbitrages = {}): Proposition[] {
  return propositionsDesArbitrages(e, arbitragesParBatiment(e, votes, regles, choix), regles);
}

/** Combien d'arbitrages le moteur a tranches seul, combien attendent la personne, combien elle a decides : la mesure a maximiser par les donnees. */
export interface TauxAutomatique { decides: number; auto: number; manuelles: number; main: number; part: number }

export function tauxAutomatique(arbitrages: readonly Pick<ArbitrageProposition, 'decision'>[]): TauxAutomatique {
  const compte = (d: ArbitrageProposition['decision']) => arbitrages.filter((a) => a.decision === d).length;
  const auto = compte('auto'), manuelles = compte('manuelle'), main = compte('choisie') + compte('forcee');
  // « Rien » (le projet a deja la valeur) n'est pas une decision a prendre : il n'entre pas dans le compte.
  const decides = auto + manuelles + main;
  return { decides, auto, manuelles, main, part: decides ? auto / decides : 1 };
}
