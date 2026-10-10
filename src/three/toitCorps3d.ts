// Les corps et pignons d'un batiment, dessines (MD/spec-toit-ign.md §13).
//
// Chaque corps (facade/toitCorps.ts) : ses pans, prolonges d'un debord a l'egout et d'une rive aux
// pignons ; au-dessus du prisme (pose a son egout le plus bas), les murs qui montent - le mur d'un
// pan plus haut que l'autre, les pignons de bout jusqu'au faitage - en couleur de mur. Chaque
// pignon qui part du faitage : ses deux pans, perpendiculaires, qui avancent du mur jusqu'a
// rencontrer le pan du corps (la noue nait de leur rencontre), et son triangle sur la facade.

import type * as THREE_NS from 'three';
import { COULEUR_TOIT_DEFAUT, uvDuPan, trianguler } from '../facade/toit.js';
import { repere, point } from '../facade/toitCorps.js';
import { materiauCouverture } from '../model/couleurToit.js';
import { textureCouverture } from './couverture.js';
import type { VersLocal } from './primitives.js';
import { segmentEnFacade } from '../geometry/facadeExterieure.js';
import type { CorpsToit, PtBrut, Toit } from '../model/types.js';

export const NOM_TOIT_CORPS = 'toit-corps';
export const NOM_MUR_CORPS = 'toit-corps-mur';
/** Le debord du toit au-dela du mur, a l'egout, en metres (mesure a plat). */
export const DEBORD_EGOUT_M = 0.35;
/** Le debord a la rive, au-dela d'un pignon. */
export const DEBORD_RIVE_M = 0.2;
/** En deca, un mur au-dessus du prisme ne se dessine pas. */
const MUR_MIN_M = 0.02;

/** Un sommet : le plan (x, y) et la hauteur au-dessus du sol (z). */
export interface S3 { x: number; y: number; z: number }

/** Le cote d'un corps est-il une facade (geometry/facadeExterieure.ts) ? Sans contour, tous le sont. */
function enFacade(r: ReturnType<typeof repere>, contour: readonly PtBrut[] | null, cote: 's0' | 'sL' | 't0' | 'tW'): boolean {
  if (!contour) return true;
  const milieu = point(r, r.L / 2, r.W / 2);
  const [a, b] = cote === 't0' ? [point(r, 0, 0), point(r, r.L, 0)] : cote === 'tW' ? [point(r, 0, r.W), point(r, r.L, r.W)]
    : cote === 's0' ? [point(r, 0, 0), point(r, 0, r.W)] : [point(r, r.L, 0), point(r, r.L, r.W)];
  return segmentEnFacade(a, b, milieu, contour);
}

/**
 * Les facettes d'un corps dans le plan : les pans du toit (corps et pignons) et les murs qui montent
 * au-dessus de son prisme. Le debord (a l'egout, a la rive) n'existe que sur une facade du `contour`.
 */
