// Un cote d'un corps qui avance ou recule, le cote oppose en place (demande du proprietaire, 9 novembre 2026 : « Les redimensionnements
// d'un corps doivent pouvoir se faire de chaque cote pour eviter de changer la taille et recaler ensuite. »).
//
// Le mur `mur` du rectangle (de `pts[mur]` a `pts[mur + 1]`) glisse sur sa normale sortante : ses deux sommets bougent, les deux autres
// restent. Ce qui est pose sur le corps garde sa place dans le plan quand il le peut : le faitage sa place relative en travers (au milieu, sur
// un mur pour un appentis), les pignons, lucarnes, fenetres de toit et panneaux leur place le long du faitage, les travees et les elements de
// facade (bow-window, galerie, appentis poses) leur place sur leur mur, les cheminees la leur ; ce qui est pose sur le mur qui bouge le suit.
// Un corps colle contre ce mur (une aile posee au bout, la moitie d'un corps coupe) est pousse avec lui : le joint reste ferme. Rien de
// pose qui ne tient plus dans le corps ne disparait sans le dire : il est borne au corps, retire seulement s'il n'y tient plus du tout
// (une travee de moins de 30 cm, un pignon de moins de 1,4 m, comme pour les autres gestes).
//
// Les reponses du proprietaire du 9 novembre 2026 :
// 1. Deux corps qui partagent un mur (un corps coupe en deux : leurs murs se confondent sur au moins PART_MUR_COMMUN de leur longueur) :
//    tirer ce mur le fait glisser entre eux, l'un grandit, l'autre retrecit d'autant, l'emprise totale ne change pas (`murCommun`). Un corps
//    seulement pose contre le mur (une aile au bout, plus courte que lui) est pousse, comme avant.
// 2. Deux appentis lies a l'angle (retour d'angle, l'aretier) : la largeur de l'un change celle de l'autre (`appentisLies`).
// 4. Le mur ne passe pas un pignon ni une travee : il s'arrete a son bord, et dit pourquoi (`arretDuMur`) ; un element deja contre le mur
//    tire le suit, raccourci jusqu'a sa taille minimale, puis le mur s'arrete.
// 6. Le mur se colle aussi au trace IGN du batiment (son contour), comme aux murs des autres corps ; un corps deplace s'y colle par ses
//    murs (`aimanterAuContour`).
//
// Pur : pas de DOM, pas de scene. Rend une NOUVELLE liste de corps.

import { repere } from '../toits/toitCorps.js';
import { murDuCorps, replacerSaillie } from './saillies.js';
import { LONGUEUR_CORPS_MAX_M, LONGUEUR_CORPS_MIN_M, rangPrincipal } from './corpsNeufs.js';
import { DECROCHE_MIN_M } from './travees.js';
import type { CorpsToit, PtBrut } from '../../model/types.js';

const centi = (v: number) => Math.round(v * 100) / 100;
const vingt = (v: number) => Math.round(v * 20) / 20;
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** A moins de cette distance, le mur d'un autre corps est sur la ligne du mur qui bouge : il le touche. En metres. */
export const CONTACT_M = 0.05;
/** Un mur se colle a la ligne d'un mur parallele d'un autre corps a moins de cette distance (l'aimantation des poignees). En metres. */
export const AIMANT_MUR_M = 0.25;
/**
 * Un geste plus petit que cela ne bouge rien : la moitie d'un pas de 5 cm. Le tremblement du doigt au depart d'un glisser laissait un mur
 * pose sur une ligne (le trace IGN, le mur d'un autre corps) s'en ecarter de quelques centimetres. En metres.
 */
export const GESTE_MIN_M = 0.025;
/** Une ligne a moins de cela du mur est celle ou il est deja : elle ne l'attire pas (au-dela, meme a 3 cm, elle l'attire). En metres. */
const SUR_LA_LIGNE_M = 0.005;

/** Deux murs se confondent (un mur commun, celui d'un corps coupe en deux) quand ils se recouvrent sur au moins cette part du plus long. */
export const PART_MUR_COMMUN = 0.9;
/** Un pignon ou une travee « contre » le mur tire : a moins de cela de son bout. En metres. */
const CONTRE_M = 0.05;
/** La largeur la plus petite d'un pignon, en metres (comme pour ses autres gestes). */
const PIGNON_MIN_M = 1.4;

