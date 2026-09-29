// Les briques de la scene 3D (three/) : un prisme extrude depuis une emprise du plan, un ruban au
// sol, une piece de bois coupee a son contour, une bande mitree, une vis, un plot.
//
// Chacune pose ses meshes dans la scene qu'on lui donne, en passant par `versLocal` : le plan est en
// metres, Y vers le nord ; la 3D en metres, Y vers le HAUT et Z vers le sud. Les courbes et rubans
// des chemins sont calcules en coordonnees du plan, sans Three, et vivent ici a cote.

import { dist } from '../geometry/basic.js';
import { sommetDe } from '../geometry/anneau.js';
import { lineLineIntersect } from '../geometry/segments.js';
import { empriseLame } from '../engine/lames.js';
import { METRES_PAR_CARREAU } from './chargeurs.js';
import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';

/**
 * Une couleur telle que Three.js l'accepte a la r128 : un nom ou un hexadecimal CSS venant du plan
 * (`o.fill`), ou un entier 0xRRGGBB ecrit ici pour les pieces de structure.
 */

/**
 * Les couches posees a plat au sol, de la plus basse a la plus haute. Le sol vert (0), le terrain, le
 * fond orthophoto, les chemins non sureleves sont a quelques millimetres les uns des autres : vue de
 * quelques dizaines de metres, la precision du tampon de profondeur (plan proche a 5 cm) ne les
 * separe plus, et deux couches voisines se disputent chaque pixel - le scintillement du fond
 * orthophoto avec le socle du terrain. Un decalage de polygone par couche fixe leur ordre quelle que
 * soit la distance ; les hauteurs restent, pour les ombres et pour l'export GLB.
 */
export const COUCHES_SOL = { terrain: 1, ortho: 2, chemin: 3, surMur: 2 } as const;

/** Range un materiau dans sa couche : il gagne le test de profondeur contre les couches plus basses. */
export function poserEnCouche(mat: THREE_NS.Material, couche: number): void {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -couche;
  mat.polygonOffsetUnits = -4 * couche;
}

export type CouleurTrois = string | number;

/** Un anneau mitre produit par `engine/layers.ts` : deux polygones paralleles. */
export interface AnneauMitre { ext: PtBrut[]; int: PtBrut[] }

/**
 * Les deux textures d'un objet : le dessus qu'on voit a plat, et les faces verticales.
 *
 * `unknown` pour chacune : la forme complete de l'enregistrement Poly Haven appartient au selecteur
 * de texture ; la 3D n'en lit que l'URL, par `urlTexture`.
 */
export interface TexturesObjet { horizontale?: unknown; vertical?: unknown }

/** L'URL d'une texture, si elle en a une. */
export function urlTexture(ref: unknown): string | undefined {
  const r = ref as { url?: string } | null | undefined;
  return r && r.url ? r.url : undefined;
}

/**
 * Un materiau translucide si l'objet l'est dans le plan : jamais sous 0,15, sinon l'objet
 * disparaitrait de la vue qu'on ouvre pour le voir.
 */
export function appliquerOpacite(mat: THREE_NS.Material, opacite: number | undefined): void {
  if (opacite !== undefined && opacite < 1) { mat.transparent = true; mat.opacity = Math.max(0.15, opacite); }
}

/** Un point du plan dans le repere de la scene, centre sur `cen`. */
export type VersLocal = (p: PtBrut) => { x: number; z: number };

/**
 * Three.js est en Y-haut : X=Est reste X, hauteur devient Y, donc le plan (Est,Nord) se loge sur
 * (X,Z). Est x Nord = Haut, alors que X x Y = Z en Three.js : caser Nord tel quel sur Z inverserait
 * le repere (scene vue en miroir). Nord porte donc sur -Z, et Z = Sud.
 */
export function versLocalDepuis(cen: PtBrut): VersLocal {
  return (p) => ({ x: p.x - cen.x, z: cen.y - p.y });
}

