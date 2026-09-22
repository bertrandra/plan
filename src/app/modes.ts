// Ce que l'utilisateur regarde (spec §6.4, app/).
//
// Trois vues se partagent la page — le plan, la Vue 3D et la visionneuse GLB — et un seul bouton
// doit etre allume. La regle de ce module : `vueCourante` est la seule verite sur ce qui est
// affiche, `appliquerVue()` est le seul endroit qui montre et cache les zones, et la barre
// d'application (zones/) allume le bouton d'apres ce qu'on lui signale.
//
// Jusqu'a l'etape 3 de la reconstruction de l'interface, la terrasse etait une quatrieme vue — un
// « mode Terrasse » qui deplacait physiquement le `<svg>` entre deux conteneurs, verrouillait le
// plan et cachait la selection. Elle est devenue un contexte du plan (spec-ihm-zones §7, decision
// 4) : la terrasse courante suit la selection (core/contexteTerrasse.ts), ses panneaux — construction,
// chiffrage, coupe, implantation, chantier, methode — sont l'onglet Terrasse du panneau, et ses
// couches se dessinent sur le plan quand l'explorateur les demande. Ce module ne garde de l'ancien
// mode que les sous-onglets de cet onglet, et la Vue 3D qui en etait l'un d'eux.

import { glb, chargement } from '../three/etat3d.js';
import type { ObjetPlan, Construction } from '../model/types.js';

/** Ce que l'utilisateur regarde. Trois vues, un seul bouton allume. */
export type Vue = 'plan' | 'vue3d' | 'visionneuse';

/** Les zones de la vue Plan : montrees ensemble, cachees ensemble. */
const ZONES_PLAN = ['zoneAtelier', 'panelTabs', 'panel'];

/** Les sous-onglets de l'onglet Terrasse : leur cle, leur libelle, et le panneau qu'ils montrent. */
const SOUS_ONGLETS: [string, string, string][] = [
  ['construction', 'Construction', 'terrasseTabConstruction'],
  ['bom', 'BOM', 'terrasseTabBom'],
  ['coupe', 'Plan de coupe', 'terrasseTabCoupe'],
  ['implantation', 'Implantation', 'terrasseTabImplantation'],
  ['chantier', 'Chantier', 'terrasseTabChantier'],
  ['methode', 'Méthode', 'terrasseTabMethode']
];

/** Ce que le pilotage des vues doit pouvoir declencher ailleurs. */
export interface ContexteModes {
  /** La terrasse courante, ou rien : c'est elle que l'onglet Terrasse et la Vue 3D decrivent. */
  terrasseCourante: () => ObjetPlan | undefined;
  ensureConstruction: (obj: ObjetPlan) => Construction;
  ensureThreeLoaded: (cb: () => void) => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  disposeThreeScene: () => void;
  render: () => void;
  /** Les panneaux a remplir pour la terrasse courante. */
  rendrePanneauxTerrasse: (obj: ObjetPlan) => void;
  /** Charge et affiche le dernier .glb exporte, une fois son panneau visible. */
  preparerVisionneuse: () => void;
  /** Rend la visionneuse a son format normal, avant de la fermer. */
  quitterPleinPageVisionneuse: () => void;
  /** Libere la scene de la visionneuse. */
  disposeGlbViewerScene: () => void;
  /** Publie la vue courante : c'est la barre d'application (zones/) qui allume le bon bouton. */
  signalerVue: (vue: Vue) => void;
}