/** Un cote du trace IGN (le contour du batiment) : ou le mur s'est colle, que l'ecran eclaire. */
export interface Arete { a: PtBrut; b: PtBrut }

/**
 * Ce que rend le geste : les corps, si le mur s'est colle a une ligne (un autre corps, le trace IGN), les cotes du trace IGN ou il s'est
 * colle, et, quand quelque chose l'a arrete (un pignon, une travee, l'autre corps a sa taille minimale), la raison, a dire a la personne.
 */
export interface MurPousse { corps: CorpsToit[]; colle: boolean; aretes?: Arete[]; motif?: string }

/** Les raisons d'un arret, dites a la personne. */
export const MOTIF_PIGNON = 'Le pignon empêche d’aller plus loin : retirez-le d’abord.';
export const MOTIF_TRAVEE = 'La travée empêche d’aller plus loin : retirez-la d’abord.';
export const MOTIF_AUTRE_CORPS = 'L’autre corps ne peut pas être plus petit que 2,50 m.';
export const MOTIF_CORPS_VOISIN = 'Le corps voisin empêche d’aller plus loin.';

const pv = (a: PtBrut, b: PtBrut) => a.x * b.y - a.y * b.x;
const ps = (a: PtBrut, b: PtBrut) => a.x * b.x + a.y * b.y;
const moins = (a: PtBrut, b: PtBrut): PtBrut => ({ x: a.x - b.x, y: a.y - b.y });

/** Le faitage a sa place relative en travers : au milieu il reste au milieu, sur un mur (un appentis) sur ce mur. */
function posFaitageRelative(posFaitage: number, W: number, W2: number): number {
  if (Math.abs(posFaitage - W / 2) <= 0.05) return centi(W2 / 2);
  if (posFaitage <= 0.01) return 0;
  if (posFaitage >= W - 0.01) return centi(W2);
  return centi((posFaitage * W2) / W);
}

/**
 * Les corps colles contre le mur `mur` du corps `rang`, du cote ou il avance : un de leurs murs est sur sa ligne, tourne vers lui, et le
 * longe sur plus de 10 cm. De proche en proche : un corps colle a un corps pousse est pousse aussi (trois bandes d'un toit en M).
 *
 * Seul un corps pose au bout suit (une aile au bout d'un corps, son mur contre lui pas plus long que le mur tire) : un corps plus long
 * porte celui qu'on tire, il ne se laisse pas emmener. Raccourcir une aile par son joint deplacait toute la maison (audit du Mode Toit,
 * 9 novembre 2026). Pour la meme raison, le corps principal ne bouge jamais ainsi, ni le corps sur lequel s'appuie le mur haut d'un
 * appentis : tirer ce mur haut ne tire pas la maison.
 */
export function corpsColles(corps: readonly CorpsToit[], rang: number, mur: number): number[] {
  return collesEtButees(corps, rang, mur).colles;
}

/**
 * Les corps colles (`corpsColles`) et les butees : les corps contre le mur tire, ou contre un corps pousse, qui ne se laissent pas emmener
 * (un corps plus long, le corps principal, celui qui porte le mur haut d'un appentis). Le mur ne les traverse pas : il s'arrete contre eux
 * (audit du Mode Toit, 9 novembre 2026 : le pignon d'une maison en T tire vers l'exterieur passait dans l'aile en travers). Il s'en ecarte
 * librement : raccourcir une aile par son joint laisse la maison en place.
 */
