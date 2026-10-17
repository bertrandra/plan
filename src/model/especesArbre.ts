// La bibliotheque d'essences d'arbres (MD/spec-arbres-3d.md).
//
// Un arbre du plan en 3D n'est plus dessine par Plan : il est genere par EZ-tree
// (@dgreenheck/ez-tree) a partir des reglages d'une **essence** que l'administrateur cree dans son
// ecran « Arbres » et qui vit sur le serveur (`admin/arbres`, comme la palette). L'utilisateur
// choisit une essence et ses dimensions ; il ne voit rien d'EZ-tree.
//
// Ce module est pur : le document, sa lecture tolerante (une essence abimee est ignoree, jamais
// l'interface), et l'etat de la bibliotheque chargee, que la 3D, l'inspecteur et l'import lisent.

import type { ObjetPlan } from './types.js';

export const FORMAT_ARBRES = 'plan-arbres';
/** Au plus autant d'essences : la bibliotheque livree en compte 40 (data/admin/arbres.json), l'administrateur peut y ajouter les siennes. */
export const MAX_ESPECES = 200;
/** Le document entier, en octets une fois serialise (les routes serveur le refusent au-dela). */
export const MAX_OCTETS_ARBRES = 524288;
export const ID_ESPECE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const DIAMETRE_DEFAUT_M = 3;
export const HAUTEUR_DEFAUT_M = 6;
export const COULEUR_FEUILLAGE_DEFAUT = '#ffffff';

/** Une valeur des reglages EZ-tree : des nombres, des textes, des booleens, et des objets de ceux-la. */
export type ValeurReglage = number | string | boolean | { [cle: string]: ValeurReglage };
export type ReglagesEz = { [cle: string]: ValeurReglage };

export interface EspeceArbre {
  /** Identifiant stable, `[a-z0-9-]` : c'est lui qu'un objet du plan porte (`especeArbre`). */
  id: string;
  /** Le nom que l'utilisateur voit (« Chêne »). */
  nom: string;
  /** Un caduc est nu de novembre a mars, a la date de l'etude d'ensoleillement. */
  caduc: boolean;
  /** Mots de la nature BD TOPO (« conifere », « verger »…) pour lesquels c'est l'essence proposee a l'import. */
  natures: string[];
  /** Les dimensions proposees quand on ajoute un arbre de cette essence. */
  hauteurM: number;
  diametreM: number;
  /** Les reglages d'EZ-tree (`Tree.options`), tels que l'ecran admin les ecrit. */
  reglages: ReglagesEz;
}

export interface DocumentArbres {
  format: typeof FORMAT_ARBRES;
  version: 1;
  modifieLe: string;
  especes: EspeceArbre[];
}

const nombreFini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Des reglages assainis : seules les valeurs simples passent, sur quatre niveaux au plus. */
function assainir(v: unknown, profondeur = 0): ReglagesEz {
  const out: ReglagesEz = {};
  if (!v || typeof v !== 'object' || Array.isArray(v) || profondeur > 4) return out;
  for (const [cle, val] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(cle)) continue;
    if (nombreFini(val) || typeof val === 'boolean') out[cle] = val;
    else if (typeof val === 'string' && val.length <= 80) out[cle] = val;
    else if (val && typeof val === 'object' && !Array.isArray(val)) out[cle] = assainir(val, profondeur + 1);
  }
  return out;
}

/** Une essence lue d'un document : `null` si elle n'a pas d'identifiant valide ou de reglages. */
export function lireEspece(d: unknown): EspeceArbre | null {
  if (!d || typeof d !== 'object') return null;
  const e = d as Record<string, unknown>;
  if (typeof e.id !== 'string' || !ID_ESPECE.test(e.id)) return null;
  const reglages = assainir(e.reglages);
  if (!Object.keys(reglages).length) return null;
  const nom = typeof e.nom === 'string' && e.nom.trim() ? e.nom.trim().slice(0, 60) : e.id;
  const natures = Array.isArray(e.natures) ? e.natures.filter((n): n is string => typeof n === 'string' && n.trim() !== '').map((n) => n.trim().toLowerCase().slice(0, 40)).slice(0, 12) : [];
  return {
    id: e.id, nom, caduc: e.caduc !== false, natures,
    hauteurM: nombreFini(e.hauteurM) && e.hauteurM > 0 ? Math.min(60, e.hauteurM) : HAUTEUR_DEFAUT_M,
    diametreM: nombreFini(e.diametreM) && e.diametreM > 0 ? Math.min(40, e.diametreM) : DIAMETRE_DEFAUT_M,
    reglages
  };
}

/** Lit un document : les essences valides, dans l'ordre, sans doublon d'identifiant. `null` si ce n'est pas une bibliotheque. */
export function lireDocumentArbres(d: unknown): { especes: EspeceArbre[]; modifieLe: string | null } | null {
  if (!d || typeof d !== 'object' || (d as { format?: unknown }).format !== FORMAT_ARBRES) return null;
  const liste = (d as { especes?: unknown }).especes;
  const vues = new Set<string>();
  const especes: EspeceArbre[] = [];
  for (const brute of Array.isArray(liste) ? liste : []) {
    const e = lireEspece(brute);
    if (!e || vues.has(e.id)) continue;
    vues.add(e.id);
    especes.push(e);
    if (especes.length >= MAX_ESPECES) break;
  }
  const le = (d as { modifieLe?: unknown }).modifieLe;
  return { especes, modifieLe: typeof le === 'string' ? le : null };
}

