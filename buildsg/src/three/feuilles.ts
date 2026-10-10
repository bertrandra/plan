// Les feuilles d'un arbre, pour la vue de pres (MD/spec-arbres-3d.md §3.1).
//
// Le houppier en lobes (three/arbre3d.ts) se lit bien de loin ; de pres, c'est une boule. On pose
// sur sa surface quelques centaines de petites feuilles (model/arbre.ts::feuillesDuHouppier), en
// **une seule maille instanciee** par arbre : une feuille dessinee mille fois, chacune sa matrice
// et sa nuance. Elles ne s'affichent que lorsque la camera s'approche de l'arbre
// (`actualiserFeuillesProches`, a chaque image) : de loin elles ne changeraient rien a l'image.
//
// Elles ne portent pas d'ombre : l'ombre est celle des lobes, la meme quelle que soit la place de
// la camera - une ombre qui changerait quand on s'approche ne dirait plus rien de la terrasse.
//
// **L'export.** `GLTFExporter` de three r128 ne connait pas l'instanciation : il ecrirait une seule
// feuille par arbre. Le temps de l'export, `cuireFeuillesPourExport` remplace chaque maille
// instanciee par une maille ordinaire qui contient toutes ses feuilles, avec leurs couleurs par
// sommet ; la visionneuse et la realite augmentee les montrent donc aussi. Seuls les arbres proches
// du centre de la scene sont cuits, et le total est plafonne : un voisinage de soixante arbres ne
// doit pas faire un fichier de dix megaoctets.

import type * as THREE_NS from 'three';
import { tonDuSommet, type Feuillage, type Feuille } from '../model/arbre.js';
import { SANS_OMBRE } from './primitives.js';

export const NOM_FEUILLES = 'arbre-feuilles';
export const NOM_FEUILLES_CUITES = 'arbre-feuilles-cuites';
/** Les feuilles paraissent quand la camera est a moins de cette distance de l'arbre, en metres. */
export const DISTANCE_FEUILLES_M = 30;
/** Et disparaissent un peu plus loin : sans cette marge, elles clignoteraient a la limite. */
export const HYSTERESE_FEUILLES_M = 3;
/** A l'export, les arbres a moins de cette distance du centre de la scene gardent leurs feuilles. */
export const RAYON_FEUILLES_EXPORT_M = 40;
/** Et pas plus de feuilles en tout, les arbres les plus proches d'abord. */
export const MAX_FEUILLES_EXPORT = 12000;

/** Le decollement d'une feuille de la surface du houppier, en radians : sa pointe s'en ecarte. */
export const LEVEE_FEUILLE = 0.6;
/** Part du ton (clair dessus, sombre dessous) que garde une feuille : la lumiere fait deja le reste. */
const PART_DU_TON = 0.5;

/**
 * Une feuille d'echelle 1 : quatre sommets, la base a l'origine, la pointe vers +Y levee de
 * `LEVEE_FEUILLE` vers +Z (l'exterieur). Sa normale d'eclairage reste +Z, celle de la surface du
 * houppier : une feuille levee s'eclaire comme le houppier sous elle, au lieu de tourner sa face
 * vers le sol et de virer au noir.
 */
export interface Gabarit { positions: number[]; normales: number[]; index: number[] }

export function gabaritFeuille(forme: Feuillage['forme'], taille: number): Gabarit {
  const l = taille, w = forme === 'aiguille' ? 0.08 * l : 0.28 * l;
  const c = Math.cos(LEVEE_FEUILLE), s = Math.sin(LEVEE_FEUILLE);
  return {
    positions: [0, 0, 0, w, 0.45 * l * c, 0.45 * l * s, 0, l * c, l * s, -w, 0.45 * l * c, 0.45 * l * s],
    normales: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    index: [0, 1, 2, 0, 2, 3],
  };
}

type V3 = [number, number, number];
const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norme = (a: V3): V3 => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

/**
 * La matrice d'une feuille, en colonnes (l'ordre de `Matrix4.fromArray`) : son +Z sur la normale de
 * la surface, tournee de `spin` autour d'elle, inclinee de `inclinaison` en plus du decollement du
 * gabarit, a l'echelle.
 */