// Meme algorithme que pathD (Catmull-Rom -> Bezier cubique, cf. rendu 2D du plan) mais evalue
// directement en coordonnees plan : c'est la MEME courbe, echantillonnee en une polyligne dense.
// Sans ca, un chemin en mode courbe se rendrait en 3D comme la ligne brisee de ses points.
export function courbePolyligne(pts: PtBrut[], curve?: boolean, segsParTroncon = 12): PtBrut[] {
  const premier = pts[0];
  if (pts.length < 3 || !curve || !premier) return pts.slice();
  const borne = (i: number) => sommetDe(pts, Math.max(0, Math.min(pts.length - 1, i)));
  const out: PtBrut[] = [premier];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = borne(i - 1), p1 = borne(i), p2 = borne(i + 1), p3 = borne(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let k = 1; k <= segsParTroncon; k++) {
      const t = k / segsParTroncon, mt = 1 - t;
      out.push({
        x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
        y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y
      });
    }
  }
  return out;
}

// Un chemin est une largeur reelle, pas un trait : chaque bord est decale perpendiculairement au
// trace d'une demi-largeur. Aux sommets interieurs les deux bords adjacents sont mitres par
// intersection ; aux extremites, un seul segment voisin, un simple decalage suffit.
export function ribbonChemin(pts: PtBrut[], largeur: number): PtBrut[] | null {
  const n = pts.length;
  if (n < 2 || !(largeur > 0)) return null;
  const demi = largeur / 2;
  const segs = pts.slice(0, -1).map((a, i) => {
    const b = sommetDe(pts, i + 1);
    const ex = b.x - a.x, ey = b.y - a.y; const L = Math.hypot(ex, ey) || 1;
    return { ux: ex / L, uy: ey / L, nx: -ey / L, ny: ex / L };
  });
  const seg = (i: number) => sommetDe(segs, i);
  function bord(p: PtBrut, i: number, sens: number): PtBrut {
    if (i === 0) return { x: p.x + seg(0).nx * demi * sens, y: p.y + seg(0).ny * demi * sens };
    if (i === n - 1) return { x: p.x + seg(n - 2).nx * demi * sens, y: p.y + seg(n - 2).ny * demi * sens };
    const s1 = seg(i - 1), s2 = seg(i);
    const o1 = { x: p.x + s1.nx * demi * sens, y: p.y + s1.ny * demi * sens };
    const o2 = { x: p.x + s2.nx * demi * sens, y: p.y + s2.ny * demi * sens };
    const inter = lineLineIntersect(o1, { x: s1.ux, y: s1.uy }, o2, { x: s2.ux, y: s2.uy });
    // Un virage tres serre pousse le mitre tres loin : au-dela d'une distance raisonnable on
    // retombe sur un simple biseau (moyenne des deux bords), qui reste proche du trace.
    if (!inter || dist(inter, p) > demi * 4) return { x: (o1.x + o2.x) / 2, y: (o1.y + o2.y) / 2 };
    return inter;
  }
  const gauche = pts.map((p, i) => bord(p, i, 1));
  const droite = pts.map((p, i) => bord(p, i, -1));
  return gauche.concat(droite.reverse());
}

// Approxime un cercle du plan par un polygone regulier, au RAYON REEL (contrairement a
// empriseEquipement qui grossit au rayon circonscrit pour une zone de charge) : c'est un rendu.
export function cerclePoly(center: PtBrut, r: number, n = 28): PtBrut[] {
  return Array.from({ length: n }, (_, i) => {
    const a = 2 * Math.PI * i / n;
    return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  });
}

/**
 * Les UV des faces laterales d'un prisme : la distance cumulee le long du perimetre, en metres.
 * Le generateur par defaut de Three choisit x ou y selon l'orientation de chaque face, ce qui
 * replie la texture sur elle-meme des qu'un contour est courbe ou oblique.
 */
function uvDeroule(pts2d: { x: number; y: number }[]) {
  const distAcc: number[] = [];
  pts2d.forEach((p, i) => { const prec = pts2d[i - 1]; distAcc.push(prec ? (distAcc[i - 1] ?? 0) + dist(prec, p) : 0); });
  const distDe = (x: number, y: number) => {
    let meilleur = 0, meilleurEcart = Infinity;
    pts2d.forEach((p, i) => {
      const e = Math.abs(p.x - x) + Math.abs(p.y - y);
      if (e < meilleurEcart) { meilleurEcart = e; meilleur = distAcc[i] ?? 0; }
    });
    return meilleur;
  };
  // `vertices` est le tableau plat de la geometrie : x, y, z par sommet, tous presents.
  const v = (vertices: number[], i: number) => vertices[i] ?? 0;
  return {
    generateTopUV: (_g: THREE_NS.ExtrudeGeometry, vertices: number[], a: number, b: number, c: number) =>
      [a, b, c].map(idx => new THREE.Vector2(v(vertices, idx * 3), v(vertices, idx * 3 + 1))),
    generateSideWallUV: (_g: THREE_NS.ExtrudeGeometry, vertices: number[], a: number, b: number, c: number, d: number) =>
      [a, b, c, d].map(idx => new THREE.Vector2(distDe(v(vertices, idx * 3), v(vertices, idx * 3 + 1)), 1 - v(vertices, idx * 3 + 2)))
  };
}

