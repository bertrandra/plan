// La disposition automatique des ouvertures d'un batiment (MD/spec-toit-ign.md §6.3) : des
// fenetres regulieres a chaque niveau sur les murs sans releve de facade, et une porte au
// rez-de-chaussee du plus long d'entre eux. Pure : la 3D la dessine (three/detailsBatiment.ts),
// l'inspecteur s'en sert pour initialiser une liste reglee une par une (ui/champs/fenetres3d.ts).
//
// Les dimensions et les seuils viennent du profil de facades retenu pour le batiment
// (regles/facades/reglages.json, facade/regles/facades/profils.ts) ; sans profil, celui par defaut, egal aux
// constantes d'avant. Les dimensions passees en options (un reglage de l'inspecteur, l'apparence du
// voisinage) l'emportent sur le profil.

import { au } from '../util/tableaux.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointSegment } from '../geometry/segments.js';
import { repere, point } from './toits/toitCorps.js';
import { sommetDe } from '../geometry/anneau.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../geometry/cotesVusDeDehors.js';
import type { Volume } from './profil.js';
import type { CorpsToit, Fenetre3d, OuvertureFacade, PtBrut } from '../model/types.js';
import { FENETRE, PORTE, ENTRAXE_FENETRES_M } from '../model/fenetres3d.js';
import { REGLAGES_FACADES, type ValeursFacades } from '../regles/facades/reglages.js';

export { FENETRE, PORTE, ENTRAXE_FENETRES_M };

/** Ce que la disposition prend en compte ; tout est facultatif, les defauts sont ceux d'avant. */
export interface OptionsOuvertures {
  /** Le nombre de niveaux (BD TOPO) ; absent, deduit de la hauteur. */
  etages?: number | null;
  /** Les cotes du contour qui portent un releve de facade : leurs fenetres sont deja la. */
  cotesReleves?: readonly number[];
  largeur?: number;
  hauteur?: number;
  appui?: number;
  entraxe?: number;
  /** `false` : pas de porte (un corps de batiment apres le premier, qui porte la porte d'entree). */
  porte?: boolean;
  /** Les valeurs du profil de facades retenu (facade/regles/facades/profils.ts) ; absent, le profil par defaut. */
  profil?: ValeursFacades;
}

/** Combien de niveaux, et leur hauteur : le nombre d'etages s'il est connu, sinon la hauteur du mur. */
export function niveaux(hMur: number, etages: number | null | undefined, profil: ValeursFacades = REGLAGES_FACADES): { n: number; hauteur: number } {
  let n = etages && etages > 0 ? Math.round(etages) : Math.max(1, Math.round(hMur / profil.HAUTEUR_NIVEAU_M));
  if (hMur / n < profil.HAUTEUR_NIVEAU_MIN_M) n = Math.floor(hMur / profil.HAUTEUR_NIVEAU_MIN_M);
  return { n, hauteur: n > 0 ? hMur / n : 0 };
}

/** Les abscisses des fenetres d'un mur de largeur `L`, centrees, a l'entraxe ; aucune sur un mur etroit. */
export function abscissesFenetres(L: number, entraxe = ENTRAXE_FENETRES_M, largeur = FENETRE.l, maxParMur = REGLAGES_FACADES.FENETRES_MAX_PAR_MUR): number[] {
  const n = Math.min(maxParMur, Math.floor((L - 0.8) / entraxe));
  if (n < 1) return [];
  const debut = (L - ((n - 1) * entraxe + largeur)) / 2;
  return Array.from({ length: n }, (_, k) => debut + k * entraxe);
}

/**
 * Un mur du volume a moins de cela du milieu de la facade est ce mur-la : les corps sont des
 * rectangles a l'equerre, le contour garde ses decroches (jusqu'a 1,2 m, model/volumesToit.ts).
 */
const MUR_PROCHE_M = 0.8;

/**
 * La hauteur d'un mur : celle du volume ou il se trouve (un releve en L abaisse une partie), ou,
 * quand le volume porte des hauteurs de murs mesurees, celle de son mur le plus proche.
 */
