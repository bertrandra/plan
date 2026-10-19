// Les propositions que decide le moteur de reconciliation (MD/spec-reconciliation.md, lot R4) : pour chaque attribut dont
// plusieurs sources parlent, un arbitrage (facade/regles/reconciliation.ts) qui dit la valeur retenue, si la decision est
// automatique ou a prendre, et pourquoi ; et la proposition qui l'ecrit dans le projet, avec tous les constats en dessous.
//
// Aujourd'hui : la hauteur a l'egout (IGN, LiDAR, photo de facade), la hauteur totale d'un batiment sans corps (IGN, LiDAR) et la toiture (forme, bouts et sens du faitage : LiDAR,
// silhouette des facades vue par la photo et par Claude, ce que la personne a vu). La toiture est recalculee par le moteur des
// toits sur la mesure LiDAR (`corpsSousContrainte`) avec les valeurs retenues : une decision n'ecrit jamais une forme de sa main.
// Le materiau des murs et la couverture (fichiers fonciers, Claude, ce que la personne a vu) s'arbitrent de la meme facon : la valeur
// notee sur place l'emporte (poids 30, D21), et une valeur que la personne a choisie dans le projet n'est jamais remplacee en silence.

import { nomFacade } from '../../../facade/geometrie.js';
import { arbitrer, arbitrerTout, direValeur, type Arbitrage, type ChoixArbitrage, type Constat, type Groupe } from '../../../facade/regles/reconciliation.js';
import { RECONCILIATION, type IdAttribut, type ReglesReconciliation } from '../../../regles/reconciliation.js';
import { lireForme } from '../../../facade/lectureFormes.js';
import { coherents, corpsSousObservation, dire, direBouts, ECART_FORME_MAX_M, ecartPrincipal, FORMES_LUES, libelleForme, metres } from '../../regles/sujets/formeToit.js';
import { corpsConforme, formeDuCorps, meilleurCorpsSelonObservation, plusGrand } from '../../../facade/regles/toits/faits.js';
import { cibleBatiment, cibleCorps, cibleFacade, constatsReconcilies, groupesDeMurs, indiceDeCorps, traversantsDuGroupe } from './constats.js';
import { pignonTraversant } from '../../../facade/regles/toits/pignons.js';
import { murDuCorps } from '../../../facade/regles/toits/murDuCorps.js';
import { repere } from '../../../facade/toitCorps.js';
import { DESCRIPTION_REGLAGES_TOITS, type NomReglageToit } from '../../../regles/toits/reglages.js';
import { DESCRIPTION_SEUILS_FORMES, type NomSeuilForme } from '../../../regles/toits/formes.js';
import { hauteurDe, type ArbitrageProposition, type GroupeArbitrage, type Proposition } from '../../../regles/decisions.js';
import { cleMesure, corpsDesCheminees, dateFr, ECART_HAUTEUR_MIN_M, lucarnesSurLeCorps, souchesSurLeCorps, type EntreesPropositions } from './propositions.js';
import type { BoutFait, ObservationFait } from '../../../regles/toits/faits.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import { libelleSilhouette, type SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { COUVERTURES_VUES, MATERIAUX_MURS_VUS, libelleDe as libelleDeListe, type SoucheVue } from '../../../model/ceQueJeVois.js';
import { pluriel } from '../../regles/sujets/contrat.js';
import { materiauMurs, textureDesMurs } from '../../../model/couleurMur.js';
import type { CorpsToit, CouvertureChoisie, FormeToitSimple, ObjetPlan, PtBrut, ReleveFacade, TypeLucarne } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';
import { ouverturesEnClair } from './propositionsClaude.js';

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

