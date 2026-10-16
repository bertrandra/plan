// Le moteur d'arbitrage des sources (MD/spec-reconciliation.md §3) : des constats d'un meme attribut d'un meme objet,
// venus de l'IGN, du LiDAR, d'une photo de facade, de Claude ou de la personne qui a vu, en une decision.
//
// Les constats qui s'accordent (a la tolerance de l'attribut) forment un groupe ; chacun vaut le poids de sa source (ou
// celui que l'attribut lui donne) fois sa confiance ; le groupe de plus haut score est retenu. La decision est
// **automatique** quand le score atteint `SCORE_AUTO_MIN`, l'emporte `MARGE_AUTO_MIN` fois sur le second, qu'aucune valeur
// choisie a la main ne s'y oppose et que le groupe n'a pas pour seule source une source qui n'a pas le droit d'etre seule ;
// sinon elle est **manuelle**, et dit pourquoi. Les poids, la tolerance et les seuils sont dans regles/reconciliation.json :
// ce module ne porte aucun nombre.
//
// Pur : ni projet, ni reseau. Il ne propose rien a lui seul : l'audit en fait des propositions (app/audit/parcelle).

import { RECONCILIATION, SOURCES, type Accord, type IdAttribut, type ReglesReconciliation, type SourceConstat } from '../../regles/reconciliation.js';
import type { IndiceProposition } from '../../regles/decisions.js';

/** Une valeur d'attribut : une cote ou un angle, un mot du vocabulaire, ou un ensemble de mots (les bouts d'un faitage). */
export type ValeurConstat = number | string | readonly string[];

/** Une source dit une valeur d'un attribut d'un objet. */
export interface Constat {
  /** L'objet : `batiment:<cle>`, `facade:<cle>#<cote>`, `parcelle`. */
  cible: string;
  attribut: IdAttribut;
  source: SourceConstat;
  valeur: ValeurConstat;
  /** De 0 a 1 ; null quand la source ne la donne pas. */
  confiance: number | null;
  /** La regle qui l'a produit (un seuil de regles/toits/reglages.json, une ligne de regles/toits/silhouettes.json...). */
  regle?: string;
  indices?: readonly IndiceProposition[];
}

/** Ce que le projet a aujourd'hui de cet attribut : l'avant, et si une personne l'a choisi a la main (un veto). */
export interface EtatProjet { valeur: ValeurConstat | null; choisi: boolean }

export interface LigneConstat { constat: Constat; poids: number; score: number }
export interface Groupe {
  /** La valeur du groupe : la moyenne ponderee de ses cotes, ou la valeur du constat qui pese le plus. */
  valeur: ValeurConstat;
  lignes: LigneConstat[];
  score: number;
  sources: SourceConstat[];
}

export type DecisionArbitrage = 'auto' | 'manuelle' | 'rien';

export interface Arbitrage {
  cible: string;
  attribut: IdAttribut;
  groupes: Groupe[];
  retenu: Groupe | null;
  projet: EtatProjet;
  decision: DecisionArbitrage;
  /** En une phrase : pourquoi la decision est ce qu'elle est (elle se lit sur la ligne de proposition). */
  raison: string;
  /** Les seuils et les regles qui ont decide : `SCORE_AUTO_MIN`, `MARGE_AUTO_MIN`, la regle LiDAR d'un constat... */
  regles: string[];
}

const cm = (v: number): number => Math.round(v * 100) / 100;
const fr = (v: number): string => String(cm(v)).replace('.', ',');
const ecart180 = (a: number, b: number): number => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/** Deux valeurs s'accordent-elles ? */
export function accorde(a: ValeurConstat, b: ValeurConstat, accord: Accord): boolean {
  if (accord.type === 'nombre') return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= accord.tolerance + 1e-9;
  if (accord.type === 'angle') return typeof a === 'number' && typeof b === 'number' && ecart180(a, b) <= accord.tolerance + 1e-9;
  if (accord.type === 'ensemble') return Array.isArray(a) && Array.isArray(b) && [...(a as string[])].sort().join('|') === [...(b as string[])].sort().join('|');
  return a === b;
}

/** Une valeur, dite en clair : « 6,2 m », « 74° », « pignon + croupe », « deux pans ». */
export function direValeur(v: ValeurConstat | null, accord: Accord, libelle?: (mot: string) => string): string {
  if (v === null) return 'non renseigné';
  if (typeof v === 'number') return accord.type === 'angle' ? Math.round(v) + '°' : fr(v) + ' ' + ('unite' in accord ? accord.unite : '').trim();
  if (typeof v === 'string') return libelle ? libelle(v) : v;
  return v.map((m) => (libelle ? libelle(m) : m)).join(' + ');
}

function moyenne(lignes: readonly LigneConstat[], accord: Accord): ValeurConstat {
  const premier = lignes[0] as LigneConstat;
  if (accord.type === 'nombre') {
    const poids = lignes.reduce((s, l) => s + l.score, 0);
    return poids > 0 ? cm(lignes.reduce((s, l) => s + (l.constat.valeur as number) * l.score, 0) / poids) : (premier.constat.valeur as number);
  }
  return premier.constat.valeur;
}

