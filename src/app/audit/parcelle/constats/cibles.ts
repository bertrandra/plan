// Les cibles des constats de l audit, leurs entrees et les petites regles qu ils partagent.
// Un morceau de app/audit/parcelle/constats.ts, qui le reexporte : le reste du programme importe depuis lui.

import { plusGrand } from '../../../../facade/regles/toits/faits.js';
import { type LigneBatiment } from '../liste.js';
import { type Constat, type EtatProjet } from '../../../../facade/regles/reconciliation.js';
import type { IdAttribut } from '../../../../regles/reconciliation.js';
import type { VoteAnalyse } from '../../../../model/analyseClaude.js';
import { type CeQueJeVois } from '../../../../model/ceQueJeVois.js';
import type { CorpsToit, ObjetPlan } from '../../../../model/types.js';
import { ecrivainPeut } from '../../../../model/protections.js';
import { type MesureFacade } from '../mesures.js';
import type { AccordFacadeCapture } from '../../../../model/auditParcelle.js';
import type { RunEnregistre } from '../../../../regles/facades/observations.js';

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
export const BOUTS_VUS: Record<string, readonly string[]> = { pignons: ['pignon', 'pignon'], croupes: ['croupe', 'croupe'], 'pignon-croupe': ['pignon', 'croupe'] };

/** Le pan des lucarnes que dit Claude, dans les mots de « Ce que je vois ». */
export const PAN_CLAUDE: Record<string, 'rue' | 'jardin' | 'les-deux'> = { rue: 'rue', arriere: 'jardin', cote: 'rue', plusieurs: 'les-deux' };

export const cm = (v: number): number => Math.round(v * 100) / 100;

/**
 * Le toit de ce batiment est un choix de la personne : saisi dans l'inspecteur (`toit.source === 'saisie'`), ou fige en mode Toit
 * (`toitFige`, les « Règles » coupees ; aussi pose par une validation d'audit precedente). Une forme proposee par l'audit le
 * remplacerait : elle arrive decochee, et le dit.
 */
export const toitChoisiALaMain = (o: ObjetPlan): boolean => !ecrivainPeut(o, 'audit', 'toit');
/**
 * Le releve de ce mur est un choix de la personne (fait a la main, model/protections.ts, groupe `facades`) : la mesure de l'audit le
 * remplacerait, elle arrive decochee. Un releve pose par l'audit d'apres une photo, ou aucun, n'en est pas un.
 */
export const releveChoisiALaMain = (o: ObjetPlan, cote: number): boolean => !ecrivainPeut(o, 'audit', 'facades', { cote });
const borne = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
/** La confiance d'une lecture LiDAR d'un corps : son ecart a la mesure (m) ; 0 m, 0,95 ; 1,2 m et plus, 0,4. */
export const confianceCorps = (ecartM: number): number => cm(borne(0.95 - (0.55 * ecartM) / 1.2, 0.4, 0.95));

export const principal = (corps: readonly CorpsToit[] | null | undefined): CorpsToit | null => (corps?.length ? (corps[plusGrand(corps)] as CorpsToit) : null);

export interface EntreesConstats {
  o: ObjetPlan;
  b: LigneBatiment;
  mesures: ReadonlyMap<string, MesureFacade>;
  vu: CeQueJeVois;
  /** Le vote des passes de Claude pour ce batiment ; null sans analyse. */
  vote: VoteAnalyse | null;
  /** L'accord du run de chaque facade avec sa detection (ses ouvertures), par `cle#cote` ; absent sans analyse. */
  accords?: Record<string, AccordFacadeCapture> | null | undefined;
  /** Le run de chaque facade, par `cle#cote` (son toit lu, lot L2, compris) ; absent sans analyse. */
  runs?: Record<string, RunEnregistre> | null | undefined;
}

export interface ConstatsBatiment {
  constats: Constat[];
  /** Ce que le projet a aujourd'hui de cet attribut, pour cet objet. */
  projet(cible: string, attribut: IdAttribut): EtatProjet;
}

/** Les constats de l'IGN : la hauteur BD TOPO, le materiau des fichiers fonciers, et la forme de repli quand le toit n'a pas ete lu. */