/** La facade que vise un arbitrage (`facade:<cle>#<cote>`), nommee « sud (côté 3) » : sans elle, dix silhouettes de la liste se ressemblent. */
function nomDeLaCible(b: LigneBatiment | undefined, cible: string): string | undefined {
  const cote = /^facade:[^#]+#(\d+)$/.exec(cible)?.[1];
  const f = cote === undefined ? undefined : b?.facades.find((x) => x.cote === Number(cote));
  return f ? nomFacade(f.facade.orientation, f.cote) : undefined;
}

/** Un arbitrage, tel que la proposition le garde (un fichier d'audit le rejoue sans le moteur). */
export function resumeArbitrage(a: Arbitrage, regles: ReglesReconciliation = RECONCILIATION, b?: LigneBatiment): ArbitrageProposition {
  const desc = regles.attributs[a.attribut];
  const { accord, libelle } = desc;
  const mot = libelleDe(a.attribut);
  const groupes: GroupeArbitrage[] = a.groupes.map((g: Groupe) => ({
    valeur: direValeur(g.valeur, accord, mot), score: Math.round(g.score * 100) / 100, retenu: g === a.retenu,
    lignes: g.lignes.map((l) => ({ source: l.constat.source, libelle: libelleSource(regles, l.constat.source), valeur: direValeur(l.constat.valeur, accord, mot), confiance: l.constat.confiance === null ? null : Math.round(l.constat.confiance * 100) / 100, score: Math.round(l.score * 100) / 100, ...(l.constat.regle ? { regle: direRegle(l.constat.regle, regles) } : {}) })),
  }));
  const decision = a.decision;
  return {
    cible: a.cible, ...(nomDeLaCible(b, a.cible) ? { cibleNom: nomDeLaCible(b, a.cible) as string } : {}), attribut: a.attribut, libelle, decision, accord: accord.type, ...('unite' in accord && accord.unite ? { unite: accord.unite } : {}),
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
  const arbitrage = resumeArbitrage(a, regles, b);
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
    effet: { type: 'materiauMurs', materiau: v }, arbitrages: [resumeArbitrage(a, regles, b)],
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
    effet: { type: 'couverture', couverture: v }, arbitrages: [resumeArbitrage(a, regles, b)],
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
    effet: { type: 'hauteurToit', faitageM: v }, arbitrages: [resumeArbitrage(a, regles, b)],
  };
}

/** Les formes du catalogue que la lecture des formes sait ajuster sur la surface mesuree (facade/lectureFormes.ts). */
const FORMES_AJUSTABLES: ReadonlySet<string> = new Set(['mansart', 'gambrel', 'demi-croupes', 'coyau', 'berceau', 'carene', 'papillon', 'conique', 'polygonal', 'dome', 'imperiale', 'fleche']);

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
    effet: { type: 'corpsToit', corps: lecture.corps }, arbitrages: arbs.filter((x) => x.decision !== 'rien').map((x) => resumeArbitrage(x, regles, b)),
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
    effet: { type: 'cheminees', corps: i, cheminees }, arbitrages: [resumeArbitrage(a, regles, b)],
  };
}

const estBout = (m: string): m is BoutFait => m === 'pignon' || m === 'croupe';

type Mur = LigneBatiment['facades'][number];

/**
 * Le corps avec un pignon traversant sur chaque mur de `murs` qui est un de ses longs pans (pignonTraversant), et les murs ou il
 * a ete pose. Un mur qui n'est pas un long pan de ce corps (son bout, un autre corps) n'en recoit pas.
 */
