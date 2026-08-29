// Le soleil de la Vue 3D : ses commandes, et leur effet sur la scene (spec §3.2, three/).
//
// Le calcul lui-meme vit dans `lumiere.ts`, partage avec la visionneuse GLB. Ce module-ci ne fait
// que le relier aux curseurs de la Vue 3D et a son etat propre (`soleilVue3d` dans `etat3d.ts`).

import { vue3d, soleilVue3d } from './etat3d.js';
import { reglerSoleil, libelleSoleil } from './lumiere.js';
import { anneeEtSemaineDepuisDate } from '../util/semaine.js';

/** Ce dont les commandes du soleil ont besoin du reste du programme. */
export interface ContexteSoleilVue3d {
  lieuActuel: () => { latitude: number; longitude: number };
  libelleLieu: () => string;
  formatHeureMin: (minutes: number) => string;
}

/** Recale le curseur « semaine » sur la date courante, et retient sa position. */
export function syncSemaineDepuisDate(): void {
  const { semaine } = anneeEtSemaineDepuisDate(soleilVue3d.dateStr);
  soleilVue3d.semaineAffichee = semaine;
  const s = document.getElementById('vue3dSemaine') as HTMLInputElement | null;
  if (s) s.value = String(semaine);
}

/**
 * Remet toutes les commandes en accord avec l'etat.
 *
 * Appele au moment ou la scene est (re)construite, et c'est la raison d'etre de la fonction : la
 * Vue 3D se reconstruit a chaque case cochee, alors que les curseurs, eux, doivent garder ce qui a
 * ete regle.
 */
export function syncControles(ctx: ContexteSoleilVue3d): void {
  const poser = (id: string, valeur: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = valeur;
  };
  const ecrire = (id: string, texte: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = texte;
  };
  poser('vue3dDate', soleilVue3d.dateStr);
  syncSemaineDepuisDate();
  poser('vue3dHeure', String(soleilVue3d.minutes));
  ecrire('vue3dHeureTexte', ctx.formatHeureMin(soleilVue3d.minutes));
  const pourcent = Math.round(soleilVue3d.intensiteSoleil * 100);
  poser('vue3dIntensite', String(pourcent));
  ecrire('vue3dIntensiteTexte', pourcent + ' %');
  const cb = document.getElementById('vue3dLumiereAppoint') as HTMLInputElement | null;
  if (cb) cb.checked = soleilVue3d.lumiereAppoint;
  ecrire('vue3dLieu', ctx.libelleLieu());
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
  const { elevRad, azRad } = reglerSoleil(
    { dirLight, dirFill, hemiLight, rayon: extent },
    soleilVue3d,
    ctx.lieuActuel()
  );
  const info = document.getElementById('vue3dSoleilInfo');
  if (info) info.textContent = libelleSoleil(elevRad, azRad);
  // Rendu immediat, sans attendre la boucle d'animation : celle-ci tourne sur
  // requestAnimationFrame, que le navigateur met en pause des que l'onglet passe en arriere-plan —
  // le reglage se ferait alors sans effet visible au retour.
  vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera);
}
