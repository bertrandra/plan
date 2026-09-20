// Naviguer et cadrer dans une vue 3D (spec §3.2, three/).
//
// Deux scenes vivent cote a cote — la Vue 3D construite depuis le plan, et la visionneuse qui relit
// un .glb deja exporte — et se pilotent de la meme facon. Ce module porte ce pilotage : zoom, mode
// du glisser, aller a un point de vue, redimensionner, plein page.
//
// Il ne construit ni ne detruit aucune scene : il ne fait que deplacer une camera et redemander une
// image. Chaque geste **rend immediatement** au lieu d'attendre la boucle d'animation, parce que
// celle-ci tourne sur `requestAnimationFrame`, que le navigateur met en pause des que l'onglet passe
// en arriere-plan — le reglage se ferait alors sans effet visible au retour.

import { vue3d, glb, type SceneTroisBase, type PlanVuDeLa3d, type PointDeVue } from './etat3d.js';
import type { PtBrut } from '../model/types.js';
import type { ObjetMesurable } from '../engine/hauteurs.js';

/** Hauteur des yeux au-dessus du platelage fini, en metres. */
export const HAUTEUR_YEUX_M = 1.6;

/** Ce qui fait avancer le glisser a un seul doigt. */
export type Mode3D = 'orbit' | 'pan' | 'zoom';

/**
 * Position et cible de camera pour un point de vue du plan.
 *
 * Un point de vue est un chemin de deux points : `pts[0]` est la position, `pts[0] → pts[1]` la
 * direction. C'est un point **et** un vecteur, pas un angle range a part — deplacer le second point
 * suffit donc a reorienter la vue, sans champ a tenir a jour.
 *
 * La cible est posee a 1,50 m devant, une distance de conversation courante : assez loin pour que
 * l'orbite ait un centre credible, assez pres pour qu'on regarde bien ce qu'on visait.
 *
 * La conversion plan → repere local se fait **ici, au moment du clic**, avec le centroide de la
 * terrasse courante : un point de vue n'appartient a aucune terrasse en particulier, donc rien ne
 * peut etre precalcule ni fige a l'avance.
 */
export function cameraDepuisPointDeVue(vp: PointDeVue, centroide: { x: number; y: number }) {
  const ddx = vp.pts[1].x - vp.pts[0].x, ddy = vp.pts[1].y - vp.pts[0].y;
  const dl = Math.hypot(ddx, ddy) || 1;
  const rad = Math.atan2(ddy / dl, ddx / dl);
  const eyeY = vp.altitude || 1.6;
  const lx = vp.pts[0].x - centroide.x, lz = centroide.y - vp.pts[0].y;
  return {
    position: { x: lx, y: eyeY, z: lz },
    cible: { x: lx + Math.cos(rad) * 1.5, y: eyeY, z: lz - Math.sin(rad) * 1.5 }
  };
}

/** Pose la camera d'une scene sur un point de vue, et rend. */
function poserCamera(sc: SceneTroisBase, vp: PointDeVue, centroide: { x: number; y: number }) {
  const { position, cible } = cameraDepuisPointDeVue(vp, centroide);
  sc.camera.position.set(position.x, position.y, position.z);
  sc.controls.target.set(cible.x, cible.y, cible.z);
  sc.controls.update();
  sc.renderer.render(sc.scene, sc.camera);
}

/** Ce dont la navigation a besoin du reste du programme. */
export interface ContexteNavigation {
  showToast: (message: string) => void;
  showErrBanner: (message: string) => void;
  /** Centroide d'un polygone du plan. */
  centroid: (pts: PtBrut[]) => { x: number; y: number };
  /** Hauteur finie d'une terrasse, en millimetres. */
  hauteurFinieMm: (obj: ObjetMesurable) => number;
  /** Bascule en mode Terrasse, sous-onglet 3D — pour « aller au point de vue » depuis le plan. */
  ouvrirVue3d: () => void;
}

