// Le moteur d'arbitrage des sources (MD/spec-reconciliation.md §3) : des constats d'un meme attribut d'un meme objet,
// venus de l'IGN, du LiDAR, d'une photo de facade, de Claude ou de la personne qui a vu, en une decision.
//
// Les constats qui s'accordent (a la tolerance de l'attribut) forment un groupe ; chacun vaut le poids de sa source (ou
// celui que l'attribut lui donne) fois sa confiance ; le groupe de plus haut score est retenu. La decision est
// **automatique** quand le score atteint `SCORE_AUTO_MIN`, l'emporte `MARGE_AUTO_MIN` fois sur le second, qu'aucune valeur
// choisie a la main ne s'y oppose et que le groupe n'a pas pour seule source une source qui n'a pas le droit d'etre seule ;
// sinon elle est **manuelle**, et dit pourquoi. Pour un attribut qui a des regles `prioritaires` (la silhouette des facades
// pour la forme du toit, ses bouts et le sens du faitage), seuls les groupes qui en portent une, ou ce qui a ete vu sur place,
// se disputent la decision : le LiDAR ne la retourne pas. Les poids, la tolerance et les seuils sont dans regles/reconciliation.json :
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
  /** Ce que la source dit en plus de la valeur arbitree (les souches vues, le releve de la facade) : le moteur n'y touche pas, la proposition l'ecrit. */
  charge?: unknown;
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

/**
 * `auto` : le moteur a decide seul ; `manuelle` : a la personne ; `rien` : rien a proposer ; `choisie` : la personne a retenu
 * l'une des sources ; `forcee` : elle a donne une valeur que nulle source ne disait.
 */
export type DecisionArbitrage = 'auto' | 'manuelle' | 'rien' | 'choisie' | 'forcee';

/** Ce que la personne decide d'un attribut : retenir le groupe de sources a cet index (l'ordre de `groupes`), ou forcer une valeur. */
export type ChoixArbitrage = { type: 'groupe'; index: number } | { type: 'force'; valeur: ValeurConstat };

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
export function arbitrer(constats: readonly Constat[], projet: EtatProjet, attribut: IdAttribut, cible: string, regles: ReglesReconciliation = RECONCILIATION, choix?: ChoixArbitrage): Arbitrage {
  const a = arbitrerSeul(constats, projet, attribut, cible, regles);
  return choix ? avecLeChoix(a, choix, regles) : a;
}

/** L'arbitrage du moteur, sans la main de la personne. */
function arbitrerSeul(constats: readonly Constat[], projet: EtatProjet, attribut: IdAttribut, cible: string, regles: ReglesReconciliation): Arbitrage {
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
  // Les regles prioritaires de l'attribut (la silhouette des facades pour le toit) : leurs groupes, et ce qui a ete vu sur place,
  // passent avant tout autre ; l'ordre des groupes, lui, ne change pas (un choix enregistre y renvoie par son rang).
  const prioritaire = (g: Groupe) => !!desc.prioritaires?.length && g.lignes.some((l) => l.constat.source === 'terrain' || (!!l.constat.regle && desc.prioritaires?.includes(l.constat.regle)));
  const enTete = groupes.filter(prioritaire);
  const candidats = enTete.length ? enTete : groupes;
  const retenu = candidats[0] ?? null;
  if (!retenu) return { ...base, retenu: null, decision: 'rien', raison: 'Aucune source ne se prononce sur cet attribut.' };
  const dit = (g: Groupe) => g.sources.map((s) => regles.sources[s].libelle).join(' et ') + ' : ' + direValeur(g.valeur, accord);
  const regleDe = (g: Groupe) => g.lignes.map((l) => l.constat.regle).filter((x): x is string => !!x);
  if (projet.valeur !== null && accorde(retenu.valeur, projet.valeur, accord)) {
    return { ...base, retenu, decision: 'rien', raison: 'Le projet a déjà cette valeur (' + dit(retenu) + ').', regles: regleDe(retenu) };
  }
  const second = candidats[1];
  const scoreMin = desc.scoreAutoMin ?? regles.seuils.SCORE_AUTO_MIN, margeMin = desc.margeAutoMin ?? regles.seuils.MARGE_AUTO_MIN;
  const seulNonSeul = retenu.sources.length === 1 && !regles.sources[retenu.sources[0] as SourceConstat].seule && !desc.seules?.includes(retenu.sources[0] as SourceConstat);
  const ecarts = groupes.map(dit).join(' ; ');
  const manuelle = (raison: string, seuils: string[]): Arbitrage => ({ ...base, retenu, decision: 'manuelle', raison, regles: [...seuils, ...regleDe(retenu)] });
  if (projet.choisi) return manuelle('Remplace une valeur que vous avez choisie (' + direValeur(projet.valeur, accord) + ') : ' + ecarts + '.', []);
  if (second && retenu.score < margeMin * second.score) return manuelle('Les sources se contredisent (' + fr(retenu.score) + ' contre ' + fr(second.score) + ', il faut ×' + fr(margeMin) + ') : ' + ecarts + '.', ['MARGE_AUTO_MIN']);
  if (seulNonSeul) return manuelle(regles.sources[retenu.sources[0] as SourceConstat].libelle + ' seul ne décide pas : ' + ecarts + '.', []);
  if (retenu.score < scoreMin) return manuelle('Score insuffisant (' + fr(retenu.score) + ' pour ' + fr(scoreMin) + ' requis) : ' + ecarts + '.', ['SCORE_AUTO_MIN']);
  const devant = enTete.length && groupes[0] !== retenu ? ' Elle l’emporte sur ' + dit(groupes[0] as Groupe) + ' : ' + (desc.prioriteDit ?? 'la silhouette des façades décide') + '.' : '';
  return { ...base, retenu, decision: 'auto', raison: (retenu.sources.length > 1 ? 'Les sources s’accordent' : 'Une seule source, sûre') + ' (score ' + fr(retenu.score) + ') : ' + dit(retenu) + '.' + devant, regles: ['SCORE_AUTO_MIN', ...(devant ? ['prioritaires'] : []), ...regleDe(retenu)] };
}

