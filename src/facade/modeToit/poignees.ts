// Les poignees du mode Toit (MD/spec-mode-toit-3d.md, etape 4) : ce qu'on attrape sur la facade pour deplacer, etirer ou monter un element.
//
// Une poignee est un point de la scene (plan + hauteur) et les axes sur lesquels elle glisse. Les axes sont ceux de la facade de l'element :
// `long` le long du mur, `prof` vers l'exterieur, `vert` vers le haut. L'ecran sait ce que vaut un metre sur chaque axe a l'endroit de la
// poignee ; il rend a `glisser` un deplacement en metres, et `glisser` ecrit le corps. Toujours a partir du corps de DEPART du geste : le meme
// glisser rejoue donne le meme resultat, et Echap n'a rien a defaire.
//
// Pur : pas de DOM, pas de scene.

import { hauteurDuToitEn, point, repere } from '../toits/toitCorps.js';
import { facettesElementsToit, facettesLucarnes, type Sommet } from '../toits/toitFormes.js';
import { bornerSaillie, murDuCorps, replacerSaillie, saillieDe } from './saillies.js';
import { deplacerCorps, orienterFaitage, rangPrincipal } from './corpsNeufs.js';
import { aimanterAuContour, pousserLeMur, type Arete } from './pousserMur.js';
import { orientationDuMur } from './sens.js';
import { gaucheEnDebut } from './decroche.js';
import { orientationDuCorps } from './planCorps.js';
import { facadeDeLElement, type CibleElement } from './elements.js';
import { tourneVers } from '../../geometry/cotesVusDeDehors.js';
import type { CorpsToit, ProfilPan, PtBrut } from '../../model/types.js';
import { SAILLIE_PIGNON_MAX_M } from '../../model/corpsToitEtendu.js';
import { reculAimante } from './travees.js';

export type Axe = 'long' | 'vert' | 'prof';

/** Un point de la scene : le plan, et la hauteur au-dessus du sol du batiment. */
export interface Point3 { x: number; y: number; z: number }

/** Le repere d'une facade : son origine (le debut du mur), le sens du mur (unitaire) et la normale qui sort du batiment (unitaire). */
export interface CadreFacade { o: PtBrut; u: PtBrut; n: PtBrut; L: number }

/** Ce qu'on attrape : une cible (un element ou, pour un corps entier, `corps` seul) et la poignee. */
export interface Poignee { id: string; point: Point3; axes: Axe[]; libelle: string }

/** Les distances parcourues sur chaque axe, en metres (positives vers la droite du mur, l'exterieur et le haut). */
export type Deplacement = Partial<Record<Axe, number>>;

/** Une cote que l'ecran affiche pres de l'element : sa cle (largeur, hauteur…) et son texte. */
export interface Cote { cle: string; texte: string }

/**
 * Ce qui se glisse : un element ou un corps (mode Plan : deplacer, etirer), ou, sans element choisi, le corps de la facade courante
 * (`facade` : son faitage et la longueur de son mur).
 */
export type CibleGlisser = CibleElement | { type: 'facade'; rang: number; i: number; mur: number };

const centi = (v: number) => Math.round(v * 100) / 100;
const vingt = (v: number) => Math.round(v * 20) / 20;
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',') + ' m';

/** L'egout le plus bas d'un corps, en metres : celui que donne `ajusterCorps` (facade/toits/toitCorps.ts) ; plus bas, ce n'est plus un mur. */
export const EGOUT_MIN_M = 1.5;
/** L'egout le plus haut, en metres : la borne que la lecture LiDAR tient pour l'elevation (app/toits/toitsLidar.ts). */
export const EGOUT_MAX_M = 40;

/** L'egout d'un corps vu de la facade `mur` : celui de son pan sur un long cote (0 : `pts[0]-pts[1]`, 2 : l'oppose), le plus bas sur un bout. */
export function egoutDeLaFacade(c: CorpsToit, mur: number): number {
  const m = ((mur % 4) + 4) % 4;
  return m === 0 ? c.egouts[0] : m === 2 ? c.egouts[1] : Math.min(...c.egouts);
}

/**
 * Le corps entier monte (ou descend) de `d` metres : egouts, faitage et tout ce qui se compte depuis le sol (pignons, lucarnes,
 * souches, ligne de bris, edicules). La pente et la forme ne changent pas : c'est une hauteur mal lue que l'on corrige, pas un toit.
 */
export function monterCorps(c: CorpsToit, d: number): CorpsToit {
  const m = (v: number) => centi(v + d);
  const neuf: CorpsToit = { ...c, faitage: m(c.faitage), egouts: [m(c.egouts[0]), m(c.egouts[1])], pignons: c.pignons.map((g) => ({ ...g, faitage: m(g.faitage) })) };
  if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => ({ ...l, faitageM: m(l.faitageM) }));
  if (c.cheminees) neuf.cheminees = c.cheminees.map((h) => ({ ...h, sommetM: m(h.sommetM) }));
  if (c.profil) neuf.profil = c.profil.map((p) => (p.type === 'brise' ? { ...p, hauteurBrisM: m(p.hauteurBrisM) } : p)) as [ProfilPan, ProfilPan];
  if (c.terrasse?.edicules) neuf.terrasse = { ...c.terrasse, edicules: c.terrasse.edicules.map((e) => ({ ...e, sommetM: m(e.sommetM) })) };
  return neuf;
}

/** Le seuil d'aimantation : un bord a moins de 25 cm d'un autre s'y colle. */
export const SEUIL_AIMANT_M = 0.25;

/** Colle `v` au premier candidat a moins du seuil ; sinon l'arrondit a 5 cm. Rend aussi le candidat colle (pour dessiner un guide). */
/**
 * Un axe de poignee a l'ecran (les pixels d'un metre sur cet axe), allonge a `minPx` s'il est plus court, dans la meme direction. La
 * profondeur, vue de face par la camera oblique, ne fait qu'une quinzaine de pixels par metre : un pixel de doigt y valait 7 cm, et un
 * recul de 40 cm ne se reglait pas (demande du proprietaire, novembre 2026). Allonge, un pixel vaut un centimetre ou moins.
 */
export function axeUtilisable(v: { x: number; y: number }, minPx: number): { x: number; y: number } {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 && l < minPx ? { x: (v.x / l) * minPx, y: (v.y / l) * minPx } : v;
}

