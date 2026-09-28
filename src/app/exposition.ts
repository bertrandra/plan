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

/** Un outil de la palette : feuille Outils sur telephone, rail sur tablette, palette sur bureau. */
const outil = (...autres: Emplacement[]): Ligne => ({
  compact: ['feuilleOutils', ...autres], moyen: ['rail', ...autres], large: ['palette', ...autres]
});

/** Une entree d'un menu de Z1 : feuille Projet sur telephone, menu (deroulant) ailleurs. */
const menu = (m: Emplacement, ...autres: Emplacement[]): Ligne => ({
  compact: ['feuilleProjet', ...autres], moyen: [m, ...autres], large: [m, ...autres]
});

export const EXPOSITION: Record<string, Ligne> = {
  // ---- Objets (Z2) ----------------------------------------------------------------------------
  'objet.annuler': { compact: ['barreHaute', 'clavier'], moyen: ['rail', 'clavier'], large: ['palette', 'clavier'] },
  'objet.ajouter.polygone': outil(),
  'objet.ajouter.rectangle': outil(),
  'objet.ajouter.chemin': outil(),
  'objet.ajouter.cercle': outil(),
  'objet.ajouter.parasol': outil(),
  'objet.ajouter.pointDeVue': outil(),
  'objet.dupliquer': { compact: ['feuilleOutils', 'selection'], moyen: ['rail', 'selection'], large: ['palette'] },
  'objet.supprimer': { compact: ['feuilleOutils', 'selection'], moyen: ['rail', 'selection'], large: ['palette'] },
  'objet.reculer': outil(),
  'objet.positionInitiale': outil('inspecteur'),
  'objet.aligner': outil(),

  // ---- Projet (Z1, Z5) ------------------------------------------------------------------------
  'projet.reinitialiser': partout('inspecteur'),
  'projet.nouveau': menu('menuFichier'),
  'projet.enregistrer': { compact: ['feuilleProjet', 'clavier'], moyen: ['menuFichier', 'clavier'], large: ['menuFichier', 'barreHaute', 'clavier'] },
  'projet.supprimer': menu('menuFichier'),
  'projet.depuisAdresse': menu('menuFichier', 'premierPas'),
  'projet.actualiserIgn': menu('menuFichier'),

  // ---- Affichage ------------------------------------------------------------------------------
  'affichage.nord': { compact: ['surimpression', 'feuilleProjet'], moyen: ['surimpression', 'menuAffichage'], large: ['menuAffichage'] },
  'affichage.voisinage': menu('menuAffichage', 'explorateur'),
  'affichage.grille': menu('menuAffichage', 'surimpression'),
  'affichage.orthophoto': menu('menuAffichage'),
  'affichage.orthoOpacite': menu('menuAffichage'),
  'affichage.orthoParcelleOpacite': menu('menuAffichage'),
  'affichage.orthoParcelleDefaut': menu('menuAffichage'),

  // ---- Vues -----------------------------------------------------------------------------------
  'vue.ajuster': partout('surimpression'),
  'vue.plan': partout('barreHaute'),
  'vue.3d': partout('barreHaute'),
  'vue.visionneuse': partout('barreHaute'),

  // ---- Cotes, PLU, terrasse -------------------------------------------------------------------
  'mesure.recalculer': partout('html:recalcMeasureBtn'),
  'mesure.effacer': partout('html:clearMeasureBtn'),
  'mesure.nouvelle': { compact: ['navigation', 'feuilleOutils'], moyen: ['rail'], large: ['palette'] },
  'plu.interroger': partout('html:pluInterrogerBtn'),
  'terrasse.optimisation': partout('inspecteur'),
  // Le releve de facade : la section « Facades et toit » d'un batiment, une ligne par mur.
  'facade.relever': partout('inspecteur'),
  'facade.retirer': partout('inspecteur'),

  // ---- Fichier et exports ---------------------------------------------------------------------
  'fichier.importerSvg': menu('menuFichier'),
  'fichier.exporterJson': menu('menuFichier'),
  'fichier.importerJson': menu('menuFichier'),
  'export.svg': menu('menuExporter'),
  'export.png': menu('menuExporter'),
  'export.resume': menu('menuExporter', 'html:exportBtn'),
  'export.dxf': menu('menuExporter'),
  'export.pdf': menu('menuExporter'),
  'export.dossier': menu('menuExporter'),
  'export.glb': menu('menuExporter'),

  // ---- Vue 3D ---------------------------------------------------------------------------------
  '3d.zoomAvant': partout('html:terrasse3dZoomIn'),
  '3d.zoomArriere': partout('html:terrasse3dZoomOut'),
  '3d.modeOrbite': partout('html:terrasse3dModeOrbit'),
  '3d.modeDeplacement': partout('html:terrasse3dModePan'),
  '3d.modeZoom': partout('html:terrasse3dModeZoom'),
  '3d.hauteurDesYeux': partout('html:terrasse3dEyeLevel'),
  '3d.enregistrerPng': partout('html:terrasse3dSavePng'),
  '3d.enregistrerPointDeVue': partout('html:terrasse3dSaveViewBtn'),
  '3d.pleinePage': { compact: ['sansObjet'], moyen: ['sansObjet'], large: ['html:terrasse3dFullPageBtn'] },

  // ---- Visionneuse ----------------------------------------------------------------------------
  'visionneuse.generer': partout('html:glbViewerExporterBtn'),
  'visionneuse.regenerer': partout('html:glbViewerRegenBtn'),
  'visionneuse.zoomAvant': partout('html:glbViewerZoomIn'),
  'visionneuse.zoomArriere': partout('html:glbViewerZoomOut'),
  'visionneuse.hauteurDesYeux': partout('html:glbViewerEyeLevel'),
  'visionneuse.pleinePage': { compact: ['sansObjet'], moyen: ['sansObjet'], large: ['html:glbViewerFullPageBtn'] }
};

/**
 * Les commandes qui ont le droit d'etre `sansObjet` dans une classe, et pourquoi. La liste est
 * fermee : le test refuse toute autre commande marquee ainsi.
 */
export const SANS_OBJET_ADMIS: Record<string, string> = {
  '3d.pleinePage': 'Sur telephone et tablette, la vue 3D occupe deja tout l\'ecran.',
  'visionneuse.pleinePage': 'Sur telephone et tablette, la visionneuse occupe deja tout l\'ecran.'
};
