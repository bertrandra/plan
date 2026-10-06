// Le sol en relief de la Vue 3D (MD/spec-relief.md §5.5, three/).
//
// La grille d'altitudes de la parcelle (`model/relief.ts`) devient un maillage : un sommet par
// cellule, a la hauteur `zLocal` du sol au-dessus du zero du plan. Les objets poses dessus lisent le
// MEME sol (`SolRelief.hauteur`) : un batiment part du point le plus bas du sol sous son contour et
// monte jusqu'a la hauteur du sol en son centre plus sa hauteur propre — ni enterre, ni en l'air.
//
// Deux choses sont propres a l'affichage, et ne touchent pas au modele :
// - une cellule sans donnee (mer, frontiere, sur les abords) prendrait un trou dans le sol : elle
//   recoit la hauteur de sa voisine connue la plus proche ;
// - hors de l'emprise de la grille, le sol continue plat a la hauteur du bord le plus proche, jusqu'au
//   carre que le plan vert couvrait deja. Un seul maillage, sans couture.
//
// Ce fichier ne fait que l'affichage du sol. Ce qui se pose dessus en suivant la pente (la structure
// de la terrasse, les poteaux d'une pergola ou d'une plage, le bord d'un bassin) lit le MEME relief
// par le moteur (`engine/sol.ts`, spec §6) : three/scene.ts construit les deux depuis la grille de
// la parcelle, et ne passe le sol du moteur que si le sol en relief est dessine.

import { pointInPolygon } from '../geometry/basic.js';
import { affichageRelief, centreCellule, empriseGrille, zLocal } from '../model/relief.js';
import type * as THREE_NS from 'three';
import type { PtBrut, Relief } from '../model/types.js';
import type { VersLocal } from './primitives.js';

/** Le sol que la scene 3D pose et sur lequel elle pose les objets. */
export interface SolRelief {
  relief: Relief;
  /** La hauteur du sol en un point, en metres au-dessus du zero du plan. Toujours un nombre. */
  hauteur: (p: PtBrut) => number;
  /** Le point le plus bas du sol sous un contour : ses sommets et les cellules qu'il contient. */
  basSous: (contour: readonly PtBrut[]) => number;
}

/** Le decalage de la photo aerienne au-dessus du sol : celui de la dalle plate (three/scene.ts). */
export const DECALAGE_ORTHO_M = 0.004;
/** La subdivision des dalles orthophoto sur un sol en relief, en metres. */
export const PAS_DALLE_ORTHO_M = 1;
/** La hauteur d'un trait pose sur le sol en relief : entre deux sommets, le sol est plan, le trait doit rester visible. */
export const DECALAGE_TRAIT_SOL_M = 0.02;
/** Le pas des points intermediaires d'un trait qui suit le sol, en metres. */
export const PAS_TRAIT_SOL_M = 1;

/**
 * Les hauteurs `zLocal` de chaque cellule, les sans-donnee comblees par la voisine connue la plus
 * proche (parcours en largeur depuis toutes les cellules connues), 0 partout si la grille est vide.
 */
export function hauteursComblees(r: Relief): Float64Array {
  const n = r.nx * r.ny;
  const h = new Float64Array(n);
  const connue = new Uint8Array(n);
  const file: number[] = [];
  for (let k = 0; k < n; k++) {
    const z = r.z[k];
    if (z !== null && z !== undefined) { h[k] = z - r.zRef; connue[k] = 1; file.push(k); }
  }
  if (!file.length) return h;
  for (let tete = 0; tete < file.length; tete++) {
    const k = file[tete] ?? 0;
    const i = k % r.nx, j = Math.floor(k / r.nx);
    const voisins = [i > 0 ? k - 1 : -1, i < r.nx - 1 ? k + 1 : -1, j > 0 ? k - r.nx : -1, j < r.ny - 1 ? k + r.nx : -1];
    for (const v of voisins) {
      if (v < 0 || connue[v]) continue;
      h[v] = h[k] ?? 0; connue[v] = 1; file.push(v);
    }
  }
  return h;
}

