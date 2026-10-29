// Le corpus de facades REELLES (photos prises sur place, ouvertures annotees) et la calibration de la detection qui en decoule.
//
// Le banc de synthese (tests/fixtures/facades) est ecrit et regle par la meme equipe que le code qu'il mesure ; seul un corpus
// de photos reelles dit si la detection est juste. Ici : le format d'un cas, le jugement des baies (vraie / fausse), la
// FIABILITE de la confiance (une confiance de 0,8 doit valoir 80 % de baies justes), et la calibration : on cherche, parmi les
// reglages nommes de la detection, ceux qui font mieux sur les cas valides, sans refaire le redressement (calcule une fois).
//
// Un cas = un mur : une ou plusieurs photos, leurs quatre coins, la largeur et la hauteur reelles, les ouvertures de la verite.
// `statut: 'brouillon'` : pas encore relu ; seul un cas `valide` (verifie sur la photo par une personne) compte.

import { lireGabarit } from './gabaritMur.js';
import { detecterFacade, type OuvertureDetectee } from './detection/detection.js';
import type { ResultatAnalyse } from './analyse.js';
import type { AssemblageDuMur } from './analyseMur.js';
import type { ResultatFusion } from './fusion.js';
import { REGLAGES_DETECTION } from './regles/facades/detection.js';
import { REGLAGES_STRUCTURE } from './regles/facades/structure.js';
import { recouvrement } from './detection/voteVues.js';
import type { Image, P2 } from './vision/homographie.js';
import type { FormeToitSimple, PignonToit, PtBrut, TypeOuverture } from '../model/types.js';

export const FORMAT_CAS_REEL = 'plan-facade-reelle';

export interface OuvertureVraie { type: TypeOuverture; x: number; y: number; l: number; h: number }
export interface PhotoReelle {
  /** Le fichier image, a cote du JSON (corpus du depot), ou la cle de la photo (serveur). */
  fichier: string;
  /** Haut gauche, haut droit, bas droit, bas gauche, en pixels de la photo. */
  coins: P2[];
  /**
   * Quatre reperes poses a la main (un rectangle du mur, n'importe lequel) qui redressent la photo entiere ; les coins du mur se
   * cherchent ensuite sur l'assemblage (facade/releve/coinsAuto.ts). Absents : la photo se redresse par ses points de fuite.
   */
  reperes?: P2[];
  /** Un ancien cas : la silhouette du haut du mur ajustee a la main, en pixels de la photo. Relue, plus ecrite : le gabarit du cas la remplace. */
  silhouette?: P2[];
  /** Les `coins` ont ete poses (ou le mur ajuste) a la main : ils l'emportent sur ceux que la chaine trouverait, et se reportent. */
  murALaMain?: boolean;
  focalePx?: number | null;
}
export interface CasReel {
  format: typeof FORMAT_CAS_REEL;
  version: 1;
  nom: string;
  statut: 'brouillon' | 'valide';
  /** D'ou vient le cas (fichier d'audit, batiment, cote, ou « admin ») ; libre. */
  source?: string;
  largeurM: number;
  hauteurM: number;
  photos: PhotoReelle[];
  /** Les ouvertures de la verite, en metres (x depuis la gauche, y depuis le sol). */
  ouvertures: OuvertureVraie[];
  /** Ce que la facade a de difficile : haie, voiture, ton sur ton, reflets… (pour lire les resultats par cause). */
  difficultes?: string[];
  /**
   * Le gabarit du mur (facade/gabaritMur.ts) : la silhouette que donnent le plan et le LiDAR, importee d'un audit. Sa forme ne bouge
   * pas, elle se pose sur chaque photo par ses coins. Absent : un rectangle.
   */
  gabarit?: { u: number; v: number }[];
  /** Le mur vrai sur l'assemblage des photos, pose a la main : la verite de l'etape du calage (E4). */
  calageVrai?: CalageVrai;
  /** La vraie forme du toit, corps par corps, relue sur la photo : la verite du diagnostic de forme (E5 bis) et du toit (E8). */
  toitVrai?: ToitVraiCorps[];
}

