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
import { affichageRelief, centreCellule, empriseGrille, zLocal, type Emprise } from '../model/relief.js';
import { intersectionEmprises } from '../model/calque.js';
import type * as THREE_NS from 'three';
import type { PtBrut, Relief } from '../model/types.js';
import type { TuileOrtho } from '../render/ortho.js';
import type { VersLocal } from './primitives.js';

/** Le sol que la scene 3D pose et sur lequel elle pose les objets. */
export interface SolRelief {
  relief: Relief;
  /** La hauteur du sol en un point, en metres au-dessus du zero du plan. Toujours un nombre. */
  hauteur: (p: PtBrut) => number;
  /** Le point le plus bas du sol sous un contour : ses sommets et les cellules qu'il contient. */
  basSous: (contour: readonly PtBrut[]) => number;
}

/** La largeur d'une tuile WMTS de l'IGN, en pixels : la densite de la texture du sol s'en deduit. */
export const PX_PAR_TUILE = 256;
/** Le plus grand cote de la texture du sol, en pixels : au-dela, les telephones refusent la texture. */
export const TEXTURE_SOL_MAX_PX = 4096;
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
export function geometrieSurSol(xs: readonly number[], ys: readonly number[], sol: SolRelief, versLocal: VersLocal, decalage: number,
  uvDe?: (x: number, y: number) => [number, number]): THREE_NS.BufferGeometry {
  const nx = xs.length, ny = ys.length;
  const positions: number[] = [];
  const uv: number[] = [];
  ys.forEach((y, j) => xs.forEach((x, i) => {
    const l = versLocal({ x, y });
    positions.push(l.x, sol.hauteur({ x, y }) + decalage, l.z);
    if (uvDe) uv.push(...uvDe(x, y));
    else uv.push(nx > 1 ? i / (nx - 1) : 0, ny > 1 ? 1 - j / (ny - 1) : 1);
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

/** Le carre de `demiCote` autour de `cen`, en coordonnees du plan. */
export function bornesCarre(cen: PtBrut, demiCote: number): Emprise {
  return { xMin: cen.x - demiCote, xMax: cen.x + demiCote, yMin: cen.y - demiCote, yMax: cen.y + demiCote };
}

/**
 * L'emprise du maillage du sol : l'anneau exterieur, au moins un pas au-dela du bord des cellules,
 * et jusqu'aux bornes que le plan vert couvre. C'est aussi l'emprise de la texture du sol.
 */
export function empriseSol(r: Relief, bornes: Emprise): Emprise {
  const e = empriseGrille(r);
  return {
    xMin: Math.min(e.xMin - r.pas, bornes.xMin), xMax: Math.max(e.xMax + r.pas, bornes.xMax),
    yMin: Math.min(e.yMin - r.pas, bornes.yMin), yMax: Math.max(e.yMax + r.pas, bornes.yMax)
  };
}

/**
 * Les abscisses des sommets du sol : un sommet par cellule de la grille, et un anneau exterieur qui
 * porte le sol, plat, jusqu'a `empriseSol`.
 */
export function sommetsDuSol(r: Relief, bornes: Emprise): { xs: number[]; ys: number[] } {
  const a = empriseSol(r, bornes);
  const xs: number[] = [a.xMin], ys: number[] = [a.yMax];
  for (let i = 0; i < r.nx; i++) xs.push(r.x0 + i * r.pas);
  for (let j = 0; j < r.ny; j++) ys.push(r.y0 - j * r.pas);
  xs.push(a.xMax);
  ys.push(a.yMin);
  return { xs, ys };
}

/**
 * La geometrie du sol en relief, prete a recevoir le materiau du sol vert — ou la photo aerienne :
 * ses `uv` couvrent `empriseSol`, u d'ouest en est, v du sud au nord, pour que la texture composee
 * par `peindreOrthoSurSol` tombe juste.
 */
export function geometrieSol(sol: SolRelief, bornes: Emprise, versLocal: VersLocal): THREE_NS.BufferGeometry {
  const { xs, ys } = sommetsDuSol(sol.relief, bornes);
  const a = empriseSol(sol.relief, bornes);
  return geometrieSurSol(xs, ys, sol, versLocal, 0, (x, y) => [(x - a.xMin) / (a.xMax - a.xMin), (y - a.yMin) / (a.yMax - a.yMin)]);
}

// ---- La photo aerienne sur le sol en relief ------------------------------------------------------
//
// Avant : une dalle par tuile, subdivisee au metre et posee 4 mm au-dessus du sol. Deux maillages
// du meme terrain qui ne l'interpolent pas pareil — le sol en triangles sur la grille, la dalle en
// bilineaire au metre — se croisent de quelques centimetres entre les sommets, et la photo passait
// sous le sol vert par taches. Aucun decalage ni `polygonOffset` ne corrige un croisement de
// geometries. Desormais la photo est PEINTE sur le maillage du sol : les tuiles composees en une
// texture, posee sur son materiau. Une seule surface, rien ne peut passer dessous.

/**
 * La taille de la texture du sol : la densite des tuiles, en puissances de deux (toute carte
 * graphique les accepte), `TEXTURE_SOL_MAX_PX` au plus par cote.
 */
export function tailleTextureSol(emprise: Emprise, pxParMetre: number, max = TEXTURE_SOL_MAX_PX): { largeur: number; hauteur: number } {
  const pot = (n: number) => Math.min(max, Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, n)))));
  return { largeur: pot((emprise.xMax - emprise.xMin) * pxParMetre), hauteur: pot((emprise.yMax - emprise.yMin) * pxParMetre) };
}

