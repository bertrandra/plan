// Les cinq dessins du houppier d'un arbre en 3D (model/arbre.ts::StyleArbre), choisis pour tous les
// arbres du plan dans la section Arbre de l'inspecteur (maquettes comparees : MD/spec-arbres-3d.md §3.3).
//
// - A, « Lobes » : le dessin d'origine, un lobe central et des satellites, bruit tire sommet par
//   sommet. Il est garde tel quel, toupet compris, pour qui le preferait.
// - B, « Dome », le defaut : les memes lobes, aucun satellite au-dessus du houppier (model/arbre.ts::
//   sousLeHouppier), des spheres plus fines et un bruit continu : deux sommets au meme endroit (la
//   couture d'une sphere) ont le meme rayon, la couture ne s'ouvre plus.
// - C, « Touffes » : vingt a quarante petites touffes posees sur l'enveloppe du port, autour d'un
//   coeur sombre, fusionnees en une maille par arbre (un voisinage compte cinquante arbres).
// - D, « Taille » : trois a cinq volumes a facettes, sans lissage.
// - E, « Maquette d'architecte » : un volume lisse et uni, dans un vert doux tire de la couleur du
//   feuillage ; il ne vole pas la vedette au projet.
//
// Tous gardent l'emprise du houppier (son diametre) et sa hauteur : l'ombre sur la terrasse, qui est
// la raison de dessiner l'arbre, ne depend pas du dessin choisi.

import type * as THREE_NS from 'three';
import { tonDuSommet, hauteurHouppier, type Houppier, type Lobe, type PortArbre } from '../model/arbre.js';
import { tirage } from '../model/voisinage3d.js';

export type Rgb = [number, number, number];

/** Le gris-vert des maquettes, vers lequel le dessin E tire la couleur du feuillage. */
const VERT_MAQUETTE: Rgb = [0.62, 0.72, 0.56];
/** La part de ce vert dans la couleur d'un houppier E. */
const PART_MAQUETTE = 0.55;

