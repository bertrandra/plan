// La bibliotheque d'essences livree avec Plan (MD/spec-arbres-3d.md §2.1) : celle que la 3D et
// l'inspecteur utilisent tant que l'administrateur n'a rien enregistre sur le serveur (`admin/arbres`).
// Des qu'il enregistre une bibliotheque, c'est la sienne qui prime ; l'ecran Admin › Arbres sait y
// ajouter celle-ci pour la retoucher.
//
// EZ-tree n'a que quatre feuilles (chene, frene, tremble, pin) et quatre ecorces : une essence se
// distingue ici par sa **base** (un preset d'EZ-tree, presetsBase.ts), ses proportions proposees
// (hauteur, diametre : le modele est mis a l'echelle, un cypres de 2 m de large reste fuse), l'ouverture de
// ses branches, la teinte de son feuillage et de son ecorce, et si elle perd ses feuilles. Ce sont des
// maquettes pour l'ombre portee, pas des portraits botaniques.
//
// Les mots de `natures` sont ceux de la nature BD TOPO des zones de vegetation (« Forêt fermée de
// feuillus », « Verger », « Haie »…) : `especeParNature` prend la premiere essence de la liste dont un
// mot figure dans la nature, donc l'ordre compte (le chene d'abord : c'est l'essence de repli).

import type { EspeceArbre, ReglagesEz, ValeurReglage } from './especesArbre.js';
import { PRESETS_BASE } from './presetsBase.js';

/** Ce qu'une essence change a son preset de base ; tout est facultatif. */
interface Retouche {
  /** Teinte des feuilles (0xRRGGBB, multipliee a la carte de la feuille). */
  f?: number;
  /** Teinte de l'ecorce. */
  e?: number;
  /** Ecorce. */
  ec?: 'oak' | 'birch' | 'pine' | 'willow';
  /** Feuille. */
  ft?: 'oak' | 'ash' | 'aspen' | 'pine';
  /** Taille des feuilles et nombre par branche, en multiple de la base. */
  fs?: number;
  fn?: number;
  /** Angle des branches, en multiple de la base (< 1 : port fuse, > 1 : port etale). */
  a?: number;
  /** Niveaux de branches (moins de niveaux : moins de triangles, port plus simple). */
  lv?: number;
  /** Rayon du tronc, en multiple de la base. */
  r?: number;
}

type Base = keyof typeof PRESETS_BASE;
type Ligne = readonly [id: string, nom: string, caduc: boolean, hauteurM: number, diametreM: number, base: Base, natures: readonly string[], retouche: Retouche];

/** Une graine propre a l'identifiant : deux essences de meme base ne donnent pas le meme arbre. */
function graineDe(id: string): number {
  let h = 7;
  for (const c of id) h = (h * 131 + c.charCodeAt(0)) % 99991;
  return h + 1;
}

const copie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Les reglages d'une essence : le preset de base, retouche. */
export function reglagesDe(id: string, base: Base, r: Retouche): ReglagesEz {
  const g = copie(PRESETS_BASE[base]) as ReglagesEz & { [k: string]: ValeurReglage };
  g.seed = graineDe(id);
  const bark = g.bark as { [k: string]: ValeurReglage }, leaves = g.leaves as { [k: string]: ValeurReglage };
  const branch = g.branch as { [k: string]: { [n: string]: ValeurReglage } | ValeurReglage };
  if (r.ec) bark.type = r.ec;
  if (r.e !== undefined) bark.tint = r.e;
  if (r.ft) leaves.type = r.ft;
  if (r.f !== undefined) leaves.tint = r.f;
  if (r.fs) leaves.size = Math.round(Number(leaves.size) * r.fs * 1000) / 1000;
  if (r.fn) leaves.count = Math.max(1, Math.round(Number(leaves.count) * r.fn));
  if (r.a) {
    const angles = branch.angle as { [n: string]: number };
    for (const n of Object.keys(angles)) angles[n] = Math.min(170, Math.round(Number(angles[n]) * r.a));
  }
  if (r.lv !== undefined) branch.levels = r.lv;
  if (r.r) {
    const rayons = branch.radius as { [n: string]: number };
    for (const n of Object.keys(rayons)) rayons[n] = Math.round(Number(rayons[n]) * r.r * 1000) / 1000;
  }
  return g;
}

