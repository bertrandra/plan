# Les ouvrages — un domaine par type d'objet, un contrôleur qui sait ce qui change

*Octobre 2026. Feuille de route d'architecture, phase 6. Décidé avec le propriétaire du projet le 27 octobre 2026 : « une terrasse
n'a pas les mêmes règles de construction qu'un chemin ».*

## Le constat

Un objet du plan est un `ObjetPlan` : une forme (`polygon`, `circle`, `path`) et une `fonction` (terrasse, piscine, pergola…). Ce
que la fonction donne à l'objet vit aujourd'hui en trois endroits :

- **un profil** (`model/fonctions.ts`) : les formes admises et les sections propres de l'inspecteur ;
- **des sous-objets** (`model/champsFonction.ts`, schéma 5) : `batiment`, `arbre`, `parasol`, `piscine`, `pergola`, `cloture` ;
- **des tests épars** : 90 comparaisons `fonction === '…'` réparties dans onze couches (33 dans `app/`, 16 dans `model/`, 12 dans
  `export/`, 7 dans `three/`…), et une centaine d'appels aux prédicats (`estTerrasse`, `estPiscine`…).

Les règles de construction, elles, sont rangées par moteur (`engine/structure.ts`, `layers.ts`, `bom.ts` pour la terrasse ;
`pergola.ts` pour l'abri ; `piscine/` ; `parasol.ts`) sans qu'aucun module ne dise : *voici ce qu'est une terrasse, voici ce
qu'est un chemin*. Pour ajouter un ouvrage (un jacuzzi qui n'est plus un « équipement », un carport qui n'est plus une pergola),
il faut retrouver tous les endroits qui comparent la fonction.

Deuxième constat, mesuré (banc du rendu, étape 2.2) : **le code ne sait pas quel objet a changé**. Une soixantaine de sites
écrivent directement dans les objets (gestes, inspecteur, commandes, préférences d'affichage, tâches de fond), et `render()` ne
prend pas d'argument. Le plan redessine donc ses 600 objets à chaque image, au téléphone 70 à 90 ms, alors qu'en conception un
seul objet bouge : celui qu'on dessine. « Si je fais une pergola, je ne fais pas une terrasse. »

## La cible

### 1. Un ouvrage par type, un registre par couche

Le test d'architecture impose des couches (`model` → `engine` → `core/render/three/export` → `ui` → `app` → `zones`) : un même
fichier ne peut pas porter le modèle d'une terrasse et son dessin 3D. Chaque couche a donc **son registre d'ouvrages**, un module
par type, rangé sous le même nom :

| Couche | Dossier | Ce qu'un ouvrage y déclare |
|---|---|---|
| modèle | `model/ouvrages/` | son identité (fonction, libellé), ses formes admises, ses sections, ses valeurs à la création, ses associés (la plage d'une piscine), ce qu'il perce (bassin, trémie), s'il occupe le sol, s'il s'isole |
| moteur | `engine/ouvrages/` | ses règles de construction : ce qui se calcule, ce qui se chiffre, ce qui se vérifie |
| plan | `render/ouvrages/` | ce que le plan dessine en plus de sa forme (couches de la terrasse, ombre du parasol, bassin) |
| 3D | `three/ouvrages/` | son volume dans la Vue 3D |
| inspecteur | `ui/champs/` (déjà par section) | ses sections propres, déclarées par l'ouvrage du modèle |

Les ouvrages, et leur famille de règles :

| Famille | Ouvrages | Règles de construction |
|---|---|---|
| **Construit, calculé** | terrasse | structure (cadre, solives, lambourdes, appuis), lames, nomenclature, prix, note de calcul |
| | pergola, carport | cadre suivant le contour, poteaux aux sommets, poutres ; mêmes règles, défauts différents |
| | piscine | bassin, terrassement, margelles, filtration, chiffrage |
| | parasol | mât, toile, ombre portée |
| **Bâti relevé** | bâtiment, annexe | toit (BD TOPO, LiDAR, corps), façades, relevé |
| **Surface simple** | dalle, chemin, massif, mobilier, équipement (jacuzzi) | une géométrie, une surface ou un linéaire, une matière ; pas de structure (« proche de la géométrie simple pour l'instant ») |
| **Ouverture** | trémie | perce la terrasse qu'elle chevauche |
| **Contexte** | terrain (parcelle, voisines), limite, arbre, point de vue, autre | ce qui situe le projet ; aucune règle de construction |

Un ouvrage absent ou inconnu (un ancien fichier) se comporte comme `autre`, comme aujourd'hui. **Aucun nombre ne bouge** :
chaque étape déplace des règles, elle n'en change aucune ; les empreintes de `tests/fixtures/golden/` le vérifient.

### 2. Un contrôleur des objets : le seul à dire « cet objet a changé »

`core/controleurObjets.ts` tient **une version par objet** (une `WeakMap` : un objet recréé — annulation, ouverture, import — n'a
pas de version, donc il est neuf) et une **version d'ensemble** :

- `toucher(obj)` : cet objet a changé. Le contrôleur touche aussi ce qui en dépend, d'après le registre des ouvrages : une
  piscine ou une trémie qui bouge touche la terrasse qu'elle perce.
- `toucherTout()` : on ne sait pas quel objet a changé ; tout est neuf. C'est le repli de toute écriture qui ne nomme pas son
  objet (`marquerModifie()` sans argument), donc le défaut sûr.
- `version(obj)` : la clé que lisent le dessin du plan et les calculs.

Les points de passage, d'après l'inventaire des écritures (27 octobre 2026) — huit couvrent l'usage courant :

1. le glisser (`interaction/pointeur.ts`, après `appliquerGlisser`) : `geste.obj` ;
2. l'inspecteur (`app/inspecteur.ts::appliquer`) : l'objet sélectionné, ou tous les chemins pour « appliquer à tous » ;
3. l'historique (`empiler`, `preparer`, `marquerModifie`) : un objet nommé s'il est passé, sinon `toucherTout()` ;
4. `rebuildHandles(obj)`, appelé après chaque édition structurelle (sommet ajouté, retiré, angle, longueur) ;
5. l'explorateur (`definirVisibilite`, `definirVisibiliteTous`) ;
6. la lecture des toits en tâche de fond (`redessinerObjets(cles)`, `apresLot`) ;
7. les décisions de l'audit (`appliquerPropositions`, qui rend ses clés) ;
8. la restauration (`historique.restaurer`) et l'import SVG : les objets sont neufs.

### 3. Le dessin du plan ne refait que ce qui a changé

`rendreObjets` garde, par objet, la clé de son dernier dessin : sa version, celle de ce qui le perce, et l'état d'ensemble qu'il
lit (cadrage et échelle, sélection, isolement, voisinage montré, pointage d'une cote, photo aérienne, thème). Clé inchangée : le
nœud SVG reste tel quel, sans un calcul. En conception, un rendu ne redessine que l'objet en cours.

### 4. Le garde-fou : la fumée vérifie chaque clé

Une clé fausse se verrait : un objet changé sans avoir été touché resterait dessiné à son ancienne place. En développement (le
serveur que joue la fumée), le plan **redessine quand même** les objets dont la clé n'a pas bougé et signale toute valeur qui
aurait changé (`[cle de version]` dans la console). La fumée fait échouer un point qui en produit. Un chemin d'écriture oublié
par l'inventaire se trouve donc par la fumée, pas par un client.

## La structure des ouvrages, de l'ouvrage à la géométrie

*Relevé dans le code le 27 octobre 2026.* Chaque ouvrage descend les couches dans le même ordre : **forme** (ce que l'objet est
géométriquement) → **modèle** (ses champs, sa fabrique) → **règles** (moteur) → **dessin** (plan, 3D) → **inspecteur** →
**exports**, et touche en bas des **primitives de géométrie** (`geometry/`). Ce qui suit est l'état d'aujourd'hui ; les étapes
6.3 et 6.4 rangent chaque ligne sous le nom de son ouvrage.

### Ce que tous partagent

| Couche | Commun à tout objet |
|---|---|
| forme | `polygon` (`pts`), `circle` (`center`, `r`), `path` (`pts`, `width`, `curve`) — `model/types.ts` |
| modèle | sous-objets par fonction en mémoire (`batiment`, `arbre`, `parasol`, `piscine`, `pergola`, `construction`, `cloture`), à plat dans le fichier (`model/champsFonction.ts`) |
| plan | le contour : `render/objects.ts::positionnerObjet` → `geometry/path.ts::polyStr` (polygone), `pathD` (chemin), `cx/cy/r` (cercle) ; le nom au `geometry/basic.ts::centroid` ; tout passe par `geometry/vue.ts::versEcran` |
| 3D | un prisme : `three/sceneObjets.ts::ajouterUnObjet`, hauteur `engine/hauteurs.ts::elevationOf` (défaut : `model/ouvrages/`), posé sur le sol ; le gazon s'arrête à l'emprise de ce qui `occupeLeSol` (`three/gazon.ts`) |
| inspecteur | Objet, Apparence ; Côtés, Coins, Alignement pour une forme à sommets (`ui/champs/objet.ts`) |
| exports | DXF (`export/dxfPlan.ts`), SVG et PDF du plan, résumé, dimensions du dossier PDF (`shoelace`, longueur × largeur) |

### Les champs que tout objet porte

`name`, `fonction`, `type` et sa géométrie ; `elevation` (hauteur en 3D) ; `locked` (verrou), `constrained` (l'objet reste dans
le contour de la parcelle : un geste qui l'en ferait sortir est refusé, `contourDeContrainte`), `priority` (ordre
d'empilement), `matiere` (texte libre) ; ce qui se montre : `showName`, `showSegNames`, `showVertNames`, `showDims`,
`showAngles`, `hidden` (préférences de l'explorateur) ; `fill`, `fillOpacity`, `stroke` ; `textureVerticale`,
`textureHorizontale` (textures Poly Haven, `TextureAppliquee`) ; noms des coins et des côtés, coins figés ; `bdtopo` et
`voisinage` pour ce qui vient de l'IGN.

### Arbre par ouvrage

**Terrasse** — construit, `polygon`
- modèle : `pts`, `construction` ; fabrique `creation.ts::nouvelleTerrasse` ; défauts `engine/construction.ts::ensureConstruction`
- règles : `engine/structure.ts::computeStructure` (cadre, solives, appuis `buildVisGrid`) → `layers.ts::computeTerrasseLayers`
  (lames `lames.ts::generateParallelLines`, rive) → `bom.ts::computeBOM`, `prix.ts`, `debit.ts`, `portees.ts` ;
  implantation `implantation.ts`, chantier `chantier.ts` ; hauteurs `hauteurs.ts` sur le sol `sol.ts::solSousEmprise` → `model/relief.ts`
- plan : couches `render/terrasseCouches.ts` ; trous par gabarit `render/objects.ts::percerContour`
- 3D : `three/sceneTerrasse.ts::construireStructureTerrasse`, `assise3d.ts`
- inspecteur : `ui/champs/construction.ts` ; exports : dossier PDF, cerfa, DP, DXF
- géométrie : `polygon.ts::polygonOffset`, `basic.ts::signedArea`, `shoelace`, `centroid`, `pointInPolygon`, `clipLineToPolygon`,
  `clipPolygonByConvex`, `difference.ts::differencePolygones`, `ringSegments`, `offsetZone`
- dépend de : **piscine** et **trémie** qui la percent (`objetsQuiPercent` → `contourOuverture`), **équipement** qui la renforce
  (`findSpaZones` → `offsetZone`), **terrain** (relief : hauteur des appuis), **parasol** qui lui est lié

**Pergola, carport** — construit, `polygon` ; mêmes règles, défauts différents (`ABRIS` : 4 × 3 m, 3 × 5 m)
- modèle : `pts`, `pergola` (toit, matériau, adossée, débord, hauteur, sections, entraxe) ; fabrique `creation.ts::nouvelAbri`
- règles : `engine/pergola.ts::calculerPergola` (poteaux par `polygonOffset`, poutres par `clipLineToPolygon`, angles par
  `lineLineIntersect`), `chiffrerPergola` ; passage du carport `PASSAGE_CARPORT_M` ; **note de calcul** (Eurocodes : neige,
  vent, bois ou aluminium) `engine/noteCalcul.ts`, inspecteur `ui/champs/noteCalcul.ts`, PDF `export/noteCalculPdf.ts`
- plan : `render/pergolaOverlay.ts` ; 3D : `three/pergola3d.ts` ; inspecteur : `ui/champs/pergola.ts` ; exports : cerfa
- dépend de : **terrain** (relief) seulement ; adossée, elle désigne un de ses propres côtés, pas un bâtiment

**Piscine** — construit, `polygon` ou `circle`
- modèle : `piscine` (implantation, structure, revêtement, plage, `terrasseKey`) ; fabrique `creation.ts::nouvellePiscine`
- règles : `engine/piscine/geometrie.ts` (`contourPiscine` : un cercle devient 48 côtés ; `elargir` = `polygonOffset` ; profil du
  fond, volume d'eau) → `calcul.ts::calculerPiscine` (margelles, plage, terrassement, filtration, distances aux limites, régime
  d'autorisation) → `chiffrage.ts`, `note.ts`
- plan : `render/piscineOverlay.ts` ; 3D : `three/piscine3d.ts` ; inspecteur : `ui/champs/piscine.ts` ; exports : `dossierPiscine.ts`
- géométrie : `polygonOffset`, `signedArea`, `shoelace`, `distancePointSegment`, `projectOntoSegment`
- dépend de : **terrasse** de plage (`piscine.terrasseKey`) ; elle **perce** toute terrasse qu'elle chevauche ; **terrain**
  (distances aux limites, relief)

**Parasol** — construit, `circle` (la toile)
- modèle : `parasol` (hauteur, mât déporté, angle, sur le périmètre, `terrasseLieeKey`) ; fabrique `creation.ts::nouveauParasol`
- règles : `engine/parasol.ts` — ombre `geometrieOmbre`, `ombreInstantanee` (soleil `geo/soleil.ts::positionSoleil`), cartes
  d'ombre et meilleure position, mât `positionMat`, `projeterSurPerimetre`
- plan : `render/parasolOverlay.ts` ; 3D : mât et toile `three/sceneObjets.ts::ajouterParasol` ; inspecteur : `sectionParasol`
- dépend de : **terrasse** (`terrasseLieeKey`, sinon celle qui le contient)

**Bâtiment, annexe** — bâti, `polygon` ; l'annexe est le bâtiment sous un autre nom
- modèle : `batiment` (toit, volumes, toit mesuré, corps, façades, fenêtres, couleur des murs), `bdtopo` ; import
  `geo/cadastreObjets.ts` ; toits `model/volumesToit.ts`, `model/toitMesure.ts`
- règles : `facade/toits/toitCorps.ts::reconstruireCorps`, `toitLidar.ts` ; façades `facade/ouvertures.ts`, `facade/profil.ts`
- 3D : `three/toitCorps3d.ts`, `toitMesure3d.ts`, `detailsBatiment.ts`, `releve3d.ts`, `cheminees3d.ts`
- inspecteur : relevé `ui/champs/facade.ts`, fenêtres, couleur des murs
- géométrie : `squelette.ts::squeletteDroit`, `faitage.ts::repereFaitage`, `facadeExterieure.ts`, `lineaire.ts`

**Chemin** — surface, `path` ; l'exemple d'un ouvrage « proche de la géométrie simple »
- forme : une polyligne ouverte d'au moins deux points (`pts`), une **largeur** (`width`, en mètres), une **courbe** (`curve`)
- modèle : fabrique `creation.ts::nouveauChemin` (deux points à 4 m, 1,20 m de large, droit) ; un tracé importé d'un SVG est un
  chemin (`io/importSvg.ts`) ; il occupe le sol parce qu'il a une largeur (`model/ouvrages/surfaces.ts`, `aUneLargeur`)
- règles : aucune — pas de structure ; sa surface est longueur du tracé dessiné × largeur, et sa largeur vaut 1 m quand le fichier
  n'en dit rien (`model/ouvrages/surfaces.ts` : `LARGEUR_CHEMIN_DEFAUT`, `largeurChemin`, `longueurChemin`, `surfaceChemin`)
- **la courbe** : avec `curve` et trois points au moins, le tracé passe par chaque point en Catmull-Rom uniforme, converti en
  Bézier cubiques (points de contrôle `p1 + (p2 − p0)/6` et `p2 − (p3 − p1)/6`, extrémités répétées) ; sinon une ligne brisée.
  Une seule définition, `geometry/courbe.ts` (`tronconsBezier`, `echantillonnerTrace`, `longueurTrace`)
- plan : un `<path>` sans remplissage, `d` par `geometry/path.ts::pathD(scène, pts, courbe)` (la courbe de `courbe.ts`), épaisseur de trait = largeur ×
  échelle : en 2D la largeur n'est qu'un trait, aucun contour décalé n'est calculé
- 3D : la même courbe échantillonnée (`geometry/courbe.ts::echantillonnerTrace`, 12 points par segment), élargie en ruban
  (`geometry/ruban.ts::ribbonChemin` : chaque côté décalé d'une demi-largeur, angles en onglet par `geometry/segments.ts::lineLineIntersect`, en
  biseau au-delà de 4 demi-largeurs), posé ou drapé sur le relief (`addRubanDrape`) ; le gazon s'arrête au même ruban
- inspecteur : longueur totale (du tracé dessiné), largeur (0,05 m au moins), « Courbe (passe par les points) », texture commune à tous les chemins
- exports : SVG et PDF du plan redessinent la courbe ; le DXF écrit la ligne brute (ni courbe, ni largeur) ; la surface (dossier,
  résumé, PDF) se compte sur le tracé dessiné : la courbe d'un chemin courbe (`longueurTrace`, 32 cordes par segment)
- géométrie : `courbe.ts`, `ruban.ts`, `path.ts::pathD`, `segments.ts::lineLineIntersect`, `basic.ts::dist`, `centroid`, `anneau.ts::sommetDe`
- dépend de : **terrain** (relief, pour le draper) ; d'aucun autre ouvrage

**Dalle, massif, mobilier** — surface, toute forme
- modèle : un objet générique ; les haies et la végétation de l'IGN arrivent en massif (`geo/cadastreObjets.ts`)
- règles : aucune ; 3D : le prisme commun ; exports : le dossier PDF les compte comme équipement posé sur la terrasse
- note : le type d'appui « dalle » et `empriseDalle` du moteur appartiennent à la **terrasse** posée sur dalle, pas à cet ouvrage

**Équipement (jacuzzi)** — surface, le plus souvent un `circle` (fabrique `creation.ts::nouveauCercle`)
- règles : il n'a pas de structure propre ; il **renforce la terrasse** qui le porte : `engine/structure.ts::findSpaZones` →
  `empriseEquipement` (32 côtés) + `offsetZone(marge)`, appuis de rôle `spa`, `portees.ts::porteeVisSpaM`
- géométrie : `offsetZone`, `centroid`, `pointInPolygon`

**Trémie (trou de terrasse)** — ouverture, `polygon` ou `circle`
- règles : `engine/structure.ts::contourOuverture` (un cercle devient 32 côtés), `objetsQuiPercent`, `trousDeTerrasse` ; une
  trémie entièrement dans la terrasse peut recevoir une rive (`layers.ts`, `safeOffset`)
- plan : le gabarit qui perce la terrasse ; 3D : le trou dans le prisme de la terrasse ; inspecteur : `sectionTrou`
- dépend de : la **terrasse** qu'elle chevauche

**Terrain (parcelle, voisines)** — contexte, `polygon`
- modèle : `key: 'parcelle'` ou fonction terrain ; porte `cloture` (`model/cloture.ts`), `relief` (`model/relief.ts`), `plu`,
  `cadastre`, `ortho`, `declaration`, `ruesVoisinage` ; voisines `voisinage: true` ; mitoyenneté `model/mitoyennete.ts`
- règles : le sol de tout le projet `engine/sol.ts::solDuRelief`, `solDuProjet`
- plan : clôture `render/cloture.ts`, courbes de niveau `render/relief.ts` → `geometry/isolignes.ts`, photo aérienne
  `render/ortho.ts` ; 3D : gazon, relief `three/relief3d.ts`, clôture `three/cloture3d.ts`
- inspecteur : parcelle, clôture, relief, voisinage, déclaration ; exports : DP, dossier mairie, cerfa, dossier piscine

*La clôture et le portail* (portés par la parcelle du projet, `model/typesCloture.ts`, `MD/spec-cloture.md`)
- forme : la clôture suit le **contour** de la parcelle, côté par côté ; un côté est repéré par son **numéro** (`cote`, l'indice
  de son premier sommet) et lu comme une façade vue de dehors (`facade/geometrie.ts::facadesDuContour`, `pointDeFacade`)
- modèle : `cloture` = `active`, un réglage par défaut (`ReglageCloture` : type palissade, grillage, haie, mur ; hauteur,
  couleur, soubassement), les côtés réglés à part (`cotes`), les **accès** (`portails`), les hauteurs maximales du PLU
- **le portail** (`Portail`) : `nature` portail ou portillon, `cote` (le numéro du côté), `x` (sa position en mètres depuis le
  bord gauche du côté vu de dehors, le repère des ouvertures de façade), `largeur`, `hauteur`, `ouverture` (un battant, deux
  battants, coulissant), `sens`, `refoulement`, `petitVantail`, `forme` (droit, chapeau de gendarme, chapeau inversé, bombé,
  concave) et sa `fleche`, `remplissage`, `materiau`, `couleur`, `texture`, `piliers`, `retrait`, `motorise`, `ouvert`
  (affichage seul) ; fabrique `model/cloture.ts::nouveauPortail`
- règles (`model/cloture.ts`) : le côté d'accès deviné à l'import (`coteDAcces`, `clotureDImport`, le côté sur rue
  `geo/coteRue.ts`), l'emprise de l'accès (`empriseAcces`) qui coupe la clôture en tronçons (`tronconsDuCote`), les vantaux
  (`vantauxDe`) et le profil du haut d'un vantail selon sa forme (`profilDuVantail`), les alertes (largeur, hauteur du PLU :
  `alertesAcces`, `alertesHauteur`), le portillon accolé au portail (`accolerPortillon`), la pose au clic (`poserAcces`,
  `coteLePlusProche`)
- plan : `render/cloture.ts::dessinerCloture` (tronçons et accès) ; geste : le portail se **glisse** le long de son côté ou
  sur un autre (`interaction/glisserAcces.ts::glisserAcces`, `interaction/pointeur.ts`)
- 3D : `three/cloture3d.ts::ajouterCloture3d` (tronçons, piliers, vantaux, ouverts ou fermés)
- inspecteur : `ui/champs/cloture.ts::sectionCloture`, `sectionPortails` ; audit de la parcelle : le portail se relève sur place
- géométrie : `facadesDuContour`, `pointDeFacade`, `geometry/segments.ts::projectOntoSegment`
- dépend de : la **parcelle**, par le numéro de ses côtés

**Limite** — contexte, `path` (les limites cadastrales, 0,12 m, verrouillées) : tirets sur le plan, rien en 3D, ligne au DXF
**Arbre** — contexte, toute forme : `arbre` (diamètre, couleur, essence), bibliothèque `model/especesArbre.ts`, 3D EZ-tree
`three/arbre3d.ts`, `three/ezTree.ts` ; ni règle ni dessin propre au plan
**Point de vue** — contexte, `path` de deux points (position, visée) : flèche sur le plan, il règle la caméra de la Vue 3D
**Autre** — le repli de toute fonction inconnue : le prisme et les sections communes

### Les champs propres, au complet

Ce que l'arbre ci-dessus ne nomme pas, relevé champ par champ (audit du 27 octobre 2026) :

- **Terrasse** (`construction`) : `segmentReference` (le côté qui donne le sens des lames, par son numéro), `sensPose`,
  `niveauFini`, `plotsDansEmprise`, `cotesSansRive` ; `bom`, le résultat enregistré qui porte les **prix réels** saisis ;
  les prix, le débit, le chantier, `echelleImplant` ; `lames3dFilaire` (préférence d'affichage de la Vue 3D rangée sur la
  terrasse courante) ; `vues3d`, déclaré et normalisé mais **lu par personne** (dormant).
- **Pergola, carport** (`pergola`) : `coteReference` (le côté, par son numéro, qui oriente les chevrons et le bas d'un
  appentis), `coteMur` (le côté adossé), `pente`, contrefiches, chevrons, couleurs, `longueursBois` ; `calcul` (hypothèses de
  la note), `prixMl`, `prixToile`, `prixCouverture`.
- **Piscine** (`piscine`) : `cotePetitBain` (le côté, par son numéro, du petit bain : il oriente le profil du fond), `fond`,
  profondeurs, `partFosse`, `hauteurHorsSol`, `margelle`, `largeurMargelle`, `largeurPlage`, `essencePlage`, filtration,
  traitement, chauffage, éclairage, sécurité, `local`, `distanceLocal`, couleurs, `prix`.
- **Bâtiment, annexe** (`batiment`) : `toitLidarLu`, `verifieSurPlace`, `toitFige`, `modeToit`, `profilFacades`,
  `toitACheval` (les **clés** des parcelles qu'il chevauche), `fenetres3d` (`mode`, `liste[].cote`) ; par façade relevée :
  `photoLocale` (clé d'une photo gardée sur l'appareil), `calage`, `calibration`, `corrections`, `grille`, `partieBasse`,
  `depuisAudit` ; par corps de toit : `saillie.hote` (rang d'un autre corps), `cheminees` (en coordonnées **absolues**),
  `lucarnes`, `elementsToit`, `terrasse.edicules.pts` ; `bdtopo.id` (le cleabs) est **son identité** : actualisation IGN,
  faits du moteur de règles (`regles/toits/faits.json`), audit.
- **Terrain, parcelle du projet** : le lieu (`latitude`, `longitude`, `nomLieu` : il règle le soleil, l'ombre des parasols,
  les profils de toits) ; `affichage` ; `voisinage3d` (murs, toits en corps — qui décide si les toits voisins se lisent au
  LiDAR —, vitres, clôtures des voisins, noms des rues) ; `gazon3d` ; `cadastre` (`idu`, `codeInsee`, `section`, `numero`,
  `adresse`, point d'adresse, `geometrieSource`, `idusCadastraux`, **origine** `origineLat/Lon` d'où se projettent la photo
  aérienne, le relief, le LiDAR et les rues) ; `relief` (`zRef` lu au centre de la terrasse courante, `paysage`, grille,
  `affichage` : courbes, équidistance, sol 3D) ; `plu` (point, secteur protégé `spr`, `servitudes`) ; la clôture côté par
  côté (`limite` rue ou séparative, `mitoyenne`, et le réglage : texture, lames, occultante, grillage, essence, épaisseur,
  taille, parement, couvertine) ; les anciens champs à plat de la clôture, tenus en phase (`synchroniserAnciensChamps`).
- **Arbre** : `arbre.texture` (ancien). **Point de vue** : `altitude` (hauteur de l'œil) ; l'ordre des deux points compte.

### Les dépendances entre ouvrages

```
PAR CLÉ (une référence enregistrée)
piscine ──terrasseKey (plage)──▶ terrasse        isolement des deux ensemble ; centrage de la piscine
parasol ──terrasseLieeKey──▶ terrasse            à défaut : celle qui le contient, puis la terrasse courante
bâtiment ──toitACheval.parcelles──▶ terrains     le toit à cheval sur deux parcelles
cote ──refObjKey, targetObjKey──▶ tout objet     (et un côté, un sommet par leur numéro)
audit, moteur de règles ──clé, cleabs, côté──▶ bâtiment, façade ; ils écrivent la clôture et les portails
copie d'un bâtiment ──bdtopo.id──▶ l'original    l'actualisation IGN lui redonne la géométrie de l'original

PAR GÉOMÉTRIE (calculé à chaque lecture)
piscine, trémie ──percent──▶ terrasse            deux définitions : objetsQuiPercent (margelle, dans les deux sens),
                                                 calculerPiscine (sommets du bassin dans la terrasse, un sens)
équipement ──renforce──▶ terrasse
terrasse ──pose le mât sur son bord──▶ parasol   à chaque rendu (contraindreParasols)
terrain ──relief──▶ terrasse, pergola, carport, piscine, chemin (hauteurs, drapé)
terrasse courante ──zRef──▶ relief               le zéro du plan se lit au centre de la terrasse
terrain ──limites, PLU (secteur protégé)──▶ piscine (distances, régime d'autorisation) ; clôture (hauteurs maximales)
terrain ──lieu──▶ parasol (soleil), façade au soleil, profils de toits
terrain ──origine──▶ photo aérienne, relief, LiDAR, rues
terrain ──contour──▶ tout objet `constrained`
terrain ──côtés (par numéro)──▶ clôture, portails, portillons ; côtés mitoyens, côté sur rue (adresse, rues)
côté sur rue, portail ──▶ placement d'un carport neuf
bâtiment ──▶ placement d'une terrasse ou d'une piscine neuve (façade au soleil, retrait)
bâtiment ◀──▶ bâtiments et parcelles voisines (mitoyenneté, profils de toits, corps lus au LiDAR)
terrains ──union──▶ emprise du calque (sol 3D, photo aérienne)
arbre ──essence──▶ bibliothèque d'essences ; tout objet ──texture──▶ Poly Haven
pergola, carport : aucun autre ouvrage
```

**Supprimer un objet ne nettoie rien** (`model/creation.ts::supprimer`) : la plage d'une piscine, le parasol lié, les cotes,
l'isolement, le toit à cheval et l'audit gardent une clé qui ne mène plus nulle part. Chaque flèche par clé doit dire ce que
devient la source quand la cible disparaît (étape 6.3).

Le contrôleur (étape 6.1) suit ces flèches : toucher une piscine, une trémie ou un équipement doit faire refaire la terrasse
qu'ils percent ou renforcent ; toucher le terrain (relief), tout ce qui pose sur le sol. Aujourd'hui une terrasse suit la version
de l'ensemble, le repli le plus simple ; l'étape 6.5 remplace ce repli par ces flèches.

### Ce que le relevé a trouvé à ranger

- ~~**La courbe est écrite quatre fois**~~ — rangé le 27 octobre 2026 : `geometry/courbe.ts` tient la courbe (tronçons de Bézier,
  échantillonnage, longueur du tracé), `geometry/ruban.ts` le ruban ; `pathD`, `exPathD`, `pdfPathD` et la 3D la lisent, à l'octet
  près (`tests/unit/geometry/courbe.test.ts` garde les anciennes copies comme oracle ; `plan.svg` et `plan.pdf` le vérifient aussi).
- ~~**La largeur par défaut d'un chemin n'est pas la même partout**~~ — décidé le 27 octobre 2026 : **1 m partout**
  (`model/ouvrages/surfaces.ts::largeurChemin`). Le dossier PDF et le dossier piscine lisaient 0,5 m. Version majeure.
- ~~**La surface d'un chemin courbe** se compte sur ses segments droits~~ — décidé le même jour : elle se compte sur la courbe
  dessinée (`surfaceChemin`), comme la longueur totale de l'inspecteur et du résumé. Version majeure ; les nombres qui bougent sur
  la démonstration sont dans `tests/fixtures/golden/EMPREINTES.md`.
- **Les références par numéro de côté ou de sommet ne suivent pas un sommet ajouté ou retiré.** `model/sommets.ts` tient en
  phase quatre tableaux (points, noms des coins, noms des côtés, coins figés) et rien d'autre. Aucune de ces références n'est
  renumérotée :

  | Référence | Ouvrage | Ce qui se passe, par exemple |
  |---|---|---|
  | `cloture.cotes[].cote`, `portails[].cote` | terrain | un sommet ajouté sur le côté 1 met le portail du côté 3 sur l'ancien côté 2 ; un sommet retiré peut le faire tomber (`coteValide`) |
  | `construction.segmentReference` | terrasse | les lames tournent : **la nomenclature et le prix changent** sans que rien ne le dise |
  | `construction.cotesSansRive` | terrasse | la rive change de côtés |
  | `pergola.coteReference`, `pergola.coteMur` | abri | les chevrons, le bas d'un appentis, le mur adossé sautent ; la DP titre l'élévation par ce côté |
  | `piscine.cotePetitBain` | piscine | le petit bain change de bout : **volume d'eau, terrassement et prix changent** |
  | `batiment.facades[].cote`, `fenetres3d.liste[].cote` | bâtiment | un relevé passe sur un autre mur |
  | cote : `refSegIndex`, `targetPtIndex` | cotes | une cote mesure le sommet voisin ; au-delà du dernier, plus rien |
  | audit : façades par côté, `cle#cote`, photos ; moteur de règles `facade:<cle>#<cote>` | bâtiment | même chose |

  Trois autres gestes cassent ces références ou des positions :
  - **l'actualisation IGN** remplace les points d'une parcelle ou d'un bâtiment (un autre nombre de sommets) et garde par
    numéro la clôture, les façades relevées, les fenêtres, la couleur des murs ; elle remet les noms des coins et des côtés
    par défaut ; depuis le 27 octobre 2026, un bâtiment refait par « Actualiser le projet » garde la clé de l'ancien qui portait le
    même identifiant BD TOPO (`batimentsRecrees`) ; seul un bâtiment sans correspondant (dessiné, ou nouveau à la BD TOPO) prend
    une autre clé ;
  - **raccourcir un côté** ne recale ni `Portail.x`, ni `OuvertureFacade.x`, ni `partieBasse` ;
  - ~~**déplacer ou tourner un bâtiment** laisse à l'ancienne place ce qui est en coordonnées absolues~~ — corrigé le 27 octobre
    2026 : un contour qui bouge d'un bloc (`geometry/deplacement.ts`) fait suivre à l'ouvrage ce qu'il porte
    (`Ouvrage.suivreContour`, `model/ouvrages/bati.ts` : corps, cheminées, édicules, volumes, faîtage ; la grille mesurée se
    translate, tournée elle part). Cela vaut pour un bâtiment dessiné : celui de l'IGN ne se déplace plus (section suivante).

    **Sa forme, elle, peut être retouchée, après un avertissement** (décision du propriétaire du 27 octobre 2026 : « Oui avec
    avertissement. Si IGN n'est pas bon. »). Tout geste qui déforme son contour (tirer un sommet, un côté ou le rayon, ajouter
    ou retirer un sommet, saisir un angle ou une longueur, le mode rectangle) demande d'abord, par le dialogue de confirmation :
    « « Maison » vient de l'IGN. La retoucher à la main la détache de l'IGN : à la prochaine actualisation, vous choisirez entre
    garder votre version et reprendre celle de l'IGN. Continuer ? » (`interaction/retoucheTerrain.ts`). « Annuler » : rien, aucun
    pas d'annulation. « Confirmer » : l'objet reçoit le marque `retoucheMain: { date }` (`model/retouche.ts`, enregistré dans le
    fichier), puis le geste a lieu ; pour un glisser, la question se pose à l'appui et la personne tire de nouveau. Marqué, il ne
    demande plus rien. À l'actualisation IGN (le dialogue « Actualiser depuis l'IGN » comme « Actualiser le projet »), un objet
    retouché est **gardé tel que la personne l'a laissé** (« ne plus autoriser la mise à jour IGN ») ; une case décochée par objet,
    « Reprendre la version de l'IGN pour « X », retouché à la main le JJ/MM/AAAA », le remplace par sa source, retire le marque
    et garde sa clé (« remplacer le bâtiment avec la source IGN »).

  Tiennent : le mode rectangle (même nombre, même ordre), `saillie.hote` (renuméroté par `facade/modeToit/saillies.ts`), les
  faits du moteur de règles (cleabs et azimut), le point de vue (deux points protégés). C'est le rôle même du contrôleur par
  ouvrage : **chaque ouvrage déclare ses références par côté, par sommet et en coordonnées absolues, et chaque geste les fait
  suivre par lui** (étape 6.3). Pour la terrasse, l'abri et la piscine, c'est un nombre qui bougeait sans raison : la
  correction se note `Corrigé`, et aucun nombre d'un fichier enregistré ne change.
- **Le bâtiment et l'annexe** se comparent encore à la main dans les exports (`'batiment' || 'annexe'`) : c'est le bâti, une
  famille, que le registre dit déjà (étape 6.4).

## Les objets posés sur le terrain réel

*Décidé avec le propriétaire le 27 octobre 2026.*

Ce qui vient du cadastre ou de l'IGN — la parcelle du projet, les parcelles voisines, les bâtiments et les éléments de l'IGN
(`model/fonctions.ts::estPoseSurLeTerrain` : l'objet porte `cadastre` ou `bdtopo`) — est à sa place réelle. Tout ce qui est
posé sur le terrain le lit à cette place :

| Ce qui lit la place réelle | Ce qui casserait si l'objet bougeait |
|---|---|
| l'actualisation IGN (parcelle par sa référence cadastrale, bâtiment par son identifiant IGN) | elle remettrait la géométrie réelle, ou garderait des données désalignées |
| la lecture des toits au LiDAR | elle lit les hauteurs à l'emplacement réel |
| la photo aérienne, le relief, les rues, le PLU | ils sont sur le terrain : **ils ne tournent pas** |
| le soleil, l'ombre des parasols, la façade au soleil | le nord réel |
| le voisinage, la mitoyenneté, le côté sur rue | les voisins ne s'aligneraient plus |
| l'audit sur place (GPS, photos de rue géolocalisées) | les façades visées ne correspondraient plus |

Les règles :

1. **Il ne se déplace ni ne tourne.** Le glisser à la souris et l'outil « Aligner » le refusent, en le disant
   (`MESSAGE_TERRAIN_REEL`, `interaction/pointeur.ts`, `interaction/outilAlignement.ts`). Un décalage se corrige par le
   recalage (LiDAR), pas à la main. La « remise à sa place de départ » reste permise : elle le ramène là où il était.
2. **Il se retouche, avec un avertissement**, parce que l'IGN peut se tromper. Le premier geste qui déforme son contour
   (tirer un sommet ou un côté, en ajouter, en retirer, changer un angle ou une longueur) demande : « « Maison » vient de
   l'IGN. La retoucher à la main la détache de l'IGN : à la prochaine actualisation, vous choisirez entre garder votre version
   et reprendre celle de l'IGN. Continuer ? ». Oui : l'objet est marqué « retouché à la main », avec la date, dans le fichier.
3. **À l'actualisation IGN, une question par objet retouché.** Par défaut, il est gardé tel quel : l'IGN ne le met plus à
   jour. Le dialogue montre une case décochée par objet, « Reprendre la version de l'IGN pour « X », retouché à la main le … » ;
   cochée, l'objet reprend la source IGN et perd sa marque — comme un bâtiment vérifié sur place, gardé sauf « Recalculer
   aussi ».
4. **Reprendre la source IGN ne crée pas un nouvel objet** : il garde sa clé, à laquelle tiennent les cotes, l'audit, les faits
   du moteur de règles et les réglages de la personne.
5. **Pas de vue tournée.** Tourner l'affichage seul (comme une carte sur la table) garderait tout juste ; proposé, écarté : le
   plan reste nord en haut.

## Le soleil et l'ombre

*Relevé dans le code le 27 octobre 2026.* Le soleil n'est pas un ouvrage, mais presque tout le plan en dépend : l'ombre des
parasols, la lumière et les ombres de la Vue 3D, le feuillage des arbres, le placement d'un objet neuf. Il n'a pas aujourd'hui
de composant à lui : il est réparti entre `geo/`, `engine/`, `three/`, `app/`, `ui/` et `util/`.

### Les repères

- Le plan : +x à l'est, +y au **nord réel** (un plan importé est projeté sur le plan tangent local, `geo/projection.ts`). Un plan
  dessiné à la main suppose le haut au nord : rien ne permet aujourd'hui de dire où est son nord.
- L'astronomie : l'azimut compte depuis le nord, dans le sens des aiguilles ; l'angle du mât d'un parasol (`matAngleDeg`) depuis
  l'est, dans l'autre sens.
- La 3D : +X à l'est, +Y en haut, le nord vers −Z (`three/primitives.ts::versLocalDepuis`).

### Le soleil lui-même

- **Une seule formule** (`geo/soleil.ts`) : `positionSoleil(année, mois, jour, heure, latitude, longitude)` rend la hauteur et
  l'azimut (déclinaison de Cooper, équation du temps approchée, sans réfraction) ; `leverEtCoucher` cherche minute par minute
  le premier et le dernier instant où le centre du disque est au-dessus de l'horizon (`null` au-delà des cercles polaires).
  Quatre modules l'appellent : `engine/parasol.ts`, `three/lumiere.ts`, `three/presentation.ts`, `app/boot/vitrine.ts`.
- **L'heure est l'heure légale française** (`decalageFuseauFrance`, heure d'été et d'hiver selon la règle européenne), quel que
  soit le lieu.
- **Le lieu** : la latitude et la longitude de la parcelle du projet (`model/lieu.ts::lieuDeParcelle`), posées à l'import du
  cadastre au centre de la parcelle ; à défaut, Le Vésinet (`LIEU_DEFAUT`).
- **La date et l'heure : trois soleils séparés**, aucun enregistré dans le projet :

  | Soleil | Où il vit | Par défaut | Ce qu'il éclaire |
  |---|---|---|---|
  | du plan | `etat.parasol` (`core/state.ts`) | le 21 juin de l'année du navigateur, 15 h | l'ombre des parasols sur le plan |
  | de la Vue 3D | `soleilVue3d` (`three/etat3d.ts`) | aujourd'hui (date UTC), midi | la lumière, les ombres, le ciel, le feuillage, l'horloge |
  | de la visionneuse GLB | `glb` (`three/etat3d.ts`) | aujourd'hui (date UTC), midi | la lumière du fichier relu |

  Les champs de date et d'heure sont des préférences d'affichage (`sale: false` : ni annulation, ni « projet modifié »).
  Seuls le lieu (sur la parcelle) et les réglages du parasol (hauteur, mât, terrasse liée) sont des données du projet.

### Ce qui s'en sert

| Domaine | Où | Ce qu'il en fait |
|---|---|---|
| Plan 2D | `render/parasolOverlay.ts`, `engine/parasol.ts` | l'ombre du parasol à l'instant choisi ; la carte des heures d'ombre sur sa terrasse ; « Placer au mieux » |
| Inspecteur | `ui/champs/objet.ts::sectionParasol` | date, heure, afficher l'ombre, carte, meilleure position |
| Vue 3D, lumière | `three/lumiere.ts::reglerSoleil` | la lampe du soleil, son intensité (éteinte sous 10°), sa couleur (orange au couchant), la lumière d'appoint |
| Vue 3D, ciel | `three/rendu.ts` | couleurs du ciel, brouillard, éclairage d'ambiance |
| Vue 3D, ombres | `three/scene.ts`, `three/qualite.ts`, `three/sceneObjets.ts` | une carte d'ombres (1 024 à 4 096 px selon la qualité, coupée en « Économe ») dans un cadre d'environ 1,5 fois la parcelle |
| Arbres | `model/especesArbre.ts::arbreNu`, `three/arbre3d.ts` | un arbre caduc est nu de novembre à mars, selon la date de la Vue 3D |
| Heure dorée | `three/presentation.ts` | 50 minutes avant le coucher |
| Démonstration | `app/boot/vitrine.ts`, `three/soleilVitrine.ts` | la course du soleil animée, le disque, le couchant |
| Placement d'un objet neuf | `model/placement.ts::facadeAuSoleil` | la façade de la maison tournée vers le sud (un sud fixe), une piscine à 4 m « hors de son ombre » (une constante) |
| Photos de façade, de toit | `facade/vision/sansOmbres.ts`, `model/couleurMur.ts`, `model/couleurToit.ts` | les ombres de la photo sont retirées ou écartées par la seule image, sans modèle du soleil |
| Toits | `model/couleurToit.ts`, `facade/regles/toits/profils.ts` | la latitude (règles du sud de la France), pas le soleil |
| Exports | SVG, PNG, PDF, résumé, DXF | **aucune ombre** ; le GLB emporte ce que la 3D montre |

### L'ombre

- **Sur le plan, seul le parasol fait de l'ombre.** Sa toile est un disque à sa hauteur, au-dessus d'un sol plat : l'ombre est
  une ellipse (`geometrieOmbre` : décalée de h·cot(hauteur) à l'opposé du soleil, étirée de 1/sin(hauteur)), sous 8° il n'y en a
  pas. Ni bâtiment, ni arbre, ni pergola, ni mur, ni clôture, ni voisin ne fait d'ombre sur le plan ; le relief et la hauteur de
  la terrasse sont ignorés.
- **La carte des heures d'ombre** couvre la seule terrasse du parasol, ombrée par ses seuls parasols, sur une fenêtre fixe : le
  15 de mai à septembre, de 12 h à 18 h, en 2026 — et non la date et l'heure choisies, qui sont pourtant à côté. La recherche de
  la meilleure position prend les mêmes échantillons.
- **En 3D, tout fait de l'ombre et tout la reçoit** (bâtiments, toits, arbres, pergolas, parasols, terrasses, clôtures,
  voisins ; le sol la reçoit seulement), sauf les rues, la piscine et la clôture grillagée du voisinage, quand les ombres sont
  allumées et dans le cadre de la carte d'ombres.
- Géométrie : `geometry/basic.ts::pointInPolygon`, `shoelace`, `centroid` ; l'appartenance à l'ellipse est écrite deux fois dans
  `engine/parasol.ts`.

### Les dépendances

```
parcelle (latitude, longitude ; nord réel, posée sur le terrain) ──▶ le lieu ──▶ tout calcul du soleil
etat.parasol (date, heure) ──▶ ombre du parasol sur le plan
fenêtre fixe (mai–septembre, 12–18 h, 2026) ──▶ carte des heures d'ombre, meilleure position du parasol
soleilVue3d (date, heure, intensité, appoint) ──▶ lumière, ciel, ombres 3D, feuillage des arbres, horloge, heure dorée
glb (date, heure) ──▶ lumière de la visionneuse
parasol (rayon, hauteur, mât, terrasse liée) + terrasse ──▶ ombre 2D, carte, meilleure position
maison + sud fixe ──▶ placement d'une terrasse, d'une pergola, d'un parasol, d'une piscine neuve
latitude ──▶ couverture et profils des toits (pas le soleil)
```

### Ce qu'il faut ranger

Par ordre d'effet sur ce que voit la personne :

1. **Trois soleils, trois défauts** : le même parasol a une ombre différente sur le plan et en 3D, et un projet rouvert ne
   retrouve pas son soleil ; la 3D change avec le jour où on l'ouvre (ombres et feuillage).
2. **La carte des heures d'ombre ignore la date et l'heure choisies** juste à côté d'elle, sans le dire.
3. **Trois façons de dire « aujourd'hui »** : la date UTC (entre minuit et 2 h, la 3D montre la veille), l'année locale, la date
   locale.
4. **Le fuseau est toujours celui de la France**, faux outre-mer et à l'étranger ; les jours de changement d'heure, l'écart est
   choisi pour la journée entière.
5. **Un plan dessiné à la main n'a pas de nord** : soleil, ombres et façade au soleil supposent le haut au nord, sans le dire.
6. **Pas d'ombre des bâtiments, des arbres et des pergolas sur le plan** ; la carte n'existe que sur une terrasse qui a un
   parasol.
7. **Le 2D et la 3D divergent** : le parasol est un disque plat sur un sol plat en 2D, un cône posé sur le relief en 3D.
8. **Le placement « au soleil » suit un sud fixe** (pas de latitude, pas d'obstacle) ; « hors de l'ombre » de la piscine est
   une distance fixe.
9. **Lire le lieu écrit dans la parcelle** (`lieuDeParcelle` complète les champs manquants à chaque rendu) : une écriture que
   le contrôleur des objets ne voit pas.
10. **La visionneuse GLB** éclaire à sa date mais garde le feuillage de la Vue 3D.
11. **Des seuils de crépuscule épars** : 8° (ombre du parasol), 10° et 3° (lampe), 20, 6, −2 et −8° (ciel), 12, 0, −6 et −0,5°
    (démonstration), 0° (lever, coucher) ; une astronomie simplifiée dont le commentaire dit « NOAA » à tort ; la démonstration
    recalcule le soleil toutes les 250 ms à côté du calcul commun, et lit ses dates à la main.
12. **Le cadre des ombres 3D** s'arrête à environ 1,5 fois la parcelle : l'ombre longue d'un voisin lointain, au soleil bas, est
   coupée.
13. Les aperçus (façade, arbre, catalogue des toits) ont une lumière fixe : voulu, à dire.

**Décidé avec le propriétaire le 28 octobre 2026 :**

- **Un seul soleil, enregistré avec le projet.** Le plan, la Vue 3D et la visionneuse lisent le même lieu, la même date et la
  même heure ; elles s'enregistrent dans le fichier et reviennent à la réouverture. Les changer reste un réglage d'affichage :
  ni annulation, ni « projet modifié », permis en lecture seule — comme « Relief » et « Courbes de niveau », qui marquent
  pourtant le projet à enregistrer, pour qu'on les retrouve. Un même parasol a la même ombre sur le plan et en 3D.
- **Pas d'ombre des bâtiments, des arbres ni des pergolas sur le plan** : la Vue 3D les montre ; le plan garde l'ombre des
  parasols.
- **Pas de nord réglable** pour un plan dessiné à la main : le haut du plan reste le nord.

Restent à décider, sans urgence : le fuseau (celui du lieu plutôt que la France), et ce que la carte des heures d'ombre doit
couvrir (sa fenêtre fixe, à dire à l'écran, ou la date choisie).

## Ce qui n'est pas un objet mais fait le plan

| Structure | Où elle vit | De quoi elle dépend |
|---|---|---|
| Cotes | `etat.measures`, enregistrées dans le fichier | tout objet, par clé et par numéro de côté ou de sommet |
| Sélection, terrasse courante | `selectedKey`, `terrasseSelectedKey` | la terrasse courante règle le parasol par défaut, le zéro du relief (`zRef`), le filaire, le placement des créations |
| Isolement | `etat.isolement` | les associés : une piscine et sa plage |
| Couches de la terrasse | `etat.calquesVisibles` | la terrasse sélectionnée |
| Emprise du calque | `model/calque.ts` | l'union des terrains et la visibilité du voisinage ; elle borne le sol 3D et la photo aérienne |
| Points de vue | les objets `camera` (une position, une visée, une hauteur d'œil) | — |
| Soleil | trois états non enregistrés : `etat.parasol` (plan), `soleilVue3d` (Vue 3D), `glb` (visionneuse) ; le lieu sur la parcelle | la parcelle (lieu, nord réel) ; section « Le soleil et l'ombre » |
| Relief | `parcelle.relief` | le zéro lu à la terrasse courante, l'étendue de tous les objets (`geo/relief.ts::etendueDuPlan`) |
| Photo aérienne | `ortho` | l'origine du cadastre, l'emprise du calque |
| Rues | `ruesVoisinage`, `voisinage3d.rues` | elles devinent le côté sur rue |
| PLU | `parcelle.plu` | lu par la piscine (régime), la clôture (hauteurs), le cerfa, le dossier piscine |
| Déclaration préalable | `parcelle.declaration` | la parcelle, les ouvrages déclarés |
| Audit de la parcelle | un fichier à part, `etat.audit` | bâtiment par clé, côté, cleabs |
| Moteur de règles | `regles/` : faits (par cleabs), réglages, décisions | il écrit les bâtiments, la clôture, les portails |
| Textures | Poly Haven (`TextureAppliquee`) | — |
| Essences d'arbres | la bibliothèque de l'admin (`admin/arbres`) | — |
| Photos locales | `io/photosLocales.ts`, sur l'appareil | la clé `photoLocale` d'une façade relevée |
| Schéma du fichier | `schemaVersion`, champs à plat (`CHAMPS_A_PLAT`) | — |

## L'indépendance de chaque composant

**La règle.** Un ouvrage ne lit d'un autre que ce que leur lien déclare (une clé, une géométrie publiée), jamais ses
modules internes ; une primitive de géométrie vit dans `geometry/`, pas dans le moteur d'un ouvrage ; une couche lit
l'ouvrage par son registre, pas en important le moteur d'un autre. Ce qui est partagé par plusieurs ouvrages a un nom à soi.

**Ce que l'audit a trouvé** (imports d'un ouvrage dans les internes d'un autre) :

| Couplage | Où | Ce qu'il faut |
|---|---|---|
| terrasse ↔ piscine, dans les deux sens | `engine/structure.ts` → `engine/piscine` ; `engine/piscine/calcul.ts` → `construction`, `hauteurs`, `portees`, `constantes` de la terrasse | les liens « plage » et « percer » nommés une fois (un module de liens), une seule définition de « percer » |
| pergola → terrasse | `engine/pergola.ts` → `debit`, `prix` de la terrasse ; → `model/creation.ts` pour `NatureAbri` | le débit et les prix du bois, partagés, sous leur propre nom ; `NatureAbri` dans `model/ouvrages/abri.ts` |
| clôture → façades de bâtiment | `render/cloture.ts`, `three/cloture3d.ts`, `ui/champs/cloture.ts`, `interaction/glisserAcces.ts`, `pointeur.ts` → `facade/geometrie.ts` ; `three/cloture3d.ts` → `facade/toits/toit.ts::trianguler` | « un côté vu de dehors » et la triangulation sont de la géométrie : `geometry/` |
| la géométrie dans le moteur de la terrasse | `safeOffset` (`engine/structure.ts`) lu par la clôture 3D et le relevé 3D | `geometry/` |
| le plan et les exports → moteur de la terrasse | `render/pipeline.ts`, `piscineOverlay.ts`, `terrasseCouches.ts`, `export/*`, `zones/Explorateur.tsx`, `FeuilleSelection.tsx` → `engine/structure.ts` (`trousDeTerrasse`, `surfaceNetteTerrasse`, `formeDeTerrasse`) | ce que la terrasse publie (sa forme trouée, sa surface nette) passe par son ouvrage |
| la 3D → moteur de la piscine | `three/gazon.ts`, `three/presentation.ts` → `engine/piscine` | l'emprise publiée par l'ouvrage piscine |
| un module pour trois ouvrages | `three/sceneObjets.ts` : terrasse, parasol, toits de bâtiment | un module 3D par ouvrage (`three/ouvrages/`) |
| la section commune de l'inspecteur | `ui/champs/objet.ts` → moteur du parasol, de la terrasse | chaque ouvrage apporte sa section |
| les gestes → moteur de la piscine | `app/assemblage/gestes.ts` → `constructionDeLaPlage`, `contourTerrasseAutour` | la création d'une plage passe par l'ouvrage piscine |
| géo et moteur de règles → clôture | `geo/coteRue.ts`, `geo/cadastreObjets.ts`, `regles/decisions.ts` → `model/cloture.ts` | une décision passe par l'ouvrage qu'elle touche |
| une écriture pendant le rendu | `contraindreParasols` déplaçait les parasols sans le dire | corrigé à l'étape 6.1 : il rend les parasols déplacés, le dessin les touche |
| la note de calcul | `engine/noteCalcul.ts` est celle de l'**abri** (Eurocodes), pas de la terrasse | rangée sous l'abri |

**Comment on le tiendra.** Comme les couches : un test d'architecture interdit à un module d'ouvrage d'importer les modules
internes d'un autre, avec un cliquet sur les couplages d'aujourd'hui, qui ne peuvent que disparaître (étape 6.6).

## L'inspecteur de chaque ouvrage : ce qui sert la conception

*Inventaire tiré du code le 27 octobre 2026 (les sections et les champs que l'inspecteur montre pour chaque ouvrage de la
démonstration). Décision du propriétaire : l'inspecteur ne garde que ce qui sert à concevoir l'ouvrage sélectionné.*

### Aujourd'hui

| Ouvrage | Sections | Champs | Ce qui charge |
|---|---|---|---|
| Parcelle | 11 | 90 | déclaration préalable (21), clôture (17), relief (11), voisinage 3D (11) |
| Terrasse | 13 | 79 | sept étapes de construction, côtés, coins, alignement |
| Piscine | 12 | 75 | métrage et chiffrage (16 lignes calculées), prix (15) |
| Bâtiment | 7 | 67 | façades et toit (19), côtés (14), coins (14), fenêtres (6) |
| Carport, pergola | 9 | 63, 62 | métrage (7), prix (5), note de calcul (11) |
| Annexe | 7 | 40 | comme le bâtiment |
| Chemin | 4 | 37 | un champ par point et par segment (21) |
| Dalle, massif, autre, trémie | 5 à 6 | 23 | côtés, coins, alignement |
| Parasol | 3 | 21 | ombre (date, heure, carte), position du mât |
| Arbre, équipement, terrain voisin, point de vue | 2 à 6 | 7 à 14 | — |

Tous portent les mêmes sections communes : Objet (nom, fonction, priorité d'affichage, matière, élévation, surface, verrou),
Apparence (couleur, deux textures), Côtés, Coins, Alignement par rotation.

### Les règles du tri

1. **L'inspecteur règle, il n'affiche pas de résultat** (règle de la zone Z5, `.claude/skills/design-ui`). Le métrage, le
   chiffrage, les prix, le volume d'eau, les distances aux limites, la taxe d'aménagement vont au tiroir des résultats (Z6), dans
   les onglets de l'ouvrage, comme ceux de la terrasse.
2. **Un geste n'existe qu'à un endroit.** L'alignement par rotation est un outil de la palette (« Aligner ») ; le relief et les
   courbes de niveau sont des bascules du menu Affichage ; la priorité d'affichage est le geste « Reculer ». Leur double sort de
   l'inspecteur.
3. **Ce qui concerne le projet, pas l'objet, sort de l'objet.** La déclaration préalable (21 champs d'identité et d'adresse) est
   un dossier : elle s'ouvre en dialogue depuis le menu Exporter, là où le dossier se génère. Le voisinage 3D (murs, toits,
   vitres, clôtures des voisins, noms des rues) est un réglage de la Vue 3D : il rejoint la feuille des réglages 3D.
4. **Ce qui sert rarement se replie.** Les listes de côtés et de coins (une ligne par sommet : 14 + 14 pour la maison) restent,
   repliées ; elles disparaissent d'un objet importé et verrouillé (bâtiment de l'IGN, parcelle voisine), qu'on ne redessine
   pas. Les textures, la note de calcul d'un abri, les paramètres de calcul de la terrasse : repliés.
5. **Un champ que rien ne lit disparaît.** « Matière » : un texte libre que seul l'attribut `data-matiere` de l'export SVG
   recopie.
6. **Rien ne se perd.** Retirer un champ de l'inspecteur ne retire aucune donnée : le fichier garde la valeur, l'export aussi ;
   aucun nombre ne bouge.

### Décidé, ouvrage par ouvrage (27 octobre 2026)

Le propriétaire a tranché chaque proposition, une par une. Rien de ce qui est retiré ne se perd : le fichier garde la valeur.
Appliqué le même jour (`tests/unit/ui/inventaireInspecteur.test.ts` fige l'inventaire) ; l'outil « Aligner » de la palette a
repris, dans son bandeau, la distance au trait que portait la section retirée.

- **Tous les objets** : retirer « Matière » (rien ne la lit), « Priorité d'affichage » (le geste « Reculer » la remplace) et
  « Alignement par rotation » (l'outil « Aligner » de la palette la remplace) ; replier les textures, la liste des côtés et
  celle des coins.
- **Parcelle** : garder ouverts le lieu, le cadastre, la clôture et les portails. La déclaration préalable part en dialogue du
  menu Exporter ; le voisinage 3D rejoint la feuille des réglages 3D ; « Relief » et « Courbes de niveau » ne restent que dans
  le menu Affichage ; les réglages techniques du relief (grille, maillage, points, zéro) se replient, « Actualiser » reste à
  portée ; la clôture côté par côté se replie, le réglage général reste ouvert.
- **Terrasse** : garder les sept étapes (une ouverte à la fois) ; replier les paramètres de calcul ; l'optimisation du débit
  part au tiroir des résultats ; la lame de rive côté par côté se replie.
- **Piscine** : garder les cinq étapes ; le métrage, le chiffrage et les prix partent dans un onglet « Piscine » du tiroir
  des résultats, avec le volume d'eau, les distances aux limites et la taxe d'aménagement (un rappel court reste sous l'étape).
- **Pergola, carport** : garder ouverts matériau, toit, hauteur, côté de référence, adossé, débord, poteaux, poutres ; replier
  contrefiches, chevrons, couleurs, longueurs achetables, et la note de calcul (son PDF reste à portée) ; le métrage et les
  prix partent dans un onglet du tiroir des résultats.
- **Bâtiment, annexe** : garder « Façades et toit » ; replier « Fenêtres (3D) » ; un bâtiment importé et verrouillé ne montre
  plus ses côtés ni ses coins (dessiné à la main, il les garde, repliés).
- **Parasol** : garder ouverts la terrasse rattachée, le mât, « Afficher l'ombre » et « Meilleure position » ; replier la date,
  l'heure et la carte des heures d'ombre.
- **Chemin** : garder ouverts longueur, largeur, courbe ; replier les points et segments.
- **Objets simples** (dalle, massif, mobilier, équipement, trémie, arbre, point de vue, autre) : tels que les décisions
  communes les laissent, sept à dix réglages.

## Les étapes

| # | Étape | Critère de fin | État (27 octobre 2026) |
|---|---|---|---|
| 6.1 | Le contrôleur des objets, la version par objet aux huit points de passage, le dessin du plan qui saute un objet inchangé, le garde-fou en développement | au banc, à 600 objets au téléphone, le dessin du plan sous 10 ms quand rien ne change ; fumée complète sans `[cle de version]` | **fait** : dessin du plan au téléphone, à 600 objets, 77 → 20 à 26 ms (au-dessus des 10 ms visés : photo aérienne, parasols, grille) |
| 6.2 | Le registre des ouvrages du modèle (`model/ouvrages/`) : profils, défauts de création, associés, ouvertures ; les comparaisons de `model/` et d'`engine/` passent par lui | empreintes inchangées ; plus aucun `fonction === '…'` dans `model/` et `engine/` hors du registre (cliquet du test d'architecture) | **fait** ; restent à déclarer dans le registre : les associés, ce qui perce, ce qui s'isole |
| 6.3 | Les règles de construction par ouvrage (`engine/ouvrages/`) : terrasse, abri, piscine, parasol, surfaces simples ; le chiffrage et les dossiers lisent l'ouvrage. La courbe et le ruban du chemin deviennent des primitives de `geometry/`, lues par le plan, la 3D et les exports. Chaque ouvrage déclare ses références par côté, par sommet et en coordonnées absolues ; les gestes (sommet ajouté ou retiré, déplacement, rotation, actualisation IGN, côté raccourci) et la suppression d'un objet les font suivre par lui | empreintes inchangées ; un test par référence du tableau « Les références par numéro… » : elle reste sur son côté, son sommet ou sa position | **en partie** : la courbe et le ruban dans `geometry/` ; le toit suit son bâtiment (déplacement, rotation) ; restent les références par côté et par sommet, la suppression sans nettoyage, l'actualisation IGN |
| 6.4 | Le dessin, la 3D, les exports et l'inspecteur par ouvrage : leurs comparaisons passent par le registre de leur couche. L'inspecteur de chaque ouvrage ne garde que ce qui sert sa conception (section « L'inspecteur de chaque ouvrage ») | plus aucun `fonction === '…'` hors des registres (cliquet) ; inventaire de l'inspecteur au tableau décidé (test) ; fumée complète | **en partie** : l'inspecteur allégé, ouvrage par ouvrage (décisions ci-dessus) ; restent les comparaisons du dessin, de la 3D et des exports |
| 6.5 | Les écritures des commandes et des gestes nomment leur objet (`controleur.modifier(obj, …)`) ; le chiffrage et les cotes se gardent d'un rendu à l'autre sur la version de ce qu'ils lisent | au banc, à 600 objets au téléphone, un rendu sans changement sous 33 ms (l'étape 2.2) | **en partie** : le chiffrage, les cotes et les doublons se gardent sur la version ; rendu complet au téléphone 73 à 97 ms |
| 6.6 | L'indépendance des ouvrages : les couplages du tableau « L'indépendance de chaque composant » levés ; un test d'architecture interdit à un module d'ouvrage d'importer les internes d'un autre | le cliquet des couplages à zéro | à faire |
| 6.7 | Le soleil du projet, un seul : le lieu, la date et l'heure, les seuils, en un composant ; le plan, la 3D et la visionneuse le lisent ; la date et l'heure s'enregistrent avec le projet ; la carte des heures d'ombre dit sa fenêtre | un parasol a la même ombre sur le plan et en 3D ; un projet rouvert retrouve son soleil ; aucune empreinte ne bouge | décidé le 28 octobre 2026, à faire |

## Journal des décisions

| Date | Décision |
|---|---|
| 27 octobre 2026 | Un domaine par ouvrage, un contrôleur qui sait ce qui change (phase 6) : « une terrasse n'a pas les mêmes règles de construction qu'un chemin », « si je fais une pergola, je ne fais pas une terrasse ». |
| 27 octobre 2026 | Chemins : une largeur par défaut de 1 m partout, une surface comptée sur la courbe dessinée (version majeure). |
| 27 octobre 2026 | L'inspecteur ne garde que ce qui sert la conception, ouvrage par ouvrage (tableau « Décidé ») ; la déclaration préalable en dialogue du menu Exporter. |
| 27 octobre 2026 | L'outil « Aligner » garde la distance au trait (le champ de son bandeau). |
| 27 octobre 2026 | Le relief, la photo aérienne, les rues et le PLU sont sur le terrain : ils ne tournent pas. |
| 27 octobre 2026 | Le soleil et l'ombre décrits comme un composant (section « Le soleil et l'ombre »). |
| 27 octobre 2026 | Ce qui vient du cadastre ou de l'IGN ne se déplace ni ne tourne ; il se retouche avec un avertissement, et l'actualisation IGN demande, pour chaque objet retouché, de garder la version de la personne ou de reprendre celle de l'IGN, sans créer un nouvel objet. Pas de vue tournée. |
| 28 octobre 2026 | Un seul soleil pour le plan, la 3D et la visionneuse, enregistré avec le projet (sans « projet modifié ») ; pas d'ombre des bâtiments, des arbres ni des pergolas sur le plan ; pas de nord réglable pour un plan dessiné. Étape 6.7. |
