// Les seuils des regles du run d'une facade (regles/facades/ia.json, lot F2 de MD/spec-facade-calage-audit.md) : le lecteur du
// fichier, qui le refuse s'il est mal forme, et son empreinte. Les regles qui les appliquent sont dans facade/regles/facades/ia.ts ;
// Admin › Regles les edite ici (src/regles/donnees/fichiers.ts), seuil par seuil, avec le meme lecteur.

import { fnv1a } from '../toits/reglages.js';

/** Les seuils, et les bornes de chacun : une valeur hors de ses bornes est refusee (une part va de 0 a 1). */
export const BORNES_IA = {
  'facades.ia.voteMemeU': [0, 1], 'facades.ia.voteMemeBaie': [0.05, 1], 'facades.ia.voteMemeEtendue': [0.05, 1],
  'facades.ia.colombagePartMax': [0.1, 1], 'facades.ia.colombageTolerancePart': [0, 0.2],
  'facades.ia.baieRetrouvee': [0.05, 1], 'facades.ia.devineeConfirmee': [0.05, 1], 'facades.ia.baieMinM': [0, 3], 'facades.ia.confianceSeule': [0, 1],
  'facades.ia.pointeEcartU': [0, 0.5], 'facades.ia.pointeEcartHauteur': [0, 1],
} as const;

export type NomReglageIa = keyof typeof BORNES_IA;
export type ReglagesIa = Record<NomReglageIa, number>;

/** Les seuils d'un fichier ; leve sur un format inconnu, un seuil manquant, inconnu ou hors de ses bornes. */
export function lireReglagesIa(donnees: unknown): ReglagesIa {
  const f = donnees as { format?: unknown; seuils?: Record<string, { valeur?: unknown } | null> } | null;
  if (!f || f.format !== 'plan-reglages-ia-facade' || !f.seuils || typeof f.seuils !== 'object') throw new Error('Réglages du run d’une façade : format inconnu.');
  for (const nom of Object.keys(f.seuils)) if (!(nom in BORNES_IA)) throw new Error('Réglages du run d’une façade : seuil « ' + nom + ' » inconnu.');
  const v = {} as ReglagesIa;
  for (const [nom, [min, max]] of Object.entries(BORNES_IA) as [NomReglageIa, readonly [number, number]][]) {
    const x = f.seuils[nom]?.valeur;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error('Réglages du run d’une façade : « ' + nom + ' » veut une valeur de ' + min + ' à ' + max + '.');
    v[nom] = x;
  }
  return v;
}

/** L'empreinte des seuils (valeurs triees par nom), inscrite dans un rejeu de la calibration en mode « IA ». */
export const empreinteReglagesIa = (r: ReglagesIa): string => fnv1a(Object.entries(r).map(([n, x]) => n + '=' + String(x)).sort().join(';'));