export function facettesCorps(c: CorpsToit, contour: readonly PtBrut[] | null = null): { pans: S3[][]; murs: S3[][] } {
  const r = repere(c.pts);
  const { L, W } = r;
  const p = c.posFaitage, F = c.faitage, [e0, e1] = c.egouts;
  const bas = Math.min(e0, e1);
  const P = (s: number, t: number, z: number): S3 => ({ ...point(r, s, t), z });
  const dE0 = enFacade(r, contour, 't0') ? DEBORD_EGOUT_M : 0, dE1 = enFacade(r, contour, 'tW') ? DEBORD_EGOUT_M : 0;
  const dR0 = enFacade(r, contour, 's0') ? DEBORD_RIVE_M : 0, dRL = enFacade(r, contour, 'sL') ? DEBORD_RIVE_M : 0;
  const pans: S3[][] = [], murs: S3[][] = [];
  const plat = F - Math.min(e0, e1) < 0.05;
  // Un pan, dans son repere : `s` le long du faitage, `d` la distance a son mur d'egout (negative
  // sous le debord). Ses pignons l'entaillent le long de leurs noues : du pied du pignon sur le mur
  // jusqu'au bout de son faitage, la ou les deux pans se rencontrent. Sans cela, le grand pan et son
  // debord passaient sous le pignon et ressortaient devant son triangle.
  const pan = (n: 0 | 1) => {
    const largeur = n === 0 ? p : W - p;
    if (largeur < 0.01) return;
    const e = n === 0 ? e0 : e1, dE = n === 0 ? dE0 : dE1, k = (F - e) / largeur;
    const Q = (s: number, d: number) => P(s, n === 0 ? d : W - d, e + k * d);
    const contour: { s: number; d: number }[] = [{ s: -dR0, d: largeur }];
    const pignons = c.pignons.filter((g) => g.pan === n).sort((a, b) => a.debut - b.debut);
    let ouvert = false;
    if ((pignons[0]?.debut ?? Infinity) > 0.3) { contour.push({ s: -dR0, d: -dE }); ouvert = true; }
    for (const g of pignons) {
      const sc = (g.debut + g.fin) / 2, D = Math.max(0.1, Math.min(largeur, g.profondeur));
      // La noue prolongee jusqu'au bord du debord, pour que l'entaille coupe aussi le debord.
      const ext = dE > 0 ? ((sc - g.debut) * dE) / D : 0;
      if (g.debut <= 0.3) contour.push({ s: -dR0, d: 0 });
      else contour.push({ s: g.debut - ext, d: -dE });
      contour.push({ s: sc, d: D });
      if (g.fin >= L - 0.3) { contour.push({ s: L + dRL, d: 0 }); ouvert = false; }
      else { contour.push({ s: g.fin + ext, d: -dE }); ouvert = true; }
    }
    if (ouvert) contour.push({ s: L + dRL, d: -dE });
    contour.push({ s: L + dRL, d: largeur });
    pans.push(contour.map((q) => Q(q.s, q.d)));
  };
  if (!plat) {
    // Le pan 0, de t = 0 au faitage ; le pan 1, du faitage a t = W. Un appentis n'en a qu'un.
    pan(0);
    pan(1);
    // Les murs de bout, du prisme au toit : le pignon (ou le mur haut d'un appentis).
    for (const s of [0, L]) {
      const profil = [P(s, 0, bas), P(s, 0, e0), ...(p > 0.01 && p < W - 0.01 ? [P(s, p, F)] : []), P(s, W, e1), P(s, W, bas)];
      murs.push(profil);
    }
  }
  // Le mur d'un pan plus haut que le prisme.
  if (e0 - bas > MUR_MIN_M) murs.push([P(0, 0, bas), P(L, 0, bas), P(L, 0, e0), P(0, 0, e0)]);
  if (e1 - bas > MUR_MIN_M) murs.push([P(0, W, bas), P(L, W, bas), P(L, W, e1), P(0, W, e1)]);
  // Les pignons : deux pans perpendiculaires au faitage, du mur jusqu'a leurs noues, et leur triangle.
  for (const pg of c.pignons) {
    const e = c.egouts[pg.pan];
    const largeur = pg.pan === 0 ? p : W - p;
    const dE = pg.pan === 0 ? dE0 : dE1;
    const T = (d: number) => (pg.pan === 0 ? d : W - d);
    const D = Math.max(0.1, Math.min(largeur, pg.profondeur));
    const sc = (pg.debut + pg.fin) / 2, demi = (pg.fin - pg.debut) / 2;
    const k = demi > 0 ? (pg.faitage - e) / demi : 0;
    // Le debord du pignon le long du mur, de chaque cote ; un pignon qui touche le bout du corps
    // s'y arrete, au nu du mur de bout (et de son debord quand ce bout est une facade).
    const gauche = pg.debut <= 0.3 ? -dR0 : pg.debut - DEBORD_RIVE_M, droite = pg.fin >= L - 0.3 ? L + dRL : pg.fin + DEBORD_RIVE_M;
    const zG = e - k * (pg.debut - gauche), zD = e - k * (droite - pg.fin);
    // Chaque pan du pignon s'arrete a sa noue : du pied du pignon au bout de son faitage.
    const piedG = pg.debut <= 0.3 ? gauche : pg.debut, piedD = pg.fin >= L - 0.3 ? droite : pg.fin;
    pans.push([P(gauche, T(-dE), zG), P(sc, T(-dE), pg.faitage), P(sc, T(D), pg.faitage), P(piedG, T(0), pg.debut <= 0.3 ? zG : e)]);
    pans.push([P(sc, T(-dE), pg.faitage), P(droite, T(-dE), zD), P(piedD, T(0), pg.fin >= L - 0.3 ? zD : e), P(sc, T(D), pg.faitage)]);
    murs.push([P(pg.debut, T(0), e), P(pg.fin, T(0), e), P(sc, T(0), pg.faitage)]);
  }
  return { pans, murs };
}

export interface ContexteToitCorps {
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  couleurMur: string | number;
  textures: boolean;
}

/**
 * Une maille de polygones, avec des coordonnees de texture si on les donne. Un pan entaille par ses
 * pignons n'est plus convexe : il se triangule par oreilles dans le plan ; un mur, vertical, en eventail.
 */
function maille(polys: readonly S3[][], toLocal: VersLocal, uv: boolean, pans = false): THREE_NS.BufferGeometry {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (const poly of polys) {
    const base = pos.length / 3;
    poly.forEach((q) => { const l = toLocal(q); pos.push(l.x, q.z, l.z); });
    if (uv) uvs.push(...uvDuPan(poly));
    const tris = pans && poly.length > 4 ? trianguler(poly) : null;
    if (tris && tris.length) tris.forEach(([a, b, c2]) => idx.push(base + a, base + b, base + c2));
    else for (let i = 1; i + 1 < poly.length; i++) idx.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Pose les toits et les murs hauts des corps d'un batiment. `toitRef` porte la couleur de la couverture ; `contour` dit ou sont les facades. */
export function ajouterToitCorps3d(ctx: ContexteToitCorps, corps: readonly CorpsToit[], toitRef: Toit | null | undefined, contour: readonly PtBrut[] | null = null): { pans: number; murs: number } {
  const pans: S3[][] = [], murs: S3[][] = [];
  corps.forEach((c) => { const f = facettesCorps(c, contour); pans.push(...f.pans); murs.push(...f.murs); });
  if (pans.length) {
    const materiau = materiauCouverture(toitRef);
    const tex = ctx.textures ? textureCouverture(materiau) : null;
    const m = new THREE.Mesh(maille(pans, ctx.toLocal, !!tex, true), new THREE.MeshStandardMaterial({ color: toitRef?.couleur || COULEUR_TOIT_DEFAUT, roughness: materiau === 'ardoise' ? 0.7 : 0.85, side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) }));
    m.name = NOM_TOIT_CORPS;
    ctx.scene.add(m);
  }
  if (murs.length) {
    const m = new THREE.Mesh(maille(murs, ctx.toLocal, false), new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide }));
    m.name = NOM_MUR_CORPS;
    ctx.scene.add(m);
  }
  return { pans: pans.length, murs: murs.length };
}