export function aimanter(v: number, candidats: readonly number[]): { v: number; colle: number | null } {
  for (const c of candidats) if (Math.abs(v - c) < SEUIL_AIMANT_M) return { v: c, colle: c };
  return { v: vingt(v), colle: null };
}

/** Le repere de la facade qui porte l'element : le mur d'une saillie, ou le cote du pan d'un pignon, d'une lucarne, d'un element de toit. */
export function cadreDe(corps: readonly CorpsToit[], t: CibleGlisser): CadreFacade | null {
  const c = corps[t.rang];
  if (!c) return null;
  if (t.type === 'facade') { const m = murDuCorps(c, t.mur); return { o: m.a, u: m.u, n: m.n, L: m.L }; }
  if (t.type === 'corps') { const m = murDuCorps(c, 0); return { o: m.a, u: m.u, n: m.n, L: m.L }; }
  if (t.type === 'travee') { const k = c.travees?.[t.i]; if (!k) return null; const m = murDuCorps(c, k.mur); return { o: m.a, u: m.u, n: m.n, L: m.L }; }
  if (t.type === 'saillie' && c.saillie) {
    const h = corps[c.saillie.hote];
    if (!h) return null;
    const m = murDuCorps(h, c.saillie.mur);
    return { o: m.a, u: m.u, n: m.n, L: m.L };
  }
  const r = repere(c.pts);
  let pan: 0 | 1 = 0;
  if (t.type === 'pignon') pan = c.pignons[t.i]?.pan ?? 0;
  else if (t.type === 'lucarne') pan = c.lucarnes?.[t.i]?.pan ?? 0;
  else if (t.type === 'fenetre-toit' || t.type === 'solaire') pan = c.elementsToit?.[t.i]?.pan ?? 0;
  // Le pan 0 est au cote t = 0 (la normale sort vers -v), le pan 1 au cote t = W (vers +v).
  return pan === 0 ? { o: point(r, 0, 0), u: r.u, n: { x: -r.v.x, y: -r.v.y }, L: r.L } : { o: point(r, 0, r.W), u: r.u, n: r.v, L: r.L };
}

const sur = (f: CadreFacade, s: number, prof: number, z: number): Point3 => ({ x: f.o.x + f.u.x * s + f.n.x * prof, y: f.o.y + f.u.y * s + f.n.y * prof, z });

