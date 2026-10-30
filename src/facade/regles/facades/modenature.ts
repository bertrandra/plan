// Les regles de la modenature et de ce qui est pose contre le mur (lot L1 de MD/spec-lecture-ia-elargie.md §3.1, §4.2, §5.1) : ce que
// le moteur decide de la modenature et des appendices lus par le run d'une facade.
// - Les hauteurs lues sont des parts de l'egout (decision 4) : elles deviennent des metres par le calage du mur (`egoutM`) ;
// - une descente d'eau pluviale n'est retenue que si la detection voit une verticale a sa place (`verticaleVue`, a 30 cm pres) ;
// - un store est porte par le mur (il va dans la Facade, `appendices`) ; un perron, une unite exterieure, une boite aux lettres sont
//   des objets du plan (un equipement, qui ne charge rien), proposes contre le mur. L'etat du mur : etat.ts. Pur.

import { verticaleVue, type CartesAretes } from '../../detection/recalageIa.js';
import type { AppendiceFacade, ModenatureFacade } from '../../../model/types.js';
import type { AppendiceIa, ObservationsFacade } from '../../../regles/facades/observations.js';

const cm = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Une descente retrouvee a plus de cela de la place que Claude dit n'est pas la sienne. */
export const DESCENTE_ECART_M = 0.3;
/** Une genoise a de un a quatre rangs. */
const RANGS_GENOISE = { min: 1, max: 4 } as const;

/** Les descentes que Claude voit (en part du mur) et que la detection retrouve, en part du mur ; vide sans aretes. */
export function descentesRetrouvees(us: readonly number[], cartes: CartesAretes | null, largeurM: number): number[] {
  if (!cartes || !(largeurM > 0)) return [];
  return us.filter((u) => { const x = verticaleVue(cartes, u * largeurM); return x !== null && Math.abs(x - u * largeurM) <= DESCENTE_ECART_M; }).map(r3);
}

/**
 * La modenature d'un mur de `largeurM` sur `egoutM` metres, d'apres le run ; null quand il n'en dit rien. `descentes` : celles que la
 * detection a retrouvees (en part du mur) ; null : aucune n'est retenue (pas d'aretes pour les confirmer).
 */
export function modenatureDeLIa(obs: ObservationsFacade | null, mur: { largeurM: number; egoutM: number }, descentes: readonly number[] | null): ModenatureFacade | null {
  const m = obs?.modenature;
  if (!m) return null;
  const out: ModenatureFacade = { source: 'ia' };
  if (m.egout) out.egout = m.egout;
  if (m.egout === 'genoise' && m.rangsGenoise !== null && m.rangsGenoise >= RANGS_GENOISE.min && m.rangsGenoise <= RANGS_GENOISE.max) out.rangsGenoise = m.rangsGenoise;
  // Un bandeau sous l'egout et au-dessus du sol : au-dela, ce n'est pas un bandeau de ce mur.
  const bandeaux = m.bandeaux.filter((v) => v > 0.05 && v < 0.98).map((v) => cm(v * mur.egoutM));
  if (bandeaux.length) out.bandeauxM = bandeaux;
  if (m.chaines) out.chaines = m.chaines;
  if (m.encadrements) out.encadrements = m.encadrements;
  if (m.soubassement && m.soubassement !== 'aucun' && m.soubassement.haut < 0.6) out.soubassement = { hauteurM: cm(m.soubassement.haut * mur.egoutM), ...(m.soubassement.parement ? { parement: m.soubassement.parement } : {}) };
  const ds = (descentes ?? []).filter((u) => m.descentes.some((x) => Math.abs(x - u) * mur.largeurM <= DESCENTE_ECART_M)).map((u) => cm(u * mur.largeurM));
  if (ds.length) out.descentesM = ds;
  return Object.keys(out).length > 1 ? out : null;
}

/** Les stores que le mur porte, en metres (lot L1) : de leur bord gauche, sur leur largeur, a la hauteur de leur caisson. */
export function appendicesDeLIa(obs: ObservationsFacade | null, mur: { largeurM: number; egoutM: number }): AppendiceFacade[] {
  return (obs?.appendices ?? []).filter((a) => a.nature === 'store' && a.confiance !== 'faible')
    .map((a) => ({ nature: 'store' as const, xM: cm(a.u0 * mur.largeurM), largeurM: cm((a.u1 - a.u0) * mur.largeurM), hauteurM: cm(a.v1 * mur.egoutM), source: 'ia' as const }))
    .filter((a) => a.largeurM >= 0.5);
}

/** Ce qui est pose contre le mur et qui est un objet du plan (perron, unite exterieure, boite aux lettres), tel que lu. */
export type EquipementLu = AppendiceIa & { nature: Exclude<AppendiceIa['nature'], 'store'> };
export const equipementsLus = (obs: ObservationsFacade | null): EquipementLu[] =>
  (obs?.appendices ?? []).filter((a): a is EquipementLu => a.nature !== 'store' && a.confiance !== 'faible');

const EGOUTS: Readonly<Record<string, string>> = { corniche: 'corniche', genoise: 'génoise' };

/** La modenature en clair, pour l'ecran : « génoise à 2 rangs, 1 bandeau, chaînes en pierre, 1 descente ». */
export function direModenature(m: ModenatureFacade | null | undefined, stores = 0): string | null {
  const b: string[] = [];
  if (m?.egout && EGOUTS[m.egout]) b.push(EGOUTS[m.egout] + (m.rangsGenoise ? ' à ' + m.rangsGenoise + ' rang' + (m.rangsGenoise > 1 ? 's' : '') : ''));
  if (m?.bandeauxM?.length) b.push(m.bandeauxM.length + ' bandeau' + (m.bandeauxM.length > 1 ? 'x' : ''));
  if (m?.chaines && m.chaines !== 'aucune') b.push('chaînes d’angle en ' + m.chaines);
  if (m?.encadrements && m.encadrements !== 'aucun') b.push('encadrements en ' + m.encadrements);
  if (m?.soubassement) b.push('soubassement de ' + String(m.soubassement.hauteurM).replace('.', ',') + ' m');
  if (m?.descentesM?.length) b.push(m.descentesM.length + ' descente' + (m.descentesM.length > 1 ? 's' : ''));
  if (stores) b.push(stores + ' store' + (stores > 1 ? 's' : ''));
  return b.length ? b.join(', ') : null;
}