// Teintes de feuillage (a multiplier a la carte de la feuille) et d'ecorce.
const VERT_CLAIR = 0xe6f5c8, VERT = 0xd5e8cd, VERT_SOMBRE = 0xa9c79a, VERT_BLEU = 0xb8d4c4, JAUNE_VERT = 0xf3f0b0;
const POURPRE = 0xb98a9a, ARGENT = 0xdfe8e4, ROUILLE = 0xd9a98a, ROSE = 0xf6d5df, BLANC = 0xffffff;
const ECORCE_CLAIRE = 0xe9e1d3, ECORCE_GRISE = 0xb9b4aa, ECORCE_BRUNE = 0x9c8468, ECORCE_FONCEE = 0x6f5d4a, ECORCE_ROUGE = 0xa86f55;

const LIGNES: readonly Ligne[] = [
  // ---- Les trois essences de repli, dans l'ordre ou l'import BD TOPO les cherche -------------------
  ['chene-pedoncule', 'Chêne pédonculé', true, 22, 14, 'chene', ['feuillus'], { f: VERT, e: ECORCE_GRISE }],
  ['pin-sylvestre', 'Pin sylvestre', false, 20, 7, 'pin', ['conif', 'résineux', 'resineux'], { f: VERT_BLEU, e: ECORCE_ROUGE }],
  ['peuplier-noir', 'Peuplier noir', true, 28, 9, 'tremble', ['peupl'], { f: VERT_CLAIR, a: 0.7, e: ECORCE_GRISE }],
  ['hetre-commun', 'Hêtre commun', true, 25, 16, 'chene', ['mixte', 'bois', 'forêt', 'foret'], { f: VERT_CLAIR, e: ECORCE_CLAIRE, ec: 'birch', fn: 1.2 }],
  ['pommier', 'Pommier', true, 5, 5, 'cheneSmall', ['verger'], { f: VERT, e: ECORCE_BRUNE, a: 1.2, fs: 0.7 }],
  ['charmille', 'Haie de charme', true, 2.5, 1.2, 'buisson', ['haie'], { f: VERT_CLAIR, e: ECORCE_BRUNE, ft: 'ash' }],
  ['genet', 'Genêt et ajonc', false, 1.5, 1.8, 'buisson2', ['lande'], { f: JAUNE_VERT, e: ECORCE_FONCEE }],
  ['vigne', 'Vigne', true, 1.4, 1.2, 'buisson3', ['vigne'], { f: VERT_CLAIR, e: ECORCE_FONCEE, fs: 1.4 }],

  // ---- Feuillus caducs de grande taille ------------------------------------------------------------
  ['chene-sessile', 'Chêne sessile', true, 25, 15, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, a: 0.9 }],
  ['chene-pubescent', 'Chêne pubescent', true, 14, 10, 'chene', [], { f: VERT_BLEU, e: ECORCE_FONCEE, fs: 0.8 }],
  ['chene-rouge', "Chêne rouge d'Amérique", true, 24, 14, 'chene', [], { f: ROUILLE, e: ECORCE_GRISE, a: 1.05 }],
  ['hetre-pourpre', 'Hêtre pourpre', true, 22, 15, 'chene', [], { f: POURPRE, e: ECORCE_CLAIRE, ec: 'birch' }],
  ['charme-commun', 'Charme commun', true, 18, 10, 'frene', [], { f: VERT, e: ECORCE_CLAIRE, ec: 'birch', a: 0.9 }],
  ['frene-commun', 'Frêne commun', true, 25, 12, 'frene', [], { f: VERT_CLAIR, e: ECORCE_GRISE }],
  ['frene-fleurs', 'Frêne à fleurs', true, 12, 8, 'frene', [], { f: VERT, e: ECORCE_GRISE, fs: 0.8 }],
  ['erable-sycomore', 'Érable sycomore', true, 25, 15, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_CLAIRE, fs: 1.2 }],
  ['erable-plane', 'Érable plane', true, 22, 13, 'chene', [], { f: VERT, e: ECORCE_GRISE, fs: 1.2 }],
  ['erable-champetre', 'Érable champêtre', true, 12, 8, 'cheneSmall', [], { f: VERT_CLAIR, e: ECORCE_BRUNE }],
  ['erable-argente', 'Érable argenté', true, 20, 14, 'frene', [], { f: ARGENT, e: ECORCE_GRISE, a: 1.1 }],
  ['erable-japon', 'Érable du Japon', true, 5, 5, 'cheneSmall', [], { f: ROUILLE, e: ECORCE_FONCEE, a: 1.2, fs: 0.8 }],
  ['tilleul-petites-feuilles', 'Tilleul à petites feuilles', true, 22, 13, 'chene', [], { f: VERT, e: ECORCE_GRISE, fn: 1.3 }],
  ['tilleul-grandes-feuilles', 'Tilleul à grandes feuilles', true, 24, 15, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, fs: 1.3 }],
  ['tilleul-argente', 'Tilleul argenté', true, 25, 14, 'chene', [], { f: ARGENT, e: ECORCE_GRISE }],
  ['marronnier-inde', "Marronnier d'Inde", true, 22, 15, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 1.6 }],
  ['platane', 'Platane commun', true, 28, 18, 'chene', [], { f: VERT, e: ECORCE_CLAIRE, ec: 'birch', fs: 1.5, a: 1.1 }],
  ['orme-champetre', 'Orme champêtre', true, 25, 14, 'frene', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE }],
  ['noyer-commun', 'Noyer commun', true, 18, 14, 'frene', [], { f: VERT, e: ECORCE_GRISE, a: 1.1, fs: 1.2 }],
  ['noyer-noir', "Noyer noir d'Amérique", true, 25, 14, 'frene', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE }],
  ['chataignier', 'Châtaignier', true, 24, 16, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_BRUNE, ft: 'ash', a: 1.1 }],
  ['robinier', 'Robinier faux-acacia', true, 20, 10, 'frene', [], { f: VERT_CLAIR, e: ECORCE_FONCEE, fs: 0.8 }],
  ['tulipier', 'Tulipier de Virginie', true, 28, 12, 'chene', [], { f: VERT, e: ECORCE_GRISE, a: 0.8 }],
  ['liquidambar', 'Liquidambar', true, 20, 9, 'chene', [], { f: ROUILLE, e: ECORCE_GRISE, a: 0.85 }],
  ['ginkgo', 'Ginkgo', true, 20, 9, 'tremble', [], { f: JAUNE_VERT, e: ECORCE_GRISE, a: 0.8, fs: 1.3 }],
  ['cypres-chauve', 'Cyprès chauve', true, 22, 7, 'pin', [], { f: ROUILLE, e: ECORCE_ROUGE, fs: 0.8 }],
  ['meleze', 'Mélèze', true, 25, 8, 'pin', [], { f: JAUNE_VERT, e: ECORCE_ROUGE, a: 1.1 }],
  ['fevier', "Févier d'Amérique", true, 18, 12, 'frene', [], { f: VERT_CLAIR, e: ECORCE_FONCEE, fs: 0.7 }],
  ['paulownia', 'Paulownia', true, 12, 10, 'cheneSmall', [], { f: VERT, e: ECORCE_GRISE, fs: 1.8 }],
  ['sophora', 'Sophora du Japon', true, 18, 13, 'frene', [], { f: VERT_SOMBRE, e: ECORCE_GRISE }],
  ['micocoulier', 'Micocoulier de Provence', true, 18, 13, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, fs: 0.8 }],
  ['murier-platane', 'Mûrier platane', true, 12, 12, 'cheneSmall', [], { f: VERT, e: ECORCE_GRISE, a: 1.3, fs: 1.2 }],
  ['catalpa', 'Catalpa', true, 12, 10, 'cheneSmall', [], { f: VERT, e: ECORCE_GRISE, fs: 1.8 }],
  ['saule-blanc', 'Saule blanc', true, 20, 12, 'tremble', [], { f: ARGENT, e: ECORCE_GRISE, ec: 'willow', a: 0.9 }],
  ['saule-pleureur', 'Saule pleureur', true, 15, 14, 'tremble', [], { f: JAUNE_VERT, e: ECORCE_BRUNE, ec: 'willow', a: 1.5, fn: 1.2 }],
  ['saule-marsault', 'Saule marsault', true, 10, 7, 'cheneSmall', [], { f: VERT, e: ECORCE_GRISE, ec: 'willow' }],
  ['saule-tortueux', 'Saule tortueux', true, 10, 6, 'cheneSmall', [], { f: JAUNE_VERT, e: ECORCE_BRUNE, ec: 'willow', a: 0.9 }],
  ['aulne-glutineux', 'Aulne glutineux', true, 20, 8, 'frene', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, a: 0.8 }],
  ['bouleau-verruqueux', 'Bouleau verruqueux', true, 18, 7, 'tremble', [], { f: VERT_CLAIR, e: BLANC, ec: 'birch', a: 0.9 }],
  ['bouleau-pleureur', 'Bouleau pleureur', true, 15, 7, 'tremble', [], { f: JAUNE_VERT, e: BLANC, ec: 'birch', a: 1.3 }],
  ['bouleau-himalaya', "Bouleau de l'Himalaya", true, 12, 6, 'tremble', [], { f: VERT, e: BLANC, ec: 'birch', a: 0.85 }],
  ['tremble', 'Peuplier tremble', true, 22, 8, 'tremble', [], { f: VERT_CLAIR, e: ECORCE_CLAIRE, ec: 'birch' }],
  ['peuplier-blanc', 'Peuplier blanc', true, 28, 14, 'tremble', [], { f: ARGENT, e: ECORCE_CLAIRE, ec: 'birch', a: 1.1 }],
  ['peuplier-italie', "Peuplier d'Italie", true, 30, 4, 'tremble', [], { f: VERT, e: ECORCE_GRISE, a: 0.35 }],
  ['peuplier-hybride', 'Peuplier de culture', true, 30, 8, 'tremble', [], { f: VERT, e: ECORCE_GRISE, a: 0.6 }],

  // ---- Feuillus caducs de taille moyenne : fruitiers et arbres d'ornement ---------------------------
  ['poirier', 'Poirier', true, 6, 4, 'cheneSmall', ['verger'], { f: VERT_SOMBRE, e: ECORCE_FONCEE, a: 0.75, fs: 0.8 }],
  ['cerisier-fruits', 'Cerisier à fruits', true, 7, 6, 'cheneSmall', ['verger'], { f: VERT, e: ECORCE_ROUGE, a: 1.1 }],
  ['prunier', 'Prunier', true, 5, 4.5, 'cheneSmall', ['verger'], { f: VERT, e: ECORCE_FONCEE, fs: 0.8 }],
  ['pecher', 'Pêcher', true, 4, 4, 'cheneSmall', ['verger'], { f: VERT_CLAIR, e: ECORCE_ROUGE, ft: 'ash', a: 1.2 }],
  ['abricotier', 'Abricotier', true, 5, 5, 'cheneSmall', ['verger'], { f: VERT, e: ECORCE_BRUNE, fs: 0.9 }],
  ['cognassier', 'Cognassier', true, 4, 4, 'cheneSmall', ['verger'], { f: VERT_SOMBRE, e: ECORCE_BRUNE, a: 1.2 }],
  ['noisetier', 'Noisetier', true, 5, 5, 'buisson', [], { f: VERT, e: ECORCE_BRUNE, fs: 1.2 }],
  ['figuier', 'Figuier', true, 5, 6, 'cheneSmall', [], { f: VERT_SOMBRE, e: ECORCE_CLAIRE, fs: 2, a: 1.3 }],
  ['kaki', 'Kaki', true, 6, 5, 'cheneSmall', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 1.3 }],
  ['amandier', 'Amandier', true, 6, 5, 'cheneSmall', [], { f: ARGENT, e: ECORCE_FONCEE, ft: 'ash' }],
  ['cerisier-fleurs', 'Cerisier à fleurs', true, 7, 7, 'cheneSmall', [], { f: ROSE, e: ECORCE_ROUGE, a: 1.2 }],
  ['prunus-pissardii', 'Prunus pourpre', true, 6, 5, 'cheneSmall', [], { f: POURPRE, e: ECORCE_FONCEE }],
  ['pommier-fleurs', 'Pommier à fleurs', true, 6, 5, 'cheneSmall', [], { f: ROSE, e: ECORCE_BRUNE, fs: 0.8 }],
  ['arbre-de-judee', 'Arbre de Judée', true, 7, 6, 'cheneSmall', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 1.3 }],
  ['sorbier-oiseleurs', 'Sorbier des oiseleurs', true, 10, 6, 'frene', [], { f: VERT, e: ECORCE_GRISE, fs: 0.8 }],
  ['alisier-blanc', 'Alisier blanc', true, 10, 7, 'cheneSmall', [], { f: ARGENT, e: ECORCE_GRISE }],
  ['merisier', 'Merisier', true, 18, 10, 'chene', [], { f: VERT_CLAIR, e: ECORCE_ROUGE, a: 0.85 }],
  ['cornouiller-male', 'Cornouiller mâle', true, 5, 4, 'buisson', [], { f: VERT, e: ECORCE_BRUNE }],
  ['cornouiller-fleurs', 'Cornouiller à fleurs', true, 6, 6, 'cheneSmall', [], { f: VERT_CLAIR, e: ECORCE_GRISE, a: 1.4, fs: 1.1 }],
  ['aubepine', 'Aubépine', true, 6, 5, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 0.8 }],
  ['magnolia-caduc', 'Magnolia caduc', true, 7, 6, 'cheneSmall', [], { f: VERT_CLAIR, e: ECORCE_CLAIRE, fs: 1.6, a: 1.3 }],
  ['savonnier', 'Savonnier', true, 8, 6, 'frene', [], { f: JAUNE_VERT, e: ECORCE_GRISE, fs: 0.8 }],
  ['albizia', 'Albizia (arbre à soie)', true, 7, 8, 'frene', [], { f: VERT_CLAIR, e: ECORCE_GRISE, a: 1.5, fs: 0.7 }],
  ['lagerstroemia', 'Lagerstroemia (lilas des Indes)', true, 5, 4, 'cheneSmall', [], { f: VERT, e: ECORCE_CLAIRE, ec: 'birch' }],
  ['tamaris', 'Tamaris', true, 5, 5, 'buisson', [], { f: ARGENT, e: ECORCE_ROUGE, fs: 0.6, fn: 1.5 }],
  ['sureau-noir', 'Sureau noir', true, 5, 4, 'buisson', [], { f: VERT, e: ECORCE_GRISE, ft: 'ash' }],
  ['murier-blanc', 'Mûrier blanc', true, 10, 9, 'cheneSmall', [], { f: VERT_CLAIR, e: ECORCE_BRUNE, a: 1.2 }],
  ['jujubier', 'Jujubier', true, 5, 4, 'buisson', [], { f: VERT, e: ECORCE_FONCEE, fs: 0.7 }],
  ['oranger-osage', 'Oranger des Osages', true, 9, 8, 'cheneSmall', [], { f: VERT_SOMBRE, e: ECORCE_BRUNE, a: 1.3 }],

  // ---- Conifères ----------------------------------------------------------------------------------
  ['pin-maritime', 'Pin maritime', false, 22, 8, 'pin', [], { f: VERT, e: ECORCE_ROUGE, a: 1.05 }],
  ['pin-parasol', 'Pin parasol', false, 15, 14, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE, a: 1.6, lv: 1 }],
  ['pin-noir', "Pin noir d'Autriche", false, 22, 9, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_GRISE }],
  ['pin-weymouth', 'Pin de Weymouth', false, 25, 10, 'pin', [], { f: VERT_BLEU, e: ECORCE_GRISE, a: 0.9 }],
  ['pin-laricio', 'Pin laricio', false, 28, 10, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE, a: 0.85 }],
  ['pin-cembro', 'Pin cembro', false, 18, 6, 'pinSmall', [], { f: VERT_BLEU, e: ECORCE_GRISE, a: 0.7 }],
  ['pin-mugo', 'Pin mugo', false, 1.5, 2.5, 'pinSmall', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, a: 1.6 }],
  ['epicea-commun', 'Épicéa commun', false, 28, 8, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE, a: 1.15, fn: 1.2 }],
  ['epicea-bleu', 'Épicéa bleu', false, 18, 6, 'pin', [], { f: ARGENT, e: ECORCE_GRISE, a: 1.1 }],
  ['sapin-pectine', 'Sapin pectiné', false, 30, 8, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, a: 1.2 }],
  ['sapin-nordmann', 'Sapin de Nordmann', false, 25, 7, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, a: 1.2, fn: 1.3 }],
  ['douglas', 'Douglas', false, 35, 9, 'pin', [], { f: VERT, e: ECORCE_FONCEE, a: 0.95 }],
  ['cedre-liban', 'Cèdre du Liban', false, 22, 20, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, a: 1.7, lv: 1 }],
  ['cedre-atlas', "Cèdre de l'Atlas", false, 25, 14, 'pin', [], { f: VERT_BLEU, e: ECORCE_FONCEE, a: 1.45 }],
  ['cedre-bleu', "Cèdre bleu de l'Atlas", false, 22, 12, 'pin', [], { f: ARGENT, e: ECORCE_GRISE, a: 1.4 }],
  ['sequoia', 'Séquoia géant', false, 35, 10, 'pin', [], { f: VERT, e: ECORCE_ROUGE, a: 0.9, r: 1.3 }],
  ['metasequoia', 'Métaséquoia', true, 28, 8, 'pin', [], { f: VERT_CLAIR, e: ECORCE_ROUGE, a: 0.8 }],
  ['cypres-provence', 'Cyprès de Provence', false, 18, 2.5, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, a: 0.2 }],
  ['cypres-lambert', 'Cyprès de Lambert', false, 15, 9, 'pin', [], { f: VERT, e: ECORCE_ROUGE, a: 1.2 }],
  ['cypres-leyland', 'Cyprès de Leyland', false, 20, 5, 'pin', [], { f: VERT, e: ECORCE_ROUGE, a: 0.4 }],
  ['thuya-geant', 'Thuya géant', false, 20, 6, 'pin', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE, a: 0.5 }],
  ['thuya-occidental', 'Thuya occidental', false, 8, 2.5, 'pinSmall', [], { f: VERT, e: ECORCE_ROUGE, a: 0.3 }],
  ['haie-thuyas', 'Haie de thuyas', false, 2.5, 1.2, 'buisson', ['haie'], { f: VERT_SOMBRE, e: ECORCE_ROUGE, ft: 'pine' }],
  ['if-commun', 'If commun', false, 10, 6, 'pinSmall', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE, a: 1.5 }],
  ['genevrier', 'Genévrier commun', false, 4, 2, 'pinSmall', [], { f: VERT_BLEU, e: ECORCE_BRUNE, a: 0.5 }],
  ['araucaria', 'Araucaria du Chili', false, 18, 7, 'pinSmall', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, a: 1.4, r: 1.2 }],

  // ---- Feuillus persistants ------------------------------------------------------------------------
  ['chene-vert', 'Chêne vert', false, 14, 12, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 0.6, fn: 1.4 }],
  ['chene-liege', 'Chêne-liège', false, 14, 12, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, fs: 0.7, a: 1.1 }],
  ['olivier', 'Olivier', false, 7, 7, 'cheneSmall', [], { f: ARGENT, e: ECORCE_GRISE, ft: 'ash', fs: 0.7, fn: 1.4, a: 1.2 }],
  ['laurier-sauce', 'Laurier-sauce', false, 8, 5, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_GRISE }],
  ['laurier-palme', 'Laurier-palme', false, 4, 4, 'buisson', ['haie'], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 1.4 }],
  ['laurier-rose', 'Laurier-rose', false, 3, 3, 'buisson', [], { f: VERT, e: ECORCE_BRUNE, ft: 'ash', fs: 0.8 }],
  ['houx', 'Houx', false, 8, 4, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, fs: 0.8 }],
  ['buis', 'Buis', false, 2, 2, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_BRUNE, fs: 0.5, fn: 1.5 }],
  ['arbousier', 'Arbousier', false, 6, 5, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE }],
  ['eucalyptus', 'Eucalyptus', false, 20, 8, 'frene', [], { f: ARGENT, e: ECORCE_CLAIRE, ec: 'birch', a: 0.7, fs: 1.1 }],
  ['magnolia-grandiflora', 'Magnolia à grandes fleurs', false, 12, 8, 'chene', [], { f: VERT_SOMBRE, e: ECORCE_GRISE, fs: 1.8, a: 0.9 }],
  ['photinia', 'Photinia', false, 4, 3.5, 'buisson', ['haie'], { f: ROUILLE, e: ECORCE_FONCEE }],
  ['troene', 'Troène', false, 3, 2.5, 'buisson', ['haie'], { f: VERT, e: ECORCE_GRISE, fs: 0.6 }],
  ['laurier-tin', 'Laurier-tin', false, 3, 2.5, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_BRUNE }],
  ['camelia', 'Camélia', false, 3, 2.5, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_BRUNE, fs: 0.8 }],
  ['rhododendron', 'Rhododendron', false, 3, 3.5, 'buisson', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 1.3 }],
  ['pittosporum', 'Pittosporum', false, 4, 3, 'buisson', ['haie'], { f: VERT, e: ECORCE_GRISE }],
  ['elaeagnus', 'Chalef (éléagnus)', false, 3, 3, 'buisson', ['haie'], { f: ARGENT, e: ECORCE_BRUNE }],
  ['mimosa', 'Mimosa', false, 8, 6, 'frene', [], { f: JAUNE_VERT, e: ECORCE_GRISE, fs: 0.6, a: 1.3 }],

  // ---- Arbustes et haies ----------------------------------------------------------------------------
  ['haie-champetre', 'Haie champêtre', true, 3, 2.5, 'buisson', ['haie'], { f: VERT, e: ECORCE_BRUNE }],
  ['haie-persistante', 'Haie persistante', false, 2, 1.5, 'buisson', ['haie'], { f: VERT_SOMBRE, e: ECORCE_BRUNE }],
  ['haie-taillee', 'Haie taillée basse', true, 1.2, 0.8, 'buisson', ['haie'], { f: VERT, e: ECORCE_BRUNE, fs: 0.8 }],
  ['forsythia', 'Forsythia', true, 2.5, 3, 'buisson2', [], { f: JAUNE_VERT, e: ECORCE_BRUNE, a: 1.3 }],
  ['lilas', 'Lilas', true, 4, 3.5, 'buisson', [], { f: VERT, e: ECORCE_GRISE, fs: 1.2 }],
  ['hortensia', 'Hortensia', true, 1.5, 1.8, 'buisson2', [], { f: VERT, e: ECORCE_BRUNE, fs: 1.8 }],
  ['buddleia', 'Buddleia (arbre à papillons)', true, 3, 3, 'buisson2', [], { f: ARGENT, e: ECORCE_GRISE, ft: 'ash' }],
  ['weigela', 'Weigela', true, 2, 2.5, 'buisson2', [], { f: VERT, e: ECORCE_BRUNE }],
  ['spiree', 'Spirée', true, 1.5, 1.8, 'buisson2', [], { f: VERT_CLAIR, e: ECORCE_BRUNE, fs: 0.7 }],
  ['viorne', 'Viorne obier', true, 3, 3, 'buisson', [], { f: VERT, e: ECORCE_GRISE, fs: 1.2 }],
  ['cornouiller-sanguin', 'Cornouiller sanguin', true, 3, 3, 'buisson', [], { f: VERT, e: ECORCE_ROUGE }],
  ['rosier-arbuste', 'Rosier arbustif', true, 1.5, 1.5, 'buisson2', [], { f: VERT_SOMBRE, e: ECORCE_ROUGE, fs: 0.7 }],
  ['noisetier-pourpre', 'Noisetier pourpre', true, 4, 4, 'buisson', [], { f: POURPRE, e: ECORCE_FONCEE }],
  ['prunellier', 'Prunellier', true, 3, 3, 'buisson2', [], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 0.6 }],
  ['fusain', "Fusain d'Europe", true, 3, 3, 'buisson', [], { f: VERT, e: ECORCE_GRISE, fs: 0.8 }],
  ['bruyere', 'Bruyère', false, 0.6, 0.8, 'buisson3', ['lande'], { f: VERT_SOMBRE, e: ECORCE_FONCEE, fs: 0.4, fn: 1.5 }],
  ['lavande', 'Lavande', false, 0.7, 0.9, 'buisson3', [], { f: ARGENT, e: ECORCE_GRISE, fs: 0.4 }],
  ['bambou', 'Bambou', false, 5, 2.5, 'buisson', [], { f: VERT_CLAIR, e: ECORCE_CLAIRE, ft: 'ash', a: 0.5, fs: 0.8 }],
];

/** La bibliotheque livree avec Plan : toutes les essences, dans l'ordre de `LIGNES`. */
export const ESPECES_PAR_DEFAUT: readonly EspeceArbre[] = LIGNES.map(([id, nom, caduc, hauteurM, diametreM, base, natures, r]) => ({
  id, nom, caduc, natures: [...natures], hauteurM, diametreM, reglages: reglagesDe(id, base, r),
}));

/**
 * La bibliotheque `especes` completee des essences par defaut qu'elle n'a pas (par identifiant), sans
 * depasser `max` ; `ajoutees` en dit le nombre, `restantes` combien n'ont pas trouve place.
 */
export function completerParDefaut(especes: readonly EspeceArbre[], max: number): { liste: EspeceArbre[]; ajoutees: number; restantes: number } {
  const pris = new Set(especes.map((e) => e.id));
  const manquantes = ESPECES_PAR_DEFAUT.filter((e) => !pris.has(e.id));
  const place = Math.max(0, max - especes.length);
  const prises = manquantes.slice(0, place).map((e) => copie(e));
  return { liste: [...especes, ...prises], ajoutees: prises.length, restantes: manquantes.length - prises.length };
}