/** Les poignees de la cible, dans le repere de sa facade. Vide : rien a attraper. */
export function poigneesDe(corps: readonly CorpsToit[], t: CibleGlisser): Poignee[] {
  const c = corps[t.rang], f = cadreDe(corps, t);
  if (!c || !f) return [];
  const P = (s: number, prof: number, z: number) => sur(f, s, prof, z);
  if (t.type === 'corps') {
    // Le mode Plan : se deplacer dans le plan, et une poignee au milieu de chaque mur qui l'avance ou le recule, le mur oppose en place
    // (demande du proprietaire, 9 novembre 2026 : redimensionner de chaque cote, sans recaler ensuite). Les poignees des murs sont sur
    // les bords du corps a la hauteur de son egout, la ou le mode Plan dessine sa silhouette (le haut des facades) : au faitage, la
    // perspective les sortait de son trait. Celle qui deplace reste au milieu du faitage.
    const r = repere(c.pts), W = r.W, egout = Math.min(...c.egouts);
    const cote = (m: number): string => 'Côté ' + orientationDuMur(c, m) + ' (le côté ' + orientationDuMur(c, (m + 2) % 4) + ' reste en place)';
    return [
      { id: 'deplacer', point: P(f.L / 2, -W / 2, c.faitage), axes: ['long', 'prof'], libelle: 'Déplacer le corps' },
      { id: 'mur0', point: P(f.L / 2, 0, egout), axes: ['prof'], libelle: cote(0) },
      { id: 'mur1', point: P(f.L, -W / 2, egout), axes: ['long'], libelle: cote(1) },
      { id: 'mur2', point: P(f.L / 2, -W, egout), axes: ['prof'], libelle: cote(2) },
      { id: 'mur3', point: P(0, -W / 2, egout), axes: ['long'], libelle: cote(3) }
    ];
  }
  if (t.type === 'facade') {
    // L'egout se tire au quart du mur, sur la ligne d'egout de cette facade : au milieu, il couvrirait la poignee du faitage d'un toit plat.
    // Une saillie posee sur un mur a sa propre hauteur a l'egout (son element), pas celle-ci.
    // Chaque bout de la facade se tire, l'autre bout restant en place, et la facade elle-meme avance ou recule devant le mur oppose (a
    // mi-hauteur, au tiers du mur : au milieu, elle tomberait sous la poignee du faitage d'un toit plat). Un element de facade (bow-window,
    // galerie, appentis pose) a ses propres poignees de largeur et de saillie : sa facade n'a que celle du faitage.
    if (c.saillie) return [{ id: 'haut', point: P(f.L / 2, 0, c.faitage), axes: ['vert'], libelle: 'Hauteur du faîtage' }];
    const bas = Math.min(...c.egouts), gauche = gaucheEnDebut(c, t.mur);
    const bout = (debut: boolean) => 'Bout ' + (debut === gauche ? 'gauche' : 'droit') + ' de la façade (le bout ' + (debut === gauche ? 'droit' : 'gauche') + ' reste en place)';
    return [
      { id: 'haut', point: P(f.L / 2, 0, c.faitage), axes: ['vert'], libelle: 'Hauteur du faîtage' },
      { id: 'long', point: P(f.L, 0, bas), axes: ['long'], libelle: bout(false) },
      { id: 'debut', point: P(0, 0, bas), axes: ['long'], libelle: bout(true) },
      { id: 'egout', point: P(f.L / 4, 0, egoutDeLaFacade(c, t.mur)), axes: ['vert'], libelle: 'Hauteur à l’égout' },
      { id: 'avancer', point: P((2 * f.L) / 3, 0, egoutDeLaFacade(c, t.mur) / 2), axes: ['prof'], libelle: 'Avancer ou reculer la façade (le mur opposé reste en place)' }
    ];
  }
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie, top = Math.min(...c.egouts), h = corps[s.hote];
    // Chaque bord se tire, l'autre en place (decision du proprietaire, 9 novembre 2026, bow-window compris) : `gauche` au debut du mur,
    // `larg` a sa fin, nommes gauche et droit vus de dehors.
    const aGauche = h ? gaucheEnDebut(h, s.mur) : true;
    const bord = (debut: boolean) => 'Bord ' + (debut === aGauche ? 'gauche' : 'droit') + ' (le bord ' + (debut === aGauche ? 'droit' : 'gauche') + ' reste en place)';
    const l: Poignee[] = [
      { id: 'pos', point: P(s.centreM, s.profondeurM, c.faitage), axes: ['long'], libelle: 'Position' },
      { id: 'larg', point: P(s.centreM + s.largeurM / 2, 0, top), axes: ['long'], libelle: bord(false) },
      { id: 'prof', point: P(s.centreM, s.profondeurM, top / 2), axes: ['prof'], libelle: 'Saillie' },
      { id: 'haut', point: P(s.centreM - s.largeurM / 2, s.profondeurM, top), axes: ['vert'], libelle: 'Hauteur à l’égout' },
      { id: 'gauche', point: P(s.centreM - s.largeurM / 2, 0, top), axes: ['long'], libelle: bord(true) }
    ];
    // Une galerie ou un appentis a aussi le retrait de son mur (les poteaux reculent vers la maison).
    if (s.genre !== 'bow-window') l.push({ id: 'retrait', point: P(s.centreM, Math.max(0.1, s.profondeurM - (c.retraitM ?? 0)), 0.4), axes: ['prof'], libelle: 'Retrait du mur' });
    return l;
  }
  if (t.type === 'travee') {
    // Une travee : ses deux bords se tirent le long du mur, a mi-hauteur du mur (sur le mur recule quand il recule).
    const k = c.travees?.[t.i];
    if (!k) return [];
    const z = egoutDeLaFacade(c, k.mur) / 2, d = -(k.reculM ?? 0);
    return [
      { id: 'gauche', point: P(k.de, d, z), axes: ['long'], libelle: 'Bord gauche' },
      { id: 'droite', point: P(k.a, d, z), axes: ['long'], libelle: 'Bord droit' },
      // La profondeur d'un decroche (un mur recule) : au milieu du troncon, plus haut que les bords, elle se tire vers la maison.
      ...(k.nature === 'mur' ? [{ id: 'recul', point: P((k.de + k.a) / 2, d, z * 1.5), axes: ['prof'] as Axe[], libelle: 'Recul du mur' }] : [])
    ];
  }
  if (t.type === 'pignon') {
    const g = c.pignons[t.i];
    if (!g) return [];
    const e = c.egouts[g.pan], sa = g.saillieM ?? 0, mi = (g.debut + g.fin) / 2;
    // Les poignees suivent la face avancee du pignon ; celle de la saillie est a mi-hauteur de son triangle.
    return [
      { id: 'pos', point: P(mi, sa, e), axes: ['long'], libelle: 'Position' },
      { id: 'larg', point: P(g.fin, sa, e), axes: ['long'], libelle: 'Largeur' },
      { id: 'haut', point: P(mi, sa, g.faitage), axes: ['vert'], libelle: 'Hauteur du faîte' },
      { id: 'prof', point: P(mi, sa, (e + g.faitage) / 2), axes: ['prof'], libelle: 'Saillie' }
    ];
  }
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return [];
    return [
      { id: 'pos', point: P((l.debutM + l.finM) / 2, 0, l.faitageM), axes: ['long'], libelle: 'Position' },
      { id: 'larg', point: P(l.finM, 0, l.faitageM - 0.4), axes: ['long'], libelle: 'Largeur' },
      { id: 'haut', point: P((l.debutM + l.finM) / 2, 0, l.faitageM + 0.0), axes: ['vert'], libelle: 'Hauteur' }
    ];
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    return h ? [{ id: 'pos', point: { x: h.x, y: h.y, z: h.sommetM }, axes: ['long', 'prof'], libelle: 'Position' }] : [];
  }
  const e = c.elementsToit?.[t.i];
  if (!e) return [];
  const largeur = e.pan === 0 ? c.posFaitage : repere(c.pts).W - c.posFaitage;
  const z = Math.min(...c.egouts) + ((c.faitage - Math.min(...c.egouts)) * e.dM) / Math.max(largeur, 0.5);
  const w = (e.type === 'solaire' ? 2.55 : 0.8) * (e.echelle ?? 1);
  // L'element est a `dM` de l'egout vers le faitage, donc en deca du mur : la normale de la facade sort du corps, la profondeur est
  // negative. A `+dM`, les poignees flottaient hors du toit, sous la fenetre a l'ecran (2 novembre 2026, vu en la cadrant de pres).
  return [
    { id: 'pos', point: P(e.sM, -e.dM, z), axes: ['long', 'vert'], libelle: 'Position' },
    { id: 'taille', point: P(e.sM + w / 2, -e.dM, z), axes: ['long'], libelle: 'Taille' }
  ];
}

/** Le mur d'un corps le plus tourne vers l'oeil (un point du plan) : celui que la silhouette du corps choisi trace, et ses poignees. */
export function murVersLOeil(c: CorpsToit, oeil: PtBrut): number {
  let meilleur = 0, v = -Infinity;
  for (let m = 0; m < c.pts.length; m++) {
    const w = murDuCorps(c, m), score = tourneVers(w.a, w.b, w.n, oeil);
    if (score > v + 1e-9) { v = score; meilleur = m; }
  }
  return meilleur;
}

/** L'oeil de la vue : un point du plan, et sa hauteur au-dessus du sol du batiment (`z`, a hauteur d'homme sans elle). */
export type Oeil = PtBrut & { z?: number };
/** La hauteur de l'oeil quand la vue ne la dit pas : celle d'une personne debout. */
const OEIL_Z_M = 1.6;
/** Le long d'un mur, les points regardes (en part de sa longueur, en dedans des coins), et a quelles parts de sa hauteur. */
const LE_LONG = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
const EN_HAUT = [0.1, 0.4, 0.7, 0.95];
/** Un point regarde est pose un peu devant son mur : sur lui, le corps voisin colle au mur le cacherait toujours. */
const DEVANT_MUR_M = 0.05;
/** Le pas de la marche de l'oeil au point, ou se cherche un autre corps qui le cache. */
const PAS_VUE_M = 0.2;
/** Au-dessous, un mur est vu de chant (moins de 15 degres) : il ne l'emporte pas sur un mur de face. */
const VU_DE_CHANT = 0.25;
/** Deux murs dont la part visible differe de moins que cela se voient autant : le plus tourne vers l'oeil l'emporte. */
const AUTANT_VISIBLE = 0.15;