export function collesEtButees(corps: readonly CorpsToit[], rang: number, mur: number): { colles: number[]; butees: number[] } {
  const c = corps[rang];
  if (!c) return { colles: [], butees: [] };
  const principal = rangPrincipal(corps);
  const fronts: { rang: number; mur: number }[] = [{ rang, mur }], pris = new Set<number>([rang]), res: number[] = [], butees = new Set<number>();
  for (let k = 0; k < fronts.length; k++) {
    const fr = fronts[k] as { rang: number; mur: number }, porteur = corps[fr.rang] as CorpsToit;
    // Le mur haut d'un appentis s'appuie sur le corps qui le porte : il ne le pousse pas (il bute contre lui).
    const appui = mursDAppentis(porteur)?.haut === fr.mur;
    const f = murDuCorps(porteur, fr.mur);
    corps.forEach((o, j) => {
      if (pris.has(j) || o.saillie || o.pts.length !== 4) return;
      for (let m = 0; m < 4; m++) {
        const w = murDuCorps(o, m);
        if (ps(w.n, f.n) > -0.999 || Math.abs(ps(moins(w.a, f.a), f.n)) > CONTACT_M) continue;
        // Le recouvrement le long du mur : les bouts de l'autre mur, comptes depuis le debut de celui-ci.
        const s1 = ps(moins(w.a, f.a), f.u), s2 = ps(moins(w.b, f.a), f.u);
        if (Math.min(f.L, Math.max(s1, s2)) - Math.max(0, Math.min(s1, s2)) <= 0.1) continue;
        // Un mur plus long que le front : ce corps porte celui qu'on tire, il reste ; de meme le corps principal.
        if (appui || j === principal || w.L > f.L + CONTACT_M) { butees.add(j); return; }
        pris.add(j);
        res.push(j);
        // Son mur oppose devient a son tour un front.
        fronts.push({ rang: j, mur: (m + 2) % 4 });
        return;
      }
    });
  }
  return { colles: res, butees: [...butees].filter((j) => !pris.has(j)) };
}

/**
 * Les lignes des murs paralleles au mur `f` des autres corps, en distance signee le long de sa normale : ou il peut se coller. Pas celle ou
 * il est deja (a SUR_LA_LIGNE_M pres) : elle le retenait a chaque petit pas ; une ligne a 3 cm reste une ligne ou se coller.
 */
function lignesParalleles(corps: readonly CorpsToit[], exclus: ReadonlySet<number>, f: ReturnType<typeof murDuCorps>): number[] {
  const l: number[] = [];
  corps.forEach((o, j) => {
    if (exclus.has(j) || o.saillie) return;
    for (let m = 0; m < o.pts.length; m++) {
      const w = murDuCorps(o, m), x = ps(moins(w.a, f.a), f.n);
      // La ligne sur laquelle le mur est deja (un corps voisin aligne, l'aile contre laquelle il bute) ne l'attire pas.
      if (Math.abs(pv(w.u, f.u)) < 0.02 && Math.abs(x) > SUR_LA_LIGNE_M) l.push(x);
    }
  });
  return l;
}

/** Ce qui est pose le long d'un mur, de `de` a `a` depuis son debut, borne a sa nouvelle longueur ; null s'il n'y tient plus. */
function surLeMur<T extends { de: number; a: number }>(t: T, decale: number, L: number, min: number): T | null {
  const de = centi(Math.max(0, t.de + decale)), a = centi(Math.min(L, t.a + decale));
  return a - de >= min - 1e-9 ? { ...t, de, a } : null;
}

/**
 * Le mur d'un autre corps qui est le meme mur que le mur `mur` du corps `rang` (decision 1 du 9 novembre 2026) : sur sa ligne, tourne vers
 * lui, et les deux se recouvrent sur au moins PART_MUR_COMMUN du plus long (un corps coupe en deux, deux moities d'un toit en M). Une aile
 * posee au bout d'un corps plus large n'a pas de mur commun avec lui : elle est poussee. Un appentis adosse par son mur haut (un auvent,
 * une galerie le long de la facade) non plus : il s'appuie sur ce mur, il le suit sans changer de profondeur. Null : aucun.
 */
export function murCommun(corps: readonly CorpsToit[], rang: number, mur: number): { rang: number; mur: number } | null {
  const c = corps[rang];
  if (!c || c.saillie || c.pts.length !== 4 || mursDAppentis(c)?.haut === mur) return null;
  const f = murDuCorps(c, mur);
  for (let j = 0; j < corps.length; j++) {
    const o = corps[j] as CorpsToit;
    if (j === rang || o.saillie || o.pts.length !== 4) continue;
    for (let m = 0; m < 4; m++) {
      const w = murDuCorps(o, m);
      if (ps(w.n, f.n) > -0.999 || Math.abs(ps(moins(w.a, f.a), f.n)) > CONTACT_M) continue;
      const s1 = ps(moins(w.a, f.a), f.u), s2 = ps(moins(w.b, f.a), f.u);
      const commun = Math.min(f.L, Math.max(s1, s2)) - Math.max(0, Math.min(s1, s2));
      if (commun >= PART_MUR_COMMUN * Math.max(f.L, w.L) - 1e-9 && mursDAppentis(o)?.haut !== m) return { rang: j, mur: m };
    }
  }
  return null;
}

