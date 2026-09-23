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

import { vue3d, glb, cleDeVue, type SceneVue3d, type SceneTroisBase, type PlanVuDeLa3d, type PointDeVue } from './etat3d.js';

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
 * La conversion plan → repere local se fait **ici, au moment du clic**, avec le centre sur lequel
 * la scene est cadree : un point de vue n'appartient a aucune terrasse en particulier, donc rien
 * ne peut etre precalcule ni fige a l'avance. Ce centre est celui que la scene a retenu, jamais un
 * centroide recalcule — c'est le meme nombre qui a servi a enregistrer le point de vue, et deux
 * facons de l'obtenir sont deja une de trop (D-15).
 */
export function cameraDepuisPointDeVue(vp: PointDeVue, centroide: { x: number; y: number }) {
  const pts = vp.pts!;
  const ddx = pts[1]!.x - pts[0]!.x, ddy = pts[1]!.y - pts[0]!.y;
  const dl = Math.hypot(ddx, ddy) || 1;
  const rad = Math.atan2(ddy / dl, ddx / dl);
  const eyeY = vp.altitude || 1.6;
  const lx = pts[0]!.x - centroide.x, lz = centroide.y - pts[0]!.y;
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

/**
 * Ce dont la navigation a besoin du reste du programme.
 *
 * Le centroide n'en fait plus partie depuis D-15 : les deux gestes qui le demandaient prennent
 * desormais le centre la ou il a reellement ete pose — sur la scene, ou avec le modele exporte —
 * au lieu de le refabriquer a partir d'une terrasse qui n'etait pas forcement la bonne.
 */
export interface ContexteNavigation {
  /**
   * La banniere d'erreur, pour le seul echec que la navigation puisse rencontrer : une scene qui
   * n'arrive pas. Le `showToast` d'a cote a disparu avec D-15 — le seul message que ce module
   * emettait etait le refus « cree d'abord une terrasse », et ce refus etait le defaut.
   */
  showErrBanner: (message: string) => void;
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
    ([['terrasse3dModeOrbit', 'orbit'], ['terrasse3dModePan', 'pan'], ['terrasse3dModeZoom', 'zoom']] as const).forEach(([id, m]) => {
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
    const host = document.getElementById(idHote)!;
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
    const conteneur = document.getElementById(idConteneur)!;
    const host = document.getElementById(idHote)!;
    const btn = document.getElementById(idBouton)!;
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
     * Depuis le panneau d'un point de vue, ou depuis la liste des vues : bascule en Vue 3D et y
     * place la camera.
     *
     * **Le centre est celui de la scene, pas un centroide recalcule** (correction de D-15). Un
     * point de vue est enregistre en coordonnees du plan a partir de `scene.cen` ; l'y ramener
     * demande exactement le meme nombre, et le seul endroit ou il est sur de le trouver est la
     * scene qui vient d'etre batie. Le recalculer sur la terrasse donnait la bonne reponse tant
     * qu'il y avait une terrasse et qu'elle etait bien l'objet sur lequel la scene s'etait
     * centree — deux conditions que rien ne garantissait.
     *
     * **Aucune terrasse n'est exigee.** La Vue 3D s'ouvre sur un plan qui n'en a pas, et « 📷
     * Enregistrer la vue » y cree des points de vue : les refuser au retour, par un message qui
     * reclamait une terrasse, revenait a jeter ce que le meme ecran venait de fabriquer. C'est le
     * defaut trouve par l'item 23 de la liste de fumee, sur un plan importe par adresse.
     *
     * La scene n'existe pas encore au moment du clic, et sa construction est asynchrone : d'ou
     * l'attente active, dix secondes au plus. Elle guette `dernierObjKey` et pas seulement la
     * presence d'une scene — sinon on poserait la camera dans la scene **precedente**, celle d'une
     * autre terrasse, juste avant qu'elle soit remplacee.
     */
    allerAuPointDeVue(vp: PointDeVue) {
      const terr = etat.objects.find(o => o.key === etat.terrasseSelectedKey && o.fonction === 'terrasse')
                || etat.objects.find(o => o.fonction === 'terrasse');
      if (terr) etat.terrasseSelectedKey = terr.key;
      const cleAttendue = cleDeVue(terr);
      ctx.ouvrirVue3d();
      let tentatives = 0;
      (function essayer() {
        tentatives++;
        const sc: SceneVue3d | null = vue3d.scene;
        if (sc && vue3d.dernierObjKey === cleAttendue) {
          poserCamera(sc, vp, sc.cen);
          return;
        }
        if (tentatives < 100) setTimeout(essayer, 100);
        else ctx.showErrBanner('Vue 3D : chargement trop long, reessaie.');
      })();
    },

    /**
     * Meme geste dans la visionneuse GLB — sans changement d'onglet ni attente : sa scene est deja
     * active quand ce bouton est visible.
     *
     * Le centre est celui **que l'export a utilise**, retenu avec le modele. L'exporteur recopie la
     * scene de la Vue 3D telle quelle, donc l'origine du .glb est le `cen` de cette scene-la. Le
     * redeviner en cherchant une terrasse visait la terrasse *courante*, qui peut avoir change
     * depuis — ou ne plus exister.
     */
    allerAuPointDeVueGlb(vp: PointDeVue) {
      if (!glb.scene || !glb.dernierExporte) return;
      poserCamera(glb.scene, vp, glb.dernierExporte.centre);
    },

    setVue3dPleinePage(actif: boolean) {
      vue3dPleinePage = actif;
      pleinePage(actif, 'vue3dPanel', 'terrasse3dCanvasHost', 'terrasse3dFullPageBtn', 'la vue 3D', resizeThreeScene);
    },
    setGlbViewerPleinePage(actif: boolean) {
      glbViewerPleinePage = actif;
      pleinePage(actif, 'glbViewerPanel', 'glbViewerCanvasHost', 'glbViewerFullPageBtn', 'la visionneuse', resizeGlbViewerScene);
    },
    get vue3dPleinePage() { return vue3dPleinePage; },
    get glbViewerPleinePage() { return glbViewerPleinePage; }
  };
}