/**
 * La part du mur `mur` du corps `rang` que voit l'oeil (0 a 1) : ses points, du pied au haut sous son toit, dont la vue n'est pas
 * coupee par un autre corps (son volume : son emprise, sous son toit). Zero pour un mur qui tourne le dos a l'oeil.
 */
export function partVisibleDuMur(corps: readonly CorpsToit[], rang: number, mur: number, oeil: Oeil): number {
  const c = corps[rang];
  if (!c) return 0;
  const w = murDuCorps(c, mur);
  if (tourneVers(w.a, w.b, w.n, oeil) <= 0) return 0;
  const autres = corps.filter((_, i) => i !== rang);
  if (!autres.length) return 1;
  const ez = oeil.z ?? OEIL_Z_M;
  // Ce qui peut cacher : rien au-dela de l'emprise des autres corps, ni au-dessus de leur faitage.
  const xs = autres.flatMap((k) => k.pts.map((q) => q.x)), ys = autres.flatMap((k) => k.pts.map((q) => q.y));
  const boite = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z1: Math.max(...autres.map((k) => k.faitage)) };
  const cache = (p: Point3): boolean => {
    const dx = oeil.x - p.x, dy = oeil.y - p.y, dz = ez - p.z, d = Math.hypot(dx, dy, dz);
    for (let s = PAS_VUE_M; s < d; s += PAS_VUE_M) {
      const q = { x: p.x + (dx * s) / d, y: p.y + (dy * s) / d }, z = p.z + (dz * s) / d;
      if (z > boite.z1 && dz >= 0) return false;
      if (q.x < boite.x0 || q.x > boite.x1 || q.y < boite.y0 || q.y > boite.y1) continue;
      const h = hauteurDuToitEn(autres, q, 0);
      if (h !== null && z < h) return true;
    }
    return false;
  };
  let vus = 0, tous = 0;
  for (const t of LE_LONG) {
    const pied = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
    const haut = hauteurDuToitEn([c], { x: pied.x - w.n.x * DEVANT_MUR_M, y: pied.y - w.n.y * DEVANT_MUR_M }) ?? Math.min(...c.egouts);
    for (const f of EN_HAUT) {
      tous++;
      if (!cache({ x: pied.x + w.n.x * DEVANT_MUR_M, y: pied.y + w.n.y * DEVANT_MUR_M, z: haut * f })) vus++;
    }
  }
  return tous ? vus / tous : 0;
}

/**
 * Le mur d'un corps que l'oeil voit le mieux : tourne vers lui, et le moins cache par les autres corps (sur une maison a deux corps,
 * le mur le plus tourne de l'aile peut etre derriere l'autre corps). A visibilite egale (a AUTANT_VISIBLE pres), le plus tourne vers
 * l'oeil ; un mur vu de chant ne l'emporte pas sur un mur de face. Sans rien qui cache, c'est `murVersLOeil`.
 */
export function murLePlusVisible(corps: readonly CorpsToit[], rang: number, oeil: Oeil): number {
  const c = corps[rang];
  if (!c) return 0;
  const murs = c.pts.map((_, m) => { const w = murDuCorps(c, m); return { m, tourne: tourneVers(w.a, w.b, w.n, oeil) }; }).filter((x) => x.tourne > 0);
  if (!murs.length) return murVersLOeil(c, oeil);
  const deFace = murs.filter((x) => x.tourne >= VU_DE_CHANT);
  const vus = (deFace.length ? deFace : murs).map((x) => ({ ...x, part: partVisibleDuMur(corps, rang, x.m, oeil) }));
  const meilleure = Math.max(...vus.map((x) => x.part));
  return vus.filter((x) => x.part >= meilleure - AUTANT_VISIBLE).reduce((a, b) => (b.tourne > a.tourne + 1e-9 ? b : a)).m;
}

/** Ce que regarde la Vue 3D du mode : de dessus ou non, la facade courante (ou la derniere) et l'oeil (la camera : un point du plan, et sa hauteur). */
export interface VuePoignees { dessus: boolean; facade: { rang: number | null; mur: number } | null; oeil: Oeil }

/**
 * Ce que les poignees tirent, selon ce qui est choisi. De dessus, seul un corps choisi en a. De face ou en vue libre, un pignon ou un
 * element de mur se tire devant sa facade ; un corps choisi, par son mur le plus visible (`murLePlusVisible` : tourne vers l'oeil et le
 * moins cache par les autres corps ; 29 octobre 2026, le pignon de « Corps 2 » derriere l'autre corps), celui ou se trace sa silhouette
 * (`silhouetteVersLOeil`), jamais la facade courante d'un autre corps : la silhouette reste ou elle est, les poignees et la bulle la
 * suivent (28 octobre 2026, « les poignées ne sont pas sur le bon corps »). Sans choix, la facade courante.
 */
export function cibleDesPoignees(corps: readonly CorpsToit[], selection: CibleElement | null, v: VuePoignees): CibleGlisser | null {
  if (v.dessus) return selection?.type === 'corps' ? selection : null;
  const f = v.facade;
  if (selection?.type === 'corps') {
    const c = corps[selection.rang];
    if (!c) return null;
    return { type: 'facade', rang: selection.rang, i: 0, mur: murLePlusVisible(corps, selection.rang, v.oeil) };
  }
  // Un pignon ou un element de mur ne se tire que devant sa facade : vu de l'autre cote, ses poignees flotteraient sur le mauvais mur.
  if (selection) {
    const m = facadeDeLElement(corps, selection);
    if (!m || !f || (m.rang === f.rang && m.mur === f.mur)) return selection;
  }
  return f && f.rang !== null ? { type: 'facade', rang: f.rang, i: 0, mur: f.mur } : null;
}

