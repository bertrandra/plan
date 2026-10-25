// La chaine de l'IGN a ma maison, a plat (Admin › Chaine, `?admin&ecran=chaine`).
//
// Une seule liste de noeuds, chacun avec un identifiant stable et son parent : l'arbre se deduit de la liste, jamais
// l'inverse. C'est la structure qui evolue le mieux : ajouter, deplacer ou retirer une branche ne touche qu'une ligne
// (un noeud deplace change de `parent`), un lien entre deux branches est un identifiant de plus (`voir`), la liste se
// filtre (par genre, par mode) sans recursion, et un fichier ou un serveur la rend telle quelle. `verifierChaine`
// refuse ce qui casserait l'arbre : identifiant repete, parent inconnu, cycle, adresse d'ecran qui n'en est pas une.
//
// Le genre dit ce que le noeud EST ; le mode dit COMMENT il se decide : `auto` (le moteur, par une regle et un seuil),
// `manuel` (une personne), `mixte` (le moteur propose, la personne tranche quand il ne peut pas).

export type GenreNoeud = 'etape' | 'source' | 'objet' | 'regle' | 'objet3d' | 'texture' | 'processus';
export type ModeNoeud = 'auto' | 'manuel' | 'mixte';

export interface NoeudChaine {
  /** Stable : on ne le change pas, on s'y refere (`parent`, `voir`, `forme`). */
  id: string;
  /** `null` : une racine (une etape de la chaine). */
  parent: string | null;
  genre: GenreNoeud;
  titre: string;
  detail?: string;
  mode?: ModeNoeud;
  /** L'ecran de Plan qui le montre ou le regle, quand il y en a un (`?admin&ecran=...`). */
  ecran?: string;
  /** Un renvoi vers un autre noeud (la meme chose vue d'une autre branche). */
  voir?: string;
  /** Pour un objet 3D : l'exemple du catalogue (three/catalogueToits.ts) qui le dessine. */
  forme?: string;
  /** Ou c'est dans le code ou dans les donnees. */
  ou?: string;
  /** Les seuils de `regles/toits/reglages.json` qui le reglent : l'ecran en lit la valeur, l'unite et le pourquoi en direct. */
  seuils?: string[];
}

/**
 * Un `detail` peut porter des valeurs lues en direct, `{{poids.lidar}}`, `{{seuil.SEUIL_MARCHE_M}}`, `{{recon.SCORE_AUTO_MIN}}` :
 * app/chaineVivante.ts les remplace par ce que les fichiers de donnees disent aujourd'hui, et dit celles qu'elle ne connait pas.
 */

const REGLES = '?admin&ecran=regles';

