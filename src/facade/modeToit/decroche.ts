// Le decroche d'une facade (decision du proprietaire, 4 novembre 2026 : « sur la facade avec les deux pignons, il y a un decroche de
// 50 cm en arriere sur la droite ») : une partie d'un long mur d'un corps recule, le toit et ce qui est pose dessus suivent.
//
// Le corps est coupe en travers de son faitage, au milieu du mur : la partie gauche (vue de face) garde le rang du corps, la partie droite
// devient un corps de plus, son mur recule de `recul` metres vers l'interieur. Le faitage reste ou il est (meme hauteur, meme ligne) : le
// pan recule devient un peu plus raide, ses egouts gardent leur hauteur. Ce qui est pose sur le corps va a la partie qui le porte :
// pignons, lucarnes, fenetres de toit et panneaux par leur place le long du faitage, souches par leur position, bow-windows, galeries et
// appentis poses par le mur le plus proche. Un appentis adosse au mur decroche (l'auvent d'AE 101) reste UN corps : sa rive basse reste
// droite (une seule gouttiere de bout en bout, decision du proprietaire, 4 novembre 2026), son mur haut recule jusqu'au mur recule, et
// devant la partie qui avance il passe dans le mur, cache par elle. Son toit reste a la meme hauteur.
//
// Un decroche est une decision de la personne, ecrite dans son projet (le toit est fige par l'appelant) : la lecture automatique ne
// produit jamais de decroche (`SEUIL_DECROCHE_M`), et ce module n'y touche pas. Avec un recul, il coupe le corps : ce n'est pas le
// recul d'un mur sous un toit continu (retour du proprietaire, 4 novembre 2026 : « c'est un toit »), qui viendra avec le schema 14 ; le
// Mode Toit ne l'offre donc pas, et seule la scission (sans recul) s'en sert.
//
// La scission (un decroche sans recul) et la fusion (deux corps alignes de memes hauteurs reunis en un) vivent ici aussi : la personne
// coupe un corps lu d'un seul tenant, ou reunit deux morceaux que la lecture avait separes.
//
// Pur : pas de DOM, pas de scene. Rend une NOUVELLE liste de corps, ou null quand le geste n'a pas de sens.

import { point, repere, type Repere } from '../toits/toitCorps.js';
import { formeDuCorps } from '../regles/toits/faits.js';
import { murDuCorps, murLePlusProche, replacerSaillie } from './saillies.js';
import type { CorpsToit, PtBrut } from '../../model/types.js';

/** Le recul d'un decroche pose d'un geste, en metres : celui qu'a dit le proprietaire pour AE 101 ; les poignees le reglent ensuite. */
export const RECUL_DECROCHE_M = 0.5;
/** Chaque partie fait au moins cela le long du mur, et il reste au moins cela de largeur derriere le mur recule. */
const PARTIE_MIN_M = 1;
/** Un appentis est adosse au mur quand les deux bouts de son mur haut sont a moins de cela de la ligne du mur. */
const ADOSSE_M = 0.1;

const centi = (v: number) => Math.round(v * 100) / 100;

