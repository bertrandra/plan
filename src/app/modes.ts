// Ce que l'utilisateur regarde : mode Plan, mode Terrasse et ses sous-onglets (spec §6.4, app/).
//
// Trois choses vivent ici, et elles sont liees :
//
// **1. Les deux modes.** Le plan (dessiner la parcelle et ses objets) et la terrasse (la construire).
// La « Vue 3D » n'en est **pas un troisieme** : c'est le mode Terrasse sur son sous-onglet `3d`,
// avec son propre bouton en haut de page. Ce choix evite de retoucher les endroits qui testent
// encore `appMode === 'terrasse'` ; le prix a payer est que l'apparence des boutons doit etre
// corrigee a la main apres chaque bascule, ce qui explique les `classList` disperses ci-dessous.
//
// **2. Le plan physique se deplace.** `#stage` n'existe qu'une fois dans la page : il est *deplace*
// entre sa position du mode Plan, le sous-onglet Canevas (ou le voir par-dessous la construction a
// un sens), et un emplacement cache pour tous les autres sous-onglets. Ni duplique, ni laisse
// flottant au-dessus d'onglets qui n'en ont que faire — d'ou la memorisation de sa place d'origine
// au premier deplacement, seule facon de l'y remettre ensuite.
//
// **3. La visionneuse GLB est un panneau independant**, pas un mode. Tout retour explicite vers Plan
// ou Terrasse doit donc la refermer : sinon son canevas resterait actif en arriere-plan, sous le
// panneau qu'on vient de rouvrir.

import { vue3d, chargement } from '../three/etat3d.js';

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

/** Ce que le pilotage des modes doit pouvoir declencher ailleurs. */
export interface ContexteModes {
  /** Le plan lui-meme, celui qu'on deplace d'un emplacement a l'autre. */
  stage: HTMLElement;
  /** Le groupe SVG du calque des couches, a vider en quittant le mode Terrasse. */
  terrasseLayerGroup: SVGGElement;
  fermerVisionneuseGlb: () => void;
  /** Reconstruit la barre de choix de la terrasse ; `false` quand il n'y a rien a montrer. */
  rebuildTerrasseSelector: () => boolean;
  fitToObject: (obj) => void;
  ensureConstruction: (obj) => unknown;
  ensureThreeLoaded: (cb: () => void) => void;
  buildThreeScene: (obj) => void;
  disposeThreeScene: () => void;
  render: () => void;
  /** Les panneaux a remplir quand la terrasse courante change. */
  rendrePanneauxTerrasse: (obj) => void;
}

export function creerModes(etat, ctx: ContexteModes) {
  let terrasseSubTab = 'construction';
  let stageHomeParent: Node | null = null, stageHomeNext: Node | null = null;
  // La terrasse sur laquelle la vue a deja ete cadree : on ne recadre qu'au changement, sinon
  // chaque retour au mode Terrasse annulerait le zoom que l'utilisateur venait de regler.
  let terrasseLastFittedKey: string | null = null;

  function captureStageHome(): void {
    if (!stageHomeParent) {
      stageHomeParent = ctx.stage.parentNode;
      stageHomeNext = ctx.stage.nextSibling;
    }
  }

  function updateStagePlacement(): void {
    captureStageHome();
    if (etat.appMode === 'terrasse' && terrasseSubTab === 'canevas') {
      document.getElementById('stageHost').appendChild(ctx.stage);
    } else if (etat.appMode === 'terrasse') {
      document.getElementById('stageParking').appendChild(ctx.stage);
    } else {
      stageHomeParent.insertBefore(ctx.stage, stageHomeNext);
    }
  }

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
      b.addEventListener('click', () => {
        terrasseSubTab = key;
        // Choisir un sous-onglet normal alors que « Vue 3D » etait mis en avant doit rendre sa
        // place a « Terrasse » : un seul bouton du haut actif a la fois.
        document.getElementById('mode3dBtn').classList.remove('active');
        document.getElementById('modeTerrasseBtn').classList.add('active');
        rebuildTerrasseSubTabs();
      });
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

  function setAppMode(mode: string): void {
    ctx.fermerVisionneuseGlb();
    etat.appMode = mode;
    document.getElementById('modePlanBtn').className = 'objbtn' + (mode === 'plan' ? ' active' : '');
    document.getElementById('modeTerrasseBtn').className = 'objbtn' + (mode === 'terrasse' ? ' active' : '');
    // Tout appel normal eteint « Vue 3D » ; `goVue3D` le rallume juste apres.
    document.getElementById('mode3dBtn').classList.remove('active');
    const showPlan = mode === 'plan';
    document.getElementById('selector').style.display = showPlan ? '' : 'none';
    document.getElementById('planActions').style.display = showPlan ? '' : 'none';
    document.getElementById('panelTabs').style.display = showPlan ? '' : 'none';
    document.getElementById('panel').style.display = showPlan ? '' : 'none';
    document.getElementById('terrasseTopBar').style.display = showPlan ? 'none' : 'block';
    document.getElementById('terrassePanel').style.display = showPlan ? 'none' : 'block';
    if (mode === 'terrasse') {
      refreshTerrasseView();
    } else {
      ctx.terrasseLayerGroup.innerHTML = '';
      terrasseLastFittedKey = null; // un retour ulterieur en mode Terrasse recadrera
      ctx.disposeThreeScene();
      document.getElementById('terrasse3dWrap').style.display = 'none';
      updateStagePlacement();
      // Le plan masque la selection tant qu'il sert de fond en mode Terrasse : revenir doit la
      // redessiner, sinon l'objet reste visuellement deselectionne alors qu'il est bien celui que
      // le panneau edite.
      ctx.render();
    }
  }

  return {
    setAppMode,
    refreshTerrasseView,
    rebuildTerrasseSubTabs,
    updateStagePlacement,

    /** Raccourci vers la Vue 3D depuis le haut de page, utilisable depuis Plan comme Terrasse. */
    goVue3D() {
      terrasseSubTab = '3d';
      setAppMode('terrasse');
      document.getElementById('modeTerrasseBtn').classList.remove('active');
      document.getElementById('mode3dBtn').classList.add('active');
    },

    /**
     * Retour au mode Terrasse depuis son bouton. Si l'on regardait la Vue 3D, aucun sous-onglet
     * n'etait marque actif : on revient sur Construction, le point d'entree naturel.
     */
    allerAuModeTerrasse() {
      if (terrasseSubTab === '3d') terrasseSubTab = 'construction';
      setAppMode('terrasse');
    },

    get sousOnglet() { return terrasseSubTab; }
  };
}