/**
 * Arbitre les constats d'un attribut d'un objet. Une source qui parle deux fois ne compte que par son constat qui pese le
 * plus (elle ne s'aide pas elle-meme).
 */
export function arbitrer(constats: readonly Constat[], projet: EtatProjet, attribut: IdAttribut, cible: string, regles: ReglesReconciliation = RECONCILIATION): Arbitrage {
  const desc = regles.attributs[attribut];
  const { accord } = desc;
  const poidsDe = (s: SourceConstat): number => desc.poids[s] ?? regles.sources[s].poids;
  const lignes: LigneConstat[] = constats.map((constat) => {
    const poids = poidsDe(constat.source);
    return { constat, poids, score: poids * (constat.confiance ?? regles.seuils.CONFIANCE_ABSENTE) };
  });
  // Une source, un constat : le plus lourd.
  const parSource = new Map<SourceConstat, LigneConstat>();
  for (const l of lignes) { const v = parSource.get(l.constat.source); if (!v || l.score > v.score) parSource.set(l.constat.source, l); }
  const uniques = [...parSource.values()].filter((l) => l.score > 0).sort((a, b) => b.score - a.score);
  const groupes: Groupe[] = [];
  for (const l of uniques) {
    const g = groupes.find((x) => accorde((x.lignes[0] as LigneConstat).constat.valeur, l.constat.valeur, accord));
    if (g) g.lignes.push(l); else groupes.push({ valeur: l.constat.valeur, lignes: [l], score: 0, sources: [] });
  }
  for (const g of groupes) { g.score = g.lignes.reduce((s, l) => s + l.score, 0); g.valeur = moyenne(g.lignes, accord); g.sources = SOURCES.filter((s) => g.lignes.some((l) => l.constat.source === s)); }
  groupes.sort((a, b) => b.score - a.score);
  const base = { cible, attribut, groupes, projet, regles: [] as string[] };
  const retenu = groupes[0] ?? null;
  if (!retenu) return { ...base, retenu: null, decision: 'rien', raison: 'Aucune source ne dit rien de cet attribut.' };
  const dit = (g: Groupe) => g.sources.map((s) => regles.sources[s].libelle).join(' et ') + ' : ' + direValeur(g.valeur, accord);
  const regleDe = (g: Groupe) => g.lignes.map((l) => l.constat.regle).filter((x): x is string => !!x);
  if (projet.valeur !== null && accorde(retenu.valeur, projet.valeur, accord)) {
    return { ...base, retenu, decision: 'rien', raison: 'Le projet a déjà cette valeur (' + dit(retenu) + ').', regles: regleDe(retenu) };
  }
  const second = groupes[1];
  const scoreMin = desc.scoreAutoMin ?? regles.seuils.SCORE_AUTO_MIN, margeMin = desc.margeAutoMin ?? regles.seuils.MARGE_AUTO_MIN;
  const seulNonSeul = retenu.sources.length === 1 && !regles.sources[retenu.sources[0] as SourceConstat].seule;
  const ecarts = groupes.map(dit).join(' ; ');
  const manuelle = (raison: string, seuils: string[]): Arbitrage => ({ ...base, retenu, decision: 'manuelle', raison, regles: [...seuils, ...regleDe(retenu)] });
  if (projet.choisi) return manuelle('Remplace une valeur que vous avez choisie (' + direValeur(projet.valeur, accord) + ') : ' + ecarts + '.', []);
  if (second && retenu.score < margeMin * second.score) return manuelle('Les sources se contredisent (' + fr(retenu.score) + ' contre ' + fr(second.score) + ', il faut ×' + fr(margeMin) + ') : ' + ecarts + '.', ['MARGE_AUTO_MIN']);
  if (seulNonSeul) return manuelle(regles.sources[retenu.sources[0] as SourceConstat].libelle + ' seul ne décide pas : ' + ecarts + '.', []);
  if (retenu.score < scoreMin) return manuelle('Score insuffisant (' + fr(retenu.score) + ' pour ' + fr(scoreMin) + ' requis) : ' + ecarts + '.', ['SCORE_AUTO_MIN']);
  return { ...base, retenu, decision: 'auto', raison: (retenu.sources.length > 1 ? 'Les sources s’accordent' : 'Une seule source, sûre') + ' (score ' + fr(retenu.score) + ') : ' + dit(retenu) + '.', regles: ['SCORE_AUTO_MIN', ...regleDe(retenu)] };
}

/** Tous les arbitrages d'une liste de constats : un par (objet, attribut), dans l'ordre ou ils apparaissent. */
export function arbitrerTout(constats: readonly Constat[], projetDe: (cible: string, attribut: IdAttribut) => EtatProjet, regles: ReglesReconciliation = RECONCILIATION): Arbitrage[] {
  const cles = new Map<string, Constat[]>();
  for (const c of constats) { const k = c.cible + '|' + c.attribut; cles.set(k, [...(cles.get(k) ?? []), c]); }
  return [...cles.values()].map((cs) => { const [c] = cs as [Constat]; return arbitrer(cs, projetDe(c.cible, c.attribut), c.attribut, c.cible, regles); });
}