/** Les murs haut et bas d'un appentis (le faitage sur un mur), null pour un autre toit. */
function mursDAppentis(c: CorpsToit): { haut: number; bas: number } | null {
  if (c.saillie || c.speciale || c.pts.length !== 4 || c.faitage - Math.min(...c.egouts) < 0.05) return null;
  const { W } = repere(c.pts);
  return c.posFaitage <= 0.01 ? { haut: 0, bas: 2 } : c.posFaitage >= W - 0.01 ? { haut: 2, bas: 0 } : null;
}

/** Un appentis lie a un autre a l'angle : son rang, son mur bas, et son mur de bout sur le coin commun. */
interface Lie { rang: number; bas: number; bout: number; coin: PtBrut }

/**
 * Les appentis lies au corps `rang` par un retour d'angle (decision 2 du 9 novembre 2026) : la regle de three/toitCorps3d.ts::boutsLies
 * (murs hauts qui se rejoignent a l'angle, en equerre, meme largeur, memes egout et faitage, a 5 cm), ou les deux pans se coupent sur un
 * aretier. Changer la largeur de l'un change celle de l'autre : l'aretier reste.
 */
export function appentisLies(corps: readonly CorpsToit[], rang: number): Lie[] {
  const c = corps[rang], mc = c ? mursDAppentis(c) : null;
  if (!c || !mc) return [];
  const h = murDuCorps(c, mc.haut), r = repere(c.pts), pres = (p: PtBrut, q: PtBrut) => Math.hypot(p.x - q.x, p.y - q.y) <= 0.05;
  const l: Lie[] = [];
  corps.forEach((o, j) => {
    const mo = j === rang ? null : mursDAppentis(o);
    if (!mo) return;
    const ho = murDuCorps(o, mo.haut), ro = repere(o.pts);
    if (Math.abs(ro.W - r.W) > 0.05 || Math.abs(o.faitage - c.faitage) > 0.05 || Math.abs(Math.min(...o.egouts) - Math.min(...c.egouts)) > 0.05) return;
    if (Math.abs(ps(h.u, ho.u)) >= 0.1) return;
    const coin = [h.a, h.b].find((p) => pres(p, ho.a) || pres(p, ho.b));
    if (!coin) return;
    // Le mur de bout de l'autre appentis sur le coin : celui des deux voisins de son mur haut qui passe par lui.
    const bout = [(mo.haut + 1) % 4, (mo.haut + 3) % 4].find((m) => { const w = murDuCorps(o, m); return pres(w.a, coin) || pres(w.b, coin); });
    if (bout !== undefined) l.push({ rang: j, bas: mo.bas, bout, coin });
  });
  return l;
}

/**
 * Jusqu'ou le mur `m` du corps peut reculer sans passer un pignon ni une travee (decision 4 du 9 novembre 2026 : « le corps s'arrete au
 * bord de l'element », au lieu de le faire disparaitre) : le plus petit deplacement admis (negatif ou nul) et la raison. Un element loin du
 * mur arrete le mur a son bord ; un element deja contre le mur (un pignon au bout du faitage, une travee d'angle) le suit, raccourci
 * jusqu'a sa taille minimale (1,4 m, 30 cm), et le mur s'arrete la. Null : rien ne l'arrete.
 */
