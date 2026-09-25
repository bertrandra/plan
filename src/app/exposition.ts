// La carte d'exposition : ou chaque commande se trouve, dans chaque classe d'ecran
// (MD/spec-ihm-mobile.md §3.1 et annexe A).
//
// La regle de la migration mobile est qu'on ne perd rien. Une promesse d'exhaustivite ne tient que
// si une machine la verifie : cette table dit, pour chaque commande du registre, les emplacements
// qui l'exposent sur telephone (`compact`), sur tablette (`moyen`) et sur bureau (`large`), et
// `tests/unit/app/exposition.test.ts` echoue quand une commande declaree n'y figure pas, quand une
// classe n'a aucun emplacement pour elle, ou quand l'emplacement nomme ne la porte pas dans son code.
//
// C'est une donnee, pas une logique : aucune zone ne la lit pour se dessiner. Elle decrit ce que les
// zones font, et c'est le test qui les confronte.

export type Classe = 'compact' | 'moyen' | 'large';
export const CLASSES: Classe[] = ['compact', 'moyen', 'large'];

/**
 * Un endroit ou une commande peut s'exposer. `html:<id>` : un element d'index.html lie a la commande
 * par le registre (`cmd.bouton`). `sansObjet` : la commande n'a pas de sens dans cette classe, et le
 * dit (seul le plein ecran des vues 3D y a droit, voir le test).
 */
export type Emplacement =
  | 'palette' | 'rail' | 'feuilleOutils'
  | 'navigation' | 'barreHaute' | 'feuilleProjet'
  | 'menuFichier' | 'menuExporter' | 'menuAffichage' | 'menuAide'
  | 'surimpression' | 'selection' | 'inspecteur' | 'explorateur'
  | 'clavier' | 'premierPas' | 'sansObjet'
  | `html:${string}`;

type Ligne = Record<Classe, Emplacement[]>;

/** La meme exposition dans les trois classes. */
const partout = (...e: Emplacement[]): Ligne => ({ compact: e, moyen: e, large: e });

export const EXPOSITION: Record<string, Ligne> = {
  // ---- Objets (Z2) ----------------------------------------------------------------------------
  'objet.annuler': partout('palette'),
  'objet.ajouter.polygone': partout('palette'),
  'objet.ajouter.rectangle': partout('palette'),
  'objet.ajouter.chemin': partout('palette'),
  'objet.ajouter.cercle': partout('palette'),
  'objet.ajouter.parasol': partout('palette'),
  'objet.ajouter.pointDeVue': partout('palette'),
  'objet.dupliquer': partout('palette'),
  'objet.supprimer': partout('palette'),
  'objet.reculer': partout('palette'),
  'objet.positionInitiale': partout('palette', 'inspecteur'),
  'objet.aligner': partout('palette'),

  // ---- Projet (Z1, Z5) ------------------------------------------------------------------------
  'projet.reinitialiser': partout('inspecteur'),
  'projet.nouveau': partout('menuFichier'),
  'projet.enregistrer': partout('menuFichier', 'barreHaute'),
  'projet.supprimer': partout('menuFichier'),
  'projet.depuisAdresse': partout('menuFichier', 'premierPas'),
  'projet.actualiserIgn': partout('menuFichier'),

  // ---- Affichage ------------------------------------------------------------------------------
  'affichage.nord': partout('menuAffichage'),
  'affichage.voisinage': partout('menuAffichage', 'explorateur'),
  'affichage.grille': partout('menuAffichage', 'surimpression'),
  'affichage.orthophoto': partout('menuAffichage'),
  'affichage.orthoOpacite': partout('menuAffichage'),
  'affichage.orthoParcelleOpacite': partout('menuAffichage'),
  'affichage.orthoParcelleDefaut': partout('menuAffichage'),

  // ---- Vues -----------------------------------------------------------------------------------
  'vue.ajuster': partout('surimpression'),
  'vue.plan': partout('barreHaute'),
  'vue.3d': partout('barreHaute'),
  'vue.visionneuse': partout('barreHaute'),

  // ---- Cotes, PLU, terrasse -------------------------------------------------------------------
  'mesure.recalculer': partout('html:recalcMeasureBtn'),
  'mesure.effacer': partout('html:clearMeasureBtn'),
  'mesure.nouvelle': partout('palette'),
  'plu.interroger': partout('html:pluInterrogerBtn'),
  'terrasse.optimisation': partout('inspecteur'),

  // ---- Fichier et exports ---------------------------------------------------------------------
  'fichier.importerSvg': partout('menuFichier'),
  'fichier.exporterJson': partout('menuFichier'),
  'fichier.importerJson': partout('menuFichier'),
  'export.svg': partout('menuExporter'),
  'export.png': partout('menuExporter'),
  'export.resume': partout('menuExporter', 'html:exportBtn'),
  'export.dxf': partout('menuExporter'),
  'export.pdf': partout('menuExporter'),
  'export.dossier': partout('menuExporter'),
  'export.glb': partout('menuExporter'),

  // ---- Vue 3D ---------------------------------------------------------------------------------
  '3d.zoomAvant': partout('html:terrasse3dZoomIn'),
  '3d.zoomArriere': partout('html:terrasse3dZoomOut'),
  '3d.modeOrbite': partout('html:terrasse3dModeOrbit'),
  '3d.modeDeplacement': partout('html:terrasse3dModePan'),
  '3d.modeZoom': partout('html:terrasse3dModeZoom'),
  '3d.hauteurDesYeux': partout('html:terrasse3dEyeLevel'),
  '3d.enregistrerPng': partout('html:terrasse3dSavePng'),
  '3d.enregistrerPointDeVue': partout('html:terrasse3dSaveViewBtn'),
  '3d.pleinePage': partout('html:terrasse3dFullPageBtn'),

  // ---- Visionneuse ----------------------------------------------------------------------------
  'visionneuse.generer': partout('html:glbViewerExporterBtn'),
  'visionneuse.regenerer': partout('html:glbViewerRegenBtn'),
  'visionneuse.zoomAvant': partout('html:glbViewerZoomIn'),
  'visionneuse.zoomArriere': partout('html:glbViewerZoomOut'),
  'visionneuse.hauteurDesYeux': partout('html:glbViewerEyeLevel'),
  'visionneuse.pleinePage': partout('html:glbViewerFullPageBtn')
};

/**
 * Les commandes qui ont le droit d'etre `sansObjet` dans une classe, et pourquoi. La liste est
 * fermee : le test refuse toute autre commande marquee ainsi.
 */
export const SANS_OBJET_ADMIS: Record<string, string> = {
  '3d.pleinePage': 'Sur telephone, la vue 3D occupe deja tout l\'ecran.',
  'visionneuse.pleinePage': 'Sur telephone, la visionneuse occupe deja tout l\'ecran.'
};
