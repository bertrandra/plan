// Les deux vues 3D et le passage de l'une a l'autre (app/assemblage/) : la Vue 3D « vivante », que
// l'on construit depuis le plan, et la visionneuse, qui relit le dernier .glb exporte.
//
// Les deux scenes sont separees : fermer l'une ne perturbe pas l'autre, et chacune regle son soleil.
// La scene elle-meme vit dans three/, le pilotage des vues dans app/modes.ts ; ce module les relie
// a l'atelier et aux commandes.

import { flushSync } from 'react-dom';
import { formatHeureMin } from '../../util/format.js';
import { telechargerBinaire } from '../../shell/download.js';
import { showErrBanner } from '../../shell/dialogs.js';
import { ensureConstruction } from '../../engine/construction.js';
import { hauteurAppuiMm, hauteurFinieMm, elevationOf } from '../../engine/hauteurs.js';
import { positionMat } from '../../engine/parasol.js';
import { terrasseCourante } from '../../core/contexteTerrasse.js';
import { ortho } from '../../render/ortho.js';
import { buildThreeScene as construireScene3D } from '../../three/scene.js';
import { creerNavigation3d, HAUTEUR_YEUX_M } from '../../three/navigation.js';
import { genererGlb as genererGlbModule } from '../../three/exportGlb.js';
import { chargerTexturePolyhaven } from '../../three/chargeurs.js';
import { glb, soleilVue3d, signaler3d } from '../../three/etat3d.js';
import {
  syncSemaineDepuisDate as syncSemaineSoleilVue3d, syncControles as syncControlesSoleil, appliquer as appliquerSoleilVue3d
} from '../../three/soleilVue3d.js';
import {
  ensureThreeLoaded, disposeThreeScene, disposeGlbViewerScene, appliquerLumiereGlb, syncSemaineGlb,
  syncControlesGlb, rafraichirVisionneuseGlb
} from '../../three/glbViewer.js';
import { brancherVue3d } from '../ecouteurs/vue3d.js';
import { brancherBoutonsDeVue } from '../ecouteurs/modes.js';
import { brancherVisionneuse } from '../ecouteurs/visionneuse.js';
import { reglagesSoleil } from '../ecouteurs/soleil.js';
import { creerModes } from '../modes.js';
import type { Affichage } from './affichage.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { Magasin } from '../magasin.js';
import type { Resultats } from '../resultats.js';
import type { ObjetPlan } from '../../model/types.js';
import type { CameraConservee } from '../../three/glbViewer.js';
import type { ServiceVues3d } from '../../zones/vue3d/communs.js';

export interface DependancesVues3d {
  affichage: Affichage;
  createObjectDOM: (obj: ObjetPlan) => void;
  resultats: Resultats;
}

