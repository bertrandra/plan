// Les nombres du tableau de bord de la consommation, a la francaise.
//
// Un cout d'analyse se compte en dixiemes de centime : arrondi au centime, une parcelle a 0,012 $
// et une autre a 0,004 $ afficheraient toutes deux « 0,01 $ ». Sous un dollar, on garde donc quatre
// decimales significatives.

import type { Pas } from '../../model/consommation.js';

const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat('fr-FR', o);
const entier = nf({ maximumFractionDigits: 0 });
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function dollars(x: number): string {
  if (x === 0) return '0 $';
  return (Math.abs(x) < 1 ? nf({ maximumSignificantDigits: 3, maximumFractionDigits: 4 }) : nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 })).format(x) + ' $';
}

export function tokens(n: number): string {
  return entier.format(n);
}

/** Une valeur d'axe, courte : 12 k, 1,2 M ; 0,05 $. */
export function compact(x: number, mesure: 'tokens' | 'cout'): string {
  if (mesure === 'cout') return dollars(x);
  if (x >= 1e6) return nf({ maximumFractionDigits: 1 }).format(x / 1e6) + ' M';
  if (x >= 1e3) return nf({ maximumFractionDigits: 1 }).format(x / 1e3) + ' k';
  return entier.format(x);
}

export function part(x: number): string {
  const p = x * 100;
  return (p > 0 && p < 10 ? nf({ maximumFractionDigits: 1 }).format(p) : entier.format(p)) + ' %';
}

/** Une date `AAAA-MM-JJ` en clair : 13 oct. 2026. */
export function date(jour: string): string {
  if (!jour) return '';
  return Number(jour.slice(8, 10)) + ' ' + MOIS[Number(jour.slice(5, 7)) - 1] + ' ' + jour.slice(0, 4);
}

/** L'etiquette d'un intervalle : « 13 oct. », « sem. du 12 oct. », « oct. 2026 ». */
export function intervalle(cle: string, pas: Pas, court = false): string {
  if (pas === 'mois') return MOIS[Number(cle.slice(5, 7)) - 1] + ' ' + cle.slice(court ? 2 : 0, 4);
  const j = Number(cle.slice(8, 10)) + ' ' + MOIS[Number(cle.slice(5, 7)) - 1];
  return pas === 'semaine' && !court ? 'semaine du ' + j : j;
}

/** Des graduations rondes de 0 a au moins `max` : 1, 2 ou 5 fois une puissance de dix. */
export function graduations(max: number, nombre = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const brut = max / nombre;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= brut) ?? 10 * p;
  const n = Math.ceil(max / pas - 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * pas * 1e9) / 1e9);
}