/** Une decoupe : la part de la tuile a peindre (fractions de son image) et ou la poser (pixels de la texture). */
export interface DecoupeTuile {
  tuile: TuileOrtho;
  /** x, y, largeur, hauteur, en fractions de l'image de la tuile, le haut etant le nord. */
  source: [number, number, number, number];
  /** x, y, largeur, hauteur, en pixels de la texture, le haut etant le nord. */
  destination: [number, number, number, number];
}

/**
 * Ou chaque tuile se peint sur la texture du sol : coupee au calque (`bornes`, la photo ne va pas
 * au-dela), placee dans l'emprise du maillage (`emprise`). Pure : le dessin est dans
 * `peindreOrthoSurSol`, et c'est ceci que les tests eprouvent.
 */
export function decoupesTuiles(tuiles: readonly TuileOrtho[], bornes: Emprise, emprise: Emprise, taille: { largeur: number; hauteur: number }): DecoupeTuile[] {
  const sx = taille.largeur / (emprise.xMax - emprise.xMin), sy = taille.hauteur / (emprise.yMax - emprise.yMin);
  const out: DecoupeTuile[] = [];
  for (const t of tuiles) {
    if (!t.dataUri || t.largeur <= 0 || t.hauteur <= 0) continue;
    const c = intersectionEmprises({ xMin: t.xMin, xMax: t.xMin + t.largeur, yMin: t.yMin, yMax: t.yMin + t.hauteur }, bornes);
    if (!c) continue;
    out.push({
      tuile: t,
      source: [(c.xMin - t.xMin) / t.largeur, (t.yMin + t.hauteur - c.yMax) / t.hauteur, (c.xMax - c.xMin) / t.largeur, (c.yMax - c.yMin) / t.hauteur],
      destination: [(c.xMin - emprise.xMin) * sx, (emprise.yMax - c.yMax) * sy, (c.xMax - c.xMin) * sx, (c.yMax - c.yMin) * sy]
    });
  }
  return out;
}

/**
 * Peint la photo aerienne sur le sol en relief : la texture part du vert du sol (ce que la photo ne
 * couvre pas le reste), chaque tuile s'y dessine quand son image est decodee, et le materiau du sol
 * la porte — son vert passe au blanc pour ne pas teinter la photo. La boucle de rendu est continue
 * (three/scene.ts) : une tuile peinte tard se voit a l'image suivante. Rend `false` sans canvas 2D
 * (jsdom) : le sol reste vert, et rien d'autre ne change.
 */
export function peindreOrthoSurSol(tuiles: readonly TuileOrtho[], bornes: Emprise, r: Relief, mat: THREE_NS.MeshStandardMaterial): boolean {
  const premiere = tuiles.find(t => !!t.dataUri && t.largeur > 0);
  if (!premiere) return false;
  const emprise = empriseSol(r, bornes);
  const taille = tailleTextureSol(emprise, PX_PAR_TUILE / premiere.largeur);
  const canvas = document.createElement('canvas');
  canvas.width = taille.largeur;
  canvas.height = taille.hauteur;
  const g = canvas.getContext('2d');
  if (!g) return false;
  g.fillStyle = '#' + mat.color.getHexString();
  g.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  // Meme garde-fou que les dalles plates (three/scene.ts) : `colorSpace` n'existe qu'a partir de la r152.
  const troisFutur = THREE as typeof THREE & { SRGBColorSpace?: unknown };
  if (troisFutur.SRGBColorSpace) (tex as typeof tex & { colorSpace?: unknown }).colorSpace = troisFutur.SRGBColorSpace;
  mat.map = tex;
  mat.color.set(0xffffff);
  mat.needsUpdate = true;
  for (const d of decoupesTuiles(tuiles, bornes, emprise, taille)) {
    const img = new Image();
    img.onload = () => {
      const [fx, fy, fw, fh] = d.source, [dx, dy, dw, dh] = d.destination;
      g.drawImage(img, fx * img.naturalWidth, fy * img.naturalHeight, fw * img.naturalWidth, fh * img.naturalHeight, dx, dy, dw, dh);
      tex.needsUpdate = true;
    };
    img.src = d.tuile.dataUri as string;
  }
  return true;
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