export function hauteurDuMur(f: Facade, volumes: readonly Volume[]): number {
  const m = pointDeFacade(f, f.largeur / 2);
  const dedans = { x: m.x - f.normale.x * 0.05, y: m.y - f.normale.y * 0.05 };
  // Le volume qui porte le mur ; a defaut (un decroche du contour, hors des rectangles des corps),
  // celui dont un mur passe a moins de MUR_PROCHE_M.
  const v = volumes.find((x) => pointInPolygon(dedans, x.pts))
    ?? volumes.find((x) => x.pts.some((a, i) => distancePointSegment(m, a, sommetDe(x.pts, i + 1)) < MUR_PROCHE_M));
  if (!v) return au(volumes, 0).hauteur;
  if (!v.hauteursMurs?.length) return v.hauteur;
  let proche = -1, d = MUR_PROCHE_M;
  v.pts.forEach((a, i) => {
    const dist = distancePointSegment(m, a, sommetDe(v.pts, i + 1));
    if (dist < d) { d = dist; proche = i; }
  });
  return proche >= 0 ? (v.hauteursMurs[proche] ?? v.hauteur) : v.hauteur;
}

/** Les murs qui recoivent des ouvertures : sans releve, et assez larges. */
export function mursAOuvrir(contour: readonly PtBrut[], h: number, cotesReleves: readonly number[] = [], profil: ValeursFacades = REGLAGES_FACADES): Facade[] {
  const releves = new Set(cotesReleves);
  return facadesDuContour(contour, h).filter((f) => !releves.has(f.cote) && f.largeur >= profil.LARGEUR_MUR_MIN_M);
}

/**
 * Les ouvertures d'UN mur de cette largeur et de cette hauteur, sans cote : `y` depuis le pied du mur (la porte a
 * `y = 0`), `x` depuis la gauche vu de dehors. C'est le coeur de la disposition automatique, que le controle des
 * facades (facade/regles/facades/conformite.ts) rejoue sur la largeur et la hauteur d'un mur releve. `avecPorte` :
 * le mur est le plus long du batiment, il porte la porte d'entree (si le mur est assez haut).
 */
export function ouverturesDUnMur(largeurMur: number, hMur: number, options: OptionsOuvertures = {}, avecPorte = false): OuvertureFacade[] {
  const pr = options.profil ?? REGLAGES_FACADES;
  const largeur = options.largeur ?? pr.FENETRE_LARGEUR_M,
    hauteur = options.hauteur ?? pr.FENETRE_HAUTEUR_M,
    appui = options.appui ?? pr.FENETRE_APPUI_M,
    entraxe = Math.max(options.entraxe ?? pr.ENTRAXE_FENETRES_M, largeur + 0.2);
  const porte = { l: pr.PORTE_LARGEUR_M, h: pr.PORTE_HAUTEUR_M };
  const { n, hauteur: hNiveau } = niveaux(hMur, options.etages, pr);
  if (n < 1) return [];
  const xs = abscissesFenetres(largeurMur, entraxe, largeur, pr.FENETRES_MAX_PAR_MUR);
  const hFen = Math.min(hauteur, hNiveau - appui - 0.2);
  if (hFen < 0.3) return [];
  const porteIci = options.porte !== false && avecPorte && hMur >= porte.h + 0.3 && xs.length > 0;
  const iPorte = Math.floor(xs.length / 2);
  const out: OuvertureFacade[] = [];
  for (let k = 0; k < n; k++) {
    xs.forEach((x, j) => {
      if (k === 0 && porteIci && j === iPorte) {
        out.push({ type: 'porte', x: x + largeur / 2 - porte.l / 2, y: 0, l: porte.l, h: porte.h });
        return;
      }
      const y = k * hNiveau + appui;
      if (y + hFen > hMur - 0.15) return;
      out.push({ type: 'fenetre', x, y, l: largeur, h: hFen });
    });
  }
  return out;
}

/**
 * Les ouvertures d'un batiment, cote par cote : `y` depuis le pied du mur (la porte a `y = 0`), `x`
 * depuis la gauche du mur vu de dehors. Les dimensions passees valent pour toutes les fenetres ;
 * une fenetre est raccourcie quand le niveau est trop bas pour elle.
 */
