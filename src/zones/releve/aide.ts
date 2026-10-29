// Le releve de facade (zones/Releve.tsx) et l'aide de Claude (MD/spec-facades-calage-detection.md §12 bis, lot L18 ; depuis le lot
// F2 de MD/spec-facade-calage-audit.md, le run unique d'une facade, une passe au lieu de trois) : ce que Plan fait de sa reponse, sans
// React, testable seul.
// - A l'etape des coins : les angles du mur que Claude situe sur la photo deviennent des graines de coins, rattachees aux croisements
//   de segments de la photo ; seuls les coins predits sont remplaces, jamais un coin trouve sur la photo ni pose au doigt.
// - A la verification : ses boites accordees avec la detection (facade/detection/runFacade.ts : cochees quand la detection les
//   retrouve, seules decochees), et la proposition de l'analyse mise a jour, pour que les corrections tracees a la validation
//   comparent la personne a ce que Plan et Claude proposaient ensemble.

import { cartesAretes, recalerCoins } from '../../facade/detection/recalageIa.js';
import type { ObservationsFacade } from '../../regles/facades/observations.js';
import { accorderOuvertures, coinsDeLIa, type AccordIa } from '../../facade/regles/facades/ia.js';
import { detecterSegments } from '../../facade/vision/segments.js';
import { signauxDeLaFacade, texteSignaux, type SituationFacade } from '../../facade/detection/signaux.js';
import type { SourceCoin } from '../../facade/calage/calageFin.js';
import type { Image } from '../../facade/vision/homographie.js';
import type { OuvertureFacade } from '../../model/types.js';
import type { Morceau } from '../../facade/releve/serie.js';

/** Ce que l'analyse a propose : les ouvertures cochees et les devinees decochees. */
export interface Proposition {
  cochees: OuvertureFacade[];
  decochees: OuvertureFacade[];
}

/** Les signaux de l'etape des coins : ceux du calage fin de la photo courante. */
export function signauxDesCoins(m: Morceau | undefined): SituationFacade[] {
  if (!m || m.recherche || m.decrochement) return [];
  const sources = m.sources ?? ['predit', 'predit', 'predit', 'predit'];
  // Tous les coins poses au doigt : la personne a tranche, Claude n'a plus rien a dire des coins.
  if (sources.every((s) => s === 'doigt')) return [];
  const fin = m.fin;
  return signauxDeLaFacade({ calage: { note: fin?.note ?? 0, trouve: fin?.trouve ?? false, sources: sources.map((s) => (s === 'doigt' || s === 'claude' ? 'trouve' : s)) } });
}

/**
 * La part du mur cachee sur toutes les vues d'une fusion a partir de laquelle l'aide est proposee a la
 * verification (lot G20). Plus bas que les 30 % du signal « facade mal vue » (F§12 bis), qui comptent
 * aussi le mur hors des photos : la personne a deja pris plusieurs vues pour voir derriere l'obstacle,
 * et ce qui reste cache partout est justement la ou une baie se devine sans se voir. Un dixieme du mur,
 * c'est deja la place d'une fenetre derriere une voiture.
 */
export const MASQUE_NOTABLE = 0.1;

/**
 * Les signaux de la verification : la confiance des ouvertures proposees, les baies devinees, une
 * facade en partie cachee. `masque` est la part du mur cachee sur toutes les vues d'une fusion (0 pour
 * une photo seule) : des `MASQUE_NOTABLE`, la facade compte pour mal vue.
 */
export function signauxDeVerification(e: { ouvertures: readonly OuvertureFacade[]; devinees: readonly OuvertureFacade[]; largeurM: number; couverture: number; masque?: number }): SituationFacade[] {
  const masque = e.masque ?? 0;
  const s = signauxDeLaFacade({ ouvertures: e.ouvertures, devinees: e.devinees.filter((o) => o.source === 'devinee').length, largeurM: e.largeurM, cache: Math.max(1 - e.couverture, masque) });
  if (masque >= MASQUE_NOTABLE && !s.includes('malVue')) s.unshift('malVue');
  return s;
}