export function arretDuMur(c: CorpsToit, m: number): { d: number; motif: string } | null {
  if (c.pts.length !== 4) return null;
  let d = -Infinity, motif = '';
  const garder = (v: number, raison: string) => { if (v > d) { d = v; motif = raison; } };
  // Les pignons se comptent le long du faitage : seuls les bouts (murs 1 et 3) les approchent.
  if (m % 2 === 1) {
    const L = repere(c.pts).L;
    for (const g of c.pignons) {
      if (m === 1) garder(g.fin >= L - CONTRE_M ? g.debut + PIGNON_MIN_M - L : g.fin - L, MOTIF_PIGNON);
      else garder(g.debut <= CONTRE_M ? -(g.fin - PIGNON_MIN_M) : -g.debut, MOTIF_PIGNON);
    }
  }
  // Les travees des deux murs voisins, qui raccourcissent : celui qui part du mur tire par son debut, celui qui y arrive par sa fin.
  for (const t of c.travees ?? []) {
    if (t.mur === (m + 1) % 4) garder(t.de <= CONTRE_M ? -(t.a - DECROCHE_MIN_M) : -t.de, MOTIF_TRAVEE);
    else if (t.mur === (m + 3) % 4) { const Lw = murDuCorps(c, t.mur).L; garder(t.a >= Lw - CONTRE_M ? t.de + DECROCHE_MIN_M - Lw : t.a - Lw, MOTIF_TRAVEE); }
  }
  return d === -Infinity ? null : { d: Math.min(0, centi(d)), motif };
}

/** Les bornes du deplacement `d` quand le mur `m` du corps `c` bouge de `k * d` : sa taille (2,5 a 30 m) et ce qui l'arrete. */
interface Bornes { lo: number; hi: number; motifLo?: string; motifHi?: string }
function bornesDuMur(c: CorpsToit, m: number, k: number, autre: boolean): Bornes {
  const r = repere(c.pts), act = m % 2 === 0 ? r.W : r.L;
  let eLo = Math.min(LONGUEUR_CORPS_MIN_M, act) - act, motif: string | undefined = autre ? MOTIF_AUTRE_CORPS : undefined;
  const eHi = Math.max(LONGUEUR_CORPS_MAX_M, act) - act;
  const a = arretDuMur(c, m);
  if (a && a.d > eLo) { eLo = a.d; motif = a.motif; }
  if (Math.abs(k) < 1e-9) return { lo: -Infinity, hi: Infinity };
  return k > 0 ? { lo: eLo / k, hi: eHi / k, ...(motif ? { motifLo: motif } : {}) } : { lo: eHi / k, hi: eLo / k, ...(motif ? { motifHi: motif } : {}) };
}

/**
 * Les cotes du trace IGN paralleles au mur `f`, qui le longent, en distance signee le long de sa normale ; sauf celui sur lequel le mur
 * est deja (a SUR_LA_LIGNE_M pres), qui le ramenait a sa place a chaque petit pas. Un cote a quelques centimetres reste ou se coller.
 */
function lignesIgn(contour: readonly PtBrut[], f: ReturnType<typeof murDuCorps>): { x: number; arete: Arete }[] {
  const l: { x: number; arete: Arete }[] = [];
  contour.forEach((a, i) => {
    const b = contour[(i + 1) % contour.length] as PtBrut, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.1 || Math.abs(pv({ x: (b.x - a.x) / L, y: (b.y - a.y) / L }, f.u)) >= 0.02) return;
    const s1 = ps(moins(a, f.a), f.u), s2 = ps(moins(b, f.a), f.u);
    if (Math.min(f.L, Math.max(s1, s2)) - Math.max(0, Math.min(s1, s2)) <= 0.1) return;
    // Le cote sur lequel le mur est deja ne l'attire pas : sinon tout pas de moins de 25 cm le ramenait la, sans rien dire.
    const x = ps(moins(a, f.a), f.n);
    if (Math.abs(x) <= SUR_LA_LIGNE_M) return;
    l.push({ x, arete: { a, b } });
  });
  return l;
}

/**
 * Un corps deplace de `(dx, dy)` se colle au trace IGN (decision 6 du 9 novembre 2026) : sur chacun de ses deux axes, le cote du trace
 * parallele a un de ses murs, qui le longe, le plus proche a moins de AIMANT_MUR_M, du cote ou il va ; colles sur les deux axes, ses coins
 * vont aux coins du trace. Sur un axe sans cote proche, le deplacement (pas la place) tombe aux 5 cm ronds : un corps pose sur le trace
 * glisse le long de lui sans s'en ecarter, et un geste de moins de GESTE_MIN_M sur un axe ne le bouge pas sur cet axe. Rend le deplacement
 * et les cotes ou il s'est colle (vide : aucun). `contour` vide : les 5 cm ronds seuls.
 */
