// Le soleil de la Vue 3D : ses commandes, et leur effet sur la scene (spec §3.2, three/).
//
// Le calcul lui-meme vit dans `lumiere.ts`, partage avec la visionneuse GLB. Ce module-ci ne fait
// que le relier a l'etat propre de la Vue 3D (`soleilVue3d` dans `etat3d.ts`), que son panneau lit.

import { vue3d, soleilVue3d, affichage3d, signaler3d } from './etat3d.js';
import { reglerSoleil, libelleSoleil } from './lumiere.js';
import { anneeEtSemaineDepuisDate } from '../util/semaine.js';

/** Ce dont le soleil de la Vue 3D a besoin du reste du programme : le lieu, pour la course. */
export interface ContexteSoleilVue3d {
  lieuActuel: () => { latitude: number; longitude: number };
}

/** Recale la position du curseur « semaine » sur la date courante. */
export function syncSemaineDepuisDate(): void {
  soleilVue3d.semaineAffichee = anneeEtSemaineDepuisDate(soleilVue3d.dateStr).semaine;
}

/**
 * Remet les commandes en accord avec l'etat : appele a chaque (re)construction de la scene. La Vue
 * 3D se reconstruit a chaque case cochee, alors que les curseurs, eux, gardent ce qui a ete regle —
 * le panneau (zones/vue3d/) les relit dans `soleilVue3d`.
 */
export function syncControles(): void {
  syncSemaineDepuisDate();
  signaler3d();
}

/**
 * Pose le soleil sur la scene et affiche sa position en clair.
 *
 * La scene de la Vue 3D est centree sur l'origine — contrairement a celle de la visionneuse,
 * centree sur la boite englobante de son modele : elle ne passe donc pas de centre, et son `extent`
 * sert de rayon.
 */
export function appliquer(ctx: ContexteSoleilVue3d): void {
  if (!vue3d.scene || !vue3d.scene.dirLight) return;
  const { dirLight, dirFill, hemiLight, extent } = vue3d.scene;
  const position = reglerSoleil(
    { dirLight, dirFill, hemiLight, rayon: extent },
    soleilVue3d,
    ctx.lieuActuel()
  );
  // Une date illisible laisse le soleil ou il etait, et son libelle avec.
  if (!position) return;
  affichage3d.soleilInfo = libelleSoleil(position.elevRad, position.azRad);
  signaler3d();
  // Rendu immediat, sans attendre la boucle d'animation : celle-ci tourne sur
  // requestAnimationFrame, que le navigateur met en pause des que l'onglet passe en arriere-plan —
  // le reglage se ferait alors sans effet visible au retour.
  vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera);
}
