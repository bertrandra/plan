// Le vote et l'escalade de la facade enrichie (lot L1 de MD/spec-lecture-ia-elargie.md §5.1, points 2 et 6) : les champs que le run
// d'une facade lit en plus des ouvertures (la menuiserie, les volets et le garde-corps de chaque baie ; les saillies, les decroches, la
// modenature, ce qui est pose contre le mur, l'etat du mur). Les memes regles que le reste du run (facade/regles/facades/ia.ts) :
// - le vote : la mediane des positions, le mot de la majorite (plus de la moitie des passes), `indetermine` (null) sans majorite ; un
//   element d'une liste n'est garde que vu par plus de la moitie des passes ;
// - l'escalade : la ou elle dit autre chose que le vote, elle l'emporte ; un mot qu'elle ne dit pas (null) ne contredit rien.
// Pur ; les seuils sont ceux du run (regles/facades/ia.json).

import { voterAttribut } from '../../../model/analyseClaude.js';
import { mediane } from '../../../util/stats.js';
import type { ReglagesIa } from '../../../regles/facades/ia.js';
import type { AppendiceIa, BoiteUV, DecrocheIa, DetailsLus, EtatIa, ModenatureIa, ObservationsFacade, OuvertureIa, SaillieIa } from '../../../regles/facades/observations.js';

const IND = 'indetermine';
const med = (l: readonly number[]) => Math.round(mediane(l) * 1000) / 1000;

/** Le mot de la majorite des passes (null compte comme un silence), ou null. */
export function motVote<T extends string | number>(l: readonly (T | null)[]): T | null {
  const v = voterAttribut<T | typeof IND>(l.map((x) => (x === null ? IND : x)), l.map(() => []), IND).valeur;
  return v === IND ? null : v;
}

/** Une hauteur ou une place dite par plus de la moitie des passes : leur mediane ; null sinon. */
export function nombreVote(l: readonly (number | null)[]): number | null {
  const vus = l.filter((x): x is number => x !== null);
  return vus.length * 2 > l.length ? med(vus) : null;
}

export function recouvrement(a: BoiteUV, b: BoiteUV): number {
  const iu = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0), iv = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
  if (iu <= 0 || iv <= 0) return 0;
  const inter = iu * iv;
  return inter / ((a.u1 - a.u0) * (a.v1 - a.v0) + (b.u1 - b.u0) * (b.v1 - b.v0) - inter);
}

/** Les elements des passes groupes (un par passe au plus) ; seuls restent les groupes vus par plus de la moitie d'elles. */
export function grouper<T>(passes: readonly (readonly T[])[], meme: (a: T, b: T) => boolean): T[][] {
  const groupes: { passes: Set<number>; membres: T[] }[] = [];
  passes.forEach((l, p) => {
    for (const x of l) {
      const g = groupes.find((y) => !y.passes.has(p) && meme(y.membres[0] as T, x));
      if (g) { g.passes.add(p); g.membres.push(x); } else groupes.push({ passes: new Set([p]), membres: [x] });
    }
  });
  return groupes.filter((g) => g.passes.size * 2 > passes.length).map((g) => g.membres);
}

const confianceVotee = (l: readonly { confiance: SaillieIa['confiance'] }[]) => motVote(l.map((x) => (x.confiance === IND ? null : x.confiance))) ?? IND;
const etendue = (a: { u0: number; u1: number }): BoiteUV => ({ u0: a.u0, u1: a.u1, v0: 0, v1: 1 });

/** Les details lus d'une baie, votes entre les passes qui l'ont vue ; null quand aucune n'en dit (des reponses d'avant le lot). */
export function voterDetailsLus(l: readonly (DetailsLus | undefined)[]): DetailsLus | null {
  const d = l.filter((x): x is DetailsLus => !!x);
  if (!d.length) return null;
  return {
    menuiserie: { materiau: motVote(d.map((x) => x.menuiserie.materiau)), couleur: motVote(d.map((x) => x.menuiserie.couleur)) },
    couleurVolets: motVote(d.map((x) => x.couleurVolets)),
    gardeCorps: { type: motVote(d.map((x) => x.gardeCorps.type)), haut: nombreVote(d.map((x) => x.gardeCorps.haut)), couleur: motVote(d.map((x) => x.gardeCorps.couleur)) },
  };
}

