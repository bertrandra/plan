// La profondeur d'une saillie vue sur une facade (lot L1 de MD/spec-lecture-ia-elargie.md §4.2, risque 3) : une vue de face ne la
// montre pas, c'est donc un reglage par genre (regles/facades/reglages.json, `saillies`), pas une constante, dit dans la proposition.
// Un genre absent du fichier n'a pas de valeur ici : la regle (facade/regles/toits/sailliesDesMurs.ts) reprend alors celle d'une
// saillie posee a la main au Mode Toit, la valeur d'avant le reglage (aucune empreinte ne bouge).

import fichier from '../../../regles/facades/reglages.json';

/** Les genres de saillie que le run d'une facade lit. */
export const GENRES_SAILLIE_LUE = ['bow-window', 'galerie', 'auvent', 'appentis'] as const;
export type GenreSaillieReglee = (typeof GENRES_SAILLIE_LUE)[number];

/**
 * Les profondeurs d'un fichier de reglages, en metres, par genre ; un genre absent n'y est pas. Leve sur une profondeur qui n'est pas
 * un nombre positif ou sur un genre inconnu (une faute de frappe ne doit pas passer pour un repli silencieux).
 */
export function lireProfondeursSaillies(donnees: unknown): Readonly<Partial<Record<GenreSaillieReglee, number>>> {
  const p = (donnees as { saillies?: { profondeursM?: unknown } } | null)?.saillies?.profondeursM;
  if (p === undefined) return {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('regles/facades/reglages.json : saillies.profondeursM doit etre un objet');
  const out: Partial<Record<GenreSaillieReglee, number>> = {};
  for (const [genre, v] of Object.entries(p)) {
    if (!(GENRES_SAILLIE_LUE as readonly string[]).includes(genre)) throw new Error('regles/facades/reglages.json : genre de saillie inconnu « ' + genre + ' »');
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error('regles/facades/reglages.json : la profondeur de « ' + genre + ' » doit etre un nombre positif');
    out[genre as GenreSaillieReglee] = v;
  }
  return out;
}

/** Les profondeurs livrees. */
export const PROFONDEURS_SAILLIES = lireProfondeursSaillies(fichier);