/** Ce que les briques demandent : la scene, le repere, et le chargeur de textures partagees. */
export interface ContextePrimitives {
  scene: THREE_NS.Scene;
  versLocal: VersLocal;
  chargerTexture: (url: string, repetition?: number) => THREE_NS.Texture;
}

export function creerPrimitives({ scene, versLocal, chargerTexture }: ContextePrimitives) {
  // Extrude une emprise du plan vers le haut. ExtrudeGeometry construit en XY et pousse selon +Z :
  // la forme est posee en (x, -z) puis tournee d'un quart de tour autour de X. Non biseautee, elle
  // construit TOUJOURS le groupe 0 = les deux capuchons (horizontaux apres la rotation) puis le
  // groupe 1 = les faces laterales (verticales) — d'ou le tableau de materiaux dans cet ordre.
  // `opacity` : undefined pour les pieces de la terrasse (toujours pleines).
  function addPrism(footprint: PtBrut[] | null | undefined, yBase: number, height: number, color: CouleurTrois, filaire?: boolean, opacity?: number, textures?: TexturesObjet | null): void {
    if (!footprint || footprint.length < 3 || height <= 0) return;
    const pts2d = footprint.map(p => { const l = versLocal(p); return { x: l.x, y: -l.z }; });
    const shape = new THREE.Shape();
    pts2d.forEach((p, i) => { if (i === 0) shape.moveTo(p.x, p.y); else shape.lineTo(p.x, p.y); });
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, UVGenerator: uvDeroule(pts2d) });
    geo.rotateX(-Math.PI / 2);
    let objet;
    if (filaire) {
      // EdgesGeometry ne garde que les aretes de silhouette ; un materiau wireframe montrerait
      // aussi la triangulation, une bouillie de diagonales sur une soixantaine de lames.
      objet = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
    } else {
      const faire = (texRef: unknown) => {
        const mat = new THREE.MeshStandardMaterial({ color });
        appliquerOpacite(mat, opacity);
        const urlTex = urlTexture(texRef);
        // Les UV valent des metres reels : la repetition posee par le chargeur cale une image sur
        // METRES_PAR_CARREAU m quelle que soit la taille de l'objet — c'est ce qui permet le partage.
        if (urlTex) mat.map = chargerTexture(urlTex, 1 / METRES_PAR_CARREAU);
        return mat;
      };
      objet = textures && (textures.horizontale || textures.vertical)
        ? new THREE.Mesh(geo, [faire(textures.horizontale), faire(textures.vertical)])
        : new THREE.Mesh(geo, faire(null));
    }
    objet.position.y = yBase;
    scene.add(objet);
  }

  // Silhouette au sol : sert pour la parcelle (jamais un bloc plein).
  function addGroundOutline(pts: PtBrut[] | null | undefined, color: CouleurTrois, closed?: boolean): void {
    if (!pts || pts.length < 2) return;
    const vpts = pts.map(p => { const l = versLocal(p); return new THREE.Vector3(l.x, 0.008, l.z); });
    const premier = vpts[0];
    if (closed && premier) vpts.push(premier.clone());
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vpts), new THREE.LineBasicMaterial({ color })));
  }

  // Ruban plat au sol (chemin non sureleve, le cas courant) : une forme remplie, sans extrusion,
  // posee legerement au-dessus du sol, et rangee dans sa couche (`couche`, voir COUCHES_SOL) : quelques
  // millimetres ne suffisent pas a eviter le scintillement vu de loin.
  function addRibbonFlat(poly: PtBrut[] | null | undefined, color: CouleurTrois, yLevel: number, opacity?: number, texRef?: unknown, couche?: number): void {
    if (!poly || poly.length < 3) return;
    const shape = new THREE.Shape();
    poly.forEach((q, i) => { const p = versLocal(q); if (i === 0) shape.moveTo(p.x, -p.z); else shape.lineTo(p.x, -p.z); });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
    appliquerOpacite(mat, opacity);
    const urlTex = urlTexture(texRef);
    // ShapeGeometry pousse les coordonnees locales brutes (des metres) comme UV : meme echelle.
    if (urlTex) mat.map = chargerTexture(urlTex, 1 / METRES_PAR_CARREAU);
    if (couche) poserEnCouche(mat, couche);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = yLevel;
    scene.add(mesh);
  }

  // Une piece de bois, coupee au contour dans lequel elle s'arrete plutot qu'a 90 degres.
  function addBeam(a: PtBrut, b: PtBrut, yBase: number, sectionH: number, sectionW: number, color: CouleurTrois, poly: PtBrut[] | null | undefined, filaire?: boolean, textures?: TexturesObjet | null): void {
    if (dist(a, b) < 0.02) return;
    addPrism(empriseLame(a, b, sectionW, poly), yBase, sectionH, color, filaire, undefined, textures);
  }

  // Une bande perimetrale mitree : chaque cote devient le quadrilatere entre les deux anneaux, et les
  // coins se rejoignent sur la ligne d'onglet au lieu de deux bouts carres qui se chevauchent.
  function addBande(bande: AnneauMitre | null | undefined, yBase: number, height: number, color: CouleurTrois, textures?: TexturesObjet | null): void {
    if (!bande || !bande.ext || !bande.int) return;
    const n = Math.min(bande.ext.length, bande.int.length);
    const ext = bande.ext.slice(0, n), int = bande.int.slice(0, n);
    ext.forEach((e, i) => {
      addPrism([e, sommetDe(ext, i + 1), sommetDe(int, i + 1), sommetDe(int, i)], yBase, height, color, false, undefined, textures);
    });
  }

  // Une vis se dessine SOUS le plan de sol, puisque c'est la qu'elle est. Seule sa tete reglable,
  // quand on la fait depasser, monte au-dessus du sol et porte la structure.
  function addPost(p: PtBrut, profondeur: number, hTete: number, radius: number, color: CouleurTrois): void {
    const P = versLocal(p);
    if (profondeur > 0) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.5, profondeur, 10), new THREE.MeshStandardMaterial({ color }));
      mesh.position.set(P.x, -profondeur / 2, P.z);
      scene.add(mesh);
    }
    if (hTete > 0) {
      const fut = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, hTete, 10), new THREE.MeshStandardMaterial({ color: 0xb8c2ce }));
      fut.position.set(P.x, hTete / 2, P.z);
      scene.add(fut);
      // La platine qui recoit la solive, plaquee sous le dessous de la structure.
      const ep = Math.min(0.012, hTete * 0.35);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(radius * 3.4, ep, radius * 3.4), new THREE.MeshStandardMaterial({ color: 0x8a96a8 }));
      pl.position.set(P.x, hTete - ep / 2, P.z);
      scene.add(pl);
    }
  }

  // Un plot : base large evasee posee sur l'assise, fut etroit, tete plate sous la lambourde. La
  // base porte la surface d'assise reglee dans Construction, en cm².
  function addPlot(p: PtBrut, yTop: number, color: CouleurTrois, surfaceAssiseCm2: number): void {
    const P = versLocal(p);
    if (yTop <= 0) return;
    const rBase = Math.sqrt(surfaceAssiseCm2 / Math.PI) / 100;
    const hBase = Math.min(0.03, yTop * 0.3);
    const hTete = Math.min(0.02, yTop * 0.2);
    const mat = new THREE.MeshStandardMaterial({ color });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rBase * 0.72, rBase, hBase, 14), mat);
    base.position.set(P.x, hBase / 2, P.z); scene.add(base);
    const futH = Math.max(0.005, yTop - hBase - hTete);
    const fut = new THREE.Mesh(new THREE.CylinderGeometry(rBase * 0.3, rBase * 0.34, futH, 12), mat);
    fut.position.set(P.x, hBase + futH / 2, P.z); scene.add(fut);
    const tete = new THREE.Mesh(new THREE.CylinderGeometry(rBase * 0.55, rBase * 0.55, hTete, 14), mat);
    tete.position.set(P.x, yTop - hTete / 2, P.z); scene.add(tete);
  }

  return { addPrism, addGroundOutline, addRibbonFlat, addBeam, addBande, addPost, addPlot };
}

export type Primitives = ReturnType<typeof creerPrimitives>;