/** La partie `s0..s1` (le long du faitage) et `t0..t1` (en travers) d'un corps, avec ce qui est pose sur elle. */
function partie(c: CorpsToit, r: Repere, s0: number, s1: number, t0: number, t1: number): CorpsToit {
  const P = (s: number, t: number): PtBrut => { const q = point(r, s, t); return { x: centi(q.x), y: centi(q.y) }; };
  const dedans = (s: number) => s >= s0 - 1e-6 && s <= s1 + 1e-6;
  const L = s1 - s0, W = t1 - t0, recule = (pan: 0 | 1) => (pan === 0 ? t0 : r.W - t1);
  const neuf: CorpsToit = {
    ...c, pts: [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)], posFaitage: centi(Math.min(Math.max(c.posFaitage - t0, 0), W)),
    egouts: [...c.egouts] as [number, number],
    pignons: c.pignons.filter((g) => dedans((g.debut + g.fin) / 2)).map((g) => ({ ...g, debut: centi(Math.max(0, g.debut - s0)), fin: centi(Math.min(L, g.fin - s0)), profondeur: centi(Math.max(0.1, g.profondeur - recule(g.pan))) }))
  };
  // Les bouts : une croupe reste au bout du corps qui la porte ; la coupe est un mur commun, sans croupe.
  if (c.croupes) neuf.croupes = [s0 <= 1e-6 ? c.croupes[0] : 0, s1 >= r.L - 1e-6 ? c.croupes[1] : 0];
  if (c.bouts) neuf.bouts = [s0 <= 1e-6 ? c.bouts[0] : { type: 'pignon' }, s1 >= r.L - 1e-6 ? c.bouts[1] : { type: 'pignon' }];
  const lucarnes = c.lucarnes?.filter((l) => dedans((l.debutM + l.finM) / 2)).map((l) => ({ ...l, debutM: centi(l.debutM - s0), finM: centi(l.finM - s0) }));
  if (lucarnes?.length) neuf.lucarnes = lucarnes; else delete neuf.lucarnes;
  const elements = c.elementsToit?.filter((e) => dedans(e.sM)).map((e) => ({ ...e, sM: centi(e.sM - s0) }));
  if (elements?.length) neuf.elementsToit = elements; else delete neuf.elementsToit;
  const le = (p: PtBrut) => (p.x - r.p0.x) * r.u.x + (p.y - r.p0.y) * r.u.y;
  const cheminees = c.cheminees?.filter((h) => dedans(le(h)));
  if (cheminees?.length) neuf.cheminees = cheminees; else delete neuf.cheminees;
  return neuf;
}

/** Pourquoi le mur `mur` du corps `rang` ne se decroche pas ; null quand il se decroche. */
export function raisonSansDecroche(corps: readonly CorpsToit[], rang: number, mur: number): string | null {
  const c = corps[rang];
  if (!c || c.saillie) return 'Regardez d’abord la façade d’un corps : le décroché recule une partie de son mur.';
  if (c.speciale || c.baie) return 'Ce corps ne se décroche pas.';
  if (mur % 2 === 1) return 'Un décroché se pose sur un long mur, sous un égout : regardez la façade d’un long pan.';
  const r = repere(c.pts);
  if (r.L < 2 * PARTIE_MIN_M || r.W < RECUL_DECROCHE_M + PARTIE_MIN_M) return 'Ce corps est trop petit pour un décroché.';
  return null;
}

/**
 * Le debut du mur `mur` (`pts[mur]`) est-il a sa gauche, vu de face (de dehors, devant lui) ? Vu de dehors, la droite est a (-n.y, n.x),
 * `n` la normale qui sort du corps. L'ordre des sommets ne le dit pas : il depend du corps.
 */
export function gaucheEnDebut(c: CorpsToit, mur: number): boolean {
  const { u, n } = murDuCorps(c, mur);
  return u.x * -n.y + u.y * n.x > 0;
}

/**
 * Ou couper le mur, en metres depuis sa gauche (vue de face) : au bord du pignon qui avance quand le mur en porte (le pignon le plus a
 * gauche quand la droite recule, le plus a droite sinon : le volume du pignon est celui qui reste devant, comme a AE 101), sinon au
 * milieu.
 */
export function coupeParDefaut(c: CorpsToit, mur: number, cote: 'droite' | 'gauche'): number {
  const L = repere(c.pts).L, pan = mur === 0 ? 0 : 1, gauche = gaucheEnDebut(c, mur);
  // Le mur 0 va de s = 0 a s = L, le mur 2 de s = L a s = 0 ; l'abscisse depuis la gauche du mur, vue de face.
  const x = (s: number) => { const depuisDebut = mur === 0 ? s : L - s; return gauche ? depuisDebut : L - depuisDebut; };
  const pignons = c.pignons.filter((g) => g.pan === pan).map((g) => [Math.min(x(g.debut), x(g.fin)), Math.max(x(g.debut), x(g.fin))] as const);
  const bord = cote === 'droite'
    ? pignons.reduce<readonly [number, number] | null>((m, g) => (!m || g[0] < m[0] ? g : m), null)?.[1]
    : pignons.reduce<readonly [number, number] | null>((m, g) => (!m || g[1] > m[1] ? g : m), null)?.[0];
  return bord !== undefined && bord >= PARTIE_MIN_M && bord <= L - PARTIE_MIN_M ? bord : L / 2;
}