/**
 * Le mur vrai sur l'assemblage des photos, en pixels, a la version de la chaine dite (l'assemblage en depend) : ses bouts, et son
 * egout et son sol quand on les a poses.
 */
export interface CalageVrai { x0: number; x1: number; egout?: number; sol?: number; versionChaine: number }

/**
 * La vraie forme du toit d'un corps que la facade porte (MD/spec-facade-calage-audit.md §7.1). Le corps se designe par son mur sur la
 * facade, dans le repere du plan (facade/regles/toits/murDuCorps.ts le retrouve, quel que soit son rang) ; ses pignons dans le repere
 * du corps, comme `PignonToit` (le pan, le debut et la fin le long du faitage depuis `pts[0]`, la hauteur du faitage).
 */
export interface ToitVraiCorps {
  nom: string;
  mur: { gauche: PtBrut; droite: PtBrut };
  forme: FormeToitSimple;
  pignons?: Pick<PignonToit, 'pan' | 'debut' | 'fin' | 'faitage'>[];
  /** La hauteur a l'egout du corps sur ce mur, en metres (la rive basse d'un appentis). */
  egoutM?: number;
  cheminees?: { s: number }[];
  lucarnes?: { s: number }[];
}

const FORMES_VRAIES: readonly FormeToitSimple[] = ['plat', 'appentis', 'deux-pans', 'quatre-pans', 'croupes'];
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const point = (p: unknown): p is PtBrut => !!p && fini((p as PtBrut).x) && fini((p as PtBrut).y);

/** Relit la vraie forme du toit d'un cas ; leve sur un corps mal decrit (une verite fausse ne se devine pas). */
function lireToitVrai(brut: unknown): ToitVraiCorps[] {
  if (!Array.isArray(brut)) throw new Error('Cas reel : toitVrai doit etre une liste de corps.');
  return brut.map((c: Partial<ToitVraiCorps>) => {
    if (typeof c?.nom !== 'string' || !point(c.mur?.gauche) || !point(c.mur?.droite) || !FORMES_VRAIES.includes(c.forme as FormeToitSimple)) throw new Error('Cas reel : un corps du toit vrai veut un nom, son mur (gauche, droite) et une forme connue.');
    if (c.pignons && !c.pignons.every((g) => (g.pan === 0 || g.pan === 1) && fini(g.debut) && fini(g.fin) && fini(g.faitage) && g.fin > g.debut)) throw new Error('Cas reel : un pignon du toit vrai veut son pan, son debut, sa fin et son faitage.');
    return c as ToitVraiCorps;
  });
}

/** Relit le mur vrai d'un cas ; leve s'il ne forme pas un mur. */
function lireCalageVrai(brut: unknown): CalageVrai {
  const c = brut as Partial<CalageVrai> | null;
  if (!c || !fini(c.x0) || !fini(c.x1) || !(c.x1 > c.x0) || !fini(c.versionChaine) || (c.egout !== undefined && !fini(c.egout)) || (c.sol !== undefined && !fini(c.sol))) throw new Error('Cas reel : calageVrai veut x0 < x1 et la version de la chaine.');
  return { x0: c.x0, x1: c.x1, ...(c.egout !== undefined ? { egout: c.egout } : {}), ...(c.sol !== undefined ? { sol: c.sol } : {}), versionChaine: c.versionChaine };
}

