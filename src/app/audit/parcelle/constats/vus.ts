// Les constats de ce qui a ete vu : photos, renfort, Claude, et ce que la personne a vu sur place.
// Un morceau de app/audit/parcelle/constats.ts, qui le reexporte : le reste du programme importe depuis lui.

import { nomFacade } from '../../../../geometry/cotesVusDeDehors.js';
import { formeDeLaVue } from '../../../../model/formeToit.js';
import { formeDuCorps, plusGrand } from '../../../../facade/regles/toits/faits.js';
import { observationDesSilhouettes } from '../../../../facade/regles/toits/silhouettes.js';
import { murDuCorps } from '../../../../facade/regles/toits/murDuCorps.js';
import { libelleSilhouette } from '../../../../model/silhouetteFacade.js';
import { materiauDesFacades } from '../../../regles/sujets/facades.js';
import { couvertureDuVocabulaire } from '../../../regles/sujets/couverture.js';
import { murs } from '../../../regles/sujets/formeToit.js';
import { majuscule, pluriel } from '../../../regles/sujets/contrat.js';
import { etiquetteFacade, type LigneBatiment } from '../liste.js';
import { REGLES_LIDAR } from '../reglesLidar.js';
import { type Constat, type ValeurConstat } from '../../../../facade/regles/reconciliation.js';
import type { IdAttribut } from '../../../../regles/reconciliation.js';
import type { IndiceProposition } from '../../../../regles/decisions.js';
import { resumePartie, type SoucheVue } from '../../../../model/ceQueJeVois.js';
import type { CorpsToit, ObjetPlan } from '../../../../model/types.js';
import { cleMesure } from '../mesures.js';
import { releveAvecOuvertures } from '../propositionsClaude.js';
import { cibleBatiment, cibleFacade, cibleCorps, formeArbitree, formeDesBouts, BOUTS_VUS, PAN_CLAUDE, cm, type EntreesConstats } from './cibles.js';

/** Un groupe de murs : ceux d'un meme corps du toit, la cible de leurs constats, et si ce corps est plat. */
export interface GroupeDeMurs { cible: string; principal: boolean; facades: LigneBatiment['facades']; plat: boolean }

/**
 * Les murs d'un batiment, corps par corps (facade/regles/toits/murDuCorps.ts) : la silhouette d'une facade dit le bout ou le long
 * pan du corps qu'elle ferme, pas le batiment entier (decision de l'utilisateur, 18 octobre 2026). Le corps principal parle pour le
 * batiment (`cibleBatiment`) ; un autre corps a sa cible (`cibleCorps`). Sans corps lus, tous les murs parlent pour le batiment ; un
 * mur qu'aucun corps ne longe ne dit rien.
 */
export function groupesDeMurs(o: ObjetPlan, b: LigneBatiment): GroupeDeMurs[] {
  const corps = o.batiment?.corpsToit ?? [];
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
export function bouts(b: LigneBatiment, g: GroupeDeMurs, lu: Parameters<typeof murs>[1]) {
  // Les etiquettes se font sur le batiment entier (« sud (côté 7) » quand il a plusieurs murs au sud), puis on garde ceux du groupe.
  const tous = murs(b, lu);
  return observationDesSilhouettes(tous.filter((_, i) => g.facades.includes(b.facades[i] as LigneBatiment['facades'][number])), g.plat);
}

/** Les constats que deduit le moteur des silhouettes (bouts, sens, forme) d'une source. */
export function constatsDesSilhouettes(source: 'photo' | 'claude' | 'terrain', cible: string, dits: ReturnType<typeof bouts>, confiance: number, regle: string, indices: readonly IndiceProposition[] = []): Constat[] {
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
export function constatsPhoto({ b, mesures }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  const lues = b.facades.map((f) => ({ f, m: mesures.get(cleMesure(b.cle, f.cote)) }));
  const hauteurs = lues.filter((x) => x.m?.coinsTrouves && x.m.hauteurM !== null);
  if (hauteurs.length) {
    const h = hauteurs.map((x) => x.m?.hauteurM as number).sort((a, c) => a - c);
    const mediane = h.length % 2 ? (h[(h.length - 1) / 2] as number) : ((h[h.length / 2 - 1] as number) + (h[h.length / 2] as number)) / 2;
    out.push({ cible, attribut: 'hauteurEgout', source: 'photo', valeur: cm(mediane), confiance: Math.min(...hauteurs.map((x) => x.m?.confiance ?? 1)), regle: REGLES_LIDAR.photo.hauteur,
      indices: hauteurs.map((x) => ({ texte: 'Mesurée sur la façade ' + nomFacade(x.f.facade.orientation, x.f.cote), ...(x.m?.rangReleve != null ? { photo: { cle: b.cle, cote: x.f.cote, rang: x.m.rangReleve } } : {}) })) });
  }
  // La silhouette de chaque mur, avec sa photo : le toit se deduit des silhouettes une fois arbitrees mur par mur (constatsDuToitParSilhouettes).
  for (const { f, m } of lues) {
    if (!m?.silhouette || m.silhouette === 'indetermine') continue;
    const indices = m.rangReleve != null ? [{ texte: 'Façade ' + nomFacade(f.facade.orientation, f.cote) + ' : ' + libelleSilhouette(m.silhouette), photo: { cle: b.cle, cote: f.cote, rang: m.rangReleve } }] : [];
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
export function constatsRenfort({ b, mesures, renfort }: EntreesConstats): Constat[] {
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
export function constatsClaude({ b, vote: v }: EntreesConstats): Constat[] {
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
export function constatsTerrain({ b, vu }: EntreesConstats): Constat[] {
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