export const CHAINE: readonly NoeudChaine[] = [
  // 1. Les sources
  { id: 'sources', parent: null, genre: 'etape', titre: '1. Les sources', detail: 'Ce que chaque donnee sait d’un bâtiment, avec sa confiance. Rien n’y décide : chaque source dit, le moteur arbitre.' },
  { id: 'sources.cadastre', parent: 'sources', genre: 'source', titre: 'Cadastre IGN : la parcelle', detail: 'Le polygone de la parcelle (IDU), ses voisines, les limites.', mode: 'auto', ou: 'geo/cadastreObjets.ts' },
  { id: 'sources.ign', parent: 'sources', genre: 'source', titre: 'BD TOPO : le polygone du bâtiment', detail: 'Contour, hauteur à l’égout, altitudes du toit, étages, matériau des murs. Poids {{poids.ign}} : fiable au mètre près, parfois faux.', mode: 'auto', ou: 'geo/bdtopo.ts' },
  { id: 'sources.lidar', parent: 'sources', genre: 'source', titre: 'LiDAR HD : la surface du toit', detail: 'La hauteur du sursol tous les 50 cm. Poids {{poids.lidar}}.', mode: 'auto', ou: 'geo/mnh.ts' },
  { id: 'sources.ortho', parent: 'sources', genre: 'source', titre: 'Orthophoto : couleurs', detail: 'La couleur du toit vue du ciel.', mode: 'auto', ou: 'render/couleurToitOrtho.ts' },
  { id: 'sources.photo', parent: 'sources', genre: 'source', titre: 'Photos de façade (audit)', detail: 'La silhouette de la façade (pignon, trapèze, rampe, marches) donne le sens du faîtage et les bouts. Poids {{poids.photo}}.', mode: 'mixte', voir: 'audit.photos' },
  { id: 'sources.claude', parent: 'sources', genre: 'source', titre: 'Claude : lecture des photos', detail: 'Trois passes et un vote : forme, bouts, matériau, couverture, lucarnes. Poids {{poids.claude}}.', mode: 'mixte', ecran: REGLES, ou: 'deploy/prompt-analyse.md' },
  { id: 'sources.terrain', parent: 'sources', genre: 'source', titre: 'Ce que je vois (sur place)', detail: 'Ce que la personne note devant le bâtiment : poids {{poids.terrain}}, elle l’emporte.', mode: 'manuel', voir: 'audit.liste' },

  // 2. Le polygone devient un objet de Plan
  { id: 'objet', parent: null, genre: 'etape', titre: '2. Le polygone devient ma maison', detail: 'Un contour IGN devient un objet de Plan : prisme, hauteur, fonction.' },
  { id: 'objet.polygone', parent: 'objet', genre: 'objet', titre: 'Le polygone', detail: 'Contour du bâtiment dans le repère du plan, recalé sur le LiDAR si le contour est décalé (le bâtiment entier, jamais un corps).', mode: 'auto', ou: 'app/toitsLidar.ts' },
  { id: 'objet.prisme', parent: 'objet', genre: 'objet', titre: 'Le prisme et sa hauteur', detail: 'Du sol à l’égout. La hauteur BD TOPO est remplacée par l’égout LiDAR si l’écart passe {{seuil.ECART_EGOUT_MIN_M}}.', mode: 'mixte', voir: 'decision.hauteur' },
  { id: 'objet.fonction', parent: 'objet', genre: 'objet', titre: 'Fonction : bâtiment, terrasse, parasol…', detail: 'Ce que la fonction permet est décrit une fois (`model/fonctions.ts`).', mode: 'manuel', ou: 'model/fonctions.ts' },

  // 3. Le toit
  { id: 'toit', parent: null, genre: 'etape', titre: '3. Le toit : découpage en corps', detail: 'Du contour et de la surface mesurée au toit construit.' },
  { id: 'toit.simple', parent: 'toit', genre: 'regle', titre: 'Forme simple', detail: 'Plat, appentis, deux pans, croupes, quatre pans, ajustés par moindres carrés (au moins {{seuil.ECHANTILLONS_MIN}}, écart au plus {{seuil.ECART_MAX_M}}).', mode: 'auto', ou: 'facade/toits/toitLidar.ts', seuils: ['ECHANTILLONS_MIN', 'ECART_MAX_M', 'ECART_MAX_APPENTIS_M'] },
  { id: 'toit.rectangles', parent: 'toit', genre: 'regle', titre: 'Rectangles maximaux', detail: 'Le contour mis à l’équerre se couvre de rectangles ; ils se chevauchent par construction.', mode: 'auto', ou: 'model/volumesToit.ts' },
  { id: 'toit.marches', parent: 'toit', genre: 'regle', titre: 'Marches et refonte', detail: 'On coupe là où la couverture saute de {{seuil.SEUIL_MARCHE_M}} ; le toit lu sur le rectangle entier l’emporte s’il n’est pas plus de {{seuil.TOLERANCE_REFONTE}} fois moins bon.', mode: 'auto', ecran: REGLES, ou: 'regles/toits/reglages.json', seuils: ['SEUIL_MARCHE_M', 'TOLERANCE_REFONTE', 'LARGEUR_BLOC_MIN_M', 'CONTINUITE_M'] },
  { id: 'toit.corps', parent: 'toit', genre: 'objet', titre: 'Les corps de toit', detail: 'Un corps = un rectangle, un faîtage, des égouts, des pignons ou des croupes, un profil, des bouts, des lucarnes.', mode: 'auto', ou: 'model/types.ts#CorpsToit' },
  { id: 'toit.pignons', parent: 'toit', genre: 'regle', titre: 'Pignons, croupes, bandes recouvertes', detail: 'Une saillie de {{seuil.SURPLUS_PIGNON_M}} le long d’un mur est un pignon ; la lecture en croupes l’emporte si son écart est au plus {{seuil.GAIN_CROUPES}} fois celui des pignons.', mode: 'auto', ou: 'facade/toits/toitCorps.ts', seuils: ['SURPLUS_PIGNON_M', 'LARGEUR_PIGNON_MIN_M', 'LARGEUR_PIGNON_MAX_M', 'GAIN_CROUPES', 'PART_RECOUVERTE_MAX'] },
  { id: 'toit.formes', parent: 'toit', genre: 'regle', titre: 'Lecture des formes du catalogue', detail: 'Le moteur lit des pentes droites ; on cherche ensuite si la mesure dit mieux (bris, coyau, courbe, noue de papillon, demi-croupe, cône ou dôme). Une forme n’est retenue que si son écart est au plus {{seuil.GAIN_PROFIL}} fois celui du corps de départ, et sous {{seuil.ECART_FORME_MAX_M}}. Elle sert aux constats de l’audit : aucune toiture déjà lue ne change.', mode: 'auto', ecran: REGLES, ou: 'facade/toits/lectureFormes.ts', seuils: ['PAS_BANDE_M', 'GAIN_PROFIL', 'ECART_PENTE_MIN_DEG', 'FLECHE_MIN_M', 'CREUX_PAPILLON_M', 'CHUTE_DEMI_CROUPE_M', 'GAIN_REVOLUTION', 'ECART_FORME_MAX_M'] },
  { id: 'toit.faits', parent: 'toit', genre: 'regle', titre: 'Faits : l’exception d’un bâtiment', detail: 'Ce qu’un humain a vu et que la mesure ne peut pas dire (une galerie, une demi-croupe) : un fait par bâtiment, par PR.', mode: 'manuel', ecran: REGLES, ou: 'regles/toits/faits.json' },

  // 4. Les objets 3D
  { id: 'objets3d', parent: null, genre: 'etape', titre: '4. Les objets 3D', detail: 'Ce que la Vue 3D sait dessiner à partir d’un corps. Chaque vignette est calculée par le même code que la 3D.' },
  { id: 'objets3d.formes', parent: 'objets3d', genre: 'objet', titre: 'Formes de toit' },
  { id: 'o3d.deux-pans', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Deux pans', forme: 'deux-pans', mode: 'auto', ou: 'three/toitCorps3d.ts' },
  { id: 'o3d.croupes', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Quatre pans (croupes)', forme: 'croupes', mode: 'auto', ou: 'three/toitCorps3d.ts' },
  { id: 'o3d.appentis', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Un pan (appentis)', forme: 'appentis', mode: 'auto', ou: 'three/toitCorps3d.ts' },
  { id: 'o3d.plat', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Toit plat', forme: 'plat', mode: 'auto', ou: 'three/toitCorps3d.ts' },
  { id: 'o3d.demi-croupe', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Demi-croupe (croupe meunière)', detail: 'Dessinée. Lue sur la surface LiDAR à l’audit (le faîtage baisse vers un bout et laisse un petit pignon), sinon par un fait ou une observation.', forme: 'demi-croupes', mode: 'mixte', ou: 'facade/toits/toitFormes.ts' },
  { id: 'o3d.gambrel', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Gambrel (toit brisé)', detail: 'Dessiné par le profil brisé. Lu sur la surface LiDAR à l’audit (un bris dans le profil en travers, pignons aux bouts).', forme: 'gambrel', mode: 'mixte', ou: 'facade/toits/toitFormes.ts' },
  { id: 'o3d.mansart', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Mansart (brisis aux quatre côtés)', detail: 'Dessiné : brisis et terrasson. Lu sur la surface LiDAR à l’audit (un bris dans le profil en travers, brisis aux bouts).', forme: 'mansart', mode: 'mixte', ou: 'facade/toits/toitFormes.ts' },
  { id: 'o3d.pavillon', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Pavillon (pyramide)', detail: 'Un quatre-pans carré dont le faîtage fait moins de {{modele.FAITAGE_PAVILLON_MAX_M}} m : le calcul le nomme.', forme: 'pavillon', mode: 'auto', ou: 'model/formeToit.ts' },
  { id: 'o3d.asymetrique', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Asymétrique (saltbox)', detail: 'Un deux-pans dont un pan est au moins {{modele.RAPPORT_ASYMETRIQUE_MIN}} fois l’autre : nommé depuis les corps lus.', forme: 'asymetrique', mode: 'auto', ou: 'model/formeToit.ts' },
  { id: 'o3d.deux-pans-decales', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Deux pans décalés', detail: 'Deux deux-pans accolés dont les faîtages diffèrent d’au moins {{modele.ECART_FAITAGE_DECALE_M}} m : reconnu depuis les corps accolés.', forme: 'deux-pans-decales', mode: 'auto', ou: 'model/formeToit.ts' },
  { id: 'o3d.toit-en-m', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Toit en M (double pignon)', detail: 'Deux deux-pans accolés de même faîtage : reconnu depuis les corps accolés.', forme: 'toit-en-m', mode: 'auto', ou: 'model/formeToit.ts' },
  { id: 'o3d.shed', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Shed (dents de scie)', detail: 'Au moins deux appentis accolés qui montent du même côté : reconnu depuis les corps accolés.', forme: 'shed', mode: 'auto', ou: 'model/formeToit.ts' },
  { id: 'o3d.papillon', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Papillon (en V)', detail: 'Deux pans qui descendent vers une noue : un faîtage plus bas que les égouts. Lu sur la surface LiDAR à l’audit (le moteur le lit comme deux appentis, un seul corps les remplace).', forme: 'papillon', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.coyau', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Coyau (toit retroussé)', detail: 'Le bas du pan s’adoucit : profil `coyau`. Lu sur la surface LiDAR à l’audit.', forme: 'coyau', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.berceau', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Berceau (voûte)', detail: 'Deux pans courbes, des pignons aux bouts : profil `courbe`. Lu sur la surface LiDAR à l’audit.', forme: 'berceau', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.carene', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Carène (coque renversée)', detail: 'Pans courbes fermés par un pan aux bouts. Dessinée avec des pignons : les croupes courbes viendront.', forme: 'carene', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.conique', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Conique (poivrière)', detail: 'Toit de révolution sur le centre du corps. Lu sur la surface LiDAR à l’audit (plan presque carré).', forme: 'conique', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.polygonal', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Polygonal (kiosque)', detail: 'Pyramide à n faces (5 et plus). Par un fait ou une observation : le LiDAR ne compte pas les faces.', forme: 'polygonal', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.fleche', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Flèche (clocher)', detail: 'Pyramide très élancée, 3 à 8 faces. Lue sur la surface LiDAR à l’audit quand le cône est élancé (plan presque carré).', forme: 'fleche', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.dome', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Dôme (coupole)', detail: 'Calotte en anneaux de facettes. Lue sur la surface LiDAR à l’audit (plan presque carré).', forme: 'dome', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'o3d.imperiale', parent: 'objets3d.formes', genre: 'objet3d', titre: 'Impériale (bulbe)', detail: 'Col, ventre, puis flèche effilée. Lue sur la surface LiDAR à l’audit (plan presque carré).', forme: 'imperiale', mode: 'mixte', ou: 'facade/toits/toitSpeciaux.ts' },
  { id: 'objets3d.lucarnes', parent: 'objets3d', genre: 'objet', titre: 'Lucarnes et avant-corps' },
  { id: 'o3d.jacobine', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Jacobine', forme: 'jacobine', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.capucine', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Capucine (à croupe)', forme: 'capucine', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.chien-assis', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Chien-assis', forme: 'chien-assis', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.rampante', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Rampante', forme: 'rampante', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.meuniere', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Meunière', detail: 'Affleure le mur d’égout.', forme: 'meuniere', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.oeil-de-boeuf', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Œil-de-bœuf', detail: 'Un disque debout sur le pan et son cylindre court.', forme: 'oeil-de-boeuf', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.outeau', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Outeau', detail: 'Une petite lucarne à croupe, d’un mètre au plus.', forme: 'outeau', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'o3d.avant-corps', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Avant-corps à pignon (pignon depuis le faîtage)', detail: 'Un petit toit à deux pans, perpendiculaire au faîtage, qui monte jusqu’au faîtage du corps et dresse son triangle sur la façade : il entaille le grand pan. Lu sur la surface LiDAR (la mesure dépasse le pan de 80 cm le long d’un mur), ou dit par un fait (pignons).', forme: 'avant-corps', mode: 'mixte', ou: 'three/toitCorps3d.ts' },
  { id: 'o3d.lanterneau', parent: 'objets3d.lucarnes', genre: 'objet3d', titre: 'Lanterneau', detail: 'Un coffre bas à dessus plat vitré, sur le pan ou sur le toit plat.', forme: 'lanterneau', mode: 'mixte', ou: 'facade/toits/toitFormes.ts#facettesLucarnes' },
  { id: 'objets3d.elements', parent: 'objets3d', genre: 'objet', titre: 'Éléments de bâtiment' },
  { id: 'o3d.murs', parent: 'objets3d.elements', genre: 'objet', titre: 'Murs, pignons et murs hauts', detail: 'Le prisme à l’égout le plus bas, puis les murs jusqu’au faîtage.', mode: 'auto', ou: 'three/toitCorps3d.ts' },
  { id: 'o3d.fenetres', parent: 'objets3d.elements', genre: 'objet', titre: 'Fenêtres et portes', detail: 'Relevé de façade sur photo, sinon disposition automatique.', mode: 'mixte', ou: 'facade/ouvertures.ts' },
  { id: 'o3d.cheminees', parent: 'objets3d.elements', genre: 'objet', titre: 'Cheminées', detail: 'Souches notées sur place ou vues par Claude.', mode: 'mixte', ou: 'model/types.ts#Cheminee' },
  { id: 'o3d.arbres', parent: 'objets3d.elements', genre: 'objet', titre: 'Arbres', detail: 'Générés par EZ-tree depuis la bibliothèque d’essences.', mode: 'manuel', ecran: '?admin&ecran=arbres', ou: 'three/arbre3d.ts' },

  // 5. Les textures
  { id: 'textures', parent: null, genre: 'etape', titre: '5. Les textures', detail: 'Une valeur lue sur photo quand elle est cohérente, sinon un repli ; la source est gardée ; un choix manuel n’est jamais touché.' },
  { id: 'tex.murs', parent: 'textures', genre: 'texture', titre: 'Murs : brique, pierre, meulière, enduit…', detail: 'Matériau BD TOPO, photo Panoramax ou choix ; texture à l’échelle réelle teintée par la couleur retenue.', mode: 'mixte', ou: 'three/textureMur.ts' },
  { id: 'tex.couverture', parent: 'textures', genre: 'texture', titre: 'Couverture : ardoise (droite ou en losange), tuile, zinc, gravillons', detail: 'Matériau des fichiers fonciers, puis pente (tuile plate, canal, romaine) ; la grande ardoise posée en losange se choisit ou se voit ; toit-terrasse en gravillons.', mode: 'mixte', ou: 'model/couleurToit.ts' },
  { id: 'tex.sol', parent: 'textures', genre: 'texture', titre: 'Sol : gazon, photo aérienne, relief', detail: 'Gazon montré par défaut sur la parcelle, au-dessus de l’orthophoto.', mode: 'mixte', ou: 'three/gazon.ts' },
  { id: 'tex.palette', parent: 'textures', genre: 'texture', titre: 'Couleurs de l’interface', mode: 'manuel', ecran: '?palette' },

  // 6. Réconciliation
  { id: 'decision', parent: null, genre: 'etape', titre: '6. Réconciliation : une valeur par attribut', detail: 'Pour chaque attribut, les constats de toutes les sources sont groupés par accord, pesés (poids × confiance) et départagés.' },
  { id: 'decision.regle', parent: 'decision', genre: 'regle', titre: 'La règle de décision', detail: 'Automatique si le score atteint {{recon.SCORE_AUTO_MIN}}, l’écart au suivant {{recon.MARGE_AUTO_MIN}} fois, aucun veto, et si la source n’est pas une photo ou Claude seule. Sinon, à vous.', mode: 'mixte', ecran: REGLES, ou: 'regles/reconciliation.json' },
  { id: 'decision.hauteur', parent: 'decision', genre: 'regle', titre: 'Hauteur à l’égout', detail: 'IGN, LiDAR, photo, terrain.', mode: 'mixte', ecran: REGLES },
  { id: 'decision.toit', parent: 'decision', genre: 'regle', titre: 'Forme, bouts et sens du faîtage', detail: 'Retenus puis relus par le moteur des toits sur la mesure LiDAR.', mode: 'mixte', ecran: REGLES },
  { id: 'decision.facade', parent: 'decision', genre: 'regle', titre: 'Silhouette et ouvertures d’une façade', mode: 'mixte', ecran: REGLES },
  { id: 'decision.lidar', parent: 'decision', genre: 'regle', titre: 'Les règles LiDAR', detail: 'Chaque constat LiDAR porte son seuil (SEUIL_MARCHE_M, GAIN_CROUPES…), visible sur la ligne.', mode: 'auto', ecran: REGLES },

  // 7. Processus d'audit
  { id: 'audit', parent: null, genre: 'etape', titre: '7. Le processus d’audit', detail: 'Du terrain à l’écriture dans le projet : rien n’est écrit avant « Valider », Ctrl+Z défait tout.' },
  { id: 'audit.liste', parent: 'audit', genre: 'processus', titre: 'Liste de contrôle et « Ce que je vois »', detail: 'Matériaux, couverture, cheminées, clôture, noté bâtiment par bâtiment.', mode: 'manuel', ou: 'app/audit/parcelle/liste.ts' },
  { id: 'audit.photos', parent: 'audit', genre: 'processus', titre: 'Photos de façade', detail: 'Mesure des coins, relevé automatique si la confiance suffit, silhouette.', mode: 'auto', ou: 'app/audit/parcelle/mesures.ts' },
  { id: 'audit.claude', parent: 'audit', genre: 'processus', titre: 'Analyse par Claude', detail: 'Trois passes, vote, escalade sur désaccord (D20).', mode: 'auto', ou: 'app/audit/parcelle/analyseClaude.ts' },
  { id: 'audit.auto', parent: 'audit', genre: 'processus', titre: 'Sélection automatique', detail: 'Les décisions que le moteur tranche seul arrivent cochées, avec leur raison.', mode: 'auto', ou: 'app/audit/parcelle/arbitrages.ts' },
  { id: 'audit.manuel', parent: 'audit', genre: 'processus', titre: 'Sélection manuelle', detail: 'Retenir un groupe de sources, forcer une valeur, reprendre le choix du moteur ; cocher ou décocher.', mode: 'manuel', ou: 'app/audit/parcelle/validation.ts' },
  { id: 'audit.avantapres', parent: 'audit', genre: 'processus', titre: 'Avant / Après en 3D', detail: 'L’aperçu montre les propositions cochées sans toucher le projet ; l’admin le rejoue sur un audit reçu.', mode: 'mixte', ou: 'zones/parcours/PropositionsAudit.tsx' },
  { id: 'audit.valider', parent: 'audit', genre: 'processus', titre: 'Valider : écriture en un pas', detail: 'Un pas d’historique ; l’audit est gardé avec ses décisions pour le corpus.', mode: 'manuel', ou: 'app/audit/parcelle/validation.ts' },
  { id: 'audit.corpus', parent: 'audit', genre: 'processus', titre: 'Corpus, conformité et règles', detail: 'Les audits reçus rejouent le moteur : le taux de décisions automatiques se maximise en réglant les données.', mode: 'mixte', ecran: '?admin&ecran=conformite' },
];

/** Les problemes de la liste : vide si elle fait bien un arbre. */
export function verifierChaine(noeuds: readonly NoeudChaine[] = CHAINE): string[] {
  const erreurs: string[] = [];
  const ids = new Set<string>();
  for (const n of noeuds) {
    if (ids.has(n.id)) erreurs.push('identifiant repete : ' + n.id);
    ids.add(n.id);
  }
  for (const n of noeuds) {
    if (n.parent !== null && !ids.has(n.parent)) erreurs.push(n.id + ' : parent inconnu (' + n.parent + ')');
    if (n.voir !== undefined && !ids.has(n.voir)) erreurs.push(n.id + ' : renvoi inconnu (' + n.voir + ')');
    if (n.ecran !== undefined && !n.ecran.startsWith('?')) erreurs.push(n.id + ' : un ecran est une adresse qui commence par « ? » (' + n.ecran + ')');
  }
  const parent = new Map(noeuds.map((n) => [n.id, n.parent]));
  for (const n of noeuds) {
    const vus = new Set<string>();
    for (let c: string | null | undefined = n.id; c; c = parent.get(c)) {
      if (vus.has(c)) { erreurs.push('cycle autour de ' + n.id); break; }
      vus.add(c);
    }
  }
  return erreurs;
}

export interface ArbreNoeud<N extends NoeudChaine = NoeudChaine> { noeud: N; enfants: ArbreNoeud<N>[] }

/** L'arbre deduit de la liste, dans l'ordre de la liste. */
export function construireArbre<N extends NoeudChaine = NoeudChaine>(noeuds: readonly N[] = CHAINE as readonly N[]): ArbreNoeud<N>[] {
  const par = new Map<string, ArbreNoeud<N>>(noeuds.map((n) => [n.id, { noeud: n, enfants: [] }]));
  const racines: ArbreNoeud<N>[] = [];
  for (const n of noeuds) {
    const a = par.get(n.id) as ArbreNoeud<N>;
    if (n.parent === null) racines.push(a); else par.get(n.parent)?.enfants.push(a);
  }
  return racines;
}

/** Les feuilles et les noeuds d'un genre, a plat : le filtrage que l'arbre imbrique rend penible. */
export const duGenre = (genre: GenreNoeud, noeuds: readonly NoeudChaine[] = CHAINE): NoeudChaine[] => noeuds.filter((n) => n.genre === genre);

/** La part de la chaine que le moteur decide seul, a la main, ou aux deux : de quoi voir ou l'on en est. */
export function repartitionDesModes(noeuds: readonly NoeudChaine[] = CHAINE): Record<ModeNoeud, number> {
  const out: Record<ModeNoeud, number> = { auto: 0, manuel: 0, mixte: 0 };
  for (const n of noeuds) if (n.mode) out[n.mode]++;
  return out;
}
