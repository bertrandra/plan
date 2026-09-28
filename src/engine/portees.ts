// Sections, portees et charges : ce qu'une piece de bois porte, et sur quelle distance.
//
// Extrait de structure.ts sans retouche (architecture.md §9, FF-1) : construction, bom, debit et
// structure en avaient tous besoin, et le lire chez structure les faisait tourner en rond. Ce module
// ne depend que des constantes ; tout le moteur peut s'y adresser sans creer de cycle.

import { PLOT_ENTRAXE_MAX_M, estPlots } from './constantes.js';
import type { Construction } from '../model/types.js';

// Nominal section of a solive in mm, laid on edge: b = width, h = height.
/** Les dimensions d'une section de bois, en millimetres : base et hauteur. */
export interface DimsSection { b: number; h: number }
const DIMS_45X70: DimsSection = {b:45,h:70};
export const SOLIVE_SECTION_DIMS: Record<string, DimsSection> = {
  '40x60':{b:40,h:60}, '45x45':{b:45,h:45},
  '45x70':DIMS_45X70, '45x95':{b:45,h:95}, '63x175':{b:63,h:175}
};
// Lambourdes carry only the lames over a short span, so the range starts smaller than for the
// solives; the bigger sections stay available for a build where they share one section.
export const LAMBOURDE_SECTIONS = ['40x60','45x45','45x70','45x95','63x175'];
/** Les dimensions d'une section ; celles du 45x70, la section par defaut, si elle n'est pas connue. */
export function dimsSection(sec: string | undefined): DimsSection { return SOLIVE_SECTION_DIMS[sec ?? ''] || DIMS_45X70; }
export function sectionLambourde(c: Construction): string { return c.lambourdeSection || c.soliveSection || '45x70'; }
// Bending deflection makes the admissible span of a beam vary as (E*I/charge)^(1/3); with
// I = b*h^3/12 and the load carried proportional to the entraxe, that collapses to
//     portee = K * h * (b/entraxe)^(1/3)
// K is calibrated against trade practice rather than derived, so that the two reference cases
// come out right: a 45x70 at 70 cm entraxe lands on the 70 cm between supports that NF DTU
// 51.4 caps lambourdes at, and a 45x145 at 70 cm lands on the ~1.50 m used for solives borne
// on foundation screws. Both give K = 25.8 with lengths in mm.
// This is a pre-dimensioning aid on a 250 kg/m2 basis, not a substitute for a design note.
export const PORTEE_VIS_K = 25.8;
// The load K was calibrated against. Asking for more than this shortens the admissible span by
// the cube root of the ratio, which is the same exponent the rest of the formula runs on.
export const CHARGE_REF = 250;
export const CHARGE_NORMALE_DEFAUT = 250;
export const CHARGE_SPA_DEFAUT = 500;   // spa rempli + occupe : ~1,5 a 2 t sur 3 a 4 m2
export function maxPorteeVisM(c: Construction): number {
  const dims = dimsSection(c.soliveSection);
  const entraxeMm = Math.max(200, (c.soliveEntraxe||40)*10);
  const k = c.kPortee || PORTEE_VIS_K;
  const q = Math.max(50, c.chargeNormale || CHARGE_NORMALE_DEFAUT);
  const mm = k * dims.h * Math.cbrt(dims.b/entraxeMm) * Math.cbrt(CHARGE_REF/q);
  return Math.max(0.5, Math.min(2.5, mm/1000));
}
// Distance allowed between two screws along one solive: derived from the section by default,
// or forced by hand when the user knows better than the table.
export function porteeVisM(c: Construction): number {
  return c.visModeAuto===false ? Math.max(0.3, (c.visEntraxe||100)/100) : maxPorteeVisM(c);
}
// Distance entre deux appuis, quel que soit le mode de fondation. Sur vis, la section decide.
// Sur plots, le NF DTU 51.4 plafonne a 70 cm sous lambourdes quoi qu'en dise la section : un
// plot ne se compare pas a une vis, c'est l'appui du platelage lui-meme.
export function porteeAppuiM(c: Construction): number {
  if(!estPlots(c)) return porteeVisM(c);
  if(c.plotEntraxeAuto === false){
    return Math.max(0.2, Math.min(PLOT_ENTRAXE_MAX_M, (c.plotEntraxe||65)/100));
  }
  // La piece posee sur les plots est la solive en structure double, la lambourde sinon.
  // Sans section, la portee se lit sur celle par defaut : `dimsSection` fait le meme repli.
  const sec = c.plotAvecSolives ? (c.soliveSection ?? '45x70') : sectionLambourde(c);
  const ent = c.plotAvecSolives ? (c.soliveEntraxe||40) : maxEntraxeLameCm(c);
  return Math.min(PLOT_ENTRAXE_MAX_M, maxPorteeVisM({ ...c, soliveSection:sec, soliveEntraxe:ent }));
}
// Nom du poste d'appui, pour les libelles partages entre les deux modes.
export function libelleAppui(c: Construction, pluriel: boolean): string {
  return estPlots(c) ? (pluriel ? 'plots' : 'plot') : (pluriel ? 'vis' : 'vis');
}
// Spacing under a spa. Rather than a bare number, it is the same span shortened for the heavier
// load it has to carry - so raising the target load tightens the grid on its own.
export function porteeVisSpaM(c: Construction): number {
  const span = porteeVisM(c);
  if(c.visModeAuto===false) return Math.min(span, Math.max(0.2, (c.visEntraxeZoneSpa||60)/100));
  const qN = Math.max(50, c.chargeNormale || CHARGE_NORMALE_DEFAUT);
  const qS = Math.max(qN, c.chargeSpa || CHARGE_SPA_DEFAUT);
  return Math.max(0.2, Math.min(span, span * Math.cbrt(qN/qS)));
}
// NF DTU 51.4 sets the spacing of the supports under a lame from its thickness, width and
// class. Across the usual range the table collapses to a near-constant ratio - 22 mm goes with
// 40 cm, 24 mm with 45 cm, 27 mm with 50 cm - that is, about 18.5 times the thickness.
export const ENTRAXE_LAME_K = 18.5;
// Composite creeps a great deal more than timber; dense tropicals rather less.
// Meme raison que pour ESSENCE_PRICES : la clef vient du projet, et la lecture porte son repli.
export const LAME_RAIDEUR: Record<string, number> = { 'pin-classe4':1.00, 'douglas':1.00, 'exotique':1.05, 'composite':0.80, 'autre':1.00 };
/** Le coefficient de raideur d'une essence ; 1 si elle n'est pas au tableau. */
export function raideurDe(essence: string | undefined): number { return LAME_RAIDEUR[essence ?? ''] ?? 1; }
// Furthest apart the supports carrying the lames may sit - the lambourdes when there are any,
// otherwise the solives themselves. Rounded to 5 cm because that is how a deck gets set out.
export function coefRaideurLame(c: Construction): number {
  return (c.coefRaideurLame !== undefined && c.coefRaideurLame !== null)
    ? c.coefRaideurLame : raideurDe(c.essenceBois);
}
export function maxEntraxeLameCm(c: Construction): number {
  const ep = Math.max(15, c.epaisseurLame||25);
  const k = Math.max(0.3, Math.min(2, coefRaideurLame(c)));
  const K = c.kEntraxeLame || ENTRAXE_LAME_K;
  return Math.max(30, Math.min(55, Math.round(ep*K*k/10/5)*5));
}
