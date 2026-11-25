// Les rues dessinees en Vue 3D : l'option « Rues » du menu Affichage (MD/spec-rues.md §7, three/).
//
// Les memes chaussees que le plan (render/chaussees.ts), posees sur le sol : chaque troncon devient le ruban drape des chemins
// (`geometrieRubanDrape`), recoupe en mailles de `PAS_CHAUSSEE_M` pour suivre la pente, chaque sommet a la hauteur du sol sous lui
// (le meme lecteur que la scene, `SolRelief.hauteur`) plus `DECALAGE_CHAUSSEE_M`. Un disque ferme chaque bout de troncon : a un
// carrefour, les rubans se rejoignent sans encoche. Tout tient en une maille, un materiau mat a la couleur du jeton `--chaussee`,
// rangee dans la couche des chemins (COUCHES_SOL) : elle gagne le test de profondeur contre le sol, la photo et le Plan IGN.
//
// Elle ne porte pas d'ombre (elle en recoit) et ne part pas dans l'export GLB : comme le fond, c'est un repere a l'ecran.

import { decouper } from '../model/rues.js';
import { JETONS } from '../styles/jetons.js';
import { geometrieRubanDrape, poserEnCouche, percerSol, COUCHES_SOL, SANS_OMBRE, HORS_EXPORT, type VersLocal } from './primitives.js';
import type * as THREE_NS from 'three';
import type { ChausseeRue, PtBrut } from '../model/types.js';
import type { Emprise } from '../model/relief.js';

export const NOM_CHAUSSEES_3D = 'rues-chaussees';
/** La hauteur du ruban au-dessus du sol : entre deux sommets du maillage du sol, le relief est plan, le ruban doit rester dessus. */
export const DECALAGE_CHAUSSEE_M = 0.06;
/** La plus grande maille du ruban, en long comme en travers : assez fine pour suivre le relief, assez large pour un quartier. */
export const PAS_CHAUSSEE_M = 2;
/** Ce que la couleur du jeton perd en 3D, pour paraitre a l'ecran celle du plan une fois eclairee. */
export const ATTENUATION_3D = 0.8;
/** Le nombre de cotes du disque qui ferme un bout de troncon. */
const COTES_BOUT = 12;

/** La couleur des chaussees : le jeton `--chaussee` de la page (la palette de l'admin comprise). */
export function couleurChaussee(): string {
  const sombre = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const lue = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--chaussee').trim() : '';
  return lue || JETONS[sombre ? 'sombre' : 'clair'].chaussee;
}

const dedans = (p: PtBrut, e: Emprise, marge: number) => p.x >= e.xMin + marge && p.x <= e.xMax - marge && p.y >= e.yMin + marge && p.y <= e.yMax - marge;

/** Les sommets (triangles a plat) du disque qui ferme un bout, chacun a la hauteur du sol sous lui. */
function disque(c: PtBrut, rayon: number, versLocal: VersLocal, sol: (p: PtBrut) => number, decalage: number, sortie: number[]): void {
  const sommet = (p: PtBrut) => { const l = versLocal(p); sortie.push(l.x, sol(p) + decalage, l.z); };
  const bord = (k: number): PtBrut => ({ x: c.x + rayon * Math.cos((2 * Math.PI * k) / COTES_BOUT), y: c.y + rayon * Math.sin((2 * Math.PI * k) / COTES_BOUT) });
  // Dans le sens trigonometrique du plan : la face regarde le ciel, comme celles du ruban drape.
  for (let k = 0; k < COTES_BOUT; k++) { sommet(c); sommet(bord(k)); sommet(bord(k + 1)); }
}

/**
 * La geometrie des chaussees : un ruban drape par morceau de troncon dans `cadre` (le sol dessine : hors de lui, un ruban flotterait
 * dans le vide), et un disque a chaque bout d'origine qui y tient. `null` s'il n'y a rien a poser.
 */
export function geometrieChaussees(chaussees: readonly ChausseeRue[], versLocal: VersLocal, sol: (p: PtBrut) => number, cadre?: Emprise,
  decalage = DECALAGE_CHAUSSEE_M, pas = PAS_CHAUSSEE_M): THREE_NS.BufferGeometry | null {
  const positions: number[] = [];
  for (const c of chaussees) {
    if (c.pts.length < 2 || !(c.largeurM > 0)) continue;
    for (const morceau of cadre ? decouper(c.pts, cadre) : [c.pts]) {
      const geo = geometrieRubanDrape(morceau, c.largeurM, versLocal, sol, decalage, pas);
      if (!geo) continue;
      const pos = geo.getAttribute('position');
      for (let k = 0; k < pos.count; k++) positions.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      geo.dispose();
    }
    for (const bout of [c.pts[0], c.pts[c.pts.length - 1]]) {
      if (bout && (!cadre || dedans(bout, cadre, c.largeurM / 2))) disque(bout, c.largeurM / 2, versLocal, sol, decalage, positions);
    }
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Ce que la pose demande en plus des chaussees. */
export interface OptionsChaussees3d {
  /** Le sol en relief en un point du plan ; sans lui, le sol est a zero. */
  hauteurSol?: ((p: PtBrut) => number) | undefined;
  /** Le sol dessine, dans le repere du plan. */
  cadre?: Emprise | undefined;
  /** La couleur ; par defaut le jeton `--chaussee`. */
  couleur?: string;
}

/** Pose les chaussees dans `scene`, en une maille. Rend la maille, ou `null` s'il n'y avait rien a poser. */
export function ajouterChaussees3d(scene: THREE_NS.Object3D, versLocal: VersLocal, chaussees: readonly ChausseeRue[], options: OptionsChaussees3d = {}): THREE_NS.Mesh | null {
  const geo = geometrieChaussees(chaussees, versLocal, options.hauteurSol ?? (() => 0), options.cadre);
  if (!geo) return null;
  // Mat : ni brillance ni reflet, la couleur d'une carte posee sur le terrain, que le soleil eclaire comme le sol.
  const mat = new THREE.MeshStandardMaterial({ color: options.couleur ?? couleurChaussee(), roughness: 1, metalness: 0 });
  // Le soleil de la scene et sa courbe de film eclaircissent un sol mat face au ciel : l'ambre du plan y paraissait delave, presque
  // blanc sur le Plan IGN. Assombri d'autant, il se lit a l'ecran de la meme couleur que sur le plan.
  mat.color.multiplyScalar(ATTENUATION_3D);
  poserEnCouche(mat, COUCHES_SOL.chemin);
  percerSol(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = NOM_CHAUSSEES_3D;
  mesh.userData[SANS_OMBRE] = true;
  mesh.userData[HORS_EXPORT] = true;
  scene.add(mesh);
  return mesh;
}
