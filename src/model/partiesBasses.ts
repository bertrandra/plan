// Les parties basses d'un mur releve : une, comme depuis le schema 2 (`partieBasse`), ou plusieurs (`partiesBasses`, schema 13).
//
// Un mur dont la partie haute est au milieu, avec une partie basse a chaque bout (une maison entre un garage et un appentis), a
// plusieurs parties basses. Le releve en garde la liste ; mais un mur en L, le cas de loin le plus frequent, s'ecrit toujours dans
// le champ d'avant : un fichier qui n'a qu'une partie basse par mur reste au plus petit schema qui le decrit (model/migrations.ts),
// s'ouvre dans un Plan d'avant et y rend les memes nombres. Seul un mur a deux parties basses ou plus monte le fichier au schema 13,
// qu'un Plan d'avant refuse d'ouvrir plutot que d'en perdre une.
//
// Tout ce qui lit ou ecrit une partie basse passe par ici : `partiesBassesDu` pour lire (une liste, vide sans partie basse), et
// `champsDesPartiesBasses` / `partiesBassesTransformees` pour ecrire. Aucun lecteur ne regarde les deux champs a la main.

import type { PartieBasse } from './typesReleve.js';

/** Ce qui porte des parties basses : un releve, une mesure, un resultat d'analyse. */
export interface PorteurDePartiesBasses {
  partieBasse?: PartieBasse | null;
  partiesBasses?: readonly PartieBasse[] | null;
}

const valide = (p: unknown): p is PartieBasse => {
  const x = p as PartieBasse | null | undefined;
  return !!x && typeof x === 'object' && [x.debut, x.fin, x.hauteur].every((v) => typeof v === 'number' && Number.isFinite(v)) && x.fin > x.debut;
};

/**
 * Les parties basses, de gauche a droite et sans recouvrement : une partie qui commence avant la fin de la precedente commence a
 * cette fin, et celle qui n'a plus de largeur tombe. Une liste deja rangee est rendue avec les memes nombres.
 */
export function rangerPartiesBasses(parties: readonly PartieBasse[]): PartieBasse[] {
  const triees = parties.filter(valide).map((p) => ({ ...p })).sort((a, b) => a.debut - b.debut || a.fin - b.fin);
  const out: PartieBasse[] = [];
  for (const p of triees) {
    const avant = out[out.length - 1];
    const debut = avant && p.debut < avant.fin ? avant.fin : p.debut;
    if (p.fin > debut) out.push(debut === p.debut ? p : { ...p, debut });
  }
  return out;
}

/** Les parties basses d'un releve, de gauche a droite ; vide sans partie basse. */
export function partiesBassesDu(r: PorteurDePartiesBasses | null | undefined): PartieBasse[] {
  if (!r) return [];
  if (Array.isArray(r.partiesBasses) && r.partiesBasses.length) return rangerPartiesBasses(r.partiesBasses);
  // Une partie basse seule est lue telle quelle, comme avant le schema 13 : memes nombres pour un fichier d'avant.
  return r.partieBasse && typeof r.partieBasse === 'object' ? [r.partieBasse] : [];
}

/**
 * Les deux champs d'un releve pour ces parties basses : aucune, `partieBasse: null` ; une, `partieBasse` (la forme d'avant le
 * schema 13) ; plusieurs, `partiesBasses` et `partieBasse: null`. A poser sur le releve en retirant `partiesBasses` quand il est
 * absent du resultat (`avecPartiesBasses`).
 */
export function champsDesPartiesBasses(parties: readonly PartieBasse[]): { partieBasse: PartieBasse | null; partiesBasses?: PartieBasse[] } {
  const r = rangerPartiesBasses(parties);
  if (r.length >= 2) return { partieBasse: null, partiesBasses: r };
  return { partieBasse: r[0] ?? null };
}

/** Le releve avec ces parties basses, dans la forme que `champsDesPartiesBasses` donne (un `partiesBasses` d'avant retire). */
export function avecPartiesBasses<T extends PorteurDePartiesBasses>(r: T, parties: readonly PartieBasse[]): T {
  const champs = champsDesPartiesBasses(parties);
  const out = { ...r, ...champs } as T;
  if (!champs.partiesBasses) delete out.partiesBasses;
  return out;
}

/**
 * Les champs de partie basse d'un releve dont chaque partie est transformee par `f` (mise a l'echelle d'un mur qui change de
 * longueur ou de hauteur), dans la forme ou le releve les porte : rien quand il n'en a pas, `partieBasse` seule pour une, la liste pour
 * plusieurs. Un releve d'avant garde ainsi sa forme et ses nombres.
 */
export function partiesBassesTransformees(r: PorteurDePartiesBasses, f: (p: PartieBasse) => PartieBasse): { partieBasse?: PartieBasse; partiesBasses?: PartieBasse[] } {
  if (Array.isArray(r.partiesBasses) && r.partiesBasses.length) return { partiesBasses: r.partiesBasses.map(f) };
  return r.partieBasse ? { partieBasse: f(r.partieBasse) } : {};
}

/** Un releve qui porte la forme du schema 13 (plusieurs parties basses) : un lecteur 12 la perdrait. */
export function porteDesPartiesBasses(f: unknown): boolean {
  const x = f as { partiesBasses?: unknown } | null | undefined;
  return !!x && typeof x === 'object' && Array.isArray(x.partiesBasses) && x.partiesBasses.length > 0;
}

/** La liste lue d'un fichier : les parties valides, rangees ; null quand il n'en reste aucune. */
export function partiesBassesLues(v: unknown): PartieBasse[] | null {
  if (!Array.isArray(v)) return null;
  const r = rangerPartiesBasses(v.filter(valide));
  return r.length ? r : null;
}
