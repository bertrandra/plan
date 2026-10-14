// Ce que Plan fait de la reponse de Claude (MD/spec-facades-calage-detection.md §12 bis, « Ce que Plan
// en fait », lot L18). Une position donnee par Claude n'est jamais une cote : c'est une **graine**.
// - Un coin propose est rattache au croisement de segments le plus proche (calage fin, F§6).
// - Une boite proposee est ajustee sur les profils de contours (F§9), puis passe par la structure
//   (F§10).
// Une graine que rien ne soutient dans l'image (aucun segment, aucune arete a moins de 30 cm) est
// rejetee, ou laissee en pointille. Ce qui vient de Claude porte `source: 'claude'`, puis `corrigee`
// si l'utilisateur le retouche (facade/verification.ts).
//
// Les avis sur les ouvertures detectees passent par le meme controle croise que les toits
// (spec-regles-toits §14.2, point 4) : Claude ne retire pas une baie que la detection voit avec
// confiance ; il la retire seulement si elle etait deja peu sure, et elle reste alors proposee,
// decochee.
//
// Tout est pur : le releve, l'audit et le banc l'appellent de la meme facon.

import { au } from '../util/tableaux.js';
import { pxParMetreDesCoins } from './calage.js';
import { intersection, ligneParPoints } from './calageFin.js';
import { regulariser, structurer } from './structure.js';
import { CONFIANCE_PLEINE } from './verification.js';
import { depuisGrille, DIVISIONS_GRILLE, type AvisVote, type VoteRenfort } from './renfort.js';
import type { Image, P2 } from './homographie.js';
import type { Segment } from './segments.js';
import type { DetailsOuverture, OuvertureFacade } from '../model/types.js';

/** Au-dela de 30 cm, une arete ne soutient plus une graine (F§12 bis). */
export const RAYON_SOUTIEN_M = 0.3;
/** Une graine de boite ajustee sur au moins trois cotes est proposee cochee ; sur un ou deux, en pointille. */
export const COTES_PLEINS = 3;
/** La part des lignes (ou colonnes) d'un cote ou l'arete se lit, au-dessus de laquelle le cote est soutenu. */
export const COUVERTURE_ARETE = 0.6;
/** La resolution de travail des profils : 2 cm suffisent a un bord au centimetre pres apres affinage. */
const PX_PAR_M_PROFILS = 50;
/** Deux boites sont la meme baie a partir de ce recouvrement. */
const MEME_BAIE = 0.3;

const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------------------------------------
 * Les coins : le croisement de segments le plus proche
 * --------------------------------------------------------------------------------------------- */

export interface CoinRecale {
  /** Le croisement retenu, en pixels de la photo. */
  point: P2;
  /** Distance de la graine au croisement, en pixels. */
  ecartPx: number;
}

/** Les deux voisins d'un coin (HG, HD, BD, BG) : les aretes qui en partent. */
const VOISINS: readonly [number, number][] = [[1, 3], [0, 2], [3, 1], [2, 0]];

const unitaire = (a: P2, b: P2): P2 | null => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return l > 1e-9 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : null;
};

/** Distance d'un point a un segment (et non a sa droite) : le segment doit atteindre le croisement. */
function distanceAuSegment(p: P2, g: Segment): number {
  const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - g.x1) * dx + (p.y - g.y1) * dy) / l2)) : 0;
  return Math.hypot(p.x - (g.x1 + t * dx), p.y - (g.y1 + t * dy));
}

/**
 * Une arete du mur est longue : un segment de moins de 15 % du cote attendu est un joint de brique,
 * une pierre, un petit bois, pas un bord de mur.
 */
export const PART_COTE_MIN = 0.15;

/** Les segments qui suivent la direction `d` (a 15 degres pres), longs d'au moins `longueurMin`, et passent a moins de `rayon` de `graine`. */
function segmentsVers(segments: readonly Segment[], graine: P2, d: P2, rayon: number, longueurMin: number): Segment[] {
  const cosMax = Math.cos((15 * Math.PI) / 180);
  return segments.filter((g) => {
    if (g.longueur < longueurMin) return false;
    const u = unitaire({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 });
    if (!u || Math.abs(u.x * d.x + u.y * d.y) < cosMax) return false;
    return distanceAuSegment(graine, g) <= rayon;
  });
}

