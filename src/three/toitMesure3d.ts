// Le toit mesure au LiDAR, dessine en surface (MD/spec-toit-ign.md §12).
//
// Le contour du batiment est triangule puis chaque triangle subdivise jusqu'a des cotes de 50 cm ;
// chaque sommet prend la hauteur que la grille mesure la (interpolee), jamais sous l'egout du corps
// de batiment qui le porte. La ou le toit, le long d'un mur, est plus haut que l'egout - un pignon,
// un mur qui monte jusqu'a un dessus plat - une bande verticale en couleur de mur comble l'ecart.

import type * as THREE_NS from 'three';
import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointContour } from '../geometry/proximite.js';
import { trianguler } from '../facade/toit.js';
import { COULEUR_TOIT_DEFAUT } from '../facade/toit.js';
import { materiauCouverture } from '../model/couleurToit.js';
import { hauteurToitMesure } from '../model/toitMesure.js';
import { textureCouverture } from './couverture.js';
import type { VersLocal } from './primitives.js';
import type { PtBrut, Toit, ToitMesure } from '../model/types.js';

export const NOM_TOIT_MESURE = 'toit-mesure';
export const NOM_REHAUSSE = 'toit-mesure-rehausse';
/** Le plus long cote d'un triangle de la surface, en metres : le pas de la grille. */
export const PAS_MAILLE_M = 0.5;
/** Profondeur de subdivision au plus : 4^6 triangles par triangle du contour, jamais plus. */
const PROFONDEUR_MAX = 6;
/** La surface se tient au moins cela au-dessus de l'egout : sur le dessus du prisme, elle se battrait avec lui. */
export const LEVEE_M = 0.05;

export interface ContexteToitMesure {
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  couleurMur: string | number;
  textures: boolean;
}

/** Un corps de batiment avec son egout : la surface ne descend pas sous lui. */
export interface CorpsMesure { pts: readonly PtBrut[]; egout: number }

type Tri = [PtBrut, PtBrut, PtBrut];

/** Subdivise un triangle par les milieux de ses cotes jusqu'a ce qu'aucun ne depasse `pas`. */
export function subdiviser(t: Tri, pas: number, profondeur = 0): Tri[] {
  const l = (a: PtBrut, b: PtBrut) => Math.hypot(b.x - a.x, b.y - a.y);
  if (profondeur >= PROFONDEUR_MAX || Math.max(l(t[0], t[1]), l(t[1], t[2]), l(t[2], t[0])) <= pas) return [t];
  const m = (a: PtBrut, b: PtBrut): PtBrut => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const ab = m(t[0], t[1]), bc = m(t[1], t[2]), ca = m(t[2], t[0]);
  return [[t[0], ab, ca], [ab, t[1], bc], [ca, bc, t[2]], [ab, bc, ca]].flatMap((s) => subdiviser(s as Tri, pas, profondeur + 1));
}

/** Les triangles de la surface sur le contour, a maille fine. */
export function maillesDuToit(contour: readonly PtBrut[], pas = PAS_MAILLE_M): Tri[] {
  return trianguler(contour).flatMap(([a, b, c]) => subdiviser([au(contour, a), au(contour, b), au(contour, c)], pas));
}

/** Un point sur un mur est du corps qui porte ce mur : a moins de cela du bord, il compte dedans. */
const TOLERANCE_BORD_M = 0.02;

/** L'egout du corps qui porte le point (ou dont il longe le bord), sinon l'egout par defaut. */
export function egoutAu(corps: readonly CorpsMesure[], egoutDefaut: number, p: PtBrut): number {
  const dedans = corps.find((c) => pointInPolygon(p, c.pts)) ?? corps.find((c) => distancePointContour(p, c.pts) <= TOLERANCE_BORD_M);
  return dedans?.egout ?? egoutDefaut;
}

/** La hauteur de la surface en un point : la mesure, jamais sous l'egout du corps qui porte le point (plus la levee). */
export function hauteurEn(t: ToitMesure, corps: readonly CorpsMesure[], egoutDefaut: number, p: PtBrut): number {
  const plancher = egoutAu(corps, egoutDefaut, p) + LEVEE_M;
  const z = hauteurToitMesure(t, p.x, p.y);
  return z === null ? plancher : Math.max(plancher, z);
}

/**
 * Pose la surface mesuree et ses rehausses. `corps` donne l'egout de chaque corps de batiment (vide :
 * `egoutDefaut` partout) ; `toitRef` porte la couleur et la matiere de la couverture.
 */
export function ajouterToitMesure3d(ctx: ContexteToitMesure, contour: readonly PtBrut[], t: ToitMesure, toitRef: Toit | null | undefined, corps: readonly CorpsMesure[], egoutDefaut: number): { triangles: number; rehausses: number } {
  const egoutEn = (p: PtBrut) => egoutAu(corps, egoutDefaut, p);
  const z = (p: PtBrut) => hauteurEn(t, corps, egoutDefaut, p);
  // La surface : sommets partages par leurs coordonnees arrondies au centimetre.
  const index = new Map<string, number>();
  const sommets: number[] = [];
  const indices: number[] = [];
  const idDe = (p: PtBrut): number => {
    const cle = p.x.toFixed(2) + ',' + p.y.toFixed(2);
    const deja = index.get(cle);
    if (deja !== undefined) return deja;
    const l = ctx.toLocal(p);
    sommets.push(l.x, z(p), l.z);
    const id = index.size;
    index.set(cle, id);
    return id;
  };
  const tris = maillesDuToit(contour);
  for (const tri of tris) indices.push(idDe(tri[0]), idDe(tri[1]), idDe(tri[2]));
  const materiau = materiauCouverture(toitRef);
  const tex = ctx.textures ? textureCouverture(materiau) : null;
  // Par facettes : chaque triangle de 50 cm est un plan, et un pignon qui avance depuis le faitage se
  // lit comme des pans, la ou l'ombrage lisse en faisait une bosse.
  const mat = new THREE.MeshStandardMaterial({ color: toitRef?.couleur || COULEUR_TOIT_DEFAUT, roughness: materiau === 'ardoise' ? 0.7 : 0.85, side: THREE.DoubleSide, flatShading: true, ...(tex ? { map: tex } : {}) });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  if (tex) {
    // Les rangs de tuiles suivent x, le pas se mesure en y du plan : un carreau par metre.
    const uv: number[] = [];
    for (const [cle] of index) { const [x, y] = cle.split(',').map(Number); uv.push(x ?? 0, y ?? 0); }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const surface = new THREE.Mesh(geo, mat);
  surface.name = NOM_TOIT_MESURE;
  ctx.scene.add(surface);

  // Les rehausses : le long de chaque mur, entre l'egout et la surface (toujours plus haute, de la levee au moins).
  const rehausse: number[] = [];
  const idx: number[] = [];
  let bandes = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = au(contour, i), b = sommetDe(contour, i + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / PAS_MAILLE_M));
    for (let k = 0; k < n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      const q = { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n };
      const ep = egoutEn(p), eq = egoutEn(q);
      const zp = z(p), zq = z(q);
      const lp = ctx.toLocal(p), lq = ctx.toLocal(q);
      const base = rehausse.length / 3;
      rehausse.push(lp.x, ep, lp.z, lq.x, eq, lq.z, lq.x, zq, lq.z, lp.x, zp, lp.z);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      bandes++;
    }
  }
  {
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(rehausse, 3));
    g2.setIndex(idx);
    g2.computeVertexNormals();
    const m2 = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide }));
    m2.name = NOM_REHAUSSE;
    ctx.scene.add(m2);
  }
  return { triangles: tris.length, rehausses: bandes };
}
