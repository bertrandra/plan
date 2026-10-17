// Les constats d'un batiment, source par source (MD/spec-reconciliation.md §2, lot R3) : ce que l'IGN, le LiDAR, la photo
// d'une facade, Claude et la personne qui a vu disent de ses attributs, dans les memes mots, pour que le moteur d'arbitrage
// (facade/regles/reconciliation.ts) les compare. Rien n'est ecrit ici : un constat est une lecture, avec sa confiance et la
// regle qui l'a produite.
//
// `projet` n'est pas une source : c'est la valeur que le projet a aujourd'hui, et si une personne l'a choisie a la main (un veto).

import { formeDesCorps, formeDeLaVue } from '../../../model/formeToit.js';
import { textureDesMurs, materiauMurs } from '../../../model/couleurMur.js';
import { hauteurDe } from '../../../regles/decisions.js';
import { azimutFaitage, boutsDuCorps, plusGrand } from '../../../facade/regles/toits/faits.js';
import { observationDesSilhouettes } from '../../../facade/regles/toits/silhouettes.js';
import { libelleSilhouette } from '../../../model/silhouetteFacade.js';
import { materiauDesFacades } from '../../regles/sujets/facades.js';
import { couvertureDuVocabulaire } from '../../regles/sujets/couverture.js';
import { murs } from '../../regles/sujets/formeToit.js';
import { etiquetteFacade, type LigneBatiment } from './liste.js';
import { REGLES_LIDAR } from './reglesLidar.js';
import type { Constat, EtatProjet, ValeurConstat } from '../../../facade/regles/reconciliation.js';
import type { IdAttribut } from '../../../regles/reconciliation.js';
import type { IndiceProposition } from '../../../regles/decisions.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import type { CeQueJeVois } from '../../../model/ceQueJeVois.js';
import type { CorpsToit, ObjetPlan } from '../../../model/types.js';
import { cleMesure, type MesureFacade } from './mesures.js';

export const cibleBatiment = (cle: string): string => 'batiment:' + cle;
export const cibleFacade = (cle: string, cote: number): string => 'facade:' + cle + '#' + cote;

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
    if (forme) out.push({ cible, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(forme), confiance, regle: REGLES_LIDAR.lidar.corps });
    out.push({ cible, attribut: 'boutsToit', source: 'lidar', valeur: boutsDuCorps(c), confiance, regle: REGLES_LIDAR.lidar.bouts });
    out.push({ cible, attribut: 'sensFaitage', source: 'lidar', valeur: cm(azimutFaitage(c)), confiance, regle: REGLES_LIDAR.lidar.sens });
  }
  return out;
}

/** Les murs d'un batiment, lus sur ce qu'une source dit de leur silhouette. */
function bouts(o: ObjetPlan, b: LigneBatiment, lu: Parameters<typeof murs>[1]) {
  const plat = !!o.corpsToit?.length && formeDesCorps(o.corpsToit) === 'plat';
  return observationDesSilhouettes(murs(b, lu), plat);
}

/** Les constats que deduit le moteur des silhouettes (bouts, sens, forme) d'une source. */
function constatsDesSilhouettes(source: 'photo' | 'claude', cible: string, dits: ReturnType<typeof bouts>, confiance: number, regle: string, indices: readonly IndiceProposition[] = []): Constat[] {
  if (!dits) return [];
  const out: Constat[] = [];
  const { bouts: b, faitage, forme } = dits.observation;
  if (b) out.push({ cible, attribut: 'boutsToit', source, valeur: [...b], confiance, regle, indices });
  if (faitage?.par === 'azimut') out.push({ cible, attribut: 'sensFaitage', source, valeur: faitage.azimutDeg, confiance, regle, indices });
  const f = forme?.[0] ?? (b ? formeDesBouts(b) : null);
  if (f) out.push({ cible, attribut: 'formeToit', source, valeur: formeArbitree(f), confiance, regle, indices });
  return out;
}

/** Les constats de la photo de facade : la hauteur du mur, la silhouette de chaque mur et ce qu'elle dit du toit. */
function constatsPhoto({ o, b, mesures }: EntreesConstats): Constat[] {
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
  const confiance = Math.min(1, ...lues.filter((x) => x.m?.silhouette && x.m.silhouette !== 'indetermine').map((x) => (x.m?.confiance ?? 0.6) * (x.m?.coinsTrouves ? 1 : 0.8)));
  const dits = bouts(o, b, (f) => ({ silhouette: mesures.get(cleMesure(b.cle, f.cote))?.silhouette ?? 'indetermine' }));
  // La photo de chaque mur qui a parle, avec ce qu'elle y montre.
  const indices = (dits?.vus ?? []).flatMap((v) => {
    const f = b.facades.find((x) => 'façade ' + etiquetteFacade(b, x) === v.nom);
    const rang = f ? mesures.get(cleMesure(b.cle, f.cote))?.rangReleve : null;
    return f ? [{ texte: v.nom[0]?.toUpperCase() + v.nom.slice(1) + ' : ' + libelleSilhouette(v.silhouette) + ' → ' + v.dit, ...(rang != null ? { photo: { cle: b.cle, cote: f.cote, rang } } : {}) }] : [];
  });
  out.push(...constatsDesSilhouettes('photo', cible, dits, confiance, REGLES_LIDAR.photo.silhouette, indices));
  for (const { f, m } of lues) if (m?.silhouette && m.silhouette !== 'indetermine') out.push({ cible: cibleFacade(b.cle, f.cote), attribut: 'silhouetteFacade', source: 'photo', valeur: m.silhouette, confiance: (m.confiance ?? 0.6) * (m.coinsTrouves ? 1 : 0.8), regle: REGLES_LIDAR.photo.silhouette });
  return out;
}

