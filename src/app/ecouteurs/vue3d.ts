// Les commandes de la Vue 3D (spec §6.4, app/).
//
// Elles se rangent en deux familles, et les distinguer est ce qui rend la vue supportable à l'usage :
//
// - **celles qui déplacent la caméra** — zoom, mode du glisser, hauteur des yeux — ne touchent pas à
//   la scène et rendent immédiatement ;
// - **celles qui changent ce qu'il y a dedans** — filaire, objets, opacité, textures, ombres — la
//   **reconstruisent**. Il n'y a pas de mise à jour partielle : la scène est jetée et refaite.
//
// Une case cochée coûte donc une reconstruction complète, ce qui est assumé — la scène est petite, et
// une reconstruction évite toute une classe de bugs d'état résiduel.

import { vue3d, glb, signaler3d } from '../../three/etat3d.js';
import { showErrBanner, showToast } from '../../shell/dialogs.js';
import { telechargerBlob } from '../../shell/download.js';
import { nomFichierTerrasse } from '../../three/exportGlb.js';
import { ensureConstruction } from '../../engine/construction.js';
import { nouveauPointDeVue } from '../../model/creation.js';
import { cleObjet } from '../../model/cles.js';
import { PERMISSION_ECRITURE } from '../acces.js';
import type { Atelier } from '../atelier.js';
import type { ObjetPlan } from '../../model/types.js';
import type { Mode3D } from '../../three/navigation.js';
import type { RegistreCommandes } from '../commandes.js';

/** Ce que les commandes de la Vue 3D pilotent, en plus de l'atelier. */
export interface ContexteVue3d {
  zoom3D: (facteur: number) => void;
  setMode3D: (mode: Mode3D) => void;
  hauteurDesYeux: () => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  createObjectDOM: (obj: ObjetPlan) => void;
  setVue3dPleinePage: (actif: boolean) => void;
  setGlbViewerPleinePage: (actif: boolean) => void;
  /** L'état plein page des deux vues, lu au moment du clic. */
  vue3dPleinePage: () => boolean;
  glbViewerPleinePage: () => boolean;
  resizeThreeScene: () => void;
  resizeGlbViewerScene: () => void;
}

/** Les cases du panneau de la Vue 3D (zones/vue3d/) : ce qu'il y a dans la scène. */
export interface ReglagesVue3d {
  /** Le filaire est une donnée de la terrasse (`construction.lames3dFilaire`), pas une préférence. */
  filaire(): boolean;
  basculerFilaire(actif: boolean): void;
  basculerTousLesObjets(actif: boolean): void;
  basculerOpaques(actif: boolean): void;
  basculerTextures(actif: boolean): void;
  basculerOmbres(actif: boolean): void;
}

