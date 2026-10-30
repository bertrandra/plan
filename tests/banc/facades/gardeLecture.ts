// Le garde-fou de la lecture des facades par Claude (MD/RELEASE.md §8.2 bis, skill facades §5 quater) : ce que la lecture savait faire en
// 5.1.0 ne se perd plus. Trois pieces, toutes ici, sans reseau ni cle :
//
// - `mesurerLecture` : la mesure d'un dossier de reponses du banc x1 / x3 (.claude/skills/facades/scripts/ia-x1-x3.ts), scene par scene
//   et au total, par le CHEMIN DE PRODUCTION (la reponse relue comme un run enregistre, le vote, les regles de facade/regles/facades/ia.ts
//   jusqu'a la facade proposee), et en plus de ce que le tableau du banc imprime : les baies par genre, les angles, le parement ;
// - `plancherDe` : le PLANCHER de chaque ligne de qualite, le pire de plusieurs mesures de main au meme code de lecture (decision du
//   proprietaire, 30 octobre 2026 : trois runs, 40998593930, 41012308826 et 41014104555). Une seule mesure prise pour reference faisait
//   rougir main une fois sur deux, et un garde-fou rouge une fois sur deux sur main ne protege rien ;
// - `comparerLecture` : chaque ligne jugee de la mesure contre le plancher (tests/fixtures/facades/lecture-5.1.0/reference.json), a la
//   granularite decidee : en x3, par scene les baies (retrouvees, en trop), les genres, les pointes et le parement, et au total toutes
//   les lignes (angles et carreaux au total SEULEMENT) ; en x1, au total seulement. Aucune marge en plus du plancher : le bruit d'un
//   appel se traite par UNE relance (regressionsApresRelance), la regle ecrite au skill et a MD/RELEASE.md ;
// - `tableauLecture` : la table plancher / mesure, en Markdown, pour le resume du workflow « Vérifier l'API Claude ».
//
// Le cout et les tokens sont dans la reference comme information : ils ne font jamais echouer.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireRunEnregistre, type ObservationsFacade } from '../../../src/regles/facades/observations.js';
import { accorderOuvertures, avisDesPointes, observationsDuRun, ouvertureDeLIa, surfaceDeLIa } from '../../../src/facade/regles/facades/ia.js';
import { juger } from '../../../src/facade/corpusReel.js';
import { VERSION_CHAINE_FACADES } from '../../../src/facade/releve/chaine.js';
import type { TypeOuverture } from '../../../src/model/types.js';
import { mesurerReponse, type CasIa } from './runIa.js';

/** Le dossier des reponses de reference (run 40998593930, 5.1.0) et la reference chiffree. */
export const DOSSIER_LECTURE_510 = fileURLToPath(new URL('../../fixtures/facades/lecture-5.1.0', import.meta.url));
export const FICHIER_REFERENCE_510 = join(DOSSIER_LECTURE_510, 'reference.json');
const DOSSIER_SCENES = fileURLToPath(new URL('../../fixtures/facades', import.meta.url));

export const MODES = ['x1', 'x3'] as const;
export type Mode = (typeof MODES)[number];
export const GENRES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

/**
 * Un angle du mur (gauche, droite) est juste quand son bord, son egout et son sol tombent a 2 % de la largeur du mur pres : la mesure
 * d'un bord juste du banc egout-sol (skill facades §2, « Un bord est juste a 2 % de la largeur du mur pres »). C'est la definition de
 * ce qu'on compte, pas une tolerance de la comparaison.
 */
export const ANGLE_JUSTE_PART = 0.02;

/** Ce que vaut la lecture d'une scene dans un mode : les lignes de qualite, puis l'information. */
export interface LigneLecture {
  passes: number;
  illisibles: number;
  boites: { vraies: number; trouvees: number; vp: number; fp: number };
  /** Par genre : les baies vraies de ce genre, et celles qu'une boite du meme genre retrouve. */
  genres: Record<TypeOuverture, { vraies: number; justes: number }>;
  carreaux: { lus: number; justes: number };
  angles: { lus: number; justes: number };
  pointes: { attendues: number; vues: number; justes: number; enPlus: number };
  parement: { vrai: string; lu: string; juste: number };
  /** La facade proposee par les regles sans detection (`accorderOuvertures`) : ses boites, seules (decochees) ou ecartees. */
  proposee: { boites: number; seules: number; ecartees: number };
  /** Information, jamais comparee : pose (pire bord, en part de la largeur), cotes mediane (cm), modele, versions, tokens, cout. */
  info: { pose: number | null; cotesCm: number | null; modele: string; prompt: number; schema: number; tokens: { entree: number; sortie: number }; cout: number | null };
}