function avecTraversants(c: CorpsToit, murs: readonly Mur[], o: ObjetPlan & { pts: readonly PtBrut[] }): { corps: CorpsToit; poses: Mur[] } {
  let corps = c;
  const poses: Mur[] = [];
  if (!o.toitMesure) return { corps, poses };
  for (const f of murs) {
    const m = murDuCorps([corps], f.facade.gauche, f.facade.droite);
    if (!m || (m.cote !== 0 && m.cote !== 2)) continue;
    const r = repere(corps.pts);
    const s = (q: PtBrut) => (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y;
    const avec = pignonTraversant(corps, m.cote === 0 ? 0 : 1, s(f.facade.gauche), s(f.facade.droite), o.toitMesure, o.pts);
    if (avec !== corps) { corps = avec; poses.push(f); }
  }
  return { corps, poses };
}

/** Ce que la proposition dit d'un pignon traversant, et comment le changer : c'est la silhouette des murs qui en decide. */
function direTraversants(poses: readonly Mur[]): { apres: string; indices: { texte: string }[] } {
  if (!poses.length) return { apres: '', indices: [] };
  const noms = poses.map((f) => 'façade ' + nomFacade(f.facade.orientation, f.cote));
  return {
    apres: ', pignon traversant sur la ' + noms.join(' et la '),
    indices: [{ texte: 'Pignon traversant : la ' + noms.join(' et la ') + ' montre un triangle en travers du faîtage que dit le mur le plus large. Pour n’avoir aucun pignon, forcez « ligne droite » sur la ' + noms.join(' et la ') + ' ci-dessous ; pour faire tourner le faîtage, forcez « ligne droite » sur le mur le plus large (si la mesure LiDAR ne porte pas un faîtage dans ce sens, rien n’est proposé).' }],
  };
}

/**
 * La toiture : la forme, les bouts et le sens du faitage retenus, relus par le moteur des toits sur la mesure LiDAR. Pas de
 * proposition quand les trois sont ce que le projet a deja, quand la forme retenue n'est pas une que le moteur produit
 * (Mansart, demi-croupe : le dessin les sait, le calcul pas encore), ou quand la mesure ne la porte pas.
 */
function propositionToit(o: ObjetPlan, b: LigneBatiment, parAttribut: (a: IdAttribut) => Arbitrage | undefined, regles: ReglesReconciliation, murs: readonly Arbitrage[] = [], trav: readonly Mur[] = []): Proposition | null {
  if (!o.toitMesure || !('pts' in o) || !o.pts || o.pts.length < 3) return null;
  const arbs = (['formeToit', 'boutsToit', 'sensFaitage'] as const).map(parAttribut).filter((a): a is Arbitrage => !!a?.retenu);
  if (!arbs.some((a) => a.decision !== 'rien') && !trav.length) return null;
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
  const relus = Object.keys(observation).length && arbs.some((a) => a.decision !== 'rien') ? corpsSousObservation({ ...o, pts: o.pts }, observation) : null;
  const base = relus ?? o.corpsToit ?? null;
  if (!base?.length) return null;
  // Les pignons traversants que montrent les murs du corps principal, poses sur lui.
  const kp = plusGrand(base);
  const { corps: principal, poses } = avecTraversants(base[kp] as CorpsToit, trav, { ...o, pts: o.pts });
  if (!relus && !poses.length) return null;
  const corps = base.map((c, i) => (i === kp ? principal : c));
  const involves = arbs.filter((a) => a.decision !== 'rien');
  const manuelles = [...involves, ...murs].filter((a) => a.decision === 'manuelle');
  const vus = [forme ? dire(corps, undefined) : null, bouts ? direBouts(bouts) : null, typeof sens === 'number' ? 'faîtage à ' + Math.round(sens) + '°' : null].filter(Boolean).join(', ');
  const sources = [...new Set([...involves, ...murs].flatMap((a) => a.retenu?.sources ?? []))].map((s) => libelleSource(regles, s)).join(', ');
  const ecart = 'Écart à la mesure LiDAR avec cette forme : ' + metres(ecartPrincipal(corps)) + (o.corpsToit?.length ? ' (aujourd’hui ' + metres(ecartPrincipal(o.corpsToit)) + ')' : '');
  const t = direTraversants(poses);
  return {
    id: b.cle + ':toit', cible: { type: 'batiment', cle: b.cle }, objet: 'Forme du toit de ' + b.nom, source: 'arbitrage',
    avant: dire(o.corpsToit, o.toit?.forme), apres: dire(corps, undefined) + (relus ? ', relue sur la mesure LiDAR (' + vus + ')' : '') + t.apres + ' d’après ' + sources, confiance: null,
    indices: [...involves.flatMap(indicesDuRetenu), ...t.indices, { texte: ecart }],
    remplaceChoix: involves.some((a) => a.projet.choisi) ? 'forme du toit saisie' : null,
    reserve: manuelles.length ? manuelles.map((a) => regles.attributs[a.attribut].libelle + ' : ' + a.raison).join(' ') : null,
    effet: { type: 'corpsToit', corps }, arbitrages: [...involves, ...murs].map((a) => resumeArbitrage(a, regles, b)),
  };
}

/**
 * La forme d'un corps du toit autre que le principal, corps par corps (decision de l'utilisateur, 18 octobre 2026) : la silhouette
 * des murs de ce corps, arbitree contre sa lecture LiDAR, le relit sur la mesure dans la forme, les bouts et le sens retenus ; les
 * autres corps ne bougent pas.
 */
function propositionCorps(o: ObjetPlan, b: LigneBatiment, k: number, parAttribut: (a: IdAttribut) => Arbitrage | undefined, regles: ReglesReconciliation, murs: readonly Arbitrage[] = [], trav: readonly Mur[] = []): Proposition | null {
  const c = o.corpsToit?.[k];
  if (!c || !o.toitMesure || !('pts' in o) || !o.pts || o.pts.length < 3) return null;
  const arbs = (['formeToit', 'boutsToit', 'sensFaitage'] as const).map(parAttribut).filter((a): a is Arbitrage => !!a?.retenu);
  const involves = arbs.filter((a) => a.decision !== 'rien');
  if (!involves.length && !trav.length) return null;
  const retenu = (id: IdAttribut) => arbs.find((a) => a.attribut === id)?.retenu?.valeur;
  const f = retenu('formeToit'), bt = retenu('boutsToit'), sens = retenu('sensFaitage');
  let forme: FormeToitSimple | undefined = typeof f === 'string' ? FORMES_LUES[f] : undefined;
  if (typeof f === 'string' && f !== 'indetermine' && !forme) return null;
  const mots = Array.isArray(bt) ? (bt as readonly string[]) : null;
  let bouts = mots && mots.length === 2 && estBout(mots[0] as string) && estBout(mots[1] as string) ? ([mots[0], mots[1]] as [BoutFait, BoutFait]) : undefined;
  // Une forme et des bouts qui se contredisent : ce que les silhouettes ont fait changer l'emporte sur ce qui n'a pas bouge (une rampe
  // fait un appentis ; les pignons d'avant ne la retiennent pas).
  const change = (id: IdAttribut) => involves.some((a) => a.attribut === id);
  if (!coherents(forme, bouts)) { if (change('formeToit') && !change('boutsToit')) bouts = undefined; else forme = undefined; }
  const observation: ObservationFait = { ...(forme ? { forme: [forme] } : {}), ...(bouts ? { bouts } : {}), ...(typeof sens === 'number' ? { faitage: { par: 'azimut' as const, azimutDeg: sens } } : {}) };
  // Le corps relu sous ce que disent les silhouettes, quand il ne le tient pas deja.
  let relu: CorpsToit | null = null;
  if (involves.length && Object.keys(observation).length && !corpsConforme(c, observation, o.pts)) {
    const r = meilleurCorpsSelonObservation(o.toitMesure, c.pts, o.pts, observation);
    relu = r && r.ecart <= ECART_FORME_MAX_M ? r : null;
    if (!relu && !trav.length) return null;
  }
  // Puis les pignons traversants que montrent ses murs.
  const { corps: toit, poses } = avecTraversants(relu ?? c, trav, { ...o, pts: o.pts });
  if (!relu && !poses.length) return null;
  const manuelles = [...involves, ...murs].filter((a) => a.decision === 'manuelle');
  const vus = [forme ? dire([toit], undefined) : null, bouts ? direBouts(bouts) : null, typeof sens === 'number' ? 'faîtage à ' + Math.round(sens) + '°' : null].filter(Boolean).join(', ');
  const sources = [...new Set([...involves, ...murs].flatMap((a) => a.retenu?.sources ?? []))].map((s) => libelleSource(regles, s)).join(', ');
  const nom = 'corps ' + (k + 1) + ' (' + metres(Math.hypot((c.pts[1]?.x ?? 0) - (c.pts[0]?.x ?? 0), (c.pts[1]?.y ?? 0) - (c.pts[0]?.y ?? 0))) + ' de long)';
  const t = direTraversants(poses);
  return {
    id: b.cle + ':toit:' + k, cible: { type: 'batiment', cle: b.cle }, objet: 'Forme du toit de ' + b.nom + ', ' + nom, source: 'arbitrage',
    avant: dire([c], undefined), apres: dire([toit], undefined) + (relu ? ', relue sur la mesure LiDAR (' + vus + ')' : '') + t.apres + ' d’après ' + sources, confiance: null,
    indices: [...involves.flatMap(indicesDuRetenu), ...t.indices, { texte: 'Écart à la mesure LiDAR de ce corps : ' + metres(toit.ecart) + ' (aujourd’hui ' + metres(c.ecart) + ')' }],
    remplaceChoix: involves.some((a) => a.projet.choisi) ? 'forme du toit saisie' : null,
    reserve: manuelles.length ? manuelles.map((a) => regles.attributs[a.attribut].libelle + ' : ' + a.raison).join(' ') : null,
    effet: { type: 'corpsDuToit', corps: k, toit }, arbitrages: [...involves, ...murs].map((a) => resumeArbitrage(a, regles, b)),
  };
}

/** Ce que la personne a decide, par `cible|attribut` : un groupe de sources retenu, ou une valeur forcee. */
/**
 * Le releve des ouvertures d'une facade : leur nombre s'arbitre entre la photo (ses contours) et Claude (son releve renforce) ; ce qui
 * s'ecrit, c'est le releve du constat qui l'emporte, texture de la photo comprise. Un releve pose par l'audit d'apres cette photo est
 * deja ecrit ; un releve pose d'apres une photo plus ancienne n'est pas un choix : la nouvelle mesure le remplace.
 */
function propositionReleve(o: ObjetPlan, b: LigneBatiment, f: LigneBatiment['facades'][number], a: Arbitrage | undefined, e: EntreesPropositions, regles: ReglesReconciliation): Proposition | null {
  if (!a || a.decision === 'rien' || !a.retenu) return null;
  const m = e.mesures.get(cleMesure(b.cle, f.cote));
  if (!m?.releve) return null;
  const existant = (o.facades ?? []).find((r) => r.cote === f.cote);
  if (existant?.depuisAudit && existant.releveLe === m.releve.releveLe) return null;
  const deja = existant?.depuisAudit ? undefined : existant;
  const avantTexte = existant ? (existant.depuisAudit ? 'relevé automatique du ' : 'relevé du ') + dateFr(existant.releveLe) + ' (' + pluriel(existant.ouvertures.length, 'ouverture') + ')' : 'aucun relevé';
  const charge = (a.retenu.lignes[0]?.constat.charge ?? null) as { releve: ReleveFacade; coinsTrouves?: boolean; rang?: number | null } | null;
  // Une valeur forcee n'a pas de releve : la mesure de la photo, ou le nombre n'est qu'un reglage a refaire a la main.
  const releve = charge?.releve ?? m.releve;
  const n = releve.ouvertures.length;
  const deClaude = a.retenu.sources.length === 1 && a.retenu.sources[0] === 'claude';
  return {
    id: cleMesure(b.cle, f.cote) + ':releve', cible: { type: 'facade', cle: b.cle, cote: f.cote }, objet: 'Façade ' + nomFacade(f.facade.orientation, f.cote) + ' de ' + b.nom, source: 'arbitrage',
    avant: avantTexte, apres: pluriel(n, 'ouverture') + ' relevée' + (n > 1 ? 's' : '') + (n ? ' (' + ouverturesEnClair(releve.ouvertures) + ')' : '') + (deClaude ? ', avec l’aide de Claude' : ', texture de la photo'),
    indices: indicesDuRetenu(a), confiance: null,
    remplaceChoix: deja ? avantTexte : null,
    reserve: [a.decision === 'manuelle' ? a.raison : null, m.coinsTrouves ? null : 'Les coins du mur n’ont pas été trouvés sur la photo : ils sont prédits par la prise de vue, à vérifier.'].filter(Boolean).join(' ') || null,
    effet: { type: 'releve', releve }, arbitrages: [resumeArbitrage(a, regles, b)],
  };
}

/** Les types de lucarnes que dit Claude, dans le vocabulaire du modele. */
const TYPES_LUCARNE_VUS: ReadonlySet<string> = new Set(['jacobine', 'capucine', 'chien-assis', 'rampante', 'meuniere', 'oeil-de-boeuf', 'outeau', 'lanterneau']);

/**
 * Les lucarnes : leur nombre s'arbitre entre ce que la personne a note et ce que Claude voit (le LiDAR, a 50 cm la cellule, ne les voit
 * pas) ; ce qui s'ecrit, ce sont des lucarnes posees a egale distance sur le pan dit, sur le plus grand corps en pente. Leur place exacte
 * et leur largeur sont des valeurs par type : la ligne arrive toujours decochee, et le dit.
 */
function propositionLucarnes(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (!a || a.decision === 'rien' || !a.retenu || typeof a.retenu.valeur !== 'number' || !corps.length) return null;
  const n = Math.max(0, Math.round(a.retenu.valeur));
  const i = corpsDesCheminees(corps), c = corps[i];
  if (!c) return null;
  const existantes = corps.flatMap((k) => k.lucarnes ?? []);
  if (n === 0 && !existantes.some((l) => l.source === 'observation')) return null;
  const charge = (a.retenu.lignes[0]?.constat.charge ?? null) as { types: string[]; pan: 'rue' | 'jardin' | 'les-deux'; texte: string } | null;
  const types = (charge?.types ?? []).filter((t) => TYPES_LUCARNE_VUS.has(t)) as TypeLucarne[];
  const lucarnes = lucarnesSurLeCorps(c, n, types, charge?.pan ?? 'rue');
  const place = 'Leur place est répartie le long du faîtage et leur largeur est celle de leur type : la photo ne les donne pas, à ajuster dans l’inspecteur.';
  return {
    id: b.cle + ':lucarnes', cible: { type: 'batiment', cle: b.cle }, objet: 'Lucarnes de ' + b.nom, source: 'arbitrage',
    avant: existantes.length ? pluriel(existantes.length, 'lucarne') : 'aucune lucarne',
    apres: charge?.texte ?? ((n ? pluriel(n, 'lucarne') : 'Aucune lucarne') + (a.decision === 'forcee' ? ', forcée' + (n > 1 ? 's' : '') + ' par vous' : '')),
    confiance: null, indices: indicesDuRetenu(a), remplaceChoix: null,
    reserve: [a.decision === 'manuelle' ? a.raison : null, n ? place : null].filter(Boolean).join(' ') || null,
    effet: { type: 'lucarnes', corps: i, lucarnes }, arbitrages: [resumeArbitrage(a, regles, b)],
  };
}

/**
 * L'appentis (galerie, porche) ouvert ou ferme : ce que la personne a vu sur place, ou ce qu'elle force ici (les colonial, les galeries
 * d'Amerique : des poteaux, pas de mur exterieur). Ni le LiDAR ni la photo de rue ne le disent. S'ecrit sur tous les appentis du batiment.
 */
function propositionAppentis(o: ObjetPlan, b: LigneBatiment, a: Arbitrage | undefined, regles: ReglesReconciliation): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (!a || a.decision === 'rien' || !a.retenu || (a.retenu.valeur !== 'ouvert' && a.retenu.valeur !== 'ferme')) return null;
  const cibles = corps.flatMap((c, i) => (formeDuCorps(c) === 'appentis' ? [i] : []));
  if (!cibles.length) return null;
  const ouvert = a.retenu.valeur === 'ouvert';
  const actuel = new Set(cibles.map((i) => (corps[i] as { ouvert?: boolean }).ouvert));
  const dit = (v: boolean | undefined) => (v === undefined ? 'sans indication (le toit seul)' : v ? 'ouvert' : 'fermé');
  return {
    id: b.cle + ':appentis', cible: { type: 'batiment', cle: b.cle }, objet: 'Appentis de ' + b.nom, source: 'arbitrage',
    avant: actuel.size === 1 ? dit([...actuel][0]) : 'ouverts et fermés',
    apres: (ouvert ? 'Ouvert : des poteaux, pas de mur extérieur' : 'Fermé : des murs jusqu’au sol') + (cibles.length > 1 ? ' (' + cibles.length + ' appentis)' : '') + (a.decision === 'forcee' ? ', choisi par vous' : ', vu sur place'),
    confiance: null, indices: indicesDuRetenu(a), remplaceChoix: null,
    reserve: a.decision === 'manuelle' ? a.raison : null,
    effet: { type: 'appentis', corps: cibles, ouvert }, arbitrages: [resumeArbitrage(a, regles, b)],
  };
}