function voterModenature(l: readonly (ModenatureIa | null)[], r: ReglagesIa): ModenatureIa | null {
  const m = l.filter((x): x is ModenatureIa => !!x);
  if (m.length * 2 <= l.length) return null;
  const sb = m.map((x) => (x.soubassement === null ? null : x.soubassement === 'aucun' ? 'aucun' : 'oui'));
  const presence = motVote(sb);
  const vus = m.map((x) => x.soubassement).filter((x): x is Exclude<ModenatureIa['soubassement'], 'aucun' | null> => !!x && x !== 'aucun');
  const liste = (k: 'bandeaux' | 'descentes', pres: number) => grouper(m.map((x) => x[k]), (a, b) => Math.abs(a - b) <= pres).map(med).sort((a, b) => a - b);
  return {
    egout: motVote(m.map((x) => x.egout)), rangsGenoise: motVote(m.map((x) => x.rangsGenoise)),
    bandeaux: liste('bandeaux', r['facades.ia.voteMemeV']),
    chaines: motVote(m.map((x) => x.chaines)), encadrements: motVote(m.map((x) => x.encadrements)),
    soubassement: presence === 'aucun' ? 'aucun' : presence === 'oui' ? { haut: med(vus.map((x) => x.haut)), parement: motVote(vus.map((x) => x.parement)) } : null,
    descentes: liste('descentes', r['facades.ia.voteMemeU']),
  };
}

/** Les champs enrichis de plusieurs passes, votes (les ouvertures, elles, sont votees par ia.ts et recoivent `voterDetailsLus`). */
export function voterEnrichi(rs: readonly ObservationsFacade[], r: ReglagesIa): Pick<ObservationsFacade, 'saillies' | 'decroches' | 'modenature' | 'appendices' | 'etat'> {
  const memeE = r['facades.ia.voteMemeEtendue'], memeU = r['facades.ia.voteMemeU'], memeBaie = r['facades.ia.voteMemeBaie'];
  const boite = <T extends BoiteUV>(g: readonly T[]) => ({ u0: med(g.map((x) => x.u0)), u1: med(g.map((x) => x.u1)), v0: med(g.map((x) => x.v0)), v1: med(g.map((x) => x.v1)) });
  return {
    saillies: grouper(rs.map((x) => x.saillies), (a, b) => a.genre === b.genre && recouvrement(etendue(a), etendue(b)) >= memeE).map((g): SaillieIa => {
      const p = g[0] as SaillieIa;
      return {
        genre: p.genre, u0: med(g.map((x) => x.u0)), u1: med(g.map((x) => x.u1)), forme: motVote(g.map((x) => x.forme)) ?? p.forme, niveau: motVote(g.map((x) => x.niveau)) ?? p.niveau,
        toit: motVote(g.map((x) => x.toit)) ?? p.toit, haut: nombreVote(g.map((x) => x.haut)), couverture: motVote(g.map((x) => x.couverture)), confiance: confianceVotee(g),
      };
    }).sort((a, b) => a.u0 - b.u0),
    decroches: grouper(rs.map((x) => x.decroches), (a, b) => a.sens === b.sens && Math.abs(a.u - b.u) <= memeU)
      .map((g): DecrocheIa => ({ u: med(g.map((x) => x.u)), sens: (g[0] as DecrocheIa).sens, confiance: confianceVotee(g) })).sort((a, b) => a.u - b.u),
    modenature: voterModenature(rs.map((x) => x.modenature), r),
    appendices: grouper(rs.map((x) => x.appendices), (a, b) => a.nature === b.nature && recouvrement(a, b) >= memeBaie)
      .map((g): AppendiceIa => ({ nature: (g[0] as AppendiceIa).nature, ...boite(g), marches: motVote(g.map((x) => x.marches)), confiance: confianceVotee(g) })).sort((a, b) => a.u0 - b.u0),
    etat: grouper(rs.map((x) => x.etat), (a, b) => a.nature === b.nature && recouvrement(a, b) >= memeBaie)
      .map((g): EtatIa => ({ nature: (g[0] as EtatIa).nature, ...boite(g), confiance: confianceVotee(g) })).sort((a, b) => a.u0 - b.u0),
  };
}

/* ------------------------------------------------------------------------------------------------
 * L'escalade
 * --------------------------------------------------------------------------------------------- */

/** Un mot de l'escalade l'emporte sur celui du vote quand elle en dit un ; le nom de ce qu'elle a tranche est dit. */
function mot<T>(nom: string, v: T | null, x: T | null, tranche: string[]): T | null {
  if (x === null || JSON.stringify(x) === JSON.stringify(v)) return v;
  tranche.push(nom);
  return x;
}