/** Les cotes de la cible : ce que la bulle montre pres d'elle. */
export function cotesDe(corps: readonly CorpsToit[], t: CibleGlisser): Cote[] {
  const c = corps[t.rang];
  if (!c) return [];
  if (t.type === 'facade') {
    const m = murDuCorps(c, t.mur);
    // La profondeur du corps derriere la facade : ce que change la poignee qui l'avance ou la recule.
    return [{ cle: 'w', texte: fr(m.L) }, ...(c.saillie ? [] : [{ cle: 'prof', texte: 'prof. ' + fr(murDuCorps(c, t.mur + 1).L) }]), { cle: 'h', texte: fr(c.faitage) },
      ...(c.saillie ? [] : [{ cle: 'egout', texte: 'égout ' + fr(egoutDeLaFacade(c, t.mur)) }])];
  }
  if (t.type === 'corps') { const r = repere(c.pts); return [{ cle: 'w', texte: fr(r.L) }, { cle: 'prof', texte: fr(r.W) }, { cle: 'h', texte: fr(c.faitage) }, { cle: 'rot', texte: Math.round(orientationDuCorps(c)) + '°' }]; }
  if (t.type === 'saillie' && c.saillie) return [{ cle: 'w', texte: fr(c.saillie.largeurM) }, { cle: 'prof', texte: fr(c.saillie.profondeurM) }, { cle: 'h', texte: fr(Math.min(...c.egouts)) }, ...(c.saillie.genre !== 'bow-window' && (c.retraitM ?? 0) > 0.02 ? [{ cle: 'retrait', texte: fr(c.retraitM ?? 0) }] : [])];
  if (t.type === 'pignon') {
    const g = c.pignons[t.i];
    if (!g) return [];
    const demi = (g.fin - g.debut) / 2, e = c.egouts[g.pan];
    return [{ cle: 'w', texte: fr(g.fin - g.debut) }, { cle: 'ang', texte: Math.round((Math.atan2(g.faitage - e, demi) * 180) / Math.PI) + '°' }, { cle: 'h', texte: fr(g.faitage) }, ...(g.saillieM ? [{ cle: 'prof', texte: fr(g.saillieM) }] : [])];
  }
  if (t.type === 'lucarne') { const l = c.lucarnes?.[t.i]; return l ? [{ cle: 'w', texte: fr(l.finM - l.debutM) }, { cle: 'h', texte: fr(l.faitageM) }] : []; }
  if (t.type === 'travee') { const k = c.travees?.[t.i]; return k ? [{ cle: 'w', texte: fr(k.a - k.de) }, ...((k.reculM ?? 0) > 0 ? [{ cle: 'prof', texte: 'recul ' + fr(k.reculM ?? 0) }] : [])] : []; }
  if (t.type === 'cheminee') { const h = c.cheminees?.[t.i]; return h ? [{ cle: 'w', texte: fr(h.largeurM) }, { cle: 'h', texte: fr(h.sommetM) }] : []; }
  const e = c.elementsToit?.[t.i];
  return e ? [{ cle: 'w', texte: fr((e.type === 'solaire' ? 2.55 : 0.8) * (e.echelle ?? 1)) }] : [];
}

const avec = (corps: readonly CorpsToit[], rang: number, c: CorpsToit): CorpsToit[] => corps.map((k, i) => (i === rang ? c : k));
const remplace = <T>(l: readonly T[] | undefined, i: number, v: T): T[] => (l ?? []).map((x, j) => (j === i ? v : x));

/** Les bords des autres elements sur la meme facade, pour y coller les bords de celui qu'on deplace. */
function bordsVoisins(corps: readonly CorpsToit[], t: CibleGlisser, L: number): number[] {
  const bords = [0, L];
  const c = corps[t.rang];
  if (!c) return bords;
  if (t.type === 'saillie' && c.saillie) {
    corps.forEach((k, i) => { if (i !== t.rang && k.saillie && k.saillie.hote === c.saillie?.hote && k.saillie.mur === c.saillie?.mur) bords.push(k.saillie.centreM - k.saillie.largeurM / 2, k.saillie.centreM + k.saillie.largeurM / 2); });
  } else if (t.type === 'pignon') c.pignons.forEach((g, i) => { if (i !== t.i) bords.push(g.debut, g.fin); });
  else if (t.type === 'lucarne') (c.lucarnes ?? []).forEach((l, i) => { if (i !== t.i) bords.push(l.debutM, l.finM); });
  return bords;
}

/**
 * Ce que rend un glisser : les nouveaux corps, les positions collees (pour les guides) et, quand l'egout du corps principal a change,
 * sa nouvelle hauteur a l'egout : l'elevation du batiment, que lisent l'inspecteur, les releves et le prisme hors du mode corps.
 */
export interface ResultatGlisser {
  corps: CorpsToit[]; guides: number[]; elevation?: number;
  /** Les cotes du trace IGN ou un mur ou un corps s'est colle : l'ecran les eclaire. */
  aretes?: Arete[];
  /** Ce qui a arrete le geste (un pignon, une travee, l'autre corps a sa taille minimale), dit a la personne. */
  motif?: string;
}

/**
 * La hauteur a l'egout d'un corps : le corps entier monte ou descend (`monterCorps`), pente gardee, et ce qui est pose sur ses murs
 * se repose sur lui. L'egout de la facade tiree s'arrondit a 5 cm ; le plus bas reste entre EGOUT_MIN_M et EGOUT_MAX_M.
 */
function glisserEgout(depart: readonly CorpsToit[], rang: number, mur: number, dv: number): ResultatGlisser {
  const c = depart[rang] as CorpsToit, e = egoutDeLaFacade(c, mur), bas = Math.min(...c.egouts);
  const delta = centi(borne(vingt(e + dv), EGOUT_MIN_M + (e - bas), EGOUT_MAX_M) - e);
  const hotes = avec(depart, rang, monterCorps(c, delta));
  const egoutHote = Math.min(...(hotes[rang] as CorpsToit).egouts);
  // Une galerie ou un appentis a sa hauteur propre : il ne passe pas au-dessus de l'egout de la maison qui descend.
  const corps = hotes.map((k, i) => {
    if (!k.saillie || k.saillie.hote !== rang) return k;
    const h = k.saillie.hauteurM;
    return replacerSaillie(hotes, i, h !== undefined && h > egoutHote ? { hauteurM: egoutHote } : {})[i] as CorpsToit;
  });
  return rang === rangPrincipal(depart) ? { corps, guides: [], elevation: egoutHote } : { corps, guides: [] };
}

/**
 * Le deplacement `d` applique a la cible, a partir des corps de depart. Rend les nouveaux corps et les positions collees (pour les guides).
 * `contour` : le trace IGN du batiment (son contour dans le plan), ou un mur tire et un corps deplace se collent aussi.
 */
