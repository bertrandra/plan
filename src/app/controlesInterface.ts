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
// La nature `objet` signale ce qui modifierait le projet sans passer par le registre : un tel
// controle doit devenir une commande. C'est fait depuis que le registre accepte une cible
// (app/commandes.ts `Cible`, app/ecouteurs/cibles.ts) : masquer un objet, ses etiquettes, chaque
// geste sur les cotes sont des commandes. Il n'en reste aucun ; la nature reste pour le dire.

export type NatureControle = 'navigation' | 'affichage' | 'vue' | 'option' | 'sortie' | 'objet' | 'donnee' | 'parcours';

export const NATURES: Record<NatureControle, string> = {
  navigation: 'Navigation dans l’interface : aucun effet sur le projet',
  affichage: 'Ce que le plan montre, sans modifier le projet',
  vue: 'Réglage d’une vue 3D, sans modifier le projet',
  option: 'Option d’une commande ou d’un export : elle règle ce qui suit',
  sortie: 'Montre ou imprime une information, sans modifier le projet',
  objet: 'Modifie un objet ou une cote du projet hors du registre : candidat à devenir une commande',
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
}

const Z1 = 'Z1 Barre d’application', Z3 = 'Z3 Explorateur', Z4 = 'Z4 Vues 3D', Z5 = 'Z5 Inspecteur', Z6 = 'Z6 Résultats';
const Z8 = 'Z8 Dialogues', Z9 = 'Z9 Notifications', RELEVE = 'Relevé de façade', FEUILLES = 'Feuilles (téléphone)';

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
  'vue3d.objetsOpaques': { libelle: 'Objets opaques (Vue 3D)', zone: Z4, nature: 'vue' },
  'vue3d.textures': { libelle: 'Textures (Vue 3D)', zone: Z4, nature: 'vue' },
  ...reglagesVue('visionneuse', 'visionneuse'),
  'visionneuse.fond': { libelle: 'Fond (visionneuse)', zone: Z4, nature: 'vue' },

  // ---- Z5 : l'inspecteur -------------------------------------------------------------------------
  'inspecteur.replier': { libelle: 'Replier ou déplier l’inspecteur', zone: Z5, nature: 'navigation' },
  'inspecteur.replierSections': { libelle: 'Replier ou déplier toutes les sections', zone: Z5, nature: 'navigation' },

  // ---- Z6 : le tiroir des resultats ----------------------------------------------------------------
  'tiroir.onglet': { libelle: 'Onglet du tiroir', zone: Z6, nature: 'navigation', repete: true },
  'tiroir.hauteur': { libelle: 'Hauteur du tiroir', zone: Z6, nature: 'navigation', repete: true },
  'tiroir.terrasseSuivante': { libelle: 'Passer à la terrasse suivante', zone: Z6, nature: 'navigation' },
  'nomenclature.longueurs': { libelle: 'Longueurs disponibles', zone: Z6, nature: 'donnee', repete: true },
  'nomenclature.prix': { libelle: 'Prix (barre, m², unité, réel)', zone: Z6, nature: 'donnee', repete: true },
  'nomenclature.conditionnement': { libelle: 'Conditionnement des vis', zone: Z6, nature: 'donnee' },
  'chantier.reglage': { libelle: 'Réglage du chantier (équipe, heures par jour…)', zone: Z6, nature: 'donnee', repete: true },
  'chantier.cadence': { libelle: 'Cadence d’un poste (heures par unité)', zone: Z6, nature: 'donnee', repete: true },
  'implantation.echelle': { libelle: 'Échelle du plan d’implantation', zone: Z6, nature: 'option' },
  'implantation.imprimer': { libelle: 'Imprimer le plan d’implantation', zone: Z6, nature: 'sortie' },

  // ---- Feuilles et notifications : les cadres communs ------------------------------------------
  'feuille.hauteur': { libelle: 'Hauteur de la feuille (glisser la poignée)', zone: FEUILLES, nature: 'navigation', repete: true },
  'feuille.fermer': { libelle: 'Fermer la feuille', zone: FEUILLES, nature: 'navigation', repete: true },
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
  'cadastre.cocherMitoyennes': etape(Z8, IMPORT, 'Cocher toutes les mitoyennes'),
  'cadastre.toutDecocher': etape(Z8, IMPORT, 'Tout décocher'),
  'cadastre.retour': etape(Z8, IMPORT, 'Retour à l’étape précédente'),
  'cadastre.nomProjet': etape(Z8, IMPORT, 'Nom du projet'),
  'cadastre.creerProjet': etape(Z8, IMPORT, 'Créer (ou remplir) le projet'),
  // Actualiser IGN (zones/parcours/Actualisation.tsx).
  'actualisation.portee': etape(Z8, ACTUALISER, 'Portée : la parcelle ou tout le plan', { repete: true }),
  'actualisation.voisinage': etape(Z8, ACTUALISER, 'Actualiser aussi le voisinage'),
  'actualisation.couche': etape(Z8, ACTUALISER, 'Couche du voisinage (bâti, végétation, arbres)', { repete: true }),
  'actualisation.annuler': etape(Z8, ACTUALISER, 'Annuler l’actualisation'),
  'actualisation.lancer': etape(Z8, ACTUALISER, 'Actualiser'),
  // Choix d'une texture (zones/parcours/ChoixTexture.tsx).
  'texture.fermer': etape(Z8, TEXTURE, 'Fermer le choix de texture'),
  'texture.recherche': etape(Z8, TEXTURE, 'Rechercher une texture'),
  'texture.vignette': etape(Z8, TEXTURE, 'Choisir une texture', { repete: true }),
  'texture.appliquerATous': etape(Z8, TEXTURE, 'Appliquer à tous les objets semblables'),
  'texture.annuler': etape(Z8, TEXTURE, 'Annuler le choix de texture'),
  'texture.enregistrer': etape(Z8, TEXTURE, 'Enregistrer la texture'),

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
  'releve.valider': etape(RELEVE, RELEVER, 'Valider le relevé')
};