/**
 * Le sol de la scene pour ce relief, ou `null` : pas de relief, ou la preference « Sol en relief »
 * decochee — le plan vert d'aujourd'hui reprend alors sa place.
 */
export function solDeLaScene(r: Relief | null | undefined): SolRelief | null {
  if (!r || r.nx < 1 || r.ny < 1 || !affichageRelief(r).sol3d) return null;
  return creerSolRelief(r);
}

/** Le lecteur du sol : `zLocal` la ou la grille parle ; ailleurs, la grille comblee, bornee a son bord. */
export function creerSolRelief(r: Relief): SolRelief {
  const comblees = hauteursComblees(r);
  const lire = (i: number, j: number) => comblees[j * r.nx + i] ?? 0;
  // La bilineaire du modele, sur la grille comblee et avec les coordonnees bornees : au bord, le sol
  // continue plat ; sur un trou, il suit la voisine. A l'interieur, la ou toutes les voisines sont
  // connues, c'est exactement `zLocal`.
  const lectureComblee = (x: number, y: number): number => {
    const ci = Math.min(Math.max((x - r.x0) / r.pas, 0), r.nx - 1), cj = Math.min(Math.max((r.y0 - y) / r.pas, 0), r.ny - 1);
    const i0 = Math.floor(ci), j0 = Math.floor(cj);
    const i1 = Math.min(i0 + 1, r.nx - 1), j1 = Math.min(j0 + 1, r.ny - 1);
    const tx = ci - i0, ty = cj - j0;
    return (lire(i0, j0) * (1 - tx) + lire(i1, j0) * tx) * (1 - ty) + (lire(i0, j1) * (1 - tx) + lire(i1, j1) * tx) * ty;
  };
  const hauteur = (p: PtBrut): number => zLocal(r, p.x, p.y) ?? lectureComblee(p.x, p.y);
  const basSous = (contour: readonly PtBrut[]): number => {
    let bas = Infinity;
    contour.forEach(p => { bas = Math.min(bas, hauteur(p)); });
    // Les cellules dont le centre est sous le contour, cherchees dans son seul rectangle englobant :
    // parcourir toute la grille pour chacun des objets du plan couterait des millions de tests.
    if (contour.length >= 3) {
      const xs = contour.map(p => p.x), ys = contour.map(p => p.y);
      const i0 = Math.max(0, Math.ceil((Math.min(...xs) - r.x0) / r.pas)), i1 = Math.min(r.nx - 1, Math.floor((Math.max(...xs) - r.x0) / r.pas));
      const j0 = Math.max(0, Math.ceil((r.y0 - Math.max(...ys)) / r.pas)), j1 = Math.min(r.ny - 1, Math.floor((r.y0 - Math.min(...ys)) / r.pas));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = centreCellule(r, i, j);
        if (pointInPolygon(c, contour)) bas = Math.min(bas, hauteur(c));
      }
    }
    return Number.isFinite(bas) ? bas : 0;
  };
  return { relief: r, hauteur, basSous };
}

/**
 * Un maillage pose sur le sol : les sommets aux croisements de `xs` (d'ouest en est) et `ys` (du
 * nord au sud), chacun a la hauteur du sol plus `decalage`. Les `uv` sont ceux d'un plan : la photo
 * s'etire sur la pente, c'est voulu. Les normales sont recalculees pour l'eclairage.
 */