export function glisser(depart: readonly CorpsToit[], t: CibleGlisser, id: string, d: Deplacement, contour?: readonly PtBrut[]): ResultatGlisser {
  const c = depart[t.rang], f = cadreDe(depart, t);
  const rien = { corps: depart.slice(), guides: [] as number[] };
  if (!c || !f) return rien;
  const dl = d.long ?? 0, dv = d.vert ?? 0, dp = d.prof ?? 0, guides: number[] = [];
  const bords = bordsVoisins(depart, t, f.L);
  /** Un bord qui se colle : le candidat s'il est proche, et l'ecran dessine un guide la. */
  const coller = (v: number) => { const a = aimanter(v, bords); if (a.colle !== null) guides.push(a.colle); return a.v; };
  /** Un element de largeur `w` dont le bord gauche est en `debut` : colle son bord gauche, ou son bord droit, au premier bord voisin. */
  const collerElement = (debut: number, w: number) => {
    const g = aimanter(debut, bords);
    if (g.colle !== null) { guides.push(g.colle); return g.v; }
    const dr = aimanter(debut + w, bords);
    if (dr.colle !== null) { guides.push(dr.colle); return dr.v - w; }
    return g.v;
  };

  if (t.type === 'corps') {
    if (id === 'deplacer') {
      const vx = f.u.x * dl + f.n.x * dp, vy = f.u.y * dl + f.n.y * dp;
      // Pres du trace IGN, le corps s'y colle par ses murs (decision du proprietaire, 9 novembre 2026).
      const a = contour ? aimanterAuContour(c, vx, vy, contour) : null;
      if (a?.aretes.length) return { corps: deplacerCorps(depart, t.rang, a.dx, a.dy, false), guides, aretes: a.aretes };
      return { corps: deplacerCorps(depart, t.rang, vx, vy), guides };
    }
    // Les axes sont ceux du mur 0 : sa normale sort par le mur 0 (le mur 2 avance quand elle recule), son sens va vers le mur 1.
    const mur = /^mur([0-3])$/.exec(id);
    if (!mur) return rien;
    const m = Number(mur[1]), avance = m === 0 ? dp : m === 1 ? dl : m === 2 ? -dp : -dl;
    // De dessus, le faitage se met dans le sens de la longueur tout seul tant que rien n'est pose dessus (comme avant ces poignees).
    const res = pousserLeMur(depart, t.rang, m, avance, contour);
    return { corps: orienterFaitage(res.corps, t.rang), guides, ...(res.aretes ? { aretes: res.aretes } : {}), ...(res.motif ? { motif: res.motif } : {}) };
  }
  if (t.type === 'facade') {
    if (id === 'haut') return { corps: avec(depart, t.rang, { ...c, faitage: centi(Math.max(c.faitage + dv, Math.max(...c.egouts) + 0.4)) }), guides };
    if (id === 'egout' && !c.saillie) return glisserEgout(depart, t.rang, t.mur, dv);
    // Un bout de la facade (le mur voisin) ou la facade elle-meme glisse, le cote oppose en place (facade/modeToit/pousserMur.ts) ; un
    // bout colle a la ligne d'un mur d'un autre corps y dessine un guide.
    if (!c.saillie && (id === 'long' || id === 'debut' || id === 'avancer')) {
      const m = id === 'long' ? (t.mur + 1) % 4 : id === 'debut' ? (t.mur + 3) % 4 : t.mur;
      const res = pousserLeMur(depart, t.rang, m, id === 'long' ? dl : id === 'debut' ? -dl : dp, contour);
      if (res.colle && id !== 'avancer') guides.push(id === 'debut' ? 0 : murDuCorps(res.corps[t.rang] as CorpsToit, t.mur).L);
      return { corps: res.corps, guides, ...(res.aretes ? { aretes: res.aretes } : {}), ...(res.motif ? { motif: res.motif } : {}) };
    }
    return rien;
  }
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie, h = depart[s.hote];
    if (!h) return rien;
    if (id === 'pos') { const demi = s.largeurM / 2, bas = collerElement(s.centreM + dl - demi, s.largeurM); return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, centreM: bas + demi })), guides }; }
    // Un bord tire, l'autre en place : la largeur reste dans le mur depuis le bord fixe (bornerSaillie recentrerait sinon l'element, et
    // le bord fixe bougerait).
    // La largeur tombe aux 2 cm : sa moitie reste au centimetre, et le milieu (arrondi au centimetre par bornerSaillie) ne decale pas le
    // bord fixe d'un demi-centimetre.
    const wMax = (fixe: number) => Math.max(1.2, Math.min(6, fixe, f.L - 0.2));
    const pair = (w: number) => Math.round(w * 50) / 50;
    if (id === 'larg') { const droite = coller(s.centreM + s.largeurM / 2 + dl), gauche = s.centreM - s.largeurM / 2, w = pair(borne(droite - gauche, 1.2, wMax(f.L - gauche))); return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, largeurM: w, centreM: gauche + w / 2 })), guides }; }
    if (id === 'gauche') {
      const droite = s.centreM + s.largeurM / 2, gauche = coller(s.centreM - s.largeurM / 2 + dl), w = pair(borne(droite - gauche, 1.2, wMax(droite)));
      return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, largeurM: w, centreM: droite - w / 2 })), guides };
    }
    if (id === 'retrait') {
      // Tirer le point vers la maison recule le mur : de 0 a 1 m, au plus la moitie de la profondeur.
      const r = borne(vingt((c.retraitM ?? 0) - dp), 0, Math.min(1, s.profondeurM / 2));
      return { corps: avec(depart, t.rang, { ...c, retraitM: r }), guides };
    }
    if (id === 'prof') return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, profondeurM: borne(s.profondeurM + dp, 0.2, s.niveau === 'rdc' ? 1.5 : 6) })), guides };
    if (id === 'haut') return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, hauteurM: centi(borne(Math.min(...c.egouts) + dv, 1, 12)) })), guides };
    return rien;
  }
  if (t.type === 'pignon') {
    const g = c.pignons[t.i];
    if (!g) return rien;
    const w = g.fin - g.debut;
    if (id === 'pos') { const debut = borne(collerElement(g.debut + dl, w), 0, f.L - w); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...g, debut: centi(debut), fin: centi(debut + w) }) }), guides }; }
    if (id === 'larg') { const fin = borne(coller(g.fin + dl), g.debut + 1.4, Math.min(g.debut + 8, f.L)); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...g, fin: centi(fin) }) }), guides }; }
    if (id === 'prof') { const sa = borne(vingt((g.saillieM ?? 0) + dp), 0, SAILLIE_PIGNON_MAX_M); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, saillieDe(g, sa)) }), guides }; }
    if (id === 'haut') { const e = c.egouts[g.pan], f2 = borne(vingt(g.faitage + dv), e + 0.8, c.faitage); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...g, faitage: centi(f2) }) }), guides }; }
    return rien;
  }
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return rien;
    const w = l.finM - l.debutM;
    if (id === 'pos') { const debut = borne(collerElement(l.debutM + dl, w), 0.1, f.L - 0.1 - w); return { corps: avec(depart, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, debutM: centi(debut), finM: centi(debut + w) }) }), guides }; }
    if (id === 'larg') { const fin = borne(coller(l.finM + dl), l.debutM + 0.6, Math.min(l.debutM + 3, f.L - 0.1)); return { corps: avec(depart, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, finM: centi(fin) }) }), guides }; }
    if (id === 'haut') return { corps: avec(depart, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, faitageM: centi(borne(l.faitageM + dv, c.egouts[l.pan] + 0.6, c.faitage - 0.1)) }) }), guides };
    return rien;
  }
  if (t.type === 'travee') {
    const k = c.travees?.[t.i];
    if (!k) return rien;
    // Les bords d'une travee se collent aux bords des autres travees du meme mur, aux bouts du mur, et restent dans le mur.
    const bordsT = [0, f.L, ...(c.travees ?? []).flatMap((x, j) => (j !== t.i && x.mur === k.mur ? [x.de, x.a] : []))];
    const colle = (v: number) => { const a = aimanter(v, bordsT); if (a.colle !== null) guides.push(a.colle); return a.v; };
    // Tirer la profondeur vers la maison recule le mur, au centimetre, colle aux 5 cm ronds (travees.ts::reculAimante).
    const neuve = id === 'gauche' ? { ...k, de: centi(borne(colle(k.de + dl), 0, k.a - 0.3)) } : id === 'droite' ? { ...k, a: centi(borne(colle(k.a + dl), k.de + 0.3, f.L)) }
      : id === 'recul' && k.nature === 'mur' ? { ...k, reculM: reculAimante((k.reculM ?? 0) - dp) } : null;
    return neuve ? { corps: avec(depart, t.rang, { ...c, travees: remplace(c.travees, t.i, neuve) }), guides } : rien;
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    if (!h || id !== 'pos') return rien;
    return { corps: avec(depart, t.rang, { ...c, cheminees: remplace(c.cheminees, t.i, { ...h, x: centi(h.x + f.u.x * dl + f.n.x * dp), y: centi(h.y + f.u.y * dl + f.n.y * dp) }) }), guides };
  }
  const e = c.elementsToit?.[t.i];
  if (!e) return rien;
  const dim = (e.type === 'solaire' ? 2.55 : 0.8) * (e.echelle ?? 1);
  if (id === 'pos') {
    const largeur = e.pan === 0 ? c.posFaitage : repere(c.pts).W - c.posFaitage, pente = Math.max((c.faitage - Math.min(...c.egouts)) / Math.max(largeur, 0.5), 0.2);
    return { corps: avec(depart, t.rang, { ...c, elementsToit: remplace(c.elementsToit, t.i, { ...e, sM: centi(borne(vingt(e.sM + dl), 0.5, f.L - 0.5)), dM: centi(borne(e.dM + dv / pente, 0.3, Math.max(largeur - 0.3, 0.3))) }) }), guides };
  }
  if (id === 'taille') return { corps: avec(depart, t.rang, { ...c, elementsToit: remplace(c.elementsToit, t.i, { ...e, echelle: centi(borne(((dim + 2 * dl) / (e.type === 'solaire' ? 2.55 : 0.8)), 0.5, 2.2)) }) }), guides };
  return rien;
}