export type ChoixArbitrages = Readonly<Record<string, ChoixArbitrage | undefined>>;
export const cleChoix = (cible: string, attribut: string): string => cible + '|' + attribut;

/** Tous les arbitrages d'un batiment : un par attribut dont une source au moins parle, avec ce que la personne en a decide. */
export function arbitragesDuBatiment(e: EntreesPropositions, o: ObjetPlan, b: LigneBatiment, vote: VoteAnalyse | null, regles: ReglesReconciliation = RECONCILIATION, choix: ChoixArbitrages = {}): Arbitrage[] {
  const choixDe = (cible: string, attribut: string) => choix[cleChoix(cible, attribut)];
  // D'abord la silhouette de chaque mur (la photo gagne sur le LiDAR), puis le toit qu'elles disent, corps par corps.
  const { constats, projet } = constatsReconcilies({ o, b, mesures: e.mesures, vu: e.capture.batiments[b.cle]?.vu ?? {}, vote, renfort: e.renfort }, regles, choixDe);
  const faits = arbitrerTout(constats, projet, regles, choixDe);
  // Meme sans source, ces attributs restent proposes a la personne : c'est ainsi qu'elle peut forcer une valeur que personne n'a lue.
  const cible = cibleBatiment(b.cle);
  const muets = ATTRIBUTS_FORCABLES.filter((id) => !faits.some((a) => a.cible === cible && a.attribut === id)).map((id) => arbitrer([], projet(cible, id), id, cible, regles, choixDe(cible, id)));
  return [...faits, ...muets];
}

