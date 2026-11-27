// Le raccord des toits de corps qui se touchent (MD/spec-toit-ign.md §13.10).
//
// Chaque batiment de la BD TOPO se lit seul, et chaque corps aussi. Une maison en L y est souvent deux batiments, ou deux corps
// que rien ne lie : l'aile s'arretait au mur du corps principal par un pignon ou un mur, le corps principal portait un « pignon »
// la ou le toit de l'aile le penetre, et les deux faitages, lus chacun de son cote, n'avaient pas la meme hauteur (Hardencourt,
// 11 route du Guesclin, 27 novembre 2026 : « tu mets un pignon au raccord des deux toits, il faut raccorder les deux corps avec
// les deux faitages » ; « les faitages ont la meme altitude »).
//
// Deux raccords, sans champ nouveau :
//   - en equerre : une aile dont le bout s'appuie sur le mur d'un long pan d'un autre corps, faitage en travers du sien. Son toit
//     ne s'arrete pas au mur : son rectangle se prolonge dans le corps, et la 3D, ou le plus haut l'emporte, dessine les noues.
//       . au coin du corps, memes faitages et memes egouts : un retour d'angle. L'aile traverse le corps jusqu'a son mur du fond
//         et s'y ferme par une croupe, le corps se ferme au coin par une croupe : les deux croupes sont les pans exterieurs de
//         l'autre, d'ou un aretier au coin exterieur, une noue au coin interieur, des pans continus et aucun mur entre les deux ;
//       . ailleurs (un T, une aile plus basse) : l'aile se prolonge jusqu'ou son faitage rencontre le pan du corps (jusqu'a son
//         faitage quand ils sont a la meme hauteur). Son bout, sous le toit du corps, ne se voit pas.
//     Les pignons que la mesure avait lus sur le pan, en face de l'aile, etaient le toit de l'aile : retires ;
//   - bout a bout : un corps qui prolonge un autre, meme section, faitages dans le meme sens. C'est le meme toit : il en prend la
//     ligne de faitage, la hauteur et les egouts.
// Deux faitages que la mesure met a la meme hauteur, a MEME_FAITAGE_M pres, sont a la meme hauteur, et deux egouts de meme
// (MEME_EGOUT_M) : ceux du plus grand des deux corps.
//
// Une fonction pure : des corps en entree, des corps en sortie, les memes quand rien ne se touche. La personne garde la main
// (un toit fige ou verifie sur place y entre `fixe` : les autres se raccordent a lui, lui ne change pas ; app/toits/toitsLidar.ts).

import type { CorpsToit, PtBrut, ToitMesure } from '../../model/types.js';
import { distancePointContour } from '../../geometry/proximite.js';
import { SEUILS_TOITS as S } from '../../regles/toits/reglages.js';
import { cm, mesuresDans, repere, type Repere } from './toitCorps/ajustement.js';
import { hautMesure } from './toitCorps/centrage.js';

/** Un batiment dont les corps peuvent se raccorder a ceux des autres : sa cle, ses corps, et le haut mesure de chacun quand on l'a. */
/**
 * `fixe` : un batiment dont la lecture n'ecrit pas le toit (regle a la main, verifie sur place). Il est la, les autres se raccordent
 * a lui (ils prennent son faitage et ses egouts, entrent dans son toit), mais ses corps ne changent jamais.
 */
export interface ToitARaccorder { cle: string; corps: readonly CorpsToit[]; hauts?: readonly (number | null)[]; fixe?: boolean }

/** Le haut mesure de chaque corps d'un batiment (toitCorps/centrage.ts::hautMesure), null sans mesure sous lui. */
export function hautsMesures(corps: readonly CorpsToit[], m: ToitMesure | null | undefined, contour: readonly PtBrut[]): (number | null)[] {
  return corps.map((c) => { if (!m) return null; const ms = mesuresDans(m, repere(c.pts), c.pts, contour); return ms.length ? hautMesure(ms) : null; });
}

interface Place { b: number; k: number; c: CorpsToit; r: Repere; haut: number | null }