/**
 * La marge laissee autour d'un element quand la camera se cadre sur lui : assez de toit autour pour savoir ou il est, assez peu pour qu'un
 * oeil-de-boeuf fasse encore une cible de 44 px au telephone (a 1,5 m, il en faisait 41). Une fenetre de
 * toit, un panneau, une jacobine faisaient quelques pixels devant la facade entiere (2 novembre 2026, « il faut zoomer dessus »).
 */
export const MARGE_CADRAGE_M = 1;

/**
 * Le mur devant lequel la camera se pose pour montrer l'element choisi : sa facade (pignon, element de mur), sinon celle du pan qui le
 * porte (lucarne, fenetre de toit, panneau : le pan 0 au mur 0, le pan 1 au mur 2, comme `facadeDeLElement`). Une cheminee n'a pas de
 * pan : la facade regardee si elle est a son corps, sinon le mur 0. Null pour un corps (il se regarde en entier) ou un element disparu.
 */
export function murDeCadrage(corps: readonly CorpsToit[], t: CibleElement, regardee: { rang: number | null; mur: number } | null): { rang: number; mur: number } | null {
  const c = corps[t.rang];
  if (!c || t.type === 'corps' || !poigneesDe(corps, t).length) return null;
  const m = facadeDeLElement(corps, t);
  if (m) return m;
  const pan = t.type === 'lucarne' ? c.lucarnes?.[t.i]?.pan : t.type === 'fenetre-toit' || t.type === 'solaire' ? c.elementsToit?.[t.i]?.pan : undefined;
  if (pan !== undefined) return { rang: t.rang, mur: pan === 1 ? 2 : 0 };
  return { rang: t.rang, mur: regardee && regardee.rang === t.rang ? regardee.mur : 0 };
}

/** Le plus petit cote de ce que la camera tient autour d'un element, dans le plan : en deca, on ne sait plus sur quel toit il est. */
export const CADRAGE_MIN_M = 3.5;

/**
 * Les points de l'element lui-meme, dans le plan et en hauteur au-dessus du sol du batiment : ses facettes (lucarne, fenetre de toit,
 * panneau : les memes que la 3D), sa souche (cheminee : sa section, du toit a son sommet), ou ses poignees (pignon, element de mur : elles
 * sont dans le plan de sa facade). Vide pour un corps ou un element disparu.
 */
