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
// 4) : la terrasse courante suit la selection (core/contexteTerrasse.ts), ses resultats — chiffrage,
// coupe, implantation, chantier, methode — sont des onglets du tiroir (app/tiroir.ts, etape 5), sa
// construction se regle dans l'inspecteur (etape 4), et ses couches se dessinent sur le plan quand
// l'explorateur les demande. Ce module ne garde de l'ancien mode que la Vue 3D, qui en etait un
// sous-onglet, et le rafraichissement des panneaux de la terrasse.

import { glb, chargement } from '../three/etat3d.js';
import { libererTexturesPartagees } from '../three/chargeurs.js';
import type { ObjetPlan, Construction } from '../model/types.js';

/** Ce que l'utilisateur regarde. Trois vues, un seul bouton allume. */
export type Vue = 'plan' | 'vue3d' | 'visionneuse';

/** Les zones de la vue Plan : montrees ensemble, cachees ensemble. */
const ZONES_PLAN = ['zoneAtelier', 'zoneResultats'];

/** Ce que le pilotage des vues doit pouvoir declencher ailleurs. */
export interface ContexteModes {
  /** La terrasse courante, ou rien : c'est elle que l'onglet Terrasse et la Vue 3D decrivent. */
  terrasseCourante: () => ObjetPlan | undefined;
  ensureConstruction: (obj: ObjetPlan) => Construction;
  ensureThreeLoaded: (cb: () => void) => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  disposeThreeScene: () => void;
  render: () => void;
  /** Les panneaux du tiroir a remplir pour la terrasse courante. */
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
      // Le seul endroit d'ou les textures partagees peuvent etre rendues a la carte graphique :
      // ici, aucune scene 3D n'est vivante — la visionneuse a ete fermee en tete de fonction, et
      // la Vue 3D vient d'etre demolie. Le faire dans `disposeThreeScene` aurait vide le cache a
      // chaque case cochee, puisque reconstruire une scene commence par demolir la precedente.
      libererTexturesPartagees();
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

  /** Refait les panneaux de la terrasse courante — chiffrage, coupe, implantation, chantier, methode. */
  function refreshTerrasseView(): void {
    const obj = ctx.terrasseCourante();
    if (!obj) return;
    ctx.ensureConstruction(obj);
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