export function lireCasReel(donnees: unknown): CasReel {
  const c = donnees as Partial<CasReel> | null;
  if (!c || c.format !== FORMAT_CAS_REEL || c.version !== 1) throw new Error('Ce n’est pas un cas de facade reelle.');
  if (typeof c.nom !== 'string' || !(c.largeurM && c.largeurM > 0) || !(c.hauteurM && c.hauteurM > 0)) throw new Error('Cas reel incomplet : nom, largeur, hauteur.');
  if (!Array.isArray(c.photos) || !c.photos.length || c.photos.some((p) => !p.fichier || !Array.isArray(p.coins) || p.coins.length !== 4)) throw new Error('Cas reel incomplet : chaque photo veut un fichier et quatre coins.');
  if (!Array.isArray(c.ouvertures)) throw new Error('Cas reel incomplet : ouvertures.');
  const gabarit = lireGabarit(c.gabarit);
  const reste = { ...(c as CasReel) };
  delete reste.gabarit; delete reste.calageVrai; delete reste.toitVrai;
  return {
    ...reste, statut: c.statut === 'valide' ? 'valide' : 'brouillon', ...(gabarit ? { gabarit: gabarit.map((p) => ({ ...p })) } : {}),
    ...(c.calageVrai !== undefined ? { calageVrai: lireCalageVrai(c.calageVrai) } : {}), ...(c.toitVrai !== undefined ? { toitVrai: lireToitVrai(c.toitVrai) } : {}),
  };
}

/** Une ouverture detectee, jugee : juste si elle recouvre une vraie ouverture (une seule vraie par detectee). */
export interface Jugee { confiance: number; juste: boolean; devinee: boolean }

export interface ResultatCas {
  nom: string;
  vraies: number;
  trouvees: number;
  vp: number;
  fp: number;
  fn: number;
  /** Ecart absolu median des cotes des baies retrouvees, en cm ; null sans baie retrouvee. */
  coteMedianeCm: number | null;
  jugees: Jugee[];
}

const SEUIL_JUSTE = 0.4;

/** Apparie detectees et vraies (glouton, meilleur recouvrement d'abord). */
export function juger(vraies: readonly OuvertureVraie[], trouvees: readonly OuvertureDetectee[]): { jugees: Jugee[]; cotes: number[]; vp: number } {
  const paires: { i: number; j: number; r: number }[] = [];
  trouvees.forEach((t, j) => vraies.forEach((v, i) => { const r = recouvrement(t, { ...t, ...v, confiance: 0 }); if (r >= SEUIL_JUSTE) paires.push({ i, j, r }); }));
  paires.sort((a, b) => b.r - a.r);
  const pi = new Set<number>(), pj = new Set<number>(), cotes: number[] = [];
  for (const { i, j } of paires) {
    if (pi.has(i) || pj.has(j)) continue;
    pi.add(i); pj.add(j);
    const v = vraies[i] as OuvertureVraie, t = trouvees[j] as OuvertureDetectee;
    cotes.push(...[t.x - v.x, t.y - v.y, t.l - v.l, t.h - v.h].map((d) => Math.abs(d) * 100));
  }
  return { jugees: trouvees.map((t, j) => ({ confiance: t.confiance, juste: pj.has(j), devinee: t.source === 'devinee' })), cotes, vp: pi.size };
}

const mediane = (l: number[]): number | null => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] as number; };

/** Ce que l'analyse du mur rend (l'enchainement d'une facade, releve/enchainement.ts, E6 et E7) : l'elevation, la texture, les ouvertures, ce que la fusion en dit, l'assemblage pris. */
export interface AnalyseDuMur {
  elevation: Image;
  pxParM: number;
  /** Les ouvertures de la chaine ordinaire (reglages en usage), avec le vote entre vues quand il y a plusieurs photos. */
  ouvertures: OuvertureDetectee[];
  /** La texture plaquee sur la facade en 3D (le mur et la bande au-dessus de l'egout), et la hauteur qu'elle couvre. */
  texture: Image;
  hauteurTexture: number;
  /** La silhouette du haut du mur, mesuree, et le modele de toit qui la porte le mieux ; null quand le toit est hors cadre. */
  profilToit: ResultatAnalyse['profilToit'];
  toitEstime: ResultatAnalyse['toitEstime'];
  /** Les baies devinees par la structure, peu sures : proposees en pointille. */
  devinees: OuvertureDetectee[];
  /** Ce que la fusion a dit des vues, la vue de reference et le masque d'occlusion ; null pour une photo seule. */
  fusion: Pick<ResultatFusion, 'statut' | 'vues' | 'masque' | 'reference' | 'occlusion'> | null;
  /** L'assemblage pris pour la suite, et le mur pose dessus ; null : le mur repasse par la fusion. */
  assemblage: AssemblageDuMur | null;
}