export function aimanterAuContour(c: CorpsToit, dx: number, dy: number, contour: readonly PtBrut[]): { dx: number; dy: number; aretes: Arete[] } {
  if (c.pts.length !== 4) return { dx, dy, aretes: [] };
  const w0 = murDuCorps(c, 0), axes: [PtBrut, PtBrut] = [w0.n, w0.u], aretes: Arete[] = [];
  const t = axes.map((A) => dx * A.x + dy * A.y);
  const res = t.map((v, k) => {
    if (Math.abs(v) < GESTE_MIN_M) return 0;
    const A = axes[k as 0 | 1];
    let meilleur: { v: number; arete: Arete } | null = null;
    // Les murs de cet axe : 0 et 2 pour la normale du mur 0, 1 et 3 pour son sens.
    for (const m of k === 0 ? [0, 2] : [1, 3]) {
      const w = murDuCorps(c, m), sens = ps(w.n, A);
      for (const l of contour.length >= 3 ? lignesIgn(contour, w) : []) {
        const cible = l.x * sens;
        // Une ligne derriere le geste ne le ramene pas en arriere.
        if (cible * v <= 0) continue;
        if (Math.abs(cible - v) <= AIMANT_MUR_M && (!meilleur || Math.abs(cible - v) < Math.abs(meilleur.v - v))) meilleur = { v: cible, arete: l.arete };
      }
    }
    if (meilleur) aretes.push(meilleur.arete);
    return meilleur ? meilleur.v : vingt(v);
  });
  const [a, b] = res as [number, number], [n, u] = axes;
  return { dx: n.x * a + u.x * b, dy: n.y * a + u.y * b, aretes };
}

/**
 * Le mur `m` du corps `rang` glisse de `d` metres sur sa normale sortante, deja borne : le corps change, ce qui est pose dessus garde sa
 * place, ses elements de facade se replacent. Ni corps colles, ni voisins : `pousserLeMur` s'en charge.
 */
