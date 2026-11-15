// Quel mur chaque image du banc montre (demande du proprietaire, 15 novembre 2026 : « niveau suivant » n° 4, et « Avoid having 2 times
// the same building »). A l'import, chaque vue garde dans ses metadonnees le mur qu'elle regarde (`MetaImage.mur` : le batiment de la
// BD TOPO, le cote par lequel on le voit, le segment du contour, la distance, l'incidence, la note, et ce que la BD TOPO dit du
// batiment). Ici, ce qu'on en tire une fois les images dans le banc : les murs deja presents (l'import ne les propose plus coches), les
// doublons (le meme mur en plusieurs images, a voir ensemble pour en ecarter : rien ne se supprime d'office), les images d'un meme
// mur rangees de gauche a droite (l'ordre de la fusion), et le type de batiment (pour l'ecran d'equilibre). Sans DOM, testable seul.

import type { MetaImage, MurDeVue } from './types.js';

/** Le mur d'une vue : le batiment et le cote par lequel on le voit. La meme cle que le tri de l'import (meilleuresVues.ts::facadeDe). */
export const cleDuMur = (m: Pick<MurDeVue, 'batiment' | 'cote'>): string => m.batiment + '/' + m.cote;

/** Les images qui comptent : une image rejetee ne montre plus son mur a personne (elle attend d'etre supprimee). */
const vivante = (m: MetaImage): boolean => m.statut !== 'rejetee';

/** Les murs que le banc a deja, et leurs images (hors rejetees). */
export function mursDuBanc(images: readonly MetaImage[]): Map<string, MetaImage[]> {
  const par = new Map<string, MetaImage[]>();
  for (const m of images) {
    if (!m.mur || !vivante(m)) continue;
    const k = cleDuMur(m.mur), l = par.get(k);
    if (l) l.push(m); else par.set(k, [m]);
  }
  return par;
}

export interface GroupeDeMur { cle: string; batiment: string; cote: number; images: MetaImage[] }

/** Le travail deja fait sur une image : on ne jette pas un marquage relu pour garder une image a peine importee. */
const AVANCEMENT: Record<MetaImage['statut'], number> = { rejetee: 0, importee: 1, redressee: 2, validee: 3, brouillon: 4, corrigee: 5 };

/**
 * Les doublons deja dans le banc : les murs qui ont plusieurs images, les plus fournis d'abord ; dans chaque groupe, celle qu'on
 * garderait en tete (la plus avancee dans le travail, puis la mieux notee), puis les autres. Rien n'est ecarte ici : l'ecran les montre
 * ensemble et la personne decide.
 */
