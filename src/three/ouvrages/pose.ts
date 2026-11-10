// Poser un objet du plan dans la scene 3D : ce que les modules 3D des ouvrages partagent (le sol sous eux, leur opacite, leurs
// textures). Tire de three/sceneObjets.ts, sans retouche, quand chaque ouvrage a pris son module (MD/spec-ouvrages.md, etape 6.6).

import { textureDesMurs } from '../../model/couleurMur.js';
import { textureMur } from '../textureMur.js';
import { centroid } from '../../geometry/basic.js';
import { vue3d } from '../etat3d.js';
import { creerPrimitives, type Primitives } from '../primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { aDesSommets } from '../../model/formes.js';
import { estBatiment } from '../../model/fonctions.js';
import type { SolRelief } from '../relief3d.js';
import type { ContexteObjets } from '../typesScene.js';

/**
 * Un groupe pose sur le sol en `p` : ce qu'on y met compte ses hauteurs depuis le sol local, sans
 * que chaque module (pergola, piscine, parasol, releve de facade) ait a connaitre le relief. Sur
 * sol plat, c'est la scene elle-meme.
 */
export function groupeAuSol(scene: THREE_NS.Object3D, sol: SolRelief | null, p: PtBrut): THREE_NS.Object3D {
  if (!sol) return scene;
  const groupe = new THREE.Group();
  groupe.position.y = sol.hauteur(p);
  scene.add(groupe);
  return groupe;
}

/** Des primitives qui posent dans `cible` : la scene, ou un groupe pose sur le sol. */
export function primitivesDans(cible: THREE_NS.Object3D, co: ContexteObjets): Primitives {
  return cible === co.scene ? co.prim : creerPrimitives({ scene: cible, versLocal: co.versLocal, chargerTexture: co.ctx.chargerTexturePolyhaven });
}

/** Le centre d'un objet du plan, pour lire le sol sous lui. */
export function centreDe(o: ObjetPlan): PtBrut {
  return o.type === 'circle' ? o.center : aDesSommets(o) && o.pts.length ? centroid(o.pts) : { x: 0, y: 0 };
}

// « Objets opaques » ignore l'opacite du plan 2D, souvent < 1 pour voir a travers en mode Plan.
export const opaciteDe = (o: ObjetPlan) => vue3d.objetsOpaques ? undefined : o.fillOpacity;
// « Texture » decoche revient a la couleur unie sans retirer la texture de chaque objet.
/**
 * Les textures d'un objet en 3D : celles choisies dans l'inspecteur ; sur les murs d'un batiment qui
 * n'en a pas, celle de son materiau (model/couleurMur.ts, three/textureMur.ts), que sa couleur teinte.
 */
export const texturesDe = (o: ObjetPlan) => {
  if (!vue3d.textures) return null;
  const materiau = !o.textureVerticale && o.type === 'polygon' && estBatiment(o) ? textureDesMurs(o) : null;
  return { horizontale: o.textureHorizontale, vertical: o.textureVerticale ?? (materiau ? textureMur(materiau) : undefined) };
};
