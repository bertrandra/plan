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
// La nature `objet` signale ce qui modifie le projet sans passer par le registre : ce sont les
// candidats a devenir des commandes le jour ou le registre acceptera un parametre.

export type NatureControle = 'navigation' | 'affichage' | 'vue' | 'option' | 'sortie' | 'objet' | 'donnee';

export const NATURES: Record<NatureControle, string> = {
  navigation: 'Navigation dans l’interface : aucun effet sur le projet',
  affichage: 'Ce que le plan montre, sans modifier le projet',
  vue: 'Réglage d’une vue 3D, sans modifier le projet',
  option: 'Option d’une commande ou d’un export : elle règle ce qui suit',
  sortie: 'Montre ou imprime une information, sans modifier le projet',
  objet: 'Modifie un objet ou une cote du projet hors du registre : candidat à devenir une commande',
  donnee: 'Saisie d’une donnée du projet (prix, cadence…)'
};

export interface ControleInterface {
  libelle: string;
  zone: string;
  nature: NatureControle;
  /** Un exemplaire par ligne (objet, cote, onglet…) : un seul controle, repete. */
  repete?: true;
  description?: string;
}

const Z1 = 'Z1 Barre d’application', Z3 = 'Z3 Explorateur', Z4 = 'Z4 Vues 3D', Z5 = 'Z5 Inspecteur', Z6 = 'Z6 Résultats';

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

const ETIQUETTES: [string, string][] = [['showName', 'Nom'], ['showSegNames', 'Côtés'], ['showVertNames', 'Coins'], ['showDims', 'Cotes'], ['showAngles', 'Angles']];

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
  'explorateur.masquerTous': { libelle: 'Masquer ou afficher tous les objets', zone: Z3, nature: 'affichage' },
  ...Object.fromEntries(ETIQUETTES.map(([champ, nom]) => ['explorateur.etiquettesTous.' + champ, { libelle: 'Étiquettes de tous les objets : ' + nom, zone: Z3, nature: 'affichage' } satisfies ControleInterface])),
  'explorateur.selectionnerObjet': { libelle: 'Sélectionner l’objet', zone: Z3, nature: 'navigation', repete: true },
  'explorateur.visibiliteObjet': { libelle: 'Masquer ou afficher l’objet', zone: Z3, nature: 'objet', repete: true },
  'explorateur.etiquettesObjet': { libelle: 'Étiquettes de l’objet sélectionné', zone: Z3, nature: 'objet', repete: true },
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
  'cotes.choisirReference': { libelle: 'Choisir le segment de référence', zone: Z6, nature: 'objet' },
  'cotes.origine': { libelle: 'Origine (extrémité du segment)', zone: Z6, nature: 'objet' },
  'cotes.selectionnerCoins': { libelle: 'Sélectionner des coins', zone: Z6, nature: 'objet' },
  'cotes.ajouter': { libelle: 'Ajouter les mesures', zone: Z6, nature: 'objet' },
  'cotes.inverserOrigine': { libelle: 'Inverser l’origine d’une cote', zone: Z6, nature: 'objet', repete: true },
  'cotes.valeurAffichee': { libelle: 'Valeur affichée d’une cote (le long ou perpendiculaire)', zone: Z6, nature: 'objet', repete: true },
  'cotes.afficher': { libelle: 'Afficher une cote sur le plan', zone: Z6, nature: 'objet', repete: true },
  'cotes.supprimer': { libelle: 'Supprimer une cote', zone: Z6, nature: 'objet', repete: true },
  'nomenclature.longueurs': { libelle: 'Longueurs disponibles', zone: Z6, nature: 'donnee', repete: true },
  'nomenclature.prix': { libelle: 'Prix (barre, m², unité, réel)', zone: Z6, nature: 'donnee', repete: true },
  'nomenclature.conditionnement': { libelle: 'Conditionnement des vis', zone: Z6, nature: 'donnee' },
  'chantier.reglage': { libelle: 'Réglage du chantier (équipe, heures par jour…)', zone: Z6, nature: 'donnee', repete: true },
  'chantier.cadence': { libelle: 'Cadence d’un poste (heures par unité)', zone: Z6, nature: 'donnee', repete: true },
  'implantation.echelle': { libelle: 'Échelle du plan d’implantation', zone: Z6, nature: 'option' },
  'implantation.imprimer': { libelle: 'Imprimer le plan d’implantation', zone: Z6, nature: 'sortie' }
};
