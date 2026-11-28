// La pile d'une session d'edition du toit (le controleur, facade/modeToit/controleurToit.ts) : des instantanes des seuls champs du toit.
//
// Annuler, retablir et « revenir au depart » se jouent la ; valider ecrit l'etat final dans le projet en une seule etape d'historique,
// abandonner remet le depart. Pur : pas de DOM, pas de scene. Les instantanes sont des copies profondes (JSON), jamais des references.

import type { ChampsBatiment, ObjetPlan } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';

/**
 * Les champs d'un batiment qu'un geste du toit peut changer, la liste unique : un instantane les photographie tous, Abandonner les rend
 * tous (revue d'architecture du 28 novembre 2026, constat 1 : « Règles » retirait `toitMesure` et `toitLidarLu`, qu'aucun instantane
 * ne gardait). Tout geste ecrit par le controleur, qui ne touche que ces champs ; un test le verifie sur le batiment entier. La hauteur
 * a l'egout (`elevation`, a plat sur l'objet, et sa marque `egoutChoisi`) en est : la poignee « Hauteur à l'égout » du corps principal
 * l'ecrit.
 */
export const CHAMPS_DU_TOIT = ['corpsToit', 'toit', 'modeToit', 'toitFige', 'volumesToit', 'egoutChoisi', 'toitMesure', 'toitLidarLu'] as const;
export type ChampsToit = Partial<Pick<ChampsBatiment, typeof CHAMPS_DU_TOIT[number]>> & { elevation?: number };

/** Une copie profonde des champs du toit (sous-objet `batiment`, et l'elevation). Un champ absent reste absent, un champ nul reste nul. */
export function photographier(o: ObjetPlan): ChampsToit {
  const c: Record<string, unknown> = {};
  const b = o.batiment ?? {};
  // Un champ a `null` reste a `null` : le depart se rend au bit pres, absent et null ne se confondent pas.
  for (const k of CHAMPS_DU_TOIT) if (b[k] !== undefined) c[k] = JSON.parse(JSON.stringify(b[k]));
  if (typeof o.elevation === 'number') c.elevation = o.elevation;
  return c as ChampsToit;
}

/** Remet un instantane dans le batiment : les champs absents de l'instantane sont retires. */
export function restaurer(o: ObjetPlan, c: ChampsToit): void {
  const source = c as Record<string, unknown>;
  // Un batiment sans sous-objet `batiment`, rendu a un instantane sans champ du toit, n'en recoit pas un vide : au bit pres.
  if (o.batiment || CHAMPS_DU_TOIT.some((k) => source[k] !== undefined)) {
    const cible = champsBatiment(o) as unknown as Record<string, unknown>;
    for (const k of CHAMPS_DU_TOIT) {
      if (source[k] === undefined) delete cible[k];
      else cible[k] = JSON.parse(JSON.stringify(source[k]));
    }
  }
  if (c.elevation === undefined) delete o.elevation;
  else o.elevation = c.elevation;
}

/** L'ordre des cles de l'objet et de son sous-objet `batiment` : rendu avec le depart, il rend un fichier identique octet pour octet. */
export interface OrdreDesCles { objet: string[]; batiment: string[] | null }
export const ordreDe = (o: ObjetPlan): OrdreDesCles => ({ objet: Object.keys(o), batiment: o.batiment ? Object.keys(o.batiment) : null });

/** Remet les cles de l'objet et de son batiment dans l'ordre `ordre` (les cles nouvelles a la fin) : les valeurs ne changent pas. */
export function reordonner(o: ObjetPlan, ordre: OrdreDesCles): void {
  const trier = (x: Record<string, unknown>, cles: string[]) => {
    const vu = { ...x };
    for (const k of Object.keys(x)) delete x[k];
    for (const k of [...cles.filter((c) => c in vu), ...Object.keys(vu).filter((c) => !cles.includes(c))]) x[k] = vu[k];
  };
  if (o.batiment && ordre.batiment) trier(o.batiment as unknown as Record<string, unknown>, ordre.batiment);
  trier(o as unknown as Record<string, unknown>, ordre.objet);
}

export const egaux = (a: ChampsToit, b: ChampsToit): boolean => JSON.stringify(a) === JSON.stringify(b);

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
