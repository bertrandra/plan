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

### Arbre par ouvrage

**Terrasse** — construit, `polygon`
- modèle : `pts`, `construction` ; fabrique `creation.ts::nouvelleTerrasse` ; défauts `engine/construction.ts::ensureConstruction`
- règles : `engine/structure.ts::computeStructure` (cadre, solives, appuis `buildVisGrid`) → `layers.ts::computeTerrasseLayers`
  (lames `lames.ts::generateParallelLines`, rive) → `bom.ts::computeBOM`, `prix.ts`, `debit.ts`, `portees.ts` ; note
  `noteCalcul.ts`, implantation, chantier ; hauteurs `hauteurs.ts` sur le sol `sol.ts::solSousEmprise` → `model/relief.ts`
- plan : couches `render/terrasseCouches.ts` ; trous par gabarit `render/objects.ts::percerContour`
- 3D : `three/sceneTerrasse.ts::construireStructureTerrasse`, `assise3d.ts`
- inspecteur : `ui/champs/construction.ts`, `noteCalcul.ts` ; exports : dossier PDF, note de calcul, cerfa, DP, DXF
- géométrie : `polygon.ts::polygonOffset`, `basic.ts::signedArea`, `shoelace`, `centroid`, `pointInPolygon`, `clipLineToPolygon`,
  `clipPolygonByConvex`, `difference.ts::differencePolygones`, `ringSegments`, `offsetZone`
- dépend de : **piscine** et **trémie** qui la percent (`objetsQuiPercent` → `contourOuverture`), **équipement** qui la renforce
  (`findSpaZones` → `offsetZone`), **terrain** (relief : hauteur des appuis), **parasol** qui lui est lié

**Pergola, carport** — construit, `polygon` ; mêmes règles, défauts différents (`ABRIS` : 4 × 3 m, 3 × 5 m)
- modèle : `pts`, `pergola` (toit, matériau, adossée, débord, hauteur, sections, entraxe) ; fabrique `creation.ts::nouvelAbri`
- règles : `engine/pergola.ts::calculerPergola` (poteaux par `polygonOffset`, poutres par `clipLineToPolygon`, angles par
  `lineLineIntersect`), `chiffrerPergola` ; passage du carport `PASSAGE_CARPORT_M` ; neige et vent `noteCalcul.ts::hypothesesDe`
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
- règles : aucune — pas de structure ; sa surface est longueur × largeur
- **la courbe** : avec `curve` et trois points au moins, le tracé passe par chaque point en Catmull-Rom uniforme, converti en
  Bézier cubiques (points de contrôle `p1 + (p2 − p0)/6` et `p2 − (p3 − p1)/6`, extrémités répétées) ; sinon une ligne brisée
- plan : un `<path>` sans remplissage, `d` par `geometry/path.ts::pathD(scène, pts, courbe)`, épaisseur de trait = largeur ×
  échelle : en 2D la largeur n'est qu'un trait, aucun contour décalé n'est calculé
- 3D : la même courbe échantillonnée (`three/primitives.ts::courbePolyligne`, 12 points par segment), élargie en ruban
  (`ribbonChemin` : chaque côté décalé d'une demi-largeur, angles en onglet par `geometry/segments.ts::lineLineIntersect`, en
  biseau au-delà de 4 demi-largeurs), posé ou drapé sur le relief (`addRubanDrape`) ; le gazon s'arrête au même ruban
- inspecteur : longueur totale, largeur (0,05 m au moins), « Courbe (passe par les points) », texture commune à tous les chemins
- exports : SVG et PDF du plan redessinent la courbe ; le DXF écrit la ligne brute (ni courbe, ni largeur) ; la surface (dossier,
  résumé, PDF) se compte sur les segments droits
- géométrie : `path.ts::pathD`, `segments.ts::lineLineIntersect`, `basic.ts::dist`, `centroid`, `anneau.ts::sommetDe`
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

### Les dépendances entre ouvrages

```
terrain ──relief──▶ terrasse, pergola, carport, piscine, chemin (hauteurs, drapé)
terrain ──limites─▶ piscine (distances, régime d'autorisation)
terrain ──côtés (par numéro)──▶ clôture, portails, portillons
piscine ──plage (terrasseKey)──▶ terrasse
piscine, trémie ──percent──▶ terrasse
équipement ──renforce──▶ terrasse
parasol ──terrasseLieeKey──▶ terrasse
bâtiment ◀── BD TOPO, LiDAR (toit, corps) ; pergola et carport ne dépendent d'aucun autre ouvrage
```

Le contrôleur (étape 6.1) suit ces flèches : toucher une piscine, une trémie ou un équipement doit faire refaire la terrasse
qu'ils percent ou renforcent ; toucher le terrain (relief), tout ce qui pose sur le sol. Aujourd'hui une terrasse suit la version
de l'ensemble, le repli le plus simple ; l'étape 6.5 remplace ce repli par ces flèches.

### Ce que le relevé a trouvé à ranger