/**
 * Rattache les graines de coins (pixels de la photo ; null : Claude ne l'a pas situe) au croisement le
 * plus proche de deux segments qui suivent les deux aretes du coin. La recherche va jusqu'a un
 * demi-repere de la grille (la precision de la graine) ; le croisement n'est retenu que si chacun de
 * ses deux segments passe a moins de 30 cm de lui. Rend, pour chaque coin, le croisement, ou null :
 * la graine n'est soutenue par rien, elle est rejetee et le coin de l'algorithme reste.
 */
export function recalerCoins(graines: readonly (P2 | null)[], segments: readonly Segment[], largeurM: number, hauteurM: number, image: { largeur: number; hauteur: number }, repli: readonly P2[]): (CoinRecale | null)[] {
  // Le quadrilatere de reference : les graines, completees par les coins de l'algorithme.
  const quad = [0, 1, 2, 3].map((k) => graines[k] ?? au(repli, k));
  const pxParM = pxParMetreDesCoins(quad, largeurM, hauteurM) ?? 0;
  const soutien = Math.max(4, RAYON_SOUTIEN_M * pxParM);
  const demiRepere = 0.5 * Math.max(image.largeur, image.hauteur) / DIVISIONS_GRILLE;
  const recherche = Math.max(soutien, demiRepere);
  return [0, 1, 2, 3].map((k) => {
    const g = graines[k];
    if (!g) return null;
    const [a, b] = au(VOISINS, k);
    const da = unitaire(g, au(quad, a)), db = unitaire(g, au(quad, b));
    if (!da || !db) return null;
    const la = Math.hypot(au(quad, a).x - g.x, au(quad, a).y - g.y), lb = Math.hypot(au(quad, b).x - g.x, au(quad, b).y - g.y);
    const A = segmentsVers(segments, g, da, recherche, Math.max(12, PART_COTE_MIN * la)), B = segmentsVers(segments, g, db, recherche, Math.max(12, PART_COTE_MIN * lb));
    let meilleur: { point: P2; score: number; ecart: number } | null = null;
    for (const s of A) for (const t of B) {
      const ls = ligneParPoints({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }), lt = ligneParPoints({ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 });
      const p = ls && lt ? intersection(ls, lt) : null;
      if (!p) continue;
      const ecart = Math.hypot(p.x - g.x, p.y - g.y);
      if (ecart > recherche || distanceAuSegment(p, s) > soutien || distanceAuSegment(p, t) > soutien) continue;
      // Le plus proche, et a distance egale le mieux soutenu (les plus longs segments).
      const score = ecart / recherche - 0.5 * Math.min(1, (s.longueur + t.longueur) / Math.max(1, la + lb));
      if (!meilleur || score < meilleur.score) meilleur = { point: p, score, ecart };
    }
    return meilleur ? { point: { x: Math.round(meilleur.point.x * 10) / 10, y: Math.round(meilleur.point.y * 10) / 10 }, ecartPx: Math.round(meilleur.ecart * 10) / 10 } : null;
  });
}

/** Les graines de coins du vote, en pixels de la photo (null : pas de majorite). */
export function grainesDeCoins(vote: VoteRenfort, largeurPx: number, hauteurPx: number): (P2 | null)[] {
  return vote.coins.map((c) => (c.repere ? depuisGrille(c.repere, largeurPx, hauteurPx) : null));
}

/* ------------------------------------------------------------------------------------------------
 * Les boites : les profils de contours
 * --------------------------------------------------------------------------------------------- */

