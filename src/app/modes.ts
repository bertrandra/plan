// Ce que l'utilisateur regarde (spec §6.4, app/).
//
// Quatre vues se partagent la page — le plan, la terrasse, la Vue 3D et la visionneuse GLB — mais
// elles ne sont pas de meme nature, et c'est ce qui embrouillait le code d'origine :
//
// - `etat.appMode` ne connait que **deux** modes, `plan` et `terrasse`, parce que c'est ce que le
//   reste du programme teste. La Vue 3D est le mode Terrasse sur son sous-onglet `3d` ; la
//   visionneuse GLB ne change pas de mode du tout, elle recouvre la page.
// - Mais l'utilisateur, lui, voit **quatre** boutons dont un seul doit etre allume.
//
// Ces deux comptes differents etaient tenus au meme endroit, a coups de `classList.add` et
// `.remove` poses apres coup pour rattraper ce que l'appel precedent venait de faire. D'ou la
// regle de ce module : `vueCourante` est la seule verite sur ce qui est affiche, `appliquerVue()`
// est le seul endroit qui touche aux boutons et aux zones, et `etat.appMode` en est **derive**.
// Aucune fonction ne corrige plus l'apparence laissee par une autre.

import { vue3d, glb, chargement } from '../three/etat3d.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, Construction } from '../model/types.js';

/** Ce que l'utilisateur regarde. Quatre vues, un seul bouton allume. */
export type Vue = 'plan' | 'terrasse' | 'vue3d' | 'visionneuse';

/** Le bouton du haut de page qui correspond a chaque vue. */
const BOUTON_DE_VUE: Record<Vue, string> = {
  plan: 'modePlanBtn',
  terrasse: 'modeTerrasseBtn',
  vue3d: 'mode3dBtn',
  visionneuse: 'glbViewerBtn'
};

/** Les zones du mode Plan, et celles du mode Terrasse : montrees ensemble, cachees ensemble. */
const ZONES_PLAN = ['selector', 'planActions', 'panelTabs', 'panel'];
const ZONES_TERRASSE = ['terrasseTopBar', 'terrassePanel'];

/** Les sous-onglets du mode Terrasse : leur cle, leur libelle, et le panneau qu'ils montrent. */
const SOUS_ONGLETS: [string, string, string][] = [
  ['construction', 'Construction', 'terrasseTabConstruction'],
  ['bom', 'BOM', 'terrasseTabBom'],
  ['canevas', 'Canevas', 'terrasseTabCanevas'],
  ['3d', 'Vue 3D', 'terrasseTab3d'],
  ['coupe', 'Plan de coupe', 'terrasseTabCoupe'],
  ['implantation', 'Implantation', 'terrasseTabImplantation'],
  ['chantier', 'Chantier', 'terrasseTabChantier'],
  ['methode', 'Méthode', 'terrasseTabMethode']
];

/** Ce que le pilotage des vues doit pouvoir declencher ailleurs. */
export interface ContexteModes {
  /** Le plan lui-meme, celui qu'on deplace d'un emplacement a l'autre. */
  stage: HTMLElement;
  /** Le groupe SVG du calque des couches, a vider en quittant le mode Terrasse. */
  terrasseLayerGroup: SVGGElement;
  /** Reconstruit la barre de choix de la terrasse ; `false` quand il n'y a rien a montrer. */
  rebuildTerrasseSelector: () => boolean;
  fitToObject: (obj: ObjetPlan | null) => void;
  ensureConstruction: (obj: ObjetPlan) => Construction;
  ensureThreeLoaded: (cb: () => void) => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  disposeThreeScene: () => void;
  render: () => void;
  /** Les panneaux a remplir quand la terrasse courante change. */
  rendrePanneauxTerrasse: (obj: ObjetPlan) => void;
  /** Charge et affiche le dernier .glb exporte, une fois son panneau visible. */
  preparerVisionneuse: () => void;
  /** Rend la visionneuse a son format normal, avant de la fermer. */
  quitterPleinPageVisionneuse: () => void;
  /** Libere la scene de la visionneuse. */
  disposeGlbViewerScene: () => void;
}

