// Le vote du toit lu sur une facade (lot L2 de MD/spec-lecture-ia-elargie.md §5.1, point 2) : la troisieme requete sur l'image du run
// lit la couverture, sa pose, le debord, le faitage, la gouttiere, et les fenetres de toit et panneaux solaires du pan. Les memes
// regles que la lecture enrichie (voteEnrichi.ts) : le mot de la majorite (plus de la moitie des passes), `indetermine` (null) sans
// majorite ; un element n'est garde que vu par plus de la moitie des passes, a la mediane de ses cotes. Puis le toit vote se pose sur
// les observations du run (avecToitLu) sans rien y changer d'autre. Pas d'escalade : celle du run ne lit pas ces champs.
// Pur ; les seuils sont ceux du run (regles/facades/ia.json).

import { mediane } from '../../../util/stats.js';
import { grouper, motVote, recouvrement } from './voteEnrichi.js';
import type { ReglagesIa } from '../../../regles/facades/ia.js';
import type { ElementToitIa, LectureToit, ObservationsFacade } from '../../../regles/facades/observations.js';

const med = (l: readonly number[]) => Math.round(mediane(l) * 1000) / 1000;
const etendue = (a: { u0: number; u1: number }) => ({ u0: a.u0, u1: a.u1, v0: 0, v1: 1 });

/** Le toit lu de plusieurs passes, vote ; sa seule passe telle quelle ; null sans passe lisible. */
export function voterLectureToit(rs: readonly LectureToit[], r: ReglagesIa): LectureToit | null {
  if (rs.length <= 1) return rs[0] ?? null;
  const t = rs.map((x) => x.toit);
  return {
    toit: {
      couverture: motVote(t.map((x) => x.couverture)), pose: motVote(t.map((x) => x.pose)), debord: motVote(t.map((x) => x.debord)),
      faitage: motVote(t.map((x) => x.faitage)), gouttiere: motVote(t.map((x) => x.gouttiere)),
      confiance: motVote(t.map((x) => (x.confiance === 'indetermine' ? null : x.confiance))) ?? 'indetermine',
    },
    elements: grouper(rs.map((x) => x.elements), (a, b) => a.element === b.element && recouvrement(etendue(a), etendue(b)) >= r['facades.ia.voteMemeEtendue'])
      .map((g): ElementToitIa => ({
        element: (g[0] as ElementToitIa).element, u0: med(g.map((x) => x.u0)), u1: med(g.map((x) => x.u1)), v: med(g.map((x) => x.v)),
        confiance: motVote(g.map((x) => (x.confiance === 'indetermine' ? null : x.confiance))) ?? 'indetermine',
      })).sort((a, b) => a.u0 - b.u0),
  };
}

/** Les observations du run, avec le toit lu vote : rien d'autre ne change. */
export function avecToitLu(obs: ObservationsFacade, lu: LectureToit): ObservationsFacade {
  return { ...obs, toit: lu.toit, elementsToit: lu.elements };
}
