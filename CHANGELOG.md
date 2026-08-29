# Journal des modifications

Format [Keep a Changelog 1.1](https://keepachangelog.com/fr/1.1.0/), versionnement selon
[`MD/RELEASE.md`](MD/RELEASE.md). Les versions les plus récentes en premier.

## [1.0.1-alpha.46] — 2026-08-29

Les trois points laissés en suspens sont soldés.

### Supprimé

- `muter()`, dans l'historique : personne ne l'appelait. Du code mort qui se présente comme le
  chemin sûr est pire que pas de chemin du tout.

### Interne

- L'horloge des clés d'objets devient injectable (`ContexteCreation.horloge`, `Date.now` par
  défaut) — la dernière source de non-déterminisme que `EMPREINTES.md` signalait depuis la phase 0.
  Un scénario qui crée des objets peut désormais être comparé à lui-même.
- `dupliquer()` refaisait le calcul de clé à la main au lieu d'appeler `cle()` : une seule écriture
  de la règle désormais.
- **5 tests**, 490 au total.

### Vérifié plutôt que corrigé

- `altitude: 0` retombe sur 1,60 m. Ce n'est pas une valeur perdue : le panneau d'attributs plafonne
  l'altitude par le bas à 0,10 m, donc `0` ne peut venir que d'un fichier écrit à la main.

## [1.0.1-alpha.45] — 2026-08-29

Les trois mécanismes enchevêtrés du pilotage des vues sont démêlés. Aucun comportement ne change.

### Interne

- `vueCourante` devient la seule vérité sur ce qui est affiché, `appliquerVue()` le seul endroit qui
  touche aux boutons et aux zones, et `etat.appMode` en est dérivé. Plus aucune fonction ne corrige
  après coup l'apparence laissée par une autre.
- La visionneuse GLB devient la quatrième vue au lieu d'un panneau qui pilotait lui-même les boutons.
- La place d'origine du plan est marquée par un nœud-ancre, au lieu d'une référence de frère capturée
  au premier déplacement.
- Vérifié contre le témoin sur dix états, dont le `className` complet des boutons et le rang exact du
  plan parmi ses frères. `legacy.ts` : 1 789 → 1 769 lignes.

## [1.0.1-alpha.44] — 2026-08-29

Le pilotage des modes sort de `legacy.ts` et ouvre le dossier `app/`.

### Interne

- `app/modes.ts` : modes Plan et Terrasse, sous-onglets, déménagement du plan entre ses trois
  emplacements. La « Vue 3D » n'est pas un troisième mode mais le mode Terrasse sur son sous-onglet
  `3d` — ce qui explique les corrections d'apparence à la main après chaque bascule.
- L'interrogation du PLU rejoint `ui/projectBar.ts`, à côté du panneau qu'elle remplit.
- Vérifié contre le témoin sur neuf états de l'interface, dont le parent réel du plan dans le DOM.
- `legacy.ts` : 1 947 → 1 789 lignes, soit **87 %** du fichier d'origine sorti, en 93 modules.

## [1.0.1-alpha.43] — 2026-08-29

### Interne

- La visionneuse GLB rejoint `three/glbViewer.ts`, le sélecteur de terrasse `ui/terrassePanels.ts`.
  Sans aucune terrasse, la Vue 3D reste accessible ; les autres sous-onglets restent derrière
  l'accueil. `legacy.ts` : 2 023 → 1 947 lignes, soit 86 % du fichier d'origine sorti.

## [1.0.1-alpha.42] — 2026-08-29

### Interne

- `render/terrasseCouches.ts` : chaque couche a sa case, et non un onglet exclusif — d'où les traits
  qui maigrissent dès qu'il y en a plus d'une.
- `ui/cloture.ts` : deux passes pour trouver la parcelle, parce que les parcelles voisines importées
  sont elles aussi `fonction === 'terrain'`.

## [1.0.1-alpha.41] — 2026-08-29

### Interne

- `three/soleilVue3d.ts` et `three/chargeurs.ts`. L'état du soleil rejoint `etat3d.ts`, dans les
  mêmes champs que celui de la visionneuse.

### Corrigé avant publication

- Un même drapeau allait servir à l'exporteur glTF et au lecteur, qui sont deux scripts distincts.

## [1.0.1-alpha.40] — 2026-08-29

### Interne

- `three/navigation.ts` : zoom, mode du glisser, hauteur des yeux, points de vue, plein page. La
  conversion d'un point de vue vers le repère de la scène était écrite deux fois ; **10 tests**.

### Corrigé avant publication

- Le fichier de tests d'`alpha.39` ne passait pas `tsc` : le typecheck avait été lancé avant son
  écriture, pas après.

## [1.0.1-alpha.39] — 2026-08-29

La normalisation, la création d'objets et les contraintes de parasol sortent de `legacy.ts`.

### Interne

- `model/normalisation.ts`, `model/creation.ts` (fabriques pures séparées de la pose dans le plan),
  et la contrainte « pied en bordure » dans `engine/parasol.ts` — c'est le **pied** qu'on projette
  sur le pourtour, pas le centre de la toile.
- **44 tests**, 476 au total. `legacy.ts` : 2 584 → 2 354 lignes.

## [1.0.1-alpha.38] — 2026-08-29

La Vue 3D et la visionneuse GLB partagent enfin un seul soleil.

### Interne

- `three/lumiere.ts` : `reglerSoleil()` porte le calcul qui était écrit deux fois — trente lignes de
  trigonométrie et trois règles d'éclairage. La seule différence réelle entre les deux vues devient
  un paramètre : la Vue 3D est centrée sur l'origine, la visionneuse sur son modèle.
- Vérifié contre le témoin figé en interceptant ce qui est réellement passé à Three (position du
  soleil, facteur jour) : neuf réglages, deux vues, identiques au dernier chiffre.
- `legacy.ts` : 2 606 → 2 584 lignes.

## [1.0.1-alpha.37] — 2026-08-29

Le lieu et le curseur « semaine » sortent, avec leurs doublons.

### Interne

- `util/semaine.ts` : le décalage d'un cran était dupliqué dans les deux vues 3D. Il est **relatif**
  à la date courante (sept jours par cran) et ne suit **pas** la numérotation ISO.
- `model/lieu.ts` : le lieu est rattaché à la parcelle, donc enregistré avec le projet. Une longitude
  de 0 est une position, pas une absence.
- **20 tests**, 432 au total. `legacy.ts` : 2 634 → 2 606 lignes.

## [1.0.1-alpha.36] — 2026-08-29

Les hauteurs sortent de `legacy.ts`, en une seule définition.

### Interne

- `engine/hauteurs.ts` : hauteur d'appui, hauteur finie, élévation — lues par le plan de coupe, la
  3D, le dossier PDF et le chiffrage. Une vis de fondation est enterrée, seul son dépassement de tête
  soulève ; un plot est posé, toute sa hauteur compte.
- **18 tests**, 412 au total. Hauteur finie identique au témoin : 27 cm sur les deux terrasses de la
  démonstration. `legacy.ts` : 2 661 → 2 634 lignes.

## [1.0.1-alpha.35] — 2026-08-29

Le client `api.php` sort de `legacy.ts`.

### Interne

- `io/api.ts` : la règle qui portait tout est maintenant explicite — on ne retombe sur le jeu de
  démonstration que si **ce navigateur n'a jamais ouvert aucun projet**. Dès qu'un identifiant est
  connu, un échec est remonté : substituer la démonstration faisait croire qu'un vrai projet avait
  été perdu.
- **14 tests** jsdom, 394 au total. `legacy.ts` : 2 727 → 2 661 lignes.

## [1.0.1-alpha.34] — 2026-08-29

L'historique sort **tel quel**, pour être réécrit ensuite.

### Interne

- `core/historique.ts` : le code n'a pas bougé d'une ligne ; l'en-tête dit en sept points ce qu'une
  réécriture doit savoir. **18 tests de caractérisation**, dont un qui vérifie une *absence* : il
  n'existe pas de rétablissement, et ce test doit échouer le jour où il arrivera.
- `legacy.ts` : 2 914 → 2 727 lignes.

## [1.0.1-alpha.33] — 2026-08-29

### Interne

- `render/pipeline.ts` : l'orchestration du dessin sort de `legacy.ts`.

## [1.0.1-alpha.32] — 2026-08-29

### Interne

- Le débit de bois rejoint les autres tables dans `ui/tables.ts`.

## [1.0.1-alpha.31] — 2026-08-29

La validation d'un fichier de projet sort de `legacy.ts`, et gagne les tests qu'elle n'avait pas.

### Interne

- `io/validation.ts` : les trois refus (schéma trop récent, coordonnées au-delà de 100 km, aucun
  objet exploitable) sont documentés pour ce qu'ils protègent. **19 tests**, 362 au total.
- `legacy.ts` : 3 119 → 3 086 lignes.

## [1.0.1-alpha.30] — 2026-08-29

Les tables du dossier et du chiffrage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/tables.ts` : liste des terrasses du dossier, métré, débit de bois. Aucune ne calcule.
- `legacy.ts` : 3 253 → 3 119 lignes.

### Corrigé avant publication

- La table du métré est restée vide un moment : une fabrique de contexte n'avait pas été insérée là
  où je croyais. Le contrôle de santé ne l'a pas vu — il a fallu comparer au témoin (7 et 18 lignes
  contre 0 et 0).

## [1.0.1-alpha.29] — 2026-08-29

Le chargement d'un projet importé sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/projet.ts`. La séquence compte : remplacer les données, reconstruire les vues, **puis**
  restaurer les réglages rangés sur la parcelle.
- `legacy.ts` : 3 345 → 3 253 lignes.

## [1.0.1-alpha.28] — 2026-08-29

Les événements de pointeur sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/pointeur.ts` (289 lignes) : sélection, glisser, double-clic, molette, pincement,
  déplacement à trois doigts. Deux différences doigt/souris y sont documentées.
- Vérifié contre le témoin figé, à froid : sommet tiré de (+12,7095 ; −8,1172) m, molette,
  insertion de sommet.
- `legacy.ts` : 3 599 → 3 345 lignes.

## [1.0.1-alpha.27] — 2026-08-29

Le fond orthophoto sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `render/ortho.ts` : tuiles WMTS de l'IGN, cache, calage sur le repère du plan, réglages. Vérifié
  sur des tuiles réelles — 4 tuiles, opacité du terrain 1 → 0,15 puis retour.
- `legacy.ts` : 3 816 → 3 599 lignes.

## [1.0.1-alpha.26] — 2026-08-29

L'outil de cotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/outilMesure.ts` : le brouillon d'une cote en cours de pose, partagé par le
  `pointerdown` du plan, le panneau et le rendu. Il ne vit pas dans `etat` : rien ne s'enregistre
  tant que la cote n'est pas validée.
- `ui/mesurePanel.ts` : son affichage.
- `legacy.ts` : 3 931 → 3 816 lignes.

## [1.0.1-alpha.25] — 2026-08-29

Le sélecteur d'objets et la table d'affichage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/selector.ts`. Le filtre par famille descend avec le sélecteur : ce n'est ni une donnée du plan
  ni une préférence enregistrée.
- `legacy.ts` : 4 098 → 3 931 lignes.

## [1.0.1-alpha.24] — 2026-08-29

La visionneuse GLB et le chargement de Three.js sortent de `legacy.ts`.

### Corrigé avant publication

- `SOLEIL_ELEV_PLANCHER`, partagée entre la Vue 3D et la visionneuse, était partie avec cette
  dernière : la construction de la scène 3D échouait **à mi-course** — 46 nœuds au lieu de 203, sans
  erreur visible. Elle a désormais son module, `three/lumiere.ts`.
- Un renommage global avait atteint un identifiant d'élément dans une chaîne
  (`getElementById('glbViewerFilaire')`), ce qui cassait le boot.

### Interne

- `three/glbViewer.ts`, `three/lumiere.ts`, et l'état de la visionneuse dans `three/etat3d.ts`.
- `legacy.ts` : 4 365 → 4 098 lignes.

## [1.0.1-alpha.23] — 2026-08-29

La sérialisation et l'import SVG sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/serialisation.ts` : `serializeObjects` est une **liste blanche** — un champ qui n'y est pas
  nommé disparaît au premier enregistrement.
- `io/importSvg.ts` : le pendant exact de `export/svgPlan.ts`.
- `legacy.ts` : 4 576 → 4 365 lignes.

## [1.0.1-alpha.22] — 2026-08-29

La barre de projet, l'actualisation cadastrale et le panneau PLU sortent de `legacy.ts`.

### Interne

- `ui/projectBar.ts` : `setupProjectBar()`, `renderPanneauPlu()`, `actualiserDepuisIgn()`,
  `ouvrirDialogueActualisation()`, `construireVoisinage()`.
- `legacy.ts` : 5 214 → 4 576 lignes.

### Corrigé avant publication

- Le boot s'arrêtait juste avant le premier `render()` : la fabrique de contexte avait été insérée
  au niveau du module, alors que `etat` est une **locale de `boot()`**. Plan sans étiquettes et
  barre vide. Trouvé en comparant HEAD et la modification dans le même onglet neuf.

## [1.0.1-alpha.21] — 2026-08-29

Les huit panneaux du mode Terrasse sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/terrassePanels.ts` : configurateur, paramètres de calcul, plan de coupe, débit de bois,
  implantation, chantier, méthode, optimisation — 1 373 lignes.
- `legacy.ts` : 6 585 → 5 214 lignes. Vérifié panneau par panneau contre le témoin figé, au
  caractère près.

## [1.0.1-alpha.20] — 2026-08-29

La Vue 3D sort de `legacy.ts` — et une régression sérieuse en sort avec elle.

### Corrigé

- **La Vue 3D était vide et l'export GLB ne se terminait jamais**, depuis le correctif « une seule
  scène » de l'alpha.8 : le remplacement en masse `scene.` → `etat.scene.` avait aussi capturé les
  scènes **locales** de la 3D. `TypeError: etat.scene.add is not a function`, qu'aucun golden file
  ne pouvait voir. Corrigé aux 33 sites concernés. Le GLB retrouve exactement l'empreinte
  structurelle du golden : 203 nœuds, 200 maillages, 288 matériaux, 178 textures.

### Interne

- `three/scene.ts` et `three/etat3d.ts`. `legacy.ts` : 7 209 → 6 585 lignes.

## [1.0.1-alpha.19] — 2026-08-29

Le panneau d'attributs sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/attrPanel.ts` (717 lignes) et `interaction/outilAlignement.ts` pour la cible de l'outil
  d'alignement, partagée par trois endroits.
- `legacy.ts` : 7 912 → 7 209 lignes.

## [1.0.1-alpha.18] — 2026-08-29

Le dialogue d'import cadastral sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/cadastreDialog.ts` (753 lignes). La fonction était passée **en callback** à `showConfirm` :
  avec un paramètre de contexte, elle aurait reçu l'argument du confirm. Six appels asynchrones
  lancés sans attente sont désormais marqués `void`.
- `legacy.ts` : 8 663 → 7 912 lignes.

## [1.0.1-alpha.17] — 2026-08-29

L'acquisition IGN sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/apiIgn.ts` : géocodage BAN, cadastre API Carto, BD TOPO, PLU. Ce module ne connaît ni le DOM
  ni l'état.
- `geometry/proximite.ts` : distances entre contours — des critères de classement, jamais des
  mesures publiées.
- Un doublon disparaît : `aireSignee` était `signedArea`.
- `legacy.ts` : 9 011 → 8 663 lignes.

## [1.0.1-alpha.16] — 2026-08-29

Les quatre constructeurs d'export sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `export/dxfPlan.ts`, `export/svgPlan.ts`, `export/pdfPlan.ts`, `export/dossierPdf.ts`, plus
  `export/separateurs.ts` (contrat entre l'export et l'import SVG).
- `model/types.ts` gagne `ObjetPlan`.
- `legacy.ts` : 9 699 → 9 011 lignes.

## [1.0.1-alpha.15] — 2026-08-29

La conversion des données cadastrales sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/cadastreObjets.ts` et `geo/constantesCadastre.ts`. Le paramètre s'appelle `importe` et non
  `etat` : il portait exactement le nom de l'état de l'application.
- Vérifié par un import réel contre les services IGN : projet identique, `84bc5173…`.
- `legacy.ts` : 9 928 → 9 699 lignes.

## [1.0.1-alpha.14] — 2026-08-28

Les règles qui comblent les trous de la BD TOPO sortent de `legacy.ts`. Aucun comportement ne
change.

### Interne

- `geo/bdtopo.ts` : `hauteurBatiment()`, `hauteurVegetation()`, `arbresEstimes()`,
  `libelleParcelle()` et les deux plafonds d'arbres estimés. Ce sont des choix, pas des mesures :
  les tests servent surtout à ce que personne ne les prenne pour de la donnée et ne les « corrige ».
- `legacy.ts` : 9 971 → 9 928 lignes. 343 tests.

### Vérification

- Ces règles ne servent qu'à l'import cadastral, qui appelle les services IGN en ligne : les golden
  files ne les couvrent pas et l'import de bout en bout n'a pas été rejoué. Déplacement littéral,
  couvert par 18 tests unitaires, application et dialogue d'import vérifiés au navigateur.

## [1.0.1-alpha.13] — 2026-08-28

La composition des étiquettes de côtes et de coins est réunie en un seul endroit. Aucun comportement
ne change.

### Interne

- `model/etiquettes.ts` : `etiquetteComposee()`, `longueurEnMetres()`, `angleEnDegres()`. La règle
  était recopiée à six endroits, dont deux avec une ponctuation ASCII volontaire (les PDF écrivent
  en WinAnsi) que rien ne signalait. La ponctuation est désormais un paramètre nommé.
- `legacy.ts` : 9 988 → 9 971 lignes. 325 tests.

### Documentation

- `tests/fixtures/golden/EMPREINTES.md` : nouvelle section « Ce que ces empreintes ne voient pas ».
  Le jeu de démonstration n'affiche ni nom de côté ni angle — les six empreintes ne couvrent donc
  pas la composition des étiquettes. Le contrôle complémentaire et ses valeurs attendues y sont
  écrits.

## [1.0.1-alpha.12] — 2026-08-28

L'alignement par rotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geometry/alignement.ts` : `alignerSurCote()`, `rotationDAlignement()`, `tourner()`. Trois
  décisions y sont désormais écrites — rotation repliée dans ±90° (un côté s'aligne sur une droite,
  pas sur une direction), pivot au milieu du côté aligné, distance mesurée depuis ce côté et
  conservant la forme du côté où elle est déjà.
- `legacy.ts` : 10 016 → 9 988 lignes. 308 tests.

## [1.0.1-alpha.11] — 2026-08-28

L'ajout et le retrait de sommets sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `model/sommets.ts` : `insererSommet()`, `supprimerSommet()`, `minimumSommets()` — les quatre
  tableaux d'une forme (points, noms de coins, noms de côtés, coins gelés) restent en phase au même
  endroit.
- La suppression d'un objet passe par `detruireVue()`, qui oublie en plus l'entrée de la carte des
  vues — une fuite lente que le code en place laissait derrière lui.
- `legacy.ts` : 10 024 → 10 016 lignes. 291 tests.

### Connu, non corrigé

- Les noms de sommets par défaut sont numérotés d'après le nouveau total, pas d'après la position
  d'insertion : deux insertions peuvent produire deux « Coin 5 ». Comportement du fichier d'origine,
  figé par un test.

## [1.0.1-alpha.10] — 2026-08-28

Le glisser-déposer sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/drag.ts` : les cinq gestes qui modifient la géométrie (forme, cercle, sommet, côté,
  rayon). Le `pointermove` passe de 87 lignes à 6. Principe du module : on refuse plutôt que de
  déformer, et le refus est en bloc.
- `render/theme.ts` ne lit plus `window.matchMedia` sans garde : ce module pouvait empêcher toute
  suite de tests qui l'importe de se charger — 15 tests ne tournaient plus sans qu'aucun n'échoue.
- `legacy.ts` : 10 092 → 10 024 lignes. 278 tests.

### Connu, non corrigé

- Le débordement d'un cercle hors du contour est testé par seize points de son bord, pas par une
  vraie intersection : une fente de contour plus étroite que l'écart entre deux rayons
  échantillonnés laisse passer un cercle qui déborde. Comportement du fichier d'origine, figé par
  un test.

## [1.0.1-alpha.9] — 2026-08-28

`render()` est réduit à son orchestration : le positionnement des objets et le dessin des cotes
vivent dans `render/`. Aucun comportement ne change.

### Interne

- `render/objects.ts` : `positionnerObjet()` — la boucle de 113 lignes qui plaçait chaque objet.
- `render/measures.ts` : `dessinerCotes()`, plus `ancrageHorsContour()` et
  `distanceSortiePolygone()` — l'étiquette se pose hors du contour, au-delà de la dernière sortie
  du rayon.
- `geometry/basic.ts` : `angleInterieurDeg()`.
- Variable morte du fichier d'origine retirée (`const objCenter`, jamais lue).
- `legacy.ts` : 10 271 → 10 092 lignes. 254 tests.

## [1.0.1-alpha.8] — 2026-08-28

Le rendu et les interactions sortent de `legacy.ts`, module par module. Aucun comportement ne
change — mais une régression introduite en cours de route a été trouvée et corrigée.

### Interne

- `render/` : objets SVG d'un plan, calque des parasols, géométrie des cotes, thème, helper
  `creerSvg` typé, décor et grille.
- `interaction/` : édition par côté et par angle, zoom, pincement, déplacement, cadrage.
- `pathD` et `polyStr` rejoignent `geometry/path.ts` : la dette de la phase 2 est soldée.
- `legacy.ts` : 10 839 → 10 271 lignes. 249 tests.

### Corrigé avant publication

- **Le zoom ne faisait plus rien** depuis trois commits : deux scènes coexistaient, l'une écrite
  par la molette, l'autre lue par le dessin. Les golden files ne pouvaient pas le voir — un export
  est recalculé dans son propre repère. Corrigé, et la navigation est désormais couverte par
  23 tests.

### Connu, non corrigé

- Le cadrage plafonne à 400 px/m alors que la molette s'arrête à 220 : écart repris du fichier
  d'origine, figé par un test.
- Sur un élément SVG, `el.title` ne produit aucune infobulle : l'affectation crée une propriété
  inerte. Comportement conservé.

## [1.0.1-alpha.7] — 2026-08-28

Premiers modules de `render/**` et `interaction/**`, rendus possibles par l'état explicite.
Aucun comportement ne change.

### Interne

- `render/` : thème SVG, helper `creerSvg` typé (§7.2), flèche du Nord, échelle, grille,
  géométrie des cotes. `W` et `H` rejoignent `etat.scene`.
- `interaction/editing.ts` : édition par longueur de côté et par angle, contour de contrainte
  passé en paramètre.
- 22 tests ajoutés (221 au total).

### Corrigé avant publication

- Le renommage de `W`/`H` avait détourné les variables locales de `renderImplantation()` (format
  papier en mm) vers la taille de la fenêtre. Restauré et vérifié à l'écran.

## [1.0.1-alpha.6] — 2026-08-28

L'état de l'application tient désormais dans un seul objet explicite (`src/core/state.ts`), à la
place des variables libres de la fermeture de `boot()`. Aucun comportement ne change.

### Interne

- `EtatApp` / `creerEtat()` : données du plan, sélection, modes, bascules d'affichage, édition,
  calque d'ombre. 334 accès passent par `etat.`.
- La variable locale du dialogue d'import cadastre, qui s'appelait aussi `etat`, devient
  `etatImport` : elle masquait l'état global sur 750 lignes.
- 7 tests ajoutés (189 au total).

### Corrigé avant publication

- Le remplacement automatique avait renommé `data-measures` en `data-etat.measures` dans le SVG
  exporté. Un SVG produit par une version antérieure aurait perdu ses mesures à la réimportation.
  Détecté par les golden files, corrigé, et vérifié en réimportant le SVG d'avant migration.

## [1.0.1-alpha.5] — 2026-08-28

Phase 5 de la migration TypeScript, **partielle** : les modules d'interface qui ne dépendent pas
du rendu sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `src/ui/dialogs.ts` : notifications, confirmation, saisie, bandeau d'erreur, écran de reprise.
- `src/ui/texturePicker.ts` : catalogue Poly Haven et fenêtre de choix, typés.
- `src/ui/dom.ts` : helpers `el()` / `elOpt()` / `els()` / `on()` (§7.1), en place pour que le
  code neuf n'ajoute pas de `getElementById` non gardé.
- `main.ts` n'a plus sa copie du bandeau d'erreur : il importe celui du module.
- 19 tests ajoutés sous jsdom (182 au total) — première couverture d'interface du projet.

## [1.0.1-alpha.4] — 2026-08-28

Phase 4 de la migration TypeScript, **partielle** : la séparation donnée/vue est faite, la scène et
la pile d'annulation sont sorties. Aucun comportement ne change.

### Interne

- Les huit poignées SVG que portait chaque objet vivent dans une carte à côté
  (`src/render/vues.ts`) : la donnée du plan redevient sérialisable par construction.
- L'échelle et l'origine forment un objet `scene` ; la conversion monde ↔ écran vit dans
  `src/render/scene.ts`, la scène passée en paramètre.
- La pile d'annulation devient `PileAnnulation` (`src/core/history.ts`), bornée à 60 pas.
- 10 tests ajoutés (163 au total).

### Connu, non corrigé

- Après avoir déroulé toutes les annulations disponibles, « Dupliquer » ne fait plus rien. Le
  comportement est identique sur l'artefact gelé d'avant migration : bug préexistant, consigné pour
  après la migration comme l'impose la spec (§10.3).

## [1.0.1-alpha.3] — 2026-08-28

Phase 3 de la migration TypeScript : le moteur terrasse devient une bibliothèque pure et testée.
Aucun nombre ne change — la parité est prouvée bit à bit.

### Interne

- 10 modules `src/engine/**` (1 429 lignes hors de `legacy.ts`, qui passe à 10 839) : constantes,
  construction, lames, structure, calques, BOM, débit, implantation, chantier, parasols.
- Les deux fonctions qui lisaient l'état global le reçoivent désormais en paramètre, ainsi que
  leurs appelants ; les fonctions d'ombre reçoivent un contexte solaire explicite.
- Oracle du moteur capturé avant déplacement (`tests/fixtures/golden/moteur-terrasses.json`,
  deux terrasses de référence, neuf calculs chacune, artefacts de flottants compris).
- Couverture `src/engine` : 91,5 % (critère de sortie de la spec : ≥ 80 %). 153 tests au total.

## [1.0.1-alpha.2] — 2026-08-28

Phase 2 de la migration TypeScript : extraction des fonctions pures. Aucun comportement ne change,
les six golden files restent identiques au bit près à chaque lot.

### Interne

- 16 modules typés sortent de `legacy.ts` (12 959 → 12 250 lignes) : `model/{units,types,defaults,demo,version}`,
  `geometry/{basic,segments,rect,polygon,rings,path}`, `geo/{projection,soleil}`,
  `export/pdf/writer`, `export/dxf`, `util/{escape,format,download}`.
- 79 tests unitaires ajoutés (106 au total) : géométrie, projection locale, position du soleil,
  structure du PDF assemblé.
- Ce que le typage a fait remonter sans le corriger : `estRectangle` rend `null`/`undefined` et
  jamais `false` sur une entrée vide, `rectangleDepuisCote` peut rendre `null`. Les types le disent
  désormais ; le comportement est inchangé.

## [1.0.1-alpha.1] — 2026-08-28

Phases 0 et 1 de la migration TypeScript
([`MD/spec-migration-typescript.md`](MD/spec-migration-typescript.md) §4) : filet de sécurité, puis
échafaudage **sans déplacer une ligne de logique**. L'application construite est fonctionnellement
identique et produit les six golden files au bit près.

### Modifié

- `history` renommé en `undoStack` (changement A1 accepté par la spec §10.3 : une fois les modules
  en place, la collision avec `window.history` deviendrait silencieuse). Prouvé inerte — les six
  empreintes de référence sont identiques avant et après.

### Interne

- Golden files déposés dans `tests/fixtures/golden/` : résumé, SVG, DXF, projet JSON, PDF plan,
  PDF dossier, plus une empreinte structurelle du GLB (le binaire pèse 41,5 Mo et l'exporteur
  three.js n'est pas déterministe).
- Liste de fumée de 25 interactions (`tests/CHECKLIST-FUMEE.md`), à dérouler avant chaque fusion.
- Artefact gelé dans `legacy/plan_interactif.html`, étiquette `v0-preTS`.
- Chaîne d'outils : Vite 5 avec `vite-plugin-singlefile` (le déploiement reste « copier un
  fichier »), TypeScript 5.7 au barreau permissif, ESLint 9, Vitest 2.
- `plan.html` découpé en `index.html`, `src/styles/app.css`, `src/legacy.ts` (les deux blocs
  `<script>` verbatim, sous `@ts-nocheck`) et `src/main.ts` (amorçage).
- `npm test` recalcule les empreintes des golden files : une régression d'export est désormais
  détectée par la chaîne de test, plus par une relecture.
- `npm run build` produit `dist/index.html` (432 ko) avec `api.php` à côté.
- Le serveur de développement accepte `POST /_fixture/<nom>` pour déposer un golden file au bit
  près : un PDF qui transite par une chaîne JavaScript n'est plus le même fichier.
## [1.0.0] — 2026-08-28

Première version numérotée. Elle **fige l'application mono-page existante telle qu'elle est** et
lui donne une identité de version : aucune fonction du plan, aucun calcul et aucune géométrie ne
changent par rapport à l'état du 27 août. Les empreintes de référence sont capturées dans
`tests/fixtures/golden/`.

### Ajouté

- Numéro de version affiché à droite de la barre de projet (`v1.0.0`), avec le détail — build,
  version de schéma, version d'API — dans l'infobulle.
- Estampille de version dans les fichiers de projet : `meta.appVersion`, `meta.schemaVersion` et
  `meta.writtenAt`, à l'export JSON comme à l'enregistrement serveur.
- Estampille dans les exports : commentaire `999` en tête du DXF, attributs `data-app-version` et
  `data-schema-version` sur la racine SVG, dictionnaire `/Info` (`/Producer`, `/Creator`,
  `/CreationDate`) et pied de page sur chaque page des PDF, première ligne du résumé texte.
- En-têtes `X-App-Version` et `X-Schema-Version` sur toutes les requêtes vers `api.php`.
- Refus explicite d'un fichier de projet enregistré par une version plus récente : le plan en
  cours est laissé intact et le message invite à recharger la page. Charger partiellement un tel
  fichier puis l'enregistrer effacerait sans bruit les champs inconnus.
- Confirmation avant « Réinitialiser tout », qui efface d'un clic tout le travail fait depuis le
  chargement, mesures comprises.

### Corrigé

- Plantage au démarrage sur un plan contenant des objets de voisinage : trois variables d'état
  d'affichage étaient déclarées après la fonction qui les lit pendant le boot.
- Le tableau « Affichage par objet » se reconstruisait à chaque case cochée, détachant du DOM la
  case en cours d'utilisation et faisant perdre le focus clavier.

### Interne

- Empreintes de référence des six exports et fixture des quantités calculées
  (`tests/fixtures/golden/`), servant de garde-fou aux versions suivantes.
- `api.php` conserve la version du client qui a écrit chaque projet.