export function ouverturesAutomatiques(contour: readonly PtBrut[], volumes: readonly Volume[], h: number, options: OptionsOuvertures = {}): Fenetre3d[] {
  const pr = options.profil ?? REGLAGES_FACADES;
  const facades = mursAOuvrir(contour, h, options.cotesReleves, pr);
  if (!facades.length) return [];
  const plusLong = facades.reduce((m, f) => (f.largeur > m.largeur ? f : m), au(facades, 0));
  return facades.flatMap((f) => ouverturesDUnMur(f.largeur, hauteurDuMur(f, volumes), options, f === plusLong).map((o): Fenetre3d => ({ cote: f.cote, ...o })));
}

/** Un pignon trop bas n'a pas de fenetre : moins de cela entre son egout et son faitage (profil par defaut). */
export const HAUTEUR_PIGNON_FENETRE_M = REGLAGES_FACADES.HAUTEUR_PIGNON_FENETRE_M;

/**
 * Les fenetres hautes d'un corps (facade/toits/toitCorps.ts) : une par pignon qui part du faitage, et une
 * dans chaque pignon de bout d'un corps a deux pans, centrees sous le faitage, au-dessus de l'egout,
 * dans le triangle. Elles sont posees sur les murs du corps lui-meme : `cote` est l'indice du mur du
 * rectangle (0 sous le pan 0, 1 au bout s = L, 2 sous le pan 1, 3 au bout s = 0).
 */
export function fenetresDesPignons(c: CorpsToit, largeur = FENETRE.l, hauteur = FENETRE.h, pignonMin = HAUTEUR_PIGNON_FENETRE_M): Fenetre3d[] {
  const facades = facadesDuContour(c.pts, 0);
  const r = repere(c.pts);
  const [e0, e1] = c.egouts;
  const out: Fenetre3d[] = [];
  /** Une fenetre centree a `centre` (plan) sur le mur `cote`, dans un triangle d'egout `e`, de faitage `P`, de demi-base `demi`. */
  const poser = (cote: number, centre: PtBrut, e: number, P: number, demi: number) => {
    const H = P - e;
    if (H < pignonMin || demi < 0.8) return;
    const y = e + 0.25;
    // La fenetre tient dans le triangle : a son linteau, la demi-largeur du triangle la deborde de 15 cm.
    const l = Math.min(largeur, 0.6 * demi);
    const h = Math.min(hauteur, H * (1 - (l / 2 + 0.15) / demi) - 0.25);
    const f = facades.find((x) => x.cote === cote);
    if (!f || h < 0.5 || l < 0.4) return;
    const xc = ((centre.x - f.gauche.x) * (f.droite.x - f.gauche.x) + (centre.y - f.gauche.y) * (f.droite.y - f.gauche.y)) / f.largeur;
    if (xc - l / 2 < 0.1 || xc + l / 2 > f.largeur - 0.1) return;
    out.push({ cote, type: 'fenetre', x: xc - l / 2, y, l, h });
  };
  for (const pg of c.pignons) poser(pg.pan === 0 ? 0 : 2, point(r, (pg.debut + pg.fin) / 2, pg.pan === 0 ? 0 : r.W), c.egouts[pg.pan], pg.faitage, (pg.fin - pg.debut) / 2);
  // Le pignon de bout d'un deux-pans : sous le faitage, au-dessus du plus haut des deux egouts.
  if (c.posFaitage > 0.5 && c.posFaitage < r.W - 0.5 && c.faitage - Math.max(e0, e1) >= pignonMin) {
    const demi = Math.min(c.posFaitage, r.W - c.posFaitage);
    // Un bout sous une croupe n'a pas de pignon.
    const [h0, h1] = c.croupes ?? [0, 0];
    if (h0 <= 0) poser(3, point(r, 0, c.posFaitage), Math.max(e0, e1), c.faitage, demi);
    if (h1 <= 0) poser(1, point(r, r.L, c.posFaitage), Math.max(e0, e1), c.faitage, demi);
  }
  return out;
}