/**
 * Un cas dont le redressement (et la fusion) est fait, par l'enchainement de la facade (releve/enchainement.ts::preparerPourLaMesure) :
 * la detection seule reste a rejouer, autant de fois qu'on change un reglage.
 */
export type CasPrepare = AnalyseDuMur & { cas: CasReel };

const resultat = (cas: CasReel, ouvertures: readonly OuvertureDetectee[]): ResultatCas => {
  const { jugees, cotes, vp } = juger(cas.ouvertures, ouvertures);
  return { nom: cas.nom, vraies: cas.ouvertures.length, trouvees: ouvertures.length, vp, fp: ouvertures.length - vp, fn: cas.ouvertures.length - vp, coteMedianeCm: mediane(cotes), jugees };
};

/** La mesure d'un cas prepare avec les reglages en usage (chaine ordinaire, vote compris). */
export const mesurerPrepare = (p: CasPrepare): ResultatCas => resultat(p.cas, p.ouvertures);

/** La detection seule d'un cas prepare, avec ces reglages (pas de vote) : de quoi comparer deux jeux de reglages. */
export function evaluerPrepare(p: CasPrepare, reglages: Readonly<Record<string, number>>): ResultatCas {
  return resultat(p.cas, detecterFacade(p.elevation, p.pxParM, null, { reglages: reglages as never }).ouvertures);
}

export interface Case { de: number; a: number; n: number; justes: number; taux: number | null; confianceMoyenne: number | null }
export interface Fiabilite {
  cases: Case[];
  /** Ecart de calibration : moyenne ponderee de |taux de justes - confiance moyenne| par case, de 0 (parfait) a 1. */
  ece: number | null;
  /** Erreur quadratique moyenne entre la confiance et le jugement (0 ou 1) : plus bas, mieux. */
  brier: number | null;
  n: number;
}

/** La courbe de fiabilite : de 0 a 1 par `nCases` cases egales. Une confiance calibree fait un taux de justes egal a la confiance. */
export function fiabilite(jugees: readonly Jugee[], nCases = 5): Fiabilite {
  const cases: Case[] = Array.from({ length: nCases }, (_, k) => ({ de: k / nCases, a: (k + 1) / nCases, n: 0, justes: 0, taux: null, confianceMoyenne: null }));
  const sommes = new Array<number>(nCases).fill(0);
  for (const j of jugees) {
    const k = Math.min(nCases - 1, Math.floor(j.confiance * nCases));
    const c = cases[k] as Case;
    c.n++; c.justes += j.juste ? 1 : 0; sommes[k] = (sommes[k] ?? 0) + j.confiance;
  }
  let ece = 0;
  cases.forEach((c, k) => {
    if (!c.n) return;
    c.taux = c.justes / c.n; c.confianceMoyenne = (sommes[k] as number) / c.n;
    ece += (c.n / jugees.length) * Math.abs(c.taux - c.confianceMoyenne);
  });
  const brier = jugees.length ? jugees.reduce((s, j) => s + (j.confiance - (j.juste ? 1 : 0)) ** 2, 0) / jugees.length : null;
  return { cases, ece: jugees.length ? ece : null, brier, n: jugees.length };
}

/** Le bilan d'un ensemble de cas : precision, rappel, F1, calibration. */
export interface Bilan { vraies: number; trouvees: number; vp: number; precision: number | null; rappel: number | null; f1: number | null; brier: number | null; ece: number | null; cotesMedianesCm: number | null }

