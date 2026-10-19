// Les constats d'un batiment, source par source (MD/spec-reconciliation.md §2, lot R3) : ce que l'IGN, le LiDAR, la photo
// d'une facade, Claude et la personne qui a vu disent de ses attributs, dans les memes mots, pour que le moteur d'arbitrage
// (facade/regles/reconciliation.ts) les compare. Rien n'est ecrit ici : un constat est une lecture, avec sa confiance et la
// regle qui l'a produite.
//
// `projet` n'est pas une source : c'est la valeur que le projet a aujourd'hui, et si une personne l'a choisie a la main (un veto).

import { formeDesCorps, formeDeLaVue } from '../../../model/formeToit.js';
import { lireFormes } from '../../../facade/lectureFormes.js';
import { lectureVraisemblable } from '../../../facade/regles/toits/catalogue.js';
import { hauteurBdTopo } from '../../../facade/regles/toits/vraisemblance.js';
import { textureDesMurs, materiauMurs } from '../../../model/couleurMur.js';
import { hauteurDe } from '../../../regles/decisions.js';
import { azimutFaitage, boutsDuCorps, formeDuCorps, plusGrand } from '../../../facade/regles/toits/faits.js';
import { observationDesSilhouettes } from '../../../facade/regles/toits/silhouettes.js';
import { murDuCorps } from '../../../facade/regles/toits/murDuCorps.js';
import { silhouetteDesCorps } from '../../../facade/regles/toits/silhouetteDesCorps.js';
import { libelleSilhouette, type BoutVu, type SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { materiauDesFacades } from '../../regles/sujets/facades.js';
import { couvertureDuVocabulaire } from '../../regles/sujets/couverture.js';
import { murs } from '../../regles/sujets/formeToit.js';
import { majuscule, pluriel } from '../../regles/sujets/contrat.js';
import { etiquetteFacade, type LigneBatiment } from './liste.js';
import { REGLES_LIDAR } from './reglesLidar.js';
import { arbitrerTout, type Arbitrage, type ChoixArbitrage, type Constat, type EtatProjet, type ValeurConstat } from '../../../facade/regles/reconciliation.js';
import { RECONCILIATION, type ReglesReconciliation } from '../../../regles/reconciliation.js';
import type { IdAttribut } from '../../../regles/reconciliation.js';
import type { IndiceProposition } from '../../../regles/decisions.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import { resumePartie, type CeQueJeVois, type SoucheVue } from '../../../model/ceQueJeVois.js';
import type { CorpsToit, ObjetPlan } from '../../../model/types.js';
import { cleMesure, type MesureFacade } from './mesures.js';
import { releveAvecOuvertures } from './propositionsClaude.js';
import type { RenfortFacadeCapture } from '../../../model/auditParcelle.js';

export const cibleBatiment = (cle: string): string => 'batiment:' + cle;
export const cibleFacade = (cle: string, cote: number): string => 'facade:' + cle + '#' + cote;
/** Un corps du toit autre que le principal (le principal parle pour le batiment), par son rang dans `corpsToit`. */
export const cibleCorps = (cle: string, k: number): string => 'corps:' + cle + '#' + k;
/** Le rang du corps d'une cible `corps:`, null pour une autre cible. */
export const indiceDeCorps = (cible: string): number | null => { const m = /^corps:.*#(\d+)$/.exec(cible); return m ? Number(m[1]) : null; };

/**
 * La forme d'un toit comme l'arbitrage la compare : un quatre-pans, des croupes et un pavillon ne font qu'un (le dessin est le
 * meme, spec des toits §3.3) ; le reste garde son nom.
 */
/**
 * La forme dans le vocabulaire de l'arbitrage. Les noms que le moteur sait dessiner mais pas encore arbitrer (asymetrique, shed, toit
 * en M...) se disent par la forme simple qu'ils sont, pour que l'arbitrage ne voie pas un desaccord la ou il n'y a qu'un nom.
 */
export const formeArbitree = (f: string): string => (f === 'quatre-pans' || f === 'croupes' || f === 'pavillon' ? 'croupes' : f === 'demi-croupe' ? 'demi-croupes' : f === 'asymetrique' || f === 'deux-pans-decales' || f === 'toit-en-m' ? 'deux-pans' : f === 'shed' ? 'appentis' : f);

/** La forme que disent deux bouts de faitage (le vocabulaire du moteur : pignon, croupe), quand rien d'autre n'est dit. */
export function formeDesBouts(bouts: readonly string[]): string | null {
  if (bouts.length !== 2) return null;
  return bouts.includes('croupe') ? 'croupes' : bouts[0] === 'pignon' && bouts[1] === 'pignon' ? 'deux-pans' : null;
}

/** Ce que les mots de « Ce que je vois » disent des bouts. */
const BOUTS_VUS: Record<string, readonly string[]> = { pignons: ['pignon', 'pignon'], croupes: ['croupe', 'croupe'], 'pignon-croupe': ['pignon', 'croupe'] };

/** Le pan des lucarnes que dit Claude, dans les mots de « Ce que je vois ». */
const PAN_CLAUDE: Record<string, 'rue' | 'jardin' | 'les-deux'> = { rue: 'rue', arriere: 'jardin', cote: 'rue', plusieurs: 'les-deux' };

const cm = (v: number): number => Math.round(v * 100) / 100;
const borne = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
/** La confiance d'une lecture LiDAR d'un corps : son ecart a la mesure (m) ; 0 m, 0,95 ; 1,2 m et plus, 0,4. */
export const confianceCorps = (ecartM: number): number => cm(borne(0.95 - (0.55 * ecartM) / 1.2, 0.4, 0.95));

const principal = (corps: readonly CorpsToit[] | null | undefined): CorpsToit | null => (corps?.length ? (corps[plusGrand(corps)] as CorpsToit) : null);

export interface EntreesConstats {
  o: ObjetPlan;
  b: LigneBatiment;
  mesures: ReadonlyMap<string, MesureFacade>;
  vu: CeQueJeVois;
  /** Le vote des passes de Claude pour ce batiment ; null sans analyse. */
  vote: VoteAnalyse | null;
  /** Le renfort de Claude sur les facades (ses ouvertures), par `cle#cote` ; absent sans analyse. */
  renfort?: Record<string, RenfortFacadeCapture> | null | undefined;
}

export interface ConstatsBatiment {
  constats: Constat[];
  /** Ce que le projet a aujourd'hui de cet attribut, pour cet objet. */
  projet(cible: string, attribut: IdAttribut): EtatProjet;
}

/** Les constats de l'IGN : la hauteur BD TOPO, le materiau des fichiers fonciers, et la forme de repli quand le toit n'a pas ete lu. */
function constatsIgn({ o, b }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  const bd = o.bdtopo as { hauteurM?: number | null; hauteurRetenueM?: number | null; materiauxMurs?: unknown } | undefined | null;
  if (typeof bd?.hauteurM === 'number') out.push({ cible, attribut: 'hauteurEgout', source: 'ign', valeur: cm(bd.hauteurM), confiance: null, regle: REGLES_LIDAR.ign.hauteur });
  else if (typeof bd?.hauteurRetenueM === 'number') out.push({ cible, attribut: 'hauteurEgout', source: 'ign', valeur: cm(bd.hauteurRetenueM), confiance: 0.4, regle: REGLES_LIDAR.ign.estimee });
  const mursFonciers = materiauMurs(bd?.materiauxMurs);
  if (mursFonciers) out.push({ cible, attribut: 'materiauMurs', source: 'ign', valeur: mursFonciers.texture, confiance: 0.7, regle: REGLES_LIDAR.ign.materiau });
  if (o.toit?.source === 'bdtopo' && !o.corpsToit?.length) out.push({ cible, attribut: 'hauteurTotale', source: 'ign', valeur: cm(hauteurDe(o) + o.toit.hauteur), confiance: 0.4, regle: REGLES_LIDAR.ign.toit });
  if (o.toit?.source === 'bdtopo' && !o.corpsToit?.length) out.push({ cible, attribut: 'formeToit', source: 'ign', valeur: formeArbitree(o.toit.forme), confiance: 0.4, regle: REGLES_LIDAR.ign.forme });
  return out;
}

/** Les constats du LiDAR : l'egout et le faitage de la surface mesuree, et la forme, les bouts et le sens des corps lus dessus. */
function constatsLidar({ o, b }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  if (o.toitMesure) {
    out.push({ cible, attribut: 'hauteurEgout', source: 'lidar', valeur: cm(o.toitMesure.egout), confiance: 0.9, regle: REGLES_LIDAR.lidar.egout });
    out.push({ cible, attribut: 'hauteurTotale', source: 'lidar', valeur: cm(o.toitMesure.faite), confiance: 0.85, regle: REGLES_LIDAR.lidar.faite });
  }
  const c = principal(o.corpsToit);
  if (c && o.toit?.source !== 'saisie') {
    const confiance = confianceCorps(c.ecart);
    const forme = formeDesCorps(o.corpsToit);
    // Une forme du catalogue que la surface dit mieux que les formes simples (facade/lectureFormes.ts) remplace la lecture des corps,
    // aux memes conditions qu'a la lecture des toits (facade/regles/toits/catalogue.ts) : ni coyau sans demande, ni arbre pris pour une tourelle.
    const mieux = o.toitMesure && 'pts' in o && o.pts ? lireFormes(o.toitMesure, o.corpsToit ?? [], o.pts).find((l) => lectureVraisemblable(l, hauteurBdTopo(o))) : undefined;
    if (mieux) out.push({ cible, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(mieux.forme), confiance: confianceCorps(mieux.ecart), regle: mieux.regle, indices: [{ texte: 'Lecture des formes : ' + mieux.dit }] });
    else if (forme) out.push({ cible, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(forme), confiance, regle: REGLES_LIDAR.lidar.corps });
    out.push({ cible, attribut: 'boutsToit', source: 'lidar', valeur: boutsDuCorps(c), confiance, regle: REGLES_LIDAR.lidar.bouts });
    out.push({ cible, attribut: 'sensFaitage', source: 'lidar', valeur: cm(azimutFaitage(c)), confiance, regle: REGLES_LIDAR.lidar.sens });
    // Les autres corps, chacun le sien : les silhouettes de leurs murs s'arbitrent contre eux (corps par corps).
    const corps = o.corpsToit ?? [], kp = plusGrand(corps);
    corps.forEach((k, i) => {
      if (i === kp) return;
      const ci = cibleCorps(b.cle, i), q = confianceCorps(k.ecart);
      out.push({ cible: ci, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(formeDuCorps(k)), confiance: q, regle: REGLES_LIDAR.lidar.corps });
      out.push({ cible: ci, attribut: 'boutsToit', source: 'lidar', valeur: boutsDuCorps(k), confiance: q, regle: REGLES_LIDAR.lidar.bouts });
      out.push({ cible: ci, attribut: 'sensFaitage', source: 'lidar', valeur: cm(azimutFaitage(k)), confiance: q, regle: REGLES_LIDAR.lidar.sens });
    });
    // La silhouette de chaque mur sous les corps : la photo l'arbitre mur par mur, et gagne (regles/reconciliation.json, `prioritaires`).
    for (const f of b.facades) {
      const s = silhouetteDesCorps(f.facade, corps, hauteurDe(o));
      const m = murDuCorps(corps, f.facade.gauche, f.facade.droite);
      if (s !== 'indetermine') out.push({ cible: cibleFacade(b.cle, f.cote), attribut: 'silhouetteFacade', source: 'lidar', valeur: s, confiance: confianceCorps((corps[m?.corps ?? kp] as CorpsToit).ecart), regle: REGLES_LIDAR.lidar.silhouette });
    }
  }
  return out;
}

/** Un groupe de murs : ceux d'un meme corps du toit, la cible de leurs constats, et si ce corps est plat. */
export interface GroupeDeMurs { cible: string; principal: boolean; facades: LigneBatiment['facades']; plat: boolean }

/**
 * Les murs d'un batiment, corps par corps (facade/regles/toits/murDuCorps.ts) : la silhouette d'une facade dit le bout ou le long
 * pan du corps qu'elle ferme, pas le batiment entier (decision de l'utilisateur, 18 octobre 2026). Le corps principal parle pour le
 * batiment (`cibleBatiment`) ; un autre corps a sa cible (`cibleCorps`). Sans corps lus, tous les murs parlent pour le batiment ; un
 * mur qu'aucun corps ne longe ne dit rien.
 */
export function groupesDeMurs(o: ObjetPlan, b: LigneBatiment): GroupeDeMurs[] {
  const corps = o.corpsToit ?? [];
  if (!corps.length) return [{ cible: cibleBatiment(b.cle), principal: true, facades: b.facades, plat: false }];
  const kp = plusGrand(corps);
  const parCorps = new Map<number, LigneBatiment['facades']>();
  for (const f of b.facades) {
    const m = murDuCorps(corps, f.facade.gauche, f.facade.droite);
    if (m) parCorps.set(m.corps, [...(parCorps.get(m.corps) ?? []), f]);
  }
  return [...parCorps.entries()].sort((x, y) => Number(y[0] === kp) - Number(x[0] === kp) || x[0] - y[0]).map(([k, facades]) => ({
    cible: k === kp ? cibleBatiment(b.cle) : cibleCorps(b.cle, k), principal: k === kp, facades, plat: formeDuCorps(corps[k] as CorpsToit) === 'plat',
  }));
}

/** Les murs d'un groupe, lus sur ce qu'une source dit de leur silhouette. */
function bouts(b: LigneBatiment, g: GroupeDeMurs, lu: Parameters<typeof murs>[1]) {
  // Les etiquettes se font sur le batiment entier (« sud (côté 7) » quand il a plusieurs murs au sud), puis on garde ceux du groupe.
  const tous = murs(b, lu);
  return observationDesSilhouettes(tous.filter((_, i) => g.facades.includes(b.facades[i] as LigneBatiment['facades'][number])), g.plat);
}

/** Les constats que deduit le moteur des silhouettes (bouts, sens, forme) d'une source. */
function constatsDesSilhouettes(source: 'photo' | 'claude' | 'terrain', cible: string, dits: ReturnType<typeof bouts>, confiance: number, regle: string, indices: readonly IndiceProposition[] = []): Constat[] {
  if (!dits) return [];
  const out: Constat[] = [];
  const { bouts: b, faitage, forme } = dits.observation;
  // La silhouette n'a pas le dernier mot (regle prioritaire, regles/reconciliation.json) quand seules des lignes droites de longs
  // pans l'ont dite : c'est le haut d'un deux-pans comme celui d'un appentis (l'abri d'AE 101 passait en deux pans). Un trapeze,
  // lui, ne se lit qu'en croupes.
  if (dits.vus.every((v) => v.role === 'long' && v.silhouette === 'ligne-droite')) regle = regle + ' (longs pans seuls)';
  if (b) out.push({ cible, attribut: 'boutsToit', source, valeur: [...b], confiance, regle, indices });
  if (faitage?.par === 'azimut') out.push({ cible, attribut: 'sensFaitage', source, valeur: faitage.azimutDeg, confiance, regle, indices });
  const f = forme?.[0] ?? (b ? formeDesBouts(b) : null);
  if (f) out.push({ cible, attribut: 'formeToit', source, valeur: formeArbitree(f), confiance, regle, indices });
  return out;
}

/** Les constats de la photo de facade : la hauteur du mur, la silhouette de chaque mur et ce qu'elle dit du toit. */
function constatsPhoto({ b, mesures }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  const lues = b.facades.map((f) => ({ f, m: mesures.get(cleMesure(b.cle, f.cote)) }));
  const hauteurs = lues.filter((x) => x.m?.coinsTrouves && x.m.hauteurM !== null);
  if (hauteurs.length) {
    const h = hauteurs.map((x) => x.m?.hauteurM as number).sort((a, c) => a - c);
    const mediane = h.length % 2 ? (h[(h.length - 1) / 2] as number) : ((h[h.length / 2 - 1] as number) + (h[h.length / 2] as number)) / 2;
    out.push({ cible, attribut: 'hauteurEgout', source: 'photo', valeur: cm(mediane), confiance: Math.min(...hauteurs.map((x) => x.m?.confiance ?? 1)), regle: REGLES_LIDAR.photo.hauteur,
      indices: hauteurs.map((x) => ({ texte: 'Mesurée sur la façade ' + x.f.facade.orientation.toLowerCase(), ...(x.m?.rangReleve != null ? { photo: { cle: b.cle, cote: x.f.cote, rang: x.m.rangReleve } } : {}) })) });
  }
  // La silhouette de chaque mur, avec sa photo : le toit se deduit des silhouettes une fois arbitrees mur par mur (constatsDuToitParSilhouettes).
  for (const { f, m } of lues) {
    if (!m?.silhouette || m.silhouette === 'indetermine') continue;
    const indices = m.rangReleve != null ? [{ texte: 'Façade ' + etiquetteFacade(b, f) + ' : ' + libelleSilhouette(m.silhouette), photo: { cle: b.cle, cote: f.cote, rang: m.rangReleve } }] : [];
    out.push({ cible: cibleFacade(b.cle, f.cote), attribut: 'silhouetteFacade', source: 'photo', valeur: m.silhouette, confiance: (m.confiance ?? 0.6) * (m.coinsTrouves ? 1 : 0.8), regle: REGLES_LIDAR.photo.silhouette, indices });
  }
  // Le releve d'ouvertures de chaque mur : son nombre s'arbitre, le releve lui-meme est ce que la proposition ecrit si cette valeur l'emporte.
  for (const { f, m } of lues) {
    if (!m?.releve) continue;
    const n = m.releve.ouvertures.length;
    out.push({ cible: cibleFacade(b.cle, f.cote), attribut: 'ouverturesFacade', source: 'photo', valeur: n, confiance: (m.confiance ?? 0.6) * (m.coinsTrouves ? 1 : 0.8), regle: REGLES_LIDAR.photo.ouvertures,
      indices: m.rangReleve != null ? [{ texte: 'Photo ' + (m.rangReleve + 1) + ' de la façade', photo: { cle: b.cle, cote: f.cote, rang: m.rangReleve } }] : [],
      charge: { releve: m.releve, coinsTrouves: m.coinsTrouves, rang: m.rangReleve } });
  }
  return out;
}

/** Les constats de Claude sur les ouvertures : son releve renforce, mur par mur, pose sur le releve mesure. */
function constatsRenfort({ b, mesures, renfort }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  for (const f of b.facades) {
    const id = cleMesure(b.cle, f.cote), rf = renfort?.[id], releve0 = mesures.get(id)?.releve;
    if (!rf?.resume || !releve0) continue;
    out.push({ cible: cibleFacade(b.cle, f.cote), attribut: 'ouverturesFacade', source: 'claude', valeur: rf.ouvertures.length, confiance: rf.passes / 3, regle: REGLES_LIDAR.claude.ouvertures,
      charge: { releve: releveAvecOuvertures(releve0, rf.ouvertures) } });
  }
  return out;
}

/** Les constats de Claude : la forme et les bouts de l'ensemble, la silhouette de chaque mur et ce qu'elle dit du toit, les materiaux. */
function constatsClaude({ b, vote: v }: EntreesConstats): Constat[] {
  if (!v) return [];
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  if (v.forme.valeur !== 'indetermine') out.push({ cible, attribut: 'formeToit', source: 'claude', valeur: formeArbitree(v.forme.valeur), confiance: v.forme.accord, regle: 'forme du toit vue par Claude' });
  const g = v.boutGauche.valeur, d = v.boutDroit.valeur;
  if ((g === 'pignon' || g === 'croupe') && (d === 'pignon' || d === 'croupe')) out.push({ cible, attribut: 'boutsToit', source: 'claude', valeur: [g, d], confiance: Math.min(v.boutGauche.accord, v.boutDroit.accord), regle: 'bouts du faîtage vus par Claude' });
  // La silhouette de chaque mur et ce qu'elle ferme (son `bout`) : le toit se deduit des silhouettes une fois arbitrees mur par mur
  // (constatsDuToitParSilhouettes), et remplace alors la vue d'ensemble.
  for (const f of v.facades) {
    const cote = b.facades.find((x) => etiquetteFacade(b, x) === f.facade)?.cote;
    if (cote !== undefined && f.silhouette.valeur !== 'indetermine') out.push({ cible: cibleFacade(b.cle, cote), attribut: 'silhouetteFacade', source: 'claude', valeur: f.silhouette.valeur, confiance: f.silhouette.accord, regle: REGLES_LIDAR.claude.silhouette, indices: f.silhouette.indices.map((i) => ({ texte: i.vu })), charge: { bout: f.bout.valeur, accordBout: f.bout.accord } });
  }
  const m = materiauDesFacades(v);
  if (m) out.push({ cible, attribut: 'materiauMurs', source: 'claude', valeur: m.valeur, confiance: m.accord, regle: 'parement vu par Claude' });
  const nCheminees = v.cheminees.valeur;
  if (typeof nCheminees === 'number') {
    const souches: SoucheVue[] = Array.from({ length: nCheminees }, (_, k) => {
      const sv = v.souches[k];
      return { ...(sv && sv.position !== 'indetermine' ? { position: sv.position } : {}), ...(sv && sv.materiau !== 'indetermine' ? { materiau: sv.materiau } : {}) };
    });
    out.push({ cible, attribut: 'cheminees', source: 'claude', valeur: nCheminees, confiance: v.cheminees.accord, regle: 'cheminées vues par Claude', indices: v.cheminees.indices.map((i) => ({ texte: i.vu })), charge: { souches, texte: (nCheminees ? pluriel(nCheminees, 'cheminée') : 'Aucune cheminée') + ', vue' + (nCheminees > 1 ? 's' : '') + ' par Claude' } });
  }
  const nLucarnes = v.lucarnes.valeur;
  if (typeof nLucarnes === 'number') {
    const types = [...new Set(v.lucarnesTypes)];
    out.push({ cible, attribut: 'lucarnes', source: 'claude', valeur: nLucarnes, confiance: v.lucarnes.accord, regle: 'lucarnes vues par Claude', indices: v.lucarnes.indices.map((i) => ({ texte: i.vu })), charge: { types, pan: PAN_CLAUDE[v.panLucarnes.valeur] ?? 'rue', texte: (nLucarnes ? pluriel(nLucarnes, 'lucarne') : 'Aucune lucarne') + ', vue' + (nLucarnes > 1 ? 's' : '') + ' par Claude' } });
  }
  const couv = couvertureDuVocabulaire(v.couverture.valeur);
  // Quand les passes ne s'accordaient pas, c'est un modele plus fin qui a tranche : la regle le dit, et le constat pese la part des passes d'accord.
  if (couv) out.push({ cible, attribut: 'couverture', source: 'claude', valeur: couv, confiance: v.couverture.accord, regle: v.couverture.escalade ? 'couverture tranchée par un modèle plus fin (les passes ne s’accordaient pas)' : 'couverture vue par Claude', indices: v.couverture.indices.map((i) => ({ texte: i.vu })) });
  return out;
}

/** Les constats de la personne qui a vu : ce qu'elle a note dans « Ce que je vois ». Elle est devant le batiment : confiance pleine. */
function constatsTerrain({ b, vu }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  const dit = (attribut: IdAttribut, valeur: ValeurConstat) => out.push({ cible, attribut, source: 'terrain', valeur, confiance: 1, regle: 'Ce que je vois' });
  const forme = vu.forme ? formeDeLaVue(vu.forme) : null;
  if (forme) dit('formeToit', formeArbitree(forme));
  const bouts = vu.bouts ? BOUTS_VUS[vu.bouts] : undefined;
  if (bouts) dit('boutsToit', bouts);
  if (vu.murs) dit('materiauMurs', vu.murs);
  if (vu.couverture && vu.couverture !== 'terrasse') dit('couverture', vu.couverture);
  // Les cheminees notees : leur nombre s'arbitre, leurs souches (position, materiau) sont ce que la proposition ecrit si cette valeur l'emporte.
  if (vu.appentis) dit('appentis', vu.appentis);
  if (vu.lucarnes) out.push({ cible, attribut: 'lucarnes', source: 'terrain', valeur: vu.lucarnes.nombre, confiance: 1, regle: 'Ce que je vois', charge: { types: [], pan: vu.lucarnes.pan ?? 'rue', texte: (vu.lucarnes.nombre ? pluriel(vu.lucarnes.nombre, 'lucarne') : 'Aucune lucarne') + ', vue' + (vu.lucarnes.nombre > 1 ? 's' : '') + ' sur place' } });
  if (vu.cheminees) out.push({ cible, attribut: 'cheminees', source: 'terrain', valeur: vu.cheminees.nombre, confiance: 1, regle: 'Ce que je vois', charge: { souches: vu.cheminees.souches, texte: majuscule(resumePartie(vu, 'cheminees').toLowerCase()) + ', vues sur place' } });
  return out;
}

/** Ce que le projet a aujourd'hui de chaque attribut d'un batiment ; `choisi` : une personne l'a pose a la main (un veto). */
function etatDuProjet(o: ObjetPlan): (cible: string, attribut: IdAttribut) => EtatProjet {
  const c = principal(o.corpsToit);
  const vide: EtatProjet = { valeur: null, choisi: false };
  return (cible, attribut) => {
    // Un corps autre que le principal : sa forme, ses bouts, son sens.
    const k = indiceDeCorps(cible);
    if (k !== null) {
      const ck = o.corpsToit?.[k];
      if (!ck) return vide;
      if (attribut === 'formeToit') return { valeur: formeArbitree(formeDuCorps(ck)), choisi: o.toit?.source === 'saisie' };
      if (attribut === 'boutsToit') return { valeur: boutsDuCorps(ck), choisi: false };
      if (attribut === 'sensFaitage') return { valeur: cm(azimutFaitage(ck)), choisi: false };
      return vide;
    }
    switch (attribut) {
      case 'hauteurEgout': return { valeur: cm(hauteurDe(o)), choisi: !o.bdtopo && typeof o.elevation === 'number' };
      case 'hauteurTotale': return { valeur: c ? cm(c.faitage) : o.toit ? cm(hauteurDe(o) + o.toit.hauteur) : null, choisi: false };
      case 'formeToit': { const f = formeDesCorps(o.corpsToit) ?? o.toit?.forme; return { valeur: f ? formeArbitree(f) : null, choisi: o.toit?.source === 'saisie' }; }
      case 'boutsToit': return { valeur: c ? boutsDuCorps(c) : null, choisi: false };
      case 'sensFaitage': return { valeur: c ? cm(azimutFaitage(c)) : null, choisi: false };
      case 'cheminees': return { valeur: (o.corpsToit ?? []).reduce((n, k) => n + (k.cheminees?.length ?? 0), 0), choisi: false };
      case 'ouverturesFacade': { const f = (o.facades ?? []).find((r) => cibleFacade(o.key, r.cote) === cible); return { valeur: f && !f.depuisAudit ? f.ouvertures.length : null, choisi: !!f && !f.depuisAudit }; }
      case 'appentis': {
        const ap = (o.corpsToit ?? []).filter((k) => formeDuCorps(k) === 'appentis');
        const etats = new Set(ap.map((k) => k.ouvert));
        return { valeur: etats.size === 1 && ap[0]?.ouvert !== undefined ? (ap[0].ouvert ? 'ouvert' : 'ferme') : null, choisi: false };
      }
      case 'lucarnes': return { valeur: (o.corpsToit ?? []).reduce((n, k) => n + (k.lucarnes?.length ?? 0), 0), choisi: false };
      case 'materiauMurs': return { valeur: textureDesMurs(o), choisi: !!o.couleurMurs?.materiau };
      case 'couverture': return { valeur: o.toit?.couverture ?? null, choisi: !!o.toit?.couverture };
      default: return vide;
    }
  };
}

/** Les regles de la vue d'ensemble de Claude, que les silhouettes de ses murs remplacent quand elles disent quelque chose. */
const VUE_ENSEMBLE_CLAUDE = new Set(['forme du toit vue par Claude', 'bouts du faîtage vus par Claude']);

/**
 * Le toit que disent les silhouettes une fois arbitrees mur par mur (decision de l'utilisateur, 19 octobre 2026 : « tu reconcilies
 * ces donnees de silhouette, la photo gagne sur le LiDAR ; une forme de silhouette donne une forme de toit »). Pour chaque groupe de
 * murs (un corps du toit, groupesDeMurs), la silhouette retenue de chaque mur dit les bouts, le sens et la forme de ce corps
 * (facade/regles/toits/silhouettes.ts), au nom des sources qui l'ont fait retenir : la photo, Claude, ou la personne qui l'a forcee.
 * Une silhouette que seul le LiDAR dit ne fait rien : c'est deja la lecture de ses corps. Un mur que la photo et Claude lisent
 * autrement ne parle que par la silhouette retenue.
 */
export function constatsDuToitParSilhouettes(o: ObjetPlan, b: LigneBatiment, arbitrages: readonly Arbitrage[]): Constat[] {
  const retenue = new Map<number, Arbitrage>();
  for (const f of b.facades) {
    const a = arbitrages.find((x) => x.cible === cibleFacade(b.cle, f.cote) && x.attribut === 'silhouetteFacade');
    // Un mur dont la silhouette n'est retenue que par le LiDAR ne dit rien de plus que ses corps : il ne parle pas ici.
    if (a?.retenu && typeof a.retenu.valeur === 'string' && a.retenu.valeur !== 'indetermine' && a.retenu.sources.some((x) => x !== 'lidar')) retenue.set(f.cote, a);
  }
  const lignes = (f: LigneBatiment['facades'][number]) => retenue.get(f.cote)?.retenu?.lignes ?? [];
  // La silhouette retenue de chaque mur, quelle que soit la source ; ce qu'il ferme, quand Claude est de ceux qui l'ont dite.
  const lu = (f: LigneBatiment['facades'][number]): { silhouette: SilhouetteFacade; bout?: BoutVu } => {
    const a = retenue.get(f.cote);
    if (!a) return { silhouette: 'indetermine' };
    const bout = (lignes(f).find((l) => l.constat.source === 'claude')?.constat.charge as { bout?: BoutVu } | undefined)?.bout;
    return { silhouette: a.retenu?.valeur as SilhouetteFacade, ...(bout ? { bout } : {}) };
  };
  const out: Constat[] = [];
  for (const g of groupesDeMurs(o, b)) {
    const dits = bouts(b, g, lu);
    if (!dits) continue;
    // Les sources qui ont fait retenir une silhouette de ces murs parlent toutes du meme toit : celui des silhouettes retenues.
    for (const source of ['photo', 'claude', 'terrain'] as const) {
      const siennes = g.facades.flatMap((f) => lignes(f).filter((l) => l.constat.source === source));
      if (!siennes.length) continue;
      const confiance = Math.min(1, ...siennes.map((l) => l.constat.confiance ?? 1));
      // Chaque mur qui a parle, avec ce qu'il dit du toit et la photo qui le montre.
      const indices = dits.vus.flatMap((v) => {
        const f = g.facades.find((x) => 'façade ' + etiquetteFacade(b, x) === v.nom);
        const photo = f ? lignes(f).flatMap((l) => l.constat.indices ?? []).find((i) => i.photo)?.photo : undefined;
        return f ? [{ texte: v.nom[0]?.toUpperCase() + v.nom.slice(1) + ' : ' + libelleSilhouette(v.silhouette) + ' → ' + v.dit, ...(photo ? { photo } : {}) }] : [];
      });
      const regle = source === 'terrain' ? 'silhouette forcée par vous' : REGLES_LIDAR[source].silhouette;
      out.push(...constatsDesSilhouettes(source, g.cible, dits, confiance, regle, indices));
    }
  }
  return out;
}

/**
 * Les murs d'un groupe qui portent un pignon traversant (facade/regles/toits/pignons.ts::pignonTraversant), d'apres les silhouettes
 * retenues mur par mur, quelle que soit la source qui les a fait retenir : un triangle en travers du faitage que dit le mur le plus
 * large (decision de l'utilisateur, 19 octobre 2026).
 */
export function traversantsDuGroupe(b: LigneBatiment, g: GroupeDeMurs, silhouettes: readonly Arbitrage[]): LigneBatiment['facades'] {
  const lu = (f: LigneBatiment['facades'][number]): { silhouette: SilhouetteFacade; bout?: BoutVu } => {
    const a = silhouettes.find((x) => x.cible === cibleFacade(b.cle, f.cote) && x.attribut === 'silhouetteFacade');
    const v = a?.retenu?.valeur;
    if (typeof v !== 'string' || !a?.retenu?.sources.some((x) => x !== 'lidar')) return { silhouette: 'indetermine' };
    const bout = (a?.retenu?.lignes.find((l) => l.constat.source === 'claude')?.constat.charge as { bout?: BoutVu } | undefined)?.bout;
    return { silhouette: v as SilhouetteFacade, ...(bout ? { bout } : {}) };
  };
  const dits = bouts(b, g, lu);
  return (dits?.traversants ?? []).flatMap((t) => g.facades.filter((f) => 'façade ' + etiquetteFacade(b, f) === t.nom));
}

/**
 * Les constats d'un batiment avec le toit que disent ses silhouettes arbitrees : sur le corps principal, ce que Claude dit des murs
 * remplace sa vue d'ensemble, sauf une forme que les murs ne tirent que de longs pans (une ligne droite ne dit pas un appentis d'un
 * deux-pans) quand la vue d'ensemble en dit une.
 */
export function avecLeToitDesSilhouettes(constats: readonly Constat[], duToit: readonly Constat[]): Constat[] {
  const out = [...constats];
  for (const c of duToit) {
    if (c.source === 'claude') {
      const k = out.findIndex((x) => x.cible === c.cible && x.attribut === c.attribut && x.source === 'claude' && VUE_ENSEMBLE_CLAUDE.has(x.regle ?? ''));
      if (k >= 0 && c.attribut === 'formeToit' && c.regle !== REGLES_LIDAR.claude.silhouette) continue;
      if (k >= 0) out.splice(k, 1);
    }
    out.push(c);
  }
  return out;
}

/** Tous les constats d'un batiment, source par source, et l'etat du projet pour les comparer. */
export function constatsDuBatiment(e: EntreesConstats): ConstatsBatiment {
  return { constats: [...constatsIgn(e), ...constatsLidar(e), ...constatsPhoto(e), ...constatsClaude(e), ...constatsRenfort(e), ...constatsTerrain(e)], projet: etatDuProjet(e.o) };
}

/**
 * Les constats d'un batiment, reconcilies : la silhouette de chaque mur s'arbitre d'abord (la photo et Claude gagnent sur le
 * LiDAR), puis le toit qu'elles disent, corps par corps, s'ajoute aux constats (constatsDuToitParSilhouettes). `silhouettes` :
 * l'arbitrage de chaque mur, que la proposition du toit montre.
 */
export function constatsReconcilies(e: EntreesConstats, regles: ReglesReconciliation = RECONCILIATION, choixDe?: (cible: string, attribut: IdAttribut) => ChoixArbitrage | undefined): ConstatsBatiment & { silhouettes: Arbitrage[] } {
  const { constats, projet } = constatsDuBatiment(e);
  const silhouettes = arbitrerTout(constats.filter((c) => c.attribut === 'silhouetteFacade'), projet, regles, choixDe);
  return { constats: avecLeToitDesSilhouettes(constats, constatsDuToitParSilhouettes(e.o, e.b, silhouettes)), projet, silhouettes };
}