export function geometrieSurSol(xs: readonly number[], ys: readonly number[], sol: SolRelief, versLocal: VersLocal, decalage: number): THREE_NS.BufferGeometry {
  const nx = xs.length, ny = ys.length;
  const positions: number[] = [];
  const uv: number[] = [];
  ys.forEach((y, j) => xs.forEach((x, i) => {
    const l = versLocal({ x, y });
    positions.push(l.x, sol.hauteur({ x, y }) + decalage, l.z);
    uv.push(nx > 1 ? i / (nx - 1) : 0, ny > 1 ? 1 - j / (ny - 1) : 1);
  }));
  const indices: number[] = [];
  // Deux triangles par maille, parcourus pour que la normale regarde le ciel : la 3D met le nord sur
  // -Z, la ligne `j + 1` (plus au sud) est donc a +Z.
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, c = d + 1;
    indices.push(a, d, b, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Les abscisses des sommets du sol : un sommet par cellule de la grille, et un anneau exterieur qui
 * porte le sol, plat, jusqu'au carre que le plan vert couvre (`demiCote` autour du centre `cen`).
 */
export function sommetsDuSol(r: Relief, cen: PtBrut, demiCote: number): { xs: number[]; ys: number[] } {
  const e = empriseGrille(r);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < r.nx; i++) xs.push(r.x0 + i * r.pas);
  for (let j = 0; j < r.ny; j++) ys.push(r.y0 - j * r.pas);
  // L'anneau : au moins un pas au-dela du bord des cellules, et jusqu'au carre du plan vert.
  xs.unshift(Math.min(e.xMin - r.pas, cen.x - demiCote));
  xs.push(Math.max(e.xMax + r.pas, cen.x + demiCote));
  ys.unshift(Math.max(e.yMax + r.pas, cen.y + demiCote));
  ys.push(Math.min(e.yMin - r.pas, cen.y - demiCote));
  return { xs, ys };
}

/** La geometrie du sol en relief, prete a recevoir le materiau du sol vert. */
export function geometrieSol(sol: SolRelief, cen: PtBrut, demiCote: number, versLocal: VersLocal): THREE_NS.BufferGeometry {
  const { xs, ys } = sommetsDuSol(sol.relief, cen, demiCote);
  return geometrieSurSol(xs, ys, sol, versLocal, 0);
}

/** Les abscisses d'une dalle subdivisee tous les `pas` metres au plus, bornes comprises. */
export function subdiviser(min: number, max: number, pas: number): number[] {
  const n = Math.max(1, Math.ceil((max - min) / pas - 1e-9));
  return Array.from({ length: n + 1 }, (_, k) => min + (max - min) * k / n);
}

/** Une dalle de la photo aerienne qui epouse le sol, a `DECALAGE_ORTHO_M` au-dessus de lui. */
export function geometrieDalleSurSol(t: { xMin: number; yMin: number; largeur: number; hauteur: number }, sol: SolRelief, versLocal: VersLocal): THREE_NS.BufferGeometry {
  const xs = subdiviser(t.xMin, t.xMin + t.largeur, PAS_DALLE_ORTHO_M);
  const ys = subdiviser(t.yMin, t.yMin + t.hauteur, PAS_DALLE_ORTHO_M).reverse();
  return geometrieSurSol(xs, ys, sol, versLocal, DECALAGE_ORTHO_M);
}

/**
 * Les points d'un trait qui suit le sol : les sommets du contour et un point tous les `pas` metres
 * entre deux sommets, chacun a la hauteur du sol plus `decalage`. Ferme si on le demande.
 */
export function traitSurSol(pts: readonly PtBrut[], sol: SolRelief, versLocal: VersLocal, decalage = DECALAGE_TRAIT_SOL_M, ferme = true, pas = PAS_TRAIT_SOL_M): THREE_NS.Vector3[] {
  const out: THREE_NS.Vector3[] = [];
  const poser = (p: PtBrut) => { const l = versLocal(p); out.push(new THREE.Vector3(l.x, sol.hauteur(p) + decalage, l.z)); };
  const n = pts.length;
  const segments = ferme ? n : n - 1;
  for (let k = 0; k < segments; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    if (!a || !b) continue;
    const m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / pas - 1e-9));
    for (let s = 0; s < m; s++) poser({ x: a.x + (b.x - a.x) * s / m, y: a.y + (b.y - a.y) * s / m });
  }
  const dernier = ferme ? pts[0] : pts[n - 1];
  if (dernier) poser(dernier);
  return out;
}