/** Un bruit de valeur lisse, continu dans l'espace, dans [-1, 1], reproductible pour une graine. */
export function bruit3(x: number, y: number, z: number, graine: number): number {
  const h = (i: number, j: number, k: number) => {
    let n = (i * 374761393 + j * 668265263 + k * 2147483647 + graine * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w
  ) * 2 - 1;
}

/** Deforme une geometrie unite le long de ses rayons : chaque sommet multiplie par `f(x, y, z)`. */
function deformer(geo: THREE_NS.BufferGeometry, f: (x: number, y: number, z: number) => number): void {
  const p = (geo.attributes.position as THREE_NS.BufferAttribute).array as Float32Array;
  for (let i = 0; i < p.length; i += 3) {
    const k = f(p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0);
    p[i] = (p[i] ?? 0) * k; p[i + 1] = (p[i + 1] ?? 0) * k; p[i + 2] = (p[i + 2] ?? 0) * k;
  }
  (geo.attributes.position as THREE_NS.BufferAttribute).needsUpdate = true;
  geo.computeVertexNormals?.();
}

/** Les deux tons du feuillage, sommet par sommet (clair dessus, sombre dessous), a `k` pres. */
function colorer(geo: THREE_NS.BufferGeometry, base: Rgb, k = 1): void {
  const n = (geo.attributes.normal as THREE_NS.BufferAttribute).array as Float32Array;
  const c: number[] = [];
  for (let i = 0; i < n.length; i += 3) { const t = tonDuSommet(base, n[i + 1] ?? 0); c.push(Math.min(1, t[0] * k), Math.min(1, t[1] * k), Math.min(1, t[2] * k)); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
}

/** Une maille de lobe, posee et mise a l'echelle de son ellipsoide. */
function poserLobe(parent: THREE_NS.Object3D, geo: THREE_NS.BufferGeometry, mat: THREE_NS.Material, l: Pick<Lobe, 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz'>, nom: string): THREE_NS.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.name = nom;
  m.position.set(l.x, l.y, l.z);
  m.scale.set(l.rx, l.ry, l.rz);
  parent.add(m);
  return m;
}

/** A : les lobes d'origine, bruit tire sommet par sommet (BRUIT_LOBE), spheres de 14 x 10. */
export function lobesOrigine(parent: THREE_NS.Object3D, h: Houppier, port: PortArbre, base: Rgb, graine: number, mat: THREE_NS.Material, nom: string, bruit: number): void {
  if (port === 'conique') {
    const lobe = h.lobes[0];
    if (!lobe) return;
    const geo = new THREE.ConeGeometry(lobe.rx, lobe.ry * 2, 16, 1);
    bruitParSommet(geo, graine, bruit); colorer(geo, base);
    poserLobe(parent, geo, mat, { x: 0, y: lobe.y, z: 0, rx: 1, ry: 1, rz: 1 }, nom);
    return;
  }
  h.lobes.forEach((lobe, i) => {
    const geo = new THREE.SphereGeometry(1, 14, 10);
    bruitParSommet(geo, graine + i * 7919, bruit); colorer(geo, base);
    poserLobe(parent, geo, mat, lobe, nom);
  });
}

function bruitParSommet(geo: THREE_NS.BufferGeometry, graine: number, bruit: number): void {
  const alea = tirage(graine);
  const p = (geo.attributes.position as THREE_NS.BufferAttribute).array as Float32Array;
  for (let i = 0; i < p.length; i += 3) {
    const k = 1 + (alea() * 2 - 1) * bruit;
    p[i] = (p[i] ?? 0) * k; p[i + 1] = (p[i + 1] ?? 0) * k; p[i + 2] = (p[i + 2] ?? 0) * k;
  }
  (geo.attributes.position as THREE_NS.BufferAttribute).needsUpdate = true;
}

/** B : les lobes sans toupet (le houppier est tire `sansToupet`), plus fins, bruit continu. */
export function lobesDome(parent: THREE_NS.Object3D, h: Houppier, port: PortArbre, base: Rgb, graine: number, mat: THREE_NS.Material, nom: string): void {
  if (port === 'conique') { coneLisse(parent, h, base, graine, mat, nom, 24, 0.05); return; }
  h.lobes.forEach((lobe, i) => {
    const geo = new THREE.SphereGeometry(1, 22, 16);
    deformer(geo, (x, y, z) => 1 + bruit3(x * 2.2, y * 2.2, z * 2.2, graine + i) * 0.07);
    colorer(geo, base, 0.96 + (i % 3) * 0.03);
    poserLobe(parent, geo, mat, lobe, nom);
  });
}

function coneLisse(parent: THREE_NS.Object3D, h: Houppier, base: Rgb, graine: number, mat: THREE_NS.Material, nom: string, segments: number, bruit: number): void {
  const lobe = h.lobes[0];
  if (!lobe) return;
  const geo = new THREE.ConeGeometry(lobe.rx, lobe.ry * 2, segments, 4);
  if (bruit > 0) deformer(geo, (x, y, z) => 1 + bruit3(x * 2, y * 0.8, z * 2, graine) * bruit);
  colorer(geo, base);
  poserLobe(parent, geo, mat, { x: 0, y: lobe.y, z: 0, rx: 1, ry: 1, rz: 1 }, nom);
}

/**
 * C : des touffes sur l'enveloppe du port, autour d'un coeur plus sombre qui bouche les jours. Les
 * touffes sont fusionnees en une seule maille : un seul appel de dessin par arbre.
 */
export function touffes(parent: THREE_NS.Object3D, port: PortArbre, diametre: number, base: Rgb, graine: number, mat: THREE_NS.Material, nom: string): number {
  const H = hauteurHouppier(port, diametre), r = diametre / 2, alea = tirage(graine);
  const ex = port === 'conique' ? r * 0.7 : port === 'colonnaire' ? r * 0.9 : r * 0.92, ey = H / 2;
  const coeur = new THREE.SphereGeometry(1, 18, 12);
  colorer(coeur, base, 0.7);
  poserLobe(parent, coeur, mat, { x: 0, y: ey, z: 0, rx: ex * 0.8, ry: ey * 0.8, rz: ex * 0.8 }, nom);
  const n = Math.round(Math.min(46, 10 + 2.2 * (ex * ey + ex * ex)));
  const morceaux: { geo: THREE_NS.BufferGeometry; x: number; y: number; z: number; s: number; sy: number }[] = [];
  for (let i = 0; i < n; i++) {
    // Un point de l'enveloppe, plutot vers le haut et les cotes que dessous ; un cone s'affine en montant.
    const u = alea() * 2 * Math.PI, c = Math.max(-0.6, Math.min(1, 1 - Math.pow(alea(), 0.8) * 1.6)), s = Math.sqrt(Math.max(0, 1 - c * c));
    const rayonA = port === 'conique' ? ex * (1 - (c + 1) / 2) + 0.1 : ex;
    const x = Math.cos(u) * s * rayonA * 0.82, y = ey + c * ey * 0.82, z = Math.sin(u) * s * rayonA * 0.82;
    const rr = Math.max(0.12, ex * (0.3 + alea() * 0.14) * (port === 'conique' ? 0.6 : 1));
    const ry = rr * (port === 'parasol' ? 0.6 : port === 'etale' ? 0.75 : 0.9);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    deformer(geo, (a, b, d) => 1 + bruit3(a * 2.8, b * 2.8, d * 2.8, graine * 31 + i) * 0.12);
    colorer(geo, base, 0.9 + alea() * 0.2);
    morceaux.push({ geo, x, y, z, s: rr, sy: ry });
  }
  const m = new THREE.Mesh(fusionner(morceaux), mat);
  m.name = nom;
  parent.add(m);
  return n;
}

/** Les morceaux mis a l'echelle et poses, en une geometrie : positions, normales et couleurs. */
function fusionner(morceaux: readonly { geo: THREE_NS.BufferGeometry; x: number; y: number; z: number; s: number; sy: number }[]): THREE_NS.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (const mo of morceaux) {
    const base = pos.length / 3;
    const p = (mo.geo.attributes.position as THREE_NS.BufferAttribute).array as Float32Array;
    const n = (mo.geo.attributes.normal as THREE_NS.BufferAttribute).array as Float32Array;
    const c = (mo.geo.attributes.color as THREE_NS.BufferAttribute).array as ArrayLike<number>;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(mo.x + (p[i] ?? 0) * mo.s, mo.y + (p[i + 1] ?? 0) * mo.sy, mo.z + (p[i + 2] ?? 0) * mo.s);
      // La normale d'un ellipsoide etire : divisee par l'echelle de chaque axe, puis normee.
      const nx = (n[i] ?? 0) / mo.s, ny = (n[i + 1] ?? 0) / mo.sy, nz = (n[i + 2] ?? 0) / mo.s, l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      col.push(c[i] ?? 1, c[i + 1] ?? 1, c[i + 2] ?? 1);
    }
    const ind = mo.geo.index?.array as ArrayLike<number> | undefined;
    if (ind) for (let i = 0; i < ind.length; i++) idx.push(base + (ind[i] ?? 0));
    else for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
    mo.geo.dispose?.();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** D : le lobe central et quelques satellites, a facettes (sans lissage) ; un cone a sept faces. */
export function volumesTailles(parent: THREE_NS.Object3D, h: Houppier, port: PortArbre, base: Rgb, graine: number, mat: THREE_NS.Material, nom: string): void {
  if (port === 'conique') { coneLisse(parent, h, base, graine, mat, nom, 7, 0); return; }
  const central = h.lobes[0];
  if (!central) return;
  const garder = [central, ...h.lobes.slice(1).filter((_, i) => i % 2 === 0)].slice(0, port === 'colonnaire' ? 3 : 5);
  garder.forEach((lobe, i) => {
    const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    deformer(geo, (x, y, z) => 1 + bruit3(x * 1.7, y * 1.7, z * 1.7, graine + i * 13) * 0.1);
    colorer(geo, base, 0.95 + (i % 2) * 0.08);
    const m = poserLobe(parent, geo, mat, { ...lobe, rx: lobe.rx * 1.05, ry: lobe.ry * 1.02, rz: lobe.rz * 1.05 }, nom);
    m.rotation.y = i * 0.9;
  });
}

/** La couleur d'un houppier E : celle du feuillage, tiree vers le vert doux des maquettes. */
export function couleurMaquette(base: Rgb): Rgb {
  return [0, 1, 2].map((k) => (base[k] ?? 0) * (1 - PART_MAQUETTE) + (VERT_MAQUETTE[k] ?? 0) * PART_MAQUETTE) as Rgb;
}

/** E : un seul volume lisse, a peine bossele, uni ; un cone lisse pour un conifere. */
export function volumeArchitecte(parent: THREE_NS.Object3D, h: Houppier, port: PortArbre, diametre: number, base: Rgb, graine: number, mat: THREE_NS.Material, nom: string): void {
  const doux = couleurMaquette(base);
  if (port === 'conique') { coneLisse(parent, h, doux, graine, mat, nom, 32, 0); return; }
  const H = hauteurHouppier(port, diametre), r = diametre / 2;
  const rx = port === 'colonnaire' ? r * 0.85 : r * 0.95;
  const geo = new THREE.SphereGeometry(1, 40, 28);
  deformer(geo, (x, y, z) => 1 + bruit3(x * 1.3, y * 1.3, z * 1.3, graine) * 0.03);
  colorer(geo, doux);
  poserLobe(parent, geo, mat, { x: 0, y: H / 2, z: 0, rx, ry: H / 2, rz: rx }, nom);
}