export function doublonsDuBanc(images: readonly MetaImage[]): GroupeDeMur[] {
  return [...mursDuBanc(images)].filter(([, l]) => l.length > 1)
    .map(([cle, l]) => ({ cle, batiment: (l[0]?.mur as MurDeVue).batiment, cote: (l[0]?.mur as MurDeVue).cote, images: [...l].sort((a, b) => AVANCEMENT[b.statut] - AVANCEMENT[a.statut] || (b.mur?.note ?? -1) - (a.mur?.note ?? -1) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => b.images.length - a.images.length || a.cle.localeCompare(b.cle));
}

/** Le nombre d'images en trop : pour chaque mur en double, toutes sauf une. */
export const imagesEnTrop = (groupes: readonly GroupeDeMur[]): number => groupes.reduce((n, g) => n + g.images.length - 1, 0);

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Les images d'un meme mur, de gauche a droite pour qui lui fait face : l'ordre dans lequel la fusion les assemble. Le mur regarde vers
 * `azimut` (sa normale sortante) ; qui lui fait face a sa droite vers `azimut - 90`. Une prise de vue plus a droite montre la partie
 * droite du mur. Sans azimut du mur ou sans position, l'ordre d'arrivee est garde.
 */
export function deGaucheADroite(images: readonly MetaImage[]): MetaImage[] {
  const azimut = images.find((m) => typeof m.mur?.azimut === 'number')?.mur?.azimut;
  if (typeof azimut !== 'number') return [...images];
  const dx = Math.sin(rad(azimut - 90)), dy = Math.cos(rad(azimut - 90));
  const place = (m: MetaImage) => (typeof m.lat === 'number' && typeof m.lon === 'number' ? m.lon * Math.cos(rad(m.lat)) * dx + m.lat * dy : null);
  return images.map((m, rang) => ({ m, rang, p: place(m) })).sort((a, b) => (a.p === null || b.p === null ? a.rang - b.rang : a.p - b.p || a.rang - b.rang)).map((x) => x.m);
}

/** Les groupes « meme mur » d'une liste d'images (un ecran : celles a redresser), les plus fournis d'abord, chacun de gauche a droite ; les murs seuls n'en font pas. */
export function memesMurs(images: readonly MetaImage[]): GroupeDeMur[] {
  const par = new Map<string, MetaImage[]>();
  for (const m of images) { if (!m.mur) continue; const k = cleDuMur(m.mur); par.set(k, [...(par.get(k) ?? []), m]); }
  return [...par].filter(([, l]) => l.length > 1).map(([cle, l]) => ({ cle, batiment: (l[0]?.mur as MurDeVue).batiment, cote: (l[0]?.mur as MurDeVue).cote, images: deGaucheADroite(l) }))
    .sort((a, b) => b.images.length - a.images.length || a.cle.localeCompare(b.cle));
}

/**
 * La liste rangee par mur : les images d'un meme mur a la suite (de gauche a droite), les murs les plus fournis d'abord, puis les images
 * seules et celles sans mur connu, dans leur ordre d'arrivee.
 */
export function rangerParMur(images: readonly MetaImage[]): MetaImage[] {
  const groupes = memesMurs(images);
  const dedans = new Set(groupes.flatMap((g) => g.images.map((m) => m.id)));
  return [...groupes.flatMap((g) => g.images), ...images.filter((m) => !dedans.has(m.id))];
}

export type TypeDeBatiment = 'maison' | 'immeuble' | 'commerce' | 'autre' | 'inconnu';
export const TYPES_DE_BATIMENT: readonly { cle: TypeDeBatiment; libelle: string }[] = [
  { cle: 'maison', libelle: 'Maison' }, { cle: 'immeuble', libelle: 'Immeuble' }, { cle: 'commerce', libelle: 'Commerce ou services' },
  { cle: 'autre', libelle: 'Autre usage' }, { cle: 'inconnu', libelle: 'Usage non renseigné' },
];
/** Au-dela, un batiment d'habitation est un immeuble : plus de deux logements, ou plus de deux etages, ou plus haut que cela sans autre indice. */
export const HAUTEUR_IMMEUBLE_M = 10;

/**
 * Le type d'un batiment d'apres ce que la BD TOPO en dit (usage, logements, etages, hauteur) : une heuristique simple, pas un modele.
 * Un commerce en rez-de-chaussee d'immeuble d'habitation reste un immeuble (l'usage « Résidentiel » passe d'abord). Sans usage dit
 * (« Indifférencié », frequent a la campagne), la hauteur et les etages tranchent entre maison et immeuble s'ils sont connus.
 */
export function typeDeBatiment(m: Pick<MurDeVue, 'usage' | 'usage2' | 'logements' | 'etages' | 'hauteur'>): TypeDeBatiment {
  const usages = [m.usage, m.usage2].filter((u): u is string => !!u && u !== 'Indifférencié');
  const haut = (m.logements ?? 0) > 2 || (m.etages ?? 0) > 2 || ((m.hauteur ?? 0) > HAUTEUR_IMMEUBLE_M && !(m.logements === 1 || m.logements === 2));
  if (usages.includes('Résidentiel') || (m.logements ?? 0) > 0) return haut ? 'immeuble' : 'maison';
  if (usages.includes('Commercial et services')) return 'commerce';
  if (usages.length) return 'autre';
  if (typeof m.hauteur === 'number' || typeof m.etages === 'number') return haut ? 'immeuble' : 'maison';
  return 'inconnu';
}

/**
 * Les images dont le mur peut se retrouver apres coup (importees avant que l'import ne le garde) : elles ont une position et un cap,
 * et pas encore de mur. Une image dont le rattrapage n'a rien trouve (`murCherche`) ne se redemande pas a chaque fois.
 */
export const aRattraper = (images: readonly MetaImage[]): MetaImage[] =>
  images.filter((m) => vivante(m) && !m.mur && !m.murCherche && typeof m.lat === 'number' && typeof m.lon === 'number' && typeof m.azimut === 'number' && m.redressement?.methode !== 'fusion');