/** Le total d'un mode, sur les facades lues. */
export interface TotalLecture {
  facades: number;
  lues: number;
  passes: number;
  illisibles: number;
  boites: { vraies: number; trouvees: number; vp: number; fp: number; rappel: number | null; precision: number | null };
  genres: Record<TypeOuverture, { vraies: number; justes: number }>;
  carreaux: { lus: number; justes: number };
  angles: { lus: number; justes: number };
  pointes: { attendues: number; vues: number; justes: number; enPlus: number };
  parements: { justes: number; sur: number };
  info: { poseMediane: number | null; cout: number; coutParFacade: number | null };
}

/** L'escalade, lue dans le journal du verificateur (une requete sur tests/fixtures/facades-ia/facade-test.jpg, sans verite). */
export interface EscaladeLue { acceptee: boolean; conforme: boolean; angles: number; pointes: number; parement: string; ouvertures: number; carreaux: number; modele: string | null; cout: number | null }

export interface MesureLecture {
  scenes: Record<string, Record<Mode, LigneLecture | null>>;
  totaux: Record<Mode, TotalLecture>;
  escalade?: EscaladeLue | null;
}

/** Une mesure de main gardee dans la reference : d'ou elle vient, et ce qu'elle a mesure (la premiere mesure du run, avant relance). */
export interface MesureDeReference {
  source: { run: string; commit: string; date: string; note: string };
  mesure: MesureLecture;
}

/** Les lignes jugees, par nom : leur plancher. */
export type Lignes = Record<string, number>;

/** Le plancher de chaque ligne jugee : le pire des mesures de reference. */
export interface Plancher {
  /** En x3, par scene (baies, genres, pointes, parement). */
  scenes: Record<string, Lignes>;
  /** Au total, par mode (x1 : toutes les lignes ; x3 : toutes, dont angles et carreaux, qui ne se jugent que la). */
  totaux: Record<Mode, Lignes>;
  /** L'escalade : acceptee et conforme (1 ou 0), angles lus, parement lu (1 ou 0). */
  escalade: Lignes | null;
}

export interface ReferenceLecture {
  source: { workflow: string; version: string; regle: string; rejeu: string };
  mesures: MesureDeReference[];
  plancher: Plancher;
}

/** Ce que le verificateur ecrit pour une scene (scripts/verifier-api-claude.mjs --facades). */
interface AppelBanc { modele: string; prompt: number; schema: number; sorties: unknown[]; tokens: { entree: number; sortie: number }; cout: number | null; passes?: number; illisibles?: number }
interface VeriteBanc { nom: string; image: { largeur: number; hauteur: number }; verite: CasIa['verite'] }

const vide = (): Record<TypeOuverture, { vraies: number; justes: number }> => ({ fenetre: { vraies: 0, justes: 0 }, 'porte-fenetre': { vraies: 0, justes: 0 }, porte: { vraies: 0, justes: 0 }, garage: { vraies: 0, justes: 0 } });

/** Le parement vrai d'une scene du corpus (tests/fixtures/facades/<scene>.json) ; « inconnu » hors du corpus. */
function parementVrai(nom: string): string {
  const f = join(DOSSIER_SCENES, nom + '.json');
  if (!existsSync(f)) return 'inconnu';
  const s = JSON.parse(readFileSync(f, 'utf8')) as { synthese?: { mur?: { parement?: { type?: string } } } };
  return s.synthese?.mur?.parement?.type ?? 'inconnu';
}

/** Les angles lus et justes d'une lecture, contre le mur vrai en pixels de l'image envoyee. */
function anglesDe(obs: ObservationsFacade, v: VeriteBanc): { lus: number; justes: number } {
  const { mur } = v.verite, W = v.image.largeur, H = v.image.hauteur, tol = ANGLE_JUSTE_PART * (mur.x1 - mur.x0);
  let lus = 0, justes = 0;
  for (const [a, x] of [[obs.calage.angles.gauche, mur.x0], [obs.calage.angles.droite, mur.x1]] as const) {
    if (!a) continue;
    lus++;
    if (Math.abs(a.x * W - x) <= tol && Math.abs(a.egout * H - mur.y0) <= tol && Math.abs(a.sol * H - mur.y1) <= tol) justes++;
  }
  return { lus, justes };
}