/** Les gradients de l'elevation, a 2 cm : de quoi lire un bord le long d'un cote. */
export interface CartesAretes {
  l: number;
  h: number;
  pxParM: number;
  /** Gradient horizontal et vertical (le canal qui varie le plus), en niveaux. */
  gx: Float32Array;
  gy: Float32Array;
  /** Au-dessus, un pixel est sur une arete : trois fois le gradient median du mur, six niveaux au moins. */
  seuil: number;
}

/** Les cartes d'aretes d'une elevation (le mur seul, sol en bas) a `pxParM`. `vu` masque ce que la photo n'a pas couvert. */
export function cartesAretes(img: Image, pxParM: number, vu: Uint8Array | null = null): CartesAretes {
  const s = Math.max(1, Math.floor(pxParM / PX_PAR_M_PROFILS));
  const l = Math.max(1, Math.floor(img.largeur / s)), h = Math.max(1, Math.floor(img.hauteur / s));
  const c = new Float32Array(l * h * 3);
  const vus = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    let r = 0, g = 0, b = 0, n = 0, v = 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const X = x * s + i, Y = y * s + j;
      const o = (Y * img.largeur + X) * 4;
      r += img.donnees[o] ?? 0; g += img.donnees[o + 1] ?? 0; b += img.donnees[o + 2] ?? 0; n++;
      v += vu ? (vu[Y * img.largeur + X] ?? 0) : 1;
    }
    const k = (y * l + x) * 3;
    c[k] = r / n; c[k + 1] = g / n; c[k + 2] = b / n;
    vus[y * l + x] = v * 2 >= n ? 1 : 0;
  }
  const gx = new Float32Array(l * h), gy = new Float32Array(l * h);
  const echantillon: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < l - 1; x++) {
    const i = y * l + x;
    if (!vus[i]) continue;
    let mx = 0, my = 0;
    for (let k = 0; k < 3; k++) {
      mx = Math.max(mx, Math.abs((c[(i + 1) * 3 + k] ?? 0) - (c[(i - 1) * 3 + k] ?? 0)) / 2);
      my = Math.max(my, Math.abs((c[(i + l) * 3 + k] ?? 0) - (c[(i - l) * 3 + k] ?? 0)) / 2);
    }
    gx[i] = mx; gy[i] = my;
    if ((x + y) % 3 === 0) echantillon.push(mx, my);
  }
  echantillon.sort((a, b) => a - b);
  const med = echantillon.length ? (echantillon[Math.floor(echantillon.length / 2)] ?? 0) : 0;
  return { l, h, pxParM: pxParM / s, gx, gy, seuil: Math.max(6, 3 * med) };
}

/**
 * Le bord le mieux soutenu pres de `pos` (metres) : pour chaque colonne (ou ligne) a moins de 30 cm,
 * la part des pixels du cote ou le gradient passe le seuil (a un pixel pres de travers). Rend la
 * position retenue (metres) et sa couverture ; null si aucun bord n'atteint `COUVERTURE_ARETE`.
 */
function bordLe(C: CartesAretes, vertical: boolean, pos: number, debut: number, fin: number): number | null {
  const k = C.pxParM;
  const R = Math.round(RAYON_SOUTIEN_M * k);
  const centre = Math.round(pos * k);
  // Le milieu du cote seulement : les coins d'une baie touchent le linteau, l'appui, un volet.
  const a = Math.round((debut + 0.15 * (fin - debut)) * k), b = Math.round((debut + 0.85 * (fin - debut)) * k);
  const N = vertical ? C.l : C.h, long = vertical ? C.h : C.l;
  const g = vertical ? C.gx : C.gy;
  let meilleur: { p: number; couv: number; force: number } | null = null;
  for (let p = Math.max(1, centre - R); p <= Math.min(N - 2, centre + R); p++) {
    let fort = 0, total = 0, somme = 0;
    for (let q = Math.max(0, a); q <= Math.min(long - 1, b); q++) {
      let m = 0;
      for (let d = -1; d <= 1; d++) {
        const pp = p + d;
        if (pp < 0 || pp >= N) continue;
        m = Math.max(m, (vertical ? g[q * C.l + pp] : g[pp * C.l + q]) ?? 0);
      }
      total++;
      somme += m;
      if (m >= C.seuil) fort++;
    }
    if (!total) continue;
    const couv = fort / total, force = somme / total;
    const mieux = !meilleur || couv > meilleur.couv + 1e-9 || (Math.abs(couv - meilleur.couv) <= 1e-9 && (force > meilleur.force + 1e-9 || (Math.abs(force - meilleur.force) <= 1e-9 && Math.abs(p - centre) < Math.abs(meilleur.p - centre))));
    if (mieux) meilleur = { p, couv, force };
  }
  return meilleur && meilleur.couv >= COUVERTURE_ARETE ? meilleur.p / k : null;
}