export function matriceFeuille(f: Feuille): number[] {
  const z0 = norme([f.nx, f.ny, f.nz]);
  const haut: V3 = Math.abs(z0[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const x0 = norme(croix(haut, z0));
  const y0 = croix(z0, x0);
  const cs = Math.cos(f.spin), ss = Math.sin(f.spin);
  const x: V3 = [x0[0] * cs + y0[0] * ss, x0[1] * cs + y0[1] * ss, x0[2] * cs + y0[2] * ss];
  const y1 = croix(z0, x);
  const ci = Math.cos(f.inclinaison), si = Math.sin(f.inclinaison);
  // L'inclinaison fait tourner la feuille autour de son axe x : sa pointe s'ecarte ou se rapproche.
  const y: V3 = [y1[0] * ci + z0[0] * si, y1[1] * ci + z0[1] * si, y1[2] * ci + z0[2] * si];
  const z: V3 = [z0[0] * ci - y1[0] * si, z0[1] * ci - y1[1] * si, z0[2] * ci - y1[2] * si];
  const e = f.echelle;
  return [x[0] * e, x[1] * e, x[2] * e, 0, y[0] * e, y[1] * e, y[2] * e, 0, z[0] * e, z[1] * e, z[2] * e, 0, f.x, f.y, f.z, 1];
}

/** La couleur d'une feuille : la moitie du ton de sa place sur le houppier, nuancee de la sienne. */
export function couleurFeuille(base: V3, f: Feuille): V3 {
  const t = tonDuSommet(base, f.ny);
  const c = (i: 0 | 1 | 2) => Math.min(1, (base[i] + (t[i] - base[i]) * PART_DU_TON) * f.teinte);
  return [c(0), c(1), c(2)];
}

/** Toutes les feuilles dans une seule geometrie : chaque gabarit transforme par sa matrice, colore de sa couleur. */
export function cuire(g: Gabarit, matrices: readonly number[][], couleurs: readonly V3[]): { positions: Float32Array; normales: Float32Array; couleurs: Float32Array; index: Uint32Array } {
  const nv = g.positions.length / 3;
  const positions = new Float32Array(matrices.length * nv * 3);
  const normales = new Float32Array(matrices.length * nv * 3);
  const cols = new Float32Array(matrices.length * nv * 3);
  const index = new Uint32Array(matrices.length * g.index.length);
  matrices.forEach((m, k) => {
    // La normale du gabarit est +Z : transformee, c'est la troisieme colonne, normee.
    const n = norme([m[8] ?? 0, m[9] ?? 0, m[10] ?? 1]);
    const c = couleurs[k] ?? [1, 1, 1];
    for (let v = 0; v < nv; v++) {
      const px = g.positions[v * 3] ?? 0, py = g.positions[v * 3 + 1] ?? 0, pz = g.positions[v * 3 + 2] ?? 0;
      const o = (k * nv + v) * 3;
      positions[o] = (m[0] ?? 0) * px + (m[4] ?? 0) * py + (m[8] ?? 0) * pz + (m[12] ?? 0);
      positions[o + 1] = (m[1] ?? 0) * px + (m[5] ?? 0) * py + (m[9] ?? 0) * pz + (m[13] ?? 0);
      positions[o + 2] = (m[2] ?? 0) * px + (m[6] ?? 0) * py + (m[10] ?? 0) * pz + (m[14] ?? 0);
      normales.set(n, o);
      cols.set(c, o);
    }
    g.index.forEach((i, j) => { index[k * g.index.length + j] = i + k * nv; });
  });
  return { positions, normales, couleurs: cols, index };
}

/** Ce qu'une maille de feuilles garde pour etre cuite a l'export sans relire le GPU. */
interface DonneesFeuilles { gabarit: Gabarit; matrices: number[][]; couleurs: V3[] }

// Hors de `userData` : l'exporteur glTF ecrit le `userData` de chaque objet dans le fichier (extras),
// et des milliers de matrices y feraient deux megaoctets de JSON.
const donnees = new WeakMap<THREE_NS.Object3D, DonneesFeuilles>();
const listes = new WeakMap<THREE_NS.Object3D, THREE_NS.Object3D[]>();

/**
 * Pose les feuilles d'un arbre dans son groupe de feuillage, cachees jusqu'a ce que la camera
 * approche. Rend la maille, ou null sans feuille.
 */
export function ajouterFeuilles(feuillage: THREE_NS.Object3D, f: Feuillage, base: V3): THREE_NS.InstancedMesh | null {
  if (!f.feuilles.length) return null;
  const gabarit = gabaritFeuille(f.forme, f.taille);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(gabarit.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(gabarit.normales, 3));
  geo.setIndex(gabarit.index);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, f.feuilles.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const matrices: number[][] = [], couleurs: V3[] = [];
  f.feuilles.forEach((fe, i) => {
    const m = matriceFeuille(fe);
    const c = couleurFeuille(base, fe);
    matrices.push(m); couleurs.push(c);
    mesh.setMatrixAt(i, m4.fromArray(m));
    mesh.setColorAt(i, col.setRGB(c[0], c[1], c[2]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = NOM_FEUILLES;
  // Three borne une maille instanciee par sa seule geometrie (une feuille a l'origine) : elle
  // serait ecartee des que ce point sort du champ, le reste de l'arbre encore a l'ecran.
  mesh.frustumCulled = false;
  mesh.userData[SANS_OMBRE] = true;
  donnees.set(mesh, { gabarit, matrices, couleurs });
  mesh.visible = false;
  feuillage.add(mesh);
  return mesh;
}

/** Les mailles de feuilles d'une scene, relevees une fois : les arbres sont poses avant la premiere image. */
function maillesDeFeuilles(scene: THREE_NS.Object3D): THREE_NS.Object3D[] {
  const deja = listes.get(scene);
  if (deja) return deja;
  const liste: THREE_NS.Object3D[] = [];
  scene.traverse((o) => { if (o.name === NOM_FEUILLES) liste.push(o); });
  listes.set(scene, liste);
  return liste;
}

/** Montre les feuilles des arbres proches de la camera, cache les autres. Rend le nombre de bascules. */
export function actualiserFeuillesProches(scene: THREE_NS.Object3D, camera: { position: { x: number; y: number; z: number } }): number {
  let bascules = 0;
  const p = new THREE.Vector3();
  for (const m of maillesDeFeuilles(scene)) {
    (m.parent ?? m).getWorldPosition(p);
    const d = Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z);
    const voir = m.visible ? d < DISTANCE_FEUILLES_M + HYSTERESE_FEUILLES_M : d < DISTANCE_FEUILLES_M;
    if (voir !== m.visible) { m.visible = voir; bascules++; }
  }
  return bascules;
}

/**
 * Le temps de l'export : chaque maille de feuilles d'un arbre en feuilles (pas un caduc l'hiver),
 * proche du centre, devient une maille ordinaire. Rend le nombre de feuilles cuites et de quoi tout
 * remettre (appelable plusieurs fois).
 */
export function cuireFeuillesPourExport(scene: THREE_NS.Object3D): { nombre: number; remettre: () => void } {
  const candidates: { m: THREE_NS.Object3D; d: number }[] = [];
  const p = new THREE.Vector3();
  scene.traverse((o) => {
    if (o.name !== NOM_FEUILLES || !donnees.has(o)) return;
    if (o.parent && !o.parent.visible) return;
    o.getWorldPosition(p);
    const d = Math.hypot(p.x, p.z);
    if (d <= RAYON_FEUILLES_EXPORT_M) candidates.push({ m: o, d });
  });
  candidates.sort((a, b) => a.d - b.d);
  const cuites: THREE_NS.Mesh[] = [];
  const etats: [THREE_NS.Object3D, boolean][] = [];
  let nombre = 0;
  for (const { m } of candidates) {
    const d = donnees.get(m);
    if (!d) continue;
    if (nombre + d.matrices.length > MAX_FEUILLES_EXPORT) break;
    const c = cuire(d.gabarit, d.matrices, d.couleurs);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(c.normales, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c.couleurs, 3));
    geo.setIndex(new THREE.BufferAttribute(c.index, 1));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
    mesh.name = NOM_FEUILLES_CUITES;
    mesh.position.copy(m.position);
    m.parent?.add(mesh);
    cuites.push(mesh);
    etats.push([m, m.visible]);
    m.visible = false;
    nombre += d.matrices.length;
  }
  let fait = false;
  return {
    nombre,
    remettre: () => {
      if (fait) return;
      fait = true;
      cuites.forEach((c) => { c.parent?.remove(c); c.geometry.dispose(); (c.material as THREE_NS.Material).dispose(); });
      etats.forEach(([m, v]) => { m.visible = v; });
    },
  };
}