/**
 * Ecarte a l'ecran les poignees qui se recouvrent (`ecart` : deux zones de saisie bord a bord) : sur un mur court ou un toit plat, le faitage,
 * l'egout et la longueur tombaient sous le meme doigt et une seule se prenait (retour du proprietaire sur la 5.12.0). Dans l'ordre, chacune
 * garde sa place si elle est libre, sinon prend la place libre la plus proche autour d'elle, dans `bornes` (la partie libre de l'image). Seule la place du dessin change : un glisser se
 * lit sur les axes de la poignee, pas sur sa place.
 */
export function ecarterAEcran(points: readonly { x: number; y: number }[], ecart: number, bornes?: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number }[] {
  const places: { x: number; y: number }[] = [];
  const libre = (q: { x: number; y: number }) => places.every((a) => !(Math.hypot(q.x - a.x, q.y - a.y) < ecart - 1e-6));
  for (const p of points) {
    // Une poignee hors de l'image (NaN) ne pousse personne et ne bouge pas.
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || libre(p)) { places.push({ ...p }); continue; }
    // Sinon, la place libre la plus proche autour d'elle : des couronnes de plus en plus larges, en partant du haut, puis en tournant.
    let choisie: { x: number; y: number } | null = null;
    for (let anneau = 1; anneau <= 6 && !choisie; anneau++) for (let k = 0; k < 12 && !choisie; k++) {
      const t = -Math.PI / 2 + (k * Math.PI) / 6, q = { x: p.x + Math.cos(t) * ecart * anneau * 0.75, y: p.y + Math.sin(t) * ecart * anneau * 0.75 };
      if (libre(q) && (!bornes || (q.x >= bornes.x0 && q.x <= bornes.x1 && q.y >= bornes.y0 && q.y <= bornes.y1))) choisie = q;
    }
    places.push(choisie ?? { ...p });
  }
  return places;
}

/**
 * Ce que la camera de facade tient (retour du proprietaire sur la 5.12.0 : « le zoom est trop fort, je ne peux pas atteindre une
 * poignee ») : le corps de la facade regardee (ou celui qui porte l'element choisi, et son porteur pour une saillie), du pied au-dessus du
 * faitage, toutes les poignees de ce que l'on tire (`cibleDesPoignees`, le meme choix que le calque) et l'element choisi lui-meme. Jamais
 * l'element seul : il se voyait de si pres que les poignees du mur sortaient de l'image. Vide pour une facade du contour (sans corps) :
 * l'appelant cadre alors le batiment entier. Points du plan, `z` au-dessus du sol du batiment.
 */
export function pointsDuCadreDeFacade(corps: readonly CorpsToit[], facade: { rang: number | null; mur: number; a: PtBrut; b: PtBrut; n: PtBrut }, selection: CibleElement | null): Point3[] {
  if (facade.rang === null || !corps[facade.rang]) return [];
  // L'oeil devant la facade, a hauteur d'homme : ce que la camera oblique regarde.
  const oeil = { x: (facade.a.x + facade.b.x) / 2 + facade.n.x * 50, y: (facade.a.y + facade.b.y) / 2 + facade.n.y * 50, z: OEIL_Z_M };
  const cible = cibleDesPoignees(corps, selection, { dessus: false, facade, oeil });
  const rangs = new Set<number>([cible?.rang ?? facade.rang]);
  for (const r of [...rangs]) { const h = corps[r]?.saillie?.hote; if (h !== undefined && corps[h]) rangs.add(h); }
  const pts: Point3[] = [];
  for (const r of rangs) { const c = corps[r]; if (c) for (const p of c.pts) pts.push({ x: p.x, y: p.y, z: 0 }, { x: p.x, y: p.y, z: c.faitage + 0.5 }); }
  if (cible) for (const q of poigneesDe(corps, cible)) pts.push(q.point);
  if (selection) pts.push(...pointsDeLElement(corps, selection));
  return pts;
}

export function pointsDeLElement(corps: readonly CorpsToit[], t: CibleElement): Point3[] {
  const c = corps[t.rang];
  if (!c || t.type === 'corps') return [];
  const r = repere(c.pts), plan = (q: Sommet): Point3 => ({ ...point(r, q.s, q.t), z: q.z });
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return [];
    const f = facettesLucarnes({ ...c, lucarnes: [l] }, r.L, r.W);
    const pts = [...f.pans, ...f.murs].flat().map(plan);
    if (pts.length) return pts;
  }
  if (t.type === 'fenetre-toit' || t.type === 'solaire') {
    const e = c.elementsToit?.[t.i];
    if (!e) return [];
    const pts = facettesElementsToit({ ...c, elementsToit: [e] }, r.L, r.W).flatMap((x) => x.cadre).map(plan);
    if (pts.length) return pts;
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    if (!h) return [];
    const a = Math.max(h.largeurM, h.profondeurM) / 2, bas = Math.min(...c.egouts);
    return [-a, a].flatMap((dx) => [-a, a].flatMap((dy) => [bas, h.sommetM].map((z) => ({ x: h.x + dx, y: h.y + dy, z }))));
  }
  return poigneesDe(corps, t).map((p) => p.point);
}

/**
 * Ce que la camera doit tenir dans l'image pour montrer l'element choisi : la boite de l'element (`pointsDeLElement`), elargie de
 * `MARGE_CADRAGE_M` de chaque cote et d'au moins `CADRAGE_MIN_M` de cote dans le plan, jamais sous le sol. Ses huit coins, dans le plan et
 * en hauteur au-dessus du sol du batiment ; vide pour un corps ou un element disparu.
 */
export function emprisePourCadrer(corps: readonly CorpsToit[], t: CibleElement): Point3[] {
  const pts = pointsDeLElement(corps, t);
  if (!pts.length) return [];
  const m = MARGE_CADRAGE_M;
  const autour = (v: number[]): [number, number] => {
    const a = Math.min(...v) - m, b = Math.max(...v) + m, manque = Math.max(0, CADRAGE_MIN_M - (b - a)) / 2;
    return [a - manque, b + manque];
  };
  const [x0, x1] = autour(pts.map((p) => p.x)), [y0, y1] = autour(pts.map((p) => p.y));
  const zs = pts.map((p) => p.z), z0 = Math.max(0, Math.min(...zs) - m), z1 = Math.max(...zs) + m;
  return [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => ({ x, y, z }))));
}