/**
 * Pourquoi l'aide est proposee, en clair. Avec un masque de fusion, « facade en grande partie cachee »
 * dirait trop (un dixieme du mur suffit) : la part cachee sur toutes les photos est dite telle quelle.
 */
export function motifAide(signaux: readonly SituationFacade[], masque = 0): string {
  return signaux.map((x) => (x === 'malVue' && masque > 0 ? `${Math.round(masque * 100)} % du mur caché sur toutes les photos` : texteSignaux([x]))).join(', ');
}

/**
 * Le morceau une fois les angles de Claude recales : chaque angle donne deux graines (a l'egout et au sol) ; un coin predit dont la
 * graine se rattache a un croisement de segments devient `claude` ; les autres coins ne bougent pas. Rend aussi le nombre de coins
 * recales.
 */
export function coinsAvecAide(m: Morceau, reponse: ObservationsFacade, largeurM: number, hauteurM: number): { morceau: Morceau; recales: number } {
  const img = m.prise.photo.image;
  const graines = coinsDeLIa(reponse, img);
  if (!graines.some((g) => g)) return { morceau: m, recales: 0 };
  const recal = recalerCoins(graines, detecterSegments(img), largeurM, hauteurM, img, m.coins);
  const sources: SourceCoin[] = [...(m.sources ?? ['predit', 'predit', 'predit', 'predit'])];
  const coins = m.coins.map((c, k) => {
    const r = recal[k];
    if (!r || sources[k] === 'trouve' || sources[k] === 'doigt') return c;
    sources[k] = 'claude';
    return r.point;
  });
  const recales = sources.filter((s, k) => s === 'claude' && (m.sources ?? [])[k] !== 'claude').length;
  return { morceau: { ...m, coins, sources }, recales };
}

/** Les ouvertures de la verification une fois les boites de Claude accordees avec la detection, sur l'elevation redressee du releve. */
export function ouverturesAvecAide(e: { ouvertures: readonly OuvertureFacade[]; devinees: readonly OuvertureFacade[]; reponse: ObservationsFacade; elevation: Image | null; largeurM: number; hauteurM: number }): AccordIa {
  const cartes = e.elevation ? cartesAretes(e.elevation, e.elevation.largeur / e.largeurM) : null;
  return accorderOuvertures({ ouvertures: e.ouvertures, decochees: e.devinees, observations: e.reponse, cartes, largeurM: e.largeurM, hauteurM: e.hauteurM });
}

/** Ce que le releve reprend de l'aide de Claude : les ouvertures cochees, les decochees, celles retirees (aucune depuis le run unique). */
export type OuverturesAidees = Pick<AccordIa, 'ouvertures' | 'decochees' | 'retirees'>;

const meme = (a: OuvertureFacade, b: OuvertureFacade) => a.x === b.x && a.y === b.y && a.l === b.l && a.h === b.h;

/**
 * La proposition de l'analyse une fois l'aide appliquee : les baies retirees passent decochees, ses ajouts y entrent (coches ou en
 * pointille). Ce que la personne a pose ou corrige n'y entre pas : ses gestes restent des corrections.
 */
export function propositionRenforcee(p: Proposition, r: OuverturesAidees): Proposition {
  const cochees: OuvertureFacade[] = [];
  const decochees: OuvertureFacade[] = [...p.decochees.filter((o) => !r.ouvertures.some((x) => meme(x, o)))];
  for (const o of p.cochees) {
    if (r.retirees.some((x) => meme(x, o))) { decochees.push(o); continue; }
    cochees.push(r.ouvertures.find((x) => meme(x, o) && x.source === 'claude') ?? o);
  }
  // Une devinee que Claude confirme passe cochee.
  for (const o of p.decochees) if (r.ouvertures.some((x) => meme(x, o))) cochees.push(o);
  const ajout = (x: OuvertureFacade) => x.source === 'claude' && !p.cochees.some((o) => meme(o, x));
  cochees.push(...r.ouvertures.filter(ajout));
  decochees.push(...r.decochees.filter((x) => x.source === 'claude'));
  return { cochees, decochees };
}