const local = (r: Repere, q: PtBrut): { s: number; t: number } => { const dx = q.x - r.p0.x, dy = q.y - r.p0.y; return { s: dx * r.u.x + dy * r.u.y, t: dx * r.v.x + dy * r.v.y }; };
const aire = (r: Repere): number => r.L * r.W;
const aFaitage = (c: CorpsToit, r: Repere): boolean => c.posFaitage > 0.01 && c.posFaitage < r.W - 0.01 && c.faitage - Math.min(...c.egouts) >= S.HAUTEUR_PLAT_M;
const sinTolere = (): number => Math.sin((S.TOLERANCE_DEG * Math.PI) / 180);

/** Deux faitages lus a la meme hauteur, a MEME_FAITAGE_M pres. */
const memeFaitage = (a: Place, b: Place): boolean => Math.abs(a.c.faitage - b.c.faitage) <= S.MEME_FAITAGE_M;
/**
 * Et pour un corps qui en prolonge un autre (la meme section : le meme toit), des mesures dont les hauts sont a la meme hauteur :
 * un petit corps trace a cote de son toit se lit bas (Hardencourt 6501003 : 5,1 m lus pour 6,5 m mesures, au bout d'une longere
 * a 6,4 m). En equerre, le haut mesure d'un rectangle n'est pas son faitage (le toit du voisin y entre) : il ne prouve rien.
 */
const memeToit = (a: Place, b: Place): boolean => memeFaitage(a, b) || (a.haut !== null && b.haut !== null && Math.abs(a.haut - b.haut) <= S.MEME_FAITAGE_M);
/**
 * Deux corps dont les egouts se lisent a la meme hauteur, a MEME_EGOUT_M pres. Un corps plus bas que celui qu'il prolonge n'est
 * pas le meme toit, meme quand le haut mesure de son rectangle dit le contraire : le toit du voisin, plus haut, entre dans son
 * rectangle et en releve le haut, mais ses murs, eux, se lisent a leur hauteur (le proprietaire, Hardencourt 6501003, 27 novembre
 * 2026 : « sur la partie droite le batiment est plus bas, il faut le respecter » ; ses egouts se lisent a 3,1 m contre 4,9 m).
 */
const memesEgouts = (a: Place, b: Place): boolean => Math.abs(Math.min(...a.c.egouts) - Math.min(...b.c.egouts)) <= S.MEME_EGOUT_M && Math.abs(Math.max(...a.c.egouts) - Math.max(...b.c.egouts)) <= S.MEME_EGOUT_M;
/** Le corps a la hauteur de faitage `F`, s'il reste un toit : son faitage au-dessus de ses egouts. */
const auFaitage = (c: CorpsToit, F: number): CorpsToit | null => (F - Math.max(...c.egouts) >= S.HAUTEUR_PLAT_M ? { ...c, faitage: F, pignons: c.pignons.map((g) => (g.faitage > F ? { ...g, faitage: F } : g)) } : null);

/**
 * L'aile `w` s'appuie-t-elle en equerre sur un long pan du corps `a` ? Rend le pan de `a`, le bout de l'aile qui le touche
 * (0 : son cote `pts[0]-pts[3]`, 1 : l'autre) et l'abscisse, le long du faitage de `a`, ou arrive le faitage de l'aile.
 */
function equerre(a: Place, w: Place): { pan: 0 | 1; bout: 0 | 1; s: number } | null {
  if (!aFaitage(a.c, a.r) || !aFaitage(w.c, w.r)) return null;
  if (Math.abs(a.r.u.x * w.r.u.x + a.r.u.y * w.r.u.y) > sinTolere()) return null;
  for (const bout of [0, 1] as const) {
    const pres = { x: w.r.p0.x + w.r.u.x * (bout ? w.r.L : 0) + w.r.v.x * w.c.posFaitage, y: w.r.p0.y + w.r.u.y * (bout ? w.r.L : 0) + w.r.v.y * w.c.posFaitage };
    const loin = { x: w.r.p0.x + w.r.u.x * (bout ? 0 : w.r.L) + w.r.v.x * w.c.posFaitage, y: w.r.p0.y + w.r.u.y * (bout ? 0 : w.r.L) + w.r.v.y * w.c.posFaitage };
    const p = local(a.r, pres), l = local(a.r, loin);
    if (p.s < 0 || p.s > a.r.L) continue;
    if (Math.abs(p.t) <= S.ACCOLE_M && l.t < p.t - S.LARGEUR_CORPS_MIN_M) return { pan: 0, bout, s: p.s };
    if (Math.abs(p.t - a.r.W) <= S.ACCOLE_M && l.t > p.t + S.LARGEUR_CORPS_MIN_M) return { pan: 1, bout, s: p.s };
  }
  return null;
}