export interface BoiteRecalee {
  x: number;
  y: number;
  l: number;
  h: number;
  /** Les cotes soutenus par une arete : gauche, droite, bas (appui), haut (linteau). */
  soutenus: number;
}

/**
 * Une boite proposee (metres, y depuis le sol) ajustee sur les profils de contours : chaque cote va au
 * bord le mieux soutenu a moins de 30 cm, ou reste ou il est. Rend aussi le nombre de cotes soutenus.
 */
export function recalerBoite(b: { x: number; y: number; l: number; h: number }, C: CartesAretes): BoiteRecalee {
  const Hm = C.h / C.pxParM;
  // En lignes de l'image, le haut de la baie (linteau) est plus petit que son bas (appui).
  const haut = Hm - (b.y + b.h), bas = Hm - b.y;
  const gauche = bordLe(C, true, b.x, haut, bas), droite = bordLe(C, true, b.x + b.l, haut, bas);
  const lin = bordLe(C, false, haut, b.x, b.x + b.l), app = bordLe(C, false, bas, b.x, b.x + b.l);
  let x0 = gauche ?? b.x, x1 = droite ?? b.x + b.l;
  let yHaut = lin ?? haut, yBas = app ?? bas;
  // Un ajustement qui retournerait la boite, ou la ramenerait sous 30 cm, n'en est pas un.
  if (x1 - x0 < 0.3) { x0 = b.x; x1 = b.x + b.l; }
  if (yBas - yHaut < 0.3) { yHaut = haut; yBas = bas; }
  const soutenus = [gauche, droite, app, lin].filter((v) => v !== null).length;
  return { x: r2(x0), y: r2(Math.max(0, Hm - yBas)), l: r2(x1 - x0), h: r2(yBas - yHaut), soutenus };
}

/* ------------------------------------------------------------------------------------------------
 * L'application aux ouvertures du releve
 * --------------------------------------------------------------------------------------------- */

/** Ce que le renfort a fait, pour l'ecran, le journal de l'audit et le banc (mesure de son apport). */
export interface BilanRenfort {
  /** Boites manquees proposees par le vote, et ce qu'elles sont devenues. */
  graines: number;
  pleines: number;
  pointille: number;
  rejetees: number;
  /** Baies devinees en pointille que Claude confirme : proposees cochees. */
  confirmees: number;
  /** Baies detectees peu sures que Claude retire (decochees), et retraits refuses (detection sure). */
  retirees: number;
  retraitsRefuses: number;
  typesCorriges: number;
  detailsAjoutes: number;
}

export const bilanVide = (): BilanRenfort => ({ graines: 0, pleines: 0, pointille: 0, rejetees: 0, confirmees: 0, retirees: 0, retraitsRefuses: 0, typesCorriges: 0, detailsAjoutes: 0 });

export interface ResultatRenfort {
  ouvertures: OuvertureFacade[];
  decochees: OuvertureFacade[];
  /** Les ouvertures detectees que Claude a retirees : elles sont aussi dans `decochees`. */
  retirees: OuvertureFacade[];
  bilan: BilanRenfort;
}

function recouvrement(a: { x: number; y: number; l: number; h: number }, b: { x: number; y: number; l: number; h: number }): number {
  const ix = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x),
    iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  return inter / (a.l * a.h + b.l * b.h - inter);
}

