// Le catalogue des controles d'interface : ceux qui ne sont ni une commande du registre
// (app/commandes.ts) ni un champ de l'inspecteur (ui/champs/), et qui sont pourtant des controleurs
// de l'ecran (MD/spec-demos-admin.md, « Controles d'interface »).
//
// Pourquoi pas des commandes ? Une commande est un geste sur le plan, sans parametre, que le
// registre peut griser, effacer ou refuser selon les droits. Beaucoup de controles ne sont pas cela :
// un onglet, un panneau qu'on replie, un reglage de la vue 3D ne touchent pas au projet ; une case
// d'option ne fait rien seule, elle regle la commande qui suit ; supprimer *une* cote ou masquer *un*
// objet prend un parametre que `executer(id)` ne porte pas. Les forcer dans le registre en ferait de
// fausses commandes. Ils sont donc **declares ici**, avec leur cle, leur nom explicite, leur zone et
// leur nature, et le controle affiche porte `data-controle="<cle>"`.
//
// Ce que cela garantit (tests/unit/app/controlesInterface.test.ts) : toute cle `data-controle` du
// code est declaree ici, et toute declaration est utilisee dans le code. La decouverte les montre
// dans la branche « Controles d'interface », et l'inventaire les compte comme rattaches.
//
// Un controle qui modifierait un objet ou une cote hors du registre n'a pas sa place ici : il doit
// etre une commande. C'est fait depuis que le registre accepte une cible (app/commandes.ts `Cible`,
// app/ecouteurs/cibles.ts) : masquer un objet, ses etiquettes, chaque geste sur les cotes. La
// nature « objet » qui les signalait a ete retiree avec le dernier d'entre eux.
//
// La zone declaree est celle ou le controle s'affiche ; la decouverte le verifie (ecarts de zone,
// app/inventaireEcran.ts). Un controle porte par chaque feuille du telephone (`dansChaqueZone`)
// s'affiche dans la zone que la feuille porte.

export type NatureControle = 'navigation' | 'affichage' | 'vue' | 'option' | 'sortie' | 'donnee' | 'parcours';

export const NATURES: Record<NatureControle, string> = {
  navigation: 'Navigation dans l’interface : aucun effet sur le projet',
  affichage: 'Ce que le plan montre, sans modifier le projet',
  vue: 'Réglage d’une vue 3D, sans modifier le projet',
  option: 'Option d’une commande ou d’un export : elle règle ce qui suit',
  sortie: 'Montre ou imprime une information, sans modifier le projet',
  donnee: 'Saisie d’une donnée du projet (prix, cadence…)',
  parcours: 'Étape d’un écran ouvert par une commande (dialogue, import, relevé…) : c’est la commande qui porte les droits'
};

export interface ControleInterface {
  libelle: string;
  zone: string;
  nature: NatureControle;
  /** Un exemplaire par ligne (objet, cote, onglet…) : un seul controle, repete. */
  repete?: true;
  description?: string;
  /** Pour un controle de parcours : la commande, ou le champ, qui ouvre l'ecran ou il vit. */
  ouvertPar?: string;
  /** Porte par chaque feuille du telephone : il s'affiche dans la zone que la feuille porte, pas dans `zone`. */
  dansChaqueZone?: true;
  /**
   * Le controle ecrit dans le projet (classement seul, sans effet sur Plan) : s'il s'annule, et qui
   * en garde les droits — `commande` : la commande qui ouvre son ecran porte la permission d'ecrire ;
   * `lectureSeule` : le service qui ecrit le refuse en lecture seule ; `aucun` : rien ne le refuse.
   */
  ecrit?: Ecriture;
}

export interface Ecriture { annulable: boolean; droits: 'commande' | 'lectureSeule' | 'aucun' }
/** Une saisie du tiroir : `resultats.saisir` empile un instantane, et la refuse en lecture seule. */
const SAISIE: Ecriture = { annulable: true, droits: 'lectureSeule' };

const Z1 = 'Z1 Barre d’application', Z3 = 'Z3 Explorateur', Z4 = 'Z4 Vues 3D', Z5 = 'Z5 Inspecteur', Z6 = 'Z6 Résultats';
const Z8 = 'Z8 Dialogues', Z9 = 'Z9 Notifications', RELEVE = 'Relevé de façade', FEUILLES = 'Feuilles (téléphone)';
const SELECTION = 'Z4 Barre de sélection', NAVIGATION = 'Navigation (téléphone)';

/** Une etape d'un ecran qui ne s'ouvre qu'a la demande : on ne la voit pas tant qu'il est ferme. */
const etape = (zone: string, ouvertPar: string, libelle: string, plus: Partial<ControleInterface> = {}): ControleInterface =>
  ({ libelle, zone, nature: 'parcours', ouvertPar, ...plus });
const IMPORT = 'projet.depuisAdresse', ACTUALISER = 'projet.actualiserIgn', TEXTURE = 'champ Texture de l’inspecteur', RELEVER = 'facade.relever';
const DIALOGUE = 'toute commande qui pose une question';
const FICHE_AUDIT = 'appui long sur un bâtiment (mode audit), ou audit.cas';
const AUDIT_PARCELLE = 'audit.parcelle';
const CATALOGUE_AUDITS = 'admin.auditsParcelle';
const CALIBRATION = 'Admin › Calibrer la détection (?admin&ecran=calibration)';
const CE_QUE_JE_VOIS = 'audit.parcelle, ou la fiche d’un bâtiment (mode audit)';

/** Les reglages d'une vue 3D, la meme liste pour la Vue 3D et pour la visionneuse. */
function reglagesVue(vue: 'vue3d' | 'visionneuse', nom: string): Record<string, ControleInterface> {
  const v = (libelle: string, description?: string): ControleInterface => ({ libelle: libelle + ' (' + nom + ')', zone: Z4, nature: 'vue', ...(description ? { description } : {}) });
  return {
    [vue + '.reglages']: { libelle: 'Réglages (' + nom + ')', zone: Z4, nature: 'navigation', description: 'Ouvre le panneau des réglages, au doigt' },
    [vue + '.fermerReglages']: { libelle: 'Fermer les réglages (' + nom + ')', zone: Z4, nature: 'navigation' },
    [vue + '.filaire']: v('Filaire'),
    [vue + '.ombres']: v('Ombre portée'),
    [vue + '.date']: v('Date du soleil'),
    [vue + '.semaine']: v('Semaine de l’année', 'Avance ou recule la date de sept jours par cran'),
    [vue + '.heure']: v('Heure du soleil'),
    [vue + '.intensite']: v('Intensité du soleil'),
    [vue + '.appoint']: v('Lumière d’appoint'),
    [vue + '.pointDeVue']: v('Aller à un point de vue enregistré')
  };
}

