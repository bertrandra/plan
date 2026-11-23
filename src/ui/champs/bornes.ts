// Les bornes d'un nombre de l'inspecteur, et ce qu'on en dit a la personne (ui/champs/).
//
// Un champ declare `min` et `max` ; jusqu'a l'audit de l'inspecteur du 22 novembre 2026 (lot A3), seul le pas a pas du tactile les
// respectait : au clavier, un entraxe de 3 cm ou de −10 cm passait, et une valeur refusee par le champ revenait sans un mot. Ces
// fonctions disent si une saisie sort des bornes declarees, et ecrivent la phrase montree sous le champ (« Entre 20 et 150 cm »).
//
// Elles ne jugent que ce qui est SAISI. La valeur que porte un projet n'est jamais corrigee : hors bornes, elle s'affiche et se
// calcule comme avant, tant qu'on n'y touche pas.

import type { ChampNombre } from './types.js';

/** Un nombre ecrit a la francaise, sans zeros inutiles (0.05 → « 0,05 », 20 → « 20 »). */
const fr = (v: number): string => String(Math.round(v * 1e6) / 1e6).replace('.', ',');
const avecUnite = (ch: ChampNombre, v: number): string => fr(v) + (ch.unite ? ' ' + ch.unite : '');

/** La saisie sort-elle des bornes declarees ? Jamais pour un champ aux bornes indicatives. */
export function horsBornes(ch: ChampNombre, v: number): boolean {
  if (ch.bornesIndicatives) return false;
  return (ch.min !== undefined && v < ch.min) || (ch.max !== undefined && v > ch.max);
}

/** Les bornes en une phrase : « Entre 20 et 150 cm », « Au moins 20 cm », « Au plus 6 m » ; vide sans borne. */
export function phraseBornes(ch: ChampNombre): string {
  if (ch.min !== undefined && ch.max !== undefined) return 'Entre ' + fr(ch.min) + ' et ' + avecUnite(ch, ch.max);
  if (ch.min !== undefined) return 'Au moins ' + avecUnite(ch, ch.min);
  if (ch.max !== undefined) return 'Au plus ' + avecUnite(ch, ch.max);
  return '';
}

/**
 * Ce qui s'ecrit sous le champ quand une saisie est refusee : les bornes quand elle en sort, sinon la raison que le champ donne
 * (`raisonRefus`), sinon une phrase generale. Le champ garde alors la valeur d'avant.
 */
export function messageRefus(ch: ChampNombre, v: number): string {
  if (horsBornes(ch, v)) return phraseBornes(ch);
  return ch.raisonRefus ?? 'Cette valeur n’est pas possible ici : le champ garde la précédente.';
}

/** Le pas d'un champ : celui qu'il declare, sinon sa derniere decimale, sinon 1. */
export function increment(ch: ChampNombre): number {
  return ch.pas ?? (ch.decimales ? Math.pow(10, -ch.decimales) : 1);
}

/** Le pas est-il a sa borne dans ce sens ? « − » se grise au minimum, « + » au maximum. */
export function aLaBorne(ch: ChampNombre, valeur: number, sens: 1 | -1): boolean {
  return sens > 0 ? (ch.max !== undefined && valeur >= ch.max) : (ch.min !== undefined && valeur <= ch.min);
}

/**
 * La valeur apres un pas, ou `null` a la borne. Le pas reste dans les bornes, comme il l'a toujours fait : d'une valeur hors
 * bornes (un ancien projet), le premier pas vers elles s'y pose — c'est un geste de la personne, pas une correction d'office,
 * et un champ dont l'ecriture refuse tout ce qui en sort resterait bloque sans cela.
 */
export function valeurApresPas(ch: ChampNombre, valeur: number, sens: 1 | -1, facteur = 1): number | null {
  if (aLaBorne(ch, valeur, sens)) return null;
  const inc = increment(ch);
  let v = valeur + sens * inc * facteur;
  if (ch.min !== undefined) v = Math.max(ch.min, v);
  if (ch.max !== undefined) v = Math.min(ch.max, v);
  const d = ch.decimales ?? (String(inc).split('.')[1]?.length ?? 0);
  return Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
}

/**
 * Le pas grandit quand on maintient « − » ou « + » (audit de l'inspecteur, decision B4) : un pas pour les premieres repetitions,
 * qui laissent viser une valeur proche, puis deux, cinq et dix pas a la fois. Passer un entraxe de 125 a 20 cm demandait 21
 * touchers ; maintenu, c'est moins de deux secondes. `repetition` compte les pas repetes d'un meme appui, le premier exclu.
 */
export function facteurDePas(repetition: number): number {
  if (repetition < 6) return 1;
  if (repetition < 16) return 2;
  if (repetition < 30) return 5;
  return 10;
}

/** Au-dela, un curseur ne vise plus une valeur : chaque pixel sauterait plusieurs pas. */
const PAS_MAX_CURSEUR = 400;

/**
 * Le nombre se regle aussi au curseur (decision B4) : seulement quand ses deux bornes sont declarees, et fermes, et qu'elles
 * tiennent en un nombre raisonnable de pas (une pente, un niveau, un entraxe borne). Sans borne haute, un curseur inventerait une
 * limite ; aux bornes indicatives, il interdirait ce que la saisie permet.
 */
export function avecCurseur(ch: ChampNombre): boolean {
  if (ch.bornesIndicatives || ch.min === undefined || ch.max === undefined || !(ch.max > ch.min)) return false;
  const pas = (ch.max - ch.min) / increment(ch);
  return pas >= 2 && pas <= PAS_MAX_CURSEUR;
}

/** La valeur que le curseur montre : celle du projet, ramenee dans les bornes (un ancien projet peut en sortir). */
export function valeurDuCurseur(ch: ChampNombre, valeur: number): number {
  const min = ch.min ?? valeur, max = ch.max ?? valeur;
  return Number.isFinite(valeur) ? Math.min(max, Math.max(min, valeur)) : min;
}