export function bilan(res: readonly ResultatCas[]): Bilan {
  const t = res.reduce((s, r) => ({ v: s.v + r.vraies, t: s.t + r.trouvees, vp: s.vp + r.vp }), { v: 0, t: 0, vp: 0 });
  const f = fiabilite(res.flatMap((r) => r.jugees));
  const cotes = res.flatMap((r) => (r.coteMedianeCm === null ? [] : [r.coteMedianeCm]));
  return {
    vraies: t.v, trouvees: t.t, vp: t.vp, precision: t.t ? t.vp / t.t : null, rappel: t.v ? t.vp / t.v : null,
    f1: t.v + t.t ? (2 * t.vp) / (t.v + t.t) : null, brier: f.brier, ece: f.ece, cotesMedianesCm: mediane(cotes),
  };
}

/** Le score qu'on cherche a monter : le F1 des baies, moins un peu de Brier (une confiance honnete compte). */
export const POIDS_BRIER = 0.05;
export const score = (b: Bilan): number => (b.f1 ?? 0) - POIDS_BRIER * (b.brier ?? 0);

// ------------------------------------------------------------------------------------------------
// La calibration
// ------------------------------------------------------------------------------------------------

export interface ParametreCalibrable {
  nom: string;
  groupe: 'detection' | 'structure';
  /** La valeur livree avec Plan. */
  defaut: number;
  unite: string;
  pourquoi: string;
  /** Bornes de la calibration : de la moitie au double de la valeur livree (une part reste dans [0, 1]). */
  min: number;
  max: number;
}

const bornes = (valeur: number, unite: string): [number, number] => {
  const hi = valeur * 2;
  return [valeur / 2, unite === 'part' ? Math.min(1, hi) : hi];
};

/** Tous les reglages nommes de la detection et de la structure, avec leurs bornes. */
export const PARAMETRES: readonly ParametreCalibrable[] = [
  ...Object.entries(REGLAGES_DETECTION).map(([nom, r]) => ({ nom, groupe: 'detection' as const, defaut: r.valeur as number, unite: r.unite as string, pourquoi: r.pourquoi as string })),
  ...Object.entries(REGLAGES_STRUCTURE).map(([nom, r]) => ({ nom, groupe: 'structure' as const, defaut: r.valeur as number, unite: r.unite as string, pourquoi: r.pourquoi as string })),
].map((p) => { const [min, max] = bornes(p.defaut, p.unite); return { ...p, min, max }; });

const parNom = new Map(PARAMETRES.map((p) => [p.nom, p]));

/** Ne garde d'un objet que les valeurs d'un parametre connu, finies et dans ses bornes. */
export function surchargesValides(brut: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  for (const [nom, v] of Object.entries(brut)) {
    const p = parNom.get(nom);
    if (p && typeof v === 'number' && Number.isFinite(v) && v >= p.min - 1e-9 && v <= p.max + 1e-9) out[nom] = v;
  }
  return out;
}

export interface Modification { nom: string; avant: number; apres: number; gain: number }
export interface ResultatCalibration {
  /** Les reglages proposes (les valeurs de depart, plus les modifications retenues). */
  reglages: Record<string, number>;
  modifications: Modification[];
  avant: Bilan;
  apres: Bilan;
  evaluations: number;
}
export interface OptionsCalibration {
  /** Les facteurs essayes pour chaque parametre. */
  facteurs: readonly number[];
  /** Un changement n'est garde que s'il fait monter le score d'au moins cela. */
  gainMin: number;
  /** Rendu a l'ecran : l'avancement (parametre en cours), et l'occasion de rendre la main au navigateur. */
  progression?: (fait: number, total: number, nom: string) => void;
  rendreLaMain?: () => Promise<void>;
}
export const OPTIONS_CALIBRATION: OptionsCalibration = { facteurs: [0.8, 0.9, 1.1, 1.25], gainMin: 0.01 };
/** Sous ce nombre de cas valides, les propositions sont indicatives : un seuil regle sur si peu de cas surapprend. */
export const CAS_MIN_CALIBRATION = 20;

/**
 * Descente par coordonnee : pour chaque parametre demande, on essaie les facteurs et on garde le meilleur changement s'il fait
 * monter le score d'au moins `gainMin`. Deterministe. Les cas sont deja redresses : seule la detection se rejoue.
 */