/**
 * Le mur `mur` (0 ou 2, un long pan) du corps `rang` decroche : la partie droite (vue de face) ou gauche du mur recule de `recul` metres,
 * coupee a `coupe` metres de la gauche du mur (par defaut `coupeParDefaut`). Null quand ce n'est pas possible (`raisonSansDecroche`).
 */
export function decrocherCorps(corps: readonly CorpsToit[], rang: number, mur: number, cote: 'droite' | 'gauche' = 'droite', recul = RECUL_DECROCHE_M, coupe?: number): CorpsToit[] | null {
  if (raisonSansDecroche(corps, rang, mur)) return null;
  const c = corps[rang] as CorpsToit, r = repere(c.pts), L = r.L, W = r.W;
  const d = Math.min(recul, W - PARTIE_MIN_M);
  const xg = Math.min(Math.max(coupe ?? coupeParDefaut(c, mur, cote), PARTIE_MIN_M), L - PARTIE_MIN_M), x = gaucheEnDebut(c, mur) ? xg : L - xg, sc = mur === 0 ? x : L - x;
  const droiteEnS = mur === 0 ? 'haut' : 'bas';
  const reculeEnHaut = (cote === 'droite') === (droiteEnS === 'haut');
  const [g0, g1, d0, d1] = reculeEnHaut ? [0, sc, sc, L] : [sc, L, 0, sc];
  const [t0, t1] = mur === 0 ? [d, W] : [0, W - d];
  const garde = partie(c, r, g0, g1, 0, W), recule = partie(c, r, d0, d1, t0, t1);
  const rangNeuf = corps.length;
  let l: CorpsToit[] = [...corps.map((k, i) => (i === rang ? garde : k)), recule];

  // Un appentis adosse au mur decroche, devant la partie reculee : un seul corps, son mur haut recule jusqu'au mur recule.
  const m = murDuCorps(c, mur), pointCoupe = point(r, sc, mur === 0 ? 0 : W), milieuRecule = point(r, (d0 + d1) / 2, mur === 0 ? 0 : W);
  const surLeMur = (p: PtBrut) => Math.abs((p.x - m.a.x) * m.u.y - (p.y - m.a.y) * m.u.x) <= ADOSSE_M;
  const n = l.length;
  for (let k = 0; k < n; k++) {
    const a = l[k] as CorpsToit;
    if (k === rang || k === rangNeuf || a.saillie || formeDuCorps(a) !== 'appentis') continue;
    const ra = repere(a.pts), hautEnT0 = a.posFaitage <= 0.01;
    const [h0, h1] = (hautEnT0 ? [a.pts[0], a.pts[1]] : [a.pts[3], a.pts[2]]) as [PtBrut, PtBrut];
    if (!surLeMur(h0) || !surLeMur(h1)) continue;
    // Devant la partie reculee ? Son mur haut recouvre la coupe ou le milieu de la partie reculee.
    const le = (p: PtBrut) => (p.x - ra.p0.x) * ra.u.x + (p.y - ra.p0.y) * ra.u.y, sm = le(milieuRecule), sk = le(pointCoupe);
    if (!((sm > 0.05 && sm < ra.L - 0.05) || (sk > 0.05 && sk < ra.L - 0.05))) continue;
    l[k] = allonger(a, hautEnT0, d);
  }

  // Ce qui est pose sur le corps coupe (bow-window, galerie, appentis pose) va au mur le plus proche de la partie qui le porte.
  l.forEach((k, i) => {
    const s = k.saillie;
    if (!s || s.hote !== rang) return;
    const ancien = murDuCorps(c, s.mur), p = { x: ancien.a.x + ancien.u.x * s.centreM, y: ancien.a.y + ancien.u.y * s.centreM };
    const leS = (q: PtBrut) => (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, sP = leS(p);
    const surRecule = sP >= d0 - 1e-6 && sP <= d1 + 1e-6 && !(sP >= g0 + 1e-6 && sP <= g1 - 1e-6);
    const hote = surRecule ? rangNeuf : rang, place = murLePlusProche(l[hote] as CorpsToit, p);
    l = replacerSaillie(l, i, { hote, mur: place.mur, centreM: centi(place.centreM) });
  });
  return l;
}

/** Un appentis dont le mur haut recule de `d` metres (vers la maison) : meme faitage, meme egout, un pan un peu plus long. */
function allonger(a: CorpsToit, hautEnT0: boolean, d: number): CorpsToit {
  const r = repere(a.pts), P = (s: number, t: number): PtBrut => { const q = point(r, s, t); return { x: centi(q.x), y: centi(q.y) }; };
  return hautEnT0
    ? { ...a, pts: [P(0, -d), P(r.L, -d), P(r.L, r.W), P(0, r.W)], posFaitage: 0 }
    : { ...a, pts: [P(0, 0), P(r.L, 0), P(r.L, r.W + d), P(0, r.W + d)], posFaitage: centi(r.W + d) };
}

/**
 * Coupe le corps `rang` en deux, en travers de son faitage : un decroche sans recul. La coupe se pose au bord d'un pignon, le plus proche
 * du milieu (le volume du pignon reste entier, le reste se regle a part : le toit plat entre les deux pignons d'AE 101), sinon au milieu.
 * Chaque partie se regle ensuite seule.
 */
export function scinderCorps(corps: readonly CorpsToit[], rang: number): CorpsToit[] | null {
  const c = corps[rang];
  if (!c || c.saillie || c.speciale || c.baie) return null;
  const r = repere(c.pts);
  if (r.L < 2 * PARTIE_MIN_M) return null;
  const bords = c.pignons.flatMap((g) => [g.debut, g.fin]).filter((s) => s >= PARTIE_MIN_M && s <= r.L - PARTIE_MIN_M);
  const coupe = bords.length ? bords.reduce((m, s) => (Math.abs(s - r.L / 2) < Math.abs(m - r.L / 2) ? s : m)) : r.L / 2;
  return decrocherCorps(corps, rang, 0, 'droite', 0, coupe);
}

/** Deux corps a reunir : meme sens de faitage (a 2 degres pres), memes hauteurs (a 10 cm), et leur reunion est un rectangle. */
const PARALLELES = 0.035;
const MEMES_HAUTEURS_M = 0.1;

/**
 * Le corps qui se reunit au corps `rang` : un corps voisin dans le meme alignement, de memes hauteurs, qui forme avec lui un rectangle
 * (deux moities d'un corps scinde, un corps coupe par la lecture). Null s'il n'y en a pas.
 */
export function corpsAFusionner(corps: readonly CorpsToit[], rang: number): number | null {
  const c = corps[rang];
  if (!c || c.saillie || c.speciale || c.baie) return null;
  const r = repere(c.pts);
  for (let k = 0; k < corps.length; k++) {
    const a = corps[k];
    if (k === rang || !a || a.saillie || a.speciale || a.baie) continue;
    const ra = repere(a.pts);
    if (Math.abs(r.u.x * ra.u.y - r.u.y * ra.u.x) > PARALLELES) continue;
    if (Math.abs(a.faitage - c.faitage) > MEMES_HAUTEURS_M || Math.abs(Math.min(...a.egouts) - Math.min(...c.egouts)) > MEMES_HAUTEURS_M) continue;
    const b = boiteDans(r, [...c.pts, ...a.pts]);
    // La reunion est un rectangle : l'aire de la boite est la somme des aires (a 2 % pres), sans trou entre eux.
    if (Math.abs((b.s1 - b.s0) * (b.t1 - b.t0) - (r.L * r.W + ra.L * ra.W)) <= 0.02 * (r.L * r.W + ra.L * ra.W)) return k;
  }
  return null;
}

/** La boite des points dans le repere `r` : `s` le long du faitage, `t` en travers. */
function boiteDans(r: Repere, pts: readonly PtBrut[]): { s0: number; s1: number; t0: number; t1: number } {
  const s = pts.map((p) => (p.x - r.p0.x) * r.u.x + (p.y - r.p0.y) * r.u.y), t = pts.map((p) => (p.x - r.p0.x) * r.v.x + (p.y - r.p0.y) * r.v.y);
  return { s0: Math.min(...s), s1: Math.max(...s), t0: Math.min(...t), t1: Math.max(...t) };
}

/**
 * Reunit le corps `rang` et son voisin (`corpsAFusionner`) en un seul corps : le rectangle des deux, le toit du corps `rang` (son faitage,
 * ses egouts), les pignons, lucarnes, fenetres de toit et souches des deux, a leur place. Ce qui etait pose sur le voisin passe sur le corps
 * reuni. Null sans voisin a reunir.
 */
export function fusionnerCorps(corps: readonly CorpsToit[], rang: number): CorpsToit[] | null {
  const k = corpsAFusionner(corps, rang);
  if (k === null) return null;
  const c = corps[rang] as CorpsToit, a = corps[k] as CorpsToit, r = repere(c.pts), ra = repere(a.pts);
  const b = boiteDans(r, [...c.pts, ...a.pts]);
  const P = (s: number, t: number): PtBrut => { const q = point(r, s, t); return { x: centi(q.x), y: centi(q.y) }; };
  // Le long du faitage du voisin, en abscisse du corps reuni (son sens peut etre inverse).
  const sDuVoisin = (s: number) => { const q = point(ra, s, 0); return (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y - b.s0; };
  const surLeVoisin = <T extends { debut: number; fin: number }>(l: readonly T[]) => l.map((g) => { const x0 = sDuVoisin(g.debut), x1 = sDuVoisin(g.fin); return { ...g, debut: centi(Math.min(x0, x1)), fin: centi(Math.max(x0, x1)) }; });
  const panDuVoisin = (pan: 0 | 1): 0 | 1 => { const vMeme = r.v.x * ra.v.x + r.v.y * ra.v.y > 0; return vMeme ? pan : pan === 0 ? 1 : 0; };
  const neuf: CorpsToit = {
    ...c, pts: [P(b.s0, b.t0), P(b.s1, b.t0), P(b.s1, b.t1), P(b.s0, b.t1)], posFaitage: centi(c.posFaitage - b.t0),
    pignons: [...c.pignons.map((g) => ({ ...g, debut: centi(g.debut - b.s0), fin: centi(g.fin - b.s0) })), ...surLeVoisin(a.pignons).map((g) => ({ ...g, pan: panDuVoisin(g.pan) }))]
  };
  const luc = [...(c.lucarnes ?? []).map((l) => ({ ...l, debutM: centi(l.debutM - b.s0), finM: centi(l.finM - b.s0) })),
    ...(a.lucarnes ?? []).map((l) => { const x0 = sDuVoisin(l.debutM), x1 = sDuVoisin(l.finM); return { ...l, pan: panDuVoisin(l.pan), debutM: centi(Math.min(x0, x1)), finM: centi(Math.max(x0, x1)) }; })];
  if (luc.length) neuf.lucarnes = luc; else delete neuf.lucarnes;
  const el = [...(c.elementsToit ?? []).map((e) => ({ ...e, sM: centi(e.sM - b.s0) })), ...(a.elementsToit ?? []).map((e) => ({ ...e, pan: panDuVoisin(e.pan), sM: centi(sDuVoisin(e.sM)) }))];
  if (el.length) neuf.elementsToit = el; else delete neuf.elementsToit;
  const ch = [...(c.cheminees ?? []), ...(a.cheminees ?? [])];
  if (ch.length) neuf.cheminees = ch; else delete neuf.cheminees;
  // Les bouts : celui de chaque extremite vient du corps qui la porte (une croupe de bout reste une croupe).
  if (c.croupes || a.croupes) {
    const bout = (x: number): number => { const de = (o: CorpsToit, ro: Repere, s: 0 | 1) => (o.croupes?.[s] ?? 0) > 0 && Math.abs((o === c ? (s === 0 ? 0 : ro.L) - b.s0 : sDuVoisin(s === 0 ? 0 : ro.L)) - x) < 0.05 ? o.croupes?.[s] ?? 0 : 0;
      return Math.max(de(c, r, 0), de(c, r, 1), de(a, ra, 0), de(a, ra, 1)); };
    neuf.croupes = [bout(0), bout(b.s1 - b.s0)];
  }
  let l = corps.map((x, i) => (i === rang ? neuf : x));
  // Ce qui etait pose sur le voisin passe sur le corps reuni, au mur le plus proche ; puis le voisin part (les rangs suivants descendent).
  l.forEach((x, i) => {
    const s = x.saillie;
    if (!s || s.hote !== k) return;
    const m = murDuCorps(a, s.mur), p = { x: m.a.x + m.u.x * s.centreM, y: m.a.y + m.u.y * s.centreM }, place = murLePlusProche(neuf, p);
    l = replacerSaillie(l, i, { hote: rang, mur: place.mur, centreM: centi(place.centreM) });
  });
  return retirerUnCorps(l, k);
}

/** Retire le corps `k` de la liste ; les saillies posees sur un corps plus loin descendent d'un rang. */
function retirerUnCorps(corps: readonly CorpsToit[], k: number): CorpsToit[] {
  return corps.flatMap((x, i) => (i === k ? [] : x.saillie && x.saillie.hote > k ? [{ ...x, saillie: { ...x.saillie, hote: x.saillie.hote - 1 } }] : [x]));
}

/** La longueur d'un retour d'angle pose d'un geste, le long du mur de bout de la maison, en metres ; ses bouts se tirent ensuite. */
export const LONGUEUR_RETOUR_M = 3;

/**
 * Le retour d'un appentis a l'angle de la maison (deux corps lies, decision du proprietaire du 4 novembre 2026) : un second appentis, de
 * meme largeur, meme egout et meme faitage, dont le mur haut part du bout du mur haut du premier, en equerre, le long du mur de bout. Les
 * deux pans se coupent sur la diagonale de l'angle (three/toitCorps3d.ts, `boutsLies`) : un aretier, une rive basse continue, une
 * gouttiere. `cote` : le bout du premier, vu de face (de dehors, devant sa rive basse). Null : pas un appentis, ou deja lie de ce cote.
 */
export function retourDAngle(corps: readonly CorpsToit[], rang: number, cote: 'gauche' | 'droite'): CorpsToit[] | null {
  const a = corps[rang];
  if (!a || a.saillie || a.speciale || formeDuCorps(a) !== 'appentis') return null;
  const r = repere(a.pts), hautEnT0 = a.posFaitage <= 0.01;
  // La normale qui sort de la rive basse ; vu de face, la droite est a (-n.y, n.x).
  const n = hautEnT0 ? r.v : { x: -r.v.x, y: -r.v.y }, droite = { x: -n.y, y: n.x };
  const auBout = (droite.x * r.u.x + droite.y * r.u.y > 0) === (cote === 'droite') ? r.L : 0;
  const coin = point(r, auBout, hautEnT0 ? 0 : r.W), dehors = auBout > 0 ? r.u : { x: -r.u.x, y: -r.u.y };
  const P = (p: PtBrut): PtBrut => ({ x: centi(p.x), y: centi(p.y) });
  const long = LONGUEUR_RETOUR_M, W = r.W;
  const p1 = { x: coin.x - n.x * long, y: coin.y - n.y * long };
  const b: CorpsToit = {
    pts: [P(coin), P(p1), P({ x: p1.x + dehors.x * W, y: p1.y + dehors.y * W }), P({ x: coin.x + dehors.x * W, y: coin.y + dehors.y * W })],
    posFaitage: 0, faitage: a.faitage, egouts: hautEnT0 ? [a.egouts[0], a.egouts[1]] : [a.egouts[1], a.egouts[0]], pignons: [], ecart: 0,
    ...(a.ouvert !== undefined ? { ouvert: a.ouvert } : {}), ...(a.retraitM !== undefined ? { retraitM: a.retraitM } : {}), ...(a.bords ? { bords: a.bords } : {})
  };
  // Deja lie de ce cote : un autre corps a son mur haut sur ce coin.
  if (corps.some((k, i) => i !== rang && !k.saillie && k.pts.some((q) => Math.hypot(q.x - coin.x, q.y - coin.y) < 0.05) && formeDuCorps(k) === 'appentis')) return null;
  return [...corps, b];
}
