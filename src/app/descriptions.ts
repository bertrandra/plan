// Les descriptions des commandes du registre (app/commandes.ts) : une phrase qui dit ce que fait la
// commande, montree en infobulle et dans l'arbre des controleurs (MD/spec-demos-admin.md).
//
// Une commande peut porter sa description dans sa declaration ; sinon, le registre la prend ici. Les
// reunir en un seul endroit permet de les relire d'un bloc, comme un glossaire. Deux tests les
// tiennent : aucune cle d'ici n'est une commande inconnue, et toute commande a une description, ici
// ou dans sa declaration (tests/unit/app/descriptions.test.ts).

export const DESCRIPTIONS: Record<string, string> = {
  // ---- Projet et fichiers ------------------------------------------------------------------------
  'projet.enregistrer': 'Enregistre le projet sur le serveur (ou la démo, en admin)',
  'projet.reinitialiser': 'Remet tous les objets et toutes les cotes dans leur état du chargement ; Ctrl+Z revient en arrière',
  'fichier.importerSvg': 'Ajoute les formes d’un fichier SVG au plan, ou remplace le plan selon l’option du menu',
  'fichier.importerJson': 'Ouvre un projet exporté en JSON : remplace le plan, ou ajoute ses objets selon l’option du menu',
  'fichier.exporterJson': 'Télécharge le projet complet en JSON, le format natif de Plan, réimportable tel quel',

  // ---- Exports ------------------------------------------------------------------------------------
  'export.svg': 'Télécharge le plan en SVG, avec ses cotes ; Plan sait le réimporter',
  'export.png': 'Télécharge une image PNG du plan tel qu’il est affiché',
  'export.pdf': 'Télécharge le plan en PDF, à l’échelle choisie dans le menu',
  'export.dxf': 'Télécharge le plan en DXF, pour un logiciel de dessin technique',
  'export.dossier': 'Produit un dossier PDF des terrasses cochées dans l’explorateur : plans, coupes et quantités',
  'export.glb': 'Télécharge la scène 3D au format GLB, pour une visionneuse ou un logiciel 3D',
  'export.resume': 'Écrit le résumé texte du projet dans l’onglet Résumé du tiroir',
  'export.copierResume': 'Copie le résumé texte du projet dans le presse-papiers',

  // ---- Objets -------------------------------------------------------------------------------------
  'objet.ajouter.polygone': 'Dessine un polygone libre, point par point, sur le plan',
  'objet.ajouter.rectangle': 'Ajoute un rectangle, ses quatre coins à 90°',
  'objet.ajouter.cercle': 'Ajoute un cercle : un arbre, un massif, un équipement rond',
  'objet.ajouter.chemin': 'Dessine un tracé ouvert : une allée, une clôture, une limite',
  'objet.ajouter.parasol': 'Ajoute un parasol, dont l’ombre suit le soleil',
  'objet.ajouter.pointDeVue': 'Ajoute un point de vue : une caméra à rappeler en Vue 3D',
  'objet.annuler': 'Défait la dernière modification du plan',
  'objet.dupliquer': 'Crée une copie de l’objet sélectionné, décalée à côté',
  'objet.supprimer': 'Supprime l’objet sélectionné ; Ctrl+Z le rend',
  'objet.reculer': 'Fait passer l’objet sélectionné sous ceux qui le recouvrent',
  'objet.positionInitiale': 'Ramène l’objet sélectionné à sa place du chargement, sans changer sa forme',
  'objet.masquerTous': 'Cache tous les objets listés dans l’explorateur, ou les montre tous à nouveau',

  // ---- Vues et affichage --------------------------------------------------------------------------
  'vue.plan': 'Affiche le plan en 2D',
  'vue.3d': 'Affiche la scène en 3D, avec le soleil du lieu et de la date choisis',
  'vue.visionneuse': 'Ouvre la visionneuse du modèle GLB généré depuis le plan',
  'vue.ajuster': 'Cadre la vue sur l’objet sélectionné',
  'affichage.grille': 'Montre ou cache la grille du plan ; le réglage s’enregistre avec le projet',
  'affichage.nord': 'Montre ou cache la flèche du Nord sur le plan',
  'affichage.voisinage': 'Montre ou cache les objets importés des parcelles voisines, sans les supprimer',
  'affichage.orthophoto': 'Pose la photo aérienne de l’IGN sous le plan, ou la retire',
  'affichage.orthoOpacite': 'Règle l’opacité de la photo aérienne',
  'affichage.orthoParcelleOpacite': 'Règle le remplissage de la parcelle par-dessus la photo aérienne',
  'affichage.orthoParcelleDefaut': 'Remet le remplissage de la parcelle à la valeur conseillée (15 %)',

  // ---- Cotes --------------------------------------------------------------------------------------
  'mesure.choisirReference': 'Désigne sur le plan le côté à partir duquel les cotes se mesurent',
  'mesure.origine': 'Choisit l’extrémité du côté de référence d’où partent les cotes',
  'mesure.ajouter': 'Ajoute au tableau une cote par coin sélectionné',
  'mesure.inverserOrigine': 'Fait partir la cote de l’autre extrémité de son côté de référence',
  'mesure.valeurAffichee': 'Affiche la distance le long du côté, ou perpendiculaire à lui',
  'mesure.afficher': 'Montre ou cache la cote sur le plan, sans la supprimer',
  'mesure.supprimer': 'Supprime la cote du tableau et du plan',
  'mesure.effacer': 'Supprime toutes les cotes, après confirmation',
  'mesure.recalculer': 'Redessine les cotes d’après la position actuelle des objets',

  // ---- PLU, terrasse, façade ----------------------------------------------------------------------
  'plu.interroger': 'Demande au Géoportail de l’urbanisme le zonage PLU au centre de la parcelle',
  'terrasse.optimisation': 'Montre ou cache le tableau qui compare des réglages de structure par leur coût',
  'facade.retirer': 'Retire la photo et les ouvertures relevées sur le mur désigné ; Ctrl+Z les rend',

  // ---- Vue 3D -------------------------------------------------------------------------------------
  '3d.modeOrbite': 'Le glisser fait tourner la caméra autour de la scène',
  '3d.modeDeplacement': 'Le glisser déplace la caméra parallèlement à l’écran',
  '3d.modeZoom': 'Le glisser rapproche ou éloigne la caméra',
  '3d.zoomAvant': 'Rapproche la caméra',
  '3d.zoomArriere': 'Éloigne la caméra',
  '3d.hauteurDesYeux': 'Place la caméra à hauteur d’yeux, debout sur la terrasse sélectionnée',
  '3d.enregistrerPng': 'Télécharge l’image de la vue 3D en PNG',
  '3d.enregistrerPointDeVue': 'Ajoute au plan un point de vue qui retient la caméra actuelle',
  '3d.pleinePage': 'Affiche la vue 3D sur toute la page',

  // ---- Visionneuse --------------------------------------------------------------------------------
  'visionneuse.generer': 'Produit le modèle 3D (GLB) du plan pour la visionneuse',
  'visionneuse.regenerer': 'Refait le modèle 3D après des modifications du plan',
  'visionneuse.zoomAvant': 'Rapproche la caméra de la visionneuse',
  'visionneuse.zoomArriere': 'Éloigne la caméra de la visionneuse',
  'visionneuse.hauteurDesYeux': 'Place la caméra de la visionneuse à hauteur d’yeux',
  'visionneuse.pleinePage': 'Affiche la visionneuse sur toute la page'
};