function pousserUnCorps(corps: readonly CorpsToit[], rang: number, m: number, d: number): CorpsToit[] {
  const c = corps[rang] as CorpsToit, f = murDuCorps(c, m), r = repere(c.pts);
  const enLargeur = m % 2 === 0, nouvelle = (enLargeur ? r.W : r.L) + d;
  const dx = f.n.x * d, dy = f.n.y * d;
  const pts = c.pts.map((p, i) => (i === m || i === (m + 1) % 4 ? { x: centi(p.x + dx), y: centi(p.y + dy) } : p));
  const neuf: CorpsToit = { ...c, pts };
  // Le mur 3 (s = 0) qui bouge deplace l'origine des longueurs : ce qui se compte le long du faitage s'y decale, et garde sa place.
  const ds = m === 3 ? d : 0;
  const L2 = enLargeur ? r.L : nouvelle, W2 = enLargeur ? nouvelle : r.W;
  if (enLargeur) {
    neuf.posFaitage = posFaitageRelative(c.posFaitage, r.W, W2);
    // Un pignon ou une lucarne qui part du faitage y va encore ; sinon il garde sa profondeur, bornee au pan.
    const pans = [c.posFaitage, r.W - c.posFaitage], pans2 = [neuf.posFaitage, W2 - neuf.posFaitage];
    const prof = (p: number, pan: 0 | 1) => {
      const avant = pans[pan] as number, apres = pans2[pan] as number;
      if (avant < 0.05) return p;
      return centi(Math.abs(p - avant) <= 0.05 ? apres : Math.min(p, apres));
    };
    neuf.pignons = c.pignons.map((g) => ({ ...g, profondeur: prof(g.profondeur, g.pan) }));
    if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => ({ ...l, profondeurM: prof(l.profondeurM, l.pan) }));
    if (c.elementsToit) neuf.elementsToit = c.elementsToit.map((e) => ({ ...e, dM: centi(borne(e.dM, 0.3, Math.max((pans2[e.pan] as number) - 0.3, 0.3))) }));
    // Un brisis ou un coyau garde sa largeur, borne a son pan.
    if (c.profil) neuf.profil = c.profil.map((q, i) => {
      const max = centi(Math.max((pans2[i] as number) - 0.3, 0.3));
      return q.type === 'brise' ? { ...q, largeurBrisisM: Math.min(q.largeurBrisisM, max) } : q.type === 'coyau' ? { ...q, largeurM: Math.min(q.largeurM, max) } : q;
    }) as typeof c.profil;
  } else {
    neuf.pignons = c.pignons.flatMap((g) => {
      const debut = centi(Math.max(0, g.debut + ds)), fin = centi(Math.min(L2, g.fin + ds));
      return fin - debut >= PIGNON_MIN_M - 1e-9 ? [{ ...g, debut, fin }] : [];
    });
    if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => {
      const debutM = centi(borne(l.debutM + ds, 0.1, L2 - 0.7)), finM = centi(borne(l.finM + ds, debutM + 0.6, L2 - 0.1));
      return { ...l, debutM, finM };
    });
    if (c.elementsToit) neuf.elementsToit = c.elementsToit.map((e) => ({ ...e, sM: centi(borne(e.sM + ds, 0.5, Math.max(L2 - 0.5, 0.5))) }));
    // Une croupe garde sa longueur (sa pente), les deux tenant dans le faitage.
    if (c.croupes) {
      const t = c.croupes[0] + c.croupes[1], k = t > L2 ? L2 / t : 1;
      neuf.croupes = [centi(c.croupes[0] * k), centi(c.croupes[1] * k)];
    }
    if (c.bouts) neuf.bouts = c.bouts.map((b) => ('profondeurM' in b ? { ...b, profondeurM: Math.min(b.profondeurM, centi(L2 / 2)) } : 'largeurM' in b ? { ...b, largeurM: Math.min(b.largeurM, centi(L2 / 2)) } : b)) as typeof c.bouts;
  }
  // Les murs voisins du mur qui bouge changent de longueur : celui qui part de lui (m + 1) s'allonge par son debut, ce qui y est pose
  // se decale d'autant ; celui qui y arrive (m + 3) s'allonge par sa fin.
  const decalage = (w: number) => (w === (m + 1) % 4 ? d : 0);
  const longueur = (w: number) => (w % 2 === 0 ? L2 : W2);
  if (c.travees) {
    neuf.travees = c.travees.flatMap((t) => {
      const k = surLeMur(t, decalage(t.mur), longueur(t.mur), DECROCHE_MIN_M);
      return k ? [k] : [];
    });
  }
  let l = corps.map((k, i) => (i === rang ? neuf : k));
  // Les elements de facade de ce corps : a leur place sur leur mur, puis replaces (bornes au mur, leur rectangle refait).
  corps.forEach((k, i) => {
    if (k.saillie?.hote !== rang) return;
    const s = k.saillie, centreM = centi(s.centreM + decalage(s.mur));
    l = replacerSaillie(l, i, centreM === s.centreM ? {} : { centreM });
  });
  return l;
}

/**
 * Le mur `mur` du corps `rang` avance de `delta` metres vers l'exterieur (negatif : il recule), le mur oppose en place. Le deplacement
 * s'arrondit a 5 cm (pas la dimension : un mur pose sur une ligne, celle d'un corps lu sur l'IGN dont la taille n'est pas un multiple de
 * 5 cm, la quittait d'un toucher) ; un geste de moins de GESTE_MIN_M ne bouge rien. La dimension du corps (sa largeur pour les murs 0 et 2,
 * sa longueur pour les murs 1 et 3) reste entre 2,5 et 30 m (un corps deja plus petit ou plus grand ne s'y voit pas ramene d'un toucher) ;
 * a moins de 25 cm de la ligne d'un mur parallele d'un autre corps, ou d'un cote du trace IGN (`contour`, le contour du batiment), du cote
 * ou il va, le mur s'y colle. Un mur commun a un autre corps glisse entre eux ; un corps pose contre le mur est pousse, un corps qui ne se
 * laisse pas emmener l'arrete ; un appentis lie a l'angle garde la meme largeur ; le mur s'arrete au bord d'un pignon ou d'une travee, en
 * le disant. Un element de facade pose (bow-window, galerie, appentis) et un corps neuf ne se tirent pas ainsi.
 */