export function creerNavigation3d(etat: PlanVuDeLa3d, ctx: ContexteNavigation) {
  let mode3D: Mode3D = 'orbit';
  let zoomDragActive = false, zoomDragLastY = 0;
  let vue3dPleinePage = false;
  let glbViewerPleinePage = false;

  /**
   * Rapproche (`factor` < 1) ou eloigne la camera de sa cible.
   *
   * Le plancher de 0,30 m empeche de zoomer **au travers** de la cible : passe ce point, l'orbite
   * s'inverserait et la vue partirait a l'envers.
   */
  function zoom3D(factor: number): void {
    if (!vue3d.scene) return;
    const { camera, controls, renderer, scene } = vue3d.scene;
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    offset.multiplyScalar(factor);
    if (offset.length() < 0.3) return;
    camera.position.copy(controls.target).add(offset);
    controls.update();
    renderer.render(scene, camera);
  }

  // Le zoom au glisser est tenu a la main. OrbitControls sait remapper le glisser en rotation ou en
  // translation, mais n'a pas d'equivalent « zoom a un doigt » — le pincement a deux doigts existe
  // pour cela, un seul doigt ne le peut pas nativement. D'ou ces trois ecouteurs, poses et retires
  // avec le mode, et la rotation et la translation coupees pendant ce temps pour que les deux
  // gestions ne se disputent pas le meme pointeur.
  function onZoomDragDown(e: PointerEvent): void {
    zoomDragActive = true; zoomDragLastY = e.clientY;
    // `target` est un `EventTarget` : il ne capture le pointeur que si c'est un element du
    // document. Le test de presence etait deja la, il devient le garde.
    const cible = e.target as Element | null;
    if (cible && cible.setPointerCapture) cible.setPointerCapture(e.pointerId);
  }
  function onZoomDragMove(e: PointerEvent): void {
    if (!zoomDragActive) return;
    const dy = e.clientY - zoomDragLastY; zoomDragLastY = e.clientY;
    if (Math.abs(dy) < 0.5) return;
    zoom3D(Math.exp(dy * 0.006)); // vers le haut (dy < 0) rapproche, vers le bas eloigne
  }
  function onZoomDragUp(): void { zoomDragActive = false; }

  function applyMode3D(): void {
    if (!vue3d.scene) return;
    const { controls, renderer } = vue3d.scene;
    const dom = renderer.domElement;
    dom.removeEventListener('pointerdown', onZoomDragDown);
    dom.removeEventListener('pointermove', onZoomDragMove);
    window.removeEventListener('pointerup', onZoomDragUp);
    zoomDragActive = false;
    if (mode3D === 'zoom') {
      controls.enableRotate = false; controls.enablePan = false;
      dom.addEventListener('pointerdown', onZoomDragDown);
      dom.addEventListener('pointermove', onZoomDragMove);
      window.addEventListener('pointerup', onZoomDragUp);
    } else {
      controls.enableRotate = true; controls.enablePan = true;
      controls.mouseButtons.LEFT = mode3D === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE = mode3D === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    }
    [['terrasse3dModeOrbit', 'orbit'], ['terrasse3dModePan', 'pan'], ['terrasse3dModeZoom', 'zoom']].forEach(([id, m]) => {
      const b = document.getElementById(id);
      if (!b) return;
      const actif = mode3D === m;
      b.style.background = actif ? 'var(--accent, #2a6b7a)' : '';
      b.style.color = actif ? '#fff' : '';
    });
    const hint = document.getElementById('terrasse3dHint');
    if (hint) hint.textContent = mode3D === 'pan'
      ? 'Mode deplacer : glisser (un doigt) translate la vue. Molette ou boutons +/− = zoom. Reprends ⟳ pour tourner.'
      : mode3D === 'zoom'
      ? 'Mode zoom : glisser vers le haut rapproche, vers le bas eloigne. Reprends ⟳ pour tourner.'
      : 'Glisser = tourner, molette ou boutons +/− = zoom, clic droit + glisser = deplacer. Les boutons ⟳ / ✋ / 🔍 changent ce que fait le glisser a un seul doigt — pratique sur tablette.';
  }

  /**
   * Redimensionne une scene apres un changement de taille de son hote.
   *
   * Le canvas garde sa taille CSS (100 % de l'hote) : c'est donc l'**hote** qui grandit. Mais ni le
   * renderer ni la camera ne suivent une resize CSS tout seuls — sans cet appel explicite, l'image
   * reste a l'ancienne taille, etiree ou bordee de bandes vides.
   */
  function redimensionner(sc: SceneTroisBase | null, idHote: string): void {
    if (!sc) return;
    const host = document.getElementById(idHote);
    const w = host.clientWidth || 600, h = host.clientHeight || 420;
    sc.camera.aspect = w / h;
    sc.camera.updateProjectionMatrix();
    sc.renderer.setSize(w, h);
    sc.renderer.render(sc.scene, sc.camera);
  }
  function resizeThreeScene(): void { redimensionner(vue3d.scene, 'terrasse3dCanvasHost'); }
  function resizeGlbViewerScene(): void { redimensionner(glb.scene, 'glbViewerCanvasHost'); }

  /**
   * Passe une vue en plein page, ou l'en fait revenir.
   *
   * La hauteur est posee en **inline** parce que le HTML la fixe ainsi : une regle de classe seule
   * perdrait contre elle.
   *
   * Il n'y a pas besoin d'attendre une frame avant de redimensionner : lire une propriete de mise en
   * page — `clientHeight`, dans le redimensionnement — force le navigateur a recalculer la mise en
   * page jusqu'a ce point du script, donc la valeur lue est deja la nouvelle.
   */
  function pleinePage(actif: boolean, idConteneur: string, idHote: string, idBouton: string, quoi: string, redim: () => void): void {
    const conteneur = document.getElementById(idConteneur);
    const host = document.getElementById(idHote);
    const btn = document.getElementById(idBouton);
    conteneur.classList.toggle('pleinePage', actif);
    host.style.height = actif ? 'calc(100vh - 210px)' : '420px';
    btn.textContent = actif ? '🗗 Format normal' : '⛶ Plein écran';
    btn.title = actif ? 'Revenir a l\'affichage normal' : 'Agrandir ' + quoi + ' en pleine page';
    redim();
  }

  return {
    zoom3D,
    applyMode3D,
    setMode3D(m: Mode3D) { mode3D = m; applyMode3D(); },
    resizeThreeScene,
    resizeGlbViewerScene,

    /**
     * Leve ou baisse le point de vue a hauteur d'yeux au-dessus du platelage fini — pas du sol :
     * c'est le niveau ou l'on se tient une fois monte sur la terrasse.
     *
     * Seule la hauteur bouge. La position horizontale et le point vise restent exactement ou
     * l'utilisateur les avait laisses : ce bouton leve le regard, il ne le deplace pas.
     */
    hauteurDesYeux() {
      const obj = etat.objects.find(o => o.key === etat.terrasseSelectedKey);
      if (!obj || !vue3d.scene) return;
      const { camera, controls, renderer, scene } = vue3d.scene;
      camera.position.y = ctx.hauteurFinieMm(obj) / 1000 + HAUTEUR_YEUX_M;
      controls.update();
      renderer.render(scene, camera);
    },

    /**
     * Depuis le panneau d'un point de vue, en mode Plan : bascule en Vue 3D et y place la camera.
     *
     * La scene n'existe pas encore au moment du clic, et sa construction est asynchrone : d'ou
     * l'attente active, dix secondes au plus. Elle guette `dernierObjKey` et pas seulement la
     * presence d'une scene — sinon on poserait la camera dans la scene **precedente**, celle d'une
     * autre terrasse, juste avant qu'elle soit remplacee.
     */
    allerAuPointDeVue(vp: PointDeVue) {
      const terr = etat.objects.find(o => o.key === etat.terrasseSelectedKey && o.fonction === 'terrasse')
                || etat.objects.find(o => o.fonction === 'terrasse');
      if (!terr) { ctx.showToast('Cree d\'abord une terrasse pour pouvoir y aller en Vue 3D.'); return; }
      etat.terrasseSelectedKey = terr.key;
      ctx.ouvrirVue3d();
      let tentatives = 0;
      (function essayer() {
        tentatives++;
        if (vue3d.scene && vue3d.dernierObjKey === terr.key) {
          poserCamera(vue3d.scene, vp, ctx.centroid(terr.pts));
          return;
        }
        if (tentatives < 100) setTimeout(essayer, 100);
        else ctx.showErrBanner('Vue 3D : chargement trop long, reessaie.');
      })();
    },

    /**
     * Meme geste dans la visionneuse GLB — sans changement d'onglet ni attente : sa scene est deja
     * active quand ce bouton est visible. La terrasse ne sert que de reference pour le centroide ;
     * le GLB affiche etant son export, les deux reperes coincident.
     */
    allerAuPointDeVueGlb(vp: PointDeVue) {
      if (!glb.scene) return;
      const terr = etat.objects.find(o => o.key === etat.terrasseSelectedKey && o.fonction === 'terrasse')
                || etat.objects.find(o => o.fonction === 'terrasse');
      if (!terr) return;
      poserCamera(glb.scene, vp, ctx.centroid(terr.pts));
    },

    setVue3dPleinePage(actif: boolean) {
      vue3dPleinePage = actif;
      pleinePage(actif, 'terrasseTab3d', 'terrasse3dCanvasHost', 'terrasse3dFullPageBtn', 'la vue 3D', resizeThreeScene);
    },
    setGlbViewerPleinePage(actif: boolean) {
      glbViewerPleinePage = actif;
      pleinePage(actif, 'glbViewerPanel', 'glbViewerCanvasHost', 'glbViewerFullPageBtn', 'la visionneuse', resizeGlbViewerScene);
    },
    get vue3dPleinePage() { return vue3dPleinePage; },
    get glbViewerPleinePage() { return glbViewerPleinePage; }
  };
}