/** Les details que Claude a vus et que le classement n'avait pas lus ; null s'il n'ajoute rien. */
function detailsAjoutes(d: DetailsOuverture | undefined, a: AvisVote): DetailsOuverture | null {
  const out: DetailsOuverture = { ...(d ?? {}) };
  let change = false;
  const volets = a.volets.valeur;
  if (!out.volets && volets !== 'indetermine') { out.volets = volets; change = true; }
  if (!out.volets && a.coffre.valeur === 'oui') { out.volets = 'roulant'; change = true; }
  if (!out.allege && a.balcon.valeur === 'oui') { out.allege = 'balcon'; change = true; }
  const forme = a.forme.valeur === 'cintree' ? 'cintre' : a.forme.valeur === 'oeil-de-boeuf' ? 'rond' : null;
  if (!out.forme && forme) { out.forme = forme; change = true; }
  return change ? out : null;
}

/** Les avis de Claude sur les ouvertures numerotees (1 a n, dans l'ordre envoye). */
function appliquerAvis(ouvertures: OuvertureFacade[], decochees: OuvertureFacade[], vote: VoteRenfort, bilan: BilanRenfort, retirees: OuvertureFacade[]): OuvertureFacade[] {
  const aRetirer = new Set<number>();
  const res = ouvertures.map((o, i) => {
    const a = vote.ouvertures.find((x) => x.numero === i + 1);
    // Ce que le doigt a pose ou corrige n'est jamais retouche par Claude.
    if (!a || o.source === 'corrigee' || o.source === 'ajoutee') return o;
    if (a.decision.valeur === 'retirer') {
      if (o.source === 'devinee' || (o.confiance ?? 1) < CONFIANCE_PLEINE) { aRetirer.add(i); bilan.retirees++; return o; }
      bilan.retraitsRefuses++;
    }
    let x: OuvertureFacade = o;
    const type = a.type.valeur;
    if (type !== 'indetermine' && type !== o.type) { x = { ...x, type, source: 'claude' }; bilan.typesCorriges++; }
    const d = detailsAjoutes(x.details, a);
    if (d) { x = { ...x, details: d }; bilan.detailsAjoutes++; }
    return x;
  });
  for (const i of aRetirer) { decochees.push(au(res, i)); retirees.push(au(res, i)); }
  return res.filter((_, i) => !aRetirer.has(i));
}

/** Une baie devinee que Claude voit au meme endroit (au moins la moitie de recouvrement) et du meme type : il la confirme. */
const CONFIRME = 0.5;

interface Etat {
  ouvertures: OuvertureFacade[];
  nouvelles: OuvertureFacade[];
  decochees: OuvertureFacade[];
  cartes: CartesAretes | null;
  largeurM: number;
  hauteurM: number;
  bilan: BilanRenfort;
}

/**
 * Une graine de boite manquee : deja proposee cochee, elle n'etait pas manquee ; une devinee du meme
 * type au meme endroit est confirmee ; sinon la graine est recalee sur les profils de contours, et
 * remplace les devinees qu'elle recouvre.
 */
function placerGraine(g: VoteRenfort['manquees'][number], s: Etat): void {
  s.bilan.graines++;
  if ([...s.ouvertures, ...s.nouvelles].some((o) => recouvrement(o, g) >= MEME_BAIE)) { s.bilan.rejetees++; return; }
  const devinee = s.decochees.findIndex((o) => o.source === 'devinee' && o.type === g.type && recouvrement(o, g) >= CONFIRME);
  if (devinee >= 0) {
    const [d] = s.decochees.splice(devinee, 1);
    if (d) s.ouvertures.push(d);
    s.bilan.confirmees++;
    return;
  }
  const b = s.cartes ? recalerBoite(g, s.cartes) : { ...g, soutenus: 0 };
  const dansLeMur = b.x >= -0.05 && b.x + b.l <= s.largeurM + 0.05 && b.y + b.h <= s.hauteurM + 0.05 && b.l >= 0.3 && b.h >= 0.3;
  if (!dansLeMur || (s.cartes && b.soutenus === 0)) { s.bilan.rejetees++; return; }
  const pleine = !!s.cartes && b.soutenus >= COTES_PLEINS;
  const o: OuvertureFacade = { type: g.type, x: r2(Math.max(0, b.x)), y: r2(b.y), l: r2(b.l), h: r2(b.h), source: 'claude', confiance: r2(s.cartes ? (pleine ? 0.55 + 0.1 * b.soutenus : 0.4 + 0.1 * b.soutenus) : 0.4) };
  // Les devinees que la graine recouvre sont remplacees : la grille avait vu une baie, pas la bonne.
  for (let k = s.decochees.length - 1; k >= 0; k--) {
    const d = au(s.decochees, k);
    if (d.source === 'devinee' && recouvrement(d, o) >= MEME_BAIE) s.decochees.splice(k, 1);
  }
  if (pleine) { s.nouvelles.push(o); s.bilan.pleines++; } else { s.decochees.push(o); s.bilan.pointille++; }
}

