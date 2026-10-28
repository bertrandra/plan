// La session d'edition du toit d'un batiment (mode Toit de la Vue 3D, MD/spec-mode-toit-3d.md).
//
// Une session retouche le toit d'un batiment sur place, sans toucher a l'historique du projet : elle garde sa
// propre pile d'instantanes des seuls champs du toit. Annuler, retablir et « revenir au depart » se jouent la ; valider
// ecrit l'etat final dans le projet en une seule etape d'historique, abandonner remet le depart.
//
// Pur : pas de DOM, pas de scene. Les instantanes sont des copies profondes (JSON), jamais des references.

import type { ChampsBatiment, CorpsToit, ObjetPlan } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';

/**
 * Les champs d'un batiment que le mode Toit peut changer : tout le reste du batiment est hors session. La hauteur a l'egout
 * (`elevation`, a plat sur l'objet, et sa marque `egoutChoisi`) en est : la poignee « Hauteur à l'égout » du corps principal l'ecrit.
 */
const CHAMPS = ['corpsToit', 'toit', 'modeToit', 'toitFige', 'volumesToit', 'egoutChoisi'] as const;
export type ChampsToit = Partial<Pick<ChampsBatiment, typeof CHAMPS[number]>> & { elevation?: number };

/** Une copie profonde des champs du toit (sous-objet `batiment`, et l'elevation). Un champ absent reste absent. */
export function photographier(o: ObjetPlan): ChampsToit {
  const c: Record<string, unknown> = {};
  const b = o.batiment ?? {};
  for (const k of CHAMPS) if (b[k] !== undefined && b[k] !== null) c[k] = JSON.parse(JSON.stringify(b[k]));
  if (typeof o.elevation === 'number') c.elevation = o.elevation;
  return c as ChampsToit;
}

/** Remet un instantane dans le batiment : les champs absents de l'instantane sont retires. */
export function restaurer(o: ObjetPlan, c: ChampsToit): void {
  const cible = champsBatiment(o) as unknown as Record<string, unknown>, source = c as Record<string, unknown>;
  for (const k of CHAMPS) {
    if (source[k] === undefined) delete cible[k];
    else cible[k] = JSON.parse(JSON.stringify(source[k]));
  }
  if (c.elevation === undefined) delete o.elevation;
  else o.elevation = c.elevation;
}

/**
 * Un geste du mode ecrit le batiment : ses corps, et la marque qui les garde (la personne a regle le toit, aucune lecture ne le
 * reprend). Une hauteur a l'egout donnee (celle du corps principal) s'ecrit comme le champ « Élévation » de l'inspecteur : elle porte
 * `egoutChoisi: 'saisie'`, qui la garde aussi quand les « Règles » rallumees rendent le toit a la lecture.
 */
export function ecrireLeGeste(o: ObjetPlan, corps: CorpsToit[], elevation?: number): void {
  const b = champsBatiment(o);
  b.corpsToit = corps;
  b.toitFige = true;
  if (elevation !== undefined) { o.elevation = elevation; b.egoutChoisi = 'saisie'; }
}

const egaux = (a: ChampsToit, b: ChampsToit) => JSON.stringify(a) === JSON.stringify(b);

/** La pile de la session : `pas[0]` est le depart, `i` l'instantane courant. */
export interface HistoriqueToit { pas: ChampsToit[]; i: number }

export function creerHistorique(o: ObjetPlan): HistoriqueToit {
  return { pas: [photographier(o)], i: 0 };
}

/** Range l'etat courant du batiment comme nouvelle etape ; vrai s'il a change (un geste sans effet n'empile rien). */
export function empiler(h: HistoriqueToit, o: ObjetPlan): boolean {
  const c = photographier(o);
  if (egaux(c, h.pas[h.i] as ChampsToit)) return false;
  h.pas = h.pas.slice(0, h.i + 1);
  h.pas.push(c);
  h.i = h.pas.length - 1;
  return true;
}

export const peutAnnuler = (h: HistoriqueToit): boolean => h.i > 0;
export const peutRetablir = (h: HistoriqueToit): boolean => h.i < h.pas.length - 1;
/** La session a-t-elle change quelque chose par rapport au depart ? */
export const aChange = (h: HistoriqueToit): boolean => !egaux(h.pas[h.i] as ChampsToit, h.pas[0] as ChampsToit);

export function annuler(h: HistoriqueToit, o: ObjetPlan): boolean {
  if (!peutAnnuler(h)) return false;
  h.i--;
  restaurer(o, h.pas[h.i] as ChampsToit);
  return true;
}

export function retablir(h: HistoriqueToit, o: ObjetPlan): boolean {
  if (!peutRetablir(h)) return false;
  h.i++;
  restaurer(o, h.pas[h.i] as ChampsToit);
  return true;
}

/** « Revenir au depart » : le depart redevient l'etat courant, comme une etape que Ctrl+Z peut defaire. */
export function revenirAuDepart(h: HistoriqueToit, o: ObjetPlan): boolean {
  if (!aChange(h)) return false;
  restaurer(o, h.pas[0] as ChampsToit);
  return empiler(h, o);
}