/** Les attributs d'un batiment qu'une personne peut toujours forcer, meme quand aucune source ne les lit. */
const ATTRIBUTS_FORCABLES: readonly IdAttribut[] = ['hauteurEgout', 'hauteurTotale', 'formeToit', 'materiauMurs', 'couverture', 'cheminees', 'lucarnes', 'appentis'];

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
    for (const f of b.facades) {
      const p = propositionReleve(o, b, f, arbitrages.find((x) => x.cible === cibleFacade(cle, f.cote) && x.attribut === 'ouverturesFacade'), e, regles);
      if (p) out.push(p);
    }
    // La silhouette de chaque mur d'un corps, arbitree : elle se lit sous la proposition du toit qu'elle a fait dire.
    const groupes = groupesDeMurs(o, b);
    const travDe = (cibleGroupe: string): Mur[] => { const g = groupes.find((x) => x.cible === cibleGroupe); return g ? traversantsDuGroupe(b, g, arbitrages) : []; };
    const mursDe = (cibleGroupe: string): Arbitrage[] => (groupes.find((g) => g.cible === cibleGroupe)?.facades ?? []).flatMap((f) => arbitrages.filter((a) => a.cible === cibleFacade(cle, f.cote) && a.attribut === 'silhouetteFacade' && a.groupes.some((g) => g.sources.some((x) => x !== 'lidar'))));
    // Les corps autres que le principal, chacun sous les silhouettes de ses murs.
    for (const k of [...new Set(arbitrages.map((a) => indiceDeCorps(a.cible)).filter((x): x is number => x !== null))].sort((x, y) => x - y)) {
      const p = propositionCorps(o, b, k, (id) => arbitrages.find((a) => a.cible === cibleCorps(cle, k) && a.attribut === id), regles, mursDe(cibleCorps(cle, k)), travDe(cibleCorps(cle, k)));
      if (p) out.push(p);
    }
    for (const p of [propositionHauteur(o, b, parAttribut('hauteurEgout'), regles), propositionToit(o, b, parAttribut, regles, mursDe(cible), travDe(cible)), propositionMateriauMurs(o, b, parAttribut('materiauMurs'), regles), propositionCouverture(o, b, parAttribut('couverture'), regles), propositionHauteurTotale(o, b, parAttribut('hauteurTotale'), regles), propositionCheminees(o, b, parAttribut('cheminees'), regles), propositionLucarnes(o, b, parAttribut('lucarnes'), regles), propositionAppentis(o, b, parAttribut('appentis'), regles)]) if (p) out.push(p);
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