/** Les constats de Claude : la forme et les bouts de l'ensemble, la silhouette de chaque mur et ce qu'elle dit du toit, les materiaux. */
function constatsClaude({ o, b, vote: v }: EntreesConstats): Constat[] {
  if (!v) return [];
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  if (v.forme.valeur !== 'indetermine') out.push({ cible, attribut: 'formeToit', source: 'claude', valeur: formeArbitree(v.forme.valeur), confiance: v.forme.accord, regle: 'forme du toit vue par Claude' });
  const g = v.boutGauche.valeur, d = v.boutDroit.valeur;
  if ((g === 'pignon' || g === 'croupe') && (d === 'pignon' || d === 'croupe')) out.push({ cible, attribut: 'boutsToit', source: 'claude', valeur: [g, d], confiance: Math.min(v.boutGauche.accord, v.boutDroit.accord), regle: 'bouts du faîtage vus par Claude' });
  const parMur = new Map(v.facades.map((f) => [f.facade, f]));
  const dits = bouts(o, b, (f) => { const m = parMur.get(etiquetteFacade(b, f)); return { silhouette: m?.silhouette.valeur ?? 'indetermine', bout: m?.bout.valeur ?? 'indetermine' }; });
  const confiance = Math.min(1, ...v.facades.flatMap((f) => (f.silhouette.valeur !== 'indetermine' || f.bout.valeur !== 'indetermine' ? [f.silhouette.accord, f.bout.accord] : [])));
  // Les murs disent les bouts et le sens mieux que la vue d'ensemble : leurs constats la remplacent.
  const deMurs = constatsDesSilhouettes('claude', cible, dits, confiance, REGLES_LIDAR.claude.silhouette).filter((c) => c.attribut !== 'formeToit' || !out.some((x) => x.attribut === 'formeToit'));
  for (const c of deMurs) { const k = out.findIndex((x) => x.attribut === c.attribut && x.source === c.source); if (k >= 0) out.splice(k, 1); out.push(c); }
  for (const f of v.facades) {
    const cote = b.facades.find((x) => etiquetteFacade(b, x) === f.facade)?.cote;
    if (cote !== undefined && f.silhouette.valeur !== 'indetermine') out.push({ cible: cibleFacade(b.cle, cote), attribut: 'silhouetteFacade', source: 'claude', valeur: f.silhouette.valeur, confiance: f.silhouette.accord, regle: REGLES_LIDAR.claude.silhouette, indices: f.silhouette.indices.map((i) => ({ texte: i.vu })) });
  }
  const m = materiauDesFacades(v);
  if (m) out.push({ cible, attribut: 'materiauMurs', source: 'claude', valeur: m.valeur, confiance: m.accord, regle: 'parement vu par Claude' });
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
  return out;
}

/** Ce que le projet a aujourd'hui de chaque attribut d'un batiment ; `choisi` : une personne l'a pose a la main (un veto). */
function etatDuProjet(o: ObjetPlan): (cible: string, attribut: IdAttribut) => EtatProjet {
  const c = principal(o.corpsToit);
  const vide: EtatProjet = { valeur: null, choisi: false };
  return (_cible, attribut) => {
    switch (attribut) {
      case 'hauteurEgout': return { valeur: cm(hauteurDe(o)), choisi: !o.bdtopo && typeof o.elevation === 'number' };
      case 'hauteurTotale': return { valeur: c ? cm(c.faitage) : o.toit ? cm(hauteurDe(o) + o.toit.hauteur) : null, choisi: false };
      case 'formeToit': { const f = formeDesCorps(o.corpsToit) ?? o.toit?.forme; return { valeur: f ? formeArbitree(f) : null, choisi: o.toit?.source === 'saisie' }; }
      case 'boutsToit': return { valeur: c ? boutsDuCorps(c) : null, choisi: false };
      case 'sensFaitage': return { valeur: c ? cm(azimutFaitage(c)) : null, choisi: false };
      case 'materiauMurs': return { valeur: textureDesMurs(o), choisi: !!o.couleurMurs?.materiau };
      case 'couverture': return { valeur: o.toit?.couverture ?? null, choisi: !!o.toit?.couverture };
      default: return vide;
    }
  };
}

/** Tous les constats d'un batiment, source par source, et l'etat du projet pour les comparer. */
export function constatsDuBatiment(e: EntreesConstats): ConstatsBatiment {
  return { constats: [...constatsIgn(e), ...constatsLidar(e), ...constatsPhoto(e), ...constatsClaude(e), ...constatsTerrain(e)], projet: etatDuProjet(e.o) };
}