export const CONTROLES: Record<string, ControleInterface> = {
  // ---- Z1 : options des commandes de fichier et d'export, aide ---------------------------------
  'fichier.option.remplacerImportSvg': { libelle: 'Supprimer les objets existants avant d’importer (SVG)', zone: Z1, nature: 'option' },
  'fichier.option.remplacerImportJson': { libelle: 'Remplacer le plan actuel (import JSON)', zone: Z1, nature: 'option' },
  'fichier.option.exportSansParcelle': { libelle: 'Exporter sans la parcelle', zone: Z1, nature: 'option' },
  'export.option.echellePdf': { libelle: 'Échelle du PDF', zone: Z1, nature: 'option' },
  'export.option.dossierEquipements': { libelle: 'Inclure l’emprise des équipements (dossier PDF)', zone: Z1, nature: 'option' },
  'aide.methode': { libelle: 'Méthode de calcul', zone: Z1, nature: 'navigation', description: 'Ouvre l’onglet Méthode du tiroir' },
  'aide.version': { libelle: 'Version', zone: Z1, nature: 'sortie' },
  'projet.choisir': { libelle: 'Choisir le projet à ouvrir', zone: Z1, nature: 'navigation', description: 'Ouvre un autre projet (ou une autre démo, en admin) ; le projet courant n’est pas modifié' },
  'admin.audit': { libelle: 'Mode audit (promenade)', zone: Z1, nature: 'navigation', description: 'Ouvre le mode audit : promenade GPS en Vue 3D, bâtiments à noter, fichier partagé (administrateur seulement)' },
  'admin.controleurs': { libelle: 'Contrôleurs de l’écran', zone: Z1, nature: 'navigation', description: 'Ouvre l’arbre des contrôleurs (admin des démos seulement)' },
  'admin.chaine': { libelle: 'De l’IGN à ma maison', zone: Z1, nature: 'navigation', description: 'Ouvre le schéma de bout en bout : sources, polygone, corps de toit, objets 3D, textures, réconciliation et audit (admin des démos seulement)' },
  'admin.principes': { libelle: 'Les principes de Plan', zone: Z1, nature: 'navigation', description: 'Ouvre l’écran des principes : processus, actions et ce qui se passe derrière, avec sommaire et recherche (admin des démos seulement)' },
  'admin.calibration': { libelle: 'Calibrer la détection', zone: Z1, nature: 'navigation', description: 'Ouvre l’écran de calibration de la détection des ouvertures : photos annotées, mesure, réglages enregistrés sur le serveur (admin des démos seulement)' },
  'admin.arbres': { libelle: 'Arbres (bibliothèque)', zone: Z1, nature: 'navigation', description: 'Ouvre la bibliothèque d’essences d’arbres générées par EZ-tree (admin des démos seulement)' },
  'admin.palette': { libelle: 'Palette de l’interface', zone: Z1, nature: 'navigation', description: 'Ouvre la palette : couleurs, variables CSS, typographie (admin des démos seulement)' },
  'admin.seDeconnecter': { libelle: 'Se déconnecter de l’admin des démos', zone: Z1, nature: 'navigation', description: 'Ferme la session admin ; le mot de passe sera redemandé' },
  'barre.projetEtMenus': { libelle: 'Projet et menus (tablette, téléphone)', zone: Z1, nature: 'navigation', description: 'Ouvre la feuille Projet, qui porte les menus du bureau' },
  'barre.exporter': { libelle: 'Exporter (tablette, téléphone)', zone: Z1, nature: 'navigation', description: 'Ouvre la feuille Projet sur le menu Exporter' },

  // ---- Z3 : l'explorateur ----------------------------------------------------------------------
  'explorateur.replier': { libelle: 'Replier ou déplier l’explorateur', zone: Z3, nature: 'navigation' },
  'explorateur.filtreFamille': { libelle: 'Filtrer par famille', zone: Z3, nature: 'navigation', repete: true },
  'explorateur.selectionnerObjet': { libelle: 'Sélectionner l’objet', zone: Z3, nature: 'navigation', repete: true },
  'explorateur.choisirTerrasse': { libelle: 'Choisir la terrasse', zone: Z3, nature: 'navigation', repete: true },
  'explorateur.dossierTerrasse': { libelle: 'Retenir la terrasse pour le dossier PDF', zone: Z3, nature: 'option', repete: true },
  'explorateur.structureSurPlan': { libelle: 'Structure sur le plan', zone: Z3, nature: 'affichage' },
  'explorateur.calque': { libelle: 'Calque de structure (solives, lambourdes, vis…)', zone: Z3, nature: 'affichage', repete: true },

  // ---- Z4 : les vues 3D --------------------------------------------------------------------------
  ...reglagesVue('vue3d', 'Vue 3D'),
  'vue3d.tousLesObjets': { libelle: 'Afficher tous les objets du plan (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.solEnCoupe': { libelle: 'Sol en coupe : assise et fondations (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.platelageTranslucide': { libelle: 'Platelage translucide : voir les plots (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.objetsOpaques': { libelle: 'Objets opaques (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.textures': { libelle: 'Textures (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.vent': { libelle: 'Vent dans les arbres (Vue 3D)', zone: Z4, nature: 'vue', description: 'Les arbres bougent au vent ; jamais exporté' },
  'vue3d.objetsEchelle': { libelle: 'Objets d’échelle (Vue 3D)', zone: Z4, nature: 'vue', description: 'Une voiture et une silhouette, pour l’échelle ; jamais exportées' },
  'vue3d.qualite': { libelle: 'Qualité (Vue 3D)', zone: Z4, nature: 'vue', description: 'Économe, Normale ou Soignée : ce que la scène se permet en ombres, lissage et effets, propre à cet appareil' },
  'vue3d.tiroir': { libelle: 'Déplier ou replier les réglages (Vue 3D)', zone: Z4, nature: 'navigation', description: 'Le tiroir des réglages, replié sur son titre par défaut, sur bureau' },
  'vue3d.horloge': { libelle: 'Horloge : régler l’heure et la date (Vue 3D)', zone: Z4, nature: 'navigation', description: 'Ouvre sous l’horloge du canevas le curseur d’heure et la date' },
  ...reglagesVue('visionneuse', 'visionneuse'),
  'visionneuse.fond': { libelle: 'Fond (visionneuse)', zone: Z4, nature: 'vue' },
  'visionneuse.arVoir': { libelle: 'Voir chez vous : lancer la réalité augmentée (model-viewer)', zone: Z4, nature: 'vue' },
  'visionneuse.arFermer': { libelle: 'Fermer la réalité augmentée', zone: Z4, nature: 'navigation' },

  // ---- Z5 : l'inspecteur -------------------------------------------------------------------------
  'inspecteur.replier': { libelle: 'Replier ou déplier l’inspecteur', zone: Z5, nature: 'navigation' },
  'inspecteur.replierSections': { libelle: 'Replier ou déplier toutes les sections', zone: Z5, nature: 'navigation' },
  'inspecteur.famille.objet': { libelle: 'Sections de l’objet (au doigt)', zone: Z5, nature: 'navigation' },
  'inspecteur.famille.geometrie': { libelle: 'Sections de géométrie (au doigt)', zone: Z5, nature: 'navigation' },
  'inspecteur.famille.construction': { libelle: 'Sections de construction (au doigt)', zone: Z5, nature: 'navigation' },
  'inspecteur.chiffrage': { libelle: 'Bandeau du chiffrage recalculé', zone: Z5, nature: 'navigation', description: 'Résume le chiffrage de la terrasse ; ouvre son détail' },

  // ---- Z6 : le tiroir des resultats ----------------------------------------------------------------
  'tiroir.onglet': { libelle: 'Onglet du tiroir', zone: Z6, nature: 'navigation', repete: true },
  'tiroir.hauteur': { libelle: 'Hauteur du tiroir', zone: Z6, nature: 'navigation', repete: true },
  'tiroir.terrasseSuivante': { libelle: 'Passer à la terrasse suivante', zone: Z6, nature: 'navigation' },
  'nomenclature.longueurs': { libelle: 'Longueurs disponibles', zone: Z6, nature: 'donnee', repete: true, ecrit: SAISIE },
  'nomenclature.prix': { libelle: 'Prix (barre, m², unité, réel)', zone: Z6, nature: 'donnee', repete: true, ecrit: SAISIE },
  'nomenclature.conditionnement': { libelle: 'Conditionnement des vis', zone: Z6, nature: 'donnee', ecrit: SAISIE },
  'chantier.reglage': { libelle: 'Réglage du chantier (équipe, heures par jour…)', zone: Z6, nature: 'donnee', repete: true, ecrit: SAISIE },
  'chantier.cadence': { libelle: 'Cadence d’un poste (heures par unité)', zone: Z6, nature: 'donnee', repete: true, ecrit: SAISIE },
  'implantation.echelle': { libelle: 'Échelle du plan d’implantation', zone: Z6, nature: 'donnee', ecrit: SAISIE },
  'implantation.imprimer': { libelle: 'Imprimer le plan d’implantation', zone: Z6, nature: 'sortie' },
  // Le profil du sol (MD/spec-relief.md §5.4) : la ligne vient d'une cote, ou de la pente proposee.
  'cote.profil': { libelle: 'Profil du sol le long de cette cote', zone: Z6, nature: 'sortie', repete: true, description: 'Prend les deux bouts de la cote comme ligne du profil et ouvre l’onglet Profil' },
  'profil.sensPente': { libelle: 'Profil dans le sens de la pente', zone: Z6, nature: 'affichage', description: 'Revient à la ligne que Plan propose : la plus grande pente par le point de référence' },

  // ---- Feuilles et notifications : les cadres communs ------------------------------------------
  'feuille.hauteur': { libelle: 'Hauteur de la feuille (glisser la poignée)', zone: FEUILLES, nature: 'navigation', repete: true, dansChaqueZone: true },
  'feuille.fermer': { libelle: 'Fermer la feuille', zone: FEUILLES, nature: 'navigation', repete: true, dansChaqueZone: true },

  // ---- Barre de sélection et navigation du bas (tablette, téléphone) ------------------------------
  'selection.deselectionner': { libelle: 'Désélectionner', zone: SELECTION, nature: 'navigation' },
  'selection.proprietes': { libelle: 'Propriétés de l’objet sélectionné', zone: SELECTION, nature: 'navigation', description: 'Ouvre l’inspecteur' },
  'selection.resultats': { libelle: 'Chiffrage ou résultats de l’objet sélectionné', zone: SELECTION, nature: 'navigation', description: 'Ouvre le tiroir des résultats' },
  'navigation.objets': { libelle: 'Objets', zone: NAVIGATION, nature: 'navigation', description: 'Ouvre la feuille de l’explorateur' },
  'navigation.creer': { libelle: 'Créer et éditer', zone: NAVIGATION, nature: 'navigation', description: 'Ouvre la feuille de la palette' },
  'navigation.proprietes': { libelle: 'Propriétés', zone: NAVIGATION, nature: 'navigation', description: 'Ouvre la feuille de l’inspecteur' },
  'navigation.resultats': { libelle: 'Résultats', zone: NAVIGATION, nature: 'navigation', description: 'Ouvre la feuille du tiroir' },
  'notification.fermer': { libelle: 'Fermer une erreur', zone: Z9, nature: 'navigation', repete: true },

  // ---- Z8 : les ecrans qui ne s'ouvrent qu'a la demande ----------------------------------------
  // Dialogues (zones/Dialogues.tsx) : la reponse a une question posee par une commande.
  'dialogue.saisie': etape(Z8, DIALOGUE, 'Saisie demandée (nom d’un projet…)'),
  'dialogue.annuler': etape(Z8, DIALOGUE, 'Annuler', { repete: true }),
  'dialogue.valider': etape(Z8, DIALOGUE, 'Valider la saisie'),
  'dialogue.confirmer': etape(Z8, DIALOGUE, 'Confirmer (action irréversible)'),
  'dialogue.secondaire': etape(Z8, DIALOGUE, 'Réponse secondaire d’un choix'),
  'dialogue.principal': etape(Z8, DIALOGUE, 'Réponse principale d’un choix'),
  'dialogue.case': etape(Z8, DIALOGUE, 'Option d’un choix (case à cocher)'),
  'dialogue.action': etape(Z8, DIALOGUE, 'Action d’un message'),
  // Premier pas (zones/PremierPas.tsx) : par quoi commencer, quand il n'y a aucun plan.
  'premierPas.adresse': etape(Z8, 'démarrage sans projet', 'Partir d’une adresse'),
  'premierPas.demo': etape(Z8, 'démarrage sans projet', 'Ouvrir le plan de démonstration'),
  // Import cadastral (zones/parcours/ImportCadastre.tsx).
  'cadastre.adresse': etape(Z8, IMPORT, 'Adresse à chercher'),
  'cadastre.rechercher': etape(Z8, IMPORT, 'Rechercher l’adresse'),
  'cadastre.suggestion': etape(Z8, IMPORT, 'Choisir une adresse proposée', { repete: true }),
  'cadastre.annuler': etape(Z8, IMPORT, 'Annuler l’import', { repete: true }),
  'cadastre.parcelle': etape(Z8, IMPORT, 'Choisir la parcelle', { repete: true }),
  'cadastre.simplifier': etape(Z8, IMPORT, 'Simplifier les contours'),
  'cadastre.changerAdresse': etape(Z8, IMPORT, 'Changer d’adresse'),
  'cadastre.voisines': etape(Z8, IMPORT, 'Passer aux parcelles voisines'),
  'cadastre.propriete': etape(Z8, IMPORT, 'Parcelle de la propriété', { repete: true }),
  'cadastre.importerVoisine': etape(Z8, IMPORT, 'Importer une parcelle voisine', { repete: true }),
  'cadastre.principale': etape(Z8, IMPORT, 'En faire la parcelle principale', { repete: true }),
  'cadastre.coucheIgn': etape(Z8, IMPORT, 'Couche BD TOPO à importer (bâti, végétation…)', { repete: true }),
  'cadastre.relief': etape(Z8, IMPORT, 'Lire le relief du terrain à la création du plan'),
  'cadastre.reliefToutes': etape(Z8, IMPORT, 'Relief sur toutes les parcelles importées'),
  'cadastre.voisinageEtendu': etape(Z8, IMPORT, 'Ajouter le voisinage étendu', { repete: true }),
  'cadastre.rayon': etape(Z8, IMPORT, 'Rayon du voisinage étendu, de 10 à 1 500 m', { repete: true }),
  'cadastre.afficherEtendu': etape(Z8, IMPORT, 'Afficher le voisinage étendu (aperçu et ouverture du plan)', { repete: true }),
  'cadastre.importDirect': etape(Z8, IMPORT, 'Import direct, sans les étapes 2 et 3'),
  'cadastre.maPosition': etape(Z8, IMPORT, 'Utiliser ma position (GPS) pour trouver la parcelle'),
  'cadastre.ajuster': etape(Z8, IMPORT, 'Ajuster l’import direct (étapes 2 et 3)'),
  'cadastre.creerDirect': etape(Z8, IMPORT, 'Créer le projet depuis le résumé de l’import direct', { ecrit: { annulable: false, droits: 'commande' } }),
  'cadastre.cocherMitoyennes': etape(Z8, IMPORT, 'Cocher toutes les mitoyennes'),
  'cadastre.toutDecocher': etape(Z8, IMPORT, 'Tout décocher'),
  'cadastre.retour': etape(Z8, IMPORT, 'Retour à l’étape précédente'),
  'cadastre.nomProjet': etape(Z8, IMPORT, 'Nom du projet'),
  'cadastre.creerProjet': etape(Z8, IMPORT, 'Créer (ou remplir) le projet', { ecrit: { annulable: false, droits: 'commande' } }),
  // Actualiser IGN (zones/parcours/Actualisation.tsx).
  // Le mode audit (zones/parcours/AuditCas.tsx, AuditFin.tsx) : la fiche s'ouvre d'un appui long sur
  // un batiment de la Vue 3D, ou depuis la liste des cas.
  'audit.categorie': etape(Z8, FICHE_AUDIT, 'Catégorie du problème noté', { repete: true }),
  'audit.probleme': etape(Z8, FICHE_AUDIT, 'Problème constaté (plusieurs possibles)', { repete: true }),
  'audit.note': etape(Z8, FICHE_AUDIT, 'Note sur le bâtiment'),
  'audit.ceQueJeVois': etape(Z8, FICHE_AUDIT, 'Déplier « Ce que je vois » (facultatif)'),
  'audit.photo': etape(Z8, FICHE_AUDIT, 'Prendre une photo du bâtiment (huit au plus)', { repete: true }),
  'audit.retirerPhoto': etape(Z8, FICHE_AUDIT, 'Retirer une photo', { repete: true }),
  'audit.toucherPhoto': etape(Z8, FICHE_AUDIT, 'Toucher la façade sur une photo dont la couleur n’a pas été lue', { repete: true }),
  'audit.toucherFacade': etape(Z8, FICHE_AUDIT, 'Point touché sur la façade de la photo : sa couleur est lue autour'),
  'audit.toucherPlusTard': etape(Z8, FICHE_AUDIT, 'Remettre à plus tard le toucher de la façade'),
  'audit.retirerMarque': etape(Z8, FICHE_AUDIT, 'Retirer la marque du bâtiment'),
  'audit.fermerCas': etape(Z8, FICHE_AUDIT, 'Fermer la fiche'),
  'audit.modifier': etape(Z8, 'audit.cas', 'Modifier la fiche d’un bâtiment noté', { repete: true }),
  'audit.retirer': etape(Z8, 'audit.cas', 'Retirer un bâtiment de la liste', { repete: true }),
  'audit.continuer': etape(Z8, 'audit.cas', 'Continuer la promenade'),
  'audit.partager': etape(Z8, 'audit.cas', 'Partager le fichier de la promenade'),
  // L'audit de la parcelle, phase 1 (zones/parcours/AuditParcelle.tsx) : la liste de controle et
  // l'ecran de prise. Rien n'ecrit dans le projet : la capture vit dans le brouillon de l'appareil.
  'auditParcelle.prise': etape(Z8, AUDIT_PARCELLE, 'Photographier en marchant : l’écran de prise sur la Vue 3D'),
  'auditParcelle.voirFacade': etape(Z8, AUDIT_PARCELLE, 'Montrer les photos d’une façade', { repete: true }),
  'auditParcelle.photographierFacade': etape(Z8, AUDIT_PARCELLE, 'Photographier cette façade (choisie dans la liste)', { repete: true }),
  'auditParcelle.inaccessible': etape(Z8, AUDIT_PARCELLE, 'Marquer une façade inaccessible, ou la rendre à la liste', { repete: true }),
  'auditParcelle.retirerPhoto': etape(Z8, AUDIT_PARCELLE, 'Retirer une photo de la capture', { repete: true }),
  'auditParcelle.noter': etape(Z8, AUDIT_PARCELLE, 'Noter une ligne (toit, cheminées, terrasse, matériaux, clôture, portail)', { repete: true }),
  'auditParcelle.photoToit': etape(Z8, AUDIT_PARCELLE, 'Photo du toit, rangée sur le bâtiment', { repete: true }),
  'auditParcelle.typeCloture': etape(Z8, AUDIT_PARCELLE, 'Type de la clôture côté rue', { repete: true }),
  'auditParcelle.hauteurCloture': etape(Z8, AUDIT_PARCELLE, 'Hauteur de la clôture côté rue, en mètres'),
  'auditParcelle.soubassement': etape(Z8, AUDIT_PARCELLE, 'Soubassement de la clôture', { repete: true }),
  'auditParcelle.photoCloture': etape(Z8, AUDIT_PARCELLE, 'Photo de la clôture côté rue'),
  'auditParcelle.naturePortail': etape(Z8, AUDIT_PARCELLE, 'Portail, portillon, ou aucun', { repete: true }),
  'auditParcelle.positionPortail': etape(Z8, AUDIT_PARCELLE, 'Position du portail le long de la limite', { repete: true }),
  'auditParcelle.largeurPortail': etape(Z8, AUDIT_PARCELLE, 'Largeur du portail, en mètres'),
  'auditParcelle.photoPortail': etape(Z8, AUDIT_PARCELLE, 'Photo du portail'),
  'auditParcelle.completer': etape(Z8, AUDIT_PARCELLE, 'Compléter une capture terminée'),
  // Les phases 2 et 3 (zones/parcours/PropositionsAudit.tsx) : les mesures deviennent des
  // propositions, montrees avant et apres dans la Vue 3D ; seul « Valider » ecrit dans le projet.
  'auditParcelle.propositions': etape(Z8, AUDIT_PARCELLE, 'Voir les propositions de l’audit, sur la Vue 3D'),
  'auditParcelle.avantApres': etape(Z8, AUDIT_PARCELLE, 'Vue 3D avant ou après les propositions cochées (sans modifier le projet)', { repete: true }),
  'auditParcelle.retenirSource': etape(Z8, AUDIT_PARCELLE, 'Retenir le groupe de sources que l’on juge juste', { repete: true }),
  'auditParcelle.forcerValeur': etape(Z8, AUDIT_PARCELLE, 'Forcer une valeur pour un attribut', { repete: true }),
  'auditParcelle.reprendreChoix': etape(Z8, AUDIT_PARCELLE, 'Reprendre le choix du moteur', { repete: true }),
  'auditParcelle.cocher': etape(Z8, AUDIT_PARCELLE, 'Cocher ou décocher une proposition', { repete: true }),
  'auditParcelle.replier': etape(Z8, AUDIT_PARCELLE, 'Replier ou déplier la liste des propositions : la parcelle se voit en grand (affichage seul)', { repete: true }),
  'auditParcelle.valider': etape(Z8, AUDIT_PARCELLE, 'Valider : écrire les propositions cochées dans le projet, en un seul pas d’annulation', { ecrit: { annulable: true, droits: 'commande' } }),
  // Le fichier de l'audit (§15) : partage pour le corpus (case cochee par defaut, revocable), et le
  // fichier lui-meme pour l'administrateur. Ni l'un ni l'autre n'ecrit dans le projet.
  'auditParcelle.partagerCorpus': etape(Z8, AUDIT_PARCELLE, 'Partager cet audit pour améliorer Plan (décocher le retire du serveur)', { repete: true }),
  'auditParcelle.fichier': etape(Z8, AUDIT_PARCELLE, 'Fichier de l’audit : le partager ou le télécharger (administrateur)'),
  // Admin › Audits de parcelle (zones/parcours/AuditsParcelle.tsx) : les audits recus sur le serveur.
  // Rien n'ecrit dans le projet : « Ouvrir » reprend l'audit dans sa session, comme un import.
  'auditsParcelle.avantApres': etape(Z8, CATALOGUE_AUDITS, 'Voir l’avant et l’après d’un audit reçu sur la Vue 3D de ce projet (même parcelle), en lecture seule', { repete: true }),
  'auditsParcelle.retour': etape(Z8, AUDIT_PARCELLE, 'Revenir aux audits reçus depuis leur avant et après'),
  'auditsParcelle.ouvrir': etape(Z8, CATALOGUE_AUDITS, 'Ouvrir dans ce projet un audit reçu (même parcelle), à la phase où il en était', { repete: true }),
  'auditsParcelle.telecharger': etape(Z8, CATALOGUE_AUDITS, 'Télécharger le fichier d’un audit reçu, tel qu’il est arrivé', { repete: true }),
  'auditsParcelle.retirer': etape(Z8, CATALOGUE_AUDITS, 'Retirer un audit reçu du serveur (demande confirmation)', { repete: true }),
  'auditsParcelle.confirmerRetrait': etape(Z8, CATALOGUE_AUDITS, 'Confirmer le retrait d’un audit reçu : il quitte le serveur', { repete: true }),
  'auditsParcelle.garder': etape(Z8, CATALOGUE_AUDITS, 'Garder l’audit reçu (renoncer au retrait)', { repete: true }),
  'auditsParcelle.relire': etape(Z8, CATALOGUE_AUDITS, 'Relire la liste des audits reçus'),
  'auditsParcelle.fermer': etape(Z8, CATALOGUE_AUDITS, 'Fermer le catalogue des audits reçus'),
  // Les donnees, la conclusion, les analyses et les rejeux d'un audit (spec-audit 15.4, 15.5). Rien
  // n'ecrit dans le projet ; un rejeu part chez Claude sous les plafonds de l'analyse.
  'auditsParcelle.details': etape(Z8, CATALOGUE_AUDITS, 'Voir les données, la conclusion et les analyses d’un audit reçu', { repete: true }),
  'auditsParcelle.deposer': etape(Z8, CATALOGUE_AUDITS, 'Ajouter au serveur un fichier d’audit du poste (parcelle ou promenade)'),
  'auditsParcelle.modeleRejeu': etape(Z8, CATALOGUE_AUDITS, 'Choisir le modèle du prochain rejeu', { repete: true }),
  'auditsParcelle.essaiRejeu': etape(Z8, CATALOGUE_AUDITS, 'Rejouer avec le prompt du brouillon des règles (Admin › Règles) au lieu du prompt livré', { repete: true }),
  'auditsParcelle.remesurer': etape(Z8, CATALOGUE_AUDITS, 'Relancer l’analyse des photos de façade d’un audit stocké : ses photos repassent par les mesures d’aujourd’hui et se poussent sur les façades du projet', { repete: true }),
  'auditsParcelle.confirmerRejeu': etape(Z8, CATALOGUE_AUDITS, 'Confirmer le rejeu de l’analyse par Claude (appel facturé)', { repete: true }),
  'auditsParcelle.annulerRejeu': etape(Z8, CATALOGUE_AUDITS, 'Renoncer au rejeu de l’analyse par Claude', { repete: true }),
  'auditsParcelle.rejouer': etape(Z8, CATALOGUE_AUDITS, 'Demander le rejeu de l’analyse par Claude d’un audit stocké, avec le prompt actuel (ou celui du brouillon des règles) et le modèle choisi ; il se confirme avant de partir', { repete: true }),
  'auditsParcelle.comparerAvec': etape(Z8, CATALOGUE_AUDITS, 'Comparer les réponses de l’analyse ouverte à celles d’une autre analyse du même audit', { repete: true }),
  'auditsParcelle.relireAnalyses': etape(Z8, CATALOGUE_AUDITS, 'Relire les analyses d’un audit, et suivre celles en cours', { repete: true }),
  'auditsParcelle.exporterAnalyses': etape(Z8, CATALOGUE_AUDITS, 'Exporter en CSV la comparaison des analyses d’un audit', { repete: true }),
  'auditsParcelle.voirAnalyse': etape(Z8, CATALOGUE_AUDITS, 'Voir une analyse en entier : ce qui est parti chez Claude et ce qu’il a rendu', { repete: true }),
  'auditsParcelle.exporterAnalyse': etape(Z8, CATALOGUE_AUDITS, 'Exporter une analyse en JSON (entrant, sortant, résumé)', { repete: true }),
  'auditsParcelle.fermerAnalyse': etape(Z8, CATALOGUE_AUDITS, 'Refermer le détail d’une analyse', { repete: true }),
  // L'analyse par Claude (lot L17, decision D2) : l'accord d'envoyer les photos, une fois par projet,
  // revocable ; la case « partager » (D7) est lue par le fichier de l'audit. Rien n'ecrit dans le projet.
  // Admin › Calibrer la detection (zones/EcranCalibration.tsx, EditeurCasCalibration.tsx) : des photos de facades annotees, la mesure de la
  // detection sur elles et les reglages calibres, enregistres sur le serveur (data/admin/). Rien n'ecrit dans un projet.
  'calibration.nouveauCas': etape(Z8, CALIBRATION, 'Nouveau cas de calibration : photographier une façade'),
  'calibration.ouvrirCas': etape(Z8, CALIBRATION, 'Ouvrir un cas de calibration', { repete: true }),
  'calibration.nomCas': etape(Z8, CALIBRATION, 'Nommer le cas'),
  'calibration.largeurM': etape(Z8, CALIBRATION, 'Largeur réelle du mur du cas'),
  'calibration.hauteurM': etape(Z8, CALIBRATION, 'Hauteur du mur du cas, à l’égout'),
  'calibration.photo': etape(Z8, CALIBRATION, 'Prendre ou choisir une photo du mur (jusqu’à huit)', { repete: true }),
  'calibration.retirerPhoto': etape(Z8, CALIBRATION, 'Retirer une photo du cas', { repete: true }),
  'calibration.redresser': etape(Z8, CALIBRATION, 'Redresser le mur d’après les quatre coins placés'),
  'calibration.coinsSerie': etape(Z8, CALIBRATION, 'Retrouver les coins du mur sur toutes les photos (points de fuite, assemblage), sauf ceux posés à la main'),
  'calibration.proposer': etape(Z8, CALIBRATION, 'Partir des ouvertures que la détection propose'),
  'calibration.auto': etape(Z8, CALIBRATION, 'Activer ou non l’automatique à l’ajout d’une photo (coins, redressement, fusion, ouvertures proposées)'),
  'calibration.originePhoto': etape(Z8, CALIBRATION, 'Lire d’où viennent les coins d’une photo ajoutée (trouvés, devinés à vérifier, posés à la main)', { repete: true }),
  'calibration.avisFusion': etape(Z8, CALIBRATION, 'Lire ce que la fusion automatique des photos a trouvé à redire (vue non fusionnée, part du mur cachée)'),
  'calibration.tracer': etape(Z8, CALIBRATION, 'Basculer le tracé d’ouvertures sur le mur redressé (coupé : le doigt fait défiler la page)'),
  'calibration.viderBaies': etape(Z8, CALIBRATION, 'Effacer toutes les ouvertures annotées'),
  'calibration.retirerBaie': etape(Z8, CALIBRATION, 'Retirer l’ouverture choisie', { repete: true }),
  'calibration.valide': etape(Z8, CALIBRATION, 'Marquer le cas relu sur la photo : il compte dans la calibration'),
  'calibration.enregistrerCas': etape(Z8, CALIBRATION, 'Enregistrer le cas sur le serveur'),
  'calibration.fermerCas': etape(Z8, CALIBRATION, 'Fermer le cas sans rien changer de plus'),
  'calibration.supprimerCas': etape(Z8, CALIBRATION, 'Supprimer le cas (le fichier est mis de côté sur le serveur)'),
  'calibration.charger': etape(Z8, CALIBRATION, 'Charger les cas validés : redressement fait une fois'),
  'calibration.calibrer': etape(Z8, CALIBRATION, 'Chercher de meilleurs réglages de détection sur les cas validés'),
  'calibration.appliquer': etape(Z8, CALIBRATION, 'Appliquer les réglages proposés : enregistrés sur le serveur, pris par chaque page'),
  'calibration.revenir': etape(Z8, CALIBRATION, 'Revenir aux valeurs livrées avec Plan (l’historique est gardé)'),
  'auditParcelle.confirmerObservation': etape(Z8, AUDIT_PARCELLE, 'Je confirme : une observation de Claude sur le toit devient ce que vous avez vu (« Ce que je vois »), relue ensuite par le moteur des toits', { repete: true }),
  'auditParcelle.accordAnalyse': etape(Z8, AUDIT_PARCELLE, 'Envoyer les photos à l’analyse par Claude (accord, une fois par projet)'),
  'auditParcelle.sansAnalyse': etape(Z8, AUDIT_PARCELLE, 'Seulement les mesures : ne pas envoyer les photos'),
  'auditParcelle.partagerAudit': etape(Z8, AUDIT_PARCELLE, 'Partager cet audit pour améliorer Plan (cochée par défaut)'),
  'auditParcelle.retirerAccord': etape(Z8, AUDIT_PARCELLE, 'Retirer l’accord : plus aucune photo ne part, les propositions de Claude sont retirées'),
  'auditParcelle.relancerAnalyse': etape(Z8, AUDIT_PARCELLE, 'Relancer l’analyse par Claude (photos changées, ou envoi échoué)'),
  'auditParcelle.fermer': etape(Z8, AUDIT_PARCELLE, 'Fermer l’audit de la parcelle, depuis la liste, la prise ou les propositions (rien n’est perdu)'),
  'auditParcelle.rejouerRedressement': etape(Z8, AUDIT_PARCELLE, 'Rejouer redressement + fusion des photos de façade (une façade, ou tout l’audit) : ne remplace que les images dérivées', { repete: true }),
  'auditParcelle.placerCoins': etape(Z8, AUDIT_PARCELLE, 'Placer à la main les quatre coins du mur sur une photo (erreur du redressement automatique)', { repete: true }),
  'auditParcelle.echelleMur': etape(Z8, AUDIT_PARCELLE, 'Corriger l’échelle : la largeur réelle du mur', { repete: true }),
  'auditParcelle.appliquerCoins': etape(Z8, AUDIT_PARCELLE, 'Appliquer les quatre coins placés : le redressement est rejoué avec eux', { repete: true }),
  'auditParcelle.retablirCoins': etape(Z8, AUDIT_PARCELLE, 'Revenir au redressement automatique de cette photo', { repete: true }),
  'auditParcelle.annulerCoins': etape(Z8, AUDIT_PARCELLE, 'Fermer la pose des coins sans rien changer', { repete: true }),
  'auditParcelle.avertissementFusion': etape(Z8, AUDIT_PARCELLE, 'Lire, à la prise de vue, que la fusion des photos de la façade est impossible (reprendre avec des chevauchements)'),
  'auditParcelle.statutFusion': etape(Z8, AUDIT_PARCELLE, 'Lire le statut du redressement et de la fusion d’une façade', { repete: true }),
  'auditParcelle.lancer': etape(Z8, AUDIT_PARCELLE, 'Lancer l’analyse : terminer la capture'),
  'auditParcelle.liste': etape(Z8, AUDIT_PARCELLE, 'Revenir à la liste de contrôle'),
  'auditParcelle.pasCetteFacade': etape(Z8, AUDIT_PARCELLE, 'Ce n’est pas cette façade : proposer la suivante'),
  'auditParcelle.verrouiller': etape(Z8, AUDIT_PARCELLE, 'Verrouiller un bâtiment pour la prise (annexe sur la parcelle) : seul lui est visé', { repete: true }),
  'auditParcelle.suivrePosition': etape(Z8, AUDIT_PARCELLE, 'Revenir à la façade reconnue par la position'),
  'auditParcelle.photo': etape(Z8, AUDIT_PARCELLE, 'Prendre une photo, rangée sur la façade visée', { repete: true }),
  // « Ce que je vois » (zones/parcours/CeQueJeVois.tsx), partage par l'audit de la parcelle et la
  // fiche de la promenade : toucher un choix retenu le retire.
  'vu.forme': etape(Z8, CE_QUE_JE_VOIS, 'Forme du toit', { repete: true }),
  'vu.autresFormes': etape(Z8, CE_QUE_JE_VOIS, 'Montrer les autres formes de toit'),
  'vu.sensFaitage': etape(Z8, CE_QUE_JE_VOIS, 'Sens du faîtage par rapport à la rue', { repete: true }),
  'vu.bouts': etape(Z8, CE_QUE_JE_VOIS, 'Bouts du toit (pignons, croupes)', { repete: true }),
  'vu.lucarnes': etape(Z8, CE_QUE_JE_VOIS, 'Nombre de lucarnes', { repete: true }),
  'vu.appentis': etape(Z8, CE_QUE_JE_VOIS, 'Appentis ouvert ou fermé', { repete: true }),
  'vu.panLucarnes': etape(Z8, CE_QUE_JE_VOIS, 'Pan des lucarnes', { repete: true }),
  'vu.cheminees': etape(Z8, CE_QUE_JE_VOIS, 'Nombre de cheminées', { repete: true }),
  'vu.positionCheminee': etape(Z8, CE_QUE_JE_VOIS, 'Position d’une cheminée', { repete: true }),
  'vu.materiauCheminee': etape(Z8, CE_QUE_JE_VOIS, 'Matériau d’une cheminée', { repete: true }),
  'vu.couronnement': etape(Z8, CE_QUE_JE_VOIS, 'Couronnement d’une cheminée', { repete: true }),
  'vu.accessible': etape(Z8, CE_QUE_JE_VOIS, 'Toiture-terrasse accessible ou non', { repete: true }),
  'vu.revetement': etape(Z8, CE_QUE_JE_VOIS, 'Revêtement de la toiture-terrasse', { repete: true }),
  'vu.acrotere': etape(Z8, CE_QUE_JE_VOIS, 'Hauteur de l’acrotère, à vue', { repete: true }),
  'vu.gardeCorps': etape(Z8, CE_QUE_JE_VOIS, 'Garde-corps de la terrasse', { repete: true }),
  'vu.edicules': etape(Z8, CE_QUE_JE_VOIS, 'Nombre d’édicules sur la terrasse', { repete: true }),
  'vu.murs': etape(Z8, CE_QUE_JE_VOIS, 'Matériau des murs', { repete: true }),
  'vu.couverture': etape(Z8, CE_QUE_JE_VOIS, 'Matériau de la couverture', { repete: true }),
  'actualisation.portee': etape(Z8, ACTUALISER, 'Portée : la parcelle ou tout le plan', { repete: true }),
  'actualisation.voisinage': etape(Z8, ACTUALISER, 'Actualiser aussi le voisinage'),
  'actualisation.rayon': etape(Z8, ACTUALISER, 'Portée du voisinage : parcelles adjacentes, ou tout dans un rayon', { repete: true }),
  'actualisation.rayonM': etape(Z8, ACTUALISER, 'Rayon du voisinage, de 10 à 1 500 m'),
  'actualisation.couche': etape(Z8, ACTUALISER, 'Couche du voisinage (bâti, végétation, arbres)', { repete: true }),
  'actualisation.relief': etape(Z8, ACTUALISER, 'Relire le relief du terrain'),
  'actualisation.reliefToutes': etape(Z8, ACTUALISER, 'Relief sur toutes les parcelles du plan'),
  'actualisation.annuler': etape(Z8, ACTUALISER, 'Annuler l’actualisation'),
  'actualisation.lancer': etape(Z8, ACTUALISER, 'Actualiser', { ecrit: { annulable: true, droits: 'commande' } }),
  // Choix d'une texture (zones/parcours/ChoixTexture.tsx).
  'texture.fermer': etape(Z8, TEXTURE, 'Fermer le choix de texture'),
  'texture.recherche': etape(Z8, TEXTURE, 'Rechercher une texture'),
  'texture.vignette': etape(Z8, TEXTURE, 'Choisir une texture', { repete: true }),
  'texture.appliquerATous': etape(Z8, TEXTURE, 'Appliquer à tous les objets semblables'),
  'texture.annuler': etape(Z8, TEXTURE, 'Annuler le choix de texture'),
  'texture.enregistrer': etape(Z8, TEXTURE, 'Enregistrer la texture', { ecrit: { annulable: true, droits: 'lectureSeule' } }),

  // ---- Le releve de facade (zones/Releve.tsx), ecran plein --------------------------------------
  'releve.fermer': etape(RELEVE, RELEVER, 'Fermer le relevé'),
  'releve.choisirMur': etape(RELEVE, RELEVER, 'Choisir le mur à relever', { repete: true }),
  'releve.boussole': etape(RELEVE, RELEVER, 'Me guider à la boussole (permission d’orientation, iOS)'),
  'releve.methode': etape(RELEVE, RELEVER, 'Méthode : photo de rue (Panoramax) ou caméra guidée', { repete: true }),
  'releve.photoRue': etape(RELEVE, RELEVER, 'Choisir une photo de rue', { repete: true }),
  'releve.objectif': etape(RELEVE, RELEVER, 'Objectif de l’appareil (grand-angle ou principal)', { repete: true }),
  'releve.champObjectif': etape(RELEVE, RELEVER, 'Champ de l’objectif (degrés)'),
  'releve.retour': etape(RELEVE, RELEVER, 'Retour', { repete: true }),
  'releve.declencher': etape(RELEVE, RELEVER, 'Prendre la photo'),
  'releve.importerPhoto': etape(RELEVE, RELEVER, 'Importer une photo', { repete: true }),
  'releve.realiteAugmentee': etape(RELEVE, RELEVER, 'Mesure en réalité augmentée'),
  'releve.niveau': etape(RELEVE, RELEVER, 'Niveau à bulle'),
  'releve.vignette': etape(RELEVE, RELEVER, 'Choisir une photo du relevé', { repete: true }),
  'releve.retirerPhoto': etape(RELEVE, RELEVER, 'Retirer une photo', { repete: true }),
  'releve.formeMur': etape(RELEVE, RELEVER, 'Forme du mur (droit, décroché à gauche ou à droite)', { repete: true }),
  'releve.assemblage': etape(RELEVE, RELEVER, 'Plusieurs photos : morceaux côte à côte ou vues du mur entier', { repete: true }),
  'releve.cote': etape(RELEVE, RELEVER, 'Cote en centimètres (largeur, hauteur, allège…)', { repete: true }),
  'releve.reprendre': etape(RELEVE, RELEVER, 'Reprendre la photo'),
  'releve.ajouterPhoto': etape(RELEVE, RELEVER, 'Ajouter une photo'),
  'releve.analyser': etape(RELEVE, RELEVER, 'Analyser'),
  'releve.typeOuverture': etape(RELEVE, RELEVER, 'Type d’une ouverture (fenêtre, porte…)', { repete: true }),
  'releve.retirerOuverture': etape(RELEVE, RELEVER, 'Retirer une ouverture', { repete: true }),
  'releve.ajouterOuverture': etape(RELEVE, RELEVER, 'Ajouter une ouverture'),
  'releve.ajouterDansGrille': etape(RELEVE, RELEVER, 'Ajouter une baie au croisement libre de la grille'),
  'releve.memeTailleTravee': etape(RELEVE, RELEVER, 'Même taille pour la travée'),
  'releve.memeHauteurNiveau': etape(RELEVE, RELEVER, 'Même hauteur pour le niveau'),
  'releve.garderDevinee': etape(RELEVE, RELEVER, 'Garder une baie devinée par la grille (en pointillé)', { repete: true }),
  'releve.demanderAide': etape(RELEVE, RELEVER, 'Demander de l’aide à Claude (coins ou ouvertures, proposé quand Plan n’est pas sûr)', { repete: true }),
  'releve.accorderAide': etape(RELEVE, RELEVER, 'Envoyer la photo à Claude (accord pour ce projet)', { repete: true }),
  'releve.annulerAide': etape(RELEVE, RELEVER, 'Ne pas envoyer la photo à Claude', { repete: true }),
  'releve.appliquerToit': etape(RELEVE, RELEVER, 'Appliquer le toit relevé au bâtiment'),
  'releve.formeToit': etape(RELEVE, RELEVER, 'Forme du toit'),
  'releve.faitage': etape(RELEVE, RELEVER, 'Hauteur du faîtage'),
  'releve.hauteur': etape(RELEVE, RELEVER, 'Hauteur du mur'),
  'releve.revoir': etape(RELEVE, RELEVER, 'Revoir le relevé'),
  'releve.valider': etape(RELEVE, RELEVER, 'Valider le relevé', { ecrit: { annulable: true, droits: 'commande' } })
};