export function creerVues3d(atelier: Atelier, magasin: Magasin, commandes: RegistreCommandes, d: DependancesVues3d) {
  const { etat } = atelier;
  const { lieuActuel } = d.affichage;
  const appliquerLumiereVue3d = () => appliquerSoleilVue3d({ lieuActuel });
  const rafraichirVisionneuse = (camera: CameraConservee = null) => rafraichirVisionneuseGlb(camera, { lieuActuel });

  const buildThreeScene = (obj: ObjetPlan | null) => construireScene3D(obj, etat, {
    appliquerLumiereVue3d, applyMode3D: () => nav3d.applyMode3D(), chargerTexturePolyhaven, disposeThreeScene,
    elevationOf, hauteurAppuiMm, objetMasque: d.affichage.objetMasque, positionMat,
    syncControlesSoleilVue3d: syncControlesSoleil, trouverParcelleCloture: d.affichage.trouverParcelleCloture,
    orthoActif: () => ortho.actif,
    orthoTuiles: () => ortho.tuiles
  });
  // Le pilotage des deux vues (zoom, mode du glisser, points de vue, plein page) vit dans three/navigation.ts.
  const nav3d = creerNavigation3d(etat, { showErrBanner, hauteurFinieMm, ouvrirVue3d: () => modes.goVue3D() });
  const reglagesVue3d = brancherVue3d(atelier, {
    zoom3D: (f) => nav3d.zoom3D(f), setMode3D: (m) => nav3d.setMode3D(m), buildThreeScene,
    createObjectDOM: d.createObjectDOM,
    hauteurDesYeux: () => nav3d.hauteurDesYeux(),
    setVue3dPleinePage: (a) => nav3d.setVue3dPleinePage(a),
    setGlbViewerPleinePage: (a) => nav3d.setGlbViewerPleinePage(a),
    vue3dPleinePage: () => nav3d.vue3dPleinePage,
    glbViewerPleinePage: () => nav3d.glbViewerPleinePage,
    resizeThreeScene: () => nav3d.resizeThreeScene(), resizeGlbViewerScene: () => nav3d.resizeGlbViewerScene()
  }, commandes);

  const modes = creerModes({
    terrasseCourante: () => terrasseCourante(etat),
    ensureConstruction, ensureThreeLoaded, buildThreeScene, disposeThreeScene, render: atelier.render,
    // Une seule scene 3D active a la fois : ouvrir la visionneuse jette la Vue 3D.
    preparerVisionneuse() { disposeThreeScene(); syncControlesGlb(); rafraichirVisionneuse(); },
    quitterPleinPageVisionneuse() { if (nav3d.glbViewerPleinePage) nav3d.setGlbViewerPleinePage(false); },
    disposeGlbViewerScene,
    signalerVue: (vue) => magasin.definirVue(vue),
    rendreMaintenant: (changer) => flushSync(changer),
    rendrePanneauxTerrasse(obj) { d.resultats.actualiserTerrasse(obj); }
  });

  // Un nouvel export pendant que la visionneuse est ouverte s'y reflete ; fermee, rien n'est construit.
  const genererGlb = (telecharger: boolean) => genererGlbModule(etat, telecharger, {
    buildThreeScene, rafraichirVisionneuseGlbSiOuverte: () => { if (glb.ouvert) rafraichirVisionneuse(); }, telechargerBinaire
  });

  brancherBoutonsDeVue({
    allerAuPlan: () => modes.allerAuPlan(),
    goVue3D: () => modes.goVue3D(),
    ouvrirVisionneuse: () => modes.ouvrirVisionneuse()
  }, commandes);
  const reglagesVisionneuse = brancherVisionneuse(atelier, {
    genererGlb,
    rafraichir: (cam) => rafraichirVisionneuse(cam),
    appliquerLumiere: () => appliquerLumiereGlb({ lieuActuel }),
    hauteurFinieMm, hauteurYeuxM: HAUTEUR_YEUX_M
  }, commandes);

  // Les deux panneaux 3D (zones/vue3d/) : les memes cinq reglages de soleil, deux fois — les deux vues
  // reglent leur soleil separement —, les cases de chaque vue, et les points de vue.
  const vues3d: ServiceVues3d = {
    reglages: reglagesVue3d,
    visionneuse: reglagesVisionneuse,
    soleilGlb: reglagesSoleil({ etat: glb, syncSemaine: syncSemaineGlb, signaler: signaler3d,
      appliquer: () => appliquerLumiereGlb({ lieuActuel }) }),
    soleil3d: reglagesSoleil({ etat: soleilVue3d, syncSemaine: syncSemaineSoleilVue3d, signaler: signaler3d,
      appliquer: appliquerLumiereVue3d }),
    allerAuPointDeVue: (vp) => nav3d.allerAuPointDeVue(vp),
    allerAuPointDeVueGlb: (vp) => nav3d.allerAuPointDeVueGlb(vp),
    libelleLieu: d.affichage.libelleLieu, formatHeure: formatHeureMin,
    redimensionner3d: () => nav3d.resizeThreeScene(), redimensionnerGlb: () => nav3d.resizeGlbViewerScene()
  };

  return {
    buildThreeScene, genererGlb, vues3d,
    allerAuPointDeVue: vues3d.allerAuPointDeVue,
    refreshTerrasseView: () => modes.refreshTerrasseView()
  };
}

export type Vues3d = ReturnType<typeof creerVues3d>;