/** Un toit symetrique a deux pans : le seul qui se raccorde en equerre (toitCorps/centrage.ts). */
const symetrique = (p: Place): boolean => Math.abs(p.c.egouts[0] - p.c.egouts[1]) < S.EGOUTS_EGAUX_M;
/** Le recul du bout d'une aile prolongee devant le mur du fond du corps : deux murs dans le meme plan scintillent. */
const RECUL_M = 0.05;

/** Le corps prolonge de `D` metres a son bout (0 : `s = 0`, 1 : `s = L`) : son rectangle, ses pignons recales, la croupe de ce bout. */
function prolongeAuBout(c: CorpsToit, r: Repere, bout: 0 | 1, D: number, croupe: number): CorpsToit {
  const d = bout ? D : -D, P = (q: PtBrut): PtBrut => ({ x: cm(q.x + r.u.x * d), y: cm(q.y + r.u.y * d) });
  const [p0, p1, p2, p3] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  const pts = bout ? [p0, P(p1), P(p2), p3] : [P(p0), p1, p2, P(p3)];
  const pignons = bout ? c.pignons : c.pignons.map((g) => ({ ...g, debut: cm(g.debut + D), fin: cm(g.fin + D) }));
  const croupes: [number, number] = [c.croupes?.[0] ?? 0, c.croupes?.[1] ?? 0];
  croupes[bout] = cm(croupe);
  const out: CorpsToit = { ...c, pts, pignons };
  // Ses lucarnes se comptent depuis `pts[0]`, comme ses pignons : elles gardent leur place sur le toit.
  if (c.lucarnes && !bout) out.lucarnes = c.lucarnes.map((l) => ({ ...l, debutM: cm(l.debutM + D), finM: cm(l.finM + D) }));
  if (croupes[0] > 0 || croupes[1] > 0) out.croupes = croupes; else delete out.croupes;
  return out;
}

/**
 * Le corps sans les pignons du pan `pan` que la bande `[s0, s1]` recouvre a moitie ou plus : c'etait le toit de l'aile. De meme
 * ses lucarnes lues sur la mesure (facade/toits/lucarnesLues.ts) ; celles d'un fait ou d'une photo restent.
 */
function sansPignonsSousLAile(c: CorpsToit, pan: 0 | 1, s0: number, s1: number): CorpsToit {
  const dessous = (debut: number, fin: number): boolean => Math.min(fin, s1) - Math.max(debut, s0) >= 0.5 * (fin - debut);
  const gardes = c.pignons.filter((p) => p.pan !== pan || !dessous(p.debut, p.fin));
  const lucarnes = c.lucarnes?.filter((l) => l.source !== 'lidar' || l.pan !== pan || !dessous(l.debutM, l.finM));
  if (gardes.length === c.pignons.length && lucarnes?.length === c.lucarnes?.length) return c;
  const out: CorpsToit = { ...c, pignons: gardes };
  if (lucarnes?.length) out.lucarnes = lucarnes; else delete out.lucarnes;
  return out;
}

/**
 * Le raccord en equerre de l'aile `w` sur le corps `a` (voir l'en-tete) : rend les deux corps raccordes, ou null quand l'aile
 * passe sous l'egout du corps (elle s'appuie sur le mur, pas sur le toit).
 */
