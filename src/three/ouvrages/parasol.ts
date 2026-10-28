// Le parasol dans la scene 3D : un mat et une toile, pas un volume (MD/spec-ouvrages.md, etape 6.6 : un module 3D par ouvrage).

import { vue3d } from '../etat3d.js';
import { hauteurParasolDe } from '../../engine/parasol.js';
import { urlTexture, appliquerOpacite } from '../primitives.js';
import type { ObjetCercle } from '../../model/types.js';
import type { ContexteObjets } from '../typesScene.js';
import { groupeAuSol, opaciteDe } from './pose.js';

/**
 * Un parasol n'est pas un volume plein : un mat fin porte une toile a sa hauteur. L'extruder en
 * ferait un cylindre opaque de 3 m au milieu de la terrasse — exactement ce qu'on ne veut pas voir
 * quand on juge son implantation. Le mat se dresse a SA position (le bord de toile pour un
 * deporte) ; la toile reste centree.
 */
export function ajouterParasol(par: ObjetCercle, co: ContexteObjets): void {
  const { versLocal, ctx } = co;
  // Le mat et la toile comptent leurs hauteurs depuis le sol au pied du mat.
  const scene = groupeAuSol(co.scene, co.sol, ctx.positionMat(par));
  const hMat = hauteurParasolDe(par);
  const pl = versLocal(par.center);
  const plMat = versLocal(ctx.positionMat(par));
  const matMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44 });
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hMat, 10), matMat);
  mat.position.set(plMat.x, hMat / 2, plMat.z);
  scene.add(mat);
  if (par.parasol?.matDeporte) {
    // Le bras horizontal qui rattrape le deport, sinon la toile flotte sans lien visible.
    const dx = pl.x - plMat.x, dz = pl.z - plMat.z;
    const L = Math.hypot(dx, dz);
    if (L > 0.01) {
      const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 8), matMat);
      bras.position.set((pl.x + plMat.x) / 2, hMat, (pl.z + plMat.z) / 2);
      bras.rotation.z = Math.PI / 2;
      bras.rotation.y = -Math.atan2(dz, dx);
      scene.add(bras);
    }
  }
  const matToile = new THREE.MeshStandardMaterial({ color: par.fill || '#7a9e6b', side: THREE.DoubleSide });
  appliquerOpacite(matToile, opaciteDe(par));
  const urlToile = urlTexture(vue3d.textures ? (par.textureHorizontale || par.textureVerticale) : null);
  if (urlToile) matToile.map = ctx.chargerTexturePolyhaven(urlToile);
  // Cone tres plat : la silhouette d'un parasol ouvert, et la meme emprise au sol que l'ombre en 2D.
  const hToile = Math.max(0.15, par.r * 0.28);
  const toile = new THREE.Mesh(new THREE.ConeGeometry(par.r, hToile, 24), matToile);
  toile.position.set(pl.x, hMat + hToile / 2, pl.z);
  scene.add(toile);
}
