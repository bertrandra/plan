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
  'admin.controleurs': { libelle: 'Contrôleurs de l’écran', zone: Z1, nature: 'navigation', description: 'Ouvre l’arbre des contrôleurs (admin des démos seulement)' },
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
  'vue3d.cloturesVoisinage': { libelle: 'Clôtures du voisinage (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.solEnCoupe': { libelle: 'Sol en coupe : assise et fondations (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.platelageTranslucide': { libelle: 'Platelage translucide : voir les plots (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.objetsOpaques': { libelle: 'Objets opaques (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.textures': { libelle: 'Textures (Vue 3D)', zone: Z4, nature: 'vue' },
  ...reglagesVue('visionneuse', 'visionneuse'),
  'visionneuse.fond': { libelle: 'Fond (visionneuse)', zone: Z4, nature: 'vue' },

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
  'cadastre.rayon': etape(Z8, IMPORT, 'Rayon du voisinage étendu, de 10 à 1 000 m', { repete: true }),
  'cadastre.afficherEtendu': etape(Z8, IMPORT, 'Afficher le voisinage étendu (aperçu et ouverture du plan)', { repete: true }),
  'cadastre.importDirect': etape(Z8, IMPORT, 'Import direct, sans les étapes 2 et 3'),
  'cadastre.ajuster': etape(Z8, IMPORT, 'Ajuster l’import direct (étapes 2 et 3)'),
  'cadastre.creerDirect': etape(Z8, IMPORT, 'Créer le projet depuis le résumé de l’import direct', { ecrit: { annulable: false, droits: 'commande' } }),
  'cadastre.cocherMitoyennes': etape(Z8, IMPORT, 'Cocher toutes les mitoyennes'),
  'cadastre.toutDecocher': etape(Z8, IMPORT, 'Tout décocher'),
  'cadastre.retour': etape(Z8, IMPORT, 'Retour à l’étape précédente'),
  'cadastre.nomProjet': etape(Z8, IMPORT, 'Nom du projet'),
  'cadastre.creerProjet': etape(Z8, IMPORT, 'Créer (ou remplir) le projet', { ecrit: { annulable: false, droits: 'commande' } }),
  // Actualiser IGN (zones/parcours/Actualisation.tsx).
  'actualisation.portee': etape(Z8, ACTUALISER, 'Portée : la parcelle ou tout le plan', { repete: true }),
  'actualisation.voisinage': etape(Z8, ACTUALISER, 'Actualiser aussi le voisinage'),
  'actualisation.rayon': etape(Z8, ACTUALISER, 'Portée du voisinage : parcelles adjacentes, ou tout dans un rayon', { repete: true }),
  'actualisation.rayonM': etape(Z8, ACTUALISER, 'Rayon du voisinage, de 10 à 1 000 m'),
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
  'releve.objectif': etape(RELEVE, RELEVER, 'Objectif de l’appareil (grand-angle ou principal)', { repete: true }),
  'releve.champObjectif': etape(RELEVE, RELEVER, 'Champ de l’objectif (degrés)'),
  'releve.retour': etape(RELEVE, RELEVER, 'Retour'),
  'releve.declencher': etape(RELEVE, RELEVER, 'Prendre la photo'),
  'releve.importerPhoto': etape(RELEVE, RELEVER, 'Importer une photo', { repete: true }),
  'releve.realiteAugmentee': etape(RELEVE, RELEVER, 'Mesure en réalité augmentée'),
  'releve.niveau': etape(RELEVE, RELEVER, 'Niveau à bulle'),
  'releve.vignette': etape(RELEVE, RELEVER, 'Choisir une photo du relevé', { repete: true }),
  'releve.retirerPhoto': etape(RELEVE, RELEVER, 'Retirer une photo', { repete: true }),
  'releve.formeMur': etape(RELEVE, RELEVER, 'Forme du mur (droit, décroché à gauche ou à droite)', { repete: true }),
  'releve.cote': etape(RELEVE, RELEVER, 'Cote en centimètres (largeur, hauteur, allège…)', { repete: true }),
  'releve.reprendre': etape(RELEVE, RELEVER, 'Reprendre la photo'),
  'releve.ajouterPhoto': etape(RELEVE, RELEVER, 'Ajouter une photo'),
  'releve.analyser': etape(RELEVE, RELEVER, 'Analyser'),
  'releve.typeOuverture': etape(RELEVE, RELEVER, 'Type d’une ouverture (fenêtre, porte…)', { repete: true }),
  'releve.retirerOuverture': etape(RELEVE, RELEVER, 'Retirer une ouverture', { repete: true }),
  'releve.ajouterOuverture': etape(RELEVE, RELEVER, 'Ajouter une ouverture'),
  'releve.appliquerToit': etape(RELEVE, RELEVER, 'Appliquer le toit relevé au bâtiment'),
  'releve.formeToit': etape(RELEVE, RELEVER, 'Forme du toit'),
  'releve.faitage': etape(RELEVE, RELEVER, 'Hauteur du faîtage'),
  'releve.hauteur': etape(RELEVE, RELEVER, 'Hauteur du mur'),
  'releve.revoir': etape(RELEVE, RELEVER, 'Revoir le relevé'),
  'releve.valider': etape(RELEVE, RELEVER, 'Valider le relevé', { ecrit: { annulable: true, droits: 'commande' } })
};