/**
 * La decision de la personne a la place de celle du moteur : le groupe qu'elle retient, ou la valeur qu'elle force (un groupe qui ne pese rien : sa seule
 * source est elle, et qui n'est pas dans `groupes`). Si cela redonne ce que le projet a deja, il n'y a rien a proposer.
 */
function avecLeChoix(a: Arbitrage, choix: ChoixArbitrage, regles: ReglesReconciliation): Arbitrage {
  const { accord } = regles.attributs[a.attribut];
  if (choix.type === 'groupe') {
    const g = a.groupes[choix.index];
    if (!g) return a;
    const inchange = a.projet.valeur !== null && accorde(g.valeur, a.projet.valeur, accord);
    return { ...a, retenu: g, decision: inchange ? 'rien' : 'choisie', raison: inchange ? 'Le projet a déjà cette valeur.' : 'Retenu par vous : ' + g.sources.map((s) => regles.sources[s].libelle).join(' et ') + ' : ' + direValeur(g.valeur, accord) + '.' };
  }
  const forcee: Groupe = { valeur: choix.valeur, lignes: [{ constat: { cible: a.cible, attribut: a.attribut, source: 'terrain', valeur: choix.valeur, confiance: 1, regle: 'valeur forcée' }, poids: 0, score: 0 }], score: 0, sources: ['terrain'] };
  const inchange = a.projet.valeur !== null && accorde(choix.valeur, a.projet.valeur, accord);
  return { ...a, retenu: forcee, decision: inchange ? 'rien' : 'forcee', raison: inchange ? 'Le projet a déjà cette valeur.' : 'Forcé par vous : ' + direValeur(choix.valeur, accord) + '.' };
}

/** Tous les arbitrages d'une liste de constats : un par (objet, attribut), dans l'ordre ou ils apparaissent. */
export function arbitrerTout(constats: readonly Constat[], projetDe: (cible: string, attribut: IdAttribut) => EtatProjet, regles: ReglesReconciliation = RECONCILIATION, choixDe?: (cible: string, attribut: IdAttribut) => ChoixArbitrage | undefined): Arbitrage[] {
  const cles = new Map<string, Constat[]>();
  for (const c of constats) { const k = c.cible + '|' + c.attribut; cles.set(k, [...(cles.get(k) ?? []), c]); }
  return [...cles.values()].map((cs) => { const [c] = cs as [Constat]; return arbitrer(cs, projetDe(c.cible, c.attribut), c.attribut, c.cible, regles, choixDe?.(c.cible, c.attribut)); });
}