/** Les details lus d'une baie du vote, completes et tranches par ceux de la baie de l'escalade qui la recouvre. */
export function escaladerDetailsLus(v: DetailsLus | undefined, x: DetailsLus | undefined, tranche: string[]): DetailsLus | undefined {
  if (!x) return v;
  if (!v) { tranche.push('les détails d’une baie'); return x; }
  const t: string[] = [];
  const out: DetailsLus = {
    menuiserie: { materiau: mot('', v.menuiserie.materiau, x.menuiserie.materiau, t), couleur: mot('', v.menuiserie.couleur, x.menuiserie.couleur, t) },
    couleurVolets: mot('', v.couleurVolets, x.couleurVolets, t),
    gardeCorps: { type: mot('', v.gardeCorps.type, x.gardeCorps.type, t), haut: v.gardeCorps.haut, couleur: mot('', v.gardeCorps.couleur, x.gardeCorps.couleur, t) },
  };
  if (t.length) tranche.push('les détails d’une baie');
  return out;
}

/** Les champs enrichis apres l'escalade : ses listes l'emportent quand elles ne s'accordent pas avec le vote ; ses mots, quand elle en dit. */
export function escaladerEnrichi(vote: ObservationsFacade, esc: ObservationsFacade, accordees: <T>(a: readonly T[], b: readonly T[], pareil: (x: T, y: T) => boolean) => boolean, pres: (a: number, b: number) => boolean, tranche: string[]): Pick<ObservationsFacade, 'saillies' | 'decroches' | 'modenature' | 'appendices' | 'etat'> {
  const choisir = <T>(nom: string, v: T[], x: T[], accord: boolean): T[] => { if (accord) return v; tranche.push(nom); return x; };
  const memeBoite = (a: BoiteUV, b: BoiteUV) => pres(a.u0, b.u0) && pres(a.u1, b.u1) && pres(a.v0, b.v0) && pres(a.v1, b.v1);
  const vm = vote.modenature, xm = esc.modenature;
  let modenature = vm;
  if (xm && !vm) { modenature = xm; tranche.push('la modénature'); }
  else if (xm && vm) {
    const t: string[] = [];
    modenature = {
      egout: mot('', vm.egout, xm.egout, t), rangsGenoise: mot('', vm.rangsGenoise, xm.rangsGenoise, t),
      bandeaux: accordees(vm.bandeaux, xm.bandeaux, pres) ? vm.bandeaux : (t.push(''), xm.bandeaux),
      chaines: mot('', vm.chaines, xm.chaines, t), encadrements: mot('', vm.encadrements, xm.encadrements, t),
      soubassement: mot('', vm.soubassement, xm.soubassement, t),
      descentes: accordees(vm.descentes, xm.descentes, pres) ? vm.descentes : (t.push(''), xm.descentes),
    };
    if (t.length) tranche.push('la modénature');
  }
  return {
    saillies: choisir('les saillies', vote.saillies, esc.saillies, accordees(vote.saillies, esc.saillies, (a, b) => a.genre === b.genre && pres(a.u0, b.u0) && pres(a.u1, b.u1))),
    decroches: choisir('les décrochés', vote.decroches, esc.decroches, accordees(vote.decroches, esc.decroches, (a, b) => a.sens === b.sens && pres(a.u, b.u))),
    modenature,
    appendices: choisir('ce qui est posé contre le mur', vote.appendices, esc.appendices, accordees(vote.appendices, esc.appendices, (a, b) => a.nature === b.nature && memeBoite(a, b))),
    etat: choisir('l’état du mur', vote.etat, esc.etat, accordees(vote.etat, esc.etat, (a, b) => a.nature === b.nature && memeBoite(a, b))),
  };
}

/** Les details lus des baies du vote, tranches par les baies de l'escalade qui les recouvrent (`memeBaie`). */
export function escaladerBaies(vote: readonly OuvertureIa[], esc: readonly OuvertureIa[], memeBaie: number, tranche: string[]): OuvertureIa[] {
  return vote.map((o) => {
    const x = esc.find((e) => recouvrement(e, o) >= memeBaie);
    const lus = escaladerDetailsLus(o.lus, x?.lus, tranche);
    return lus === o.lus ? o : { ...o, ...(lus ? { lus } : {}) };
  });
}