export function brancherVue3d(a: Atelier, ctx: ContexteVue3d, cmd: RegistreCommandes): ReglagesVue3d {
  // Les boutons sont dans le panneau (zones/vue3d/Vue3d.tsx) : des commandes sans element a lier.
  const cam = (_idDom: string, id: string, libelle: string, executer: () => void, permission?: string) =>
    cmd.declarer({ id, libelle, groupe: '3d', executer, ...(permission ? { permission } : {}) });
  const terrasseCourante = () => a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey);

  /** Reconstruit la scène si elle est ouverte. `null` est valide : un plan sans terrasse se voit. */
  const reconstruire = () => { if (vue3d.scene) ctx.buildThreeScene(terrasseCourante() || null); };

  // ---- Déplacer la caméra ---------------------------------------------------------------------
  cam('terrasse3dZoomIn', '3d.zoomAvant', 'Zoom avant', () => ctx.zoom3D(0.8));
  cam('terrasse3dZoomOut', '3d.zoomArriere', 'Zoom arrière', () => ctx.zoom3D(1.25));
  cam('terrasse3dModeOrbit', '3d.modeOrbite', 'Orbite', () => ctx.setMode3D('orbit'));
  cam('terrasse3dModePan', '3d.modeDeplacement', 'Déplacement', () => ctx.setMode3D('pan'));
  cam('terrasse3dModeZoom', '3d.modeZoom', 'Zoom', () => ctx.setMode3D('zoom'));
  cam('terrasse3dEyeLevel', '3d.hauteurDesYeux', 'Hauteur des yeux', () => ctx.hauteurDesYeux());

  // ---- Sortir quelque chose de la vue ----------------------------------------------------------

  /**
   * Le canvas WebGL est construit avec `preserveDrawingBuffer`, donc son contenu reste lisible par
   * `toBlob()` après l'échange de tampon du navigateur — pas besoin du rendu hors-écran qu'exige
   * l'export PNG du plan 2D.
   */
  cam('terrasse3dSavePng', '3d.enregistrerPng', 'Enregistrer en PNG', () => {
    if (!vue3d.scene) { showErrBanner('Vue 3D pas encore chargee.'); return; }
    vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera); // capture le tout dernier etat
    // `renderer.domElement` vient d'une scene Three non typee (SceneTrois = Record<string, any>) :
    // le type du callback ne peut pas s'en deduire. `Blob | null` est celui de la vraie API canvas.
    vue3d.scene.renderer.domElement.toBlob((blob: Blob | null) => {
      if (!blob) { showErrBanner('Erreur export PNG : conversion en image impossible.'); return; }
      const obj = terrasseCourante();
      telechargerBlob('vue3d_' + nomFichierTerrasse(obj && obj.name) + '.png', blob);
    }, 'image/png');
  });

  /**
   * « Enregistrer la vue » crée un point de vue à la position et la direction actuelles de la caméra.
   *
   * Le centre relu est celui que la scène a retenu — la terrasse, ou à défaut la parcelle — plutôt
   * qu'un centroïde recalculé : c'est ce qui permet d'enregistrer un point de vue même depuis un plan
   * sans terrasse.
   *
   * L'objet n'est **pas** sélectionné et le plan n'est pas redessiné : on est dans la Vue 3D, changer
   * la sélection du plan sous l'utilisateur n'aurait pas de sens.
   */
  cam('terrasse3dSaveViewBtn', '3d.enregistrerPointDeVue', 'Enregistrer la vue comme point de vue', () => {
    if (!vue3d.scene) return;
    const cen = vue3d.scene.cen || { x: 0, y: 0 };
    const { camera, controls } = vue3d.scene;
    const planX = camera.position.x + cen.x, planY = cen.y - camera.position.z;
    const dx = controls.target.x - camera.position.x, dz = controls.target.z - camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    a.pushHistory();
    const n = a.etat.objects.filter(o => o.fonction === 'camera').length + 1;
    const { obj: newObj } = nouveauPointDeVue(
      { x: planX, y: planY }, cleObjet('path', a.etat), n,
      { x: dx / dl, y: -dz / dl }, camera.position.y
    );
    a.etat.objects.push(newObj);
    ctx.createObjectDOM(newObj);
    a.rebuildHandles(newObj);
    a.reapplyStackingOrder();
    a.rebuildSelector();
    // La liste « Aller a un point de vue enregistre… » se lit dans les objets du plan : le point
    // de vue qu'on vient de creer y figure des ce signal (D-15).
    signaler3d();
    showToast('Point de vue cree : "' + newObj.name + '" (visible en Mode Plan).');
  // Il ajoute un objet au plan : en lecture seule, le geste est refuse comme toute ecriture (D-17).
  }, PERMISSION_ECRITURE);

  // ---- Plein page, pour les deux vues ----------------------------------------------------------
  cam('terrasse3dFullPageBtn', '3d.pleinePage', 'Plein écran', () => ctx.setVue3dPleinePage(!ctx.vue3dPleinePage()));
  cmd.declarer({ id: 'visionneuse.pleinePage', libelle: 'Plein écran', groupe: 'visionneuse', executer: () => ctx.setGlbViewerPleinePage(!ctx.glbViewerPleinePage()) });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ctx.vue3dPleinePage()) ctx.setVue3dPleinePage(false);
    if (e.key === 'Escape' && ctx.glbViewerPleinePage()) ctx.setGlbViewerPleinePage(false);
  });

  // La fenetre peut changer de taille pendant qu'une vue est ouverte : le canvas suit, au lieu de
  // rester fige a la taille qu'il avait au dernier rendu.
  window.addEventListener('resize', () => {
    if (vue3d.scene) ctx.resizeThreeScene();
    if (glb.scene) ctx.resizeGlbViewerScene();
  });

  // ---- Changer ce qu'il y a dans la scène ------------------------------------------------------
  // Chaque case reconstruit la scène : il n'y a pas de mise à jour partielle (en-tête).
  const preference = (ecrire: () => void) => { ecrire(); signaler3d(); reconstruire(); };
  return {
    filaire: () => { const obj = terrasseCourante(); return !!(obj && ensureConstruction(obj).lames3dFilaire); },
    /** Le filaire change la géométrie des lames, pas seulement leur matériau : d'où la reconstruction. */
    basculerFilaire(actif) {
      const obj = terrasseCourante();
      if (!obj) return;
      ensureConstruction(obj).lames3dFilaire = actif;
      signaler3d();
      if (vue3d.scene) ctx.buildThreeScene(obj);
    },
    basculerTousLesObjets: (actif) => preference(() => { vue3d.tousLesObjets = actif; }),
    basculerOpaques: (actif) => preference(() => { vue3d.objetsOpaques = actif; }),
    /**
     * Cochée par défaut. La décocher revient à la couleur unie du plan sans avoir à retirer la
     * texture de chaque objet un par un — pratique pour comparer les deux rendus.
     */
    basculerTextures: (actif) => preference(() => { vue3d.textures = actif; }),
    /**
     * Décochée par défaut : une vraie ombre portée coûte bien plus cher que l'éclairage à trois
     * lumières déjà en place, et qui vérifie une implantation n'a pas à payer ce coût à chaque image.
     */
    basculerOmbres: (actif) => preference(() => { vue3d.ombres = actif; })
  };
}