export function documentArbres(especes: readonly EspeceArbre[], modifieLe: string = new Date().toISOString()): DocumentArbres {
  return { format: FORMAT_ARBRES, version: 1, modifieLe, especes: especes.map((e) => ({ ...e })) };
}

/** Un identifiant libre, tire du nom (« Chêne rouge » → `chene-rouge`), suffixe au besoin. */
export function idDepuisNom(nom: string, pris: ReadonlySet<string>): string {
  const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'arbre';
  let id = base;
  for (let i = 2; pris.has(id); i++) id = base + '-' + i;
  return id;
}

// ---- La bibliotheque chargee -------------------------------------------------------------------

let courante: readonly EspeceArbre[] = [];
const ecouteurs = new Set<() => void>();

/**
 * La bibliotheque en usage : celle du serveur (`admin/arbres`, le fichier data/admin/arbres.json, que l'ecran Admin › Arbres
 * retouche). Le code n'a aucune essence : sans serveur, sans reseau ou sans fichier, elle est vide et les arbres se
 * dessinent en repli (un tronc et une boule).
 */
export function especesChargees(): readonly EspeceArbre[] { return courante; }

/** Pose la bibliotheque en usage, telle quelle : vide, les arbres se dessinent en repli (le temoin des empreintes s'y met). */
export function poserEspeces(especes: readonly EspeceArbre[]): void {
  courante = especes;
  for (const f of [...ecouteurs]) f();
}

/** S'abonne aux changements de la bibliotheque ; rend de quoi s'en desabonner. */
export function surChangementEspeces(f: () => void): () => void {
  ecouteurs.add(f);
  return () => { ecouteurs.delete(f); };
}

export function especeParId(id: string | undefined, especes: readonly EspeceArbre[] = courante): EspeceArbre | null {
  return id ? especes.find((e) => e.id === id) ?? null : null;
}

/** L'essence d'un objet : celle qu'il porte, sinon la premiere de la bibliotheque, sinon rien. */
export function especeDe(o: Pick<ObjetPlan, 'especeArbre'>, especes: readonly EspeceArbre[] = courante): EspeceArbre | null {
  return especeParId(o.especeArbre, especes) ?? especes[0] ?? null;
}

/** L'essence proposee pour une zone BD TOPO : la premiere dont un mot de `natures` figure dans la nature, sinon la premiere. */
export function especeParNature(nature: string | null | undefined, especes: readonly EspeceArbre[] = courante): EspeceArbre | null {
  const n = (nature ?? '').toLowerCase();
  return especes.find((e) => e.natures.some((m) => n.includes(m))) ?? especes[0] ?? null;
}

/** Un caduc est nu de novembre a mars ; une date illisible laisse l'arbre en feuilles. */
export function arbreNu(caduc: boolean, dateStr: string | null | undefined): boolean {
  if (!caduc) return false;
  const mois = parseInt((dateStr ?? '').slice(5, 7), 10);
  return Number.isFinite(mois) && (mois >= 11 || mois <= 3);
}

export function diametreDe(o: Pick<ObjetPlan, 'diametreArbre'>, e: EspeceArbre | null = null): number {
  return nombreFini(o.diametreArbre) && o.diametreArbre > 0 ? o.diametreArbre : e?.diametreM ?? DIAMETRE_DEFAUT_M;
}

// ---- Les tailles : comment la bibliotheque se presente -----------------------------------------

export type TailleArbre = 'petit' | 'moyen' | 'grand' | 'tres-grand';

/** Les classes de taille, de la plus petite a la plus grande : `jusqua` est la hauteur proposee (m) qu'elles couvrent, bornes comprises. */
export const TAILLES: readonly { id: TailleArbre; libelle: string; jusqua: number }[] = [
  { id: 'petit', libelle: 'Petits (jusqu’à 6 m)', jusqua: 6 },
  { id: 'moyen', libelle: 'Moyens (de 6 à 12 m)', jusqua: 12 },
  { id: 'grand', libelle: 'Grands (de 12 à 20 m)', jusqua: 20 },
  { id: 'tres-grand', libelle: 'Très grands (plus de 20 m)', jusqua: Infinity },
];

/** La classe de taille d'une essence, d'apres la hauteur qu'elle propose : une essence retouchee en hauteur change de classe. */
export function tailleDe(e: Pick<EspeceArbre, 'hauteurM'>): (typeof TAILLES)[number] {
  return TAILLES.find((t) => e.hauteurM <= t.jusqua) ?? (TAILLES[TAILLES.length - 1] as (typeof TAILLES)[number]);
}

/** Les essences rangees par classe de taille (les classes vides n'y sont pas), chacune par nom. */
export function especesParTaille<T extends Pick<EspeceArbre, 'hauteurM' | 'nom'>>(especes: readonly T[]): { taille: (typeof TAILLES)[number]; especes: T[] }[] {
  return TAILLES.map((taille) => ({ taille, especes: especes.filter((e) => tailleDe(e) === taille).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) })).filter((g) => g.especes.length > 0);
}
