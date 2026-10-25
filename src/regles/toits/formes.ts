// Les seuils de la lecture des formes du catalogue sur la surface LiDAR, sortis du code dans regles/toits/formes.json
// (MD/spec-regles-toits.md §3.2). L'application est dans facade/toits/lectureFormes.ts.
//
// Le fichier est importe, donc compile dans le fichier livre. Depuis que la lecture des toits applique les formes du
// catalogue (facade/regles/toits/catalogue.ts), son empreinte entre dans la version de lecture (`formes` dans
// LECTURES_TOITS, app/toitsLidar.ts) : un seuil change, et les toits deja lus sont relus.

import fichier from '../../../regles/toits/formes.json';
import { fnv1a } from './reglages.js';

export interface DescriptionSeuilForme { valeur: number; unite: string; pourquoi: string }

export const NOMS_SEUILS_FORMES = [
  'PAS_BANDE_M', 'BANDES_MIN', 'ECART_MESURE_MIN_M', 'GAIN_PROFIL', 'ECART_PENTE_MIN_DEG', 'PART_BRIS_MIN', 'PART_BRIS_MAX', 'FLECHE_MIN_M',
  'CREUX_PAPILLON_M', 'PART_NOUE_MIN', 'ZONE_FAITAGE_M', 'CHUTE_DEMI_CROUPE_M', 'PIGNON_DEMI_CROUPE_MIN_M', 'RAPPORT_CARRE_MAX', 'GAIN_REVOLUTION',
  'ELANCEMENT_FLECHE', 'ECART_FORME_MAX_M', 'ECART_FORME_DEMANDEE_M', 'DEPASSEMENT_REVOLUTION_M',
] as const;
export type NomSeuilForme = (typeof NOMS_SEUILS_FORMES)[number];
export type SeuilsFormes = Readonly<Record<NomSeuilForme, number>>;

export class FormesToitsIllisibles extends Error {}
const refus = (m: string): never => { throw new FormesToitsIllisibles('regles/toits/formes.json : ' + m); };

/** Le fichier, verifie : chaque seuil du vocabulaire a une valeur finie, une unite et une raison. */
export function lireFormesToits(donnees: unknown): { seuils: SeuilsFormes; descriptions: Readonly<Record<NomSeuilForme, DescriptionSeuilForme>> } {
  const f = donnees as { format?: unknown; seuils?: Record<string, Partial<DescriptionSeuilForme> | null> } | null;
  if (!f || typeof f !== 'object' || f.format !== 'plan-formes-toits' || !f.seuils) return refus('format inconnu');
  const seuils = {} as Record<NomSeuilForme, number>;
  const descriptions = {} as Record<NomSeuilForme, DescriptionSeuilForme>;
  for (const nom of NOMS_SEUILS_FORMES) {
    const s = f.seuils[nom];
    if (!s || typeof s.valeur !== 'number' || !Number.isFinite(s.valeur) || s.valeur < 0) refus(nom + ' sans valeur positive');
    if (typeof s?.unite !== 'string' || typeof s?.pourquoi !== 'string' || !s.pourquoi.trim()) refus(nom + ' sans unite ou sans raison');
    seuils[nom] = (s as DescriptionSeuilForme).valeur;
    descriptions[nom] = { valeur: (s as DescriptionSeuilForme).valeur, unite: (s as DescriptionSeuilForme).unite, pourquoi: (s as DescriptionSeuilForme).pourquoi };
  }
  for (const nom of Object.keys(f.seuils)) if (!(NOMS_SEUILS_FORMES as readonly string[]).includes(nom)) refus('seuil « ' + nom + ' » inconnu');
  for (const [a, b] of [['PART_BRIS_MIN', 'PART_BRIS_MAX']] as const) if (seuils[a] >= seuils[b]) refus(a + ' doit etre sous ' + b);
  return { seuils, descriptions };
}

/** L'empreinte de ce qui change une lecture : les valeurs des seuils (la raison n'en fait pas partie). */
export function empreinteFormesToits(seuils: SeuilsFormes): string {
  return fnv1a(JSON.stringify(NOMS_SEUILS_FORMES.map((n) => seuils[n])));
}

const lu = lireFormesToits(fichier);
/** Les seuils en vigueur : ceux du depot. */
export const SEUILS_FORMES: SeuilsFormes = Object.freeze(lu.seuils);
export const DESCRIPTION_SEUILS_FORMES: Readonly<Record<NomSeuilForme, DescriptionSeuilForme>> = Object.freeze(lu.descriptions);
export const EMPREINTE_FORMES_TOITS = empreinteFormesToits(SEUILS_FORMES);
