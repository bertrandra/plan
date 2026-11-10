// Le vote de la facade enrichie (lot L1 de MD/spec-lecture-ia-elargie.md §5.1, point 2) : ce que la lecture enrichie d'une facade, la
// seconde requete sur l'image du run (decision du proprietaire du 30 octobre 2026), lit en plus des ouvertures : la menuiserie, les
// volets et le garde-corps de chaque baie ; les saillies, les decroches, la modenature, ce qui est pose contre le mur, l'etat du mur.
// Les memes regles que le run (facade/regles/facades/ia.ts) : la mediane des positions, le mot de la majorite (plus de la moitie des
// passes), `indetermine` (null) sans majorite ; un element d'une liste n'est garde que vu par plus de la moitie des passes. Puis la
// lecture votee se pose sur les observations du run (avecLectureEnrichie) sans rien y changer d'autre : une baie donne ses details a
// l'ouverture du run qu'elle recouvre, et a elle seule. Pas d'escalade : celle du run ne lit pas ces champs.
// Pur ; les seuils sont ceux du run (regles/facades/ia.json).

import { voterAttribut } from '../../../model/analyseClaude.js';
import { mediane } from '../../../util/stats.js';
import type { ReglagesIa } from '../../../regles/facades/ia.js';
import type { AppendiceIa, BaieLue, BoiteUV, DecrocheIa, DetailsLus, EtatIa, LectureEnrichie, ModenatureIa, ObservationsFacade, SaillieIa } from '../../../regles/facades/observations.js';

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

/** Les details lus d'une baie, votes entre les passes qui l'ont vue. */
function voterDetailsLus(d: readonly DetailsLus[]): DetailsLus {
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

const boite = <T extends BoiteUV>(g: readonly T[]): BoiteUV => ({ u0: med(g.map((x) => x.u0)), u1: med(g.map((x) => x.u1)), v0: med(g.map((x) => x.v0)), v1: med(g.map((x) => x.v1)) });

/** La lecture enrichie de plusieurs passes, votee ; sa seule passe telle quelle ; null sans passe lisible. */
export function voterLectureEnrichie(rs: readonly LectureEnrichie[], r: ReglagesIa): LectureEnrichie | null {
  if (rs.length <= 1) return rs[0] ?? null;
  const memeE = r['facades.ia.voteMemeEtendue'], memeU = r['facades.ia.voteMemeU'], memeBaie = r['facades.ia.voteMemeBaie'];
  return {
    baies: grouper(rs.map((x) => x.baies), (a, b) => recouvrement(a, b) >= memeBaie).map((g): BaieLue => ({ ...boite(g), lus: voterDetailsLus(g.map((x) => x.lus)) })).sort((a, b) => a.u0 - b.u0 || a.v0 - b.v0),
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

/**
 * Les observations du run, avec la lecture enrichie votee : chaque ouverture recoit les details de la baie qui la recouvre le plus
 * (au moins `voteMemeBaie`), une baie au plus une ouverture ; les listes et la modenature sont celles de la lecture. Rien d'autre ne
 * change : les ouvertures, leur nombre, leurs boites et leurs carreaux restent ceux du run.
 */
export function avecLectureEnrichie(obs: ObservationsFacade, lue: LectureEnrichie, r: ReglagesIa): ObservationsFacade {
  const memeBaie = r['facades.ia.voteMemeBaie'];
  const libres = [...lue.baies];
  const ouvertures = obs.ouvertures.map((o) => {
    let k = -1, mieux = memeBaie;
    libres.forEach((b, i) => { const x = recouvrement(b, o); if (x >= mieux) { mieux = x; k = i; } });
    if (k < 0) return o;
    const [b] = libres.splice(k, 1) as [BaieLue];
    return { ...o, lus: b.lus };
  });
  return { ...obs, ouvertures, saillies: lue.saillies, decroches: lue.decroches, modenature: lue.modenature, appendices: lue.appendices, etat: lue.etat };
}
