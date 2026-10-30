// Le garde-fou de la lecture des facades par Claude (MD/RELEASE.md §8.2 bis, skill facades §5 quater) : ce que la lecture savait faire en
// 5.1.0 ne se perd plus. Trois pieces, toutes ici, sans reseau ni cle :
//
// - `mesurerLecture` : la mesure d'un dossier de reponses du banc x1 / x3 (.claude/skills/facades/scripts/ia-x1-x3.ts), scene par scene
//   et au total, par le CHEMIN DE PRODUCTION (la reponse relue comme un run enregistre, le vote, les regles de facade/regles/facades/ia.ts
//   jusqu'a la facade proposee), et en plus de ce que le tableau du banc imprime : les baies par genre, les angles, le parement ;
// - `comparerLecture` : chaque ligne de qualite de la mesure contre la reference versionnee
//   (tests/fixtures/facades/lecture-5.1.0/reference.json). Une ligne sous la reference est une regression, sans tolerance : le bruit
//   d'un appel se traite par UNE relance (la regle ecrite au skill et a MD/RELEASE.md), pas par une marge cachee ici ;
// - `tableauLecture` : la table reference / mesure, en Markdown, pour le resume du workflow « Vérifier l'API Claude ».
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

export interface ReferenceLecture extends MesureLecture {
  source: { run: string; workflow: string; commit: string; version: string; date: string; note: string };
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

/** Une ligne de qualite sous la reference. */
export interface Regression { scene: string; mode: Mode | 'escalade'; ligne: string; reference: number | string; mesure: number | string }

/** Plus haut vaut mieux (au moins la reference) ou plus bas vaut mieux (au plus la reference). */
type Sens = 'haut' | 'bas';
const qualitesScene = (x: LigneLecture): [string, number, Sens][] => [
  ['passes illisibles', x.illisibles, 'bas'],
  ['baies retrouvées (rappel)', x.boites.vp, 'haut'],
  ['baies en trop (précision)', x.boites.fp, 'bas'],
  ...GENRES.map((g): [string, number, Sens] => ['genre ' + g + ' retrouvé', x.genres[g].justes, 'haut']),
  ['carreaux justes', x.carreaux.justes, 'haut'],
  ['angles justes', x.angles.justes, 'haut'],
  ['pointes justes', x.pointes.justes, 'haut'],
  ['pointes en plus', x.pointes.enPlus, 'bas'],
  ['parement juste', x.parement.juste, 'haut'],
];
const qualitesTotal = (t: TotalLecture): [string, number, Sens][] => [
  ['façades lues', t.lues, 'haut'],
  ['passes illisibles', t.illisibles, 'bas'],
  ['rappel des baies', t.boites.rappel ?? 0, 'haut'],
  ['précision des baies', t.boites.precision ?? 0, 'haut'],
  ...GENRES.map((g): [string, number, Sens] => ['genre ' + g + ' retrouvé', t.genres[g].justes, 'haut']),
  ['carreaux justes', t.carreaux.justes, 'haut'],
  ['angles justes', t.angles.justes, 'haut'],
  ['pointes justes', t.pointes.justes, 'haut'],
  ['pointes en plus', t.pointes.enPlus, 'bas'],
  ['parements justes', t.parements.justes, 'haut'],
];

function confronter(scene: string, mode: Mode, ref: [string, number, Sens][], mes: [string, number, Sens][] | null, out: Regression[]): void {
  ref.forEach(([nom, r, sens], i) => {
    const m = mes ? (mes[i] as [string, number, Sens])[1] : null;
    if (m === null) { out.push({ scene, mode, ligne: nom + ' (lecture illisible)', reference: r, mesure: 'illisible' }); return; }
    if (sens === 'haut' ? m < r : m > r) out.push({ scene, mode, ligne: nom, reference: r, mesure: m });
  });
}

/**
 * Chaque ligne de qualite de la mesure contre la reference, scene par scene et au total : la liste des lignes en dessous (vide : rien
 * n'a baisse). Aucune marge : une ligne a 5 quand la reference dit 6 est en dessous. Une scene de la reference absente de la mesure est
 * une regression (on ne mesure pas moins pour passer) ; une scene nouvelle n'a rien a battre.
 */
export function comparerLecture(ref: MesureLecture, mes: MesureLecture): Regression[] {
  const out: Regression[] = [];
  for (const [scene, modes] of Object.entries(ref.scenes)) {
    for (const m of MODES) {
      const r = modes[m];
      if (!r) continue;
      if (!mes.scenes[scene]) { out.push({ scene, mode: m, ligne: 'scène mesurée', reference: 'oui', mesure: 'absente' }); continue; }
      const x = mes.scenes[scene][m];
      confronter(scene, m, qualitesScene(r), x ? qualitesScene(x) : null, out);
    }
  }
  for (const m of MODES) confronter('Total', m, qualitesTotal(ref.totaux[m]), qualitesTotal(mes.totaux[m]), out);
  const re = ref.escalade, me = mes.escalade;
  if (re && me !== undefined) {
    if (!me) out.push({ scene: 'Escalade', mode: 'escalade', ligne: 'ligne du journal', reference: 'présente', mesure: 'absente' });
    else {
      if (re.acceptee && !me.acceptee) out.push({ scene: 'Escalade', mode: 'escalade', ligne: 'acceptée', reference: 'oui', mesure: 'non' });
      if (re.conforme && !me.conforme) out.push({ scene: 'Escalade', mode: 'escalade', ligne: 'sortie conforme', reference: 'oui', mesure: 'non' });
      if (me.angles < re.angles) out.push({ scene: 'Escalade', mode: 'escalade', ligne: 'angles lus', reference: re.angles, mesure: me.angles });
      if (re.parement !== 'indetermine' && me.parement === 'indetermine') out.push({ scene: 'Escalade', mode: 'escalade', ligne: 'parement lu', reference: re.parement, mesure: me.parement });
    }
  }
  return out;
}

const pc = (x: number | null) => (x === null ? '—' : (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + ' %');
const fr = (n: number | null, k = 5) => (n === null ? '—' : n.toFixed(k) + ' $');

/** Une cellule « reference → mesure », en gras quand la mesure est en dessous. */
function cellule(r: string, m: string | null, baisse: boolean): string {
  if (m === null) return r;
  if (r === m) return r;
  return baisse ? `**${r} → ${m}**` : `${r} → ${m}`;
}

/**
 * La table reference / mesure, en Markdown : une ligne par scene et par mode, puis les totaux, l'escalade et la liste des lignes en
 * dessous. Sans mesure, la reference seule (la table que le skill et MD/RELEASE.md citent).
 */
export function tableauLecture(ref: MesureLecture, mes: MesureLecture | null, regressions: readonly Regression[] = [], nouvelles: readonly Regression[] = []): string {
  const bas = (scene: string, mode: string, prefixe: string) => regressions.some((r) => r.scene === scene && r.mode === mode && r.ligne.startsWith(prefixe));
  const sortie = [
    mes ? '**Référence 5.1.0 → mesure** (une cellule « a → b » a changé ; en gras, elle est sous la référence).' : '**Référence 5.1.0** (run 40998593930).',
    '',
    '| Scène | Mode | Illisibles | Baies VP / vraies / trouvées | Genres justes (F, PF, P, G) | Carreaux justes / lus | Angles justes / lus | Pointes justes / attendues (+ en plus) | Parement (vrai : lu) | Proposée (seules / écartées) | Coût (info) |',
    '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ];
  const ligne = (x: LigneLecture | null) => x === null ? null : {
    ill: String(x.illisibles), baies: `${x.boites.vp} / ${x.boites.vraies} / ${x.boites.trouvees}`,
    genres: GENRES.map((g) => `${x.genres[g].justes}/${x.genres[g].vraies}`).join(', '), carreaux: `${x.carreaux.justes} / ${x.carreaux.lus}`,
    angles: `${x.angles.justes} / ${x.angles.lus}`, pointes: `${x.pointes.justes} / ${x.pointes.attendues}` + (x.pointes.enPlus ? ` (+${x.pointes.enPlus})` : ''),
    parement: `${x.parement.vrai} : ${x.parement.lu}`, proposee: `${x.proposee.seules} / ${x.proposee.ecartees}`, cout: fr(x.info.cout),
  };
  for (const [scene, modes] of Object.entries(ref.scenes)) {
    for (const m of MODES) {
      const r = ligne(modes[m]), x = mes ? ligne(mes.scenes[scene]?.[m] ?? null) : null;
      if (!r) { sortie.push(`| ${scene} | ${m} | illisible | | | | | | | | |`); continue; }
      const c = (k: keyof NonNullable<typeof r>, prefixe: string) => cellule(r[k], mes ? (x ? x[k] : 'illisible') : null, bas(scene, m, prefixe));
      sortie.push(`| ${scene} | ${m} | ${c('ill', 'passes illisibles')} | ${c('baies', 'baies')} | ${c('genres', 'genre')} | ${c('carreaux', 'carreaux')} | ${c('angles', 'angles')} | ${c('pointes', 'pointes')} | ${c('parement', 'parement')} | ${c('proposee', '§')} | ${c('cout', '§')} |`);
    }
  }
  const total = (t: TotalLecture) => ({
    lues: `${t.lues} / ${t.facades}`, ill: `${t.illisibles} / ${t.passes}`, rappel: pc(t.boites.rappel), precision: pc(t.boites.precision),
    genres: GENRES.map((g) => `${t.genres[g].justes}/${t.genres[g].vraies}`).join(', '), carreaux: `${t.carreaux.justes} / ${t.carreaux.lus}`,
    angles: `${t.angles.justes} / ${t.angles.lus}`, pointes: `${t.pointes.justes} / ${t.pointes.attendues}` + (t.pointes.enPlus ? ` (+${t.pointes.enPlus})` : ''),
    parements: `${t.parements.justes} / ${t.parements.sur}`, pose: pc(t.info.poseMediane), cout: `${fr(t.info.cout, 4)} (${fr(t.info.coutParFacade)} par façade)`,
  });
  sortie.push('', '| Total | Mode | Façades lues | Passes illisibles | Rappel | Précision | Genres justes (F, PF, P, G) | Carreaux justes / lus | Angles justes / lus | Pointes | Parements justes | Pose méd. (info) | Coût (info) |', '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const m of MODES) {
    const r = total(ref.totaux[m]), x = mes ? total(mes.totaux[m]) : null;
    const c = (k: keyof typeof r, prefixe: string) => cellule(r[k], x ? x[k] : null, bas('Total', m, prefixe));
    sortie.push(`| **Ensemble** | ${m} | ${c('lues', 'façades')} | ${c('ill', 'passes')} | ${c('rappel', 'rappel')} | ${c('precision', 'précision')} | ${c('genres', 'genre')} | ${c('carreaux', 'carreaux')} | ${c('angles', 'angles')} | ${c('pointes', 'pointes')} | ${c('parements', 'parements')} | ${c('pose', '§')} | ${c('cout', '§')} |`);
  }
  if (ref.escalade) {
    const e = (x: EscaladeLue | null | undefined) => (x ? `${x.acceptee ? 'acceptée' : 'refusée'}, ${x.conforme ? 'conforme' : 'non conforme'} ; ${x.angles} angle(s), ${x.pointes} pointe(s), parement ${x.parement}, ${x.ouvertures} ouverture(s) dont ${x.carreaux} aux carreaux lus ; ${x.modele ?? '?'}, ${fr(x.cout)}` : 'absente');
    sortie.push('', `**Escalade** (une requête du vérificateur, sans vérité) : référence ${e(ref.escalade)}` + (mes && mes.escalade !== undefined ? ` ; mesure ${e(mes.escalade)}.` : '.'));
  }
  if (mes) {
    sortie.push('', regressions.length
      ? `**${regressions.length} ligne(s) sous la référence** :\n\n` + regressions.map((r) => { const v = (x: number | string) => (typeof x === 'number' && r.ligne.endsWith('des baies') ? pc(x) : String(x)); return `- ${r.scene} ${r.mode} : ${r.ligne}, ${v(r.reference)} → ${v(r.mesure)}`; }).join('\n')
      : '**Aucune ligne de qualité sous la référence.**');
    if (nouvelles.length) {
      sortie.push('', `${nouvelles.length} ligne(s) en dessous à la relance seule, sur une scène relancée pour une autre ligne (le bruit d'un appel : pas sous la référence à la première mesure, donc pas une régression) :\n\n`
        + nouvelles.map((r) => `- ${r.scene} ${r.mode} : ${r.ligne}, ${r.reference} → ${r.mesure}`).join('\n'));
    }
  }
  return sortie.join('\n');
}

/**
 * La regle du bruit (skill facades §5 quater, MD/RELEASE.md §8.2 bis) : une ligne sous la reference a la premiere mesure est relancee
 * UNE fois ; elle est une regression si elle reste en dessous a la relance. `restees` : les lignes en dessous aux deux mesures (le job
 * finit rouge) ; `nouvelles` : celles qui ne baissent qu'a la relance, sur une scene relancee pour une autre ligne. Une ligne qui n'a
 * pas baisse a la premiere mesure n'a pas a etre relancee, et la relance ne la juge pas : elle est dite, a part, jamais tue.
 */
export function regressionsApresRelance(ref: MesureLecture, premiere: MesureLecture, relance: MesureLecture): { restees: Regression[]; nouvelles: Regression[] } {
  const cle = (r: Regression) => r.scene + '\u0000' + r.mode + '\u0000' + r.ligne;
  const avant = new Set(comparerLecture(ref, premiere).map(cle));
  const apres = comparerLecture(ref, remplacerScenes(premiere, relance));
  return { restees: apres.filter((r) => avant.has(cle(r))), nouvelles: apres.filter((r) => !avant.has(cle(r))) };
}

/** Les scenes ou une ligne a baisse (a relancer une fois) ; « Total » et l'escalade suivent leurs scenes. */
export const scenesARelancer = (regressions: readonly Regression[]): string[] => [...new Set(regressions.map((r) => r.scene).filter((s) => s !== 'Total' && s !== 'Escalade'))].sort();