function raccordEnEquerre(a: Place, w: Place, j: { pan: 0 | 1; bout: 0 | 1; s: number }): { a: CorpsToit; w: CorpsToit } | null {
  const e = a.c.egouts[j.pan], P = Math.min(w.c.faitage, a.c.faitage), F = a.c.faitage;
  if (P - e < S.HAUTEUR_PLAT_M) return null;
  const largeurPan = j.pan === 0 ? a.c.posFaitage : a.r.W - a.c.posFaitage, demi = w.r.W / 2;
  const sansPignons = sansPignonsSousLAile(a.c, j.pan, j.s - demi, j.s + demi);
  const coin: 0 | 1 | null = j.s - demi <= S.ACCOLE_M ? 0 : j.s + demi >= a.r.L - S.ACCOLE_M ? 1 : null;
  const memesToits = w.c.faitage === F && w.c.egouts[0] === e && a.c.egouts[0] === a.c.egouts[1];
  if (coin !== null && memesToits && !(sansPignons.croupes?.[coin])) {
    // Le retour d'angle : chaque corps se ferme par une croupe qui est le pan exterieur de l'autre.
    const croupeA = coin === 0 ? j.s : a.r.L - j.s;
    const corpsA: CorpsToit = { ...sansPignons, croupes: coin === 0 ? [cm(croupeA), sansPignons.croupes?.[1] ?? 0] : [sansPignons.croupes?.[0] ?? 0, cm(croupeA)] };
    return { a: corpsA, w: prolongeAuBout(w.c, w.r, j.bout, a.r.W - RECUL_M, a.r.W - largeurPan - RECUL_M) };
  }
  const D = F > e ? Math.min(largeurPan, (largeurPan * (P - e)) / (F - e)) : largeurPan;
  return { a: sansPignons, w: prolongeAuBout(w.c, w.r, j.bout, D, w.c.croupes?.[j.bout] ?? 0) };
}

/**
 * Le corps `w` prolonge-t-il le corps `a`, bout a bout : faitages dans le meme sens, un bout de l'un contre un bout de l'autre,
 * la meme section a SECTION_PROLONGEE_M pres ? Rend alors la place du faitage de `a` dans la largeur de `w`, et si les pans de
 * `w` sont dans l'ordre de ceux de `a`.
 */
function prolonge(a: Place, w: Place): { pos: number; memeOrdre: boolean } | null {
  if (!aFaitage(a.c, a.r) || !aFaitage(w.c, w.r)) return null;
  const cos = a.r.u.x * w.r.u.x + a.r.u.y * w.r.u.y;
  if (Math.abs(cos) < Math.cos((S.TOLERANCE_DEG * Math.PI) / 180) || Math.abs(a.r.W - w.r.W) > S.SECTION_PROLONGEE_M) return null;
  // Les quatre coins de `w` dans le repere de `a` : contre le bout s = 0 ou s = L, et dans la meme largeur.
  const coins = w.c.pts.map((q) => local(a.r, q)), ss = coins.map((q) => q.s), ts = coins.map((q) => q.t);
  const s0 = Math.min(...ss), s1 = Math.max(...ss), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const auBout = Math.abs(s0 - a.r.L) <= S.ACCOLE_M || Math.abs(s1) <= S.ACCOLE_M;
  if (!auBout || Math.abs(t0) > S.SECTION_PROLONGEE_M || Math.abs(t1 - a.r.W) > S.SECTION_PROLONGEE_M) return null;
  // Le faitage de `a`, vu dans la largeur de `w`.
  const surLeFaitage = { x: a.r.p0.x + a.r.v.x * a.c.posFaitage, y: a.r.p0.y + a.r.v.y * a.c.posFaitage };
  const pos = local(w.r, surLeFaitage).t;
  if (pos < S.PAN_MIN_M || pos > w.r.W - S.PAN_MIN_M) return null;
  return { pos, memeOrdre: a.r.v.x * w.r.v.x + a.r.v.y * w.r.v.y > 0 };
}

/**
 * Les toits raccordes : les corps de chaque batiment, ceux qui se touchent mis d'accord (voir l'en-tete). Rend, par cle, les
 * corps des seuls batiments qui changent. Le plus grand des deux corps donne la hauteur commune et, bout a bout, son toit.
 */
