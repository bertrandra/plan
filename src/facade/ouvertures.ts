// La disposition automatique des ouvertures d'un batiment (MD/spec-toit-ign.md §6.3) : des
// fenetres regulieres a chaque niveau sur les murs sans releve de facade, et une porte au
// rez-de-chaussee du plus long d'entre eux. Pure : la 3D la dessine (three/detailsBatiment.ts),
// l'inspecteur s'en sert pour initialiser une liste reglee une par une (ui/champs/fenetres3d.ts).

import { au } from '../util/tableaux.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointSegment } from '../geometry/segments.js';
import { sommetDe } from '../geometry/anneau.js';
import { facadesDuContour, pointDeFacade, type Facade } from './geometrie.js';
import type { Volume } from './profil.js';
import { HAUTEUR_ETAGE_M } from '../geo/bdtopo.js';
import type { Fenetre3d, PtBrut } from '../model/types.js';
import { FENETRE, PORTE, ENTRAXE_FENETRES_M } from '../model/fenetres3d.js';

export { FENETRE, PORTE, ENTRAXE_FENETRES_M };
const FENETRES_MAX_PAR_MUR = 8;
/** En dessous, un niveau n'a pas de fenetre : un abri, un garage bas. */
const HAUTEUR_NIVEAU_MIN_M = 2.2;
/** Un mur plus etroit n'a pas de fenetre. */
const LARGEUR_MUR_MIN_M = 2;

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
}

/** Combien de niveaux, et leur hauteur : le nombre d'etages s'il est connu, sinon la hauteur du mur. */
export function niveaux(hMur: number, etages: number | null | undefined): { n: number; hauteur: number } {
  let n = etages && etages > 0 ? Math.round(etages) : Math.max(1, Math.round(hMur / HAUTEUR_ETAGE_M));
  if (hMur / n < HAUTEUR_NIVEAU_MIN_M) n = Math.floor(hMur / HAUTEUR_NIVEAU_MIN_M);
  return { n, hauteur: n > 0 ? hMur / n : 0 };
}

/** Les abscisses des fenetres d'un mur de largeur `L`, centrees, a l'entraxe ; aucune sur un mur etroit. */
export function abscissesFenetres(L: number, entraxe = ENTRAXE_FENETRES_M, largeur = FENETRE.l): number[] {
  const n = Math.min(FENETRES_MAX_PAR_MUR, Math.floor((L - 0.8) / entraxe));
  if (n < 1) return [];
  const debut = (L - ((n - 1) * entraxe + largeur)) / 2;
  return Array.from({ length: n }, (_, k) => debut + k * entraxe);
}

/** Un mur du volume a moins de cela du milieu de la facade est ce mur-la. */
const MUR_PROCHE_M = 0.3;

/**
 * La hauteur d'un mur : celle du volume ou il se trouve (un releve en L abaisse une partie), ou,
 * quand le volume porte des hauteurs de murs mesurees, celle de son mur le plus proche.
 */
export function hauteurDuMur(f: Facade, volumes: readonly Volume[]): number {
  const m = pointDeFacade(f, f.largeur / 2);
  const dedans = { x: m.x - f.normale.x * 0.05, y: m.y - f.normale.y * 0.05 };
  const v = volumes.find((x) => pointInPolygon(dedans, x.pts));
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
export function mursAOuvrir(contour: readonly PtBrut[], h: number, cotesReleves: readonly number[] = []): Facade[] {
  const releves = new Set(cotesReleves);
  return facadesDuContour(contour, h).filter((f) => !releves.has(f.cote) && f.largeur >= LARGEUR_MUR_MIN_M);
}

/**
 * Les ouvertures d'un batiment, cote par cote : `y` depuis le pied du mur (la porte a `y = 0`), `x`
 * depuis la gauche du mur vu de dehors. Les dimensions passees valent pour toutes les fenetres ;
 * une fenetre est raccourcie quand le niveau est trop bas pour elle.
 */
export function ouverturesAutomatiques(contour: readonly PtBrut[], volumes: readonly Volume[], h: number, options: OptionsOuvertures = {}): Fenetre3d[] {
  const facades = mursAOuvrir(contour, h, options.cotesReleves);
  if (!facades.length) return [];
  const largeur = options.largeur ?? FENETRE.l,
    hauteur = options.hauteur ?? FENETRE.h,
    appui = options.appui ?? FENETRE.appui,
    entraxe = Math.max(options.entraxe ?? ENTRAXE_FENETRES_M, largeur + 0.2);
  const plusLong = facades.reduce((m, f) => (f.largeur > m.largeur ? f : m), au(facades, 0));
  const out: Fenetre3d[] = [];
  facades.forEach((f) => {
    const hMur = hauteurDuMur(f, volumes);
    const { n, hauteur: hNiveau } = niveaux(hMur, options.etages);
    if (n < 1) return;
    const xs = abscissesFenetres(f.largeur, entraxe, largeur);
    const hFen = Math.min(hauteur, hNiveau - appui - 0.2);
    if (hFen < 0.3) return;
    const porteIci = f === plusLong && hMur >= PORTE.h + 0.3 && xs.length > 0;
    const iPorte = Math.floor(xs.length / 2);
    for (let k = 0; k < n; k++) {
      xs.forEach((x, j) => {
        if (k === 0 && porteIci && j === iPorte) {
          out.push({ cote: f.cote, type: 'porte', x: x + largeur / 2 - PORTE.l / 2, y: 0, l: PORTE.l, h: PORTE.h });
          return;
        }
        const y = k * hNiveau + appui;
        if (y + hFen > hMur - 0.15) return;
        out.push({ cote: f.cote, type: 'fenetre', x, y, l: largeur, h: hFen });
      });
    }
  });
  return out;
}