/**
 * Les ouvertures du releve une fois le renfort applique (F§12 bis) : avis sur les ouvertures detectees
 * (retrait des peu sures, type, details), puis les boites manquees, recalees sur les profils de
 * contours et passees par la structure. `ouvertures` : les proposees cochees, dans l'ordre numerote
 * envoye a Claude ; `decochees` : les devinees en pointille. Sans cartes (pas d'image), rien ne
 * soutient une graine : elle reste en pointille.
 */
export function appliquerRenfort(e: { ouvertures: readonly OuvertureFacade[]; decochees: readonly OuvertureFacade[]; vote: VoteRenfort; cartes: CartesAretes | null; largeurM: number; hauteurM: number }): ResultatRenfort {
  const bilan = bilanVide();
  const decochees = e.decochees.map((o) => ({ ...o }));
  const retirees: OuvertureFacade[] = [];
  let ouvertures = appliquerAvis(e.ouvertures.map((o) => ({ ...o })), decochees, e.vote, bilan, retirees);
  const nouvelles: OuvertureFacade[] = [];
  for (const g of e.vote.manquees) placerGraine(g, { ouvertures, nouvelles, decochees, cartes: e.cartes, largeurM: e.largeurM, hauteurM: e.hauteurM, bilan });
  if (nouvelles.length) {
    // La structure regularise les graines recalees sur leur travee et leur rangee (10 cm au plus) ;
    // les ouvertures deja proposees ne bougent pas.
    const toutes = [...ouvertures, ...nouvelles];
    const reg = regulariser(toutes, structurer(toutes, e.largeurM));
    ouvertures = [...ouvertures, ...reg.slice(ouvertures.length)];
  }
  return { ouvertures: ouvertures.sort((a, b) => a.x - b.x || a.y - b.y), decochees, retirees, bilan };
}

/** Le bilan en une phrase, pour l'ecran ; null si Claude n'a rien change. */
export function texteBilan(b: BilanRenfort, coins = 0): string | null {
  const p = (n: number, s: string, pl = s + 's') => n + ' ' + (n > 1 ? pl : s);
  const bouts: string[] = [];
  if (coins) bouts.push(p(coins, 'coin recalé', 'coins recalés'));
  if (b.pleines) bouts.push(p(b.pleines, 'ouverture ajoutée', 'ouvertures ajoutées'));
  if (b.pointille) bouts.push(p(b.pointille, 'ouverture proposée en pointillé', 'ouvertures proposées en pointillé'));
  if (b.confirmees) bouts.push(p(b.confirmees, 'baie devinée confirmée', 'baies devinées confirmées'));
  if (b.retirees) bouts.push(p(b.retirees, 'ouverture écartée', 'ouvertures écartées'));
  if (b.typesCorriges) bouts.push(p(b.typesCorriges, 'type corrigé', 'types corrigés'));
  if (b.detailsAjoutes) bouts.push(p(b.detailsAjoutes, 'détail ajouté', 'détails ajoutés'));
  return bouts.length ? bouts.join(', ') : null;
}