export function raccorderLesToits(batiments: readonly ToitARaccorder[]): Map<string, CorpsToit[]> {
  const places: Place[] = batiments.flatMap((bat, b) => bat.corps.map((c, k) => ({ b, k, c, r: repere(c.pts), haut: bat.hauts?.[k] ?? null })));
  const change = new Set<number>();
  const poser = (p: Place, c: CorpsToit): void => { if (JSON.stringify(c) !== JSON.stringify(p.c)) { p.c = c; change.add(p.b); } };
  // 1. Bout a bout : le plus petit prend le toit du plus grand.
  for (const a of places) for (const w of places) {
    if (a === w || aire(w.r) > aire(a.r) || (aire(w.r) === aire(a.r) && (w.b < a.b || (w.b === a.b && w.k < a.k)))) continue;
    const p = prolonge(a, w);
    // Le meme toit : memes faitages (ou memes hauts mesures) ET memes egouts. Un corps plus bas garde son toit.
    if (!p || !memeToit(a, w) || !memesEgouts(a, w)) continue;
    if (!w.c.pignons.length && !w.c.croupes && !w.c.lucarnes?.length) {
      // Le meme batiment, aligne (le proprietaire, Hardencourt : « il s'agit du meme batiment qui est aligne ») : le corps prend
      // la section du grand, mur pour mur - son rectangle retrace dans le repere du grand, colle a son bout -, donc la meme ligne
      // de faitage et les memes lignes d'egout. Ses pignons, ses croupes et ses lucarnes, s'il en a, se comptent le long de son propre
      // rectangle : il le garde alors, et ne prend que le faitage et les egouts.
      const ss = w.c.pts.map((q) => local(a.r, q).s);
      let s0 = Math.min(...ss), s1 = Math.max(...ss);
      if (Math.abs(s0 - a.r.L) <= S.ACCOLE_M) s0 = a.r.L;
      if (Math.abs(s1) <= S.ACCOLE_M) s1 = 0;
      const P = (ps: number, pt: number): PtBrut => ({ x: cm(a.r.p0.x + a.r.u.x * ps + a.r.v.x * pt), y: cm(a.r.p0.y + a.r.u.y * ps + a.r.v.y * pt) });
      poser(w, { ...w.c, pts: [P(s0, 0), P(s1, 0), P(s1, a.r.W), P(s0, a.r.W)], posFaitage: a.c.posFaitage, faitage: a.c.faitage, egouts: [a.c.egouts[0], a.c.egouts[1]] });
      w.r = repere(w.c.pts);
      continue;
    }
    const egouts: [number, number] = p.memeOrdre ? [a.c.egouts[0], a.c.egouts[1]] : [a.c.egouts[1], a.c.egouts[0]];
    poser(w, { ...w.c, posFaitage: cm(p.pos), faitage: a.c.faitage, egouts });
  }
  // 2. En equerre : meme faitage et memes egouts quand la mesure le dit, puis l'aile prolongee dans le corps qui la porte.
  for (const a of places) for (const w of places) {
    if (a === w) continue;
    const j = equerre(a, w);
    if (!j || !symetrique(a) || !symetrique(w)) continue;
    const [petit, grand] = aire(w.r) <= aire(a.r) ? [w, a] : [a, w];
    if (memeFaitage(a, w) && w.c.faitage !== a.c.faitage) { const c = auFaitage(petit.c, grand.c.faitage); if (c) poser(petit, c); }
    const eg = grand.c.egouts[0];
    if (petit.c.egouts[0] !== eg && Math.abs(petit.c.egouts[0] - eg) <= S.MEME_EGOUT_M && petit.c.faitage - eg >= S.HAUTEUR_PLAT_M) poser(petit, { ...petit.c, egouts: [eg, eg] });
    const lie = raccordEnEquerre(a, w, j);
    if (!lie) continue;
    poser(a, lie.a);
    poser(w, lie.w);
    w.r = repere(w.c.pts);
  }
  const out = new Map<string, CorpsToit[]>();
  for (const b of change) { const bat = batiments[b]; if (bat && !bat.fixe) out.set(bat.cle, places.filter((p) => p.b === b).sort((x, y) => x.k - y.k).map((p) => p.c)); }
  return out;
}

/**
 * Deux contours passent-ils a moins de `seuilM` l'un de l'autre (un sommet de l'un pres d'un cote de l'autre) ? Sert a dire quels
 * batiments se relisent ensemble (app/toits/toitsLidar.ts::voisinsDeRaccord) : plus large que le raccord, qui juge sur les corps.
 */
export function contoursProches(a: readonly PtBrut[], b: readonly PtBrut[], seuilM: number): boolean {
  return a.some((p) => distancePointContour(p, b as PtBrut[]) <= seuilM) || b.some((p) => distancePointContour(p, a as PtBrut[]) <= seuilM);
}