export function creerModes(etat: EtatApp, ctx: ContexteModes) {
  let vueCourante: Vue = 'plan';
  let terrasseSubTab = 'construction';
  // La terrasse sur laquelle la vue a deja ete cadree : on ne recadre qu'au changement, sinon
  // chaque retour au mode Terrasse annulerait le zoom que l'utilisateur venait de regler.
  let terrasseLastFittedKey: string | null = null;

  // ------------------------------------------------------------------------------------------
  // Le plan physique se deplace
  // ------------------------------------------------------------------------------------------
  // `#stage` n'existe qu'une fois dans la page : il est *deplace* entre sa place du mode Plan, le
  // sous-onglet Canevas (ou le voir par-dessous la construction a un sens) et un garage cache pour
  // tous les autres sous-onglets. Ni duplique, ni laisse flottant au-dessus d'onglets qui n'en ont
  // que faire.
  //
  // Sa place d'origine est marquee par un noeud-ancre pose ici, une fois pour toutes. Retenir
  // « le parent et le frere suivant » aurait suffi tant que rien d'autre ne touche a ces voisins —
  // une ancre, elle, reste valable meme si le voisinage change.
  const ancrePlan = document.createComment(' emplacement du plan en mode Plan ');
  ctx.stage.parentNode.insertBefore(ancrePlan, ctx.stage.nextSibling);

  function updateStagePlacement(): void {
    if (etat.appMode === 'terrasse' && terrasseSubTab === 'canevas') {
      document.getElementById('stageHost').appendChild(ctx.stage);
    } else if (etat.appMode === 'terrasse') {
      document.getElementById('stageParking').appendChild(ctx.stage);
    } else {
      ancrePlan.parentNode.insertBefore(ctx.stage, ancrePlan);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Une seule vue a la fois
  // ------------------------------------------------------------------------------------------

  /** Allume le bouton de la vue courante, eteint les trois autres. Seul endroit qui les touche. */
  function appliquerBoutons(): void {
    for (const [vue, id] of Object.entries(BOUTON_DE_VUE)) {
      document.getElementById(id).classList.toggle('active', vue === vueCourante);
    }
  }

  function afficher(ids: string[], visible: boolean, valeurVisible = ''): void {
    ids.forEach(id => { document.getElementById(id).style.display = visible ? valeurVisible : 'none'; });
  }

  /**
   * Applique la vue demandee : boutons, zones, et mode sous-jacent.
   *
   * La visionneuse recouvre la page sans changer de mode — d'ou le traitement a part. Toute autre
   * vue la referme d'abord : sinon son canevas resterait actif derriere le panneau qu'on rouvre.
   */
  function appliquerVue(vue: Vue): void {
    if (vueCourante === 'visionneuse' && vue !== 'visionneuse') fermerVisionneuse();
    vueCourante = vue;
    appliquerBoutons();
    if (vue === 'visionneuse') return;

    const mode = vue === 'plan' ? 'plan' : 'terrasse';
    etat.appMode = mode;
    const surLePlan = mode === 'plan';
    afficher(ZONES_PLAN, surLePlan);
    afficher(ZONES_TERRASSE, !surLePlan, 'block');
    if (surLePlan) {
      ctx.terrasseLayerGroup.innerHTML = '';
      terrasseLastFittedKey = null; // un retour ulterieur en mode Terrasse recadrera
      ctx.disposeThreeScene();
      document.getElementById('terrasse3dWrap').style.display = 'none';
      updateStagePlacement();
      // Le plan masque la selection tant qu'il sert de fond en mode Terrasse : revenir doit la
      // redessiner, sinon l'objet reste visuellement deselectionne alors qu'il est bien celui que
      // le panneau edite.
      ctx.render();
    } else {
      refreshTerrasseView();
    }
  }

  function ouvrirVisionneuse(): void {
    glb.ouvert = true;
    appliquerVue('visionneuse');
    afficher(ZONES_PLAN, false);
    afficher(ZONES_TERRASSE, false);
    ctx.stage.style.display = 'none';
    document.getElementById('glbViewerPanel').style.display = 'block';
    ctx.preparerVisionneuse();
  }

  function fermerVisionneuse(): void {
    if (!glb.ouvert) return;
    glb.ouvert = false;
    // Avant de cacher le panneau : sinon la reouverture repartirait directement en plein page.
    ctx.quitterPleinPageVisionneuse();
    document.getElementById('glbViewerPanel').style.display = 'none';
    ctx.stage.style.display = '';
    ctx.disposeGlbViewerScene();
  }

  // ------------------------------------------------------------------------------------------
  // Le mode Terrasse et ses sous-onglets
  // ------------------------------------------------------------------------------------------

  /**
   * Reconstruit la rangee de sous-onglets, montre le panneau choisi, et gere la scene 3D.
   *
   * Sur la Vue 3D, **la rangee disparait entierement** plutot que de montrer les sept autres sans
   * qu'aucun ne soit actif : « Vue 3D » doit se lire comme une vue a part, pas comme le mode
   * Terrasse avec un onglet manquant. Le sous-onglet `3d` reste dans la liste — l'affichage des
   * panneaux en a besoin — mais n'a pas de bouton.
   *
   * La Vue 3D n'a pas de bouton « afficher / masquer » : elle est active tant que son onglet l'est,
   * et se reconstruit a chaque passage ici — apres un changement de construction, par exemple.
   */
  function rebuildTerrasseSubTabs(): void {
    const div = document.getElementById('terrasseSubTabs');
    div.innerHTML = '';
    div.style.display = (terrasseSubTab === '3d') ? 'none' : '';
    SOUS_ONGLETS.filter(([key]) => key !== '3d').forEach(([key, label]) => {
      const b = document.createElement('button');
      b.className = 'panelTabBtn' + (terrasseSubTab === key ? ' active' : '');
      b.textContent = label;
      // Choisir un sous-onglet normal, c'est revenir a la vue Terrasse : c'est `appliquerVue` qui
      // rend sa place au bouton « Terrasse », et non ce clic qui la lui rendrait a la main.
      b.addEventListener('click', () => { terrasseSubTab = key; vueCourante = 'terrasse'; appliquerBoutons(); rebuildTerrasseSubTabs(); });
      div.appendChild(b);
    });
    SOUS_ONGLETS.forEach(([key, , panelId]) => {
      document.getElementById(panelId).style.display = (terrasseSubTab === key) ? '' : 'none';
    });
    updateStagePlacement();

    if (terrasseSubTab === '3d') {
      // `obj` peut etre absent (plan sans terrasse) : la scene se construit alors avec le terrain,
      // les batiments et le reste du plan, sans structure de terrasse.
      const obj = etat.objects.find(o => o.key === etat.terrasseSelectedKey) || null;
      document.getElementById('terrasse3dLoading').style.display = chargement.three ? 'none' : '';
      ctx.ensureThreeLoaded(() => {
        document.getElementById('terrasse3dLoading').style.display = 'none';
        document.getElementById('terrasse3dWrap').style.display = 'block';
        ctx.buildThreeScene(obj);
      });
    } else if (vue3d.scene) {
      ctx.disposeThreeScene();
      document.getElementById('terrasse3dWrap').style.display = 'none';
    }
  }

  /** Remet a jour tout le mode Terrasse pour la terrasse courante. */
  function refreshTerrasseView(): void {
    if (!ctx.rebuildTerrasseSelector()) return;
    const obj = etat.objects.find(o => o.key === etat.terrasseSelectedKey);
    if (!obj) {
      // Vue 3D sans terrasse : rien a configurer, mais la scene doit quand meme se construire.
      rebuildTerrasseSubTabs();
      return;
    }
    ctx.ensureConstruction(obj);
    const fitBtn = document.getElementById('fitBtn');
    if (fitBtn) fitBtn.style.display = 'block';
    if (terrasseLastFittedKey !== obj.key) {
      ctx.fitToObject(obj);
      terrasseLastFittedKey = obj.key;
    }
    rebuildTerrasseSubTabs();
    ctx.rendrePanneauxTerrasse(obj);
  }

  return {
    refreshTerrasseView,
    rebuildTerrasseSubTabs,
    updateStagePlacement,
    ouvrirVisionneuse,

    allerAuPlan() { appliquerVue('plan'); },

    /**
     * Retour au mode Terrasse depuis son bouton. Si l'on regardait la Vue 3D, aucun sous-onglet
     * n'etait marque actif : on revient sur Construction, le point d'entree naturel.
     */
    allerAuModeTerrasse() {
      if (terrasseSubTab === '3d') terrasseSubTab = 'construction';
      appliquerVue('terrasse');
    },

    /** Raccourci vers la Vue 3D depuis le haut de page, utilisable depuis Plan comme Terrasse. */
    goVue3D() {
      terrasseSubTab = '3d';
      appliquerVue('vue3d');
    },

    get sousOnglet() { return terrasseSubTab; },
    get vue() { return vueCourante; }
  };
}
