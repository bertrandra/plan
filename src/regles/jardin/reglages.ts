// Les seuils des regles de la lecture du jardin (regles/jardin/reglages.json, lot L3) : le lecteur du fichier, qui le refuse s'il est
// mal forme, et son empreinte. Les regles qui les appliquent sont dans facade/regles/jardin.ts ; Admin › Regles les edite ici
// (src/regles/donnees/fichiers.ts), seuil par seuil, avec le meme lecteur.

import { fnv1a } from '../toits/reglages.js';

/** Les seuils, et les bornes de chacun : une valeur hors de ses bornes est refusee. */
export const BORNES_JARDIN = {
  'jardin.ia.passes': [1, 3], 'jardin.ia.certitudeMin': [0, 1], 'jardin.ia.doublonM': [0, 10], 'jardin.ia.limiteM': [0, 10],
  'jardin.ia.horsParcelleM': [0, 20], 'jardin.ia.surfaceMinM2': [0, 100], 'jardin.ia.largeurHaieM': [0.1, 5], 'jardin.ia.hauteurHaieM': [0.2, 10],
  'jardin.ia.largeurCheminM': [0.2, 10], 'jardin.ia.hauteurMuretM': [0.1, 3],
} as const;

export type NomReglageJardin = keyof typeof BORNES_JARDIN;
export type ReglagesJardin = Record<NomReglageJardin, number>;

/** Les seuils d'un fichier ; leve sur un format inconnu, un seuil manquant, inconnu ou hors de ses bornes. */
export function lireReglagesJardin(donnees: unknown): ReglagesJardin {
  const f = donnees as { format?: unknown; seuils?: Record<string, { valeur?: unknown } | null> } | null;
  if (!f || f.format !== 'plan-reglages-jardin' || !f.seuils || typeof f.seuils !== 'object') throw new Error('Réglages de la lecture du jardin : format inconnu.');
  for (const nom of Object.keys(f.seuils)) if (!(nom in BORNES_JARDIN)) throw new Error('Réglages de la lecture du jardin : seuil « ' + nom + ' » inconnu.');
  const v = {} as ReglagesJardin;
  for (const [nom, [min, max]] of Object.entries(BORNES_JARDIN) as [NomReglageJardin, readonly [number, number]][]) {
    const x = f.seuils[nom]?.valeur;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max || (nom === 'jardin.ia.passes' && !Number.isInteger(x))) throw new Error('Réglages de la lecture du jardin : « ' + nom + ' » veut une valeur de ' + min + ' à ' + max + '.');
    v[nom] = x;
  }
  return v;
}

/** L'empreinte des seuils (valeurs triees par nom), gardee avec chaque lecture du jardin enregistree. */
export const empreinteReglagesJardin = (r: ReglagesJardin): string => fnv1a(Object.entries(r).map(([n, x]) => n + '=' + String(x)).sort().join(';'));
