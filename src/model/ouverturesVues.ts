// Ce que Claude voit des ouvertures d'une facade (vitrage, ouvrant, porte d'entree, porte de garage, couleur
// des volets), dans le vocabulaire des details du releve (`DetailsOuverture`, model/types.ts).
//
// Claude decrit la majorite des ouvertures d'une facade, pas chacune : ces details ne completent que celles
// qui n'en ont pas, et seulement du type qu'ils concernent (une porte n'a pas de petits bois, une fenetre pas
// de remplissage). `mixte`, `sans-objet` et `indetermine` ne se traduisent pas : ils ne disent rien a poser.

import { PALETTE_FACADES } from '../regles/facades/palette.js';
import type { DetailsOuverture, TypeOuverture } from './types.js';
import { citer, motConnu, signalerMotInconnu } from '../shell/motsInconnus.js';

/**
 * Les couleurs de volets que Claude nomme, et la couleur qui en tient lieu dans le dessin : celle de la palette des facades
 * (regles/facades/reglages.json, lot L1), une seule table pour l'analyse d'une maison et le run d'une facade.
 */
const LIBELLES_VOLETS: readonly [string, string][] = [
  ['blanc', 'blancs'], ['creme', 'crème'], ['gris-clair', 'gris clair'], ['gris-fonce', 'gris foncé'], ['bleu', 'bleus'], ['vert', 'verts'],
  ['rouge', 'rouges'], ['brun', 'bruns'], ['bois', 'bois naturel'], ['noir', 'noirs'],
];
export const COULEURS_VOLETS: readonly { code: string; libelle: string; couleur: string }[] = LIBELLES_VOLETS.map(([code, libelle]) => ({ code, libelle, couleur: PALETTE_FACADES[code] as string }));

export const VITRAGES_VUS: Readonly<Record<string, NonNullable<DetailsOuverture['vitrage']>>> = { plein: 'plein', 'petits-bois': 'petits-bois', 'imposte-petits-bois': 'imposte-petits-bois' };
export const OUVRANTS_VUS: Readonly<Record<string, NonNullable<DetailsOuverture['ouvrant']>>> = { battants: 'battants', coulissant: 'coulissant', guillotine: 'guillotine', soufflet: 'soufflet', fixe: 'fixe' };
export const PORTES_VUES: Readonly<Record<string, NonNullable<DetailsOuverture['remplissage']>>> = { pleine: 'pleine', vitree: 'vitree', 'semi-vitree': 'semi-vitree' };
export const GARAGES_VUS: Readonly<Record<string, NonNullable<DetailsOuverture['garage']>>> = { sectionnelle: 'sectionnelle', basculante: 'basculante', battants: 'battants', enroulable: 'enroulable' };

/** Les details qui valent pour chaque type d'ouverture : ce qu'un detail de facade peut completer. */
export const DETAILS_PAR_TYPE: Readonly<Record<TypeOuverture, readonly (keyof DetailsOuverture)[]>> = {
  fenetre: ['volets', 'forme', 'vitrage', 'ouvrant', 'couleurVolets'],
  'porte-fenetre': ['volets', 'forme', 'vitrage', 'ouvrant', 'couleurVolets'],
  porte: ['remplissage'],
  garage: ['garage'],
};

/** Les details d'une ouverture, completes de ceux de la facade qui valent pour son type et qu'elle n'a pas encore. */
export function completerDetails(type: TypeOuverture, details: DetailsOuverture | undefined, facade: DetailsOuverture): DetailsOuverture | null {
  // Le type d'une ouverture relevee se lit dans le fichier, tel quel (model/facadeObjet.ts ne le verifie pas) : hors catalogue,
  // la table ne rendait rien a parcourir et la validation d'un audit plantait. L'ouverture reste alors telle qu'elle est.
  if (!motConnu(DETAILS_PAR_TYPE, type)) {
    signalerMotInconnu('Ouverture inconnue (' + citer(type) + '), laissée sans les détails de la façade.');
    return null;
  }
  const ajout: DetailsOuverture = {};
  for (const k of DETAILS_PAR_TYPE[type]) {
    const v = facade[k];
    if (v !== undefined && details?.[k] === undefined) (ajout as Record<string, unknown>)[k] = v;
  }
  // Une couleur de volets ne se pose que sur une baie qui a des volets.
  const volets = details?.volets ?? ajout.volets;
  if (!volets || volets === 'aucun') delete ajout.couleurVolets;
  // Une guillotine ou un soufflet n'est pas une porte-fenetre : on ne l'ecrit que sur une fenetre.
  if (type === 'porte-fenetre' && (ajout.ouvrant === 'guillotine' || ajout.ouvrant === 'soufflet')) delete ajout.ouvrant;
  return Object.keys(ajout).length ? { ...details, ...ajout } : null;
}