/** Les baies par genre : pour chaque genre, celles de la verite que retrouve une boite du meme genre (le jugement du banc). */
function genresDe(obs: ObservationsFacade, v: VeriteBanc): Record<TypeOuverture, { vraies: number; justes: number }> {
  const out = vide(), boites = obs.ouvertures.map((o) => ({ ...ouvertureDeLIa(o, v.verite.largeurM, v.verite.hauteurM), confiance: 1 }));
  for (const g of GENRES) {
    const vraies = v.verite.ouvertures.filter((o) => o.type === g);
    out[g] = { vraies: vraies.length, justes: vraies.length ? juger(vraies, boites.filter((b) => b.type === g)).vp : 0 };
  }
  return out;
}

/**
 * La lecture d'une scene dans un mode, par le chemin de production : les sorties relues comme un run enregistre (lireRunEnregistre),
 * le vote et les regles (observationsDuRun), la mesure du banc (mesurerReponse), puis la facade proposee sans detection
 * (accorderOuvertures), le parement (surfaceDeLIa) et les pointes (avisDesPointes). Null quand aucune passe ne se lit.
 */
export function lireScene(v: VeriteBanc, a: AppelBanc, parement: string): LigneLecture | null {
  const passes = a.passes ?? a.sorties.length;
  const run = lireRunEnregistre({ le: '2026-10-30T03:40:54Z', modele: a.modele, prompt: a.prompt, schema: a.schema, passes: Math.min(3, Math.max(1, a.sorties.length || 1)), sorties: a.sorties, cout: a.cout, tokens: a.tokens, image: v.image, chaine: VERSION_CHAINE_FACADES });
  const obs = run ? observationsDuRun(run) : null;
  if (!obs) return null;
  const lues = a.sorties.length;
  const cas: CasIa = { nom: v.nom, photos: [], image: { largeur: v.image.largeur, hauteur: v.image.hauteur, donnees: new Uint8ClampedArray(0) }, verite: v.verite };
  const m = mesurerReponse(cas, obs);
  const avis = avisDesPointes(obs, v.verite.pointes);
  const accord = accorderOuvertures({ ouvertures: [], decochees: [], observations: obs, cartes: null, largeurM: v.verite.largeurM, hauteurM: v.verite.hauteurM });
  const lu = surfaceDeLIa(obs)?.principale ?? 'indetermine';
  return {
    passes, illisibles: passes - lues,
    boites: { vraies: m.boites.vraies, trouvees: m.boites.trouvees, vp: m.boites.vp, fp: m.boites.trouvees - m.boites.vp },
    genres: genresDe(obs, v),
    carreaux: { lus: m.carreaux.lus, justes: m.carreaux.justes },
    angles: anglesDe(obs, v),
    pointes: { attendues: m.pointes.attendues, vues: m.pointes.vues, justes: m.pointes.justes, enPlus: avis.filter((p) => p.avis === 'en-plus').length },
    parement: { vrai: parement, lu, juste: lu === parement ? 1 : 0 },
    proposee: { boites: accord.bilan.boites, seules: accord.bilan.seules, ecartees: accord.bilan.ecartees },
    info: { pose: m.pose === null ? null : Math.round(m.pose * 10000) / 10000, cotesCm: m.boites.cotesCm, modele: a.modele, prompt: a.prompt, schema: a.schema, tokens: a.tokens, cout: a.cout },
  };
}

