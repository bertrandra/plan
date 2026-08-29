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

import { vue3d, glb } from '../../three/etat3d.js';
import { showErrBanner, showToast } from '../../shell/dialogs.js';
import { telechargerBlob } from '../../shell/download.js';
import { nomFichierTerrasse } from '../../three/exportGlb.js';
import { ensureConstruction } from '../../engine/construction.js';
import { nouveauPointDeVue } from '../../model/creation.js';
import { cleObjet } from '../../model/cles.js';
import type { Atelier } from '../atelier.js';

/** Ce que les commandes de la Vue 3D pilotent, en plus de l'atelier. */
export interface ContexteVue3d {
  zoom3D: (facteur: number) => void;
  setMode3D: (mode: string) => void;
  hauteurDesYeux: () => void;
  buildThreeScene: (obj) => void;
  createObjectDOM: (obj) => void;
  setVue3dPleinePage: (actif: boolean) => void;
  setGlbViewerPleinePage: (actif: boolean) => void;
  /** L'état plein page des deux vues, lu au moment du clic. */
  vue3dPleinePage: () => boolean;
  glbViewerPleinePage: () => boolean;
  resizeThreeScene: () => void;
  resizeGlbViewerScene: () => void;
}

export function brancherVue3d(a: Atelier, ctx: ContexteVue3d): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;
  const terrasseCourante = () => a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey);

  /** Reconstruit la scène si elle est ouverte. `null` est valide : un plan sans terrasse se voit. */
  const reconstruire = () => { if (vue3d.scene) ctx.buildThreeScene(terrasseCourante() || null); };

  // ---- Déplacer la caméra ---------------------------------------------------------------------
  el('terrasse3dZoomIn').addEventListener('click', () => ctx.zoom3D(0.8));
  el('terrasse3dZoomOut').addEventListener('click', () => ctx.zoom3D(1.25));
  el('terrasse3dModeOrbit').addEventListener('click', () => ctx.setMode3D('orbit'));
  el('terrasse3dModePan').addEventListener('click', () => ctx.setMode3D('pan'));
  el('terrasse3dModeZoom').addEventListener('click', () => ctx.setMode3D('zoom'));
  el('terrasse3dEyeLevel').addEventListener('click', () => ctx.hauteurDesYeux());

  // ---- Changer ce qu'il y a dans la scène ------------------------------------------------------

  /** Le filaire change la géométrie des lames, pas seulement leur matériau : d'où la reconstruction. */
  el('terrasse3dFilaire').addEventListener('change', function () {
    const obj = terrasseCourante();
    if (!obj) return;
    ensureConstruction(obj).lames3dFilaire = this.checked;
    if (vue3d.scene) ctx.buildThreeScene(obj);
  });

  el('terrasse3dAllObjects').addEventListener('change', function () { vue3d.tousLesObjets = this.checked; reconstruire(); });
  el('terrasse3dObjectsOpaque').addEventListener('change', function () { vue3d.objetsOpaques = this.checked; reconstruire(); });

  /**
   * Cochée par défaut. La décocher revient à la couleur unie du plan sans avoir à retirer la texture
   * de chaque objet un par un — pratique pour comparer les deux rendus, ou pour un aperçu qui
   * n'attend pas le chargement des images.
   */
  el('terrasse3dTextures').addEventListener('change', function () { vue3d.textures = this.checked; reconstruire(); });

  /**
   * Décochée par défaut : une vraie ombre portée coûte bien plus cher que l'éclairage à trois
   * lumières déjà en place, et qui vérifie une implantation n'a pas à payer ce coût à chaque image.
   */
  el('terrasse3dShadows').addEventListener('change', function () { vue3d.ombres = this.checked; reconstruire(); });

  // ---- Sortir quelque chose de la vue ----------------------------------------------------------

  /**
   * Le canvas WebGL est construit avec `preserveDrawingBuffer`, donc son contenu reste lisible par
   * `toBlob()` après l'échange de tampon du navigateur — pas besoin du rendu hors-écran qu'exige
   * l'export PNG du plan 2D.
   */
  el('terrasse3dSavePng').addEventListener('click', () => {
    if (!vue3d.scene) { showErrBanner('Vue 3D pas encore chargee.'); return; }
    vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera); // capture le tout dernier etat
    vue3d.scene.renderer.domElement.toBlob(blob => {
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
  el('terrasse3dSaveViewBtn').addEventListener('click', () => {
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
    showToast('Point de vue cree : "' + newObj.name + '" (visible en Mode Plan).');
  });

  // ---- Plein page, pour les deux vues ----------------------------------------------------------
  el('terrasse3dFullPageBtn').addEventListener('click', () => ctx.setVue3dPleinePage(!ctx.vue3dPleinePage()));
  el('glbViewerFullPageBtn').addEventListener('click', () => ctx.setGlbViewerPleinePage(!ctx.glbViewerPleinePage()));
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
}