export function creerModes(ctx: ContexteModes) {
  let vueCourante: Vue = 'plan';
  let terrasseSubTab = 'construction';

  function afficher(ids: string[], visible: boolean, valeurVisible = ''): void {
    ids.forEach(id => { document.getElementById(id)!.style.display = visible ? valeurVisible : 'none'; });
  }

  /**
   * Applique la vue demandee : zones, scene 3D, bouton allume.
   *
   * La visionneuse recouvre la page — d'ou le traitement a part. Toute autre vue la referme
   * d'abord : sinon son canevas resterait actif derriere le panneau qu'on rouvre.
   */
  function appliquerVue(vue: Vue): void {
    if (vueCourante === 'visionneuse' && vue !== 'visionneuse') fermerVisionneuse();
    vueCourante = vue;
    ctx.signalerVue(vue);
    if (vue === 'visionneuse') return;

    const surLePlan = vue === 'plan';
    afficher(ZONES_PLAN, surLePlan);
    afficher(['vue3dPanel'], !surLePlan, 'block');
    if (surLePlan) {
      ctx.disposeThreeScene();
      document.getElementById('terrasse3dWrap')!.style.display = 'none';
      ctx.render();
    } else {
      construireVue3d();
    }
  }

  /**
   * La Vue 3D n'a pas de bouton « afficher / masquer » : elle est active tant que la vue l'est, et
   * se reconstruit a chaque passage ici — apres un changement de construction, par exemple. Sans
   * terrasse, la scene se construit quand meme : un plan de parcelle avec ses batiments se regarde
   * en 3D tel quel.
   */
  function construireVue3d(): void {
    const obj = ctx.terrasseCourante() || null;
    document.getElementById('terrasse3dLoading')!.style.display = chargement.three ? 'none' : '';
    ctx.ensureThreeLoaded(() => {
      document.getElementById('terrasse3dLoading')!.style.display = 'none';
      document.getElementById('terrasse3dWrap')!.style.display = 'block';
      ctx.buildThreeScene(obj);
    });
  }

  function ouvrirVisionneuse(): void {
    glb.ouvert = true;
    appliquerVue('visionneuse');
    afficher(ZONES_PLAN, false);
    afficher(['vue3dPanel'], false);
    document.getElementById('glbViewerPanel')!.style.display = 'block';
    ctx.preparerVisionneuse();
  }

  function fermerVisionneuse(): void {
    if (!glb.ouvert) return;
    glb.ouvert = false;
    // Avant de cacher le panneau : sinon la reouverture repartirait directement en plein page.
    ctx.quitterPleinPageVisionneuse();
    document.getElementById('glbViewerPanel')!.style.display = 'none';
    ctx.disposeGlbViewerScene();
  }

  // ------------------------------------------------------------------------------------------
  // L'onglet Terrasse et ses sous-onglets
  // ------------------------------------------------------------------------------------------

  /** Reconstruit la rangee de sous-onglets et montre le panneau choisi. */
  function rebuildTerrasseSubTabs(): void {
    const div = document.getElementById('terrasseSubTabs')!;
    div.innerHTML = '';
    SOUS_ONGLETS.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.className = 'panelTabBtn' + (terrasseSubTab === key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { terrasseSubTab = key; rebuildTerrasseSubTabs(); });
      div.appendChild(b);
    });
    SOUS_ONGLETS.forEach(([key, , panelId]) => {
      document.getElementById(panelId)!.style.display = (terrasseSubTab === key) ? '' : 'none';
    });
  }

  /**
   * Remet a jour tout l'onglet Terrasse pour la terrasse courante. Sans terrasse, le message
   * d'accueil dit comment en obtenir une.
   */
  function refreshTerrasseView(): void {
    const obj = ctx.terrasseCourante();
    document.getElementById('terrasseEmpty')!.style.display = obj ? 'none' : 'block';
    document.getElementById('terrasseContent')!.style.display = obj ? 'block' : 'none';
    if (!obj) return;
    ctx.ensureConstruction(obj);
    rebuildTerrasseSubTabs();
    ctx.rendrePanneauxTerrasse(obj);
  }

  return {
    refreshTerrasseView,
    ouvrirVisionneuse,
    allerAuPlan() { appliquerVue('plan'); },
    goVue3D() { appliquerVue('vue3d'); },
    get vue() { return vueCourante; }
  };
}