function totaliser(l: readonly { ligne: LigneLecture | null; cout: number; passes: number }[]): TotalLecture {
  const t: TotalLecture = {
    facades: l.length, lues: 0, passes: 0, illisibles: 0, boites: { vraies: 0, trouvees: 0, vp: 0, fp: 0, rappel: null, precision: null }, genres: vide(),
    carreaux: { lus: 0, justes: 0 }, angles: { lus: 0, justes: 0 }, pointes: { attendues: 0, vues: 0, justes: 0, enPlus: 0 }, parements: { justes: 0, sur: 0 },
    info: { poseMediane: null, cout: 0, coutParFacade: null },
  };
  const poses: number[] = [];
  for (const { ligne: x, cout, passes } of l) {
    t.info.cout += cout;
    t.passes += passes;
    if (!x) { t.illisibles += passes; continue; }
    t.lues++;
    t.illisibles += x.illisibles;
    for (const k of ['vraies', 'trouvees', 'vp', 'fp'] as const) t.boites[k] += x.boites[k];
    for (const g of GENRES) { t.genres[g].vraies += x.genres[g].vraies; t.genres[g].justes += x.genres[g].justes; }
    t.carreaux.lus += x.carreaux.lus; t.carreaux.justes += x.carreaux.justes;
    t.angles.lus += x.angles.lus; t.angles.justes += x.angles.justes;
    for (const k of ['attendues', 'vues', 'justes', 'enPlus'] as const) t.pointes[k] += x.pointes[k];
    t.parements.sur++; t.parements.justes += x.parement.juste;
    if (x.info.pose !== null) poses.push(x.info.pose);
  }
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  t.boites.rappel = t.boites.vraies ? r4(t.boites.vp / t.boites.vraies) : null;
  t.boites.precision = t.boites.trouvees ? r4(t.boites.vp / t.boites.trouvees) : null;
  poses.sort((a, b) => a - b);
  t.info.poseMediane = poses.length ? (poses[Math.floor(poses.length / 2)] as number) : null;
  t.info.cout = Math.round(t.info.cout * 1e6) / 1e6;
  t.info.coutParFacade = l.length ? Math.round((t.info.cout / l.length) * 1e6) / 1e6 : null;
  return t;
}

/** La mesure d'un dossier du banc (des <scene>.verite.json et <scene>.reponses.json), scene par scene et au total. */
export function mesurerLecture(dossier: string, journal: string | null = null): MesureLecture {
  const scenes: MesureLecture['scenes'] = {};
  const parMode: Record<Mode, { ligne: LigneLecture | null; cout: number; passes: number }[]> = { x1: [], x3: [] };
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.verite.json')).sort()) {
    const v = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as VeriteBanc;
    const fr = join(dossier, v.nom + '.reponses.json');
    if (!existsSync(fr)) continue;
    const r = JSON.parse(readFileSync(fr, 'utf8')) as Record<Mode, AppelBanc>;
    const parement = parementVrai(v.nom);
    scenes[v.nom] = { x1: null, x3: null };
    for (const m of MODES) {
      const ligne = lireScene(v, r[m], parement);
      (scenes[v.nom] as Record<Mode, LigneLecture | null>)[m] = ligne;
      parMode[m].push({ ligne, cout: r[m].cout ?? 0, passes: r[m].passes ?? r[m].sorties.length });
    }
  }
  return { scenes, totaux: { x1: totaliser(parMode.x1), x3: totaliser(parMode.x3) }, ...(journal !== null ? { escalade: lireEscalade(journal) } : {}) };
}

/** Une mesure dont certaines scenes ont ete relancees : les scenes de la relance remplacent celles de la premiere, les totaux se refont. */
export function remplacerScenes(premiere: MesureLecture, relance: MesureLecture): MesureLecture {
  const scenes = { ...premiere.scenes, ...relance.scenes };
  const parMode = (m: Mode) => Object.values(scenes).map((s) => ({ ligne: s[m], cout: s[m]?.info.cout ?? 0, passes: s[m]?.passes ?? 0 }));
  return { scenes, totaux: { x1: totaliser(parMode('x1')), x3: totaliser(parMode('x3')) }, ...(relance.escalade !== undefined ? { escalade: relance.escalade } : premiere.escalade !== undefined ? { escalade: premiere.escalade } : {}) };
}

/**
 * L'escalade dans le journal du verificateur : la ligne « - escalade d’une façade (modele ; …) : accepté, sortie conforme (n champs ;
 * a angle(s), p pointe(s), parement x, o ouverture(s) dont c aux carreaux lus … ; coût journalisé d $ ». Null sans ligne d'escalade.
 */
