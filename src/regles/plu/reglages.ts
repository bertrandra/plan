// Les seuils de la lecture du PLU et du controle du projet (regles/plu/reglages.json, lot L4) : le lecteur du fichier, qui le refuse
// s'il est mal forme. Les regles qui les appliquent sont dans engine/regles/plu/conformite.ts ; la lecture (le nombre de pages
// envoyees) dans app/plu/lecturePlu.ts.

import donnees from '../../../regles/plu/reglages.json';

/** Les seuils, et les bornes de chacun : une valeur hors de ses bornes est refusee. */
export const BORNES_PLU = {
  'plu.pagesMax': [1, 60],
  'plu.toleranceHauteurM': [0, 0.5],
  'plu.toleranceDistanceM': [0, 0.5],
  'plu.tolerancePart': [0, 0.05],
  'plu.toleranceAngleDeg': [0, 5],
} as const;

export type NomReglagePlu = keyof typeof BORNES_PLU;
export type ReglagesPlu = Record<NomReglagePlu, number>;

/** Les seuils d'un fichier ; leve sur un format inconnu, un seuil manquant, inconnu ou hors de ses bornes. */
export function lireReglagesPlu(d: unknown): ReglagesPlu {
  const f = d as { format?: unknown; seuils?: Record<string, { valeur?: unknown } | null> } | null;
  if (!f || f.format !== 'plan-reglages-plu' || !f.seuils || typeof f.seuils !== 'object') throw new Error('Réglages du PLU : format inconnu.');
  for (const nom of Object.keys(f.seuils)) if (!(nom in BORNES_PLU)) throw new Error('Réglages du PLU : seuil « ' + nom + ' » inconnu.');
  const v = {} as ReglagesPlu;
  for (const [nom, [min, max]] of Object.entries(BORNES_PLU) as [NomReglagePlu, readonly [number, number]][]) {
    const x = f.seuils[nom]?.valeur;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max || (nom === 'plu.pagesMax' && !Number.isInteger(x))) throw new Error('Réglages du PLU : « ' + nom + ' » veut une valeur de ' + min + ' à ' + max + '.');
    v[nom] = x;
  }
  return v;
}

/** Les seuils livres (compiles dans le programme, comme ceux des toits). */
export const REGLAGES_PLU: ReglagesPlu = lireReglagesPlu(donnees);