- **La courbe est écrite quatre fois** : `geometry/path.ts::pathD`, `three/primitives.ts::courbePolyligne`,
  `export/svgPlan.ts::exPathD`, `export/pdfPlan.ts::pdfPathD`. Une seule primitive dans `geometry/` (`courbe.ts` : les points de
  contrôle, l'échantillonnage) ; les quatre la lisent. Même chose pour le ruban (`ribbonChemin`, dans `three/`) : c'est de la
  géométrie, pas de la 3D. Étape 6.3, à résultat identique (les empreintes de l'export le vérifient).
- **La largeur par défaut d'un chemin n'est pas la même partout** : 0,5 m dans le dossier PDF et le dossier piscine, 1 m dans
  l'inspecteur, le résumé et le PDF du plan. Un chemin sans largeur (un ancien fichier, un import SVG) n'a donc pas la même
  surface selon le document. L'unifier change un nombre exporté : **c'est une version majeure** (`MD/RELEASE.md`), à décider,
  pas une correction discrète.
- **La surface d'un chemin courbe** se compte sur ses segments droits, pas sur la courbe dessinée : même règle, même décision.
- **Les données rangées par numéro de côté ne suivent pas un sommet ajouté ou retiré.** `model/sommets.ts` tient en phase
  quatre tableaux (points, noms des coins, noms des côtés, coins figés) et rien d'autre. Or quatre ouvrages rangent des données
  par côté : le **terrain** (la clôture réglée côté par côté, les **portails**), la **terrasse** (`construction.cotesSansRive`),
  l'**abri** (`pergola.coteMur`, le côté adossé), le **bâtiment** (`batiment.facades[].cote`, `fenetres3d[].cote`). Un sommet
  ajouté sur le côté 1 d'une parcelle met le portail du côté 3 sur un autre côté. C'est le rôle même du contrôleur par
  ouvrage : chaque ouvrage déclare ses données par côté, et la chirurgie des sommets les renumérote par lui (étape 6.3,
  `Corrigé` : aucun nombre d'un fichier enregistré ne bouge, seul le geste d'édition est réparé).
- **Le bâtiment et l'annexe** se comparent encore à la main dans les exports (`'batiment' || 'annexe'`) : c'est le bâti, une
  famille, que le registre dit déjà (étape 6.4).

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

### Proposition, ouvrage par ouvrage

| Ouvrage | Garder ouvert | Replier | Déplacer | Retirer |
|---|---|---|---|---|
| commun | nom, fonction, surface (lue), verrou ; couleur | textures ; côtés, coins | — | matière ; priorité (→ « Reculer ») ; alignement (→ palette) |
| terrasse | les sept étapes, une ouverte à la fois | paramètres de calcul | optimisation → résultats | — |
| pergola, carport | matériau, toit, hauteur, côté de référence, adossé, débord, poteaux, poutres | contrefiches, chevrons, couleurs, longueurs achetables ; note de calcul | métrage, prix → résultats | — |
| piscine | 1 à 5 (implantation, profondeurs, abords, équipements, sécurité) | — | volume d'eau, distances, taxe, métrage, prix → résultats | — |
| parasol | terrasse rattachée, hauteur, mât (périmètre, déporté, orientation), afficher l'ombre | date, heure, carte de chaleur | — | — |
| bâtiment, annexe | façades et toit | fenêtres (3D) | — | côtés, coins s'il est importé et verrouillé |
| chemin | longueur (lue), largeur, courbe | points et segments | — | — |
| parcelle | lieu, cadastre ; clôture et portails | relief (source, actualiser) | déclaration préalable → menu Exporter ; voisinage 3D → réglages 3D ; relief et courbes (affichage) → menu Affichage | — |
| dalle, massif, mobilier, équipement, autre | élévation, rayon ou rectangle | — | — | — |
| trémie | terrasse percée | — | — | — |
| arbre | essence, diamètre, teinte | — | — | — |
| point de vue | altitude, direction, aller | — | — | — |

Effet attendu : la parcelle passe de 90 champs à une trentaine, la piscine de 75 à une quarantaine, l'abri d'une soixantaine à
une trentaine ouverts ; l'objet simple garde sept à dix champs.

## Les étapes

| # | Étape | Critère de fin |
|---|---|---|
| 6.1 | Le contrôleur des objets, la version par objet aux huit points de passage, le dessin du plan qui saute un objet inchangé, le garde-fou en développement | au banc, à 600 objets au téléphone, le dessin du plan sous 10 ms quand rien ne change ; fumée complète sans `[cle de version]` |
| 6.2 | Le registre des ouvrages du modèle (`model/ouvrages/`) : profils, défauts de création, associés, ouvertures ; les comparaisons de `model/` et d'`engine/` passent par lui | empreintes inchangées ; plus aucun `fonction === '…'` dans `model/` et `engine/` hors du registre (cliquet du test d'architecture) |
| 6.3 | Les règles de construction par ouvrage (`engine/ouvrages/`) : terrasse, abri, piscine, parasol, surfaces simples ; le chiffrage et les dossiers lisent l'ouvrage. La courbe et le ruban du chemin deviennent des primitives de `geometry/`, lues par le plan, la 3D et les exports. Chaque ouvrage déclare ses données par côté, que la chirurgie des sommets renumérote | empreintes inchangées ; un sommet ajouté ou retiré garde chaque portail, réglage de clôture, côté sans rive, mur adossé et façade sur son côté |
| 6.4 | Le dessin, la 3D, les exports et l'inspecteur par ouvrage : leurs comparaisons passent par le registre de leur couche. L'inspecteur de chaque ouvrage ne garde que ce qui sert sa conception (section « L'inspecteur de chaque ouvrage ») | plus aucun `fonction === '…'` hors des registres (cliquet) ; inventaire de l'inspecteur au tableau décidé (test) ; fumée complète |
| 6.5 | Les écritures des commandes et des gestes nomment leur objet (`controleur.modifier(obj, …)`) ; le chiffrage et les cotes se gardent d'un rendu à l'autre sur la version de ce qu'ils lisent | au banc, à 600 objets au téléphone, un rendu sans changement sous 33 ms (l'étape 2.2) |
