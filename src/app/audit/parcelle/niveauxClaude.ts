// Les niveaux d'ouvertures que Claude compte sur les facades, confrontes a la hauteur a l'egout proposee.
//
// Sur un long pan (une facade qui ne ferme pas un bout du faitage, `bout: sans-objet`), toutes les
// ouvertures sont sous l'egout : N niveaux demandent au moins N fois la hauteur d'un niveau le plus bas
// (HAUTEUR_NIVEAU_MIN_M, regles/facades/reglages.json, le meme seuil que la disposition des fenetres).
// Un pignon, lui, porte des fenetres au-dessus de l'egout : il ne compte pas. Ce n'est qu'une reserve sur
// la ligne de la hauteur, jamais une hauteur : Claude ne mesure rien.

import { valeursFacadesDe } from '../../../regles/facades/reglages.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import type { ObjetPlan } from '../../../model/types.js';
import type { Proposition } from '../../../regles/decisions.js';

const fr = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',');

/** Le plus de niveaux d'ouvertures que Claude compte sur un long pan, et ce long pan ; null sans long pan compte. */
export function niveauxSousEgout(v: VoteAnalyse): { niveaux: number; facade: string } | null {
  let meilleur: { niveaux: number; facade: string } | null = null;
  for (const f of v.facades) {
    const n = f.niveaux.valeur;
    if (f.bout.valeur === 'sans-objet' && typeof n === 'number' && n > 0 && (!meilleur || n > meilleur.niveaux)) meilleur = { niveaux: n, facade: f.facade };
  }
  return meilleur;
}

/** La reserve d'une hauteur a l'egout trop basse pour les niveaux que Claude voit ; null quand elle les loge. */
export function reserveNiveaux(o: ObjetPlan, v: VoteAnalyse, hauteurM: number): string | null {
  const vus = niveauxSousEgout(v);
  if (!vus) return null;
  const min = vus.niveaux * valeursFacadesDe(o).HAUTEUR_NIVEAU_MIN_M;
  if (hauteurM >= min) return null;
  return 'Claude voit ' + vus.niveaux + (vus.niveaux > 1 ? ' niveaux' : ' niveau') + ' d’ouvertures sur la façade ' + vus.facade + ' : il leur faut au moins ' + fr(min) + ' m à l’égout.';
}

/** Les propositions de hauteur a l'egout, avec la reserve des niveaux que Claude voit. */
export function avecReserveDesNiveaux(propositions: readonly Proposition[], objets: readonly ObjetPlan[], votes: Readonly<Record<string, VoteAnalyse>>): Proposition[] {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  return propositions.map((p) => {
    if (p.effet.type !== 'hauteur' || p.cible.type !== 'batiment') return p;
    const o = parCle.get(p.cible.cle), v = votes[p.cible.cle];
    const r = o && v ? reserveNiveaux(o, v, p.effet.hauteurM) : null;
    return r ? { ...p, reserve: p.reserve ? p.reserve + ' ' + r : r } : p;
  });
}
