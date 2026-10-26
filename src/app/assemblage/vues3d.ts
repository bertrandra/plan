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
import { modeDiagnostic, couleurDiagnostic } from '../diagnostic.js';
import { controleurAudit } from '../audit/courant.js';
import { chargerTexturePolyhaven, libererTexturesPartagees } from '../../three/chargeurs.js';
import { glb, soleilVue3d, signaler3d, vue3d, affichage3d, reglerGlb, reglerSoleilVue3d, HAUTEUR_YEUX_M } from '../../three/etat3d.js';
import { avecMoteur3d, moteur3d, type Moteur3d } from '../../three/demande3d.js';
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
import type { Surbrillance3d } from '../../three/scene.js';
import type { RectFenetre } from '../../three/comparaison3d.js';
import type { CameraConservee } from '../../three/glbViewer.js';
import type { creerNavigation3d } from '../../three/navigation.js';
import type { ServiceVues3d } from '../../zones/vue3d/communs.js';

export interface DependancesVues3d {
  affichage: Affichage;
  createObjectDOM: (obj: ObjetPlan) => void;
  resultats: Resultats;
}

type Navigation3d = ReturnType<typeof creerNavigation3d>;

export function creerVues3d(atelier: Atelier, magasin: Magasin, commandes: RegistreCommandes, d: DependancesVues3d) {
  const { etat } = atelier;
  const diagnostic = modeDiagnostic();
  const { lieuActuel } = d.affichage;
  // Le moteur de la 3D se charge a la premiere ouverture (three/demande3d.ts, AD-10). Avant, aucune scene n'existe : ce qui agit
  // sur la scene ouverte ne fait rien (`moteur3d()` est null), ce qui doit la faire exister la charge d'abord (`avecMoteur3d`).
  const appliquerLumiereVue3d = () => { moteur3d()?.appliquerSoleilVue3d({ lieuActuel }); };
  const rafraichirVisionneuse = (camera: CameraConservee = null) => avecMoteur3d((m) => m.rafraichirVisionneuseGlb(camera, { lieuActuel }));

  const construire = (m: Moteur3d, obj: ObjetPlan | null) => m.buildThreeScene(obj, etat, {
    appliquerLumiereVue3d, applyMode3D: () => navigation(m).applyMode3D(), chargerTexturePolyhaven, disposeThreeScene: m.disposeThreeScene,
    elevationOf, hauteurAppuiMm, objetMasque: d.affichage.objetMasque, positionMat,
    syncControlesSoleilVue3d: m.syncControles, trouverParcelleCloture: d.affichage.trouverParcelleCloture,
    orthoActif: () => ortho.actif,
    // ?mode=devroof ou devwall (app/diagnostic.ts) : les batiments peints selon l'origine de leur toit ou de leurs murs.
    ...(diagnostic ? { couleurDiagnostic: (o: ObjetPlan) => couleurDiagnostic(o, diagnostic) } : {}),
    // ?mode=audit (app/audit/) : les batiments marques sur le terrain, en rouge.
    ...(!diagnostic && controleurAudit() ? { couleurDiagnostic: (o: ObjetPlan) => controleurAudit()?.couleur(o) ?? null } : {}),
    // Le paysage (tuiles larges, sous les fines) suit le voisinage, comme sur le plan.
    orthoTuiles: () => (etat.voisinageVisible ? [...ortho.tuilesLarges, ...ortho.tuiles] : ortho.tuiles)
  });
  /** Rebatit la Vue 3D ; sans moteur, il n'y a pas de scene a rebatir. */
  const buildThreeScene = (obj: ObjetPlan | null) => { const m = moteur3d(); if (m) construire(m, obj); };
  // Le pilotage des deux vues (zoom, mode du glisser, points de vue, plein page) vit dans three/navigation.ts, cree avec le moteur.
  let nav3d: Navigation3d | null = null;
  const navigation = (m: Moteur3d): Navigation3d =>
    (nav3d ??= m.creerNavigation3d(etat, { showErrBanner, hauteurFinieMm, ouvrirVue3d: () => { commandes.executer('vue.3d'); } }));
  /** Un geste sur une vue ouverte : sans moteur, aucune vue n'est ouverte. */
  const siOuverte = (f: (n: Navigation3d) => void) => { const m = moteur3d(); if (m) f(navigation(m)); };
  const reglagesVue3d = brancherVue3d(atelier, {
    zoom3D: (f) => siOuverte((n) => n.zoom3D(f)), setMode3D: (mode) => siOuverte((n) => n.setMode3D(mode)), buildThreeScene,
    createObjectDOM: d.createObjectDOM,
    hauteurDesYeux: () => siOuverte((n) => n.hauteurDesYeux()),
    setVue3dPleinePage: (a) => siOuverte((n) => n.setVue3dPleinePage(a)),
    setGlbViewerPleinePage: (a) => siOuverte((n) => n.setGlbViewerPleinePage(a)),
    vue3dPleinePage: () => affichage3d.pleinePage3d,
    glbViewerPleinePage: () => affichage3d.pleinePageGlb,
    resizeThreeScene: () => siOuverte((n) => n.resizeThreeScene()), resizeGlbViewerScene: () => siOuverte((n) => n.resizeGlbViewerScene()),
    appliquerLumiere: appliquerLumiereVue3d, lieuActuel
  }, commandes);

  const modes = creerModes({
    terrasseCourante: () => terrasseCourante(etat),
    ensureConstruction, render: atelier.render,
    // Ouvrir la Vue 3D charge le moteur, puis three.js, puis construit la scene.
    ensureThreeLoaded: (cb) => avecMoteur3d((m) => m.ensureThreeLoaded(cb)),
    buildThreeScene, disposeThreeScene: () => { moteur3d()?.disposeThreeScene(); },
    libererTexturesPartagees,
    // Une seule scene 3D active a la fois : ouvrir la visionneuse jette la Vue 3D.
    preparerVisionneuse() { avecMoteur3d((m) => { m.disposeThreeScene(); m.syncControlesGlb(); rafraichirVisionneuse(); }); },
    quitterPleinPageVisionneuse() { if (affichage3d.pleinePageGlb) siOuverte((n) => n.setGlbViewerPleinePage(false)); },
    disposeGlbViewerScene: () => { moteur3d()?.disposeGlbViewerScene(); },
    signalerVue: (vue) => magasin.definirVue(vue),
    rendreMaintenant: (changer) => flushSync(changer),
    rendrePanneauxTerrasse(obj) { d.resultats.actualiserTerrasse(obj); }
  });

  // Un nouvel export pendant que la visionneuse est ouverte s'y reflete ; fermee, rien n'est construit.
  const genererGlb = (telecharger: boolean) => avecMoteur3d((m) => m.genererGlb(etat, telecharger, {
    buildThreeScene: (obj) => construire(m, obj), rafraichirVisionneuseGlbSiOuverte: () => { if (glb.ouvert) rafraichirVisionneuse(); }, telechargerBinaire
  }));

  brancherBoutonsDeVue({
    allerAuPlan: () => modes.allerAuPlan(),
    goVue3D: () => modes.goVue3D(),
    ouvrirVisionneuse: () => modes.ouvrirVisionneuse()
  }, commandes);
  const reglagesVisionneuse = brancherVisionneuse(atelier, {
    genererGlb,
    rafraichir: (cam) => rafraichirVisionneuse(cam),
    appliquerLumiere: () => { moteur3d()?.appliquerLumiereGlb({ lieuActuel }); },
    remplacerFond: () => { moteur3d()?.remplacerFondGlb(); },
    hauteurFinieMm, hauteurYeuxM: HAUTEUR_YEUX_M
  }, commandes);

  // Les deux panneaux 3D (zones/vue3d/) : les memes cinq reglages de soleil, deux fois — les deux vues
  // reglent leur soleil separement —, les cases de chaque vue, et les points de vue.
  const vues3d: ServiceVues3d = {
    reglages: reglagesVue3d,
    visionneuse: reglagesVisionneuse,
    soleilGlb: reglagesSoleil({ etat: glb, regler: reglerGlb, syncSemaine: () => { moteur3d()?.syncSemaineGlb(); }, signaler: signaler3d,
      appliquer: () => { moteur3d()?.appliquerLumiereGlb({ lieuActuel }); } }),
    soleil3d: reglagesSoleil({ etat: soleilVue3d, regler: reglerSoleilVue3d, syncSemaine: () => { moteur3d()?.syncSemaineDepuisDate(); }, signaler: signaler3d,
      appliquer: appliquerLumiereVue3d }),
    // Aller a un point de vue ouvre la Vue 3D au besoin (three/navigation.ts) : le moteur se charge d'abord.
    allerAuPointDeVue: (vp) => avecMoteur3d((m) => navigation(m).allerAuPointDeVue(vp)),
    allerAuPointDeVueGlb: (vp) => siOuverte((n) => n.allerAuPointDeVueGlb(vp)),
    libelleLieu: d.affichage.libelleLieu, formatHeure: formatHeureMin,
    redimensionner3d: () => siOuverte((n) => n.resizeThreeScene()), redimensionnerGlb: () => siOuverte((n) => n.resizeGlbViewerScene())
  };

  return {
    buildThreeScene, genererGlb, vues3d,
    /**
     * Remplace ces objets dans la Vue 3D ouverte, sans la rebatir ; faux si elle n'est plus la meme.
     * `objets` : d'autres objets que ceux du plan, l'apercu des propositions d'un audit
     * (app/audit/parcelle/validation.ts) ; le plan lui-meme n'est pas touche.
     */
    remplacerObjets3d: (cles: readonly string[], objets?: readonly ObjetPlan[]): boolean =>
      moteur3d()?.remplacerObjets3d(cles, objets ? { ...etat, objects: [...objets] } : etat) ?? false,
    /**
     * L'avant et l'apres d'un audit en deux vues de la Vue 3D ouverte (three/comparaison3d.ts), sur la
     * meme scene et la meme camera ; null revient a la vue unique. Le plan n'est pas touche.
     */
    comparerObjets3d: (apres: { cles: readonly string[]; objets: readonly ObjetPlan[]; parcelle: ObjetPlan | null } | null) =>
      moteur3d()?.comparerObjets3d(apres ? { cles: apres.cles, etat: { ...etat, objects: [...apres.objets] }, parcelle: apres.parcelle } : null),
    /** Surligne ce que vise la ligne choisie des propositions d'un audit, dans les deux vues ; null efface. */
    surlignerDans3d: (s: Surbrillance3d | null, aussi?: readonly Surbrillance3d[], viser?: boolean) => moteur3d()?.surlignerDans3d(s, aussi, viser),
    /** Ou est l'ecran pose sur la Vue 3D (pixels de la fenetre) : les deux vues l'evitent. */
    cadrerDeuxVues: (panneau: RectFenetre | null) => { moteur3d()?.cadrerDeuxVues(panneau, vue3d.scene); },
    allerAuPointDeVue: vues3d.allerAuPointDeVue,
    refreshTerrasseView: () => modes.refreshTerrasseView()
  };
}

export type Vues3d = ReturnType<typeof creerVues3d>;