export async function calibrer(prepares: readonly CasPrepare[], noms: readonly string[], depart: Readonly<Record<string, number>>, options: Partial<OptionsCalibration> = {}): Promise<ResultatCalibration> {
  const o = { ...OPTIONS_CALIBRATION, ...options };
  const mesure = (r: Readonly<Record<string, number>>) => bilan(prepares.map((p) => evaluerPrepare(p, r)));
  let courant: Record<string, number> = { ...surchargesValides(depart) };
  let evaluations = 1;
  const avant = mesure(courant);
  let meilleur = avant;
  const modifications: Modification[] = [];
  for (const [k, nom] of noms.entries()) {
    const p = parNom.get(nom);
    if (!p) continue;
    o.progression?.(k, noms.length, nom);
    await o.rendreLaMain?.();
    const actuel = courant[nom] ?? p.defaut;
    let gagnant: { valeur: number; b: Bilan } | null = null;
    for (const f of o.facteurs) {
      const valeur = Math.round(Math.min(p.max, Math.max(p.min, actuel * f)) * 10000) / 10000;
      if (valeur === actuel) continue;
      const b = mesure({ ...courant, [nom]: valeur });
      evaluations++;
      if (score(b) - score(gagnant?.b ?? meilleur) > 1e-9) gagnant = { valeur, b };
    }
    if (gagnant && score(gagnant.b) - score(meilleur) >= o.gainMin) {
      modifications.push({ nom, avant: actuel, apres: gagnant.valeur, gain: Math.round((score(gagnant.b) - score(meilleur)) * 10000) / 10000 });
      courant = { ...courant, [nom]: gagnant.valeur };
      meilleur = gagnant.b;
    }
  }
  o.progression?.(noms.length, noms.length, '');
  return { reglages: courant, modifications, avant, apres: meilleur, evaluations };
}

// ------------------------------------------------------------------------------------------------
// Les documents du serveur
// ------------------------------------------------------------------------------------------------

export const FORMAT_CALIBRATION = 'plan-calibration';

/** Une calibration appliquee, gardee pour s'en souvenir : quand, sur combien de cas, ce qui a change, et ce que ca a donne. */
export interface EntreeHistorique {
  t: string;
  casValides: number;
  modifications: Modification[];
  avant: Pick<Bilan, 'precision' | 'rappel' | 'f1' | 'brier'>;
  apres: Pick<Bilan, 'precision' | 'rappel' | 'f1' | 'brier'>;
}

/** `admin/calibration` : les reglages calibres (par rapport aux valeurs livrees) et l'historique des calibrations appliquees. */
export interface DocumentCalibration {
  format: typeof FORMAT_CALIBRATION;
  version: 1;
  modifieLe: string;
  parametres: Record<string, number>;
  historique: EntreeHistorique[];
}

/** Relit le document du serveur ; les reglages inconnus ou hors bornes sont ecartes. Null si ce n'en est pas un. */
export function lireDocumentCalibration(donnees: unknown): DocumentCalibration | null {
  const d = donnees as Partial<DocumentCalibration> | null;
  if (!d || d.format !== FORMAT_CALIBRATION) return null;
  return {
    format: FORMAT_CALIBRATION, version: 1, modifieLe: typeof d.modifieLe === 'string' ? d.modifieLe : '',
    parametres: surchargesValides(d.parametres), historique: Array.isArray(d.historique) ? d.historique.slice(-100) : [],
  };
}

/** Un cas tel que le serveur le garde : le cas, et ses photos en `data:image/jpeg` dans le meme ordre. */
export type CasStocke = CasReel & { images: string[] };

export function lireCasStocke(donnees: unknown): CasStocke {
  const cas = lireCasReel(donnees);
  const images = (donnees as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length !== cas.photos.length || images.some((i) => typeof i !== 'string')) throw new Error('Cas de calibration incomplet : une image par photo.');
  return { ...cas, images: images as string[] };
}