export function pousserLeMur(corps: readonly CorpsToit[], rang: number, mur: number, delta: number, contour?: readonly PtBrut[]): MurPousse {
  const c = corps[rang];
  const rien: MurPousse = { corps: corps.slice(), colle: false };
  if (!c || c.saillie || c.pts.length !== 4) return rien;
  const m = ((mur % 4) + 4) % 4, f = murDuCorps(c, m);
  if (Math.abs(delta) < GESTE_MIN_M) return rien;
  const commun = murCommun(corps, rang, m);
  const { colles, butees } = commun ? { colles: [], butees: [] } : collesEtButees(corps, rang, m);
  // Un appentis lie a l'angle suit la largeur : par son mur bas quand le mur bas bouge, et aussi par son bout quand le mur haut bouge
  // (le coin de l'aretier se deplace avec lui).
  const mc = mursDAppentis(c), largeur = !!mc && (m === mc.haut || m === mc.bas);
  const lies = largeur ? appentisLies(corps, rang) : [];
  // Le mur se colle a la ligne d'un autre corps ou du trace IGN, du cote ou il va ; sinon le deplacement tombe aux 5 cm ronds.
  const exclus = new Set([rang, ...colles, ...(commun ? [commun.rang] : []), ...lies.map((x) => x.rang)]);
  const lignes: { x: number; arete?: Arete }[] = [...lignesParalleles(corps, exclus, f).map((x) => ({ x })), ...(contour ? lignesIgn(contour, f) : [])];
  let colle = false, d = vingt(delta), aretes: Arete[] = [];
  let proche = Infinity;
  for (const x of lignes) {
    if (x.x * delta <= 0) continue;
    const e = Math.abs(x.x - delta);
    if (e <= AIMANT_MUR_M && e < proche - 1e-9) { proche = e; d = x.x; colle = true; aretes = x.arete ? [x.arete] : []; }
  }
  // Les bornes : la taille du corps et ce qui l'arrete, puis celles de l'autre corps du mur commun (qui bouge de -d) et des appentis lies.
  const toutes: Bornes[] = [bornesDuMur(c, m, 1, false)];
  // Un corps contre le mur (ou contre un corps pousse) qui ne se laisse pas emmener : le mur s'arrete contre lui, il s'en ecarte librement.
  if (butees.length) toutes.push({ lo: -Infinity, hi: 0, motifHi: MOTIF_CORPS_VOISIN });
  if (commun) toutes.push(bornesDuMur(corps[commun.rang] as CorpsToit, commun.mur, -1, true));
  for (const x of lies) {
    const o = corps[x.rang] as CorpsToit;
    toutes.push(bornesDuMur(o, x.bas, 1, true));
    if (m === mc?.haut) toutes.push(bornesDuMur(o, x.bout, ps(f.n, murDuCorps(o, x.bout).n), true));
  }
  let motif: string | undefined;
  for (const b of toutes) {
    if (d < b.lo - 1e-9) { d = b.lo; motif = b.motifLo; colle = false; aretes = []; }
    if (d > b.hi + 1e-9) { d = b.hi; motif = b.motifHi; colle = false; aretes = []; }
  }
  d = centi(d);
  if (Math.abs(d) < 0.005) return motif ? { ...rien, motif } : rien;
  let l = pousserUnCorps(corps, rang, m, d);
  // Le mur commun glisse : l'autre corps retrecit (ou grandit) d'autant, son mur oppose en place.
  if (commun) l = pousserUnCorps(l, commun.rang, commun.mur, -d);
  for (const x of lies) {
    l = pousserUnCorps(l, x.rang, x.bas, d);
    if (m === mc?.haut) { const o = l[x.rang] as CorpsToit, e = centi(d * ps(f.n, murDuCorps(o, x.bout).n)); if (Math.abs(e) >= 0.005) l = pousserUnCorps(l, x.rang, x.bout, e); }
  }
  // Les corps colles suivent le mur, avec ce qui est pose sur eux.
  const dx = f.n.x * d, dy = f.n.y * d;
  for (const j of colles) {
    const o = l[j] as CorpsToit;
    l[j] = { ...o, pts: o.pts.map((p) => ({ x: centi(p.x + dx), y: centi(p.y + dy) })), ...(o.cheminees ? { cheminees: o.cheminees.map((h) => ({ ...h, x: centi(h.x + dx), y: centi(h.y + dy) })) } : {}) };
    l.forEach((k, i) => { if (k.saillie?.hote === j) l = replacerSaillie(l, i, {}); });
  }
  return { corps: l, colle, ...(aretes.length ? { aretes } : {}), ...(motif ? { motif } : {}) };
}