export function lireEscalade(journal: string): EscaladeLue | null {
  const l = journal.split('\n').map((x) => x.replace(/^\S+Z\s/, '')).find((x) => x.startsWith('- escalade d’une façade'));
  if (!l) return null;
  const n = (re: RegExp) => { const k = re.exec(l); return k ? Number(k[1]) : 0; };
  const cout = /coût journalisé ([\d.]+) \$/.exec(l);
  return {
    acceptee: l.includes('accepté'), conforme: l.includes('sortie conforme'),
    angles: n(/(\d+) angle\(s\)/), pointes: n(/(\d+) pointe\(s\)/), parement: /parement ([\w-]+)/.exec(l)?.[1] ?? 'indetermine',
    ouvertures: n(/(\d+) ouverture\(s\)/), carreaux: n(/dont (\d+) aux carreaux lus/), modele: /^- escalade d’une façade \(([^ ;]+)/.exec(l)?.[1] ?? null, cout: cout ? Number(cout[1]) : null,
  };
}

/** Une ligne jugee sous le plancher. */
export interface Regression { scene: string; mode: Mode | 'escalade'; ligne: string; reference: number | string; mesure: number | string }

/** Plus haut vaut mieux (au moins le plancher) ou plus bas vaut mieux (au plus le plancher). */
type Sens = 'haut' | 'bas';
const BAS = new Set(['baies en trop (précision)', 'pointes en plus', 'passes illisibles']);
const sens = (nom: string): Sens => (BAS.has(nom) ? 'bas' : 'haut');

/** Les lignes jugees d'une scene en x3 : baies retrouvees et en trop, genres, pointes, parement (angles et carreaux : au total seulement). */
export function lignesScene(x: LigneLecture | null): Lignes {
  const l: Lignes = {
    'baies retrouvées (rappel)': x?.boites.vp ?? 0,
    'baies en trop (précision)': x?.boites.fp ?? 0,
  };
  for (const g of GENRES) l['genre ' + g + ' retrouvé'] = x?.genres[g].justes ?? 0;
  l['pointes justes'] = x?.pointes.justes ?? 0;
  l['pointes en plus'] = x?.pointes.enPlus ?? 0;
  l['parement juste'] = x?.parement.juste ?? 0;
  return l;
}

/** Les lignes jugees d'un total (x1 et x3) : toutes les lignes de qualite. */
export function lignesTotal(t: TotalLecture): Lignes {
  const l: Lignes = {
    'façades lues': t.lues,
    'passes illisibles': t.illisibles,
    'rappel des baies': t.boites.rappel ?? 0,
    'précision des baies': t.boites.precision ?? 0,
  };
  for (const g of GENRES) l['genre ' + g + ' retrouvé'] = t.genres[g].justes;
  l['carreaux justes'] = t.carreaux.justes;
  l['angles justes'] = t.angles.justes;
  l['pointes justes'] = t.pointes.justes;
  l['pointes en plus'] = t.pointes.enPlus;
  l['parements justes'] = t.parements.justes;
  return l;
}

const lignesEscalade = (e: EscaladeLue | null | undefined): Lignes | null =>
  e ? { 'acceptée et conforme': e.acceptee && e.conforme ? 1 : 0, 'angles lus': e.angles, 'parement lu': e.parement === 'indetermine' ? 0 : 1 } : null;

/** Le pire de plusieurs jeux de lignes : le plus bas pour une ligne ou plus haut vaut mieux, le plus haut sinon. */
function pire(jeux: readonly Lignes[]): Lignes {
  const out: Lignes = {};
  for (const j of jeux) for (const [k, v] of Object.entries(j)) {
    const o = out[k];
    out[k] = o === undefined ? v : sens(k) === 'haut' ? Math.min(o, v) : Math.max(o, v);
  }
  return out;
}

/**
 * Le plancher : chaque ligne jugee au pire des mesures de main (le meme code de lecture). Une scene absente d'une mesure n'y compte pas
 * (elle n'a rien mesure) ; une scene illisible y compte pour zero.
 */
export function plancherDe(mesures: readonly MesureLecture[]): Plancher {
  const scenes = [...new Set(mesures.flatMap((m) => Object.keys(m.scenes)))].sort();
  const escalades = mesures.map((m) => lignesEscalade(m.escalade)).filter((e): e is Lignes => e !== null);
  return {
    scenes: Object.fromEntries(scenes.map((s) => [s, pire(mesures.filter((m) => m.scenes[s]).map((m) => lignesScene(m.scenes[s]?.x3 ?? null)))])),
    totaux: { x1: pire(mesures.map((m) => lignesTotal(m.totaux.x1))), x3: pire(mesures.map((m) => lignesTotal(m.totaux.x3))) },
    escalade: escalades.length ? pire(escalades) : null,
  };
}

function confronter(scene: string, mode: Mode | 'escalade', plancher: Lignes, mes: Lignes | null, out: Regression[]): void {
  for (const [nom, p] of Object.entries(plancher)) {
    const m = mes ? mes[nom] : undefined;
    if (m === undefined) { out.push({ scene, mode, ligne: nom + (mes ? ' (absente)' : ' (lecture illisible)'), reference: p, mesure: mes ? 'absente' : 'illisible' }); continue; }
    if (sens(nom) === 'haut' ? m < p : m > p) out.push({ scene, mode, ligne: nom, reference: p, mesure: m });
  }
}

/**
 * Chaque ligne jugee de la mesure contre le plancher : la liste des lignes en dessous (vide : rien n'a baisse). Aucune marge en plus du
 * plancher. Une scene du plancher absente de la mesure est une regression (on ne mesure pas moins pour passer) ; une scene nouvelle n'a
 * rien a battre. L'escalade n'est jugee que si la mesure a lu un journal.
 */
export function comparerLecture(plancher: Plancher, mes: MesureLecture): Regression[] {
  const out: Regression[] = [];
  for (const [scene, lignes] of Object.entries(plancher.scenes)) {
    if (!mes.scenes[scene]) { out.push({ scene, mode: 'x3', ligne: 'scène mesurée', reference: 'oui', mesure: 'absente' }); continue; }
    const x = mes.scenes[scene].x3;
    confronter(scene, 'x3', lignes, x ? lignesScene(x) : null, out);
  }
  for (const m of MODES) confronter('Total', m, plancher.totaux[m], lignesTotal(mes.totaux[m]), out);
  if (plancher.escalade && mes.escalade !== undefined) {
    const e = lignesEscalade(mes.escalade);
    if (!e) out.push({ scene: 'Escalade', mode: 'escalade', ligne: 'ligne du journal', reference: 'présente', mesure: 'absente' });
    else confronter('Escalade', 'escalade', plancher.escalade, e, out);
  }
  return out;
}

const pc = (x: number | null) => (x === null ? '—' : (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + ' %');
const fr = (n: number | null, k = 5) => (n === null ? '—' : n.toFixed(k) + ' $');
const valeur = (nom: string, v: number | string) => (typeof v === 'number' && nom.endsWith('des baies') ? pc(v) : String(v));

/** Une cellule « plancher → mesure », en gras quand la mesure est sous le plancher. */
function cellule(p: string, m: string | null, baisse: boolean): string {
  if (m === null || p === m) return p;
  return baisse ? `**${p} → ${m}**` : `${p} → ${m}`;
}

/**
 * La table plancher / mesure, en Markdown : les lignes jugees en x3 par scene, puis les totaux x1 et x3, l'escalade, la liste des
 * lignes sous le plancher et, apres une relance, celles qui ne baissent qu'a la relance. Sans mesure, le plancher seul.
 */
export function tableauLecture(plancher: Plancher, mes: MesureLecture | null, regressions: readonly Regression[] = [], nouvelles: readonly Regression[] = []): string {
  const bas = (scene: string, mode: string, nom: string) => regressions.some((r) => r.scene === scene && r.mode === mode && r.ligne === nom);
  const sortie = [
    mes ? '**Plancher → mesure** (le plancher : le pire de trois mesures de main ; une cellule « a → b » a changé, en gras elle est sous le plancher).' : '**Planchers** (le pire des runs 40998593930, 41012308826 et 41014104555 de main).',
    '',
    '**x3, par scène** (angles et carreaux : au total seulement)',
    '',
    '| Scène | Baies retrouvées | Baies en trop | Genres (F, PF, P, G) | Pointes justes | Pointes en plus | Parement juste |',
    '|---|--:|--:|--:|--:|--:|--:|',
  ];
  for (const [scene, p] of Object.entries(plancher.scenes)) {
    const x = mes ? (mes.scenes[scene] ? lignesScene(mes.scenes[scene].x3 ?? null) : null) : null;
    const c = (nom: string) => cellule(String(p[nom]), mes ? (x ? String(x[nom]) : 'absente') : null, bas(scene, 'x3', nom));
    const genres = GENRES.map((g) => c('genre ' + g + ' retrouvé')).join(', ');
    sortie.push(`| ${scene} | ${c('baies retrouvées (rappel)')} | ${c('baies en trop (précision)')} | ${genres} | ${c('pointes justes')} | ${c('pointes en plus')} | ${c('parement juste')} |`);
  }
  sortie.push('', '**Totaux** (x1 : au total seulement)', '', '| Ligne | x1 | x3 |', '|---|--:|--:|');
  for (const nom of Object.keys(plancher.totaux.x3)) {
    const c = (m: Mode) => {
      const p = plancher.totaux[m][nom];
      if (p === undefined) return '—';
      const x = mes ? lignesTotal(mes.totaux[m])[nom] : undefined;
      return cellule(valeur(nom, p), x === undefined ? null : valeur(nom, x), bas('Total', m, nom));
    };
    sortie.push(`| ${nom} | ${c('x1')} | ${c('x3')} |`);
  }
  if (mes) {
    const t = (m: Mode) => `${fr(mes.totaux[m].info.cout, 4)} (${fr(mes.totaux[m].info.coutParFacade)} par façade), pose méd. ${pc(mes.totaux[m].info.poseMediane)}`;
    sortie.push('', `Information (jamais jugée) : x1 ${t('x1')} ; x3 ${t('x3')}.`);
  }
  if (plancher.escalade) {
    const e = mes?.escalade;
    sortie.push('', `**Escalade** (une requête du vérificateur, sans vérité) : plancher ${Object.entries(plancher.escalade).map(([k, v]) => k + ' ' + v).join(', ')}`
      + (e === undefined ? '.' : e ? ` ; mesure ${e.acceptee ? 'acceptée' : 'refusée'}, ${e.conforme ? 'conforme' : 'non conforme'}, ${e.angles} angle(s), ${e.pointes} pointe(s), parement ${e.parement}, ${e.ouvertures} ouverture(s) dont ${e.carreaux} aux carreaux lus, ${fr(e.cout)}.` : ' ; mesure absente.'));
  }
  if (mes) {
    const liste = (l: readonly Regression[]) => l.map((r) => `- ${r.scene} ${r.mode} : ${r.ligne}, ${valeur(r.ligne, r.reference)} → ${valeur(r.ligne, r.mesure)}`).join('\n');
    sortie.push('', regressions.length ? `**${regressions.length} ligne(s) sous le plancher** :\n\n` + liste(regressions) : '**Aucune ligne jugée sous le plancher.**');
    if (nouvelles.length) sortie.push('', `${nouvelles.length} ligne(s) sous le plancher à la relance seule, sur une scène relancée pour une autre ligne (pas sous le plancher à la première mesure, donc pas une régression) :\n\n` + liste(nouvelles));
  }
  return sortie.join('\n');
}

/**
 * La regle du bruit (skill facades §5 quater, MD/RELEASE.md §8.2 bis) : une ligne sous le plancher a la premiere mesure est relancee
 * UNE fois ; elle est une regression si elle reste sous le plancher a la relance. `restees` : les lignes en dessous aux deux mesures
 * (le job finit rouge) ; `nouvelles` : celles qui ne baissent qu'a la relance, dites a part, jamais tues.
 */
export function regressionsApresRelance(plancher: Plancher, premiere: MesureLecture, relance: MesureLecture): { restees: Regression[]; nouvelles: Regression[] } {
  const cle = (r: Regression) => r.scene + '\u0000' + r.mode + '\u0000' + r.ligne;
  const avant = new Set(comparerLecture(plancher, premiere).map(cle));
  const apres = comparerLecture(plancher, remplacerScenes(premiere, relance));
  return { restees: apres.filter((r) => avant.has(cle(r))), nouvelles: apres.filter((r) => !avant.has(cle(r))) };
}

/**
 * Les scenes a relancer une fois : celles d'une ligne de scene sous le plancher ; toutes des qu'un total est en dessous (x1, et les
 * angles et carreaux x3, ne se jugent qu'au total : seule une mesure entiere peut le rattraper).
 */
export function scenesARelancer(regressions: readonly Regression[], toutes: readonly string[]): string[] {
  if (regressions.some((r) => r.scene === 'Total')) return [...toutes].sort();
  return [...new Set(regressions.map((r) => r.scene).filter((s) => s !== 'Escalade'))].sort();
}
